import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GameButton } from "./GameButton";
import { type } from "./theme";

/** In-level header: back, title, settings. Sits under the status bar. */
export function TopBar({ title, onBack, onSettings, right }: { title?: string; onBack?: () => void; onSettings?: () => void; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.side}>{onBack ? <GameButton size="sm" variant="light" label="‹" onPress={onBack} /> : null}</View>
      <Text style={[type.heading, styles.title]} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, { alignItems: "flex-end" }]}>
        {right ?? (onSettings ? <GameButton size="sm" variant="light" label="⚙" onPress={onSettings} /> : null)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  side: { width: 64 },
  title: { flex: 1, textAlign: "center", color: "#fff", textShadowColor: "rgba(0,0,0,0.3)", textShadowRadius: 6 },
});
