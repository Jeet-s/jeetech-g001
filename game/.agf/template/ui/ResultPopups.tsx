import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Popup } from "./Popup";
import { Stars } from "./Stars";
import { GameButton } from "./GameButton";
import { AnimatedNumber } from "./AnimatedNumber";
import { Confetti } from "../fx/Confetti";
import { fonts, palette, springs } from "./theme";
import { play, haptic } from "../audio/sfx";
import { share } from "../modules/share";
import { qa } from "../modules/qa";

const REVEAL_MS = 1250; // after the third star lands

/**
 * Level complete — a staged celebration, never a static card (QA game_feel 2026-10-21..28: "the win card is static,
 * no confetti, star pop or coin count-up", "+0 Lamps then jumps to +50"):
 *   0 ms confetti burst behind the card (inside the modal — outside it the dim hides it) → stars pop in with chimes →
 *   a second burst → the reward row springs in and COUNTS UP from 0 with a coin sound → "Next Level" keeps breathing.
 * The reward row keeps its height from the first frame (nothing jumps) and shows no number until it counts.
 * A small "Share" button (native share sheet + Play link, src/modules/share.ts) sits next to Replay/Map — pass
 * showShare={false} to hide it; it is always hidden in QA level replay.
 */
export function WinPopup({ visible, stars, coins, onNext, onReplay, onMap, title = "Level Complete!", showShare = true }: {
  visible: boolean; stars: number; coins: number; onNext: () => void; onReplay?: () => void; onMap?: () => void; title?: string; showShare?: boolean;
}) {
  const [burst, setBurst] = useState(0);
  const [reveal, setReveal] = useState(false);
  const row = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    setReveal(false);
    row.value = 0;
    breathe.value = 0;
    play("success");
    haptic("success");
    const a = setTimeout(() => setBurst((b) => b + 1), 120);
    const b = setTimeout(() => setBurst((n) => n + 1), 900);
    const c = setTimeout(() => {
      setReveal(true);
      row.value = withSpring(1, springs.pop);
      breathe.value = withDelay(700, withRepeat(withSequence(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) })), -1));
      play("coin");
      haptic("medium");
    }, REVEAL_MS);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [visible, coins, row, breathe]);
  const rowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, row.value * 1.4), transform: [{ scale: 0.6 + 0.4 * row.value }] }));
  const nextStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.04 }] }));
  return (
    <Popup visible={visible} title={title} underlay={<Confetti trigger={burst} />}>
      <Stars count={stars} animate={visible} size={52} />
      <View style={styles.rewardSlot}>
        <Animated.View style={[styles.reward, rowStyle]}>
          <Text style={styles.coin}>🪙</Text>
          <Text style={styles.plus}>+</Text>
          {reveal ? <AnimatedNumber from={0} value={coins} duration={800} style={styles.coinText} /> : null}
        </Animated.View>
      </View>
      <Animated.View style={nextStyle}>
        <GameButton label="Next Level" variant="accent" size="lg" onPress={onNext} />
      </Animated.View>
      <View style={styles.row}>
        {onReplay ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="↻ Replay" onPress={onReplay} /> : null}
        {onMap ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="Map" onPress={onMap} /> : null}
        {showShare && qa.level == null ? <GameButton style={{ flex: 1 }} size="sm" variant="light" label="📤 Share" onPress={() => void share.app("win")} /> : null}
      </View>
    </Popup>
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
  rewardSlot: { height: 58, marginVertical: 16 },
  reward: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.surfaceAlt, borderRadius: 18 },
  coin: { fontSize: 28 },
  plus: { fontFamily: fonts.display, fontSize: 26, color: palette.accentDark },
  coinText: { fontFamily: fonts.display, fontSize: 30, color: palette.accentDark },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  msg: { fontFamily: fonts.body, fontSize: 18, color: palette.inkSoft, textAlign: "center", marginBottom: 18 },
});
