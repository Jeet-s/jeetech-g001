import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text } from "react-native";
import { Popup } from "./Popup";
import { Toggle } from "./Toggle";
import { GameButton } from "./GameButton";
import { store } from "../modules/store";
import { iap } from "../modules/iap";
import { share } from "../modules/share";
import { fonts, palette } from "./theme";

/** Settings: sound, music, haptics, share, restore purchases, privacy. */
export function SettingsPopup({ visible, onClose, privacyUrl }: { visible: boolean; onClose: () => void; privacyUrl?: string }) {
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  return (
    <Popup visible={visible} title="Settings" onClose={onClose}>
      <Toggle label="Sound" value={s.sound !== false} onChange={(v) => store.set({ sound: v })} />
      <Toggle label="Music" value={s.music !== false} onChange={(v) => store.set({ music: v })} />
      <Toggle label="Vibration" value={s.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
      {/* Share the game (src/modules/share.ts) — factory-owned, keep it (owner, 2026-10-25). */}
      <GameButton style={{ marginTop: 14 }} size="sm" variant="light" label="📤 Share with friends" onPress={() => void share.app("settings")} />
      <GameButton style={{ marginTop: 10 }} size="sm" variant="light" label="Restore purchases" onPress={() => iap.restore()} />
      {privacyUrl ? (
        <Text style={styles.link} onPress={() => Linking.openURL(privacyUrl)}>Privacy policy</Text>
      ) : null}
      <GameButton style={{ marginTop: 14 }} label="Done" onPress={onClose} />
    </Popup>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: fonts.bodyRegular, color: palette.inkSoft, textAlign: "center", marginTop: 12, textDecorationLine: "underline" },
});
