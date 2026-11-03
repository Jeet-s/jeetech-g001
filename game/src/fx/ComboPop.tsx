import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Txt } from "../ui/Txt";

/**
 * Floating streak text for a big stroke: "+5 Splash!" or "Combo x3" pops up
 * over the tile where the brush stopped, rises and fades (~900 ms). It starts
 * when the brush lands (`delay`) so it reads as the payoff of the stroke.
 */
export function ComboPop({ x, y, cell, text, color, big, delay }: { x: number; y: number; cell: number; text: string; color: string; big?: boolean; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(t, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [t, delay]);
  const W = cell * 3.2;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x * cell + cell / 2 - W / 2, top: y * cell - cell * 0.15, width: W, alignItems: "center" }}>
      <Animated.View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 12,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: "#FFFFFF",
          opacity: t.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -cell * 0.6] }) },
            { scale: t.interpolate({ inputRange: [0, 0.12, 0.25, 1], outputRange: [0.4, big ? 1.3 : 1.15, 1, 0.95] }) },
            { rotate: big ? "-4deg" : "0deg" },
          ],
        }}
      >
        <Txt weight="display" size={big ? 20 : 16} color="#FFFFFF" style={{ textShadowColor: "rgba(10,12,35,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} numberOfLines={1}>
          {text}
        </Txt>
      </Animated.View>
    </View>
  );
}
