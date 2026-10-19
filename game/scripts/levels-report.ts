/// <reference types="node" />
/**
 * FACTORY-OWNED — do not edit (overwritten on every build).
 * Level report for the factory's level-design review: every level as a designer sees it
 * (src/game/sim.ts describe()) plus solver facts measured on the real engine:
 *   optimal   — fewest moves to win (breadth-first search; null if the search cap was hit)
 *   branching — legal moves at the start (how many choices the player faces)
 *   trap      — share of first moves after which the level can no longer be won (0 = forgiving,
 *               high = one wrong move is fatal; null when the state space is too big to settle)
 * Last stdout line (JSON): {"levels": [{n, grid, legend, intent, mechanics, optimal, branching, trap, explored}]}
 */
import { sim } from "../src/game/sim";

const CAP = Number(process.env.LEVEL_SEARCH_CAP ?? 40_000);
const skip = (k: string, v: unknown) => (k === "level" || k === "id" || k === "number" || k === "moves" ? undefined : v);
const keyOf = (s: unknown) => JSON.stringify(s, skip);

type S = ReturnType<typeof sim.start>;

/** Fewest moves to a win from `from`; null when there is none (capped=false) or the cap was hit (capped=true). */
function shortest(from: S, cap = CAP): { optimal: number | null; explored: number; capped: boolean } {
  if (sim.status(from) === "won") return { optimal: 0, explored: 1, capped: false };
  const seen = new Set([keyOf(from)]);
  let frontier: S[] = [from];
  for (let depth = 1; frontier.length && seen.size < cap; depth++) {
    const next: S[] = [];
    for (const s of frontier) {
      if (sim.status(s) !== "playing") continue;
      for (const m of sim.moves(s)) {
        const t = sim.apply(s, m);
        const st = sim.status(t);
        if (st === "won") return { optimal: depth, explored: seen.size, capped: false };
        const k = keyOf(t);
        if (st === "lost" || seen.has(k)) continue;
        seen.add(k);
        next.push(t);
        if (seen.size >= cap) break;
      }
      if (seen.size >= cap) break;
    }
    frontier = next;
  }
  return { optimal: null, explored: seen.size, capped: seen.size >= cap };
}

const levels = [];
for (let i = 0; i < sim.levelCount; i++) {
  const start = sim.start(i);
  const brief = sim.describe(i);
  const { optimal, explored } = shortest(start);
  const firsts = sim.moves(start);
  // Trap rate: sample up to 12 first moves, ask whether the level is still winnable after each.
  const sample = firsts.length <= 12 ? firsts : Array.from({ length: 12 }, (_, k) => firsts[Math.floor((k * firsts.length) / 12)]);
  let dead = 0, known = 0;
  for (const m of sample) {
    const after = sim.apply(start, m);
    if (sim.status(after) === "won") { known++; continue; }
    if (sim.status(after) === "lost") { dead++; known++; continue; }
    const r = shortest(after, Math.floor(CAP / 4));
    if (r.capped) continue; // too big to settle — unknown, not a trap
    known++;
    if (r.optimal === null) dead++;
  }
  levels.push({
    n: i + 1,
    grid: brief.grid,
    legend: brief.legend,
    intent: brief.intent,
    mechanics: brief.mechanics,
    optimal,
    branching: firsts.length,
    trap: known ? Number((dead / known).toFixed(2)) : null,
    explored,
  });
}
console.log(JSON.stringify({ levels }));
