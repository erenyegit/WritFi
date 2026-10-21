/**
 * One set of formatters with an explicit locale. Browser defaults would render
 * "0,001" for a Turkish or German visitor and "0.001" for everyone else, which
 * is how a size gets misread.
 */

const LOCALE = "en-US";

export const fmtUsd = (v: number, digits = 2) =>
  v.toLocaleString(LOCALE, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Whole dollars for strikes and spot headlines: "$82,500". */
export const fmtUsd0 = (v: number) => fmtUsd(v, 0);

/** USDC scaled 1e6 -> "1,234.56". Currency is named by the caller. */
export const fmtUsdcAmount = (v: bigint) =>
  (Number(v) / 1e6).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** USDC scaled 1e6 -> "$1,234.56". */
export const fmtUsdc = (v: bigint) => fmtUsd(Number(v) / 1e6);

/** Price scaled 1e8 -> "$65,000" (or with cents when it has them). */
export const fmtPrice8 = (v: bigint, digits?: number) => {
  const usd = Number(v) / 1e8;
  return fmtUsd(usd, digits ?? (Number.isInteger(usd) ? 0 : 2));
};

/** BTC amount -> "0.0125" with no trailing zeros and at most 8 places. */
export const fmtBtc = (btc: number) =>
  btc.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 8 });

/** BTC scaled 1e8 -> "0.0125". */
export const fmtBtc8 = (v: bigint) => fmtBtc(Number(v) / 1e8);

export const fmtPct = (v: number, digits = 1) =>
  `${v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

/** Signed distance from spot: "−2.5%" / "+4.0%". */
export const fmtDistance = (strike: number, spot: number) => {
  const d = ((strike - spot) / spot) * 100;
  const s = Math.abs(d).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${d < 0 ? "−" : "+"}${s}%`;
};

const dateParts = (ts: number, timeZone: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(ts * 1000));

const part = (parts: Intl.DateTimeFormatPart[], type: string) =>
  parts.find((p) => p.type === type)?.value ?? "";

/** "Fri 26 Sep". */
export const fmtDay = (ts: number) => {
  const p = dateParts(ts, "UTC");
  return `${part(p, "weekday")} ${part(p, "day")} ${part(p, "month")}`;
};

/** "08:00 UTC". */
export const fmtTimeUtc = (ts: number) => {
  const p = dateParts(ts, "UTC");
  return `${part(p, "hour")}:${part(p, "minute")} UTC`;
};

/** "17:00 KST". Most GIWA users read Korean time first. */
export const fmtTimeKst = (ts: number) => {
  const p = dateParts(ts, "Asia/Seoul");
  return `${part(p, "hour")}:${part(p, "minute")} KST`;
};

/** "Fri 26 Sep, 08:00 UTC". */
export const fmtDateTime = (ts: number | bigint) => `${fmtDay(Number(ts))}, ${fmtTimeUtc(Number(ts))}`;

/** "in 1d 4h" / "in 35m" / "2h ago". */
export function fmtRelative(ts: number, now: number) {
  const d = ts - now;
  const a = Math.abs(d);
  const days = Math.floor(a / 86_400);
  const hours = Math.floor((a % 86_400) / 3600);
  const mins = Math.max(1, Math.floor((a % 3600) / 60));
  const body = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${Math.floor((a % 3600) / 60)}m` : `${mins}m`;
  return d >= 0 ? `in ${body}` : `${body} ago`;
}

/** Tenor in days, one decimal under a week: "1.3d", "6d". */
export const fmtTenor = (ts: number, now: number) => {
  const days = (ts - now) / 86_400;
  return days < 7 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
};

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
