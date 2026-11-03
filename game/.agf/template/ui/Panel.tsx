import { StyleSheet, View, type ViewStyle } from "react-native";
import { palette, radius, shadow } from "./theme";

/** Rounded card with a soft 3D lip — for popups, menus and HUD groups. */
export function Panel({ children, style, dark }: { children: React.ReactNode; style?: ViewStyle; dark?: boolean }) {
  return (
    <View style={[styles.wrap, shadow, style]}>
      <View style={[styles.lip, { backgroundColor: dark ? "#160F3D" : "#D9D2FB" }]} />
      <View style={[styles.face, { backgroundColor: dark ? palette.surfaceDark : palette.surface }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl },
  lip: { position: "absolute", left: 0, right: 0, top: 8, bottom: -8, borderRadius: radius.xl },
  // flexShrink: a Popup caps the panel at the screen height and its body scrolls inside.
  face: { borderRadius: radius.xl, padding: 22, flexShrink: 1 },
});
