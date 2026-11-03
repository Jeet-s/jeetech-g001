import { useEffect, useRef, useState } from "react";
import { Modal, View, StyleSheet, Animated, Image, type ImageSourcePropType } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { feedback } from "../modules/feedback";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { type Colors, PALETTE_ORDER, PALETTE_LABELS, type Palette } from "../game/theme";
import { art } from "../art";
import { GameSheet, SheetSection } from "./SheetKit";

/**
 * Settings: sound, haptics, colourblind palette and high-contrast toggles, plus
 * "How to play" (a rules sheet with the game's own tile art) and "Replay
 * tutorial" (resets the coached first levels and opens Level 1).
 *
 * A React Native Modal renders in its own native window that the app's root
 * SafeAreaProvider does not reach, so we mount a fresh SafeAreaProvider inside
 * the Modal; the "Done" button lives in GameSheet's pinned footer padded by
 * that inset — it always clears the gesture bar on small phones (QA: layout_small).
 */
export function SettingsModal({
  visible,
  colors,
  onClose,
  onReplayTutorial,
}: {
  visible: boolean;
  colors: Colors;
  onClose: () => void;
  /** Resets the tutorial and opens Level 1 coached (wired in GameScreen). */
  onReplayTutorial?: () => void;
}) {
  const [page, setPage] = useState<"settings" | "help">("settings");
  useEffect(() => {
    if (visible) setPage("settings");
  }, [visible]);
  const close = () => (page === "help" ? setPage("settings") : onClose());
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <SafeAreaProvider>
        {visible &&
          (page === "help" ? (
            <HowToPlay colors={colors} onBack={() => setPage("settings")} onReplay={onReplayTutorial} />
          ) : (
            <SettingsSheet colors={colors} onClose={onClose} onHelp={() => setPage("help")} onReplay={onReplayTutorial} />
          ))}
      </SafeAreaProvider>
    </Modal>
  );
}

function SettingsSheet({ colors, onClose, onHelp, onReplay }: { colors: Colors; onClose: () => void; onHelp: () => void; onReplay?: () => void }) {
  const [settings, setSettings] = useState(store.get().settings);
  useEffect(() => store.subscribe((s) => setSettings(s.settings)), []);

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
    <GameSheet colors={colors} title="Settings" icon={art.icon_gear} closeLabel="Done" onClose={onClose}>
      <SheetSection>Help</SheetSection>
      <PressableScale onPress={onHelp} scaleTo={0.97} style={[styles.row, { backgroundColor: colors.slot, borderColor: colors.frameEdge }]}>
        <Image source={art.icon_help} style={styles.rowIcon} resizeMode="contain" />
        <Txt weight="display" size={17} color="#FFFFFF" style={{ flex: 1 }}>How to play</Txt>
        <Txt weight="display" size={20} color="#FFFFFF">›</Txt>
      </PressableScale>
      {onReplay && (
        <PressableScale onPress={onReplay} scaleTo={0.97} style={[styles.row, { backgroundColor: colors.slot, borderColor: colors.frameEdge }]}>
          <Image source={art.icon_reset} style={styles.rowIcon} resizeMode="contain" />
          <Txt weight="display" size={17} color="#FFFFFF" style={{ flex: 1 }}>Replay tutorial</Txt>
          <Txt weight="label" size={13} color="#FFFFFFB0">Level 1</Txt>
        </PressableScale>
      )}

      <SheetSection>Sound & feel</SheetSection>
      <Toggle label="Sound" on={settings.sound} onPress={() => toggle("sound")} colors={colors} />
      <Toggle label="Haptics" on={settings.haptics} onPress={() => toggle("haptics")} colors={colors} />
      <Toggle label="High Contrast" on={settings.highContrast} onPress={() => toggle("highContrast")} colors={colors} />

      <SheetSection>Colourblind palette</SheetSection>
      <View style={styles.paletteRow}>
        {PALETTE_ORDER.map((p) => {
          const active = settings.palette === p;
          return (
            <PressableScale
              key={p}
              onPress={() => setPalette(p)}
              style={[styles.palette, { backgroundColor: active ? colors.paint : colors.slotDeep, borderColor: active ? colors.paintEdge : colors.frameEdge }]}
            >
              <Txt weight="body" size={13} color="#FFFFFF">{PALETTE_LABELS[p]}</Txt>
            </PressableScale>
          );
        })}
      </View>
      <Txt weight="label" size={12} color="#FFFFFFB0" style={styles.help}>
        Gates and switches also use distinct shapes and letters, so levels stay readable with any palette.
      </Txt>
    </GameSheet>
  );
}

const RULES: { icon: ImageSourcePropType; title: string; text: string }[] = [
  { icon: art.character_brush_mascot, title: "Roll the paint", text: "Swipe up, down, left or right. The brush rolls until it hits a wall, painting every tile it crosses." },
  { icon: art.sprite_board_tile, title: "Paint every tile", text: "A level is done when the whole board is painted. Plan your route — the brush can't stop halfway." },
  { icon: art.sprite_switch_pad, title: "Switches & gates", text: "Roll over a switch to open the gate with the same colour and letter. Closed gates block the brush." },
  { icon: art.sprite_crumble_tile, title: "Crumble tiles", text: "Cracked tiles hold for one pass, then crumble into a hole you can't cross again." },
  { icon: art.sprite_one_way_arrow, title: "Turn pads", text: "Roll onto an arrow pad and the brush turns that way and keeps rolling. If that way is blocked, it stops on the pad." },
  { icon: art.icon_daily, title: "Timed levels", text: "A few master levels have a generous clock. Paint the board before it runs out — Undo and Reset are always free." },
  { icon: art.star_gold, title: "Stars & par", text: "Finish in par moves or fewer for 3 stars, within par + 2 for 2 stars, otherwise 1. Stars and coins fill your Inbox goals." },
];

function HowToPlay({ colors, onBack, onReplay }: { colors: Colors; onBack: () => void; onReplay?: () => void }) {
  return (
    <GameSheet colors={colors} title="How to play" icon={art.icon_help} closeLabel="Back to settings" onClose={onBack}>
      {RULES.map((r) => (
        <View key={r.title} style={[styles.rule, { backgroundColor: colors.slotDeep, borderColor: colors.frameEdge }]}>
          <View style={[styles.ruleIcon, { backgroundColor: colors.slot }]}>
            <Image source={r.icon} style={styles.ruleImg} resizeMode="contain" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="display" size={16} color="#FFFFFF">{r.title}</Txt>
            <Txt weight="label" size={13} color="#FFFFFFD0" style={{ lineHeight: 18 }}>{r.text}</Txt>
          </View>
        </View>
      ))}
      {onReplay && (
        <PressableScale onPress={onReplay} scaleTo={0.96} hitSlop={6} style={[styles.replayLip, { backgroundColor: "#C77A00" }]}>
          <View style={styles.replay}>
            <Txt weight="display" size={17} color="#4A2A00">Replay tutorial · Level 1</Txt>
          </View>
        </PressableScale>
      )}
    </GameSheet>
  );
}

function Toggle({ label, on, onPress, colors }: { label: string; on: boolean; onPress: () => void; colors: Colors }) {
  const t = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(t, { toValue: on ? 1 : 0, useNativeDriver: true, friction: 7, tension: 120 }).start();
  }, [on, t]);
  return (
    <PressableScale onPress={onPress} haptic={false} scaleTo={0.98} style={[styles.row, { backgroundColor: colors.slotDeep, borderColor: colors.frameEdge }]}>
      <Txt weight="display" size={16} color="#FFFFFF" style={{ flex: 1 }}>{label}</Txt>
      <Txt weight="label" size={12} color="#FFFFFFB0">{on ? "On" : "Off"}</Txt>
      <View style={[styles.track, { backgroundColor: on ? "#2FBF71" : "rgba(255,255,255,0.22)" }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }] }]} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, borderWidth: 2, minHeight: 56 },
  rowIcon: { width: 26, height: 26 },
  paletteRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  palette: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2, minHeight: 46, justifyContent: "center" },
  help: { lineHeight: 18, marginHorizontal: 4 },
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: "center" },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  rule: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 2 },
  ruleIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ruleImg: { width: 40, height: 40 },
  replayLip: { borderRadius: 18, paddingBottom: 5, marginTop: 4 },
  replay: { minHeight: 52, borderRadius: 18, backgroundColor: "#FFB627", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFE27A" },
});
