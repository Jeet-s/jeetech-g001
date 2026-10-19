import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { art } from "../art";
import type { PathEngine, Direction, Tile } from "../game/PathEngine";
import type { Colors } from "../game/theme";
import { Txt } from "./Txt";

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
 *             and starts rolling (eased out, ~40 ms per tile, ≤ 340 ms total);
 *   per tile  each tile's paint wipes in from the side the brush entered,
 *             timed to the brush passing it, with a 1.07 micro-pop of the tile
 *             itself, a rim pop + droplets;
 *   impact    the brush squashes against the wall, knocks 4-6 px into it and
 *             bounces back, the board jolts 3 px and 10 paint droplets spray
 *             off the end tile (~260 ms fade).
 * A swipe into a wall still answers: the brush knocks against it and splashes.
 * Undo / Reset rewind: the removed paint shrinks away tile by tile, farthest
 * first, while the brush rolls back (~260 ms) — never a hard cut.
 */

/** A committed stroke — drives the per-tile paint timing and the brush roll. */
export interface Stroke {
  id: number;
  fromX: number;
  fromY: number;
  dir: Direction;
  steps: number;
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

/** How long the brush takes to roll `steps` tiles. Short strokes still read. */
export function travelMs(steps: number): number {
  return Math.min(340, 90 + steps * 40);
}

/** When (ms after the swipe) the brush is halfway into the i-th tile (1-based)
 *  of an eased-out roll — the inverse of Easing.out(quad). */
function tileDelay(i: number, steps: number): number {
  const p = Math.min(1, (i - 0.5) / steps);
  return Math.round(travelMs(steps) * (1 - Math.sqrt(1 - p)));
}

/** Each switch + its gate share a group colour so sequencing reads at a glance. */
export function groupColor(group: string | undefined, c: Colors): string {
  switch (group) {
    case "A": return c.paint;
    case "B": return c.switch;
    case "C": return c.gate;
    case "D": return c.accent;
    default: return c.paint;
  }
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
}: {
  engine: PathEngine;
  cell: number;
  colors: Colors;
  hintDir: Direction | null;
  stroke?: Stroke | null;
  bump?: Bump | null;
  /** 0..1 while a finger is down on the board (instant press feedback). */
  press?: Animated.Value;
  rewind?: Rewind | null;
}) {
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
    if (stroke) jolt(stroke.dir, travelMs(stroke.steps), 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stroke?.id]);
  useEffect(() => {
    if (bump) jolt(bump.dir, 40, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump?.id]);

  return (
    <Animated.View
      style={[
        styles.board,
        {
          width: w,
          height: h,
          backgroundColor: colors.board,
          transform: shake.getTranslateTransform(),
        },
      ]}
    >
      {engine.tiles.map((row, y) => (
        <View key={y} style={styles.row}>
          {row.map((tile, x) => {
            let delay = 0;
            let from: Direction | null = null;
            let popKey = 0;
            let popDelay = 0;
            if (stroke) {
              const { dx, dy } = DIR[stroke.dir];
              const i = dx !== 0 ? (x - stroke.fromX) * dx : (y - stroke.fromY) * dy;
              const inLine = dx !== 0 ? y === stroke.fromY : x === stroke.fromX;
              if (inLine && i >= 1 && i <= stroke.steps) {
                delay = tileDelay(i, stroke.steps);
                from = stroke.dir;
              }
              // Origin tile pops on commit; every rolled-over tile micro-pops as
              // the brush passes it.
              if (inLine && i >= 0 && i <= stroke.steps) {
                popKey = stroke.id;
                popDelay = i === 0 ? 0 : delay;
              }
            }
            const underBrush = x === engine.cursorX && y === engine.cursorY;
            return (
              <TileCell
                key={x}
                tile={tile}
                cell={cell}
                order={x + y}
                painted={engine.isPainted(x, y)}
                open={!!tile.group && engine.openGroups.has(tile.group)}
                colors={colors}
                paintDelay={delay}
                paintFrom={from}
                popKey={popKey}
                popDelay={popDelay}
                origin={popKey !== 0 && popDelay === 0}
                pressV={underBrush && press ? press : REST}
              />
            );
          })}
        </View>
      ))}
      {stroke && <OriginFlash key={`o${stroke.id}`} x={stroke.fromX} y={stroke.fromY} cell={cell} color={colors.paintEdge} />}
      {rewind && <RewindPaint key={`r${rewind.id}`} rewind={rewind} cell={cell} colors={colors} width={w} height={h} />}
      {stroke && <Streak key={stroke.id} stroke={stroke} cell={cell} color={colors.paint} />}
      <Brush engine={engine} cell={cell} colors={colors} hintDir={hintDir} stroke={stroke ?? null} bump={bump ?? null} press={press} />
    </Animated.View>
  );
}

const GAP = 0.055; // fraction of a cell left as grout between tiles

function TileCell({
  tile,
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
}: {
  tile: Tile;
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
}) {
  // Entrance: pop in once on mount with a short diagonal stagger + upward drift.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      delay: Math.min(order * 22, 340),
      easing: Easing.out(Easing.back(1.4)),
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

  if (tile.type === "wall") return <View style={{ width: cell, height: cell }} />;
  const pad = Math.max(1, Math.round(cell * GAP));
  const inner = cell - pad * 2;
  const gc = groupColor(tile.group, colors);
  const base = tile.type === "crumble" ? art.sprite_crumble_tile : art.sprite_board_tile;

  return (
    <Animated.View
      style={{
        width: cell,
        height: cell,
        padding: pad,
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, origin ? 1.09 : 1.07] }) },
          { scale: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
        ],
      }}
    >
      <View style={{ width: inner, height: inner }}>
        <Image source={base} style={styles.fill} resizeMode="stretch" />
        {/* touch glow while the finger is down on the brush's tile */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              borderRadius: inner * 0.22,
              borderWidth: Math.max(2, inner * 0.06),
              borderColor: colors.paintEdge,
              backgroundColor: colors.paintEdge + "33",
              opacity: pressV,
            },
          ]}
        />
        {painted && <PaintBlob size={inner} color={colors.paint} edge={colors.paintEdge} delay={paintDelay} from={paintFrom} />}

        {tile.type === "switch" && (
          <View style={styles.center} pointerEvents="none">
            <Image source={art.sprite_switch_pad} style={styles.fill} resizeMode="contain" />
            <View
              style={[
                styles.badgeRound,
                { width: inner * 0.5, height: inner * 0.5, borderRadius: inner * 0.25, backgroundColor: gc, borderColor: open ? colors.onPaint : "transparent" },
              ]}
            >
              <Txt weight="black" color={colors.onPaint} size={inner * 0.26}>{tile.group}</Txt>
            </View>
          </View>
        )}

        {tile.type === "gate" && !painted && (
          <View style={styles.center} pointerEvents="none">
            {/* sprite_gate is a 2-state sheet (locked on top, open below): crop to
                the matching half instead of squishing the whole thing. */}
            <View style={{ width: inner, height: inner, borderRadius: inner * 0.18, overflow: "hidden", opacity: open ? 0.5 : 1 }}>
              <Image
                source={art.sprite_gate}
                style={{ width: inner, height: inner * 2, transform: [{ translateY: open ? -inner : 0 }] }}
                resizeMode="stretch"
              />
            </View>
            <View
              style={[
                styles.badgeSquare,
                { width: inner * 0.44, height: inner * 0.44, borderRadius: inner * 0.12, borderColor: gc, backgroundColor: open ? "transparent" : gc },
              ]}
            >
              <Txt weight="black" color={open ? gc : colors.onPaint} size={inner * 0.24}>{(tile.group ?? "").toLowerCase()}</Txt>
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/** Creamy paint that WIPES onto the tile from the side the brush rolled in
 *  (150 ms), timed to the brush passing over it, then pops a rim glow, sweeps a
 *  gloss highlight and flings three droplets. */
function PaintBlob({
  size,
  color,
  edge,
  delay,
  from,
}: {
  size: number;
  color: string;
  edge: string;
  delay: number;
  from: Direction | null;
}) {
  const wipeIn = useRef(new Animated.Value(0)).current;
  const fx = useRef(new Animated.Value(0)).current; // rim, gloss, droplets, bloom
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(wipeIn, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(delay + 60),
      Animated.timing(fx, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [wipeIn, fx, delay]);
  const inset = Math.round(size * 0.1);
  const span = size - inset * 2;
  // The fill slides in from the entry edge, clipped by its rounded frame.
  const d = from ? DIR[from] : { dx: 0, dy: 0 };
  const droplets = useRef(
    [0, 1, 2].map((i) => {
      const angle = (i / 3) * Math.PI * 2 + 0.7;
      return { dx: Math.cos(angle) * size * 0.46, dy: Math.sin(angle) * size * 0.46, r: Math.max(2, size * (0.06 + (i % 2) * 0.03)) };
    })
  ).current;
  return (
    <>
      {/* glow bloom — expands past the tile then fades */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: inset,
          top: inset,
          right: inset,
          bottom: inset,
          borderRadius: size * 0.3,
          backgroundColor: edge,
          opacity: fx.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.5, 0] }),
          transform: [{ scale: fx.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.45] }) }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: inset,
          top: inset,
          width: span,
          height: span,
          borderRadius: size * 0.26,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            width: span,
            height: span,
            backgroundColor: color,
            opacity: from ? 1 : wipeIn,
            transform: from
              ? [
                  { translateX: wipeIn.interpolate({ inputRange: [0, 1], outputRange: [-d.dx * span, 0] }) },
                  { translateY: wipeIn.interpolate({ inputRange: [0, 1], outputRange: [-d.dy * span, 0] }) },
                ]
              : [{ scale: wipeIn.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        >
          <View
            style={{
              position: "absolute",
              left: "16%",
              top: "12%",
              width: "44%",
              height: "34%",
              borderRadius: size * 0.2,
              backgroundColor: edge,
              opacity: 0.55,
            }}
          />
          {/* glossy diagonal wipe that sweeps across the fresh fill once */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -size * 0.3,
              bottom: -size * 0.3,
              width: size * 0.5,
              backgroundColor: "#FFFFFF",
              opacity: fx.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.35, 0.18, 0] }),
              transform: [
                { rotate: "18deg" },
                { translateX: fx.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.7, size * 0.9] }) },
              ],
            }}
          />
        </Animated.View>
      </View>
      {/* quick rim-glow ring — the snappy "paint lands" pop */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: inset,
          top: inset,
          right: inset,
          bottom: inset,
          borderRadius: size * 0.3,
          borderWidth: Math.max(1.5, size * 0.05),
          borderColor: edge,
          opacity: fx.interpolate({ inputRange: [0, 0.05, 0.4, 1], outputRange: [0, 0.9, 0.4, 0] }),
          transform: [{ scale: fx.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.85, 1.1, 1.14] }) }],
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
  const inset = Math.round(inner * 0.1);
  const span = inner - inset * 2;
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
              borderRadius: inner * 0.26,
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
 *  catches up — the move reads instantly, before the brush has gone far. */
function Streak({ stroke, cell, color }: { stroke: Stroke; cell: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const D = travelMs(stroke.steps);
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: Math.max(70, D * 0.35), easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(D),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [t, fade, D]);
  const { dx, dy } = DIR[stroke.dir];
  const toX = stroke.fromX + dx * stroke.steps;
  const toY = stroke.fromY + dy * stroke.steps;
  const thick = cell * 0.42;
  const lenCells = stroke.steps + 1;
  const horizontal = dx !== 0;
  const left = Math.min(stroke.fromX, toX) * cell + (horizontal ? cell * 0.18 : (cell - thick) / 2);
  const top = Math.min(stroke.fromY, toY) * cell + (horizontal ? (cell - thick) / 2 : cell * 0.18);
  const width = horizontal ? lenCells * cell - cell * 0.36 : thick;
  const height = horizontal ? thick : lenCells * cell - cell * 0.36;
  const origin = stroke.dir === "right" ? "left" : stroke.dir === "left" ? "right" : stroke.dir === "down" ? "top" : "bottom";
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
        opacity: Animated.multiply(fade, 0.38),
        transformOrigin: origin,
        transform: horizontal ? [{ scaleX: t }] : [{ scaleY: t }],
      }}
    />
  );
}

/** Paint droplets that burst from the brush when it hits the wall. */
function Specks({ spray, cell, color, dir }: { spray: Animated.Value; cell: number; color: string; dir: { dx: number; dy: number } }) {
  // Fan the burst back away from the wall it struck (a splash, not a ring).
  const specks = useRef(
    Array.from({ length: 10 }, (_, i) => {
      const spread = (i / 9 - 0.5) * Math.PI * 1.3;
      return { a: spread, dist: cell * (0.45 + (i % 3) * 0.12), size: 3 + (i % 3) * 1.5 };
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
    const d = DIR[stroke.dir];
    const horizontal = d.dx !== 0;
    const kpx = knockPx(cell);
    const along = horizontal ? sx : sy;
    const across = horizontal ? sy : sx;

    pos.stopAnimation();
    Animated.timing(pos, { toValue: target, duration: D, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();

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
  const brushSize = cell * 0.82;
  // The splash fans back from whichever wall was hit last (stroke or bump).
  const lastDir = bump && (!stroke || bump.id > stroke.id) ? bump.dir : stroke?.dir;
  const kd = lastDir ? DIR[lastDir] : { dx: 1, dy: 0 };

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: "absolute", width: cell, height: cell, transform: pos.getTranslateTransform() }}
    >
      <Specks key={`${kd.dx},${kd.dy}`} spray={spray} cell={cell} color={colors.paintEdge} dir={kd} />
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
      {/* contact shadow — deepens while pressed */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: cell * 0.2,
          bottom: cell * 0.08,
          width: cell * 0.6,
          height: cell * 0.18,
          borderRadius: cell * 0.09,
          backgroundColor: "rgba(20,24,40,0.28)",
          opacity: pressV.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
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
          borderWidth: 2,
          borderColor: colors.paintEdge,
          opacity: ripple.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.75, 0] }),
          transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
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
            { scale: pressV.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) },
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
  board: { borderRadius: 18, overflow: "hidden", position: "relative" },
  row: { flexDirection: "row" },
  fill: { position: "absolute", width: "100%", height: "100%" },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  badgeRound: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  badgeSquare: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
