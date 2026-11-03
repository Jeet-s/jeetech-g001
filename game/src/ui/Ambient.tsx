import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from "react-native";

/**
 * Living backdrop: the chapter's world art drifts slowly (parallax breathing)
 * while a few soft paint motes float up through it. Full-screen, behind every
 * screen, pointer-transparent; native-driver loops only (no JS per frame).
 */
export const WorldBackdrop = memo(function WorldBackdrop({ source, tint }: { source: ImageSourcePropType; tint: string }) {
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  // Cover the window at the art's 9:16 aspect, with a margin for the drift.
  const w = Math.ceil(Math.max(width, (height * 1080) / 1920) * 1.08);
  const h = Math.ceil((w * 1920) / 1080);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      <Animated.Image
        source={source}
        resizeMode="cover"
        style={{
          position: "absolute",
          left: (width - w) / 2,
          top: (height - h) / 2,
          width: w,
          height: h,
          transform: [
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.05] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-10, 10] }) },
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [8, -8] }) },
          ],
        }}
      />
      <Motes width={width} height={height} tint={tint} />
    </View>
  );
});

const MOTE_COLORS = ["#FFFFFF", "#FFE7A3", "#FFC2D4", "#C9D6FF"];

function Motes({ width, height, tint }: { width: number; height: number; tint: string }) {
  const motes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        x: ((i * 89 + 23) % 100) / 100,
        size: 5 + ((i * 7) % 4) * 3,
        dur: 9000 + ((i * 1733) % 6000),
        delay: (i * 977) % 7000,
        color: i % 4 === 3 ? tint : MOTE_COLORS[i % MOTE_COLORS.length],
        sway: 10 + (i % 3) * 8,
      })),
    [tint]
  );
  return (
    <>
      {motes.map((m, i) => (
        <Mote key={i} {...m} width={width} height={height} />
      ))}
    </>
  );
}

function Mote({ x, size, dur, delay, color, sway, width, height }: { x: number; size: number; dur: number; delay: number; color: string; sway: number; width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, dur, delay]);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x * width,
        top: height,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 0.75, 0.6, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 1.05] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, sway, 0, -sway, 0] }) },
        ],
      }}
    />
  );
}

const styles = StyleSheet.create({ clip: { overflow: "hidden" } });

