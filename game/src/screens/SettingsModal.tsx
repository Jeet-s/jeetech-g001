import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import {
  type Colors,
  PALETTE_ORDER,
  PALETTE_LABELS,
  type Palette,
} from "../game/theme";

/**
 * Settings: sound, haptics, colourblind palette and high-contrast toggles.
 * All preferences persist through the store. No account / network involved.
 */
export function SettingsModal({
  visible,
  colors,
  onClose,
}: {
  visible: boolean;
  colors: Colors;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState(store.get().settings);
  useEffect(() => store.subscribe((s) => setSettings(s.settings)), []);

  function toggle(key: "sound" | "haptics" | "highContrast") {
    const value = !settings[key];
    store.setSettings({ [key]: value });
    analytics.track("settings_change", { option: key, value });
  }

  function setPalette(p: Palette) {
    store.setSettings({ palette: p });
    analytics.track("settings_change", { option: "palette", value: p });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

            <Toggle label="Sound" on={settings.sound} onPress={() => toggle("sound")} colors={colors} />
            <Toggle label="Haptics" on={settings.haptics} onPress={() => toggle("haptics")} colors={colors} />
            <Toggle
              label="High Contrast"
              on={settings.highContrast}
              onPress={() => toggle("highContrast")}
              colors={colors}
            />

            <Text style={[styles.section, { color: colors.subtext }]}>Colourblind Palette</Text>
            <View style={styles.paletteRow}>
              {PALETTE_ORDER.map((p) => {
                const active = settings.palette === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPalette(p)}
                    style={[
                      styles.palette,
                      {
                        backgroundColor: active ? colors.paint : colors.bg,
                        borderColor: active ? colors.paintEdge : "transparent",
                      },
                    ]}
                  >
                    <Text style={{ color: active ? "#0b0c10" : colors.text, fontWeight: "700", fontSize: 12 }}>
                      {PALETTE_LABELS[p]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.help, { color: colors.subtext }]}>
              Gates and switches also use distinct shapes and letters, so levels stay
              readable with any palette.
            </Text>

            <Pressable style={[styles.close, { backgroundColor: colors.paint }]} onPress={onClose}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Toggle({
  label,
  on,
  onPress,
  colors,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  colors: Colors;
}) {
  return (
    <Pressable style={[styles.row, { backgroundColor: colors.bg }]} onPress={onPress}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.switchTrack, { backgroundColor: on ? colors.switch : "#3a3f55" }]}>
        <View style={[styles.switchThumb, { alignSelf: on ? "flex-end" : "flex-start" }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 24, fontWeight: "800" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderRadius: 14 },
  rowLabel: { fontSize: 16, fontWeight: "600" },
  switchTrack: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: "center" },
  switchThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#ffffff" },
  section: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
  paletteRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  palette: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2 },
  help: { fontSize: 12, lineHeight: 18 },
  close: { marginTop: 12, padding: 16, borderRadius: 14, alignItems: "center" },
  closeText: { color: "#0b0c10", fontWeight: "800", fontSize: 16 },
});
