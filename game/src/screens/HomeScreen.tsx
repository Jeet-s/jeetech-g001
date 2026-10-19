import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image, Animated, Easing, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEVELS, CHAPTERS, TOTAL_LEVELS } from "../game/levels";
import type { Colors } from "../game/theme";
import { art } from "../art";
import { store } from "../modules/store";
import { useBannerHeight, useBottomInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";

/**
 * HOME = Path Painter's title screen — the first thing a player (and a store
 * visitor) sees. Currencies → illustrated logo → a living hero (the brush
 * mascot rolling a fresh paint trail across ceramic tiles) → chapter progress →
 * ONE big "Play · Level N" that continues the next level → Levels / Shop /
 * Settings as secondary icon buttons. The level map lives on its own screen.
 */
export function HomeScreen({
  colors,
  onPlay,
  onLevels,
  onShop,
  onSettings,
}: {
  colors: Colors;
  onPlay: (id: number) => void;
  onLevels: () => void;
  onShop: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bannerH = useBannerHeight();
  const bottomInset = useBottomInset();
  const { width } = useWindowDimensions();
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);

  const current = Math.min(TOTAL_LEVELS, Math.max(1, s.level));
  const chapterNo = LEVELS.find((l) => l.id === current)?.chapter ?? 1;
  const inChapter = LEVELS.filter((l) => l.chapter === chapterNo);
  const doneInChapter = inChapter.filter((l) => (s.stars[l.id] ?? 0) > 0).length;
  const progress = doneInChapter / Math.max(1, inChapter.length);
  const totalStars = store.totalStars();

  // Idle life: the logo floats and tilts, the Play button breathes.
  const float = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const f = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    f.start();
    b.start();
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
    return () => {
      f.stop();
      b.stop();
    };
  }, [float, breathe, enter]);

  const logoW = Math.min(width * 0.82, 360);
  const logoH = Math.floor((logoW * 445) / 900);
  const rise = (from: number) => ({
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  // The hero sizes itself to the space actually left between logo and controls.
  const [heroBox, setHeroBox] = useState({ w: 0, h: 0 });
  const onHeroLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setHeroBox({ w: Math.floor(w), h: Math.floor(h) });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.hud, { paddingTop: insets.top + 10 }]}>
        <View style={[styles.currency, { backgroundColor: colors.surface }]}>
          <Txt weight="black" size={18} color={colors.gate}>★</Txt>
          <Txt weight="black" size={16} color={colors.text}>{totalStars}</Txt>
        </View>
        <View style={[styles.currency, { backgroundColor: colors.surface }]}>
          <Txt size={16}>🪙</Txt>
          <Txt weight="black" size={16} color={colors.text}>{s.coins}</Txt>
        </View>
      </View>

      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: enter,
            transform: [
              { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) },
              { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ["-1.5deg", "1.5deg"] }) },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            ],
          },
        ]}
      >
        <Image source={art.logo} style={{ width: logoW, height: logoH }} resizeMode="contain" accessibilityLabel="Path Painter" />
      </Animated.View>

      <View style={styles.heroArea} onLayout={onHeroLayout} pointerEvents="none">
        {heroBox.h > 0 && <Hero box={heroBox} colors={colors} />}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(bannerH, bottomInset) + 16 }]}>
        <Animated.View style={[styles.chapterCard, { backgroundColor: colors.surface + "E6" }, rise(30)]}>
          <Txt weight="heading" size={13} color={colors.subtext} style={styles.chapterKicker}>
            Chapter {chapterNo} of {CHAPTERS.length}
          </Txt>
          <Txt weight="display" size={20} color={colors.text}>{CHAPTERS[chapterNo - 1]}</Txt>
          <View style={[styles.track, { backgroundColor: colors.floor }]}>
            <View style={[styles.fill, { backgroundColor: colors.paint, width: `${Math.max(6, progress * 100)}%` }]} />
          </View>
          <Txt weight="label" size={13} color={colors.subtext}>
            {doneInChapter}/{inChapter.length} levels painted
          </Txt>
        </Animated.View>

        <Animated.View style={[styles.playRow, rise(40)]}>
          <Animated.View style={[styles.playWrap, { transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
            <PressableScale
              onPress={() => onPlay(current)}
              rippleColor="#FFFFFF"
              style={[styles.play, { backgroundColor: colors.paint, borderColor: colors.paintEdge }]}
            >
              <Txt weight="display" size={26} color={colors.onPaint}>Play  ·  Level {current}</Txt>
            </PressableScale>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.iconRow, rise(50)]}>
          <RoundButton icon="🗺️" label="Levels" colors={colors} onPress={onLevels} />
          <RoundButton icon="🛍️" label="Shop" colors={colors} onPress={onShop} />
          <RoundButton icon="⚙️" label="Settings" colors={colors} onPress={onSettings} />
        </Animated.View>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, colors, onPress }: { icon: string; label: string; colors: Colors; onPress: () => void }) {
  return (
    <View style={styles.round}>
      <PressableScale onPress={onPress} rippleColor={colors.paint} hitSlop={8} style={[styles.roundFace, { backgroundColor: colors.surface, borderColor: colors.paintEdge }]}>
        <Txt size={26}>{icon}</Txt>
      </PressableScale>
      <Txt weight="body" size={13} color={colors.text}>{label}</Txt>
    </View>
  );
}

/* ---------------------------------- Hero ----------------------------------- */

const GRID = 4;
/** A snake path over the 4x4 showcase board — the mascot rolls it, painting as it goes. */
const PATH: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [3, 1], [2, 1], [1, 1], [0, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
  [3, 3], [2, 3], [1, 3], [0, 3],
];
const STEP_MS = 340;

/** The key art in motion: the brush mascot painting a trail across ceramic tiles. */
function Hero({ box, colors }: { box: { w: number; h: number }; colors: Colors }) {
  const pad = 10;
  const cell = Math.max(24, Math.floor(Math.min(box.w * 0.7, box.h - 2 * pad - 12, 300) / GRID));
  const boardPx = cell * GRID;

  const t = useRef(new Animated.Value(0)).current;
  const wash = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const roll = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(t, { toValue: PATH.length - 1, duration: STEP_MS * (PATH.length - 1), easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(1100),
        Animated.timing(wash, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(wash, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    roll.start();
    b.start();
    return () => {
      roll.stop();
      b.stop();
    };
  }, [t, wash, bob]);

  const idx = PATH.map((_, i) => i);
  const mascotH = Math.floor(cell * 1.5);
  const mascotW = Math.floor((mascotH * 334) / 512);
  const mx = t.interpolate({ inputRange: idx, outputRange: PATH.map(([c]) => c * cell + (cell - mascotW) / 2) });
  const my = t.interpolate({ inputRange: idx, outputRange: PATH.map(([, r]) => r * cell + cell * 0.5 - mascotH) });

  return (
    <View style={[styles.heroBoard, { padding: pad, backgroundColor: colors.board, borderColor: colors.surface }]}>
      <View style={{ width: boardPx, height: boardPx }}>
        {Array.from({ length: GRID }, (_, r) => (
          <View key={r} style={styles.heroRow}>
            {Array.from({ length: GRID }, (_, c) => (
              <View key={c} style={{ width: cell, height: cell, padding: 2 }}>
                <Image source={art.sprite_board_tile} style={styles.fillImg} resizeMode="stretch" />
              </View>
            ))}
          </View>
        ))}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: wash }]}>
          {PATH.map(([c, r], i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                left: c * cell + 4,
                top: r * cell + 4,
                width: cell - 8,
                height: cell - 8,
                borderRadius: Math.floor(cell * 0.22),
                backgroundColor: colors.paint,
                borderWidth: 2,
                borderColor: colors.paintEdge,
                opacity: t.interpolate({ inputRange: [i - 0.6, i], outputRange: [0, 1], extrapolate: "clamp" }),
                transform: [{ scale: t.interpolate({ inputRange: [i - 0.6, i, i + 0.5], outputRange: [0.4, 1.08, 1], extrapolate: "clamp" }) }],
              }}
            />
          ))}
        </Animated.View>
        <Animated.Image
          source={art.character_brush_mascot}
          resizeMode="contain"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: mascotW,
            height: mascotH,
            transform: [
              { translateX: mx },
              { translateY: Animated.add(my, bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] })) },
              { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "6deg"] }) },
            ],
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hud: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  currency: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, minHeight: 40 },
  logoWrap: { alignItems: "center", marginTop: 4 },
  heroArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroBoard: { borderRadius: 24, borderWidth: 3 },
  heroRow: { flexDirection: "row" },
  fillImg: { width: "100%", height: "100%" },
  bottom: { paddingHorizontal: 24, gap: 14 },
  chapterCard: { alignSelf: "center", alignItems: "center", gap: 4, width: "86%", maxWidth: 380, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20 },
  chapterKicker: { textTransform: "uppercase", letterSpacing: 1.5 },
  track: { width: "100%", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 4 },
  fill: { height: "100%", borderRadius: 5 },
  playRow: { alignItems: "center" },
  playWrap: { width: "100%", maxWidth: 420 },
  play: { minHeight: 66, borderRadius: 24, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  iconRow: { flexDirection: "row", justifyContent: "center", gap: 32 },
  round: { alignItems: "center", gap: 4 },
  roundFace: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
