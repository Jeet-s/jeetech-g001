import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Background, CurrencyPill, GameButton, LevelMap, type MapLevel, fonts } from "../ui";
import { store } from "../modules/store";
import { LEVELS } from "../game/lights";
import { useBottomInset } from "../modules/layout";

/** The level map (reached from the home screen's "Levels" button): every level, stars, chapters. */
export function LevelsScreen({ onPlay, onBack }: { onPlay: (levelNumber: number) => void; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  // Instant response to "play": the map dims the moment it's pressed, while the level screen loads.
  const leaving = useSharedValue(0);
  const leaveStyle = useAnimatedStyle(() => ({ opacity: 1 - leaving.value * 0.55, transform: [{ scale: 1 + leaving.value * 0.04 }] }));
  const play = useCallback((n: number) => {
    leaving.value = withTiming(1, { duration: 160 });
    onPlay(n);
  }, [leaving, onPlay]);
  const bottomInset = useBottomInset();
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  const stars = s.stars ?? {};
  const current = Math.min(LEVELS.length, Math.max(1, s.level));
  // Memoised (with a stable onSelect) so the map's Skia path canvases don't redraw on unrelated store changes.
  const levels: MapLevel[] = useMemo(() => LEVELS.map((l) => ({
    id: l.id,
    number: l.number,
    chapter: l.chapter,
    stars: l.number < current ? s.stars?.[l.id] ?? 1 : l.number === current ? 0 : -1,
  })), [current, s.stars]);
  const select = useCallback((l: MapLevel) => play(l.number), [play]);
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);
  return (
    <Animated.View style={[styles.root, leaveStyle]}>
      <Background />
      <LevelMap
        levels={levels}
        current={current}
        onSelect={select}
        padTop={insets.top + 120}
        padBottom={bottomInset + 180}
      />
      {/* Scrims so the map fades under the HUD and the buttons instead of colliding with them. */}
      <LinearGradient pointerEvents="none" colors={["rgba(12,6,40,1)", "rgba(12,6,40,0.95)", "rgba(12,6,40,0)"]} locations={[0, 0.55, 1]} style={[styles.scrimTop, { height: insets.top + 150 }]} />
      <LinearGradient pointerEvents="none" colors={["rgba(12,6,40,0)", "rgba(12,6,40,0.7)", "rgba(12,6,40,0.92)"]} style={[styles.scrimBottom, { height: bottomInset + 190 }]} />
      <View style={[styles.hud, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <CurrencyPill icon="⭐" value={totalStars} color="#FFD24A" />
        <CurrencyPill icon="🪙" value={s.coins} />
      </View>
      <Text style={[styles.logo, { top: insets.top + 64 }]} numberOfLines={1} adjustsFontSizeToFit pointerEvents="none">
        Levels
      </Text>
      <View style={[styles.bottom, { paddingBottom: bottomInset + 12 }]} pointerEvents="box-none">
        <GameButton size="sm" variant="light" label="‹ Home" onPress={onBack} />
        <GameButton label={`Play ${current}`} variant="accent" size="lg" style={{ flex: 1 }} onPress={() => play(current)} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hud: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  logo: { position: "absolute", left: 24, right: 24, textAlign: "center", fontFamily: fonts.display, fontSize: 30, color: "#fff", textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 10 },
  scrimTop: { position: "absolute", left: 0, right: 0, top: 0 },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12 },
});
