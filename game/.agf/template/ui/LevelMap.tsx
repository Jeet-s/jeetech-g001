import { memo, useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Canvas, Group, Path, Skia, DashPathEffect } from "@shopify/react-native-skia";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { MiniStars } from "./Stars";
import { fonts, palette, shadow } from "./theme";
import { Tappable } from "./Tappable";

const NODE = 70;
const GAP = 112;
const BANNER_GAP = 76; // extra room where a chapter starts, so its banner never covers a node
// The path is drawn in canvas tiles: one canvas the height of a long map exceeds the GPU's texture limit (16384 px —
// 120 levels at 2.6x density is ~35000 px), which draws nothing on phones and crashed the QA emulator (2026-10-26).
const TILE = 2000;

export interface MapLevel {
  id: string;
  number: number;
  stars: number; // 0-3, -1 = locked
  chapter?: string; // shown as a banner where it changes
}

function Pulse() {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withSequence(withTiming(1.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 2 - s.value * 1.2 }));
  return <Animated.View style={[styles.pulse, style]} />;
}

/**
 * Candy-style winding level map (bottom = level 1). Done levels show stars,
 * the current level pulses, future levels are locked. Nodes squash + dim on touch-down (Tappable) — "level-select
 * tile press feedback is barely visible" was a game_feel finding (2026-10-21). Memoised: its path canvases only
 * redraw when the levels / size change (pass a memoised `levels` and a stable `onSelect`).
 */
export const LevelMap = memo(LevelMapView);

function LevelMapView({
  levels,
  current,
  onSelect,
  header,
  padTop = 120,
  padBottom = 200,
}: {
  levels: MapLevel[];
  current: number;
  onSelect: (l: MapLevel) => void;
  header?: React.ReactNode;
  padTop?: number; // space covered by the HUD
  padBottom?: number; // space covered by the bottom buttons
}) {
  const { width, height: winH } = useWindowDimensions();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { pos, height } = useMemo(() => {
    // Distance of each node above the bottom of the map; chapter starts get extra room for their banner.
    let up = 0;
    const offs = levels.map((l, i) => {
      if (i > 0) up += GAP;
      if (l.chapter && l.chapter !== levels[i - 1]?.chapter) up += BANNER_GAP;
      return up;
    });
    const h = padBottom + NODE / 2 + up + NODE / 2 + padTop;
    return {
      height: Math.max(h, winH),
      pos: offs.map((o, i) => ({ x: width / 2 + Math.sin(i * 0.9) * (width * 0.28), y: Math.max(h, winH) - padBottom - NODE / 2 - o })),
    };
  }, [levels, width, winH, padTop, padBottom]);
  const path = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    pos.forEach((q, i) => {
      if (i === 0) b.moveTo(q.x, q.y);
      else {
        const prev = pos[i - 1];
        b.cubicTo(prev.x, prev.y - GAP / 2, q.x, q.y + GAP / 2, q.x, q.y);
      }
    });
    return b.detach();
  }, [pos]);
  useEffect(() => {
    // Centre the current level in the visible band between the HUD and the bottom buttons.
    const y = pos[Math.max(0, current - 1)]?.y ?? 0;
    const target = Math.min(height - winH, Math.max(0, y - (padTop + (winH - padTop - padBottom) / 2)));
    const id = setTimeout(() => scroll.current?.scrollTo({ y: target, animated: false }), 50);
    return () => clearTimeout(id);
  }, [current, pos, height, winH, padTop, padBottom]);

  return (
    <ScrollView ref={scroll} contentContainerStyle={{ height }} showsVerticalScrollIndicator={false}>
      {header}
      {Array.from({ length: Math.ceil(height / TILE) }, (_, k) => (
        <Canvas key={k} style={{ position: "absolute", left: 0, top: k * TILE, width, height: Math.min(TILE, height - k * TILE) }} pointerEvents="none">
          <Group transform={[{ translateY: -k * TILE }]}>
            <Path path={path} style="stroke" strokeWidth={18} color="rgba(0,0,0,0.25)" strokeCap="round" />
            <Path path={path} style="stroke" strokeWidth={10} color="rgba(255,255,255,0.55)" strokeCap="round">
              <DashPathEffect intervals={[2, 22]} />
            </Path>
          </Group>
        </Canvas>
      ))}
      {levels.map((l, i) => {
        const locked = l.stars < 0;
        const isCurrent = l.number === current;
        const showBanner = l.chapter && l.chapter !== levels[i - 1]?.chapter;
        return (
          <View key={l.id}>
            {showBanner ? (
              <View style={[styles.banner, { top: pos[i].y + NODE / 2 + (GAP + BANNER_GAP - NODE) / 2 - 22 }]}>
                <Text style={styles.bannerText}>{l.chapter}</Text>
              </View>
            ) : null}
            <Tappable
              disabled={locked}
              sound="pop"
              hapticKind="medium"
              scaleTo={0.85}
              onPress={() => onSelect(l)}
              accessibilityLabel={`Level ${l.number}`}
              containerStyle={[styles.nodeWrap, { left: pos[i].x - NODE / 2, top: pos[i].y - NODE / 2 }]}
              style={styles.nodeFace}
            >
              {isCurrent ? <Pulse /> : null}
              <View style={[styles.lip, { backgroundColor: locked ? "#2A2160" : isCurrent ? palette.accentDark : palette.primaryDark }]} />
              <LinearGradient
                colors={locked ? ["#4A3F8C", "#3A2F78"] : isCurrent ? ["#FFE08A", palette.accent] : ["#A994FF", palette.primary]}
                style={[styles.node, shadow]}
              >
                <Text style={[styles.num, { color: isCurrent ? "#5A3500" : "#fff" }]}>{locked ? "🔒" : l.number}</Text>
              </LinearGradient>
              {!locked && !isCurrent ? <MiniStars count={l.stars} /> : null}
            </Tappable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  nodeWrap: { position: "absolute", width: NODE },
  nodeFace: { width: NODE, alignItems: "center" },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.6)" },
  lip: { position: "absolute", top: 6, width: NODE, height: NODE, borderRadius: NODE / 2 },
  num: { fontFamily: fonts.display, fontSize: 26 },
  pulse: { position: "absolute", width: NODE + 26, height: NODE + 26, top: -13, borderRadius: (NODE + 26) / 2, backgroundColor: "rgba(255,210,74,0.45)" },
  banner: { position: "absolute", alignSelf: "center", backgroundColor: palette.danger, paddingHorizontal: 22, paddingVertical: 8, borderRadius: 14, borderWidth: 3, borderColor: "#fff" },
  bannerText: { fontFamily: fonts.display, fontSize: 18, color: "#fff" },
});
