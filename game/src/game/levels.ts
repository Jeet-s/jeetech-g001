import type { LevelSpec } from "./PathEngine";

/**
 * Path Painter level set — 36 hand-tuned roller-splat mazes across six chapters.
 *
 * Two construction families keep every level provably coverable by the roller
 * (scripts/validate.ts solves each through the real engine):
 *   • hsnake()  — a boustrophedon snake of open corridors joined at alternating
 *                 ends. One swipe fills each row, so a full cover always exists.
 *   • comb grids (hand-authored) — the original serpentine boards, kept intact.
 * Switches (A..D) always sit on the forced path strictly before their matching
 * gate (a..d), so gate/sequence levels stay solvable while teaching the rule.
 * Crumble tiles (*) only ever sit on cells the forced path crosses once.
 */
export const CHAPTERS = [
  "Basics",
  "Switches & Gates",
  "Color Sequencing",
  "Crumble Hazards",
  "Timed Trials",
  "Master Mazes",
] as const;

/* ----------------------------- grid builders ------------------------------ */

/** Corridor-row index r (0-based) → grid row index. */
const crow = (r: number) => 2 * r + 1;

/** Optimal strokes for an R-row snake: fill a row, drop a row, repeat. */
const snakePar = (rows: number) => 2 * rows - 1;

function put(g: string[], gy: number, x: number, ch: string): string[] {
  g[gy] = g[gy].slice(0, x) + ch + g[gy].slice(x + 1);
  return g;
}

/** Horizontal boustrophedon snake; start at the top-left corridor cell. */
function hsnake(cols: number, rows: number): string[] {
  const W = cols + 2;
  const wall = "#".repeat(W);
  const g: string[] = [wall];
  for (let r = 0; r < rows; r++) {
    g.push("#" + ".".repeat(cols) + "#");
    if (r < rows - 1) {
      const row = "#".repeat(W).split("");
      row[r % 2 === 0 ? cols : 1] = "."; // connector alternates ends
      g.push(row.join(""));
    }
  }
  g.push(wall);
  return put(g, 1, 1, "o");
}

interface Pair {
  sr: number; // switch corridor row
  sx: number; // switch column
  gr: number; // gate corridor row (must be > sr → painted after the switch)
  gx: number; // gate column
  group: string; // A..D
}

/** A snake with switch/gate pairs injected on the forced path. */
function gateSnake(cols: number, rows: number, pairs: Pair[]): string[] {
  const g = hsnake(cols, rows);
  for (const p of pairs) {
    put(g, crow(p.sr), p.sx, p.group.toUpperCase());
    put(g, crow(p.gr), p.gx, p.group.toLowerCase());
  }
  return g;
}

/** A snake with crumble tiles on cells the forced path crosses exactly once. */
function crumbleSnake(cols: number, rows: number, spots: [number, number][]): string[] {
  const g = hsnake(cols, rows);
  for (const [r, x] of spots) put(g, crow(r), x, "*");
  return g;
}

/* -------------------------------- levels ---------------------------------- */

export const LEVELS: LevelSpec[] = [
  /* --- Chapter 1 · Basics (teach the mechanic) --- */
  {
    id: 1,
    chapter: 1,
    name: "First Strokes",
    parMoves: 5,
    timeLimitSeconds: 0,
    hint: "Swipe to roll the brush. It paints every tile it crosses.",
    grid: ["#######", "#o....#", "#####.#", "#.....#", "#.#####", "#.....#", "#######"],
  },
  {
    id: 2,
    chapter: 1,
    name: "Up & Over",
    parMoves: 5,
    timeLimitSeconds: 0,
    hint: "The brush rolls until it hits a wall. Fill every tile to win.",
    grid: ["#######", "#o#...#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#...#.#", "#######"],
  },
  {
    id: 3,
    chapter: 1,
    name: "Weave",
    parMoves: 7,
    timeLimitSeconds: 0,
    hint: "Plan your turns so no tile is left unpainted. Undo if you get stuck.",
    grid: ["#########", "#o#...#.#", "#.#.#.#.#", "#.#.#.#.#", "#.#.#.#.#", "#...#...#", "#########"],
  },
  { id: 4, chapter: 1, name: "Zigzag", parMoves: snakePar(3), timeLimitSeconds: 0, grid: hsnake(5, 3) },
  { id: 5, chapter: 1, name: "Ribbon", parMoves: snakePar(4), timeLimitSeconds: 0, grid: hsnake(6, 4) },
  { id: 6, chapter: 1, name: "Long Weave", parMoves: snakePar(5), timeLimitSeconds: 0, grid: hsnake(7, 5) },

  /* --- Chapter 2 · Switches & Gates --- */
  {
    id: 7,
    chapter: 2,
    name: "Locked Gate",
    parMoves: 7,
    timeLimitSeconds: 0,
    hint: "Paint the round switch to open its matching square gate.",
    grid: ["#########", "#o#.a.#.#", "#.#.#.#.#", "#.#A#.#.#", "#.#.#.#.#", "#...#...#", "#########"],
  },
  {
    id: 8,
    chapter: 2,
    name: "Switch First",
    parMoves: 5,
    timeLimitSeconds: 0,
    grid: ["#######", "#o#...#", "#.#.#.#", "#A#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.a.#.#", "#######"],
  },
  { id: 9, chapter: 2, name: "Open Sesame", parMoves: snakePar(4), timeLimitSeconds: 0, grid: gateSnake(5, 4, [{ sr: 0, sx: 3, gr: 2, gx: 3, group: "A" }]) },
  { id: 10, chapter: 2, name: "Keyway", parMoves: snakePar(4), timeLimitSeconds: 0, grid: gateSnake(6, 4, [{ sr: 1, sx: 2, gr: 3, gx: 4, group: "A" }]) },
  { id: 11, chapter: 2, name: "Gatehouse", parMoves: snakePar(5), timeLimitSeconds: 0, grid: gateSnake(6, 5, [{ sr: 0, sx: 4, gr: 3, gx: 3, group: "A" }]) },
  { id: 12, chapter: 2, name: "Deep Door", parMoves: snakePar(5), timeLimitSeconds: 0, grid: gateSnake(7, 5, [{ sr: 1, sx: 5, gr: 4, gx: 3, group: "A" }]) },

  /* --- Chapter 3 · Color Sequencing (ordered gates) --- */
  {
    id: 13,
    chapter: 3,
    name: "In Order",
    parMoves: 7,
    timeLimitSeconds: 0,
    hint: "Two gates now. Open each switch before you reach its gate.",
    grid: ["#########", "#o#.a.#.#", "#.#.#.#.#", "#.#A#B#.#", "#.#.#.#.#", "#...#.b.#", "#########"],
  },
  { id: 14, chapter: 3, name: "Red then Blue", parMoves: snakePar(4), timeLimitSeconds: 0, grid: gateSnake(5, 4, [{ sr: 0, sx: 2, gr: 1, gx: 3, group: "A" }, { sr: 2, sx: 2, gr: 3, gx: 3, group: "B" }]) },
  { id: 15, chapter: 3, name: "Two Keys", parMoves: snakePar(5), timeLimitSeconds: 0, grid: gateSnake(6, 5, [{ sr: 0, sx: 4, gr: 2, gx: 3, group: "A" }, { sr: 1, sx: 2, gr: 4, gx: 3, group: "B" }]) },
  { id: 16, chapter: 3, name: "Crosswise", parMoves: snakePar(5), timeLimitSeconds: 0, grid: gateSnake(6, 5, [{ sr: 0, sx: 2, gr: 3, gx: 4, group: "A" }, { sr: 2, sx: 5, gr: 4, gx: 2, group: "B" }]) },
  { id: 17, chapter: 3, name: "Triple Lock", parMoves: snakePar(5), timeLimitSeconds: 0, grid: gateSnake(7, 5, [{ sr: 0, sx: 3, gr: 2, gx: 4, group: "A" }, { sr: 1, sx: 2, gr: 3, gx: 5, group: "B" }, { sr: 2, sx: 6, gr: 4, gx: 3, group: "C" }]) },
  { id: 18, chapter: 3, name: "Chain Reaction", parMoves: snakePar(6), timeLimitSeconds: 0, grid: gateSnake(7, 6, [{ sr: 0, sx: 3, gr: 2, gx: 4, group: "A" }, { sr: 1, sx: 5, gr: 3, gx: 2, group: "B" }, { sr: 3, sx: 3, gr: 5, gx: 4, group: "C" }]) },

  /* --- Chapter 4 · Crumble Hazards --- */
  {
    id: 19,
    chapter: 4,
    name: "Crumble Run",
    parMoves: 7,
    timeLimitSeconds: 0,
    hint: "Striped tiles crumble after one pass — cross them only once.",
    grid: ["#########", "#o#...#.#", "#.#.#.#.#", "#.#*#*#.#", "#.#.#.#.#", "#...#...#", "#########"],
  },
  { id: 20, chapter: 4, name: "Thin Ice", parMoves: snakePar(4), timeLimitSeconds: 0, grid: crumbleSnake(5, 4, [[1, 3], [2, 2]]) },
  { id: 21, chapter: 4, name: "Cracked Path", parMoves: snakePar(4), timeLimitSeconds: 0, grid: crumbleSnake(6, 4, [[0, 4], [2, 3], [3, 2]]) },
  { id: 22, chapter: 4, name: "Fragile Floor", parMoves: snakePar(5), timeLimitSeconds: 0, grid: crumbleSnake(6, 5, [[1, 3], [2, 4], [3, 2], [4, 5]]) },
  { id: 23, chapter: 4, name: "Collapse", parMoves: snakePar(5), timeLimitSeconds: 0, grid: crumbleSnake(7, 5, [[0, 5], [1, 3], [2, 6], [3, 3], [4, 4]]) },
  {
    id: 24,
    chapter: 4,
    name: "Locked & Loose",
    parMoves: snakePar(5),
    timeLimitSeconds: 0,
    grid: put(gateSnake(7, 5, [{ sr: 0, sx: 3, gr: 3, gx: 4, group: "A" }]), crow(2), 5, "*"),
  },

  /* --- Chapter 5 · Timed Trials --- */
  {
    id: 25,
    chapter: 5,
    name: "Beat the Clock",
    parMoves: 7,
    timeLimitSeconds: 70,
    hint: "The timer is ticking — plan fast, then paint it all before it runs out.",
    grid: ["#########", "#o#.a.#.#", "#.#.#.#.#", "#.#A#B#.#", "#.#.#.#.#", "#...#.b.#", "#########"],
  },
  {
    id: 26,
    chapter: 5,
    name: "Long Haul",
    parMoves: 9,
    timeLimitSeconds: 90,
    grid: ["###########", "#o#...#...#", "#.#.#.#.#.#", "#.#.#.#.#.#", "#.#.#.#.#.#", "#...#...#.#", "###########"],
  },
  { id: 27, chapter: 5, name: "Quick Ribbon", parMoves: snakePar(4), timeLimitSeconds: 60, grid: hsnake(6, 4) },
  { id: 28, chapter: 5, name: "Timed Gate", parMoves: snakePar(4), timeLimitSeconds: 75, grid: gateSnake(6, 4, [{ sr: 0, sx: 3, gr: 2, gx: 4, group: "A" }]) },
  { id: 29, chapter: 5, name: "Sprint Maze", parMoves: snakePar(5), timeLimitSeconds: 80, grid: hsnake(7, 5) },
  { id: 30, chapter: 5, name: "Clockwork", parMoves: snakePar(5), timeLimitSeconds: 90, grid: gateSnake(7, 5, [{ sr: 0, sx: 3, gr: 2, gx: 5, group: "A" }, { sr: 1, sx: 2, gr: 4, gx: 3, group: "B" }]) },

  /* --- Chapter 6 · Master Mazes --- */
  { id: 31, chapter: 6, name: "Grand Weave", parMoves: snakePar(6), timeLimitSeconds: 0, grid: hsnake(8, 6) },
  { id: 32, chapter: 6, name: "Twin Vaults", parMoves: snakePar(6), timeLimitSeconds: 0, grid: gateSnake(8, 6, [{ sr: 0, sx: 4, gr: 2, gx: 5, group: "A" }, { sr: 1, sx: 3, gr: 4, gx: 4, group: "B" }]) },
  { id: 33, chapter: 6, name: "Shattered Hall", parMoves: snakePar(6), timeLimitSeconds: 0, grid: crumbleSnake(8, 6, [[1, 4], [2, 5], [3, 3], [4, 6]]) },
  { id: 34, chapter: 6, name: "Triple Vault", parMoves: snakePar(7), timeLimitSeconds: 0, grid: gateSnake(8, 7, [{ sr: 0, sx: 4, gr: 2, gx: 5, group: "A" }, { sr: 1, sx: 3, gr: 4, gx: 4, group: "B" }, { sr: 3, sx: 5, gr: 5, gx: 3, group: "C" }]) },
  { id: 35, chapter: 6, name: "Final Sprint", parMoves: snakePar(7), timeLimitSeconds: 120, grid: hsnake(9, 7) },
  { id: 36, chapter: 6, name: "Masterpiece", parMoves: snakePar(7), timeLimitSeconds: 0, grid: gateSnake(9, 7, [{ sr: 0, sx: 4, gr: 2, gx: 5, group: "A" }, { sr: 1, sx: 3, gr: 3, gx: 6, group: "B" }, { sr: 2, sx: 6, gr: 4, gx: 3, group: "C" }, { sr: 3, sx: 4, gr: 5, gx: 5, group: "D" }]) },
];

export function levelById(id: number): LevelSpec | undefined {
  return LEVELS.find((l) => l.id === id);
}

export const TOTAL_LEVELS = LEVELS.length;
export const MAX_STARS = LEVELS.length * 3;
