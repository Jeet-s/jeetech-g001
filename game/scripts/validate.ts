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
 * win, plus a weight for each gate, crumble and turn-pad tile the brush must plan
 * around (3 each), plus 3 for every "planning event" in the replay — a stroke the
 * player has to read rather than eyeball: a roll bent by a turn pad, or one that
 * ends on a pad or against a shut gate / spent crumble instead of a wall. Rule
 * systems interact, so the total is scaled by +20 % for every mechanic family
 * in play on the board (doors, colour order with 2+ keys, crumble, turn pads,
 * the clock): a 10-stroke board that mixes three systems plans harder than a
 * 10-stroke board of one.
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

const STEP: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** A stroke that bent on a pad, ended on a pad, or stopped against a shut gate / spent crumble (not a wall). */
function planningEvent(engine: PathEngine): boolean {
  const path = engine.lastPath;
  if (!path.length) return false;
  if (path.some((p) => p.dir !== path[0].dir)) return true;
  const end = path[path.length - 1];
  const t = engine.tileAt(end.x, end.y);
  if (t?.type === "pad") return true;
  const [dx, dy] = STEP[end.dir];
  const next = engine.tileAt(end.x + dx, end.y + dy);
  return !!next && next.type !== "wall";
}

/** Replay the level's stored solution; returns strokes-to-win and planning events, or strokes -1 if it did not win. */
function replaySolution(level: LevelSpec): { strokes: number; events: number } {
  if (!level.solution) return { strokes: -1, events: 0 };
  const engine = new PathEngine(level);
  let events = 0;
  for (const dir of level.solution) {
    engine.move(dir);
    if (planningEvent(engine)) events++;
    if (engine.status === "won") return { strokes: engine.moves, events };
  }
  return { strokes: engine.status === "won" ? engine.moves : -1, events };
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
  const replay = replaySolution(level);
  let strokes = replay.strokes;
  if (strokes < 0) strokes = dfsSolve(level);
  if (strokes < 0) {
    unsolvable.push(level.id);
    difficulty.push(0);
    continue;
  }
  solvable++;
  const gates = countChar(level, (c) => c >= "a" && c <= "d");
  const crumble = countChar(level, (c) => c === "*");
  const pads = countChar(level, (c) => "<>^v".includes(c));
  const keys = new Set(level.grid.join("").match(/[A-D]/g) ?? []).size;
  const families = (gates ? 1 : 0) + (keys >= 2 ? 1 : 0) + (crumble ? 1 : 0) + (pads ? 1 : 0) + (level.timeLimitSeconds > 0 ? 1 : 0);
  difficulty.push(Math.round((strokes + 3 * (gates + crumble + pads) + 3 * replay.events) * (1 + 0.2 * families)));
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
