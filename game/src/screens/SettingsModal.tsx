import { useEffect, useRef, useState } from "react";
import { Modal, View, StyleSheet, ScrollView, Animated } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { feedback } from "../modules/feedback";
import { useBottomInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { type Colors, PALETTE_ORDER, PALETTE_LABELS, type Palette } from "../game/theme";

/**
 * Settings: sound, haptics, colourblind palette and high-contrast toggles.
 * All preferences persist through the store. No account / network involved.
 *
 * A React Native Modal renders in its own native window that the app's root
 * SafeAreaProvider does not reach, so useSafeAreaInsets() reads 0 there and the
 * Android gesture pill ends up covering bottom controls. We mount a fresh
 * SafeAreaProvider inside the Modal so the inset is measured correctly, and the
 * primary "Done" button lives in a pinned footer (outside the scroll) padded by
 * that inset — it always clears the gesture bar on small phones (QA: layout_small).
 */
export function SettingsModal({ visible, colors, onClose }: { visible: boolean; colors: Colors; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <SettingsSheet colors={colors} onClose={onClose} />
          </View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function SettingsSheet({ colors, onClose }: { colors: Colors; onClose: () => void }) {
  const [settings, setSettings] = useState(store.get().settings);
  useEffect(() => store.subscribe((s) => setSettings(s.settings)), []);
  // Measured inside the Modal's own provider, so this reflects the real
  // gesture-bar inset. Clears the Android pill under the pinned Done button.
  const bottomInset = useBottomInset(18, { modal: true });

  function toggle(key: "sound" | "haptics" | "highContrast") {
    const value = !settings[key];
    store.setSettings({ [key]: value });
    feedback.tap();
    analytics.track("settings_change", { option: key, value });
  }
  function setPalette(p: Palette) {
    store.setSettings({ palette: p });
    feedback.tap();
    analytics.track("settings_change", { option: "palette", value: p });
  }

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Txt weight="display" size={26} color={colors.text}>Settings</Txt>

        <Toggle label="Sound" on={settings.sound} onPress={() => toggle("sound")} colors={colors} />
        <Toggle label="Haptics" on={settings.haptics} onPress={() => toggle("haptics")} colors={colors} />
        <Toggle label="High Contrast" on={settings.highContrast} onPress={() => toggle("highContrast")} colors={colors} />

        <Txt weight="heading" size={13} color={colors.subtext} style={styles.section}>Colourblind Palette</Txt>
        <View style={styles.paletteRow}>
          {PALETTE_ORDER.map((p) => {
            const active = settings.palette === p;
            return (
              <PressableScale
                key={p}
                onPress={() => setPalette(p)}
                style={[styles.palette, { backgroundColor: active ? colors.paint : colors.bg }]}
              >
                <Txt weight="body" size={12} color={active ? colors.onPaint : colors.text}>{PALETTE_LABELS[p]}</Txt>
              </PressableScale>
            );
          })}
        </View>

        <Txt weight="label" size={12} color={colors.subtext} style={styles.help}>
          Gates and switches also use distinct shapes and letters, so levels stay readable with any palette.
        </Txt>
      </ScrollView>

      {/* Pinned footer — never scrolls off, always clears the gesture pill. */}
      <View style={[styles.footer, { paddingBottom: bottomInset }]}>
        <PressableScale onPress={onClose} style={[styles.close, { backgroundColor: colors.paint }]}>
          <Txt weight="display" size={16} color={colors.onPaint}>Done</Txt>
        </PressableScale>
      </View>
    </>
  );
}

function Toggle({ label, on, onPress, colors }: { label: string; on: boolean; onPress: () => void; colors: Colors }) {
  const t = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(t, { toValue: on ? 1 : 0, useNativeDriver: true, friction: 7, tension: 120 }).start();
  }, [on, t]);
  return (
    <PressableScale onPress={onPress} haptic={false} scaleTo={0.98} style={[styles.row, { backgroundColor: colors.bg }]}>
      <Txt weight="body" size={16} color={colors.text}>{label}</Txt>
      <View style={[styles.track, { backgroundColor: on ? colors.switch : colors.subtext + "66" }]}>
        <Animated.View
          style={[
            styles.thumb,
            { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }] },
          ]}
        />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,24,40,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "85%", overflow: "hidden" },
  // flexShrink lets the scroll area give way so the footer is always in view.
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24, paddingBottom: 8, gap: 14 },
  footer: { paddingHorizontal: 24, paddingTop: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderRadius: 16, minHeight: 56 },
  section: { textTransform: "uppercase", letterSpacing: 1.5, marginTop: 8 },
  paletteRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  palette: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, minHeight: 48, justifyContent: "center" },
  help: { lineHeight: 18 },
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: "center" },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  close: { padding: 16, borderRadius: 18, alignItems: "center" },
});
