import { Pressable, type Insets, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { springs } from "./theme";
import { haptic, play, type Sfx } from "../audio/sfx";

/**
 * Press feedback for ANY tappable thing that isn't a GameButton: level-map nodes, HUD icons, cards, board tiles.
 *
 * Why (QA 2026-10-20..28): "taps show little to no visible response within 0.1-0.3 s" was the #1 game_feel finding in
 * all 12 games reviewed — custom Pressables changed nothing until the release (or only scaled 3-8 % with a slow
 * spring), so the burst frames after a tap looked identical. Here the response starts ON TOUCH-DOWN: a 50 ms squash
 * to `scaleTo` and a dim, the sound + haptic fire immediately, and the release springs back with an overshoot.
 */
export function Tappable({
  onPress,
  onLongPress,
  children,
  style,
  containerStyle,
  disabled,
  scaleTo = 0.9,
  sound = "tap",
  hapticKind = "light",
  hitSlop = 6,
  accessibilityLabel,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  /** The animated face (look, size). */
  style?: StyleProp<ViewStyle>;
  /** The touch area (position / layout, e.g. absolute left/top on a map) — never scaled, so the hit box stays put. */
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** How far it squashes while held (0.9 = 10 %). Small things (icons, nodes) can go to 0.85; big cards 0.95. */
  scaleTo?: number;
  /** null = silent (e.g. a tile whose move plays its own sound). */
  sound?: Sfx | null;
  hapticKind?: "light" | "medium" | "select" | null;
  hitSlop?: number | Insets;
  accessibilityLabel?: string;
}) {
  const s = useSharedValue(1);
  const dim = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: dim.value }));
  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        s.value = withTiming(scaleTo, { duration: 50 });
        dim.value = withTiming(0.82, { duration: 50 });
        if (sound) play(sound);
        if (hapticKind) haptic(hapticKind);
      }}
      onPressOut={() => {
        // Overshoot past 1 then settle: the release reads as a physical "pop", not a fade back.
        s.value = withSequence(withTiming(1.05, { duration: 90 }), withSpring(1, springs.pop));
        dim.value = withTiming(1, { duration: 120 });
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[containerStyle, disabled ? { opacity: 0.5 } : null]}
    >
      <Animated.View style={[style, st]}>{children}</Animated.View>
    </Pressable>
  );
}
