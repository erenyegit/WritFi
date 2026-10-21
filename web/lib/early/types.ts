import type { QuestId } from "./quests";

/** What the signed-in person sees about themselves. */
export interface Account {
  /** Checksummed wallet. */
  address: string;
  /** Invite code; the link is /r/<code>. */
  code: string;
  points: number;
  /** Place on the board, 1 is first. Null when the account is held back for review. */
  rank: number | null;
  /** Everyone on the board. */
  total: number;
  referrals: {
    /** Qualified referrals: joined through the link and linked an X account old enough. */
    counted: number;
    /** Everyone who joined through the link. */
    joined: number;
    /** WP your referrals have earned you, base and Signal Bonuses together. */
    points: number;
    /** The latest qualified referrals with their breakdown, newest first. */
    recent: Signal[];
  };
  /** The linked X account's username, once Sign in with X has linked it. */
  x: string | null;
  done: QuestId[];
  /** Joined through someone's invite link. */
  invited: boolean;
}

/** One qualified referral as its inviter sees it. */
export interface Signal {
  /** The friend's X username when they qualified. */
  username: string;
  base: number;
  audience: number;
  verified: number;
  total: number;
  /** Audience tier reached, like "100K+"; null under 500 followers. */
  tier: string | null;
  at: string;
}

export interface BoardRow {
  rank: number;
  /** Shortened, so the board never publishes a full address. */
  wallet: string;
  points: number;
  referrals: number;
}

export interface Board {
  total: number;
  top: BoardRow[];
}

/** One line of the private export the team picks early users from. */
export interface ExportRow {
  rank: number | null;
  address: string;
  x: string | null;
  xPost: string | null;
  points: number;
  referrals: number;
  invited: number;
  invitedBy: string | null;
  quests: string;
  joinedAt: string;
  hidden: boolean;
  /** The X profile snapshot taken when the account linked X. */
  xFollowers: number | null;
  xVerified: boolean | null;
  xCreatedAt: string | null;
  /** How this account's own referral was scored: qualified, account_too_new, self_referral. */
  referralStatus: string | null;
  /** WP this account earned from its referrals. */
  referralWp: number;
}
