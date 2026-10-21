"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";

import { giwaSepolia } from "@/lib/chain";
import { errorMessage } from "@/lib/errors";

import { isCode, type OpenSteps, type QuestId } from "./quests";
import type { Account, Board } from "./types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

// The invite code survives until sign-in, even if the visitor wanders off first.
const REF_KEY = "writ:ref";

function storedRef(): string | null {
  try {
    return window.localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

/**
 * Reads ?ref= once, keeps it for sign-in, and says whether this visit came
 * from an invite. The first invite a visitor arrives with is the one kept.
 */
export function useInviteRef() {
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref")?.toUpperCase() ?? "";
    const kept = storedRef();
    if (kept && isCode(kept)) {
      setRef(kept);
    } else if (isCode(fromUrl)) {
      try {
        window.localStorage.setItem(REF_KEY, fromUrl);
      } catch {
        // private mode: the server-side cookie from /r/<code> still carries it
      }
      setRef(fromUrl);
    } else {
      setRef(storedRef());
    }
  }, []);
  return ref;
}

interface Me {
  account: Account | null;
  testnetOpen: boolean;
  followOpen: boolean;
  postOpen: boolean;
  xConnect: boolean;
}

const CLOSED: OpenSteps = { testnet: false, follow: false, post: false, connect: false };

export function useEarly() {
  const [me, setMe] = useState<Me | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const loadBoard = useCallback(() => {
    api<Board>("/api/early/board")
      .then((b) => alive.current && setBoard(b))
      .catch(() => undefined); // keep the last good board
  }, []);

  useEffect(() => {
    alive.current = true;
    api<Me>("/api/early/me")
      .then((m) => alive.current && setMe(m))
      .catch((e: Error) => {
        if (!alive.current) return;
        setError(e.message);
        setMe({ account: null, testnetOpen: false, followOpen: false, postOpen: false, xConnect: false });
      });
    loadBoard();
    const t = setInterval(loadBoard, 30_000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [loadBoard]);

  const setAccount = useCallback((account: Account | null) => {
    setMe((m) => ({
      account,
      testnetOpen: m?.testnetOpen ?? false,
      followOpen: m?.followOpen ?? false,
      postOpen: m?.postOpen ?? false,
      xConnect: m?.xConnect ?? false,
    }));
  }, []);

  return {
    loading: me === null,
    account: me?.account ?? null,
    open: me ? { testnet: me.testnetOpen, follow: me.followOpen, post: me.postOpen, connect: me.xConnect } : CLOSED,
    board,
    error,
    setAccount,
    loadBoard,
  };
}

/** One signature, no transaction: Sign-In with Ethereum against a server nonce. */
export function useSignIn(onAccount: (a: Account | null) => void) {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce } = await api<{ nonce: string }>("/api/early/nonce");
      const issuedAt = new Date();
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Writ Fi early access. This is free and sends no transaction.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? giwaSepolia.id,
        nonce,
        issuedAt,
        expirationTime: new Date(issuedAt.getTime() + 10 * 60_000),
      });
      const signature = await signMessageAsync({ message });
      const { account } = await api<{ account: Account }>("/api/early/session", {
        method: "POST",
        body: JSON.stringify({ message, signature, ref: storedRef() }),
      });
      try {
        window.localStorage.removeItem(REF_KEY);
      } catch {
        // nothing to clean up
      }
      onAccount(account);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [address, chainId, signMessageAsync, onAccount]);

  const signOut = useCallback(async () => {
    await api("/api/early/session", { method: "DELETE" }).catch(() => undefined);
    onAccount(null);
  }, [onAccount]);

  return { signIn, signOut, busy, error };
}

export function completeQuest(id: QuestId, body?: { url: string }) {
  return api<{ account: Account }>(`/api/early/quests/${id}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.account);
}

export function exportRows(token: string) {
  return fetch("/api/early/export", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).then(
    async (res) => {
      const body = (await res.json().catch(() => ({}))) as { rows?: unknown; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
      return body.rows as import("./types").ExportRow[];
    },
  );
}
