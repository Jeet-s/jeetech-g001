/// <reference types="node" />
/**
 * Level validation — run by the factory's QA with `npm run validate`.
 *
 * Loads EVERY Path Painter level through the REAL engine (src/game/PathEngine)
 * and proves it is completable with a depth-first solver that only uses the
 * engine's own move/undo rules (same roller physics the player sees). A level
 * counts as solvable when a sequence of swipes reaches status === "won" (every
 * paintable tile covered, all gates opened legally).
 *
 * Prints exactly one final JSON line: {"levels": N, "solvable": M}
 * and exits non-zero if any level is unsolvable.
 */
import { PathEngine, type Direction, type LevelSpec } from "../src/game/PathEngine";
import { LEVELS } from "../src/game/levels";

const DIRS: Direction[] = ["up", "down", "left", "right"];
const MAX_DEPTH = 120;

function stateKey(e: PathEngine): string {
  const painted = [...e.painted].sort().join(";");
  const gates = [...e.openGroups].sort().join(",");
  return `${e.cursorX},${e.cursorY}|${painted}|${gates}`;
}

/** DFS over engine states with full-state memoisation (painting is monotonic,
 *  so a revisited state can never lead to a new win). */
function solve(level: LevelSpec): boolean {
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
      if (engine.moves === before) continue; // nothing actually rolled
      if (dfs(depth - 1)) return true;
      engine.undo();
    }
    return false;
  }

  return dfs(MAX_DEPTH);
}

let solvable = 0;
const unsolvable: number[] = [];
for (const level of LEVELS) {
  if (solve(level)) solvable++;
  else unsolvable.push(level.id);
}

if (unsolvable.length > 0) {
  console.error("Unsolvable levels:", unsolvable.join(", "));
}
console.log(JSON.stringify({ levels: LEVELS.length, solvable }));
process.exit(solvable === LEVELS.length ? 0 : 1);
