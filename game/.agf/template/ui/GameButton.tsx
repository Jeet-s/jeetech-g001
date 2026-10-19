import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius, shadow, springs, type } from "./theme";
import { feedback, type Sfx } from "../audio/sfx";

type Variant = "primary" | "secondary" | "accent" | "danger" | "light";
const COLORS: Record<Variant, { top: string; bottom: string; lip: string; text: string }> = {
  primary: { top: "#9A82FF", bottom: palette.primary, lip: palette.primaryDark, text: palette.onPrimary },
  secondary: { top: "#5BE8D8", bottom: palette.secondary, lip: palette.secondaryDark, text: "#05332E" },
  accent: { top: "#FFD978", bottom: palette.accent, lip: palette.accentDark, text: "#4A2C00" },
  danger: { top: "#FF8494", bottom: palette.danger, lip: palette.dangerDark, text: "#FFFFFF" },
  light: { top: "#FFFFFF", bottom: palette.surfaceAlt, lip: "#CFC7F5", text: palette.ink },
};

/**
 * Chunky casual-game button: gradient face, darker 3D lip, spring squash on
 * press, tap sound + haptic. Use for EVERY tappable action.
 */
export function GameButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  sound = "tap",
  style,
}: {
  label?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  disabled?: boolean;
  sound?: Sfx;
  style?: ViewStyle;
}) {
  const c = COLORS[variant];
  const press = useSharedValue(0);
  const face = useAnimatedStyle(() => ({
    transform: [{ translateY: press.value * 5 }, { scale: 1 - press.value * 0.06 }],
  }));
  const h = size === "lg" ? 68 : size === "sm" ? 44 : 56;
  const lip = size === "sm" ? 4 : 6;
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.press))}
      onPress={() => {
        feedback(sound, "light");
        onPress?.();
      }}
      style={[{ height: h + lip, opacity: disabled ? 0.5 : 1 }, style]}
      hitSlop={6}
    >
      <View style={[styles.lip, { height: h, top: lip, backgroundColor: c.lip, borderRadius: radius.lg }, shadow]} />
      <Animated.View style={[{ height: h, borderRadius: radius.lg, overflow: "hidden" }, face]}>
        <LinearGradient colors={[c.top, c.bottom]} style={[styles.face, { paddingHorizontal: size === "sm" ? 16 : 26 }]}>
          <View style={styles.shine} />
          {icon}
          {label ? (
            <Text style={[type.button, { color: c.text, fontSize: size === "lg" ? 24 : size === "sm" ? 16 : 20 }]}>{label}</Text>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lip: { position: "absolute", left: 0, right: 0 },
  face: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  shine: { position: "absolute", top: 4, left: 10, right: 10, height: "38%", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)" },
});
