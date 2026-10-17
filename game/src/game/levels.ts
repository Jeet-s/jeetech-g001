import type { LevelSpec } from "./PathEngine";

/**
 * Hand-authored corridor/maze levels. Every grid is a serpentine or branching
 * corridor so a full paint cover exists with discrete roller swipes. Switches
 * (A..D) are always visited before their matching gate (a..d) along the forced
 * path, so gate levels stay solvable while still teaching the mechanic.
 */
export const CHAPTERS = [
  "Basics",
  "Switches & Gates",
  "Color Sequencing",
  "Crumble Hazards",
  "Timed Trials",
] as const;

export const LEVELS: LevelSpec[] = [
  {
    id: 1,
    chapter: 1,
    name: "First Strokes",
    parMoves: 5,
    timeLimitSeconds: 0,
    grid: [
      "#######",
      "#o....#",
      "#####.#",
      "#.....#",
      "#.#####",
      "#.....#",
      "#######",
    ],
  },
  {
    id: 2,
    chapter: 1,
    name: "Up & Over",
    parMoves: 5,
    timeLimitSeconds: 0,
    grid: [
      "#######",
      "#o#...#",
      "#.#.#.#",
      "#.#.#.#",
      "#.#.#.#",
      "#.#.#.#",
      "#.#.#.#",
      "#...#.#",
      "#######",
    ],
  },
  {
    id: 3,
    chapter: 1,
    name: "Weave",
    parMoves: 7,
    timeLimitSeconds: 0,
    grid: [
      "#########",
      "#o#...#.#",
      "#.#.#.#.#",
      "#.#.#.#.#",
      "#.#.#.#.#",
      "#...#...#",
      "#########",
    ],
  },
  {
    id: 4,
    chapter: 2,
    name: "Locked Gate",
    parMoves: 7,
    timeLimitSeconds: 0,
    grid: [
      "#########",
      "#o#.a.#.#",
      "#.#.#.#.#",
      "#.#A#.#.#",
      "#.#.#.#.#",
      "#...#...#",
      "#########",
    ],
  },
  {
    id: 5,
    chapter: 2,
    name: "Switch First",
    parMoves: 5,
    timeLimitSeconds: 0,
    grid: [
      "#######",
      "#o#...#",
      "#.#.#.#",
      "#A#.#.#",
      "#.#.#.#",
      "#.#.#.#",
      "#.#.#.#",
      "#.a.#.#",
      "#######",
    ],
  },
  {
    id: 6,
    chapter: 3,
    name: "In Order",
    parMoves: 7,
    timeLimitSeconds: 0,
    grid: [
      "#########",
      "#o#.a.#.#",
      "#.#.#.#.#",
      "#.#A#B#.#",
      "#.#.#.#.#",
      "#...#.b.#",
      "#########",
    ],
  },
  {
    id: 7,
    chapter: 4,
    name: "Crumble Run",
    parMoves: 7,
    timeLimitSeconds: 0,
    grid: [
      "#########",
      "#o#...#.#",
      "#.#.#.#.#",
      "#.#*#*#.#",
      "#.#.#.#.#",
      "#...#...#",
      "#########",
    ],
  },
  {
    id: 8,
    chapter: 5,
    name: "Beat the Clock",
    parMoves: 7,
    timeLimitSeconds: 70,
    grid: [
      "#########",
      "#o#.a.#.#",
      "#.#.#.#.#",
      "#.#A#B#.#",
      "#.#.#.#.#",
      "#...#.b.#",
      "#########",
    ],
  },
  {
    id: 9,
    chapter: 5,
    name: "Long Haul",
    parMoves: 9,
    timeLimitSeconds: 90,
    grid: [
      "###########",
      "#o#...#...#",
      "#.#.#.#.#.#",
      "#.#.#.#.#.#",
      "#.#.#.#.#.#",
      "#...#...#.#",
      "###########",
    ],
  },
];

export function levelById(id: number): LevelSpec | undefined {
  return LEVELS.find((l) => l.id === id);
}

export const TOTAL_LEVELS = LEVELS.length;
export const MAX_STARS = LEVELS.length * 3;
