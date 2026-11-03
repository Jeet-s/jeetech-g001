import { LEVELS, CHAPTERS, TOTAL_LEVELS } from "./levels";
import { todayKey } from "./daily";
import { store, type PlayerState } from "../modules/store";
import { analytics } from "../modules/analytics";

/**
 * Inbox rewards (Home → Inbox). Everything here is earned by playing and paid
 * in coins — fixed amounts, no random rolls:
 *  - Daily gift: GIFT_COINS once per local day.
 *  - Chapter complete: CHAPTER_COINS for every chapter whose levels are all painted.
 *  - Star milestones: STAR_MILESTONE_COINS at every STAR_STEP stars.
 * Claims persist in the store (giftDay, claimedRewards).
 */
export const GIFT_COINS = 25;
export const CHAPTER_COINS = 100;
export const STAR_STEP = 15;
export const STAR_MILESTONE_COINS = 50;

export type RewardKind = "gift" | "chapter" | "stars";

export interface Reward {
  id: string;
  kind: RewardKind;
  title: string;
  detail: string;
  coins: number;
  state: "claimable" | "locked" | "claimed";
  /** 0..1 progress for locked rows. */
  progress: number;
}

function stars(s: PlayerState): number {
  return Object.values(s.stars).reduce((a, b) => a + b, 0);
}

export function rewardsFor(s: PlayerState): Reward[] {
  const out: Reward[] = [];
  const today = todayKey();
  out.push({
    id: "gift",
    kind: "gift",
    title: "Daily gift",
    detail: s.giftDay === today ? "Claimed today · a new gift arrives tomorrow" : "A free gift every day you visit",
    coins: GIFT_COINS,
    state: s.giftDay === today ? "claimed" : "claimable",
    progress: 1,
  });

  const total = stars(s);
  const maxStars = TOTAL_LEVELS * 3;
  // Star milestones: every reached one (claimed or not) + the next one to aim for.
  for (let m = STAR_STEP; m <= maxStars; m += STAR_STEP) {
    const id = `stars-${m}`;
    const claimed = s.claimedRewards.includes(id);
    if (total >= m) {
      out.push({ id, kind: "stars", title: `${m} stars`, detail: `Reach ${m} stars`, coins: STAR_MILESTONE_COINS, state: claimed ? "claimed" : "claimable", progress: 1 });
    } else {
      out.push({ id, kind: "stars", title: `${m} stars`, detail: `${total}/${m} stars`, coins: STAR_MILESTONE_COINS, state: "locked", progress: total / m });
      break;
    }
  }

  CHAPTERS.forEach((name, i) => {
    const chapter = i + 1;
    const levels = LEVELS.filter((l) => l.chapter === chapter);
    if (levels.length === 0) return;
    const done = levels.filter((l) => (s.stars[l.id] ?? 0) > 0).length;
    const id = `chapter-${chapter}`;
    const complete = done === levels.length;
    out.push({
      id,
      kind: "chapter",
      title: `Chapter ${chapter} · ${name}`,
      detail: complete ? "Painting complete" : `${done}/${levels.length} levels painted`,
      coins: CHAPTER_COINS,
      state: complete ? (s.claimedRewards.includes(id) ? "claimed" : "claimable") : "locked",
      progress: done / levels.length,
    });
  });

  const rank = { claimable: 0, locked: 1, claimed: 2 } as const;
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank[a.r.state] - rank[b.r.state] || a.i - b.i)
    .map((x) => x.r);
}

export function claimableCount(s: PlayerState): number {
  return rewardsFor(s).filter((r) => r.state === "claimable").length;
}

/** Pays a claimable reward once. Returns the coins paid (0 if not claimable). */
export function claimReward(id: string): number {
  const s = store.get();
  const r = rewardsFor(s).find((x) => x.id === id);
  if (!r || r.state !== "claimable") return 0;
  if (r.kind === "gift") store.set({ giftDay: todayKey(), coins: s.coins + r.coins });
  else store.set({ claimedRewards: [...s.claimedRewards, id], coins: s.coins + r.coins });
  analytics.track("reward_claimed", { reward: id, coins: r.coins });
  return r.coins;
}
