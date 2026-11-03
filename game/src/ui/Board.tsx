import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { art } from "../art";
import type { PathEngine, Direction, Tile, PathStep } from "../game/PathEngine";
import type { Colors } from "../game/theme";
import { Txt } from "./Txt";
import { qa } from "../modules/qa";

/**
 * The game board, rendered entirely from the generated art (assets/art): satin
 * ceramic tiles, creamy paint fills, the brush mascot and sprite gates /
 * switches / crumble tiles. No flat coloured shapes.
 *
 * Feel timeline of one stroke (all native-driver, no per-frame JS):
 *   touch     the tile under the brush lifts to 1.08 and glows while the finger
 *             is down; on commit it pops (1.09) with a ~110 ms glow flash;
 *   frame 1   the swipe is committed mid-gesture; a translucent paint streak
 *             previews the whole path and the brush stretches along its axis
 *             and starts rolling (eased out, ~65 ms per tile, ≤ 620 ms; QA ≤ 340);
 *   per tile  each tile's paint wipes in from the side the brush entered,
 *             timed to the brush passing it, with a 1.07 micro-pop of the tile
 *             itself, a rim pop + droplets;
 *   impact    the brush squashes against the wall, knocks 4-6 px into it and
 *             bounces back, the board jolts 3 px and 10 paint droplets spray
 *             off the end tile (~260 ms fade).
 * Turn pads bend a roll: the brush, the preview streak and the per-tile paint
 * wipes all follow the stroke's `path` (every tile entered, in order), so a
 * bent stroke reads as one continuous roll round the corner.
 * A swipe into a wall still answers: the brush knocks against it and splashes.
 * Undo / Reset rewind: the removed paint shrinks away tile by tile, farthest
 * first, while the brush rolls back (~260 ms) — never a hard cut.
 */

/** A committed stroke — drives the per-tile paint timing and the brush roll. */
export interface Stroke {
  id: number;
  fromX: number;
  fromY: number;
  /** The swiped direction. */
  dir: Direction;
  /** Tiles entered (= path.length). */
  steps: number;
  /** Every tile the roll entered, in order, with the heading it entered on (turn pads bend it). */
  path: PathStep[];
  /** Heading at the end of the roll — the wall the brush knocks into. */
  endDir: Direction;
}

/** A stroke's straight runs: each starts at the tile before its first step. */
function strokeRuns(stroke: Stroke): { x: number; y: number; dir: Direction; len: number; at: number }[] {
  const runs: { x: number; y: number; dir: Direction; len: number; at: number }[] = [];
  let px = stroke.fromX, py = stroke.fromY;
  stroke.path.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.dir === p.dir) last.len++;
    else runs.push({ x: px, y: py, dir: p.dir, len: 1, at: i });
    px = p.x;
    py = p.y;
  });
  return runs;
}

/** Fraction of an eased-out roll's time at which the brush has covered `k` of `steps` tiles. */
function timeFrac(k: number, steps: number): number {
  return 1 - Math.sqrt(1 - Math.min(1, Math.max(0, k / steps)));
}
/** A swipe straight into a wall — the brush knocks but nothing paints. */
export interface Bump {
  id: number;
  dir: Direction;
}
/** Paint removed by Undo / Reset: rank 0 vanishes first (farthest from the brush). */
export interface Rewind {
  id: number;
  tiles: { x: number; y: number; rank: number }[];
  /** Reset also sweeps a gloss wipe across the whole board. */
  wipe: boolean;
}
/** Total length of the rewind animation. */
export const REWIND_MS = 260;

/** Shared resting value for tiles that aren't under the finger. */
const REST = new Animated.Value(0);

const DIR: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** How long the brush takes to roll `steps` tiles. Slow enough that the paint
 *  visibly floods tile by tile (~65 ms a tile); QA replay keeps it short so the
 *  next solver touch is reported well inside QA's accept window. */
export function travelMs(steps: number): number {
  if (qa.level != null) return Math.min(340, 90 + steps * 40);
  return Math.min(620, 120 + steps * 65);
}

/** When (ms after the swipe) the brush is halfway into the i-th tile (1-based)
 *  of an eased-out roll — the inverse of Easing.out(quad). */
export function tileDelay(i: number, steps: number): number {
  const p = Math.min(1, (i - 0.5) / steps);
  return Math.round(travelMs(steps) * (1 - Math.sqrt(1 - p)));
}

/** Each switch + its gate share a group colour so sequencing reads at a glance. */
export function groupColor(group: string | undefined, c: Colors): string {
  switch (group) {
    case "A": return c.groups[0];
    case "B": return c.groups[1];
    case "C": return c.groups[2];
    case "D": return c.groups[3];
    default: return c.groups[0];
  }
}

/** The playable part of a level grid: the bounding box of its non-wall tiles.
 *  The ASCII plans carry a wall border; the board only draws what matters so
 *  the paths fill the screen width instead of a frame of dead cells. */
export function boardBounds(engine: PathEngine): { x0: number; y0: number; w: number; h: number } {
  let x0 = engine.width, y0 = engine.height, x1 = -1, y1 = -1;
  engine.tiles.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.type === "wall") return;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    })
  );
  if (x1 < 0) return { x0: 0, y0: 0, w: engine.width, h: engine.height };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Frame thickness around the paths for a given cell size. */
export function framePad(cell: number): number {
  return Math.max(6, Math.round(cell * 0.2));
}

export function Board({
  engine,
  cell,
  colors,
  hintDir,
  stroke,
  bump,
  press,
  rewind,
  spotlight,
  celebrate,
}: {
  engine: PathEngine;
  cell: number;
  colors: Colors;
  hintDir: Direction | null;
  /** Win: non-zero id starts a wave of pops across the painted tiles, outward from the brush. */
  celebrate?: number;
  stroke?: Stroke | null;
  bump?: Bump | null;
  /** 0..1 while a finger is down on the board (instant press feedback). */
  press?: Animated.Value;
  rewind?: Rewind | null;
  /** "x,y" keys of tiles that carry this level's NEW mechanic — ringed until the first move. */
  spotlight?: Set<string> | null;
}) {
  const b = boardBounds(engine);
  const F = framePad(cell);
  const w = cell * engine.width;
  const h = cell * engine.height;

  // Board jolt on impact / wall knock.
  const shake = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const jolt = (dir: Direction, delay: number, px: number) => {
    const { dx, dy } = DIR[dir];
    shake.setValue({ x: 0, y: 0 });
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(shake, { toValue: { x: dx * px, y: dy * px }, duration: 45, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(shake, { toValue: { x: 0, y: 0 }, friction: 4, tension: 260, useNativeDriver: true }),
    ]).start();
  };
  useEffect(() => {
    if (stroke) jolt(stroke.endDir, travelMs(stroke.steps), 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stroke?.id]);
  useEffect(() => {
    if (bump) jolt(bump.dir, 40, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump?.id]);

  // One shared pulse links each still-shut gate to its switch (same colour,
  // same beat) and rings the spotlighted new-mechanic tiles.
  const link = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(link, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(link, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [link]);

  // Per-tile timing along the (possibly bent) roll: the first time the brush enters a tile paints it.
  const onPath = new Map<string, { i: number; dir: Direction }>();
  if (stroke) {
    onPath.set(`${stroke.fromX},${stroke.fromY}`, { i: 0, dir: stroke.dir });
    stroke.path.forEach((p, k) => {
      const key = `${p.x},${p.y}`;
      if (!onPath.has(key)) onPath.set(key, { i: k + 1, dir: p.dir });
    });
  }

  return (
    <Animated.View
      style={[
        styles.board,
        {
          width: b.w * cell + F * 2,
          height: b.h * cell + F * 2,
          borderRadius: Math.round(F * 1.4),
          backgroundColor: colors.frame,
          // Visible: the brush squash / knock and the paint pops may poke past
          // the frame edge — never clip them.
          overflow: "visible",
          borderColor: colors.frameEdge,
          transform: shake.getTranslateTransform(),
        },
      ]}
    >
      {/* frame gloss: a soft top sheen + a darker bottom lip give the board depth */}
      <View pointerEvents="none" style={[styles.frameGloss, { borderRadius: Math.round(F * 1.4), height: F * 2.2 }]} />
      <View pointerEvents="none" style={[styles.frameLip, { borderBottomLeftRadius: Math.round(F * 1.4), borderBottomRightRadius: Math.round(F * 1.4), height: F * 0.7 }]} />
      <View style={{ position: "absolute", left: F, top: F, width: b.w * cell, height: b.h * cell }}>
        <View style={{ position: "absolute", left: -b.x0 * cell, top: -b.y0 * cell, width: w, height: h }}>
          {engine.tiles.map((row, y) => (
            <View key={y} style={styles.row}>
              {row.map((tile, x) => {
                let delay = 0;
                let from: Direction | null = null;
                let popKey = 0;
                let popDelay = 0;
                const hit = stroke ? onPath.get(`${x},${y}`) : undefined;
                if (stroke && hit) {
                  if (hit.i >= 1) {
                    delay = tileDelay(hit.i, stroke.steps);
                    from = hit.dir;
                  }
                  // Origin tile pops on commit; every rolled-over tile micro-pops as
                  // the brush passes it.
                  popKey = stroke.id;
                  popDelay = hit.i === 0 ? 0 : delay;
                }
                const underBrush = x === engine.cursorX && y === engine.cursorY;
                const inBounds = x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h;
                const waveDelay = Math.abs(x - engine.cursorX) + Math.abs(y - engine.cursorY);
                return (
                  <TileCell
                    key={x}
                    tile={tile}
                    x={x}
                    y={y}
                    cell={cell}
                    order={x - b.x0 + y - b.y0}
                    painted={engine.isPainted(x, y)}
                    open={!!tile.group && engine.openGroups.has(tile.group)}
                    colors={colors}
                    paintDelay={delay}
                    paintFrom={from}
                    popKey={popKey}
                    popDelay={popDelay}
                    origin={popKey !== 0 && popDelay === 0}
                    pressV={underBrush && press ? press : REST}
                    link={link}
                    spot={!!spotlight?.has(`${x},${y}`)}
                    inBounds={inBounds}
                    wave={celebrate ?? 0}
                    waveDelay={waveDelay * 55}
                  />
                );
              })}
            </View>
          ))}
          {stroke && <OriginFlash key={`o${stroke.id}`} x={stroke.fromX} y={stroke.fromY} cell={cell} color={colors.paintEdge} />}
          {rewind && <RewindPaint key={`r${rewind.id}`} rewind={rewind} cell={cell} colors={colors} width={w} height={h} />}
          {stroke &&
            strokeRuns(stroke).map((run, k) => (
              <Streak
                key={`${stroke.id}-${k}`}
                run={run}
                delay={Math.round(travelMs(stroke.steps) * 0.35 * timeFrac(run.at, stroke.steps))}
                dur={Math.max(50, Math.round(travelMs(stroke.steps) * 0.35 * (timeFrac(run.at + run.len, stroke.steps) - timeFrac(run.at, stroke.steps))))}
                fadeAt={travelMs(stroke.steps)}
                cell={cell}
                color={colors.paint}
              />
            ))}
          <Brush engine={engine} cell={cell} colors={colors} hintDir={hintDir} stroke={stroke ?? null} bump={bump ?? null} press={press} />
        </View>
      </View>
    </Animated.View>
  );
}

const GAP = 0.085; // fraction of a cell left as grout between tiles (a clear gap, never merging)

function TileCell({
  tile,
  x,
  y,
  cell,
  order,
  painted,
  open,
  colors,
  paintDelay,
  paintFrom,
  popKey,
  popDelay,
  origin,
  pressV,
  link,
  spot,
  inBounds,
  wave,
  waveDelay,
}: {
  tile: Tile;
  x: number;
  y: number;
  cell: number;
  order: number;
  painted: boolean;
  open: boolean;
  colors: Colors;
  paintDelay: number;
  paintFrom: Direction | null;
  /** Non-zero stroke id when this tile is on the stroke: triggers its micro-pop. */
  popKey: number;
  popDelay: number;
  /** The stroke's origin tile pops a little harder (1.09). */
  origin: boolean;
  /** 0..1 finger-down value when this tile is under the brush. */
  pressV: Animated.Value;
  /** Shared 0..1 pulse: key↔door links and the new-mechanic spotlight. */
  link: Animated.Value;
  spot: boolean;
  /** Inside the drawn board: an interior wall here is a planter block, not a gap. */
  inBounds: boolean;
  /** Win wave id (0 = none) and this tile's delay in it. */
  wave: number;
  waveDelay: number;
}) {
  // Entrance: pop in once on mount with a short diagonal stagger + upward drift.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      delay: 120 + Math.min(order * 26, 420),
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [enter, order]);

  // Micro-pop as the brush passes (60-100 ms), harder on the origin tile.
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!popKey) return;
    pop.setValue(0);
    Animated.sequence([
      Animated.delay(popDelay),
      Animated.timing(pop, { toValue: 1, duration: 35, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0, duration: 65, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [popKey, popDelay, pop]);

  // Win wave: every painted tile hops + flashes, rippling out from the brush.
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!wave) return;
    hop.setValue(0);
    Animated.sequence([
      Animated.delay(waveDelay),
      Animated.timing(hop, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(hop, { toValue: 0, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();
  }, [wave, waveDelay, hop]);

  // A gate whose switch just got painted bursts open (one shot).
  const [burst, setBurst] = useState(0);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current && tile.type === "gate") setBurst((n) => n + 1);
    wasOpen.current = open;
  }, [open, tile.type]);

  if (tile.type === "wall") {
    if (!inBounds) return <View style={{ width: cell, height: cell }} />;
    return (
      <Animated.View style={{ width: cell, height: cell, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <Planter cell={cell} colors={colors} seed={x * 5 + y * 3} />
      </Animated.View>
    );
  }
  const pad = Math.max(1, Math.round(cell * GAP));
  const inner = cell - pad * 2;
  const r = Math.round(inner * 0.24);
  const gc = groupColor(tile.group, colors);
  const lockedGate = tile.type === "gate" && !open;
  // Pulse rings: an unopened switch and its shut gates beat together.
  const linked = !!tile.group && !open && (tile.type === "switch" ? !painted : true);

  return (
    <Animated.View
      style={{
        width: cell,
        height: cell,
        padding: pad,
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-cell * 0.35, 0] }) },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, origin ? 1.1 : 1.08] }) },
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -cell * 0.12] }) },
          { scale: hop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
          // touch-down: the tile under the finger squashes into the board
          { scaleX: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
          { scaleY: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
        ],
      }}
    >
      <View style={{ width: inner, height: inner }}>
        {/* Unpainted = a recessed slot: dark inner shadow on top, a faint light lip below. */}
        {!lockedGate && (
          <View style={[styles.fill, { borderRadius: r, backgroundColor: colors.slotDeep, borderBottomWidth: 1.5, borderColor: colors.frameEdge }]}>
            <View
              style={{
                position: "absolute",
                left: inner * 0.04,
                right: inner * 0.04,
                top: inner * 0.12,
                bottom: inner * 0.02,
                borderRadius: r * 0.85,
                backgroundColor: colors.slot,
              }}
            />
          </View>
        )}
        {tile.type === "crumble" && !painted && (
          <Image source={art.sprite_crumble_tile} style={{ position: "absolute", left: inner * 0.06, top: inner * 0.06, width: inner * 0.88, height: inner * 0.88 }} resizeMode="stretch" />
        )}
        {tile.type === "gate" && open && !painted && (
          // An open door: the slot ringed with a dashed line in its colour.
          <View pointerEvents="none" style={[styles.fill, { borderRadius: r, borderWidth: Math.max(2, inner * 0.06), borderStyle: "dashed", borderColor: gc }]} />
        )}
        {/* touch glow while the finger is down on the brush's tile */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              borderRadius: r,
              borderWidth: Math.max(2, inner * 0.06),
              borderColor: colors.paintEdge,
              backgroundColor: colors.paintEdge + "33",
              opacity: pressV,
            },
          ]}
        />
        {painted && <PaintBlob size={inner} r={r} colors={colors} delay={paintDelay} from={paintFrom} seed={x * 7 + y * 13} />}
        {painted && wave > 0 && (
          // win flash: a white sheen on each tile as the wave passes it
          <Animated.View
            pointerEvents="none"
            style={[styles.fill, { borderRadius: r, backgroundColor: "#FFFFFF", opacity: hop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]}
          />
        )}
        {tile.type === "crumble" && painted && (
          // A used crumble tile keeps its cracks showing: it won't carry the brush again.
          <Image source={art.sprite_crumble_tile} style={[styles.fill, { opacity: 0.38 }]} resizeMode="stretch" />
        )}

        {tile.type === "pad" && tile.dir && (
          // Turn pad: a raised ring plate with a bold arrow. Bare = cream arrow on a lighter
          // plate over the dark slot; painted = white arrow riding the paint. Readable in both.
          <View style={styles.center} pointerEvents="none">
            {!painted && <View style={{ position: "absolute", left: inner * 0.1, top: inner * 0.1, width: inner * 0.8, height: inner * 0.8, borderRadius: inner * 0.2, backgroundColor: colors.slotDeep, borderWidth: Math.max(2, inner * 0.05), borderColor: colors.paintEdge + "CC" }} />}
            <PadArrow size={inner} dir={tile.dir} color={painted ? "#FFFFFF" : "#FFF1D6"} outline={painted ? colors.paintDeep : "#1A1530"} />
          </View>
        )}

        {tile.type === "switch" && (
          <View style={styles.center} pointerEvents="none">
            {/* raised key plate: drop shadow, group-colour disc, white ring, key icon */}
            <View style={{ position: "absolute", width: inner * 0.78, height: inner * 0.78, borderRadius: inner * 0.39, backgroundColor: "rgba(10,12,30,0.35)", transform: [{ translateY: inner * 0.05 }] }} />
            <View style={[styles.badgeRound, { width: inner * 0.78, height: inner * 0.78, borderRadius: inner * 0.39, backgroundColor: gc, borderWidth: Math.max(2, inner * 0.07), borderColor: "#FFFFFF" }]}>
              <Image source={art.icon_key} style={{ width: inner * 0.42, height: inner * 0.42, opacity: open ? 0.75 : 1 }} resizeMode="contain" />
            </View>
            <LetterTag letter={tile.group ?? ""} color={gc} size={inner} />
          </View>
        )}

        {lockedGate && (
          <View style={styles.center} pointerEvents="none">
            {/* a shut door: raised block in the group colour with a padlock */}
            <View style={[styles.fill, { borderRadius: r, backgroundColor: shadeOf(gc) }]} />
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: inner * 0.1, borderRadius: r, backgroundColor: gc }}>
              <View style={{ position: "absolute", left: inner * 0.1, right: inner * 0.1, top: inner * 0.06, height: inner * 0.18, borderRadius: inner * 0.09, backgroundColor: "rgba(255,255,255,0.3)" }} />
            </View>
            <Image source={art.icon_lock} style={{ width: inner * 0.52, height: inner * 0.52, marginBottom: inner * 0.08 }} resizeMode="contain" />
            <LetterTag letter={tile.group ?? ""} color={gc} size={inner} />
          </View>
        )}
        {burst > 0 && <UnlockBurst key={burst} size={inner} r={r} color={gc} />}

        {linked && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -pad * 0.6,
              top: -pad * 0.6,
              right: -pad * 0.6,
              bottom: -pad * 0.6,
              borderRadius: tile.type === "switch" ? inner : r + pad,
              borderWidth: Math.max(2, inner * 0.06),
              borderColor: gc,
              opacity: link.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.85] }),
            }}
          />
        )}
        {spot && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -pad * 1.5,
              top: -pad * 1.5,
              right: -pad * 1.5,
              bottom: -pad * 1.5,
              borderRadius: r + pad * 2,
              borderWidth: Math.max(3, inner * 0.08),
              borderColor: "#FFFFFF",
              opacity: link.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
              transform: [{ scale: link.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
            }}
          />
        )}
      </View>
    </Animated.View>
  );
}

/** An interior wall inside the board: a deliberate terracotta planter with a
 *  round hedge — clearly scenery (warm pot + leaves, its own shadow), never
 *  mistakable for a missing or unpainted tile. */
function Planter({ cell, colors, seed }: { cell: number; colors: Colors; seed: number }) {
  const s = cell;
  const potW = s * 0.62;
  const potH = s * 0.34;
  const leaf = ["#2F8F3E", "#3FAE4F", "#56C463"];
  const flip = seed % 2 === 0;
  return (
    <View pointerEvents="none" style={{ width: s, height: s, alignItems: "center", justifyContent: "flex-end" }}>
      {/* sunken soil bed so the cell reads as a block of the board, not a hole */}
      <View style={{ position: "absolute", left: s * 0.06, top: s * 0.06, width: s * 0.88, height: s * 0.88, borderRadius: s * 0.2, backgroundColor: colors.slotDeep, opacity: 0.55 }} />
      {/* shadow under the pot */}
      <View style={{ position: "absolute", bottom: s * 0.08, width: potW * 1.05, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: "rgba(0,0,0,0.35)" }} />
      {/* hedge: three overlapping leaf balls with a highlight */}
      <View style={{ position: "absolute", top: s * 0.12, width: s * 0.8, height: s * 0.5 }}>
        <View style={{ position: "absolute", left: flip ? 0 : s * 0.3, top: s * 0.12, width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, backgroundColor: leaf[0] }} />
        <View style={{ position: "absolute", left: flip ? s * 0.38 : 0, top: s * 0.1, width: s * 0.4, height: s * 0.4, borderRadius: s * 0.2, backgroundColor: leaf[0] }} />
        <View style={{ position: "absolute", left: s * 0.17, top: 0, width: s * 0.46, height: s * 0.46, borderRadius: s * 0.23, backgroundColor: leaf[1] }} />
        <View style={{ position: "absolute", left: s * 0.26, top: s * 0.06, width: s * 0.16, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: leaf[2] }} />
        {seed % 3 === 0 && <View style={{ position: "absolute", left: flip ? s * 0.55 : s * 0.12, top: s * 0.2, width: s * 0.09, height: s * 0.09, borderRadius: s * 0.045, backgroundColor: "#FFD54A", borderWidth: 1.5, borderColor: "#FFFFFF" }} />}
      </View>
      {/* terracotta pot: rim + tapered body */}
      <View style={{ marginBottom: s * 0.1, alignItems: "center" }}>
        <View style={{ width: potW, height: potH * 0.32, borderRadius: s * 0.04, backgroundColor: "#E07A4C", borderWidth: 1.5, borderColor: "#8E3F22" }} />
        <View style={{ width: potW * 0.84, height: potH * 0.7, borderBottomLeftRadius: s * 0.1, borderBottomRightRadius: s * 0.1, backgroundColor: "#C4602F", borderWidth: 1.5, borderTopWidth: 0, borderColor: "#8E3F22" }}>
          <View style={{ position: "absolute", left: potW * 0.08, top: 2, width: potW * 0.12, bottom: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)" }} />
        </View>
      </View>
    </View>
  );
}

/** A bold arrow (shaft + head) pointing `dir`, with a darker outline so it reads
 *  on bare slots and on fresh paint alike. Plain Views only (no glyph fonts). */
function PadArrow({ size, dir, color, outline }: { size: number; dir: Direction; color: string; outline: string }) {
  const rot = { right: "0deg", down: "90deg", left: "180deg", up: "-90deg" }[dir];
  const shaftW = size * 0.3;
  const shaftH = size * 0.2;
  const head = size * 0.24;
  const arrow = (c: string, k: number) => (
    <View key={k} style={{ position: "absolute", flexDirection: "row", alignItems: "center", transform: [{ scale: k === 0 ? 1.2 : 1 }] }}>
      <View style={{ width: shaftW, height: shaftH, backgroundColor: c, borderTopLeftRadius: shaftH * 0.35, borderBottomLeftRadius: shaftH * 0.35 }} />
      <View style={{ width: 0, height: 0, borderTopWidth: head, borderBottomWidth: head, borderLeftWidth: head * 1.15, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: c }} />
    </View>
  );
  return (
    <View pointerEvents="none" style={[styles.center, { transform: [{ rotate: rot }] }]}>
      {arrow(outline, 0)}
      {arrow(color, 1)}
    </View>
  );
}

/** The group letter on a small white tag — the colour-free cue (colourblind safe). */
function LetterTag({ letter, color, size }: { letter: string; color: string; size: number }) {
  const d = Math.max(14, Math.round(size * 0.34));
  return (
    <View style={{ position: "absolute", right: -size * 0.06, bottom: -size * 0.06, width: d, height: d, borderRadius: d / 2, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: color, alignItems: "center", justifyContent: "center" }}>
      <Txt weight="black" color={color} size={d * 0.62} style={{ lineHeight: d * 0.8 }}>{letter}</Txt>
    </View>
  );
}

/** Darker shade of a #RRGGBB group colour (a block's lip). */
function shadeOf(hex: string, k = 0.68): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** A gate bursting open: the shut block swells and fades, its padlock flies up
 *  and a ring in the group colour blooms out (~450 ms, one shot). */
function UnlockBurst({ size, r, color }: { size: number; r: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 460, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <View pointerEvents="none" style={[styles.center, { overflow: "visible" }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            borderRadius: r,
            backgroundColor: color,
            opacity: t.interpolate({ inputRange: [0, 0.1, 1], outputRange: [1, 0.9, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.fill,
          {
            borderRadius: r * 1.4,
            borderWidth: Math.max(3, size * 0.08),
            borderColor: color,
            opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }) }],
          },
        ]}
      />
      <Animated.Image
        source={art.icon_lock}
        resizeMode="contain"
        style={{
          width: size * 0.52,
          height: size * 0.52,
          opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.9] }) },
            { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-25deg"] }) },
          ],
        }}
      />
    </View>
  );
}

/** Juicy paint: a raised, glossy fill that WIPES onto the tile from the side the
 *  brush rolled in (150 ms), timed to the brush passing over it, with a darker
 *  lip below, a gloss band and specular dot on top, little paint splashes that
 *  lick over its edges, then a rim glow, a gloss sweep and three droplets. */
function PaintBlob({
  size,
  r,
  colors,
  delay,
  from,
}: {
  size: number;
  r: number;
  colors: Colors;
  delay: number;
  from: Direction | null;
  seed?: number;
}) {
  const color = colors.paint;
  const edge = colors.paintEdge;
  const wipeIn = useRef(new Animated.Value(0)).current;
  const fx = useRef(new Animated.Value(0)).current; // rim, gloss, droplets, bloom
  const jelly = useRef(new Animated.Value(0)).current; // -1..1 squash wobble as the paint lands
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(wipeIn, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // Only freshly rolled paint wobbles (not tiles that were already painted on mount).
    if (from) {
      jelly.setValue(0);
      Animated.sequence([
        Animated.delay(delay + 110),
        Animated.timing(jelly, { toValue: 1, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(jelly, { toValue: 0, friction: 2.6, tension: 170, useNativeDriver: true }),
      ]).start();
    }
    Animated.sequence([
      Animated.delay(delay + 60),
      Animated.timing(fx, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [wipeIn, fx, jelly, delay, from]);
  const span = size;
  // The fill slides in from the entry edge, clipped by its rounded frame.
  const d = from ? DIR[from] : { dx: 0, dy: 0 };
  const droplets = useRef(
    [0, 1, 2].map((i) => {
      const angle = (i / 3) * Math.PI * 2 + 0.7;
      return { dx: Math.cos(angle) * size * 0.5, dy: Math.sin(angle) * size * 0.5, r: Math.max(2, size * (0.06 + (i % 2) * 0.03)) };
    })
  ).current;
  const lip = Math.max(2, Math.round(size * 0.1));
  return (
    <>
      {/* glow bloom — expands past the tile then fades */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          borderRadius: r * 1.2,
          backgroundColor: edge,
          opacity: fx.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.5, 0] }),
          transform: [{ scale: fx.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.4] }) }],
        }}
      />
      {/* drop shadow: the paint sits raised above the board */}
      <Animated.View style={{ position: "absolute", left: 1, right: -1, top: size * 0.08, bottom: -size * 0.05, borderRadius: r, backgroundColor: "rgba(8,14,30,0.35)", opacity: wipeIn }} />
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: span,
          height: span,
          borderRadius: r,
          overflow: "hidden",
          transform: [
            { scaleX: jelly.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.94, 1, 1.1] }) },
            { scaleY: jelly.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.06, 1, 0.88] }) },
          ],
        }}
      >
        <Animated.View
          style={{
            width: span,
            height: span,
            backgroundColor: colors.paintDeep,
            opacity: from ? 1 : wipeIn,
            transform: from
              ? [
                  { translateX: wipeIn.interpolate({ inputRange: [0, 1], outputRange: [-d.dx * span, 0] }) },
                  { translateY: wipeIn.interpolate({ inputRange: [0, 1], outputRange: [-d.dy * span, 0] }) },
                ]
              : [{ scale: wipeIn.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        >
          {/* raised body over its darker lip */}
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: lip, borderRadius: r, backgroundColor: color }} />
          {/* lower half a touch deeper: a two-tone gradient */}
          <View style={{ position: "absolute", left: 0, right: 0, top: span * 0.5, bottom: lip, borderBottomLeftRadius: r, borderBottomRightRadius: r, backgroundColor: colors.paintDeep, opacity: 0.22 }} />
          {/* gloss band + specular dot */}
          <View style={{ position: "absolute", left: "12%", right: "12%", top: "8%", height: "28%", borderRadius: size * 0.16, backgroundColor: "#FFFFFF", opacity: 0.36 }} />
          <View style={{ position: "absolute", left: "16%", top: "12%", width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: "#FFFFFF", opacity: 0.8 }} />
          {/* glossy diagonal wipe that sweeps across the fresh fill once */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -size * 0.3,
              bottom: -size * 0.3,
              width: size * 0.5,
              backgroundColor: "#FFFFFF",
              opacity: fx.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.4, 0.2, 0] }),
              transform: [
                { rotate: "18deg" },
                { translateX: fx.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.7, size * 0.9] }) },
              ],
            }}
          />
          {/* own outline: each painted tile keeps a crisp darker rim */}
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: r, borderWidth: Math.max(1.5, size * 0.035), borderColor: colors.paintDeep }} />
        </Animated.View>
      </Animated.View>
      {/* quick rim-glow ring — the snappy "paint lands" pop */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          borderRadius: r * 1.1,
          borderWidth: Math.max(1.5, size * 0.05),
          borderColor: edge,
          opacity: fx.interpolate({ inputRange: [0, 0.05, 0.4, 1], outputRange: [0, 0.9, 0.4, 0] }),
          transform: [{ scale: fx.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.9, 1.1, 1.14] }) }],
        }}
      />
      {/* 3 paint droplets flung out as the tile fills, then settling */}
      {droplets.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: size / 2 - p.r,
            top: size / 2 - p.r,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: p.r,
            backgroundColor: color,
            opacity: fx.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.9, 0.7, 0] }),
            transform: [
              { translateX: fx.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: fx.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
            ],
          }}
        />
      ))}
    </>
  );
}

/** ~110 ms glow flash on the tile a stroke starts from — the swipe is
 *  acknowledged on the very frame it commits. */
function OriginFlash({ x, y, cell, color }: { x: number; y: number; cell: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x * cell + cell * 0.04,
        top: y * cell + cell * 0.04,
        width: cell * 0.92,
        height: cell * 0.92,
        borderRadius: cell * 0.24,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.12] }) }],
      }}
    />
  );
}

/** Undo / Reset: the paint that is going away shrinks back off its tiles in
 *  order (farthest from the brush first) over REWIND_MS, so the board visibly
 *  rewinds instead of cutting. Reset adds a soft gloss wipe across the board. */
function RewindPaint({ rewind, cell, colors, width, height }: { rewind: Rewind; cell: number; colors: Colors; width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const wipe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: REWIND_MS, easing: Easing.linear, useNativeDriver: true }).start();
    if (rewind.wipe) Animated.timing(wipe, { toValue: 1, duration: REWIND_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [t, wipe, rewind.wipe]);
  const maxRank = Math.max(1, ...rewind.tiles.map((p) => p.rank + 1));
  const pad = Math.max(1, Math.round(cell * GAP));
  const inner = cell - pad * 2;
  const inset = 0;
  const span = inner;
  return (
    <>
      {rewind.tiles.map((p) => {
        // Each tile's window inside the shared clock: starts staggered, lasts
        // ~45% of the total so neighbours overlap into one smooth retreat.
        const start = Math.min(0.55, (p.rank / maxRank) * 0.55);
        const end = start + 0.45;
        return (
          <Animated.View
            key={`${p.x},${p.y}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: p.x * cell + pad + inset,
              top: p.y * cell + pad + inset,
              width: span,
              height: span,
              borderRadius: inner * 0.24,
              backgroundColor: colors.paint,
              opacity: t.interpolate({ inputRange: [0, start, end, 1], outputRange: [1, 1, 0, 0] }),
              transform: [{ scale: t.interpolate({ inputRange: [0, start, end, 1], outputRange: [1, 1.06, 0.2, 0.2] }) }],
            }}
          />
        );
      })}
      {rewind.wipe && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -height * 0.25,
            height: height * 1.5,
            width: Math.max(cell * 1.4, width * 0.35),
            backgroundColor: "#FFFFFF",
            opacity: wipe.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.32, 0.32, 0] }),
            transform: [
              { translateX: wipe.interpolate({ inputRange: [0, 1], outputRange: [width * 1.1, -width * 0.6] }) },
              { rotate: "14deg" },
            ],
          }}
        />
      )}
    </>
  );
}

/** The path preview: a translucent paint streak that shoots from the brush to
 *  the stroke's end on the very first frame, then fades as the real paint
 *  catches up — the move reads instantly, before the brush has gone far. A
 *  stroke bent by turn pads draws one streak per straight run, each shooting
 *  out as the previous one reaches its corner. */
function Streak({
  run,
  delay,
  dur,
  fadeAt,
  cell,
  color,
}: {
  run: { x: number; y: number; dir: Direction; len: number };
  delay: number;
  dur: number;
  fadeAt: number;
  cell: number;
  color: string;
}) {
  const t = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(t, { toValue: 1, duration: Math.max(50, dur), easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(fadeAt),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [t, fade, delay, dur, fadeAt]);
  const { dx, dy } = DIR[run.dir];
  const toX = run.x + dx * run.len;
  const toY = run.y + dy * run.len;
  const thick = cell * 0.42;
  const lenCells = run.len + 1;
  const horizontal = dx !== 0;
  const left = Math.min(run.x, toX) * cell + (horizontal ? cell * 0.18 : (cell - thick) / 2);
  const top = Math.min(run.y, toY) * cell + (horizontal ? (cell - thick) / 2 : cell * 0.18);
  const width = horizontal ? lenCells * cell - cell * 0.36 : thick;
  const height = horizontal ? thick : lenCells * cell - cell * 0.36;
  const origin = run.dir === "right" ? "left" : run.dir === "left" ? "right" : run.dir === "down" ? "top" : "bottom";
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: thick / 2,
        backgroundColor: color,
        opacity: Animated.multiply(fade, 0.5),
        overflow: "hidden",
        transformOrigin: origin,
        transform: horizontal ? [{ scaleX: t }] : [{ scaleY: t }],
      }}
    >
      {/* liquid shimmer: a white highlight that runs along the wet trail */}
      <Animated.View
        style={{
          position: "absolute",
          left: horizontal ? 0 : thick * 0.2,
          top: horizontal ? thick * 0.2 : 0,
          width: horizontal ? cell * 0.9 : thick * 0.35,
          height: horizontal ? thick * 0.35 : cell * 0.9,
          borderRadius: thick,
          backgroundColor: "#FFFFFF",
          opacity: 0.7,
          transform: horizontal
            ? [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: run.dir === "left" ? [width, 0] : [0, width - cell * 0.9] }) }]
            : [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: run.dir === "up" ? [height, 0] : [0, height - cell * 0.9] }) }],
        }}
      />
    </Animated.View>
  );
}

/** Paint droplets that burst from the brush when it hits the wall. */
function Specks({ spray, cell, color, dir, power = 1 }: { spray: Animated.Value; cell: number; color: string; dir: { dx: number; dy: number }; power?: number }) {
  // Fan the burst back away from the wall it struck (a splash, not a ring).
  // Longer strokes hit harder: more, bigger droplets flung farther.
  const n = Math.round(8 + power * 3);
  const specks = useRef(
    Array.from({ length: n }, (_, i) => {
      const spread = (i / Math.max(1, n - 1) - 0.5) * Math.PI * 1.4;
      return { a: spread, dist: cell * (0.45 + (i % 3) * 0.14) * (0.8 + power * 0.25), size: (3 + (i % 3) * 1.6) * (0.85 + power * 0.2) };
    })
  ).current;
  const base = Math.atan2(-dir.dy, -dir.dx);
  return (
    <>
      {specks.map((p, i) => {
        const ang = base + p.a;
        const tx = Math.cos(ang) * p.dist;
        const ty = Math.sin(ang) * p.dist;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: cell / 2 + (dir.dx * cell) / 2.6 - p.size / 2,
              top: cell / 2 + (dir.dy * cell) / 2.6 - p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: p.size,
              backgroundColor: color,
              opacity: spray.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.95, 0] }),
              transform: [
                { translateX: spray.interpolate({ inputRange: [0, 1], outputRange: [0, tx] }) },
                { translateY: spray.interpolate({ inputRange: [0, 1], outputRange: [0, ty] }) },
                { scale: spray.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.2, 0.5] }) },
              ],
            }}
          />
        );
      })}
    </>
  );
}

/** How far the brush knocks into a wall before bouncing back: 4-6 px. */
function knockPx(cell: number): number {
  return Math.max(4, Math.min(6, cell * 0.1));
}

/** The brush mascot: rolls to the end of each stroke (eased, stretched along the
 *  axis), squashes + knocks back on the wall, sprays droplets, bobs at rest and
 *  dips under the finger while it is down. */
function Brush({
  engine,
  cell,
  colors,
  hintDir,
  stroke,
  bump,
  press,
}: {
  engine: PathEngine;
  cell: number;
  colors: Colors;
  hintDir: Direction | null;
  stroke: Stroke | null;
  bump: Bump | null;
  press?: Animated.Value;
}) {
  const pos = useRef(new Animated.ValueXY({ x: engine.cursorX * cell, y: engine.cursorY * cell })).current;
  const spray = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const sx = useRef(new Animated.Value(1)).current;
  const sy = useRef(new Animated.Value(1)).current;
  const lean = useRef(new Animated.Value(0)).current; // -1 = left/up, +1 = right/down
  const knock = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current; // px toward the wall
  const lastStroke = useRef<number | null>(stroke?.id ?? null);
  const lastBump = useRef<number | null>(bump?.id ?? null);
  const idle = useRef(new Animated.Value(0)).current;
  const pressV = press ?? idle;

  // Pop the brush in just after the board tiles land.
  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, delay: 180, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [entrance]);

  // Roll (or snap, for undo / reset / screenshot replays).
  useEffect(() => {
    const target = { x: engine.cursorX * cell, y: engine.cursorY * cell };
    if (!stroke || stroke.id === lastStroke.current) {
      lastStroke.current = stroke?.id ?? null;
      // Undo / reset: roll back over the rewind window instead of snapping.
      Animated.timing(pos, { toValue: target, duration: REWIND_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
      return;
    }
    lastStroke.current = stroke.id;
    const D = travelMs(stroke.steps);
    const d = DIR[stroke.endDir];
    const horizontal = d.dx !== 0;
    const kpx = knockPx(cell);
    const along = horizontal ? sx : sy;
    const across = horizontal ? sy : sx;

    pos.stopAnimation();
    const runs = strokeRuns(stroke);
    if (runs.length <= 1) {
      Animated.timing(pos, { toValue: target, duration: D, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      // Bent by turn pads: roll corner to corner on the same eased-out clock the
      // paint wipes use (each leg linear between its corner times).
      pos.setValue({ x: stroke.fromX * cell, y: stroke.fromY * cell });
      Animated.sequence(
        runs.map((run) => {
          const end = stroke.path[run.at + run.len - 1];
          const t0 = timeFrac(run.at, stroke.steps) * D;
          const t1 = timeFrac(run.at + run.len, stroke.steps) * D;
          return Animated.timing(pos, { toValue: { x: end.x * cell, y: end.y * cell }, duration: Math.max(16, Math.round(t1 - t0)), easing: Easing.linear, useNativeDriver: true });
        })
      ).start();
    }

    // Stretch along the roll the instant the swipe lands, squash flat against
    // the wall on impact, then spring back round.
    along.setValue(1.28);
    across.setValue(0.8);
    Animated.parallel([
      Animated.sequence([
        Animated.delay(D - 40),
        Animated.timing(along, { toValue: 0.74, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(along, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(D - 40),
        Animated.timing(across, { toValue: 1.22, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(across, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
      ]),
    ]).start();

    // Lean into the roll, settle upright after the hit.
    lean.setValue(horizontal ? d.dx : d.dy);
    Animated.sequence([
      Animated.delay(D),
      Animated.spring(lean, { toValue: 0, friction: 5, tension: 140, useNativeDriver: true }),
    ]).start();

    // Knock into the wall and rebound.
    knock.setValue({ x: 0, y: 0 });
    Animated.sequence([
      Animated.delay(D),
      Animated.timing(knock, { toValue: { x: d.dx * kpx, y: d.dy * kpx }, duration: 50, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(knock, { toValue: { x: 0, y: 0 }, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();

    // Impact splash + ripple at the wall.
    spray.setValue(0);
    ripple.setValue(0);
    Animated.sequence([Animated.delay(D - 20), Animated.timing(spray, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true })]).start();
    Animated.sequence([Animated.delay(D - 20), Animated.timing(ripple, { toValue: 1, duration: 340, useNativeDriver: true })]).start();
  }, [engine.cursorX, engine.cursorY, cell, stroke, pos, spray, ripple, sx, sy, lean, knock]);

  // Swipe straight into a wall: knock against it so the touch still answers.
  useEffect(() => {
    if (!bump || bump.id === lastBump.current) return;
    lastBump.current = bump.id;
    const b = DIR[bump.dir];
    const kpx = knockPx(cell);
    knock.setValue({ x: 0, y: 0 });
    // Same splash as a stroke's impact, so a swipe into a wall reads as a hit.
    spray.setValue(0);
    Animated.timing(spray, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.timing(knock, { toValue: { x: b.dx * kpx, y: b.dy * kpx }, duration: 50, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(knock, { toValue: { x: 0, y: 0 }, friction: 3, tension: 240, useNativeDriver: true }),
    ]).start();
    const horizontal = DIR[bump.dir].dx !== 0;
    (horizontal ? sx : sy).setValue(0.82);
    (horizontal ? sy : sx).setValue(1.14);
    Animated.parallel([
      Animated.spring(sx, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
      Animated.spring(sy, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start();
  }, [bump, cell, knock, sx, sy, spray]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const arrow: Record<Direction, string> = { up: "↑", down: "↓", left: "←", right: "→" };
  const brushSize = cell * 1.0;
  // The splash fans back from whichever wall was hit last (stroke or bump).
  const bumpLast = !!bump && (!stroke || bump.id > stroke.id);
  const lastDir = bumpLast ? bump!.dir : stroke?.endDir;
  const kd = lastDir ? DIR[lastDir] : { dx: 1, dy: 0 };
  // Impact power 1..4 from the stroke length (a bump is a light 1).
  const power = stroke && !bumpLast ? Math.min(4, 1 + Math.floor(stroke.steps / 2)) : 1;

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: "absolute", width: cell, height: cell, transform: pos.getTranslateTransform() }}
    >
      <Specks key={`${kd.dx},${kd.dy},${power}`} spray={spray} cell={cell} color={colors.paintEdge} dir={kd} power={power} />
      {/* touch halo — blooms under the brush the instant a finger lands */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: cell * 0.04,
          top: cell * 0.04,
          width: cell * 0.92,
          height: cell * 0.92,
          borderRadius: cell * 0.46,
          backgroundColor: colors.paintEdge,
          opacity: pressV.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
          transform: [{ scale: pressV.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.12] }) }],
        }}
      />
      {/* touch-down burst ring: a crisp ring snaps out from the brush with the finger */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: cell,
          height: cell,
          borderRadius: cell / 2,
          borderWidth: Math.max(3, cell * 0.06),
          borderColor: "#FFFFFF",
          opacity: pressV.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.95, 0.55] }),
          transform: [{ scale: pressV.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) }],
        }}
      />
      {/* wet paint pooling under the brush tip (the chapter's brush colour) — deepens while pressed */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: cell * 0.14,
          bottom: cell * 0.06,
          width: cell * 0.72,
          height: cell * 0.24,
          borderRadius: cell * 0.12,
          backgroundColor: colors.paintDeep,
          opacity: pressV.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.85] }),
          transform: [{ scaleX: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
        }}
      />
      {/* impact ripple */}
      <Animated.View
        style={{
          position: "absolute",
          left: cell * 0.1,
          top: cell * 0.1,
          width: cell * 0.8,
          height: cell * 0.8,
          borderRadius: cell * 0.4,
          borderColor: colors.paintEdge,
          borderWidth: 2 + power,
          opacity: ripple.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.85, 0] }),
          transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.4 + power * 0.25] }) }],
        }}
      />
      <Animated.View
        style={{
          position: "absolute",
          left: (cell - brushSize) / 2,
          top: (cell - brushSize) / 2,
          width: brushSize,
          height: brushSize,
          opacity: entrance,
          transform: [
            ...knock.getTranslateTransform(),
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -cell * 0.06] }) },
            { rotate: lean.interpolate({ inputRange: [-1, 1], outputRange: ["-9deg", "9deg"] }) },
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
            // touch-down squash: the brush presses flat into the tile (≤80 ms)
            { translateY: pressV.interpolate({ inputRange: [0, 1], outputRange: [0, cell * 0.08] }) },
            { scaleX: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) },
            { scaleY: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) },
            { scaleX: sx },
            { scaleY: sy },
          ],
        }}
      >
        <Image source={art.character_brush_mascot} style={styles.fill} resizeMode="contain" />
      </Animated.View>
      {hintDir && (
        <Txt weight="display" style={{ position: "absolute", left: 0, top: -cell * 0.1, width: cell, textAlign: "center" }} color={colors.accent} size={cell * 0.5}>
          {arrow[hintDir]}
        </Txt>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: { position: "relative", overflow: "hidden", borderWidth: 2, borderTopWidth: 3 },
  frameGloss: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: "rgba(255,255,255,0.08)" },
  frameLip: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.18)" },
  row: { flexDirection: "row" },
  fill: { position: "absolute", width: "100%", height: "100%" },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  badgeRound: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  badgeSquare: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
