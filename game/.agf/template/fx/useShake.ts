import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

/** Screen/element shake for mistakes and impacts: `const { style, shake } = useShake()`. */
export function useShake(intensity = 10) {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shake = () => {
    x.value = withSequence(
      withTiming(intensity, { duration: 40 }),
      withTiming(-intensity, { duration: 50 }),
      withTiming(intensity * 0.6, { duration: 50 }),
      withTiming(-intensity * 0.4, { duration: 50 }),
      withTiming(0, { duration: 40 }),
    );
  };
  return { style, shake };
}
