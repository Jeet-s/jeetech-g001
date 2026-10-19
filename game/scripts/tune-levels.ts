/// <reference types="node" />
/**
 * Level pacing tuner for Path Painter. The difficulty knob for the playtest bots
 * is each level's `botBudget` (the swipe budget a fair attempt must fit in). This
 * script MEASURES, per level, the casual + skilled win rate at every candidate
 * budget using the SAME human-like bots the QA playtest uses, and picks the
 * budget whose casual win rate is closest to a target pacing curve (easy
 * onboarding → steady climb → fair-but-hard finale).
 *
 *   npm run tune        # prints a suggested botBudget array to paste into levels.ts
 */
import { PathEngine, type Direction, type LevelSpec } from "../src/game/PathEngine";
import { LEVELS } from "../src/game/levels";
import type { Sim } from "../src/game/sim";
import { winRate } from "./bots";

const N = LEVELS.length;
const TRIALS = 300;
const DIRS: Direction[] = ["up", "down", "left", "right"];

/** Target first-try win rate for a casual player across the whole game. */
function target(n: number): number {
  if (n <= 4) return 0.85;
  if (n <= 12) return 0.82 - 0.12 * ((n - 4) / 8); // 0.82 → 0.70
  if (n <= 24) return 0.72 - 0.2 * ((n - 12) / 12); // 0.72 → 0.52
  return 0.52 - 0.12 * ((n - 24) / 12); // 0.52 → 0.40
}

/** Minimal Sim over one level with an overridden budget (mirrors src/game/sim.ts). */
interface S { painted: Set<string>; openGroups: Set<string>; x: number; y: number; moves: number }
function simFor(level: LevelSpec, budget: number): { sim: Sim<S, Direction>; start: S } {
  const engineAt = (s: S): PathEngine => {
    const e = new PathEngine(level);
    e.painted = new Set(s.painted);
    e.openGroups = new Set(s.openGroups);
    e.cursorX = s.x; e.cursorY = s.y; e.moves = s.moves;
    return e;
  };
  const cap = (e: PathEngine): S => ({
    painted: new Set(e.painted), openGroups: new Set(e.openGroups), x: e.cursorX, y: e.cursorY, moves: e.moves,
  });
  const fresh = new PathEngine(level);
  const start: S = cap(fresh);
  const sim: Sim<S, Direction> = {
    levelCount: 1,
    start: () => start,
    moves: (s) => DIRS.filter((d) => engineAt(s).canMove(d)),
    apply: (s, m) => { const e = engineAt(s); e.move(m); return cap(e); },
    status: (s) => { const e = engineAt(s); return e.painted.size >= e.target ? "won" : s.moves >= budget ? "lost" : "playing"; },
    progress: (s) => { const e = engineAt(s); return e.target === 0 ? 0 : e.painted.size / e.target; },
    describe: () => ({ grid: level.grid, legend: [], intent: level.name, mechanics: [] }),
  };
  return { sim, start };
}

const budgets: number[] = [];
const report: string[] = [];
for (let i = 0; i < N; i++) {
  const level = LEVELS[i];
  const n = i + 1;
  const par = level.parMoves; // BFS-optimal strokes for this board
  const want = target(n);
  let best: { budget: number; casual: number; skilled: number } | null = null;
  for (let budget = par; budget <= par + 22; budget++) {
    const { sim, start } = simFor(level, budget);
    const casual = winRate(sim, start, "casual", TRIALS).rate;
    const skilled = winRate(sim, start, "skilled", TRIALS).rate;
    if (!best || Math.abs(casual - want) < Math.abs(best.casual - want)) best = { budget, casual, skilled };
    if (casual >= want) break; // monotone rising — first budget to reach target is closest from below/above
  }
  budgets.push(best!.budget);
  report.push(`L${n} par ${par} → budget ${best!.budget}: casual ${best!.casual.toFixed(2)} skilled ${best!.skilled.toFixed(2)} (target ${want.toFixed(2)})`);
}

console.log(report.join("\n"));
console.log("\nbotBudgets = [" + budgets.join(", ") + "]");
