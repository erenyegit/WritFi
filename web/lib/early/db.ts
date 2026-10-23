import { mkdirSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

import { EarlyUnavailable } from "./errors";

/**
 * Storage for early access.
 *
 * Production uses any Postgres given in DATABASE_URL (Neon through the Vercel
 * integration sets it). Local development without one runs an embedded
 * Postgres (PGlite) in web/.data, so the page works with nothing to install.
 * Both speak the same SQL, so what passes locally is what runs in production.
 */

export type Row = Record<string, unknown>;
export type Query = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

export interface Db {
  query: Query;
  /** Runs `fn` in one transaction: everything it writes commits, or none of it. */
  tx<T>(fn: (query: Query) => Promise<T>): Promise<T>;
}

// Kept on globalThis so dev reloads reuse one connection instead of opening another.
const holder = globalThis as unknown as { __writEarlyDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!holder.__writEarlyDb) {
    holder.__writEarlyDb = open()
      .then(async (db) => {
        await migrate(db);
        return db;
      })
      .catch((err) => {
        holder.__writEarlyDb = undefined; // try again on the next request
        throw err;
      });
  }
  return holder.__writEarlyDb;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) return fromPostgres(url);
  if (process.env.NODE_ENV === "production") {
    throw new EarlyUnavailable("Early access is not configured on this deployment (DATABASE_URL).");
  }
  return fromPglite(path.join(process.cwd(), ".data", "early"));
}

function fromPostgres(url: string): Db {
  // prepare: false keeps it compatible with transaction poolers (Neon, Supabase).
  const sql = postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false, onnotice: () => {} });
  const runner =
    (conn: Pick<postgres.Sql, "unsafe">): Query =>
    (text, params = []) =>
      conn.unsafe(text, params as postgres.ParameterOrJSON<never>[]) as unknown as Promise<never>;
  return {
    query: runner(sql),
    tx: (fn) => sql.begin((t) => fn(runner(t))) as Promise<never>,
  };
}

async function fromPglite(dataDir: string): Promise<Db> {
  // Loaded at runtime only, so it stays out of the production bundle and its file trace.
  const specifier = "@electric-sql/pglite";
  const { PGlite } = (await import(/* webpackIgnore: true */ specifier)) as typeof import("@electric-sql/pglite");
  mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir);
  type Conn = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  const runner =
    (conn: Conn): Query =>
    async (text, params = []) =>
      (await conn.query(text, params)).rows as never;
  return {
    query: runner(pg),
    tx: (fn) => pg.transaction((t) => fn(runner(t))),
  };
}

const SCHEMA = [
  `create table if not exists early_users (
    address        text primary key,
    code           text not null unique,
    referred_by    text references early_users (address),
    x_handle       text,
    x_post_id      text unique,
    points         integer not null default 0,
    referrals      integer not null default 0,
    hidden         boolean not null default false,
    joined_at      timestamptz not null default now()
  )`,
  // One X account per wallet and one wallet per X account, by X user id: the id
  // stays when the username changes, so usernames are not unique here.
  `alter table early_users add column if not exists x_id text`,
  `create unique index if not exists early_users_x_id on early_users (x_id)`,
  `drop index if exists early_users_x_handle`,
  // The X profile snapshot taken when the account links X; referrals are scored from it.
  `alter table early_users add column if not exists x_followers integer`,
  `alter table early_users add column if not exists x_verified boolean`,
  `alter table early_users add column if not exists x_created_at timestamptz`,
  `alter table early_users add column if not exists x_snapshot_at timestamptz`,
  // Set when this account's own referral is decided; its inviter and X account are fixed after.
  `alter table early_users add column if not exists referral_locked_at timestamptz`,
  // Posts read from X for this wallet today: each read is paid, so it has a daily limit.
  `alter table early_users add column if not exists post_checks integer not null default 0`,
  `alter table early_users add column if not exists post_checks_day date`,
  `create index if not exists early_users_board on early_users (points desc, joined_at) where not hidden`,
  `create index if not exists early_users_referred_by on early_users (referred_by)`,
  `create table if not exists early_quests (
    address  text not null references early_users (address),
    quest    text not null,
    points   integer not null,
    detail   text,
    done_at  timestamptz not null default now(),
    primary key (address, quest)
  )`,
  // Bring the Signal: one row per referred account (the key makes scoring happen once),
  // with the breakdown and the snapshot it was scored from. status: qualified,
  // account_too_new or self_referral; only qualified rows pay.
  `create table if not exists early_referral_rewards (
    referred      text primary key references early_users (address),
    referrer      text not null references early_users (address),
    status        text not null,
    base_wp       integer not null default 0,
    audience_wp   integer not null default 0,
    verified_wp   integer not null default 0,
    total_wp      integer not null default 0,
    x_id          text,
    x_username    text,
    x_followers   integer,
    x_verified    boolean,
    x_created_at  timestamptz,
    created_at    timestamptz not null default now()
  )`,
  `create index if not exists early_referral_rewards_referrer on early_referral_rewards (referrer, created_at desc)`,
  // Posts read from X once each: who wrote them and which invite codes they carry (see xpost.ts).
  `create table if not exists early_x_posts (
    post_id     text primary key,
    author_id   text not null,
    codes       text not null default '',
    checked_at  timestamptz not null default now()
  )`,
  // @Writ_Fi's followers as last read from X, for the follow step (see xfollow.ts).
  `create table if not exists early_x_followers (
    x_id      text primary key,
    username  text not null,
    seen_at   timestamptz not null default now()
  )`,
  `create index if not exists early_x_followers_username on early_x_followers (lower(username))`,
  `create table if not exists early_x_sync (
    id          integer primary key,
    account_id  text,
    backfilled  boolean not null default false,
    last_sync   timestamptz,
    day         text,
    used        integer not null default 0
  )`,
  `insert into early_x_sync (id) values (1) on conflict do nothing`,
  // Where an unfinished full read of the follower list resumes.
  `alter table early_x_sync add column if not exists full_token text`,
  `alter table early_x_sync add column if not exists version integer not null default 1`,
  // Syncs before version 2 could leave followers unread between stored pages;
  // read the whole list once to fill any such gap.
  `update early_x_sync set backfilled = false, full_token = null, version = 2 where id = 1 and version < 2`,
];

async function migrate(db: Db) {
  await db.tx(async (q) => {
    // Cold starts can race to create the tables; the lock lets one go first.
    await q(`select pg_advisory_xact_lock(7240119)`);
    for (const statement of SCHEMA) await q(statement);
  });
}
