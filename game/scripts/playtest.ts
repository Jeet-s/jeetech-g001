/// <reference types="node" />
/**
 * FACTORY-OWNED — do not edit (overwritten on every build).
 * Bot playtest of every level through the game's real engine (src/game/sim.ts).
 * Last stdout line (JSON): {"levels": N, "personas": {"skilled": [...], "casual": [...], "careless": [...]}, "avgMoves": [...],
 *   "duplicates": [[a, b], ...]}  (1-based level numbers whose start states are identical)
 */
import { sim } from "../src/game/sim";
import { PERSONAS, winRate, type Persona } from "./bots";

const TRIALS = Number(process.env.PLAYTEST_TRIALS ?? 150);
const personas: Record<string, number[]> = {};
const avgMoves: number[] = [];
for (const p of Object.keys(PERSONAS) as Persona[]) {
  personas[p] = [];
  for (let l = 0; l < sim.levelCount; l++) {
    const r = winRate(sim, sim.start(l), p, TRIALS);
    personas[p].push(Number(r.rate.toFixed(3)));
    if (p === "casual") avgMoves.push(Math.round(r.avgMoves));
  }
}
// Repeated puzzles are a top complaint in competitor reviews: flag identical start states.
const duplicates: [number, number][] = [];
const firstSeen = new Map<string, number>();
for (let l = 0; l < sim.levelCount; l++) {
  const key = JSON.stringify(sim.start(l), (k, v) => (k === "level" || k === "id" || k === "number" ? undefined : v));
  const prev = firstSeen.get(key);
  if (prev !== undefined) duplicates.push([prev + 1, l + 1]);
  else firstSeen.set(key, l);
}
console.log(JSON.stringify({ levels: sim.levelCount, personas, avgMoves, duplicates }));
