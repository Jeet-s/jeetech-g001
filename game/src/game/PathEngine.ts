/**
 * Path Painter — roller-splat style paint engine.
 *
 * The player sits on a `start` tile. A swipe moves the brush in one orthogonal
 * direction until it is blocked (wall, closed gate, or a crumble tile it already
 * used); a turn pad it rolls onto bends it to the pad's arrow. Every tile it
 * rolls over gets painted. Win when every non-wall tile is
 * painted. This keeps paths strictly orthogonal (no diagonal leaks — QA gate)
 * and makes undo/reset trivial because every stroke is a discrete move.
 *
 * Tile legend used by levels.ts grids:
 *   '#' wall / void (blocks, not paintable)
 *   ' ' empty void (same as wall, used for non-rectangular boards)
 *   '.' floor (paintable)
 *   'o' start (paintable, brush begins here)
 *   'A'..'D' switch — paintable; painting it opens every gate of the same letter
 *   'a'..'d' gate — blocks until its switch is painted, then becomes paintable
 *   '*' crumble floor — paintable, but can only be rolled over once
 *   '>' '<' '^' 'v' turn pad — paintable floor; a brush that ROLLS ONTO it turns
 *       to the pad's direction and keeps rolling (if the next tile that way is
 *       blocked it stops on the pad). A brush resting on a pad leaves it in the
 *       swiped direction as normal — a pad only acts on entry. Pads can be
 *       entered any number of times; a roll that would repeat the same
 *       (tile, direction) — a closed pad loop — stops right there.
 */

export type TileType = "wall" | "floor" | "start" | "switch" | "gate" | "crumble" | "pad";

export interface Tile {
  type: TileType;
  /** Pairing letter for switch/gate (uppercase normalised). */
  group?: string;
  /** Turn pad direction. */
  dir?: Direction;
}

/** One tile a roll entered, with the direction the brush was moving as it entered. */
export interface PathStep {
  x: number;
  y: number;
  dir: Direction;
}

export interface LevelSpec {
  id: number;
  chapter: number;
  name: string;
  grid: string[];
  /** Target stroke count for 3 stars. */
  parMoves: number;
  /** 0 = untimed. */
  timeLimitSeconds: number;
  /** Short teaching tip shown on early / new-mechanic levels. */
  hint?: string;
  /**
   * A proven full-cover stroke sequence for this board (BFS-optimal). Replayed
   * by scripts/validate.ts through the real engine to prove the level solvable
   * and to measure its difficulty (stroke count + hazard weight).
   */
  solution?: Direction[];
  /**
   * Swipe budget a fair attempt is expected to fit in — the bot playtesters
   * (src/game/sim.ts) count a run lost once it exceeds this. Tuned per level
   * with scripts/tune-levels.ts to shape the difficulty curve. Not surfaced in
   * the untimed UI (there you only ever earn fewer stars), so save data and the
   * player experience are unaffected.
   */
  botBudget?: number;
}

export type Direction = "up" | "down" | "left" | "right";
export type GameStatus = "playing" | "won" | "lost";

interface Snapshot {
  painted: string[];
  openGroups: string[];
  cursorX: number;
  cursorY: number;
  moves: number;
}

const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const PAD_DIRS: Record<string, Direction> = { ">": "right", "<": "left", "^": "up", v: "down" };

function parseTile(ch: string): Tile {
  if (ch === "." ) return { type: "floor" };
  if (PAD_DIRS[ch]) return { type: "pad", dir: PAD_DIRS[ch] };
  if (ch === "o") return { type: "start" };
  if (ch === "*") return { type: "crumble" };
  if (ch >= "A" && ch <= "D") return { type: "switch", group: ch };
  if (ch >= "a" && ch <= "d") return { type: "gate", group: ch.toUpperCase() };
  return { type: "wall" };
}

const key = (x: number, y: number) => `${x},${y}`;

export class PathEngine {
  readonly level: LevelSpec;
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[][]; // [y][x]
  /** Total paintable (non-wall) tiles — the win target. */
  readonly target: number;

  painted = new Set<string>();
  openGroups = new Set<string>();
  cursorX = 0;
  cursorY = 0;
  moves = 0;
  status: GameStatus = "playing";
  /** Every tile the last committed roll entered, in order (bends included) — the UI animates along it. */
  lastPath: PathStep[] = [];

  private history: Snapshot[] = [];

  constructor(level: LevelSpec) {
    this.level = level;
    this.height = level.grid.length;
    this.width = level.grid.reduce((m, r) => Math.max(m, r.length), 0);
    this.tiles = [];
    let target = 0;
    let startX = 0;
    let startY = 0;
    for (let y = 0; y < this.height; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < this.width; x++) {
        const ch = level.grid[y][x] ?? "#";
        const tile = parseTile(ch);
        row.push(tile);
        if (tile.type !== "wall") target++;
        if (tile.type === "start") {
          startX = x;
          startY = y;
        }
      }
      this.tiles.push(row);
    }
    this.target = target;
    this.cursorX = startX;
    this.cursorY = startY;
    this.painted.add(key(startX, startY));
  }

  tileAt(x: number, y: number): Tile | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.tiles[y][x];
  }

  isPainted(x: number, y: number): boolean {
    return this.painted.has(key(x, y));
  }

  get paintedCount(): number {
    return this.painted.size;
  }

  get fillPercent(): number {
    return this.target === 0 ? 0 : Math.round((this.painted.size / this.target) * 100);
  }

  /** Whether the brush could leave the current tile in `dir` at all. */
  canMove(dir: Direction): boolean {
    const { dx, dy } = DELTAS[dir];
    return this.enterable(this.cursorX + dx, this.cursorY + dy);
  }

  private enterable(x: number, y: number): boolean {
    const t = this.tileAt(x, y);
    if (!t || t.type === "wall") return false;
    if (t.type === "gate" && !(t.group && this.openGroups.has(t.group))) return false;
    // A crumble tile can only ever be rolled over once.
    if (t.type === "crumble" && this.isPainted(x, y)) return false;
    return true;
  }

  /** Roll the brush until blocked (turn pads bend the roll). Returns the resulting status. */
  move(dir: Direction): GameStatus {
    if (this.status !== "playing") return this.status;
    let d = dir;
    let x = this.cursorX;
    let y = this.cursorY;
    const path: PathStep[] = [];
    const snap = this.snapshot();
    // Loop guard: a pad cycle repeats a (tile, heading) pair — the roll ends there.
    const seen = new Set<string>([`${x},${y},${d}`]);

    for (;;) {
      const { dx, dy } = DELTAS[d];
      if (!this.enterable(x + dx, y + dy)) break;
      x += dx;
      y += dy;
      this.painted.add(key(x, y));
      const t = this.tiles[y][x];
      if (t.type === "switch" && t.group) this.openGroups.add(t.group);
      path.push({ x, y, dir: d });
      if (t.type === "pad" && t.dir) d = t.dir;
      const k = `${x},${y},${d}`;
      if (seen.has(k)) break;
      seen.add(k);
    }

    if (path.length === 0) return this.status; // nothing moved — don't cost a move
    this.cursorX = x;
    this.cursorY = y;
    this.moves++;
    this.lastPath = path;
    this.history.push(snap);

    if (this.painted.size >= this.target) this.status = "won";
    return this.status;
  }

  /** The tiles a swipe in `dir` would roll over from here (bends included), without committing it. */
  peek(dir: Direction): PathStep[] {
    if (this.status !== "playing") return [];
    const before = this.moves;
    const last = this.lastPath;
    this.move(dir);
    if (this.moves === before) return [];
    const path = this.lastPath;
    this.undo();
    this.lastPath = last;
    return path;
  }

  /** Called by the timer. Marks the level lost when time runs out. */
  timeUp(): void {
    if (this.status === "playing") this.status = "lost";
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): void {
    const snap = this.history.pop();
    if (!snap) return;
    this.painted = new Set(snap.painted);
    this.openGroups = new Set(snap.openGroups);
    this.cursorX = snap.cursorX;
    this.cursorY = snap.cursorY;
    this.moves = snap.moves;
    this.status = "playing";
    this.lastPath = [];
  }

  reset(): void {
    this.painted = new Set();
    this.openGroups = new Set();
    this.moves = 0;
    this.status = "playing";
    this.history = [];
    this.lastPath = [];
    // re-find start
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x].type === "start") {
          this.cursorX = x;
          this.cursorY = y;
        }
      }
    }
    this.painted.add(key(this.cursorX, this.cursorY));
  }

  /** Stars for a win: 3 at/under par, 2 within par+2, else 1. */
  starsForMoves(): number {
    if (this.status !== "won") return 0;
    if (this.moves <= this.level.parMoves) return 3;
    if (this.moves <= this.level.parMoves + 2) return 2;
    return 1;
  }

  private snapshot(): Snapshot {
    return {
      painted: [...this.painted],
      openGroups: [...this.openGroups],
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      moves: this.moves,
    };
  }
}
