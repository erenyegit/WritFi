/**
 * A small mark per wallet, the same every time: a tinted tile and one shape,
 * from the site's own palette so a column of them stays calm.
 */
// Theme colours, so the marks sit right on light and dark pages alike.
const TILES = ["rgb(var(--paper-tint))", "rgb(var(--paper-sunk))", "rgb(var(--paper-line))"];
const INKS = ["rgb(var(--ink))", "rgb(var(--ink-500))", "rgb(var(--heat))"];
const SHAPES = [
  <circle key="circle" cx="12" cy="12" r="5" />,
  <rect key="square" x="7" y="7" width="10" height="10" rx="2.5" />,
  <path key="arch" d="M6 15a6 6 0 0 1 12 0z" />,
  <path key="diamond" d="M12 6.5l5.5 5.5-5.5 5.5-5.5-5.5z" />,
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function WalletAvatar({ seed, size = 22 }: { seed: string; size?: number }) {
  const h = hash(seed.toLowerCase());
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect width="24" height="24" rx="6" style={{ fill: TILES[h % TILES.length] }} />
      <g style={{ fill: INKS[(h >>> 5) % INKS.length] }}>{SHAPES[(h >>> 11) % SHAPES.length]}</g>
    </svg>
  );
}

/** The short form used everywhere on the page, so avatars match between the board and the panel. */
export const shortWallet = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
