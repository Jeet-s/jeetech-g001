import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import type { Colors } from "../game/theme";
import { art } from "../art";
import { Txt } from "./Txt";
import { PressableScale } from "./PressableScale";

/**
 * Themed HUD pieces shared by the play screen, Home and Levels: deep glossy
 * panels in the chapter's frame colour (matching the board), 3D icon buttons
 * with a lip + gloss, outlined display numbers, the paint-bucket Fill meter
 * and the Par meter with its star pips.
 */

/** Big display number in the title font with a dark outline-like shadow. */
export function HudNumber({ value, size = 24, color = "#FFFFFF" }: { value: string; size?: number; color?: string }) {
  return (
    <Txt weight="display" size={size} color={color} style={styles.outlined}>
      {value}
    </Txt>
  );
}

/** A deep, glossy panel — inner gloss on top, darker lip below. */
export function HudPanel({ colors, children, style }: { colors: Colors; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.panel, { backgroundColor: colors.frame, borderColor: colors.frameEdge }, style]}>
      <View pointerEvents="none" style={styles.panelGloss} />
      <View pointerEvents="none" style={styles.panelLip} />
      {children}
    </View>
  );
}

/** A raised 3D button: coloured face over a darker lip, gloss band, real icon.
 *  Answers on touch-down (PressableScale). */
export function IconButton({
  icon,
  label,
  onPress,
  colors,
  tone = "frame",
  disabled,
  size = 52,
  badge,
}: {
  icon: ImageSourcePropType;
  label?: string;
  onPress: () => void;
  colors: Colors;
  /** "frame" = chapter panel tone, "paint" = the primary call to action, "gold" = rewards. */
  tone?: "frame" | "paint" | "gold";
  disabled?: boolean;
  size?: number;
  /** Small text tag on the button's corner (e.g. a hint's coin cost). */
  badge?: string;
}) {
  const face = tone === "paint" ? colors.paint : tone === "gold" ? "#FFB627" : colors.frame;
  const lip = tone === "paint" ? colors.paintDeep : tone === "gold" ? "#C77A00" : colors.slotDeep;
  const rad = Math.round(size * 0.32);
  return (
    <View style={styles.iconBtnWrap}>
      <PressableScale disabled={disabled} onPress={onPress} rippleColor="#FFFFFF" hitSlop={6} style={{ borderRadius: rad }}>
        <View style={{ width: size, height: size + 5, borderRadius: rad, backgroundColor: lip }}>
          <View style={[styles.iconFace, { width: size, height: size, borderRadius: rad, backgroundColor: face, borderColor: tone === "frame" ? colors.frameEdge : "rgba(255,255,255,0.55)" }]}>
            <View pointerEvents="none" style={[styles.iconGloss, { borderRadius: rad * 0.7 }]} />
            <Image source={icon} style={{ width: size * 0.5, height: size * 0.5 }} resizeMode="contain" />
          </View>
        </View>
        {badge != null && (
          <View style={[styles.badge, { backgroundColor: "#FFB627", borderColor: "#FFFFFF" }]}>
            <Txt weight="black" size={11} color="#4A2A00">{badge}</Txt>
          </View>
        )}
      </PressableScale>
      {label != null && (
        <Txt weight="display" size={14} color="#FFFFFF" style={[styles.outlinedSmall, { marginTop: 3 }]} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Txt>
      )}
    </View>
  );
}

/** FILL as a paint bucket: the paint level rises with the fill percentage
 *  (springs to each new value) and a wave rim sloshes on change. */
export function FillBucket({ percent, colors }: { percent: number; colors: Colors }) {
  const H = 40;
  const level = useRef(new Animated.Value(percent)).current;
  const slosh = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(level, { toValue: percent, friction: 7, tension: 70, useNativeDriver: true }).start();
    slosh.setValue(1);
    Animated.timing(slosh, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [percent, level, slosh]);
  return (
    <View style={styles.meterCol}>
      <View style={styles.bucketRow}>
        <View style={[styles.bucket, { height: H, borderColor: "#FFFFFF" }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.slotDeep }]} />
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: H,
              backgroundColor: colors.paint,
              transform: [{ translateY: level.interpolate({ inputRange: [0, 100], outputRange: [H, 0], extrapolate: "clamp" }) }],
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                left: -4,
                right: -4,
                top: -3,
                height: 7,
                borderRadius: 4,
                backgroundColor: colors.paintEdge,
                transform: [{ rotate: slosh.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-9deg"] }) }],
              }}
            />
          </Animated.View>
          <View pointerEvents="none" style={styles.bucketGloss} />
        </View>
        <View style={{ minWidth: 58 }}>
          <HudNumber value={`${percent}%`} size={22} />
        </View>
      </View>
      <Txt weight="display" size={13} color="#FFFFFF" style={[styles.meterLabel, styles.outlinedSmall]}>Fill</Txt>
    </View>
  );
}

/** MOVES against PAR: a track with three star pips — the stars you still hold
 *  stay gold, the ones your move count has passed fade to grey. */
export function ParMeter({ moves, par, colors }: { moves: number; par: number; colors: Colors }) {
  // starsForMoves: ≤ par → 3, ≤ par+2 → 2, else 1.
  const stars = moves <= par ? 3 : moves <= par + 2 ? 2 : 1;
  const span = par + 3;
  const pct = Math.min(1, moves / span);
  const marks = [par / span, (par + 2) / span];
  const W = 120;
  return (
    <View style={styles.meterCol}>
      <View style={styles.parTop}>
        <HudNumber value={`${moves}`} size={22} />
        <Txt weight="display" size={15} color="#FFFFFFCC" style={styles.outlinedSmall}> / {par}</Txt>
        <View style={styles.pips}>
          {[0, 1, 2].map((i) => (
            <Image key={i} source={i < stars ? art.star_gold : art.star_empty} style={{ width: 18, height: 18 }} resizeMode="contain" />
          ))}
        </View>
      </View>
      <View style={[styles.parTrack, { width: W, backgroundColor: colors.slotDeep }]}>
        <View style={{ width: Math.round(W * pct), height: "100%", borderRadius: 5, backgroundColor: stars === 3 ? colors.paint : stars === 2 ? "#FFB627" : "#FF7A59" }} />
        {marks.map((m, i) => (
          <View key={i} style={[styles.parMark, { left: Math.round(W * m) - 1 }]} />
        ))}
      </View>
      <Txt weight="display" size={13} color="#FFFFFF" style={[styles.meterLabel, styles.outlinedSmall]}>Moves · Par</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  outlined: {
    textShadowColor: "rgba(10,12,35,0.75)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  outlinedSmall: {
    textShadowColor: "rgba(10,12,35,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  panel: { borderRadius: 20, borderWidth: 2, borderTopWidth: 3, overflow: "hidden" },
  panelGloss: { position: "absolute", left: 0, right: 0, top: 0, height: "45%", backgroundColor: "rgba(255,255,255,0.1)" },
  panelLip: { position: "absolute", left: 0, right: 0, bottom: 0, height: 5, backgroundColor: "rgba(0,0,0,0.22)" },
  iconBtnWrap: { alignItems: "center" },
  iconFace: { alignItems: "center", justifyContent: "center", borderWidth: 2, overflow: "hidden" },
  iconGloss: { position: "absolute", left: "10%", right: "10%", top: "6%", height: "36%", backgroundColor: "rgba(255,255,255,0.28)" },
  badge: { position: "absolute", right: -8, top: -6, paddingHorizontal: 5, minWidth: 22, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  meterCol: { alignItems: "center" },
  bucketRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bucket: { width: 30, borderWidth: 2.5, borderTopWidth: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: "hidden" },
  bucketGloss: { position: "absolute", left: 3, top: 4, bottom: 6, width: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" },
  meterLabel: { textTransform: "uppercase", letterSpacing: 1.2, marginTop: 2 },
  parTop: { flexDirection: "row", alignItems: "center" },
  pips: { flexDirection: "row", marginLeft: 8, gap: 1 },
  parTrack: { height: 10, borderRadius: 5, marginTop: 5, overflow: "hidden" },
  parMark: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.8)" },
});
