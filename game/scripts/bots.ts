/**
 * FACTORY-OWNED — do not edit (overwritten on every build).
 * Human-like bot players over the game's Sim (src/game/sim.ts). Used by the
 * factory's QA playtest AND by the game's own level tuner, so "tuned" and
 * "tested" mean the same thing.
 */
import type { Sim } from "../src/game/sim";

export const PERSONAS = { skilled: 0.08, casual: 0.3, careless: 0.6 } as const;
export type Persona = keyof typeof PERSONAS;

// mulberry32 in 32-bit integer math. The old LCG multiplied in double precision (> 2^53) and collapsed into a
// 419-step cycle, so win rates came out quantised and depended on every level measured before (2026-10-27: Nonogram
// repairs could not converge — re-tuning one level reshuffled all the others).
let seed = 1234567;
export const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
/** Seed from a string (FNV-1a), so each measurement is independent of what was measured before it. */
export function reseed(key: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  seed = h | 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function playOnce<S, M>(sim: Sim<S, M>, start: S, noise: number, cap = 400): { won: boolean; moves: number } {
  let s = start;
  for (let n = 0; n < cap; n++) {
    const st = sim.status(s);
    if (st !== "playing") return { won: st === "won", moves: n };
    const moves = sim.moves(s);
    if (!moves.length) return { won: false, moves: n };
    let pick = moves[Math.floor(rand() * moves.length)];
    if (rand() > noise) {
      let best = -Infinity;
      for (const m of moves) {
        const next = sim.apply(s, m);
        const v = sim.status(next) === "won" ? Infinity : sim.progress(next) + rand() * 1e-6;
        if (v > best) { best = v; pick = m; }
      }
    }
    s = sim.apply(s, pick);
  }
  return { won: false, moves: cap };
}

export function winRate<S, M>(sim: Sim<S, M>, start: S, persona: Persona, trials = 100): { rate: number; avgMoves: number } {
  // Same level + persona → same result, whatever else was played first (tuning one level never moves another).
  let key = "";
  try { key = JSON.stringify(start)?.slice(0, 20000) ?? ""; } catch { /* unserialisable state: fixed seed per persona */ }
  reseed(`${persona}|${trials}|${key}`);
  let wins = 0, mv = 0;
  for (let t = 0; t < trials; t++) {
    const r = playOnce(sim, start, PERSONAS[persona]);
    if (r.won) wins++;
    mv += r.moves;
  }
  return { rate: wins / trials, avgMoves: mv / trials };
}
