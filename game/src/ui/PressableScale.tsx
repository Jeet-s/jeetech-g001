import { useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { feedback } from "../modules/feedback";

/**
 * A Pressable that answers every touch instantly — visibly and tactilely.
 * On press it snaps down to ~0.92 in ~90ms, tints, brightens its outline and
 * fires a radial ripple from the finger (~150ms); on release it rebounds past
 * 1.0 to 1.05 and settles back by ~250ms, plus a haptic/sound tap. Used for every button and tappable card so
 * nothing ever feels dead (quality bar: immediate feedback on every touch).
 */
export function PressableScale({
  children,
  onPress,
  style,
  disabled,
  haptic = true,
  scaleTo = 0.92,
  ripple = true,
  rippleColor = "#FFFFFF",
  ...rest
}: Omit<PressableProps, "children"> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scaleTo?: number;
  /** Soft outline-brighten + ripple bloom on press (on by default). */
  ripple?: boolean;
  rippleColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  // Held-down darken tint — makes the pressed state unmistakable, not just a
  // scale. Snaps in while the finger is down, eases back out on release.
  const press = useRef(new Animated.Value(0)).current;
  // Radial ripple: a circle that expands from the touch point and fades.
  const wave = useRef(new Animated.Value(1)).current;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  // Inherit the control's own corner radius so the ripple hugs its shape.
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const borderRadius = typeof flat?.borderRadius === "number" ? flat.borderRadius : 14;

  // Big enough to cover the control from any touch point.
  const radius = Math.max(8, Math.hypot(size.w, size.h));

  const pressIn = (x?: number, y?: number) => {
    if (disabled) return;
    if (ripple) {
      setOrigin({ x: x ?? size.w / 2, y: y ?? size.h / 2 });
      wave.setValue(0);
      Animated.timing(wave, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    Animated.timing(scale, { toValue: scaleTo, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(press, { toValue: 1, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    if (ripple) {
      glow.setValue(0);
      Animated.timing(glow, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  };
  const pressOut = () => {
    if (disabled) return;
    // Rebound past 1.0 to 1.05, then settle — a lively, springy release.
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.05, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }),
    ]).start();
    Animated.timing(press, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => pressIn(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onPressOut={pressOut}
      onPress={(e) => {
        if (disabled) return;
        if (haptic) feedback.tap();
        onPress?.(e);
      }}
    >
      <Animated.View
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={[{ transform: [{ scale }] }, style, disabled && { opacity: 0.45 }]}
      >
        {children}
        {/* Held-down darken overlay — the clear "pressed" tint. */}
        {!disabled && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              borderRadius,
              backgroundColor: "#000000",
              opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
            }}
          />
        )}
        {ripple && !disabled && (
          <>
            {/* soft fill bloom (sits over the surface, under a low enough opacity
                that labels and sprites stay readable) */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                borderRadius,
                backgroundColor: rippleColor,
                opacity: glow.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.2, 0] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.06] }) }],
              }}
            />
            {/* radial ripple from the touch point, clipped to the control */}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}>
              <Animated.View
                style={{
                  position: "absolute",
                  left: origin.x - radius,
                  top: origin.y - radius,
                  width: radius * 2,
                  height: radius * 2,
                  borderRadius: radius,
                  backgroundColor: rippleColor,
                  opacity: wave.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.32, 0] }),
                  transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) }],
                }}
              />
            </View>
            {/* brightened outline ring */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                borderRadius,
                borderWidth: 2,
                borderColor: rippleColor,
                opacity: glow.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.55, 0] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.1] }) }],
              }}
            />
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
