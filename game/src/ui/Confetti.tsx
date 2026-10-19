import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * A one-shot confetti burst for the win sequence. Pure react-native Animated
 * (no native deps): a handful of coloured chips fall and spin from the top of
 * the card. Deterministic per mount so it never janks.
 */
const COLORS = ["#6D8BFF", "#38D9A9", "#FFC53B", "#FF8A5B", "#A9BBFF", "#EB5757"];

export function Confetti({
  count = 26,
  height = 260,
  spread = 420,
  delayed = false,
}: {
  count?: number;
  height?: number;
  /** Window (ms) over which pieces keep launching — the shower lasts ~spread + 1.1s. */
  spread?: number;
  /** Start after the card has landed rather than immediately. */
  delayed?: boolean;
}) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 97 + 13) % 100, // spread 0–100%
        color: COLORS[i % COLORS.length],
        size: 7 + ((i * 13) % 6),
        delay: (delayed ? 250 : 0) + Math.round(((i * 37) % count) / count * spread),
        rotateEnd: (i % 2 ? 1 : -1) * (360 + (i % 3) * 180),
        drift: ((i % 5) - 2) * 18,
      })),
    [count, spread, delayed]
  );
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      {pieces.map((p, i) => (
        <Chip key={i} {...p} fall={height} />
      ))}
    </View>
  );
}

function Chip({
  left,
  color,
  size,
  delay,
  rotateEnd,
  drift,
  fall,
}: {
  left: number;
  color: string;
  size: number;
  delay: number;
  rotateEnd: number;
  drift: number;
  fall: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1100 + (fall > 400 ? 500 : 0), delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t, delay, fall]);
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: `${left}%`,
        width: size,
        height: size * 1.4,
        borderRadius: 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-20, fall] }) },
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${rotateEnd}deg`] }) },
        ],
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
});
