import { X_HANDLE } from "@/lib/site";

/**
 * Early access: the steps that earn Writ Points. Shared by the page and the
 * API, so the number on a card is always the number that gets credited.
 */
export type QuestId = "waitlist" | "follow_x" | "post_x" | "testnet";

export interface Quest {
  id: QuestId;
  title: string;
  body: string;
  points: number;
}

export const QUESTS: readonly Quest[] = [
  {
    id: "waitlist",
    title: "Join Early Access",
    body: "Sign in with your wallet and enter the board.",
    points: 100,
  },
  {
    id: "follow_x",
    title: "Follow us on X",
    body: `Follow @${X_HANDLE} for product updates and launch news.`,
    points: 100,
  },
  {
    id: "post_x",
    title: "Post about us on X",
    body: "Share your invite link with your followers, then paste the link to your post.",
    points: 100,
  },
  {
    id: "testnet",
    title: "Write your first option",
    body: "Open a position on the GIWA Sepolia desk with free test funds.",
    points: 200,
  },
];

/**
 * Bring the Signal: what a qualified referral pays the inviter. A friend
 * qualifies once they have joined through the link with a wallet and linked an
 * X account at least MIN_X_ACCOUNT_DAYS old. The inviter's first
 * REFERRAL_BASE_LIMIT qualified referrals pay REFERRAL_BASE_WP each; the Signal
 * Bonuses (audience tier and verified account) are paid on every one, with no
 * limit. Scored once, from the X profile snapshot taken when the friend links X.
 */
export const REFERRAL_BASE_WP = 120;
export const REFERRAL_BASE_LIMIT = 10;
export const MIN_X_ACCOUNT_DAYS = 30;
export const VERIFIED_BONUS_WP = 75;

/** Audience Signal Bonus by followers. Only the highest tier reached applies. */
export const AUDIENCE_TIERS = [
  { min: 1_000_000, wp: 5000, label: "1M+" },
  { min: 500_000, wp: 3000, label: "500K+" },
  { min: 100_000, wp: 1500, label: "100K+" },
  { min: 25_000, wp: 750, label: "25K+" },
  { min: 10_000, wp: 350, label: "10K+" },
  { min: 2_500, wp: 150, label: "2.5K+" },
  { min: 500, wp: 50, label: "500+" },
] as const;

export const audienceTier = (followers: number) => AUDIENCE_TIERS.find((t) => followers >= t.min) ?? null;

/** The most one referral can carry in Signal Bonuses: the top audience tier, verified. */
export const MAX_SIGNAL_WP = AUDIENCE_TIERS[0].wp + VERIFIED_BONUS_WP;

export const questById = (id: string) => QUESTS.find((q) => q.id === id);

/** Which of the gated steps can be done right now; the others are listed but closed. */
export interface OpenSteps {
  /** The desk's maker is funded for the testnet round. */
  testnet: boolean;
  /** The site can check follows of @Writ_Fi on X. */
  follow: boolean;
  /** The site can look posts up on X. */
  post: boolean;
  /** X accounts can be linked with Sign in with X. */
  connect: boolean;
}

export const isStepOpen = (id: QuestId, open: OpenSteps) =>
  id === "testnet" ? open.testnet : id === "follow_x" ? open.follow : id === "post_x" ? open.post : true;

/**
 * Invite codes: six characters from an alphabet without look-alikes (no 0/O,
 * no 1/I/L), so a code read off a screen or typed by hand survives.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const isCode = (s: string) => /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(s);

/**
 * Text for the X post. The invite link is how the post is matched to its
 * author's account; it is shown on the bare domain, which forwards to www.
 */
export function postText(inviteUrl: string) {
  return (
    `I just joined early access for @${X_HANDLE}.\n\n` +
    `Writ is building fully collateralized on-chain options on GIWA, with premiums paid upfront and clear defined outcomes.\n\n` +
    inviteUrl.replace("://www.", "://")
  );
}
