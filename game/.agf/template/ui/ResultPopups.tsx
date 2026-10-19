import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Popup } from "./Popup";
import { Stars } from "./Stars";
import { GameButton } from "./GameButton";
import { AnimatedNumber } from "./AnimatedNumber";
import { Confetti } from "../fx/Confetti";
import { fonts, palette } from "./theme";
import { play, haptic } from "../audio/sfx";

/** Level complete: stars pop in with chimes, confetti, coin reward counts up. */
export function WinPopup({ visible, stars, coins, onNext, onReplay, onMap, title = "Level Complete!" }: {
  visible: boolean; stars: number; coins: number; onNext: () => void; onReplay?: () => void; onMap?: () => void; title?: string;
}) {
  const [burst, setBurst] = useState(0);
  const [shownCoins, setShownCoins] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setShownCoins(0);
    play("success");
    haptic("success");
    const a = setTimeout(() => setBurst((b) => b + 1), 200);
    const c = setTimeout(() => {
      setShownCoins(coins);
      play("coin");
    }, 1400);
    return () => { clearTimeout(a); clearTimeout(c); };
  }, [visible, coins]);
  return (
    <>
      <Popup visible={visible} title={title}>
        <Stars count={stars} animate={visible} size={52} />
        <View style={styles.reward}>
          <Text style={styles.coin}>🪙</Text>
          <Text style={styles.plus}>+</Text>
          <AnimatedNumber value={shownCoins} style={styles.coinText} />
        </View>
        <GameButton label="Next Level" variant="accent" size="lg" onPress={onNext} />
        <View style={styles.row}>
          {onReplay ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="↻ Replay" onPress={onReplay} /> : null}
          {onMap ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="Map" onPress={onMap} /> : null}
        </View>
      </Popup>
      {visible ? <Confetti trigger={burst} /> : null}
    </>
  );
}

/** Level failed: encouraging copy, retry first, optional continue via rewarded ad. */
export function FailPopup({ visible, message = "So close! Try again?", onRetry, onContinue, onMap }: {
  visible: boolean; message?: string; onRetry: () => void; onContinue?: () => void; onMap?: () => void;
}) {
  useEffect(() => {
    if (visible) { play("fail"); haptic("warning"); }
  }, [visible]);
  return (
    <Popup visible={visible} title="Out of moves">
      <Text style={styles.msg}>{message}</Text>
      <GameButton label="Try Again" variant="primary" size="lg" onPress={onRetry} />
      {onContinue ? <GameButton style={{ marginTop: 12 }} label="▶ Continue (watch ad)" variant="secondary" onPress={onContinue} /> : null}
      {onMap ? <GameButton style={{ marginTop: 12 }} size="sm" variant="light" label="Back to map" onPress={onMap} /> : null}
    </Popup>
  );
}

const styles = StyleSheet.create({
  reward: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginVertical: 16, backgroundColor: palette.surfaceAlt, borderRadius: 18, paddingVertical: 10 },
  coin: { fontSize: 28 },
  plus: { fontFamily: fonts.display, fontSize: 26, color: palette.accentDark },
  coinText: { fontFamily: fonts.display, fontSize: 30, color: palette.accentDark },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  msg: { fontFamily: fonts.body, fontSize: 18, color: palette.inkSoft, textAlign: "center", marginBottom: 18 },
});
