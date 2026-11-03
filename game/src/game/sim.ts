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
  1: "Teach. The one verb: a swipe rolls the brush until a wall stops it, painting every tile it crosses. Two dead-end columns joined by a bottom corridor. Aha: one swipe paints a whole corridor — up first, back down, then sweep the base and climb the right column (4). Down first just costs an extra swipe.",
  2: "Teach (first choice). A 3x3 ring round a pillar with a one-tile spur under the start. Aha: the spur is a dead end, so make it the finish — roll right first and the ring ends by dropping straight into the spur (4); rolling up or down first leaves the spur for a 5th swipe.",
  3: "Practise (staircase). A diagonal staircase of short steps; the brush can only stop where a step turns. Aha: climb first and work down from the top — up, west, up into the top step, then down and east along the third row, finishing with the drop to the bottom step (6). Going east first leaves the top steps behind and costs 2 swipes.",
  4: "Practise (cap, loop and tail). A four-tile loop hangs under the start row, with a two-tile cap above the start and a one-tile tail on the west. Aha: the biggest-looking roll is wrong — go up into the cap first, run round the loop clockwise, and the climb of its west side stops right beside the tail, which is the last tile (6). Starting east or west strands the cap or the tail and costs 2 swipes.",
  5: "Twist. Three prongs hang off a bottom bar, start in the middle; the top-left corner links the left and middle prongs. Aha: go UP the middle prong first — then one chain sweeps west, down, across and up the east prong (5). The obvious sideways start wastes 1-2 swipes.",
  6: "Breather after the twist: a hook — a 3-wide arch over a long floor, the start in the arch's short east leg. Aha: drop down the leg first, climb back, and the arch, the west leg and the floor follow in three long rolls (5). Up first costs a swipe.",
  7: "Practise (crossroads). A plus-shaped board: a small ring on top, a long south arm and a short east stub off a two-row middle. Aha: east first — the wall east of the middle row stops you right on the south arm's column, so the arm is ridden down and back up into the ring; the ring's west column drops you into the bottom row for the last sweep, which ends by climbing the east stub (8). Down first costs 2 swipes.",
  8: "Practise (arch over a floor). An arch rises from a two-row floor; a one-tile nook sits above the floor's west end. Aha: step up first — the upper floor row ends at the arch's west leg, which carries you over the arch and down its east leg to the bottom row; one long roll west then ends under the nook (7). Rolling west first costs 2.",
  9: "Practise (two wings). A 2-wide west tower and a 2x2 east wing hang off a two-row floor. Aha: drop first and ride row 4 all the way east; the east wing is cleared with four short rolls that end in the floor's south-east corner, and the long roll west sets up the final climb of the tower's second lane (8). East first costs 2 swipes.",
  10: "Finale (Basics). The chapter's biggest board (32 tiles): a top corridor and an east shaft wrap a two-row cellar, linked by the long west column. Aha: go west along the start row first — then the corridor, the shaft and the cellar's upper row chain together, the west column is climbed once to close the corner, and the cellar's lower row is saved for last, ending with a hop up into the notch beside the shaft (10). Up first wastes 2 swipes.",

  11: "Teach (switch & gate). Key A sits in the bottom corridor's west arm; its door a is the bottom-east corner tile. Aha: a door is a wall until its key is painted — swing west through A first, and only then can the brush roll east onto the door and up the east column (6).",
  12: "Practise (a door opens mid-roll). Key A and door a sit side by side in the floor row, the key east of its door. Aha: the floor is entered from the east shaft, so the roll west paints A and passes a in the same stroke — the door opens under the brush; the middle column then climbs back into the top room (7). Rolling east first or up costs a swipe.",
  13: "Practise (key in the far corner). Key A is the west end of row 2, with nothing near it to stop on; door a is the corner above it. Aha: clear the 2-wide east shaft first (down, east, up); then the shut door stops the top-row roll one tile short, you drop to row 2, sweep it east and back west into the key, and the last step up passes the door (8). Wrong starts cost a swipe.",
  14: "Practise (fetch and return). Key A sits at the bottom of a dead-end shaft under the room's east side; door a is the west end of the room's bottom row. Aha: of four plausible starts one is best — sweep the start row west and back, dive the shaft for A, climb to the top row, and the open door lets the west wall carry you into the bottom row for the last sweep (7). Wrong starts cost 1-3 swipes.",
  15: "Twist: a shut door is also a wall. The middle row has no wall to stop on — except door a, which pins the brush on row 2 when you roll down the east column while it is still shut. Aha: use the door as a stop, paint key A along row 2, then the same door lets you down to the south-east (7). Without the shut door the board is impossible.",
  16: "Breather: a 14-tile room around a pillar, door a in the south-east corner, key A just north of it. Aha: the first roll east stops on the shut door — exactly under the key's column — so the climb paints A, and the loop round the pillar ends through the open door (6).",
  17: "Practise (one key, two doors). Twin a-doors close both top corners; key A sits right under the east one. Aha: climb the middle column first — the shut west door stops the top-row roll one tile short of the corner, so you can drop down column 2 and step across to the key's column; that climb paints A and passes the east door, and the same key has opened the west door for the final drop down the west wall (8).",
  18: "Combine (key on the way down, door on the way up). Key A is directly below the start; door a seals the east column of a U-shaped underpass. Aha: drop through A first, ride the underpass round, and climb the east column through the now-open door into the top room, which is swept west and back (8). The obvious east first costs 2 swipes.",
  19: "Combine (a door as a stop, then as a path). Two a-doors: one ends the top row, the other sits just west of the start; key A is the west end of row 2. Aha: the shut top door is the only thing that stops a climb of the east column on row 2 — use it, sweep row 2 west through the key, and both doors open: step down through the start-row door, climb, run the top row through the other door and finish in the south-east tail (7). Up first costs 2 swipes.",
  20: "Finale (Switches & Gates). A 32-tile set-piece: a top corridor over a central hall and a U-shaped cellar, with two a-doors (the corridor's east end and the west column under it) and key A mid-corridor. Aha: climb the stub to the corridor; the long roll east paints A and passes the corner door in one stroke; the west door then links the corridor to the hall, and the cellar U is ridden last (11). All four starts are playable (three optimal, east costs 1) — the challenge is the order, not a guess.",

  21: "Teach (two colours). Two independent locks stacked in the west column (a above b); both keys sit together at the top of the east dead-end column. Aha: each key opens only its own door — fetch both keys, climb back out of the dead end, and drop down to roll up through b and a in one stroke (8).",
  22: "Practise (two colours on one wall). Keys B and A are stacked in the west column; door a ends the middle row in the east, door b caps the short column up to the top corridor. Aha: hop up one row, sweep it west to paint A and straight back east through a; the bottom row returns you west, the climb paints B, and one step east lines you up under b for the top corridor (9). Two of three starts cost 1-2 swipes.",
  23: "Practise (the sideways chute). Key B is right above the start; key A and door a end the same row in the east, side by side. Aha: up first paints B, and one roll east then paints A and passes a in the same stroke; the west room is swept, door b in the top row opens the east column, and the bottom row finishes the job (9). The other starts cost a swipe.",
  24: "Twist (three colours) on a small board. Keys B and A sit beside the start; door c stops you right next to them. Aha: B and A first (two one-tile rolls), then the south loop through b, and the east column climbs through a straight into key C, which opens c on the way back (9). Only west first is optimal.",
  25: "Combine (door-as-wall + two colours). The east tower climbs through key B to door a. Aha: shut door a pins the brush in the tower so B is painted on the way up; then sweep the south pocket through key A and the now-open b, climb the tower's other lane and finish through a (9). Two of three starts cost 1-2 swipes.",
  26: "Breather (10 tiles). Keys A and B sit beside the start; doors b and a close the two corners. Aha: the first step paints A and stops on shut b; dropping down column 2 paints B, and both doors are then one-tile hops in a tidy loop that ends down the east tail (6).",
  27: "Practise (chained keys). Only two starts. Key A opens door a, which leads to the west branch where key B waits; B opens door b at the top. Aha: the chain A → a → B → b is forced, and the shut door b is the stop that parks you on A's column (10).",
  28: "Practise (three colours, roomy). A two-row hall over a west annex: keys A and C stacked by the west wall, key B in the annex, door c beside C, door b at the annex's foot, door a at the hall's east end. Aha: sweep the hall east and west, then the drop down the west wall paints A and C and stops on shut b; c, B, the west column through b, and the final climb runs the top row east through a (10).",
  29: "Combine. Three colours; door b (bottom-left corner) is used twice as a wall before it opens, and the chimney above is reached from the bottom row. Aha: C beside the start opens c, the way east to A; after A, one roll west paints B and passes a; the final drop down the west column passes b (11).",
  30: "Finale (Color Sequencing). One ordered chain: C → c → B → b → A → a. Door a is the first wall you stop on and the last tile you paint; every shut door is used as a stop before it opens (12). Up first is the only optimal start.",

  31: "Teach (crumble). Two cracked tiles guard the only way into the east column. A cracked tile takes one pass, then it is a hole. Aha: crossing a crack cuts the board, so clear the whole west side first and cross both cracks on the last two strokes (9).",
  32: "Practise (cross mid-route). The crack sits in the east column — the only link between the top room and the bottom loop. Aha: unlike L31 you cannot save it for last: ride the east column down through it early, then return up the loop's west column, which never needs the crack again (8). All three starts work; down first is cleanest.",
  33: "Twist: a spent crack is a hole the brush stops in front of, like a wall. This board has no other stops on row 2 or column 3. Aha: crack the corner tile first — afterwards rolling up the east column halts on row 2 and rolling along row 1 halts on column 3 (8). Without the crack the board is impossible.",
  34: "Combine (first crack + one key). A 20-tile room: key A in the third row, door a over the east column, the crack in the bottom-left corner. Aha: sweep the start row and the east column, then the third row paints A; the drop onto the crack parks you in the bottom row, which carries you to the column under door a — climb through it and drop back to the tail (9).",
  35: "Practise. Two cracks: one on the top row between the two-lane west room and the link column, one at the foot of the link column. Aha: crack both EARLY — each spent crack is the wall that stops you on the lane you still need (10), the reverse of saving them for last.",
  36: "Breather (12 tiles). A 3x4 room with a crack in the north-east corner. Aha: the crack is simply the last tile — climb, run the west column down and the floor east, and the final climb of the east column ends on the crack (5). This time the crack is never a stop; it just has to come last.",
  37: "Combine (two colours + a crack). Key A is on the start row, key B in the north-east corner; door b and a crack stack under B in the east column, door a under A. Aha: one roll east paints A, the corner step paints B, the drop through b spends the crack (so the east column is used exactly once), and the climb through a returns you to the top row for the west loop and the south tail (10).",
  38: "Combine (crack + door). Key A in row 3, the crack in the north-west corner, door a in the top row just east of it. Aha: paint A on the long roll west, then climb the west column onto the crack — the only stroke that spends it; the top row then runs through a, and the east shaft, the floor and the second column finish (8).",
  39: "Combine. A rectangular ring with key B and door a side by side in the top row, key A on the bottom row and door b in the bottom-left corner; one crack in the north-east corner. Aha: crack the corner first — later one roll west-to-east along the top paints B, passes a and stops on that hole; door b is the very last tile (10).",
  40: "Finale (Crumble). A 33-tile vault: a west room and an east corridor joined by the top row and the floor, cracks in opposite corners (north-west, south-east), key B on the west wall, key A on row 5, doors a (top row) and b (east corridor). Aha: shut a stops the top-row roll so the room's middle column can be swept; the floor roll east ends on the south-east crack, shut b parks you on row 5 for A, and the climb of the west wall paints B and spends the north-west crack in one stroke — then the top row passes a and the corridor's drop through b ends against the spent crack (11). No first move is fatal.",

  41: "Teach (turn pad). A ring round a walled pocket; the pocket row's only entrance is a pad (^) in the bottom row, west of the start. A pad turns any roll that enters it. Aha: go round the ring the long way (east, up, west, down) and the last roll east along the bottom hits the pad and is lifted into the pocket row (6). Rolling west first or up first costs 2 swipes.",
  42: "Practise (a pad mid-row). A pad (v) sits beside the start in the middle row, over a two-wide west wing. Aha: any roll that crosses it is bent down column 2, so the middle row must be painted from the east: go down and up the west wall, run the top row, drop to the middle row's east end, and one roll west paints the row and turns down to the floor (8 tiles in one swipe); the bottom row finishes (6). Rolling east from the start turns you down at once and costs a swipe.",
  43: "Twist (a pad as a stop). The floor row's pad (v) points into the board edge, so it can never turn you — any roll that reaches it stops on it. Aha: plan around the stop: sweep the top room first (east, west, up, east), drop down the east shaft, and the floor is painted in two rolls split at the pad (7). Starting west or up costs a swipe.",
  44: "Twist (U-turn pad). A pad (<) in the middle row points back west; a pad (v) in the top row drops rolls into the west room. Aha: a roll east along the middle row bounces off the < pad and comes straight back to the west wall, painting the row in one round trip — climb first, let the v pad drop you into the middle row, bounce, then run the outer ring (8). Down first costs a swipe.",
  45: "Combine (pad + door). Door a sits in the top row and the pad (>) in the north-west corner points along that row straight at it; a second pad (^) in row 2 points into a wall, so it is a stop. Aha: while a is shut it is just a stop; fetch key A from the bottom row, use the ^ pad to park in the middle of the hall, and finish by climbing the west wall — the corner pad turns you east, through the open door (10).",
  46: "Breather (pad chain). A ring with a pad on each top corner: < in the north-east, v in the north-west. Aha: sweep the bottom row both ways, then one swipe up the east side is turned west along the top by the < pad and down the west side by the v pad — 11 tiles in a single roll (3).",
  47: "Combine (pad + crack). A ^ pad at the east end of row 2 points up at a crack in the corner above it. Aha: the first roll east is lifted onto the crack and spends it; from then on the hole stops any climb of the east column on the pad — so the climb from the floor parks there and row 2 is swept west from it, with row 3 last (9). The other starts cost a swipe.",
  48: "Practise (pads in a chain). A < pad in the top row's east corner feeds a v pad in the same row. Aha: the first roll east along the top is dropped into row 2 by the v pad; later the climb of column 5 reaches the top row, the < pad sends you back west and the v pad drops you again — two bends in one roll, landing where row 2's last tile waits (8). Down first costs a swipe.",
  49: "Combine (pads + two colours + a crack). Key A heads the west room and door a its floor; key B, door b and a crack share rows 3-4; a > pad in the west room and a < pad in the north-east corner. Aha: paint A on the row-2 sweep and go down through a; the climb from the floor is bent east by the > pad straight into B; row 4 then runs through b and the crack in one stroke, and the last climb up the east column hits the corner pad and turns west along the top row (11). Down first is the only optimal start.",
  50: "Finale (Turn Pads). A 28-tile frame: a two-row hall with three pads (v and ^ side by side near its west end, > in the middle of row 2), three shafts hanging down and a floor with key A and door a joining the west and middle shafts. Aha: the v and ^ pads turn the hall's west end into a staircase you descend in single steps; A at the foot of the west shaft opens a, the climb of the middle shaft is bent east by the > pad, and the hall is closed by rolling straight over that same pad (entered heading east it lets you through) before the east shaft (11). Three openings, all within 1.",

  51: "Master opener, gentle but new: the fourth colour (D) arrives on a 15-tile board with all four colours. Aha: every shut door is a stop — the first roll paints B and stops on d, the second stops on a, the third paints A and stops on c — and the doors then open in the order b, d, a, c (9).",
  52: "Practise (master: a pad staircase). Two ^ pads step diagonally down the west side; key A sits above the upper one, door a closes the middle column's foot. Aha: door a stops your first drop, then two short rolls west climb the staircase — each pad lifts you one row, the second straight through key A; with a open the middle column is ridden to the floor and the east column climbed last (8).",
  53: "First clock, short and gentle (120 s for a 7-swipe par — the clock is a flavour, never a reading-speed test). Keys A and B sit together at the floor's west end; door a ends the floor and door b is the hall's east wall. Aha: sweep row 2 west, step down onto A, and one roll east paints B and passes a in the same stroke; the top row and a last hop through b finish (7).",
  54: "Combine (pad + crack + two colours, 19 tiles). A ^ pad in the floor row points up at a crack; key B and door a guard the west, key A and door b the east end of the floor. Aha: door a stops the first roll west so B can be painted; the floor roll east is lifted by the pad onto the crack and spends it; after b, the roll back west paints A and the same pad now stops you (its arrow points at the hole), lining you up for the middle row through a (10).",
  55: "Practise (three colours, two pads, 21 tiles). Key A is east of the start, B and C at the foot and head of the west column; doors b (top), c and a (floor row); a v pad tips row-3 rolls down and a > pad in column 2 faces a wall, so it is a stop. Aha: A first, then the v pad drops you back beside the start; the west column paints B and C in two climbs, b opens the second column, whose > pad stops your drop one row short of the floor — step down and the floor roll passes c and a (11).",
  56: "Breather between master levels (14 tiles). A < pad at the top of the east column tips climbs into the little top nook; key A and door a share the third row. Aha: roll east and climb — the pad tips you into the nook — drop back down the nook's column to paint A, then the bottom row, a one-tile hop up through a, and the third row finishes (6).",
  57: "Twist (all four colours, branching). Door c in the top row, doors d and a stacked in the east shaft, door b on the floor; keys C and B in the middle room, D on the west wall, A on the floor. Aha: shut c is the first stop; the drop from it paints C and B together; D falls on the way down the west side, and the floor roll paints A and passes b in one stroke, so the east shaft opens d and a in a single climb and the top row passes c (11).",
  58: "Short master sprint under a generous clock (120 s for 7 swipes). Key A on the floor row, door a in the west column; key B and door b share the top row. Aha: drop and roll east for A, climb the west column through a, and the long row-2 roll sets up the final roll west along the top, which paints B and passes b in the same stroke (7).",
  59: "Penultimate. The west shaft is a stack of locks — crack, a, b, C — and its one climb is the second-to-last stroke. Aha: open A, then B (using shut c as the stop), crack the east notch to create the stops, and save the shaft for last (17).",
  60: "Finale (game). A 33-tile tower of everything: three colours, a crack and two pads — a v pad mid-hall that turns any climb back down (a U-turn) and a > pad in the west column that bends every climb east along the hall's middle row. Aha: the U-turn pad makes the first climb drop you straight back to the floor; A at the foot of the west column opens a, and each climb of the west column is bent east by the > pad — first stopping under shut door c, later (after B, the crack and C) again; c opens the corner and the last roll west stops at the spent crack (14). Three openings; up is best.",
};

const LEGEND_LINES: Record<string, string> = {
  "o": "o  start — the brush begins here (already painted)",
  ".": ".  floor — paintable; the brush rolls over it",
  "#": "#  wall — blocks the brush, not paintable",
  "*": "*  crumble (crack) — paintable once; after one pass it is a hole that stops the brush like a wall",
  ">": "> < ^ v  turn pad — paintable floor; a brush that rolls ONTO it turns to the arrow's direction and keeps rolling (if that way is blocked it stops on the pad); a brush resting on a pad leaves in the swiped direction; pads work every time they are entered",
};

/** Mechanics present on a board, in teaching order. */
function mechanicsOf(grid: string[]): string[] {
  const has = (pred: (c: string) => boolean) => grid.some((r) => [...r].some(pred));
  const pairs = new Set<string>();
  for (const row of grid) for (const c of row) if (c >= "A" && c <= "D") pairs.add(c);
  const m = ["Roller brush — a swipe rolls until a wall stops it, painting every tile it crosses"];
  if (pairs.size === 1) m.push("Switch & gate — paint the switch to open its gate");
  if (pairs.size >= 2) m.push(`Colour sequencing — ${pairs.size} switch/gate pairs, each opened in path order`);
  if (has((c) => c === "*")) m.push("Crumble tiles — one pass only, so the route may never back-track over them");
  if (has((c) => "<>^v".includes(c))) m.push("Turn pads — rolling onto an arrow pad bends the roll to the arrow's direction; blocked that way = the brush stops on the pad");
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

    // The full legend on every level (the review reads one legend for the whole set), plus the rule that makes
    // these puzzles: the brush only stops at a wall, a shut gate or a spent crumble.
    const legend: string[] = [
      ...["o", ".", "#", "*", ">"].map((ch) => LEGEND_LINES[ch]),
      "A-D / a-d  switch / gate pairs: painting switch X opens every gate x; a shut gate stops the brush like a wall",
      "rule: a swipe rolls the brush until a wall, a shut gate or a spent crumble stops it (turn pads bend the roll on the way); win = every non-# tile painted",
      "scoring: no move limit and no fail state (except the clock on the few timed levels); par = the fewest swipes possible (BFS-optimal); 3 stars at par, 2 stars within par+2, else 1 star",
    ];

    const timed = level.timeLimitSeconds > 0 ? ` Timed: ${level.timeLimitSeconds}s for a ${level.parMoves}-swipe par.` : "";
    return {
      grid,
      legend,
      intent: `${level.name} — ${INTENTS[level.id] ?? ""}${timed}`,
      mechanics: timed ? [...mechanicsOf(grid), `Timer — finish within ${level.timeLimitSeconds}s`] : mechanicsOf(grid),
    };
  },
};
