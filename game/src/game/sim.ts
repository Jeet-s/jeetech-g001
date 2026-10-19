/**
 * Simulation interface for the factory's bot playtesters (scripts/playtest.ts).
 * Implemented on the REAL Path Painter engine (PathEngine) so the bots roll the
 * brush, open gates and crack crumble tiles exactly the way a player does — no
 * UI, no mock rules. QA uses the results to reject levels that are boring (too
 * easy), walls (almost nobody wins) or badly paced.
 *
 * A run is "won" the instant every paintable tile is covered, and "lost" once
 * the brush has taken more swipes than the level's fair-attempt budget
 * (level.botBudget). That budget is the single difficulty knob the level tuner
 * turns; it never appears in the untimed UI (there a long solve only costs
 * stars), so gameplay and save data are untouched.
 */
import { PathEngine, type Direction, type LevelSpec } from "./PathEngine";
import { LEVELS } from "./levels";

export type Status = "playing" | "won" | "lost";

/**
 * A level as a designer (and the factory's level-design review) reads it: the
 * start board drawn as ASCII, a legend for the symbols that actually appear, the
 * one-line design intent from docs/LEVELS.md (role + the "aha" the player must
 * find), and the mechanics in play. Produced by `sim.describe()` and printed by
 * `npm run levels` alongside the solver facts (optimal moves, branching, traps).
 */
export interface LevelBrief {
  grid: string[];
  legend: string[];
  intent: string;
  mechanics: string[];
}

export interface Sim<S, M> {
  levelCount: number;
  /** Fresh state of level `index` (0-based). */
  start(index: number): S;
  /** Legal moves from this state (what a player could tap/swipe now). */
  moves(state: S): M[];
  apply(state: S, move: M): S;
  status(state: S): Status;
  /** Higher = closer to winning — what a human "sees" as progress. Used by human-like bots. */
  progress(state: S): number;
  /** The level as a designer reads it (board, legend, intent, mechanics). */
  describe(index: number): LevelBrief;
}

const DIRS: Direction[] = ["up", "down", "left", "right"];

/** A fair attempt fits in this many swipes; past it the playtest bot has lost. */
export function budgetFor(level: LevelSpec): number {
  return level.botBudget ?? level.parMoves + 3;
}

/**
 * Serialisable snapshot of a run. `grid` is the puzzle's structural identity, so
 * the playtest's duplicate check (which strips the `level` index) correctly
 * flags only levels that are literally the same board — never two different
 * mazes that merely start the brush in the same spot.
 */
export interface PaintState {
  level: number;
  grid: string[];
  painted: string[];
  openGroups: string[];
  x: number;
  y: number;
  moves: number;
  budget: number;
}

/** Rebuild the real engine at an arbitrary mid-run state. */
function engineAt(s: PaintState): PathEngine {
  const engine = new PathEngine(LEVELS[s.level]);
  engine.painted = new Set(s.painted);
  engine.openGroups = new Set(s.openGroups);
  engine.cursorX = s.x;
  engine.cursorY = s.y;
  engine.moves = s.moves;
  return engine;
}

function capture(engine: PathEngine, s: PaintState): PaintState {
  return {
    ...s,
    painted: [...engine.painted],
    openGroups: [...engine.openGroups],
    x: engine.cursorX,
    y: engine.cursorY,
    moves: engine.moves,
  };
}

/**
 * The design intent for every level, straight from docs/LEVELS.md: its role in
 * the teach → practise → twist → combine → finale → breather arc, and the "aha"
 * the player must find. Kept in lock-step with the level plan and surfaced by
 * `npm run levels` so the level-design review reads the same intent we built to.
 */
const INTENTS: Record<number, string> = {
  1: "Teach. The one verb — swipe to roll the paint. The brush slides until a wall stops it, painting every tile on the way. Aha: one swipe covers a whole corridor, so think in strokes, not steps.",
  2: "Teach. The first real choice: two branches leave the start. Aha — cover both, but the order matters; pick the branch that doesn't strand the other.",
  3: "Practise. A taller maze of forks. Aha — the brush only stops at walls, so plan each turn as 'roll till it stops, then turn'.",
  4: "Practise. Open rooms with dead-end stubs. Aha — a stub is only painted by rolling in and back out, so budget a there-and-back for each.",
  5: "Twist. A symmetric fork where both arms look equal. Aha — only one first move lets you sweep the rest in a single chain; the mirror wastes a stroke.",
  6: "Finale (Basics). A loopy maze with several junctions. Tests that 'roll, stop, turn' planning is automatic before mechanics arrive.",

  7: "Teach. The switch→gate rule, alone: a round switch opens its square gate. Aha — unlike an open maze you must now reach the switch BEFORE the corridor past its gate; plan the key into your route.",
  8: "Practise. Switch tucked down a side branch. Aha — detour for the key first; the locked corridor simply isn't an option until then.",
  9: "Practise. The door blocks a corridor you need, with its key off to the side. Aha — fetch the key first; the locked stretch simply isn't available until then.",
  10: "Practise. Key and door on opposite sides of a loop. Hold one lock in mind while covering the longer path to it.",
  11: "Twist. Switch and gate sit side by side at a dead end. Aha — painting the switch instantly opens the gate beside it, turning a wall into your exit.",
  12: "Finale (Switches). A full-size single-gate maze. Sequence the key into a longer cover route without hesitating.",

  13: "Teach. Two colours — two independent locks. Aha — each key opens only its own door; plan a route that paints both switches before you need either corridor.",
  14: "Practise. Two locks whose keys are off the main loop. Order the two detours so neither door blocks you later.",
  15: "Practise. Twin keys at opposite ends. Aha — grab both keys on the way out so the doors are open when you sweep back.",
  16: "Twist. Three doors on a compact board. Aha — the keys are scattered, so plan a single route that paints each colour's switch before you commit to that colour's corridor.",
  17: "Combine. Three locks threaded through a crossing maze. Read the tangle and route so every switch precedes its door.",
  18: "Finale (Sequencing). Three locks on the biggest board of the chapter. Mastery of planning a multi-key order.",

  19: "Teach. Crumble tiles, alone: a striped tile takes one pass, then it's gone. Aha — crossing a crumble cuts the maze in two, so cross it only when you'll never need to return.",
  20: "Combine. A crumble plus one gate. Aha — the key and the one-pass tile fall on the same route; sequence them so neither traps you.",
  21: "Practise. Two crumbles pinch the only loop. Single-pass discipline: choose which fragile tile to spend first.",
  22: "Combine. Two gates and a crumble. Aha — the crumble sits on the shortcut you'd want twice; plan to use it once, for the right half.",
  23: "Combine. One gate, two crumbles at opposite ends. Route the sweep so each fragile tile is crossed on the way to a key, not wasted.",
  24: "Finale (Crumble). Two gates and two crumbles interleaved — some first moves already doom the board, so read the whole route before you commit.",

  25: "Teach (timer). The clock arrives on a crumble maze. Aha — plan the whole single-pass route up front; improvising under time wastes crumbles you can't get back.",
  26: "Practise. A long two-gate maze against a generous clock. Sustain a key-ordered plan at speed.",
  27: "Twist. Three gates under a tighter clock. Aha — decide the key order once, then paint without stopping; hesitation, not the maze, runs out the clock.",
  28: "Combine. Two gates and a crumble under the clock — every mechanic at once, with no time to backtrack.",
  29: "Practise. A big crumble sprint. Fast single-pass routing across a 5×5 maze.",
  30: "Finale (Timed). The largest timed two-gate maze. Planning and pace mastered together.",

  31: "Combine. Opens the master chapter: three gates on a dense 5×4 maze, untimed. Long-horizon key planning with nothing rushing you.",
  32: "Practise. Three locks across a 5×5 maze. Hold several key orders at once on a crowded board.",
  33: "Combine. Two gates plus a crumble, master size. Aha — the one irreversible tile must be designed out of your route before the first swipe.",
  34: "Twist. Four colour locks (A–D) — the most the game throws at you. The challenge is tracking four keys and their forced order across one maze.",
  35: "Combine (timed). The one timed master maze: a 5×5 crumble sprint. Everything at once, against the clock.",
  36: "Finale (Game). The graduation board — four locks and a crumble on the biggest maze in the game. Route-finding, four keys and single-pass discipline in one untimed masterpiece.",
};

const LEGEND_LINES: Record<string, string> = {
  "o": "o  start — the brush begins here (already painted)",
  ".": ".  floor — paintable; the brush rolls over it",
  "#": "#  wall — blocks the brush, not paintable",
  "*": "*  crumble — paintable once, then it's gone (one pass only)",
};

/** Legend for a switch/gate colour that appears on the board. */
function pairLegend(letter: string): string[] {
  const g = letter.toLowerCase();
  return [
    `${letter}  switch (${letter}) — paint it to open every '${g}' gate`,
    `${g}  gate (${letter}) — shut until switch ${letter} is painted, then paintable`,
  ];
}

/** Mechanics present on a board, in teaching order. */
function mechanicsOf(grid: string[]): string[] {
  const has = (pred: (c: string) => boolean) => grid.some((r) => [...r].some(pred));
  const pairs = new Set<string>();
  for (const row of grid) for (const c of row) if (c >= "A" && c <= "D") pairs.add(c);
  const m = ["Roller brush — a swipe rolls until a wall stops it, painting every tile it crosses"];
  if (pairs.size === 1) m.push("Switch & gate — paint the switch to open its gate");
  if (pairs.size >= 2) m.push(`Colour sequencing — ${pairs.size} switch/gate pairs, each opened in path order`);
  if (has((c) => c === "*")) m.push("Crumble tiles — one pass only, so the route may never back-track over them");
  return m;
}

export const sim: Sim<PaintState, Direction> = {
  levelCount: LEVELS.length,

  start(index) {
    const engine = new PathEngine(LEVELS[index]);
    return {
      level: index,
      grid: LEVELS[index].grid,
      painted: [...engine.painted],
      openGroups: [...engine.openGroups],
      x: engine.cursorX,
      y: engine.cursorY,
      moves: 0,
      budget: budgetFor(LEVELS[index]),
    };
  },

  /** Only directions that actually roll the brush — a swipe into a wall is a no-op. */
  moves(state) {
    const engine = engineAt(state);
    return DIRS.filter((d) => engine.canMove(d));
  },

  apply(state, move) {
    const engine = engineAt(state);
    engine.move(move);
    return capture(engine, state);
  },

  status(state) {
    const engine = engineAt(state);
    if (engine.painted.size >= engine.target) return "won";
    if (state.moves >= state.budget) return "lost";
    return "playing";
  },

  progress(state) {
    const engine = engineAt(state);
    return engine.target === 0 ? 0 : engine.painted.size / engine.target;
  },

  describe(index) {
    const level = LEVELS[index];
    const width = level.grid.reduce((m, r) => Math.max(m, r.length), 0);
    // Pad to a true rectangle so the ASCII reads as the real board (void = wall).
    const grid = level.grid.map((r) => (r + "#".repeat(width)).slice(0, width));

    const present = new Set<string>();
    for (const row of grid) for (const c of row) present.add(c);
    const legend: string[] = [];
    for (const ch of ["o", ".", "#", "*"]) if (present.has(ch)) legend.push(LEGEND_LINES[ch]);
    for (const letter of ["A", "B", "C", "D"]) if (present.has(letter)) legend.push(...pairLegend(letter));

    const timed = level.timeLimitSeconds > 0 ? ` Timed: ${level.timeLimitSeconds}s.` : "";
    return {
      grid,
      legend,
      intent: `${level.name} — ${INTENTS[level.id] ?? ""}${timed}`,
      mechanics: timed ? [...mechanicsOf(grid), `Timer — finish within ${level.timeLimitSeconds}s`] : mechanicsOf(grid),
    };
  },
};
