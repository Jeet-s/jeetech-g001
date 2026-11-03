import { LEVELS } from "./levels";
import type { PlayerState } from "../modules/store";

/**
 * Daily Paint: once a day one level the player has already painted comes back
 * as the Daily challenge; clearing it pays a one-time bonus. The pick is a
 * fixed hash of the local date, so it is the same all day and offline.
 */
export const DAILY_BONUS = 50;
/** Daily Paint opens once this many levels are painted. */
export const DAILY_MIN_LEVELS = 3;

export function todayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function dailyAvailable(s: PlayerState): boolean {
  return LEVELS.filter((l) => (s.stars[l.id] ?? 0) > 0).length >= DAILY_MIN_LEVELS;
}

export function dailyClaimed(s: PlayerState): boolean {
  return s.dailyDay === todayKey();
}

export function dailyLevelId(s: PlayerState): number {
  const done = LEVELS.filter((l) => (s.stars[l.id] ?? 0) > 0).map((l) => l.id);
  if (done.length === 0) return 1;
  let h = 0;
  for (const ch of todayKey()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return done[h % done.length];
}
