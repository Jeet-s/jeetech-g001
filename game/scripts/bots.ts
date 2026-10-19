/**
 * FACTORY-OWNED — do not edit (overwritten on every build).
 * Human-like bot players over the game's Sim (src/game/sim.ts). Used by the
 * factory's QA playtest AND by the game's own level tuner, so "tuned" and
 * "tested" mean the same thing.
 */
import type { Sim } from "../src/game/sim";

export const PERSONAS = { skilled: 0.08, casual: 0.3, careless: 0.6 } as const;
export type Persona = keyof typeof PERSONAS;

let seed = 1234567;
export const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

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
  let wins = 0, mv = 0;
  for (let t = 0; t < trials; t++) {
    const r = playOnce(sim, start, PERSONAS[persona]);
    if (r.won) wins++;
    mv += r.moves;
  }
  return { rate: wins / trials, avgMoves: mv / trials };
}
