import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Txt } from "../ui/Txt";

/**
 * Level intro: a ribbon with the level number + name sweeps in from the left
 * across the board area, holds a beat while the tiles pop in, and sweeps out to
 * the right (~1.3 s total) — a new level never just cuts in. It never takes
 * touches, so a quick player can swipe straight through it.
 */
export function LevelIntro({ kicker, name, color, edge, width }: { kicker: string; name: string; color: string; edge: string; width: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  useEffect(() => {
    const a = Animated.sequence([
      Animated.delay(80),
      Animated.timing(t, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(t, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    a.start(({ finished }) => finished && setDone(true));
    return () => a.stop();
  }, [t]);
  if (done) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.ribbon,
          {
            backgroundColor: color,
            borderColor: edge,
            opacity: t.interpolate({ inputRange: [0, 0.15, 1.85, 2], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1, 2], outputRange: [-width, 0, width] }) },
              { skewX: t.interpolate({ inputRange: [0, 1, 2], outputRange: ["-12deg", "0deg", "12deg"] }) },
            ],
          },
        ]}
      >
        <View pointerEvents="none" style={styles.gloss} />
        <Txt weight="display" size={13} color="#FFFFFFE6" style={styles.kicker}>{kicker}</Txt>
        <Txt weight="display" size={26} color="#FFFFFF" style={styles.outlined} numberOfLines={1} adjustsFontSizeToFit>{name}</Txt>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  ribbon: { alignSelf: "stretch", marginHorizontal: 10, alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, borderWidth: 3, overflow: "hidden" },
  gloss: { position: "absolute", left: 8, right: 8, top: 4, height: "40%", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)" },
  kicker: { textTransform: "uppercase", letterSpacing: 2 },
  outlined: { textShadowColor: "rgba(10,12,35,0.7)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
});
