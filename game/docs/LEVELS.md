# Path Painter — Level Plan

**Path Painter** is a roller-maze puzzle. The player sits on a start tile and
swipes; the brush rolls in that direction and **keeps going until a wall, a shut
gate, or an already-used crumble tile stops it**, painting every tile it crosses.
**Win when every paintable tile is covered.** One verb (swipe), discrete
strokes, so undo/reset are trivial and every level is a pure planning puzzle —
difficulty comes from *seeing the route*, never from reflexes or guessing.

Tile legend: `o` start · `.` floor · `#` wall · `A`–`D` switch · `a`–`d` gate
(opened by its matching switch) · `*` crumble (one pass only).

## The core puzzle

Because the brush only stops at walls, every board is a **maze of corridors and
junctions**, not a single forced path. From the start and at every junction the
player faces real choices (**branching ≥ 2 on every level**): roll one way and you
may strand a corridor you can no longer reach cheaply. The skill is ordering your
strokes so the whole maze is covered — and, once mechanics arrive, so every key
is painted before its door and every one-pass crumble is spent on the right half
of the board.

## How the set is built

36 levels across six chapters. Each chapter **introduces one mechanic on a small
board (teach), practises it, twists it, then combines it with earlier mechanics
and ends on a finale.** Every board was generated from a fixed seed and then
curated: kept only if the solver proves it completable, it has genuine branching,
its trap rate is fair (0 on the teaching levels — no first move is ever fatal —
and modest later), and its `botBudget` could be tuned to the target win-rate
curve. Each level stores its proven optimal solution; `npm run validate` replays
it on the real engine to prove completability and measure difficulty, `npm run
playtest` checks the human-like win-rate curve, and `npm run levels` prints each
board, its intent and the solver facts (optimal moves, branching, trap rate) for
the level-design review.

### Difficulty curve

Boards grow from 3×3 corridors to 9×9 mazes; gates and crumbles add planning
weight. Measured difficulty (solver strokes + a weight per hazard) rises from a
~4 average in the early third to ~24 in the last third — comfortably the ≥3×
rise `validate` requires. Casual bot win rate falls smoothly from ~0.88 to ~0.40
while skilled stays ≥0.68 everywhere (no walls), so the curve is hard-but-fair.

---

## Chapter 1 · Basics — *teach the roller*  (L1–6)

Mechanic: **the swipe**. No hazards. Small mazes so the only thing to learn is
that the brush rolls to a wall and that junctions mean choices.

| # | Name | Role | Intent / aha |
|---|------|------|--------------|
| 1 | First Roll | teach | One swipe rolls to the wall and paints the whole corridor — think in strokes, not steps. |
| 2 | Two Ways | teach | Two branches leave the start; cover both, but order them so neither is stranded. |
| 3 | Around the Bend | practise | Taller fork maze: "roll till it stops, then turn." |
| 4 | Dead Ends | practise | Dead-end stubs are painted by rolling in and back out — budget a there-and-back for each. |
| 5 | The Fork | twist | A symmetric fork: only one first move lets you sweep the rest in one chain; the mirror wastes a stroke. |
| 6 | Full Cover | finale | A loopy multi-junction maze — "roll, stop, turn" planning must be automatic. |

## Chapter 2 · Switches & Gates — *one lock at a time*  (L7–12)

Mechanic: **switch → gate**. A round switch opens its square gate. Now the maze
has a locked corridor, so the key must be planned into the route.

| # | Name | Role | Intent / aha |
|---|------|------|--------------|
| 7 | First Key | teach | Paint the switch, roll through the opened gate — the rule, alone. |
| 8 | Locked In | practise | Key down a side branch — detour for it before the locked corridor is an option. |
| 9 | Key & Door | practise | The door blocks a corridor you need; fetch its off-to-the-side key first. |
| 10 | Detour | practise | Key and door on opposite sides of a loop — hold the lock in mind over the long way round. |
| 11 | Far Door | twist | Switch and gate side by side at a dead end — painting the key turns the wall beside it into your exit. |
| 12 | Gatekeeper | finale | A full-size single-gate maze — sequence the key into a longer route without hesitating. |

## Chapter 3 · Color Sequencing — *several ordered locks*  (L13–18)

Mechanic: **multiple colours**, each an independent lock. The twist is ordering:
plan a route that paints each colour's switch before you need its corridor.

| # | Name | Role | Intent / aha |
|---|------|------|--------------|
| 13 | Two Colours | teach | Two independent locks — paint both keys before you need either door. |
| 14 | Order Up | practise | Two keys off the main loop — order the detours so neither door blocks you later. |
| 15 | Twin Keys | practise | Keys at opposite ends — grab both on the way out so the doors are open on the sweep back. |
| 16 | Three Doors | twist | Three scattered keys — one route must open each colour's switch before its corridor. |
| 17 | Tangle | combine | Three locks threaded through a crossing maze — route so every switch precedes its door. |
| 18 | Lockwork | finale | Three locks on the chapter's biggest board — master the multi-key order. |

## Chapter 4 · Crumble Hazards — *one-use floor*  (L19–24)

Mechanic: **crumble tiles** — one pass, then gone. Crossing one cuts the maze,
so it must be spent at the right moment; combined with gates, both constraints
sit on the same route.

| # | Name | Role | Intent / aha |
|---|------|------|--------------|
| 19 | First Cracks | teach | A crumble cuts the maze in two — cross it only when you'll never need to return. |
| 20 | One Pass | combine | A crumble and a gate on the same route — sequence so neither traps you. |
| 21 | Brittle | practise | Two crumbles pinch the only loop — choose which to spend first. |
| 22 | Lock & Crack | combine | The crumble sits on a shortcut you'd want twice — use it once, for the right half. |
| 23 | Fragile Keys | combine | One gate, two crumbles — cross each fragile tile on the way to a key, not wastefully. |
| 24 | Crumble Vault | finale | Two gates, two crumbles — some first moves already doom the board; read the route first. |

## Chapter 5 · Timed Trials — *everything, against a clock*  (L25–30)

Mechanic: **the timer**. Mixed boards, but you must plan the whole route up
front and execute without hesitating.

| # | Name | Role | Intent / aha |
|---|------|------|--------------|
| 25 | Against the Clock | teach | Plan the single-pass route up front — improvising wastes crumbles you can't recover. |
| 26 | Time Lock | practise | A long two-gate maze, generous clock — sustain a key-ordered plan at speed. |
| 27 | Rush Doors | twist | Three gates, tighter clock — decide the key order once, then paint without stopping. |
| 28 | Timed Cracks | combine | Two gates and a crumble under the clock, no time to backtrack. |
| 29 | Big Sprint | practise | A big crumble sprint — fast single-pass routing across a 5×5 maze. |
| 30 | Clockwork | finale | The largest timed two-gate maze — planning and pace together. |

## Chapter 6 · Master Mazes — *the graduation*  (L31–36)

No new mechanic: the chapter interleaves everything at master scale. Untimed
except the one sprint, so difficulty is pure planning depth.

| # | Name | Role | Intent / aha |
|---|------|------|--------------|
| 31 | Master Keys | combine | Three gates on a dense maze, untimed — long-horizon key planning. |
| 32 | Grand Vault | practise | Three locks across a 5×5 maze — hold several key orders at once. |
| 33 | Shatter Hall | combine | Two gates plus a crumble, master size — design the one irreversible tile out of your route. |
| 34 | Four Locks | twist | Four colour locks (A–D) — the most ever; track four keys and their forced order. |
| 35 | Final Sprint | combine | The one timed master maze — a 5×5 crumble sprint, everything against the clock. |
| 36 | Masterpiece | finale | Four locks and a crumble on the biggest maze — route-finding, four keys and single-pass discipline in one. |

---

*This plan and `src/game/sim.ts` `describe()` are kept in lock-step: every level's
`INTENTS` entry matches its row above, and `npm run levels` prints them beside the
solver's optimal-move, branching and trap-rate facts for review.*
