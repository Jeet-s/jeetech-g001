import type { Direction, LevelSpec } from "./PathEngine";

/**
 * Path Painter level set — 36 handcrafted roller-maze puzzles across six chapters.
 *
 * The brush rolls in the swiped direction until a wall, a shut gate, or a used
 * crumble tile stops it, painting every tile it crosses. Win = every paintable
 * tile covered. Unlike a single forced corridor, each board is a MAZE: the
 * player faces real route choices (branching >= 2 everywhere) and must plan the
 * order of strokes so nothing is stranded. See docs/LEVELS.md for the plan and
 * every level's intent; src/game/sim.ts describe() prints them for review.
 *
 * Each level stores the solver's optimal cover path in `solution` — scripts/
 * validate.ts replays it through the REAL engine to PROVE the board completable,
 * and measures difficulty from its length plus a weight per gate/crumble. Boards
 * were generated from fixed seeds and curated: every kept level is solvable with
 * genuine branching, a fair trap rate, and a botBudget tuned with the playtest
 * bots (scripts/tune-levels.ts) to shape a smooth casual win-rate curve. No two
 * start states are identical (the playtest duplicate check enforces it).
 */
export const CHAPTERS = [
  "Basics",
  "Switches & Gates",
  "Color Sequencing",
  "Crumble Hazards",
  "Timed Trials",
  "Master Mazes",
] as const;

export const LEVELS: LevelSpec[] = [

  /* --- Chapter 1 · Basics — teach the roller --- */
  { id: 1, chapter: 1, name: "First Roll", parMoves: 4, timeLimitSeconds: 0, botBudget: 10, hint: "Swipe to roll the paint — it slides until it hits a wall, painting every tile it crosses.",
    grid: ["#####", "#.#.#", "#o#.#", "#...#", "#####"],
    solution: ["up", "down", "right", "up"] },
  { id: 2, chapter: 1, name: "Two Ways", parMoves: 4, timeLimitSeconds: 0, botBudget: 7, hint: "Two ways to go. Cover every tile — pick which branch to paint first.",
    grid: ["#####", "#...#", "#.#.#", "#..o#", "#####"],
    solution: ["up", "left", "down", "right"] },
  { id: 3, chapter: 1, name: "Around the Bend", parMoves: 4, timeLimitSeconds: 0, botBudget: 9, hint: "The brush only stops at walls, so steer by choosing when to turn.",
    grid: ["#####", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#..o#", "#####"],
    solution: ["up", "down", "left", "up"] },
  { id: 4, chapter: 1, name: "Dead Ends", parMoves: 4, timeLimitSeconds: 0, botBudget: 7,
    grid: ["#######", "#.....#", "#####.#", "#..o..#", "#######"],
    solution: ["left", "right", "up", "left"] },
  { id: 5, chapter: 1, name: "The Fork", parMoves: 5, timeLimitSeconds: 0, botBudget: 15,
    grid: ["#######", "#...#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#..o..#", "#######"],
    solution: ["up", "left", "down", "right", "up"] },
  { id: 6, chapter: 1, name: "Full Cover", parMoves: 6, timeLimitSeconds: 0, botBudget: 22,
    grid: ["#######", "#.....#", "#####.#", "#.....#", "#.#####", "#o....#", "#######"],
    solution: ["right", "left", "up", "right", "up", "left"] },

  /* --- Chapter 2 · Switches & Gates — one lock at a time --- */
  { id: 7, chapter: 2, name: "First Key", parMoves: 6, timeLimitSeconds: 0, botBudget: 24, hint: "Paint the round switch to open its matching door, then roll on through.",
    grid: ["#######", "#..oA.#", "#####.#", "#...#.#", "#.###a#", "#.....#", "#######"],
    solution: ["left", "right", "down", "left", "up", "right"] },
  { id: 8, chapter: 2, name: "Locked In", parMoves: 6, timeLimitSeconds: 0, botBudget: 15,
    grid: ["#######", "#.#...#", "#.#.#.#", "#.#.Ao#", "#.###.#", "#....a#", "#######"],
    solution: ["left", "up", "right", "down", "left", "up"] },
  { id: 9, chapter: 2, name: "Key & Door", parMoves: 6, timeLimitSeconds: 0, botBudget: 16,
    grid: ["#######", "#..o.a#", "#.#.#.#", "#.A.#.#", "#####.#", "#.....#", "#######"],
    solution: ["down", "left", "up", "right", "down", "left"] },
  { id: 10, chapter: 2, name: "Detour", parMoves: 7, timeLimitSeconds: 0, botBudget: 10,
    grid: ["#########", "#.......#", "#a#####.#", "#.o...#.#", "#.#####A#", "#.......#", "#########"],
    solution: ["right", "left", "down", "right", "up", "left", "down"] },
  { id: 11, chapter: 2, name: "Far Door", parMoves: 6, timeLimitSeconds: 0, botBudget: 20,
    grid: ["#########", "#aA.....#", "#######.#", "#..o..#.#", "#.#####.#", "#.......#", "#########"],
    solution: ["right", "left", "down", "right", "up", "left"] },
  { id: 12, chapter: 2, name: "Gatekeeper", parMoves: 6, timeLimitSeconds: 0, botBudget: 15,
    grid: ["#########", "#...oA..#", "#######.#", "#..a....#", "#.#######", "#.......#", "#########"],
    solution: ["left", "right", "down", "left", "down", "right"] },

  /* --- Chapter 3 · Color Sequencing — several ordered locks --- */
  { id: 13, chapter: 3, name: "Two Colours", parMoves: 8, timeLimitSeconds: 0, botBudget: 17, hint: "Two colours now — paint each switch before you reach its own door.",
    grid: ["#######", "#.#.AB#", "#.#.#.#", "#a#.#.#", "#b#.#.#", "#..o#.#", "#######"],
    solution: ["up", "right", "down", "up", "left", "down", "left", "up"] },
  { id: 14, chapter: 3, name: "Order Up", parMoves: 7, timeLimitSeconds: 0, botBudget: 21,
    grid: ["#########", "#b..a.#.#", "#####.#A#", "#.....#.#", "#.#####o#", "#B......#", "#########"],
    solution: ["up", "down", "left", "up", "right", "up", "left"] },
  { id: 15, chapter: 3, name: "Twin Keys", parMoves: 7, timeLimitSeconds: 0, botBudget: 10,
    grid: ["#########", "#...oA#a#", "#####B#b#", "#.....#.#", "#.#####.#", "#.......#", "#########"],
    solution: ["left", "right", "down", "left", "down", "right", "up"] },
  { id: 16, chapter: 3, name: "Three Doors", parMoves: 12, timeLimitSeconds: 0, botBudget: 30,
    grid: ["#########", "#.#.....#", "#.#.###.#", "#.#.b.#C#", "#.###.#c#", "#...oA#a#", "#.#.###.#", "#.B.#...#", "#########"],
    solution: ["left", "up", "down", "right", "up", "right", "up", "left", "up", "right", "down", "left"] },
  { id: 17, chapter: 3, name: "Tangle", parMoves: 11, timeLimitSeconds: 0, botBudget: 19,
    grid: ["#########", "#.#...o.#", "#.#.###.#", "#B#...#.#", "#.#A#.#.#", "#...#.#.#", "#.###a#.#", "#b.Cc.#.#", "#########"],
    solution: ["left", "down", "left", "up", "down", "right", "up", "left", "up", "right", "down"] },
  { id: 18, chapter: 3, name: "Lockwork", parMoves: 12, timeLimitSeconds: 0, botBudget: 29,
    grid: ["#########", "#....C.o#", "#######.#", "#Aa.#B..#", "#.#.#.###", "#.#.#.#.#", "#.###.#.#", "#...bc..#", "#########"],
    solution: ["left", "right", "down", "left", "down", "right", "up", "down", "left", "up", "right", "down"] },

  /* --- Chapter 4 · Crumble Hazards — one-use floor --- */
  { id: 19, chapter: 4, name: "First Cracks", parMoves: 9, timeLimitSeconds: 0, botBudget: 21, hint: "Striped tiles crumble after one pass. Plan a route that crosses each only once.",
    grid: ["#########", "#.#.*...#", "#.#.###*#", "#.#...#.#", "#.###.#.#", "#...o.#.#", "#########"],
    solution: ["left", "up", "down", "right", "up", "left", "up", "right", "down"] },
  { id: 20, chapter: 4, name: "One Pass", parMoves: 12, timeLimitSeconds: 0, botBudget: 29,
    grid: ["#########", "#.#...#*#", "#.#o#.#.#", "#.#.#...#", "#.#.###.#", "#A..#..a#", "#########"],
    solution: ["down", "left", "up", "down", "right", "up", "right", "down", "right", "up", "down", "left"] },
  { id: 21, chapter: 4, name: "Brittle", parMoves: 10, timeLimitSeconds: 0, botBudget: 24,
    grid: ["#########", "#*#.....#", "#.#.###.#", "#.#.#.*.#", "#.###.#.#", "#..o..#.#", "#########"],
    solution: ["left", "up", "down", "right", "up", "right", "down", "up", "left", "down"] },
  { id: 22, chapter: 4, name: "Lock & Crack", parMoves: 11, timeLimitSeconds: 0, botBudget: 19,
    grid: ["#########", "#.......#", "#######B#", "#.....#.#", "#.###.#a#", "#.....#.#", "#*#####.#", "#..bA..o#", "#########"],
    solution: ["left", "right", "up", "left", "right", "down", "left", "up", "right", "down", "left"] },
  { id: 23, chapter: 4, name: "Fragile Keys", parMoves: 11, timeLimitSeconds: 0, botBudget: 25,
    grid: ["#########", "#*..*...#", "#.#o###.#", "#.#.#...#", "#.#.#.###", "#...#.#A#", "#####.#.#", "#.a.....#", "#########"],
    solution: ["down", "left", "up", "right", "down", "left", "down", "right", "up", "down", "left"] },
  { id: 24, chapter: 4, name: "Crumble Vault", parMoves: 9, timeLimitSeconds: 0, botBudget: 14,
    grid: ["#########", "#..b..#.#", "#####.#.#", "#...#.#A#", "#.#.#.#.#", "#.#a.B#o#", "#*#####.#", "#......*#", "#########"],
    solution: ["up", "down", "left", "up", "right", "down", "right", "up", "left"] },

  /* --- Chapter 5 · Timed Trials — everything, against a clock --- */
  { id: 25, chapter: 5, name: "Against the Clock", parMoves: 11, timeLimitSeconds: 70, botBudget: 14, hint: "Beat the clock — plan the whole path first, then paint it fast.",
    grid: ["#########", "#......*#", "#######.#", "#...#...#", "#o#.#.###", "#.#.#...#", "#.#.###.#", "#.#...*.#", "#########"],
    solution: ["down", "up", "right", "down", "right", "up", "left", "up", "right", "up", "left"] },
  { id: 26, chapter: 5, name: "Time Lock", parMoves: 15, timeLimitSeconds: 90, botBudget: 26,
    grid: ["###########", "#Ao.....#.#", "#######.#.#", "#.#...Ba#.#", "#.#.#####.#", "#.#.#.....#", "#.#.#.#.#.#", "#b....#...#", "###########"],
    solution: ["left", "right", "down", "left", "down", "left", "up", "down", "right", "up", "right", "up", "down", "left", "up"] },
  { id: 27, chapter: 5, name: "Rush Doors", parMoves: 15, timeLimitSeconds: 80, botBudget: 28,
    grid: ["###########", "#.#...#...#", "#.#.###.#.#", "#.#C..b.#a#", "#B#.#####.#", "#.#c#.....#", "#.###.###.#", "#o....#A..#", "###########"],
    solution: ["up", "down", "right", "up", "right", "down", "left", "right", "up", "left", "down", "left", "down", "up", "right"] },
  { id: 28, chapter: 5, name: "Timed Cracks", parMoves: 14, timeLimitSeconds: 85, botBudget: 24,
    grid: ["###########", "#.......#.#", "#######.#.#", "#.*.#...#o#", "#.#.#b#a#.#", "#.#.A.#...#", "#.#######B#", "#.........#", "###########"],
    solution: ["up", "down", "left", "up", "right", "down", "right", "up", "right", "up", "left", "right", "down", "right"] },
  { id: 29, chapter: 5, name: "Big Sprint", parMoves: 14, timeLimitSeconds: 95, botBudget: 16,
    grid: ["###########", "#.#...o...#", "#.#.#.#####", "#.#.#.*...#", "#.#.#####.#", "#.......#.#", "#.#######.#", "#.......#.#", "#######.#*#", "#.........#", "###########"],
    solution: ["left", "down", "right", "left", "up", "down", "right", "down", "left", "right", "up", "left", "up", "right"] },
  { id: 30, chapter: 5, name: "Clockwork", parMoves: 14, timeLimitSeconds: 100, botBudget: 32,
    grid: ["###########", "#.#...#...#", "#.#.#.#.#a#", "#.#.#...#.#", "#b#.#####.#", "#......B#.#", "#.#####.#.#", "#.#..o..#.#", "#A#######.#", "#.........#", "###########"],
    solution: ["left", "right", "up", "left", "up", "down", "right", "up", "left", "down", "left", "up", "left", "down"] },

  /* --- Chapter 6 · Master Mazes — the graduation --- */
  { id: 31, chapter: 6, name: "Master Keys", parMoves: 14, timeLimitSeconds: 0, botBudget: 17,
    grid: ["###########", "#...#b.c..#", "###.#.#####", "#.#.#..B..#", "#.#o#####.#", "#a#...C.#.#", "#.#####A#.#", "#.........#", "###########"],
    solution: ["up", "left", "right", "down", "right", "down", "left", "up", "down", "right", "up", "left", "up", "right"] },
  { id: 32, chapter: 6, name: "Grand Vault", parMoves: 13, timeLimitSeconds: 0, botBudget: 17,
    grid: ["###########", "#.#.c....A#", "#.#######.#", "#.#.......#", "#.#.#####b#", "#.#C#.a...#", "#.#.#######", "#.#.....B.#", "#.#######.#", "#......o..#", "###########"],
    solution: ["left", "up", "down", "right", "up", "left", "up", "right", "up", "left", "right", "down", "left"] },
  { id: 33, chapter: 6, name: "Shatter Hall", parMoves: 16, timeLimitSeconds: 0, botBudget: 28,
    grid: ["###########", "#B........#", "#.#######.#", "#*......#.#", "#######.#.#", "#...#...#a#", "#.###.###.#", "#.....#.o.#", "#.#####.#A#", "#.b.....#.#", "###########"],
    solution: ["right", "down", "up", "left", "down", "right", "down", "left", "down", "left", "up", "right", "left", "down", "right", "up"] },
  { id: 34, chapter: 6, name: "Four Locks", parMoves: 16, timeLimitSeconds: 0, botBudget: 38,
    grid: ["###########", "#.D..B...C#", "#########.#", "#b#A......#", "#.#.###.###", "#.#.c.....#", "#o#####.#.#", "#.#.....#.#", "#.#.#####.#", "#...d....a#", "###########"],
    solution: ["down", "right", "up", "right", "up", "right", "up", "left", "right", "down", "left", "down", "right", "down", "left", "up"] },
  { id: 35, chapter: 6, name: "Final Sprint", parMoves: 16, timeLimitSeconds: 120, botBudget: 35,
    grid: ["###########", "#.#.....*.#", "#.#.#####.#", "#.#.....#.#", "#.#####.#.#", "#.o.......#", "#########.#", "#.......#.#", "#.#####.#.#", "#.....#*..#", "###########"],
    solution: ["left", "up", "down", "right", "up", "left", "down", "right", "down", "right", "down", "left", "up", "left", "down", "right"] },
  { id: 36, chapter: 6, name: "Masterpiece", parMoves: 19, timeLimitSeconds: 0, botBudget: 38,
    grid: ["###########", "#.C...oA#d#", "#######.#.#", "#...#D*.#B#", "#.#.#.###c#", "#.#...#...#", "#a#####.#.#", "#.......#.#", "#.#.#.###.#", "#...#..b..#", "###########"],
    solution: ["left", "right", "down", "left", "down", "left", "up", "left", "down", "right", "up", "left", "right", "up", "right", "up", "down", "left", "up"] },
];

export function levelById(id: number): LevelSpec | undefined {
  return LEVELS.find((l) => l.id === id);
}

export const TOTAL_LEVELS = LEVELS.length;
export const MAX_STARS = LEVELS.length * 3;
