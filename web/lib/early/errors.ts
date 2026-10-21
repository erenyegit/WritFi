import { NextResponse } from "next/server";

/** A refusal meant for the person, with the HTTP status to send it with. */
export class EarlyError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Early access is not configured on this deployment; the API answers 503. */
export class EarlyUnavailable extends Error {}

export const noStore = { "Cache-Control": "no-store" };

export function errorResponse(err: unknown) {
  if (err instanceof EarlyError) return NextResponse.json({ error: err.message }, { status: err.status, headers: noStore });
  console.error("[early]", err);
  const message =
    err instanceof EarlyUnavailable
      ? "Early access is not open on this site yet."
      : "Something went wrong on our side. Try again in a moment.";
  return NextResponse.json({ error: message }, { status: err instanceof EarlyUnavailable ? 503 : 500, headers: noStore });
}

export const tooMany = () =>
  NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429, headers: noStore });

export const forbidden = () => NextResponse.json({ error: "Cross-site request refused." }, { status: 403, headers: noStore });
