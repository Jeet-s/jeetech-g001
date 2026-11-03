/// <reference types="node" />
/**
 * Level design toolkit + pacing tuner for Path Painter (60 levels, 6 chapters × 10).
 *
 *   npx tsx scripts/tune-levels.ts check [ids…]        facts per level: tiles, BFS-optimal strokes, branching,
 *                                                      true traps (first moves that can never win), report trap at
 *                                                      the level's botBudget, explored states, junctions/loops,
 *                                                      greedy success, casual/skilled bot win rates
 *   npx tsx scripts/tune-levels.ts tune [ids…] [--write] pick each level's botBudget for the target pacing curve
 *                                                      (same bots + same seeds as `npm run playtest`), and with
 *                                                      --write store botBudget, BFS-optimal solution and parMoves
 *                                                      back into src/game/levels.ts
 *   npx tsx scripts/tune-levels.ts show <id | grid-json> annotate the BFS-optimal solution stroke by stroke (keys,
 *                                                      doors, cracks, stops on shut doors / spent cracks)
 *   npx tsx scripts/tune-levels.ts gen --w= --h= …     design aid: generate + score candidate boards (see gen())
 *   npx tsx scripts/tune-levels.ts densify <id>        design aid: floor tiles that could become a crack safely
 *   npx tsx scripts/tune-levels.ts place '<grid>' --k=N  design aid: best spots + arrows for N turn pads on a drawn board
 *
 * The bots and seeds are the factory's (scripts/bots.ts): the start-state JSON a level is seeded with is built by
 * the real sim (src/game/sim.ts) with the candidate budget, so "tuned" and "playtested" give the same numbers. The
 * search itself runs on a fast bitmask copy of the PathEngine rules (verified against the real engine on every
 * stored solution).
 */
import { promises as fs } from "fs";
import path from "path";
import { PathEngine, type Direction, type LevelSpec } from "../src/game/PathEngine";
import { LEVELS } from "../src/game/levels";
import { sim, type Sim } from "../src/game/sim";
import { PERSONAS, playOnce, reseed } from "./bots";

const TRIALS = Number(process.env.PLAYTEST_TRIALS ?? 150);
const DIRS: Direction[] = ["up", "down", "left", "right"];
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/* ------------------------------------------------------------------ fast engine */

const WALL = 0, FLOOR = 1, SWITCH = 3, GATE = 4, CRUMBLE = 5, PAD = 6;
const PAD_DIR: Record<string, number> = { "^": 0, v: 1, "<": 2, ">": 3 };
interface Board { w: number; h: number; type: Int8Array; group: Int8Array; idx: Int16Array; target: number; start: number; pads: boolean }
interface St { pos: number; painted: bigint; count: number; open: number; moves: number }

export function boardOf(level: LevelSpec): Board {
  const h = level.grid.length;
  const w = level.grid.reduce((m, r) => Math.max(m, r.length), 0);
  const type = new Int8Array(w * h), group = new Int8Array(w * h).fill(-1), idx = new Int16Array(w * h).fill(-1);
  let target = 0, start = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = level.grid[y][x] ?? "#";
    const i = y * w + x;
    let t = WALL;
    if (c === "." ) t = FLOOR;
    else if (c === "o") { t = FLOOR; start = i; }
    else if (c === "*") t = CRUMBLE;
    else if (c in PAD_DIR) { t = PAD; group[i] = PAD_DIR[c]; }
    else if (c >= "A" && c <= "D") { t = SWITCH; group[i] = c.charCodeAt(0) - 65; }
    else if (c >= "a" && c <= "d") { t = GATE; group[i] = c.charCodeAt(0) - 97; }
    type[i] = t;
    if (t !== WALL) idx[i] = target++;
  }
  return { w, h, type, group, idx, target, start, pads: /[<>^v]/.test(level.grid.join("")) };
}

function startSt(b: Board): St {
  return { pos: b.start, painted: 1n << BigInt(b.idx[b.start]), count: 1, open: 0, moves: 0 };
}

function enterable(b: Board, s: { painted: bigint; open: number }, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return false;
  const i = y * b.w + x;
  const t = b.type[i];
  if (t === WALL) return false;
  if (t === GATE && !(s.open & (1 << b.group[i]))) return false;
  if (t === CRUMBLE && s.painted & (1n << BigInt(b.idx[i]))) return false;
  return true;
}

function canMove(b: Board, s: St, d: number): boolean {
  return enterable(b, s, (s.pos % b.w) + DX[d], Math.floor(s.pos / b.w) + DY[d]);
}

/** One roll from `s` in direction d, exactly as PathEngine.move: visits (cell index, heading on entry) in order. */
function walk(b: Board, s: St, d0: number, visit?: (i: number, d: number, cur: { painted: bigint; open: number }) => void) {
  let x = s.pos % b.w, y = Math.floor(s.pos / b.w), d = d0;
  const cur = { painted: s.painted, open: s.open };
  let count = s.count, steps = 0, looped = false;
  const seen = b.pads ? new Set<number>([s.pos * 4 + d]) : null;
  while (enterable(b, cur, x + DX[d], y + DY[d])) {
    x += DX[d]; y += DY[d];
    const i = y * b.w + x;
    visit?.(i, d, cur);
    const bit = 1n << BigInt(b.idx[i]);
    if (!(cur.painted & bit)) { cur.painted |= bit; count++; }
    if (b.type[i] === SWITCH) cur.open |= 1 << b.group[i];
    steps++;
    if (b.type[i] === PAD) d = b.group[i];
    if (seen) { const k = i * 4 + d; if (seen.has(k)) { looped = true; break; } seen.add(k); }
  }
  return { pos: y * b.w + x, painted: cur.painted, count, open: cur.open, steps, dir: d, looped };
}

function step(b: Board, s: St, d: number): St | null {
  const r = walk(b, s, d);
  if (!r.steps) return null;
  return { pos: r.pos, painted: r.painted, count: r.count, open: r.open, moves: s.moves + 1 };
}

const keyOf = (s: St) => `${s.pos}|${s.open}|${s.painted.toString(36)}`;

/** BFS shortest full cover from `from` (moves counted from `from.moves`), optional budget / state cap. */
function bfs(b: Board, from: St, budget = Infinity, cap = 400_000): { path: number[] | null; explored: number; capped: boolean } {
  if (from.count >= b.target) return { path: [], explored: 1, capped: false };
  const seen = new Map<string, { parent: string | null; dir: number }>([[keyOf(from), { parent: null, dir: -1 }]]);
  let frontier: St[] = [from];
  while (frontier.length && seen.size < cap) {
    const next: St[] = [];
    for (const s of frontier) {
      const ks = keyOf(s);
      for (let d = 0; d < 4; d++) {
        const t = step(b, s, d);
        if (!t) continue;
        if (t.count >= b.target) {
          const path = [d];
          let k: string | null = ks;
          while (k) { const e: { parent: string | null; dir: number } = seen.get(k)!; if (e.dir >= 0) path.unshift(e.dir); k = e.parent; }
          return { path, explored: seen.size, capped: false };
        }
        if (t.moves >= budget) continue;
        const kt = keyOf(t);
        if (seen.has(kt)) continue;
        seen.set(kt, { parent: ks, dir: d });
        next.push(t);
        if (seen.size >= cap) break;
      }
      if (seen.size >= cap) break;
    }
    frontier = next;
  }
  return { path: null, explored: seen.size, capped: seen.size >= cap };
}

/** Mirror of scripts/levels-report.ts (factory) on the fast engine: optimal, explored, report trap at `budget`. */
function reportFacts(b: Board, budget: number) {
  const CAP = 40_000;
  const main = bfs(b, startSt(b), budget, CAP);
  const s0 = startSt(b);
  let dead = 0, known = 0;
  for (let d = 0; d < 4; d++) {
    const t = step(b, s0, d);
    if (!t) continue;
    if (t.count >= b.target) { known++; continue; }
    if (t.moves >= budget) { dead++; known++; continue; }
    const r = bfs(b, t, budget, Math.floor(CAP / 4));
    if (r.capped) continue;
    known++;
    if (r.path === null) dead++;
  }
  return { optimal: main.path?.length ?? null, explored: main.explored, trap: known ? dead / known : null };
}

/** Per first move: optimal total strokes if taken (null = can never win). */
function firstMoveCosts(b: Board): (number | null | undefined)[] {
  const s0 = startSt(b);
  return [0, 1, 2, 3].map((d) => {
    const t = step(b, s0, d);
    if (!t) return undefined;
    const r = bfs(b, t);
    return r.path ? r.path.length + 1 : null;
  });
}

/** Deterministic greedy (most new paint, ties by DIRS order) — does the obvious play win, and in how many? */
function greedy(b: Board, limit: number): number | null {
  let s = startSt(b);
  for (let n = 0; n < limit; n++) {
    let best: St | null = null;
    for (let d = 0; d < 4; d++) {
      const t = step(b, s, d);
      if (t && (!best || t.count > best.count)) best = t;
    }
    if (!best) return null;
    s = best;
    if (s.count >= b.target) return s.moves;
  }
  return null;
}

/** Floor graph shape: junction cells (≥3 open neighbours) and independent loops (E − V + 1). */
function shape(b: Board) {
  let v = 0, e = 0, junctions = 0, dead = 0;
  for (let i = 0; i < b.type.length; i++) {
    if (b.type[i] === WALL) continue;
    v++;
    const x = i % b.w, y = Math.floor(i / b.w);
    let deg = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h && b.type[ny * b.w + nx] !== WALL) deg++;
    }
    if (deg >= 3) junctions++;
    if (deg === 1) dead++;
    e += deg;
  }
  return { tiles: v, junctions, deadEnds: dead, loops: e / 2 - v + 1 };
}

/* ------------------------------------------------------------------ bots, seeded like the playtest */

function fastSim(b: Board, budget: number): Sim<St, number> {
  return {
    levelCount: 1,
    start: () => startSt(b),
    moves: (s) => [0, 1, 2, 3].filter((d) => canMove(b, s, d)),
    apply: (s, d) => step(b, s, d) ?? s,
    status: (s) => (s.count >= b.target ? "won" : s.moves >= budget ? "lost" : "playing"),
    progress: (s) => s.count / b.target,
    describe: () => ({ grid: [], legend: [], intent: "", mechanics: [] }),
  };
}

/** Same seed + same move order + same progress values as scripts/playtest.ts → identical win rates. */
function rate(levelIndex: number, budget: number, persona: keyof typeof PERSONAS): number {
  const realStart = { ...sim.start(levelIndex), budget };
  const key = JSON.stringify(realStart)?.slice(0, 20000) ?? "";
  reseed(`${persona}|${TRIALS}|${key}`);
  const b = boardOf(LEVELS[levelIndex]);
  const fs_ = fastSim(b, budget);
  let wins = 0;
  for (let t = 0; t < TRIALS; t++) if (playOnce(fs_, startSt(b), PERSONAS[persona]).won) wins++;
  return wins / TRIALS;
}

function botRate(b: Board, budget: number, persona: keyof typeof PERSONAS, trials: number, key: string): number {
  reseed(`${persona}|${key}`);
  const s = fastSim(b, budget);
  let wins = 0;
  for (let t = 0; t < trials; t++) if (playOnce(s, startSt(b), PERSONAS[persona]).won) wins++;
  return wins / trials;
}

/* ------------------------------------------------------------------ pacing curve */

/**
 * Target casual first-try win rate for level n (1-based). A falling baseline (0.93 → 0.48) with deliberate
 * shape inside each chapter of ten: the teach level (1st) is easy, the breather (6th) eases off after the
 * twist, the finale (10th) is the chapter's peak.
 */
export function target(n: number): number {
  const base = 0.93 - 0.45 * ((n - 1) / 59);
  const k = ((n - 1) % 10) + 1;
  const bump: Record<number, number> = { 1: 0.1, 2: 0.05, 3: 0.03, 4: 0, 5: -0.02, 6: 0, 7: 0, 8: -0.03, 9: -0.05, 10: -0.08 };
  let b = bump[k];
  if (BREATHERS.includes(n)) b = 0.3; // breathers: clearly easier than both neighbours
  if (n === 51) b = 0.25; // the master chapter opens gently
  if (n === 41) b = 0.3; // the timer is taught on an already-known board
  let t = base + (n <= 10 ? Math.max(0, b) * 0.5 : b);
  // Chapter 1 after the first three: real but gentle (the review found 85-90 % everywhere too soft).
  if (n >= 4 && n <= 10 && !BREATHERS.includes(n)) t = 0.86 - 0.013 * (n - 4);
  if (n <= 3) t = Math.max(t, 0.92);
  // Late finales are set-pieces, not walls; the two short timed master levels are palate cleansers.
  const late: Record<number, number> = { 50: 0.55, 60: 0.48, 53: 0.62, 58: 0.56, 46: 0.9, 56: 0.88, 57: 0.56 };
  if (late[n] !== undefined) t = late[n];
  return Math.min(0.97, Math.max(0.3, t));
}
const BREATHERS = [6, 16, 26, 36, 46, 56];

/* ------------------------------------------------------------------ generator + annotator (design aid) */

let gseed = 1;
const grand = () => {
  gseed = (gseed + 0x6d2b79f5) | 0;
  let t = Math.imul(gseed ^ (gseed >>> 15), 1 | gseed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const gint = (n: number) => Math.floor(grand() * n);

/** Trim all-wall rows/columns beyond a one-tile border. */
function trim(rows: string[]): string[] {
  let r = rows.slice();
  while (r.length > 2 && !/[^#]/.test(r[1])) r.splice(1, 1);
  while (r.length > 2 && !/[^#]/.test(r[r.length - 2])) r.splice(r.length - 2, 1);
  const colEmpty = (c: number) => r.every((row) => row[c] === "#");
  while (r[0].length > 2 && colEmpty(1)) r = r.map((row) => row[0] + row.slice(2));
  while (r[0].length > 2 && colEmpty(r[0].length - 2)) r = r.map((row) => row.slice(0, -2) + row.slice(-1));
  return r;
}

/** One line per stroke of a solution: where it ends, new paint, and the events (keys, doors, cracks, stops). */
function annotate(level: LevelSpec, sol: Direction[]): string[] {
  const b = boardOf(level);
  let s = startSt(b);
  const out: string[] = [];
  const name = (i: number) => `(${i % b.w},${Math.floor(i / b.w)})`;
  for (const dir of sol) {
    const d = DIRS.indexOf(dir);
    const t = step(b, s, d)!;
    const ev: string[] = [];
    let turns = 0;
    const r = walk(b, s, d, (i, hd, cur) => {
      if (b.type[i] === SWITCH && !(cur.open & (1 << b.group[i]))) ev.push(`opens ${String.fromCharCode(65 + b.group[i])}`);
      if (b.type[i] === GATE) ev.push(`through ${String.fromCharCode(97 + b.group[i])}`);
      if (b.type[i] === CRUMBLE) ev.push("cracks *");
      if (b.type[i] === PAD) { ev.push(b.group[i] === hd ? `pad ${DIRS[b.group[i]]} (straight)` : `turns ${DIRS[b.group[i]]} on pad (${i % b.w},${Math.floor(i / b.w)})`); turns++; }
    });
    const nx = (r.pos % b.w) + DX[r.dir], ny = Math.floor(r.pos / b.w) + DY[r.dir];
    const ni = ny * b.w + nx;
    if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h) {
      if (b.type[ni] === GATE && !(t.open & (1 << b.group[ni]))) ev.push(`STOPS on shut gate ${String.fromCharCode(97 + b.group[ni])}`);
      if (b.type[ni] === CRUMBLE && s.painted & (1n << BigInt(b.idx[ni]))) ev.push("STOPS on spent crumble");
      if (b.type[ni] === CRUMBLE && !(s.painted & (1n << BigInt(b.idx[ni]))) && t.painted & (1n << BigInt(b.idx[ni]))) ev.push("STOPS on crumble spent this roll");
    }
    if (r.looped) ev.push("LOOP STOP");
    else if (b.type[r.pos] === PAD && turns) ev.push("STOPS on pad");
    void turns;
    const gained = t.count - s.count;
    if (!gained) ev.push("no new paint (reposition)");
    out.push(`${dir}→${name(t.pos)} +${gained}${ev.length ? " " + ev.join(", ") : ""}`);
    s = t;
  }
  return out;
}

interface GenSpec {
  copies?: number; need?: string; tpl?: string[]; mode?: string; fixedStart?: number;
  w: number; h: number; gates: number; crumbles: number; pads?: number; parMin: number; parMax: number; n: number; seed: number; density: number; top: number;
}

/** One random candidate board: carve walk, random rooms, or a template ('?' = random, '#' wall, else fixed). */
function genOne(spec: GenSpec): string[] {
  const W = spec.w + 2, H = spec.h + 2;
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("#"));
  if (spec.tpl && spec.mode === "carve") {
    // carve walk restricted to the template's '?' cells: a maze inside a silhouette
    const ok = (x: number, y: number) => spec.tpl![y]?.[x] === "?";
    const cellsT: [number, number][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ok(x, y)) cellsT.push([x, y]);
    let [x, y] = cellsT[gint(cellsT.length)];
    g[y][x] = ".";
    const segs = Math.round(cellsT.length / (1.2 + grand()));
    for (let k = 0; k < segs; k++) {
      const d = gint(4);
      const L = 1 + gint(Math.max(spec.w, spec.h));
      for (let j = 0; j < L; j++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!ok(nx, ny)) break;
        x = nx; y = ny; g[y][x] = ".";
      }
    }
  } else if (spec.tpl) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = spec.tpl[y]?.[x] ?? "#";
      g[y][x] = c === "?" ? (grand() < spec.density ? "." : "#") : c;
    }
    if (spec.tpl.join("").includes("o")) {
      const fs = g.flat().indexOf("o");
      g[Math.floor(fs / W)][fs % W] = ".";
      spec.fixedStart = fs;
    }
  } else if (spec.mode === "carve" || (spec.mode !== "rooms" && grand() < 0.5)) {
    let x = 1 + gint(spec.w), y = 1 + gint(spec.h);
    g[y][x] = ".";
    const segs = Math.round((spec.w * spec.h) / (2.2 + grand()));
    for (let k = 0; k < segs; k++) {
      const d = gint(4);
      const L = 1 + gint(Math.max(spec.w, spec.h));
      for (let j = 0; j < L; j++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 1 || ny < 1 || nx > spec.w || ny > spec.h) break;
        x = nx; y = ny; g[y][x] = ".";
      }
    }
  } else {
    for (let y = 1; y <= spec.h; y++) for (let x = 1; x <= spec.w; x++) if (grand() < spec.density) g[y][x] = ".";
  }
  // keep the largest 4-connected component
  const cells: number[] = [];
  for (let y = 1; y <= spec.h; y++) for (let x = 1; x <= spec.w; x++) if (g[y][x] !== "#") cells.push(y * W + x);
  if (cells.length < 4) return [];
  const comp = new Map<number, number>();
  let best = -1, bestSize = 0;
  for (const c of cells) {
    if (comp.has(c)) continue;
    const id = c, stack = [c];
    comp.set(c, id);
    let size = 0;
    while (stack.length) {
      const v = stack.pop()!;
      size++;
      for (let d = 0; d < 4; d++) {
        const u = v + DX[d] + DY[d] * W;
        if (g[Math.floor(u / W)][u % W] !== "#" && !comp.has(u)) { comp.set(u, id); stack.push(u); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const keep = cells.filter((c) => comp.get(c) === best);
  for (const c of cells) if (comp.get(c) !== best) g[Math.floor(c / W)][c % W] = "#";
  const deg = (c: number) => [0, 1, 2, 3].filter((d) => g[Math.floor((c + DX[d] + DY[d] * W) / W)][(c + DX[d] + DY[d] * W) % W] !== "#").length;
  const free = keep.filter((c) => g[Math.floor(c / W)][c % W] === ".");
  const fixedStart = spec.fixedStart;
  if (fixedStart !== undefined && !keep.includes(fixedStart)) return [];
  const take = (pred: (c: number) => boolean) => {
    const opts = free.filter(pred);
    if (!opts.length) return -1;
    const c = opts[gint(opts.length)];
    free.splice(free.indexOf(c), 1);
    return c;
  };
  const start = fixedStart !== undefined ? (free.splice(free.indexOf(fixedStart), 1), fixedStart) : take(() => true);
  const set = (c: number, ch: string) => { g[Math.floor(c / W)][c % W] = ch; };
  set(start, "o");
  for (let k = 0; k < spec.gates; k++) {
    const copies = k === 0 ? (spec.copies ?? 1) : 1;
    for (let j = 0; j < copies; j++) {
      const gate = take((c) => deg(c) === 2);
      if (gate < 0) return [];
      set(gate, String.fromCharCode(97 + k));
    }
    const sw = take(() => true);
    if (sw < 0) return [];
    set(sw, String.fromCharCode(65 + k));
  }
  for (let k = 0; k < spec.crumbles; k++) {
    const c = take((c) => deg(c) === 2);
    if (c < 0) return [];
    set(c, "*");
  }
  for (let k = 0; k < (spec.pads ?? 0); k++) {
    const c = take(() => true);
    if (c < 0) return [];
    // point the pad at an open neighbour (a pad facing a wall is just a stop)
    const open = [0, 1, 2, 3].filter((d) => { const u = c + DX[d] + DY[d] * W; return g[Math.floor(u / W)][u % W] !== "#"; });
    const d = grand() < 0.85 && open.length ? open[gint(open.length)] : gint(4);
    set(c, "^v<>"[d]);
  }
  return trim(g.map((r) => r.join("")));
}

function scoreBoard(grid: string[], spec: GenSpec) {
  const level: LevelSpec = { id: 0, chapter: 0, name: "gen", grid, parMoves: 0, timeLimitSeconds: 0 };
  const b = boardOf(level);
  const opt = bfs(b, startSt(b), Infinity, 60_000);
  if (!opt.path) return null;
  const par = opt.path.length;
  if (par < spec.parMin || par > spec.parMax) return null;
  const costs = firstMoveCosts(b).filter((c) => c !== undefined);
  if (costs.length < 2) return null;
  const trap = costs.filter((c) => c === null).length / costs.length;
  if (trap > 0.25) return null;
  const sh = shape(b);
  const fill = sh.tiles / ((b.w - 2) * (b.h - 2));
  const g = greedy(b, 60);
  const sol = opt.path.map((d) => DIRS[d]);
  const ann = annotate(level, sol);
  const stopGate = ann.filter((a) => a.includes("shut gate")).length;
  const stopCrumble = ann.filter((a) => a.includes("spent crumble")).length;
  const reposition = ann.filter((a) => a.includes("reposition")).length;
  const wasteFirsts = costs.filter((c) => c !== null && c > par).length;
  const optimalFirsts = costs.filter((c) => c === par).length;
  // mechanic relevance: par with the mechanic flattened to plain floor (-1 = impossible without it)
  let flatPar = par;
  if (/[A-Da-d*<>^v]/.test(grid.join(""))) {
    const flat = grid.map((r) => r.replace(/[A-Da-d*<>^v]/g, "."));
    const fb = boardOf({ ...level, grid: flat });
    flatPar = bfs(fb, startSt(fb), Infinity, 60_000).path?.length ?? -1;
  }
  let score = 0;
  score += g === null ? 3 : g > par ? 1.5 : 0;
  score += Math.min(sh.junctions, 8) * 0.4 + Math.min(sh.loops, 4) * 0.8;
  score += wasteFirsts * 0.8 + (optimalFirsts === 1 ? 1 : 0) + (costs.length >= 3 ? 0.7 : 0);
  score += stopGate * 1.5 + stopCrumble * 1.5;
  score += flatPar !== par ? 1.5 : 0;
  score -= Math.max(0, 0.6 - fill) * 10;
  score -= reposition * 1.5;
  return { grid, par, trap, sh, fill, greedy: g, sol, ann, score, flatPar, firsts: firstMoveCosts(b), bots: "" };
}

/**
 *   npx tsx scripts/tune-levels.ts gen --w=6 --h=5 [--mode=carve|rooms] [--tpl=row/row/…] [--gates=N --copies=K]
 *     [--crumbles=N] [--pads=N] --parMin= --parMax= [--n=] [--seed=] [--need=flat,stopGate,stopCrumble,noStopGate,noStopCrumble,turn,padStop,allPads,
 *     chain,chute,crack,crossLast,loop,waste] [--maxFirsts=] [--maxRepos=] [--waste=] [--greedyFail]
 *     [--casMin= --skMin= --gap= --bmax=]
 */
function gen(args: string[]) {
  const num = (k: string, d: number) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split("=")[1]) : d; };
  const spec: GenSpec = {
    w: num("w", 5), h: num("h", 5), gates: num("gates", 0), crumbles: num("crumbles", 0), pads: num("pads", 0),
    tpl: args.find((x) => x.startsWith("--tpl="))?.slice(6).split("/"),
    mode: args.find((x) => x.startsWith("--mode="))?.slice(7),
    need: args.find((x) => x.startsWith("--need="))?.slice(7),
    copies: num("copies", 1),
    parMin: num("parMin", 4), parMax: num("parMax", 30), n: num("n", 2000), seed: num("seed", 1), density: num("density", 0.65), top: num("top", 6),
  };
  gseed = spec.seed;
  if (spec.tpl) { spec.h = spec.tpl.length - 2; spec.w = spec.tpl[0].length - 2; }
  const greedyFail = args.includes("--greedyFail");
  const seen = new Set<string>();
  const found: NonNullable<ReturnType<typeof scoreBoard>>[] = [];
  for (let k = 0; k < spec.n; k++) {
    const grid = genOne(spec);
    if (!grid.length) continue;
    const key = grid.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    const r = scoreBoard(grid, spec);
    if (!r || (greedyFail && r.greedy !== null)) continue;
    const need = (spec.need ?? "").split(",").filter(Boolean);
    const ann = r.ann.join(" ");
    if (need.includes("stopGate") && !ann.includes("shut gate")) continue;
    if (need.includes("stopCrumble") && !ann.includes("spent crumble")) continue;
    if (need.includes("flat") && r.flatPar === r.par) continue;
    if (need.includes("essential") && r.flatPar !== -1) continue;
    if (need.includes("padGate") && !padNext(r.grid, /[a-d]/)) continue;
    if (need.includes("padCrack") && !padNext(r.grid, /[*]/)) continue;
    if (need.includes("waste") && !r.firsts.some((c) => c != null && c > r.par)) continue;
    if (need.includes("loop") && r.sh.loops < 1) continue;
    if (need.includes("noStopGate") && ann.includes("shut gate")) continue;
    if (need.includes("chain") && !(ann.indexOf("through a") >= 0 && ann.indexOf("opens B") > ann.indexOf("through a"))) continue;
    if (need.includes("crack") && !ann.includes("cracks")) continue;
    if (need.includes("turn") && !ann.includes("turns ")) continue;
    if (ann.includes("LOOP STOP")) continue;
    if (/[>][^#<]*[<]/.test(r.grid.join("|")) || r.grid[0].split("").some((_, x) => /v[^#^]*\^/.test(r.grid.map((row) => row[x]).join("")))) continue; // facing pads = ping-pong
    if (need.includes("padStop") && !ann.includes("STOPS on pad")) continue;
    if (need.includes("chain2") && !r.ann.some((a) => (a.match(/turns /g) ?? []).length >= 2)) continue;
    if (need.includes("allPads") && /[<>^v]/.test(r.grid.join("")) && !allPadsTurn(r.grid, r.ann)) continue;
    if (need.includes("noStopCrumble") && ann.includes("spent crumble")) continue;
    if (need.includes("chute") && !r.ann.some((a) => /opens ([A-D]).*through \1/i.test(a.replace(/through ([a-d])/g, (_m, g) => `through ${g.toUpperCase()}`)))) continue;
    if (need.includes("crossLast") && !r.ann[r.ann.length - 1].includes("cracks")) continue;
    const legal = r.firsts.filter((c) => c !== undefined);
    if (legal.length > num("maxFirsts", 4) || legal.length < num("minFirsts", 2)) continue;
    const repos = r.ann.filter((a) => a.includes("reposition")).length;
    if (repos > num("maxRepos", 99)) continue;
    const waste = num("waste", 0);
    if (waste > 0 && (!legal.every((c) => c === r.par || (c !== null && c! >= r.par + waste)) || !legal.some((c) => c !== null && c! > r.par))) continue;
    const casMin = num("casMin", 0), skMin = num("skMin", 0);
    if (casMin > 0 || skMin > 0) {
      const b = boardOf({ id: 0, chapter: 0, name: "", grid: r.grid, parMoves: 0, timeLimitSeconds: 0 });
      const bmax = num("bmax", 2 * r.par + 4);
      const bmid = Math.round(1.5 * r.par) + 2;
      const gap = num("gap", -1);
      if (gap > -1) {
        const cm = botRate(b, bmid, "casual", 80, r.grid.join("")), sm = botRate(b, bmid, "skilled", 80, r.grid.join(""));
        if (sm - cm < gap) continue;
      }
      const cr = botRate(b, bmax, "casual", 80, r.grid.join(""));
      if (cr < casMin) continue;
      const sr = botRate(b, bmax, "skilled", 80, r.grid.join(""));
      if (sr < skMin) continue;
      r.bots = `c${cr.toFixed(2)} s${sr.toFixed(2)} @${bmax}; c${botRate(b, r.par + 2, "casual", 80, r.grid.join("")).toFixed(2)} @${r.par + 2}`;
      r.score += cr + sr;
    }
    found.push(r);
  }
  found.sort((a, b) => b.score - a.score);
  for (const r of found.slice(0, spec.top)) {
    console.log(`\n${r.bots} score ${r.score.toFixed(1)} par ${r.par} flat ${r.flatPar} greedy ${r.greedy ?? "fail"} J${r.sh.junctions} L${r.sh.loops} D${r.sh.deadEnds} tiles ${r.sh.tiles} fill ${r.fill.toFixed(2)} firsts ${r.firsts.map((c, d) => (c === undefined ? "" : DIRS[d][0] + (c ?? "X"))).join(" ")}`);
    console.log(`  grid: ${JSON.stringify(r.grid)},`);
    for (const row of r.grid) console.log("    " + row);
    console.log("  " + r.ann.join(" | "));
  }
  console.log(`\n${found.length} solvable candidates of ${spec.n}`);
}

/** Some pad's arrow points straight at a tile matching `re` (a door / a crack) within 2 tiles. */
function padNext(grid: string[], re: RegExp): boolean {
  const d: Record<string, [number, number]> = { "^": [0, -1], v: [0, 1], "<": [-1, 0], ">": [1, 0] };
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    const v = d[grid[y][x]];
    if (!v) continue;
    for (let k = 1; k <= 2; k++) { const c = grid[y + v[1] * k]?.[x + v[0] * k] ?? "#"; if (re.test(c)) return true; if (c === "#") break; }
  }
  return false;
}

/** Every pad on the board bends the optimal route at least once (no decorative pads). */
function allPadsTurn(grid: string[], ann: string[]): boolean {
  const text = ann.join(" ");
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++)
    if ("<>^v".includes(grid[y][x]) && !text.includes(`on pad (${x},${y})`)) return false;
  return true;
}

/** Annotate a raw grid (JSON) or a level id — design aid. */
function show(arg: string) {
  const level: LevelSpec = /^\d+$/.test(arg) ? LEVELS.find((l) => l.id === Number(arg))! : { id: 0, chapter: 0, name: "raw", grid: JSON.parse(arg), parMoves: 0, timeLimitSeconds: 0 };
  const r = scoreBoard(level.grid, { w: 0, h: 0, gates: 0, crumbles: 0, parMin: 0, parMax: 999, n: 0, seed: 0, density: 0, top: 0 });
  if (!r) { const b = boardOf(level); const o = bfs(b, startSt(b)); console.log("unsolvable or trap > 0.25 / branching < 2"); console.log("par", o.path?.length ?? "none", "firsts", firstMoveCosts(b)); return; }
  console.log(`score ${r.score.toFixed(1)} par ${r.par} flat ${r.flatPar} greedy ${r.greedy ?? "fail"} J${r.sh.junctions} L${r.sh.loops} D${r.sh.deadEnds} tiles ${r.sh.tiles} firsts ${r.firsts.map((c, d) => (c === undefined ? "" : DIRS[d][0] + (c ?? "X"))).join(" ")}`);
  for (const row of r.grid) console.log("    " + row);
  console.log("  " + r.ann.join("\n  "));
}

/** Design aid: which single floor tile could become a crack without breaking the level (par +0/+1, no traps)? */
function densify(id: number) {
  const level = LEVELS.find((l) => l.id === id)!;
  const b0 = boardOf(level);
  const par0 = bfs(b0, startSt(b0)).path!.length;
  for (let y = 0; y < level.grid.length; y++) for (let x = 0; x < level.grid[y].length; x++) {
    if (level.grid[y][x] !== ".") continue;
    const grid = level.grid.map((r, yy) => (yy === y ? r.slice(0, x) + "*" + r.slice(x + 1) : r));
    const lv = { ...level, grid };
    const b = boardOf(lv);
    const o = bfs(b, startSt(b), Infinity, 200_000);
    if (!o.path || o.path.length > par0 + 1) continue;
    const firsts = firstMoveCosts(b);
    if (firsts.some((c) => c === null)) continue;
    const ann = annotate(lv, o.path.map((d) => DIRS[d]));
    const repos = ann.filter((a) => a.includes("reposition")).length;
    const bud = (level.botBudget ?? par0 + 4) + (o.path.length - par0);
    const c = botRate(b, bud, "casual", 100, grid.join("")), sk = botRate(b, bud, "skilled", 100, grid.join(""));
    console.log(`(${x},${y}) par ${o.path.length} repos ${repos} firsts ${firsts.map((v, d) => (v === undefined ? "" : DIRS[d][0] + v)).join(" ")} c${c.toFixed(2)} s${sk.toFixed(2)} | ${ann.filter((a) => a.includes("crumble") || a.includes("cracks")).join(" ; ")}`);
  }
}

/**
 * Design aid: place k turn pads on a hand-drawn board (every floor cell × 4 arrows, exhaustively for k ≤ 2) and
 * rank the placements: every pad must bend the optimal route, no ping-pong loops, no true traps, par in range.
 *   npx tsx scripts/tune-levels.ts place '<grid-json>' --k=2 --parMin= --parMax= [--top=] [--waste=2] [--padStop]
 */
function place(args: string[]) {
  const num = (k: string, d: number) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split("=")[1]) : d; };
  const grid0: string[] = JSON.parse(args[0]);
  const k = num("k", 1), parMin = num("parMin", 1), parMax = num("parMax", 99), top = num("top", 8), waste = num("waste", 0);
  const cells: [number, number][] = [];
  grid0.forEach((r, y) => [...r].forEach((c, x) => { if (c === ".") cells.push([x, y]); }));
  const opts: [number, number, string][] = cells.flatMap(([x, y]) => [..."^v<>"].map((a) => [x, y, a] as [number, number, string]));
  const combos: [number, number, string][][] = [];
  if (k === 1) opts.forEach((o) => combos.push([o]));
  else for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) {
    if (opts[i][0] === opts[j][0] && opts[i][1] === opts[j][1]) continue;
    if (k === 2) combos.push([opts[i], opts[j]]);
    else for (let m = j + 1; m < opts.length; m++) {
      const c = [opts[i], opts[j], opts[m]];
      if (new Set(c.map((o) => `${o[0]},${o[1]}`)).size === 3 && gint(30) === 0) combos.push(c);
    }
  }
  const spec = { w: 0, h: 0, gates: 0, crumbles: 0, parMin, parMax, n: 0, seed: 0, density: 0, top: 0 };
  const flat0 = boardOf({ id: 0, chapter: 0, name: "", grid: grid0, parMoves: 0, timeLimitSeconds: 0 });
  const flatPar = bfs(flat0, startSt(flat0), Infinity, 200_000).path?.length ?? -1;
  const found: { grid: string[]; score: number; line: string; ann: string[] }[] = [];
  for (const combo of combos) {
    const grid = grid0.map((r, y) => [...r].map((c, x) => combo.find((o) => o[0] === x && o[1] === y)?.[2] ?? c).join(""));
    if (/[>][^#<]*[<]/.test(grid.join("|")) || grid[0].split("").some((_, x) => /v[^#^]*\^/.test(grid.map((row) => row[x] ?? "#").join("")))) continue;
    const r = scoreBoard(grid, spec);
    if (!r) continue;
    const text = r.ann.join(" ");
    if (text.includes("LOOP STOP") || !allPadsTurn(grid, r.ann)) continue;
    if (args.includes("--padStop") && !text.includes("STOPS on pad")) continue;
    if (r.firsts.some((c) => c === null)) continue;
    const legal = r.firsts.filter((c) => c !== undefined) as number[];
    if (waste > 0 && !legal.some((c) => c >= r.par + waste)) continue;
    const repos = r.ann.filter((a) => a.includes("reposition")).length;
    const score = r.score + (r.par - flatPar) * 0.5 - repos;
    found.push({ grid, score, ann: r.ann, line: `score ${score.toFixed(1)} par ${r.par} (flat ${flatPar}) firsts ${r.firsts.map((c, d) => (c === undefined ? "" : DIRS[d][0] + (c ?? "X"))).join(" ")} repos ${repos}` });
  }
  found.sort((a, b) => b.score - a.score);
  for (const f of found.slice(0, top)) {
    console.log(`\n${f.line}\n  ${JSON.stringify(f.grid)}`);
    for (const row of f.grid) console.log("    " + row);
    console.log("  " + f.ann.join(" | "));
  }
  console.log(`\n${found.length} placements (flat par ${flatPar})`);
}

/* ------------------------------------------------------------------ commands */

function solutionOK(level: LevelSpec): boolean {
  if (!level.solution) return false;
  const e = new PathEngine(level);
  for (const d of level.solution) e.move(d);
  return e.status === "won";
}

async function writeBack(updates: Map<number, { budget: number; solution: Direction[] }>) {
  const file = path.join(__dirname, "../src/game/levels.ts");
  let src = await fs.readFile(file, "utf8");
  for (const [id, u] of updates) {
    const re = new RegExp(`(\\{ id: ${id}, [^\\n]*?parMoves: )\\d+(, timeLimitSeconds: \\d+, botBudget: )\\d+([\\s\\S]*?solution: )\\[[^\\]]*\\]`);
    if (!re.test(src)) { console.error(`L${id}: block not found`); continue; }
    src = src.replace(re, `$1${u.solution.length}$2${u.budget}$3[${u.solution.map((d) => `"${d}"`).join(", ")}]`);
  }
  await fs.writeFile(file, src);
}

async function main() {
  const [cmd = "check", ...rest] = process.argv.slice(2);
  if (cmd === "gen") return gen(rest);
  if (cmd === "place") return place(rest);
  if (cmd === "show") { for (const a of rest) show(a); return; }
  if (cmd === "densify") { densify(Number(rest[0])); return; }
  const write = rest.includes("--write");
  const ids = rest.filter((a) => /^\d+(-\d+)?$/.test(a)).flatMap((a) => {
    const [lo, hi] = a.split("-").map(Number);
    return Array.from({ length: (hi ?? lo) - lo + 1 }, (_, k) => lo + k);
  });
  const pick = LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => !ids.length || ids.includes(l.id));
  const updates = new Map<number, { budget: number; solution: Direction[] }>();

  for (const { l, i } of pick) {
    const b = boardOf(l);
    const opt = bfs(b, startSt(b));
    if (!opt.path) { console.log(`L${l.id} ${l.name}: UNSOLVABLE (${opt.capped ? "capped" : "no cover"})`); continue; }
    const par = opt.path.length;
    const sol = opt.path.map((d) => DIRS[d]);
    const costs = firstMoveCosts(b);
    const firsts = costs.filter((c) => c !== undefined);
    const trueTrap = firsts.filter((c) => c === null).length / firsts.length;
    const sh = shape(b);
    const g = greedy(b, 60);
    const costStr = costs.map((c, d) => (c === undefined ? "" : `${DIRS[d][0]}${c ?? "X"}`)).filter(Boolean).join(" ");

    let budget = l.botBudget ?? par + 3;
    if (cmd === "tune") {
      const want = target(l.id);
      let best: { budget: number; casual: number } | null = null;
      for (let bud = par; bud <= par + 30; bud++) {
        const rf = reportFacts(b, bud);
        if (rf.trap !== null && rf.trap > 0.25) continue; // the report's trap reads first moves that can't fit the budget
        const casual = rate(i, bud, "casual");
        // first budget that reaches the target (never undershoot a breather); else the closest seen
        if (casual >= want - 0.02) { best = { budget: bud, casual }; break; }
        if (!best || Math.abs(casual - want) < Math.abs(best.casual - want) - 1e-9) best = { budget: bud, casual };
      }
      budget = best?.budget ?? par + 3;
      updates.set(l.id, { budget, solution: sol });
    }
    const rf = reportFacts(b, budget);
    const casual = rate(i, budget, "casual");
    const skilled = rate(i, budget, "skilled");
    const stored = solutionOK(l) && (l.solution?.length ?? 0) === par && l.parMoves === par ? "" : " [stale sol/par]";
    console.log(
      `L${String(l.id).padStart(2)} ${l.name.padEnd(18)} ${b.w - 2}x${b.h - 2} tiles ${String(sh.tiles).padStart(2)} J${sh.junctions} L${sh.loops} D${sh.deadEnds}` +
        ` | par ${String(par).padStart(2)} first[${costStr}] trueTrap ${trueTrap.toFixed(2)} greedy ${g ?? "fail"}` +
        ` | budget ${budget} rTrap ${rf.trap === null ? "?" : rf.trap.toFixed(2)} expl ${rf.explored}` +
        ` | casual ${casual.toFixed(2)} (tgt ${target(l.id).toFixed(2)}) skilled ${skilled.toFixed(2)}${stored}`,
    );
  }
  if (write && updates.size) {
    await writeBack(updates);
    console.log(`wrote ${updates.size} level(s) to src/game/levels.ts`);
  }
}

main();
