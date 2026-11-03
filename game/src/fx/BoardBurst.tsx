import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * Win confetti fired FROM the board: chips shoot up and out of the board's
 * centre, then tumble down past its edges (~1.1 s, one shot). Mounted only for
 * the board-celebration beat, before the results card appears.
 */
const COLORS = ["#FFC53B", "#FF8A5B", "#38D9A9", "#FFFFFF", "#FF5C8D", "#A9BBFF"];

export function BoardBurst({ width, height, paint }: { width: number; height: number; paint: string }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const a = -Math.PI / 2 + ((i / 29) - 0.5) * Math.PI * 1.5; // a fan opening upward
        const v = 0.55 + ((i * 37) % 10) / 22;
        return {
          dx: Math.cos(a) * width * 0.62 * v,
          up: Math.sin(a) * height * 0.55 * v,
          fall: height * (0.55 + ((i * 13) % 7) / 14),
          color: i % 5 === 0 ? paint : COLORS[i % COLORS.length],
          w: 7 + ((i * 7) % 5),
          spin: (i % 2 ? 1 : -1) * (300 + (i % 4) * 120),
          delay: (i % 6) * 22,
        };
      }),
    [width, height, paint]
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      {pieces.map((p, i) => (
        <Chip key={i} {...p} />
      ))}
    </View>
  );
}

function Chip({ dx, up, fall, color, w, spin, delay }: { dx: number; up: number; fall: number; color: string; w: number; spin: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1150, delay, easing: Easing.linear, useNativeDriver: true }).start();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        position: "absolute",
        width: w,
        height: w * 1.5,
        borderRadius: 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.05, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, dx * 0.8, dx] }) },
          // launch up fast, then gravity pulls it down below the start
          { translateY: t.interpolate({ inputRange: [0, 0.3, 0.55, 1], outputRange: [0, up, up * 0.75, up + fall] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${spin}deg`] }) },
        ],
      }}
    />
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center", overflow: "visible" } });
