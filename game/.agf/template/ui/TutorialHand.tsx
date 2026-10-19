import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

/** Animated pointer demonstrating a tap at `from` or a swipe from → to. Show on the first levels. */
export function TutorialHand({ from, to }: { from: { x: number; y: number }; to?: { x: number; y: number } }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }), withTiming(1, { duration: 400 }), withTiming(0, { duration: 0 })), -1);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const dest = to ?? from;
    const x = from.x + (dest.x - from.x) * t.value;
    const y = from.y + (dest.y - from.y) * t.value;
    const press = to ? 1 : 1 - 0.15 * Math.sin(Math.PI * t.value);
    return { transform: [{ translateX: x - 20 }, { translateY: y - 8 }, { scale: press }], opacity: t.value > 0.98 ? 0.6 : 1 };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.hand, style]}>
      <Text style={styles.emoji}>👆</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hand: { position: "absolute", left: 0, top: 0 },
  emoji: { fontSize: 46, textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 8 },
});
