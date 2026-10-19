import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Panel } from "./Panel";
import { palette, springs, type } from "./theme";
import { play } from "../audio/sfx";

/** Modal card that springs in over a dimmed backdrop. */
export function Popup({ visible, title, onClose, children }: { visible: boolean; title?: string; onClose?: () => void; children: React.ReactNode }) {
  const s = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      play("whoosh", 0.6);
      s.value = 0;
      s.value = withSpring(1, springs.pop);
    }
  }, [visible, s]);
  const card = useAnimatedStyle(() => ({ transform: [{ scale: 0.7 + 0.3 * s.value }], opacity: Math.min(1, s.value * 1.5) }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) }) }));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.cardWrap, card]}>
          <Panel>
            {title ? <Text style={[type.title, styles.title]}>{title}</Text> : null}
            {children}
          </Panel>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(8,4,30,0.72)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 },
  cardWrap: { width: "100%", maxWidth: 420 },
  title: { color: palette.ink, textAlign: "center", marginBottom: 14 },
});
