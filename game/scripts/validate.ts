/// <reference types="node" />
/**
 * Level validation — run by the factory's QA with `npm run validate`.
 *
 * Loads EVERY Path Painter level through the REAL engine (src/game/PathEngine)
 * and PROVES it is completable by replaying the level's STORED solution with the
 * engine's own roller physics (the same swipes the player makes). A level counts
 * as solvable when that replay reaches status === "won" — every paintable tile
 * covered, every gate opened legally. A depth-first engine solver is the backup
 * proof for any board whose stored solution is missing or does not cover.
 *
 * Difficulty is MEASURED through the engine: the strokes the solution takes to
 * win, plus a weight for each gate and crumble hazard the brush must plan around.
 *
 * Prints exactly one final JSON line:
 *   {"levels": N, "solvable": M, "difficulty": [d1..dN]}
 * Exits non-zero if any level is unsolvable, N < 30, or the curve fails to rise
 * (late third must average >= 3x the early third).
 */
import { PathEngine, type Direction, type LevelSpec } from "../src/game/PathEngine";
import { LEVELS } from "../src/game/levels";

const DIRS: Direction[] = ["up", "down", "left", "right"];
const MAX_DEPTH = 200;

function countChar(level: LevelSpec, pred: (c: string) => boolean): number {
  let n = 0;
  for (const row of level.grid) for (const c of row) if (pred(c)) n++;
  return n;
}

/** Replay the level's stored solution; returns strokes-to-win, or -1 if it did not win. */
function replaySolution(level: LevelSpec): number {
  if (!level.solution) return -1;
  const engine = new PathEngine(level);
  for (const dir of level.solution) {
    engine.move(dir);
    if (engine.status === "won") return engine.moves;
  }
  return engine.status === "won" ? engine.moves : -1;
}

function stateKey(e: PathEngine): string {
  return `${e.cursorX},${e.cursorY}|${[...e.painted].sort().join(";")}|${[...e.openGroups].sort().join(",")}`;
}

/** Backup proof: DFS over engine states (painting is monotonic → memoise). */
function dfsSolve(level: LevelSpec): number {
  const engine = new PathEngine(level);
  const visited = new Set<string>();
  function dfs(depth: number): boolean {
    if (engine.status === "won") return true;
    if (depth <= 0) return false;
    const key = stateKey(engine);
    if (visited.has(key)) return false;
    visited.add(key);
    for (const dir of DIRS) {
      if (!engine.canMove(dir)) continue;
      const before = engine.moves;
      engine.move(dir);
      if (engine.moves === before) continue;
      if (dfs(depth - 1)) return true;
      engine.undo();
    }
    return false;
  }
  return dfs(MAX_DEPTH) ? engine.moves : -1;
}

const difficulty: number[] = [];
const unsolvable: number[] = [];
let solvable = 0;

for (const level of LEVELS) {
  let strokes = replaySolution(level);
  if (strokes < 0) strokes = dfsSolve(level);
  if (strokes < 0) {
    unsolvable.push(level.id);
    difficulty.push(0);
    continue;
  }
  solvable++;
  const gates = countChar(level, (c) => c >= "a" && c <= "d");
  const crumble = countChar(level, (c) => c === "*");
  difficulty.push(strokes + 3 * (gates + crumble));
}

// Difficulty must rise: the late third should be at least 3x the early third.
const third = Math.floor(LEVELS.length / 3);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const early = mean(difficulty.slice(0, third));
const late = mean(difficulty.slice(-third));
const rises = late >= 3 * early;

if (unsolvable.length) console.error("Unsolvable levels:", unsolvable.join(", "));
if (!rises) console.error(`Difficulty curve too flat: early ${early.toFixed(1)} → late ${late.toFixed(1)} (<3x)`);

console.log(JSON.stringify({ levels: LEVELS.length, solvable, difficulty }));
process.exit(solvable === LEVELS.length && LEVELS.length >= 30 && rises ? 0 : 1);
