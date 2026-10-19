import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { play, haptic } from "../audio/sfx";
import { palette } from "./theme";

function Star({ on, index, animate, size }: { on: boolean; index: number; animate: boolean; size: number }) {
  const s = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    const delay = 250 + index * 320;
    s.value = withDelay(delay, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(2.6)) }));
    if (on) {
      const id = setTimeout(() => {
        play(`star${index + 1}` as "star1");
        haptic("medium");
      }, delay + 120);
      return () => clearTimeout(id);
    }
  }, [animate, index, on, s]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }, { rotate: `${(1 - s.value) * -40}deg` }, { translateY: index === 1 ? -14 : 0 }],
  }));
  return (
    <Animated.View style={[styles.star, style]}>
      <Text style={{ fontSize: index === 1 ? size * 1.25 : size, opacity: on ? 1 : 0.25 }}>{on ? "⭐" : "☆"}</Text>
    </Animated.View>
  );
}

/** Three-star award with staggered pop + rising chimes. `animate` for the win screen. */
export function Stars({ count, animate = false, size = 48 }: { count: number; animate?: boolean; size?: number }) {
  return (
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <Star key={i} index={i} on={i < count} animate={animate} size={size} />
      ))}
    </View>
  );
}

/** Small static stars under level nodes. */
export function MiniStars({ count }: { count: number }) {
  return (
    <View style={styles.mini}>
      {[0, 1, 2].map((i) => (
        <Text key={i} style={{ fontSize: 11, color: i < count ? palette.star : "rgba(255,255,255,0.3)" }}>★</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 6, marginVertical: 8 },
  star: { alignItems: "center", justifyContent: "center" },
  mini: { flexDirection: "row", gap: 1, marginTop: 2 },
});
