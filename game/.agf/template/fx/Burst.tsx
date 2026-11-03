import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

/**
 * Per-move juice: a ring + sparks flying out of (x, y) — mount it with a new `key` on every accepted move
 * (key={moveCount}) at the touched cell. QA game_feel (2026-10-21..28, every game): "the burst frames after a tap look
 * identical — add a ripple / particles within 0.1 s". Plain Reanimated views, one shared value: no Skia canvas is
 * created per move (that stalls the very frame the player is watching).
 */
export function Burst({ x, y, color = "#FFF1A8", count = 8, size = 72 }: { x: number; y: number; color?: string; count?: number; size?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - t.value), transform: [{ scale: 0.35 + t.value * 0.9 }] }));
  return (
    <View pointerEvents="none" style={[styles.box, { left: x - size / 2, top: y - size / 2, width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ring, { borderColor: color, borderRadius: size / 2 }, ring]} />
      {Array.from({ length: count }, (_, i) => (
        // Deterministic spread (no Math.random in render): even angles with a small alternating twist.
        <Spark key={i} t={t} angle={(i / count) * Math.PI * 2 + (i % 2 ? 0.25 : -0.1)} dist={size * (i % 2 ? 0.62 : 0.8)} color={color} half={size / 2} />
      ))}
    </View>
  );
}

function Spark({ t, angle, dist, color, half }: { t: SharedValue<number>; angle: number; dist: number; color: string; half: number }) {
  const st = useAnimatedStyle(() => ({
    opacity: t.value < 0.6 ? 1 : 1 - (t.value - 0.6) / 0.4,
    transform: [{ translateX: Math.cos(angle) * dist * t.value }, { translateY: Math.sin(angle) * dist * t.value }, { scale: 1 - 0.7 * t.value }],
  }));
  return <Animated.View style={[styles.spark, { left: half - 4, top: half - 4, backgroundColor: color }, st]} />;
}

const styles = StyleSheet.create({
  box: { position: "absolute" },
  ring: { borderWidth: 3 },
  spark: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
});
