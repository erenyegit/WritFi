# Writ Fi

**Fully collateralized BTC options on [GIWA](https://docs.giwa.io), Upbit's OP Stack L2.**
Live on GIWA Sepolia at [writ.fi](https://www.writ.fi).

A writer names a price and a date. A maker pays them a premium the moment they
sign, in the same transaction that locks their collateral. At the fixing the
option settles on Pyth's BTC/USD price: out of the money, the collateral comes
back; in the money, the two sides trade at the price the writer named.

> Testnet. Unaudited. Test tokens only.

## Products

| Product | Writer locks | Price fixes below the strike | Price fixes above the strike |
| --- | --- | --- | --- |
| Cash-secured put ("buy BTC lower") | `strike × qty` USDC | writer buys `qty` BTC at the strike | USDC returned |
| Covered call ("sell BTC higher") | `qty` BTC | BTC returned | writer sells `qty` BTC at the strike |

Settlement is physical. There is no partial payout, because the promise is a
price rather than a difference: a writer who says "I would buy at 78,000" gets
BTC at 78,000. Exactly at the strike neither side is assigned.

Expiries are Fridays at 08:00 UTC, the weekly fixing Deribit uses for BTC
options, so makers can hedge a Writ position with a listed one.

## How it works

**Quoting.** Makers hold their own balances in the contract and sign their own
quotes. `/api/rfq` asks every maker for the same trade, waits two seconds, drops
any bid whose signature, fields or backing do not check out on-chain, and returns
the best premium. The in-house maker prices with Black-Scholes on Deribit's mark
implied volatility (interpolated in total variance for expiries Deribit does not
list), falling back to a parametric surface when Deribit is unreachable, and bids
a spread below fair value. Before signing it checks everything the contract
would: the expiry grid, tenor bounds, out-of-the-money strike, size limits, the
maker's per-BTC premium cap, and that the maker's free balance can back the
position and pay the premium.

**Why GIWA.** A signed quote has two weaknesses: it goes stale, and it can be
front-run. GIWA's Flashblocks preconfirm in about 200ms, so quotes live 20
seconds; and GIWA has no public mempool, so nobody can see a quote and trade
ahead of it.

**Settlement.** `settle()` and `settleMany()` are permissionless. They read the
unique first Pyth tick at or after the fixing (its previous tick must be before
the fixing), so the caller cannot pick a price and settling later never changes
the result. A Vercel cron (`vercel.json`, 08:05 UTC daily) runs the keeper in
`web/lib/desk/keeper.ts`, which settles every expired position one expiry at a
time. Anyone can also settle from the Portfolio page.

**The oracle on GIWA.** Since late August 2026 Pyth signs updates with a new
guardian set and data source. Pyth upgraded its own contracts on Ethereum, Base,
Arbitrum and Optimism (version 1.4.6) but not the one on GIWA Sepolia, which
rejects every current update. `PythAccumulatorAdapter` verifies updates itself:
the accumulator format, at least `n/2 + 1` of the five guardian signatures Pyth's
current receiver accepts (read from its Wormhole receiver on Ethereum and Base),
the Pythnet emitter, and the Merkle proof of each price. Its parameters are fixed
at deployment, with no owner. It returned the same price as Pyth's own upgraded
contract on all 14 real updates it was compared on (an Ethereum Sepolia fork).

## Trust assumptions

- Makers are allowlisted by the owner. Only a maker can rotate its own signing
  key, and a maker can cap the premium per BTC any of its quotes may pay, which
  bounds what a leaked hot key could give away.
- A new oracle takes effect only after a one-day on-chain notice
  (`proposeOracle`, then `acceptOracle`).
- If no verifiable price exists for a fixing, the owner can settle manually,
  but only after `fallbackDelay` (at least one day, three by default).
- `pause()` stops new positions only; settlement and withdrawals keep working.

For mainnet the owner should be a multisig (`OWNER` in the deploy script hands
ownership over), and the quote and keeper keys should move to a KMS.

## Repository

```
contracts/  Foundry. WritOptions (market), PythAccumulatorAdapter (oracle for
            GIWA), PythAdapter (for chains with an upgraded Pyth), test tokens.
            forge test: 83 tests, several against real Hermes updates.
web/        Next.js app and the desk API in one deploy:
            /earn, /positions, /api/{market,rfq,quote,settlement,health},
            /api/cron/settle (keeper), /early (early access list).
docs/       Pitch deck and one-pager.
```

Contract addresses live in `web/lib/deployments.ts`, not in env vars: a new
deployment is one commit, and the browser and the server cannot disagree.

## Current deployment (GIWA Sepolia, chain 91342)

| Contract | Address |
| --- | --- |
| WritOptions | `0xca0470B69c5fb9f28C64d65228f3e4879b85b4F2` |
| PythAccumulatorAdapter | `0x3B47e405e8195F5528958f568a48c6C723a9E5BD` |
| TestUSDC (6 decimals, faucet) | `0x0b76264Bb1eD80e5FB219828464d0C809567e309` |
| TestBTC (8 decimals, faucet) | `0xD23c5fA0f4029874be6338fdaDC66e81709DAbFf` |

The first deployment (`0xd2f64c2fd06AA6B8c295d7C37CE6459D89B4f7B0`) is retired:
its oracle adapter cannot verify updates from Pyth's current guardian set.

| GIWA Sepolia | |
| --- | --- |
| RPC (Flashblocks) | `https://sepolia-rpc-flashblocks.giwa.io` |
| Explorer | `https://sepolia-explorer.giwa.io` |
| Gas faucet | <https://faucet.lambda256.io/giwa-sepolia> |
| Pyth BTC/USD feed | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |

## Develop

```bash
cd contracts && forge test          # contracts
cd .. && pnpm install && pnpm dev   # app on http://localhost:3000
pnpm abi                            # regenerate web/lib/abi.generated.ts after a contract change
```

Without `QUOTER_PRIVATE_KEY` the app signs with the published anvil dev key in
development and refuses to start in production. `web/.env.example` lists every
variable. To run against a local fork, start `anvil --fork-url
https://sepolia-rpc.giwa.io --chain-id 91342` and set `RPC_URL` and
`NEXT_PUBLIC_RPC_URL` to it.

## Deploy

```bash
cd contracts
# .env: DEPLOYER_PRIVATE_KEY, QUOTE_SIGNER, BTC_USD_FEED_ID
# optional: USDC_ADDRESS, BTC_ADDRESS (reuse tokens), MAX_PREMIUM_PER_BTC, OWNER
forge script script/Deploy.s.sol --rpc-url giwa_sepolia --broadcast
```

Then update `web/lib/deployments.ts` and fund the maker with
`depositMakerUsdc` / `depositMakerBtc`.

## Self-hosting (Coolify on a VPS)

The root `Dockerfile` builds the site into one container: pnpm installs the
workspace, Next builds a standalone server, and only that server, its static
files and `web/public` go into the image. `.dockerignore` keeps every `.env`
file out; runtime values come from the platform.

- Build arguments: `COMING_SOON` and `NEXT_PUBLIC_RPC_URL` are read while
  building (in Coolify, tick "Build Variable"). Everything else in
  `web/.env.example` is read at runtime.
- Health: `/api/ping` answers when the server is up (the container's health
  check); `/api/health` reports whether trading and settlement work.
- Settlement: the daily keeper call that Vercel Cron makes from
  `web/vercel.json` becomes a scheduled task at `5 8 * * *` (UTC) running
  `curl -sS --fail-with-body -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/settle`.
  A failed run still fails the task, and its log keeps the reason.
  Set `CRON_SECRET`; without it anyone can trigger the keeper.
- Database: a PostgreSQL resource next to the app, with its internal URL as
  `DATABASE_URL` and daily backups to storage off the server.

## Operations

- `GET /api/health` returns 503 when trading or settlement is impaired (price
  feed, chain, maker signer, pause, positions still unsettled 30 minutes after
  their fixing, a keeper holding less than `LOW_KEEPER_WEI`, in wei, default
  1000000000000000 = 0.001 ETH); point an uptime monitor at it.
- The keeper needs a little ETH on its key (`KEEPER_PRIVATE_KEY`, or the quoter
  key when unset). `GET /api/cron/settle?dry=1` shows what is due.
- Hermes keeps about two months of history, and an update stops verifying once
  the guardian set that signed it expires. Settle within days, not weeks.

## Early access

`/early` is the pre-launch list the first users are picked from. People sign in
with a wallet (one Sign-In with Ethereum signature, no transaction), complete
steps for Writ Points, and invite friends with `writ.fi/r/<code>` links.

| Step | Points | How it is checked |
| --- | --- | --- |
| Join Early Access | 100 | First sign-in |
| Follow @Writ_Fi on X | 100 | The linked X account must be in @Writ_Fi's follower list, read with the X API as @Writ_Fi. Checked when the account is linked and again on request |
| Post about Writ on X | 100 | Looked up once with the X API: the post's author must be the linked X account (by user id) and the post must carry the person's invite link. A post counts for one wallet |
| Write your first option | 200 | `getWriterPositionIds` on the market; closed until `EARLY_TESTNET_QUEST=on` |
| Bring the Signal | see below | Per qualified referral, scored once from the friend's X profile snapshot |

An X account is linked to a wallet with Sign in with X (OAuth 2.0 with PKCE,
read-only). At sign-in the site reads the X profile once (id, username,
followers, account creation date, verified) as a snapshot, then revokes the
token. Identity is the X user id: one X account per wallet and one wallet per X
account. A wallet can switch X accounts until an X step is credited or its own
referral is decided. The X steps stay closed until the `X_*` keys are set.

### Bring the Signal (referrals)

A friend who arrived through someone's invite link qualifies once they have
signed in with a wallet and linked an X account that is at least 30 days old.
The first invite link a visitor arrives with is the one that counts, and the
inviter cannot change after sign-in. Qualification is decided once, when the
friend links X, and written to `early_referral_rewards` (keyed by the friend, so
it cannot pay twice) together with the snapshot it was scored from:

- 120 WP base, on each of the inviter's first 10 qualified referrals
- Audience Signal Bonus by the friend's followers, highest tier only: 500+ 50,
  2.5K+ 150, 10K+ 350, 25K+ 750, 100K+ 1,500, 500K+ 3,000, 1M+ 5,000
- 75 WP if the friend's X account is verified

Signal Bonuses have no referral limit, so a strong account still pays after the
first 10. An account under 30 days old is recorded as `account_too_new` and pays
nothing; the friend can still use early access. A follower count that changes
later does not rescore the referral.

X bills per resource: the profile read at sign-in is about $0.01 per person, a
post lookup about $0.005, and follower reads $0.001 each (owned reads). For
5,000 connected people that is roughly $75 with one post each; set spending
alerts on the X developer account.

The follow check keeps a copy of @Writ_Fi's followers in the database. The
first check reads the whole list once; after that only the newest followers are
read, at most once a minute across all servers and within `X_DAILY_READ_LIMIT`
followers a day. A read cut short (an X error, the daily limit) stores nothing
and the next one starts over, so nobody is skipped; a full read that cannot
finish resumes where it stopped. Reading your own followers is an X "owned
read", $0.001 per follower, so a 10,000-follower account costs about $10 to
read in full. Post checks are limited to 20 paid reads per wallet a day.

Storage is Postgres (`DATABASE_URL`); without it, local development runs an
embedded Postgres in `web/.data`. The public board shows shortened wallets only.
`/early/admin` (with `EARLY_ADMIN_TOKEN`) lists everyone with full wallets, X
accounts and inviters, and downloads a CSV. To take an account off the board,
set `hidden = true` on its `early_users` row.

## License

MIT
