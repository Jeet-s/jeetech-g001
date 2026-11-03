import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Colors } from "../game/theme";
import { rewardsFor, claimReward, type Reward } from "../game/rewards";
import { store } from "../modules/store";
import { feedback } from "../modules/feedback";
import { art } from "../art";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { GameSheet, SheetSection, useToast } from "./SheetKit";

/**
 * Inbox (Home → gift button): the daily gift, chapter-complete rewards and
 * star milestones (src/game/rewards.ts). Claim pays coins — the balance in the
 * header counts up, a "+N" floats off the button and the row turns ✓.
 */
export function InboxScreen({ visible, colors, onClose }: { visible: boolean; colors: Colors; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>{visible && <InboxSheet colors={colors} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function InboxSheet({ colors, onClose }: { colors: Colors; onClose: () => void }) {
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  const [toast, say] = useToast();
  const rewards = rewardsFor(s);
  // Order is fixed when the sheet opens (claimable first), so a claimed row
  // stays in place while its "+N" floats off and its button turns ✓.
  const [order] = useState(() => rewardsFor(store.get()).map((r) => r.id));
  const rows = [...order.map((id) => rewards.find((r) => r.id === id)), ...rewards.filter((r) => !order.includes(r.id))].filter(
    (r): r is Reward => r != null
  );
  const ready = rewards.filter((r) => r.state === "claimable");

  function claim(r: Reward) {
    const paid = claimReward(r.id);
    if (paid > 0) {
      feedback.tap();
      say(`+${paid} coins — ${r.title} claimed!`, "good");
    }
  }

  return (
    <GameSheet colors={colors} title="Inbox" icon={art.ui_reward_chest} coins={s.coins} toast={toast} onClose={onClose}>
      <SheetSection>{ready.length > 0 ? `Rewards · ${ready.length} ready to claim` : "Rewards · all caught up"}</SheetSection>
      {ready.length === 0 && (
        <Txt weight="label" size={14} color="#FFFFFFC0" style={styles.empty}>
          Nothing to claim right now. Paint levels to earn stars and finish chapters — a new daily gift arrives tomorrow.
        </Txt>
      )}
      {rows.map((r) => (
        <RewardRow
          key={r.id}
          r={r}
          colors={colors}
          onClaim={() => (r.state === "claimable" ? claim(r) : say(r.state === "claimed" ? "Already claimed." : `Keep going — ${r.detail}.`, "info"))}
        />
      ))}
    </GameSheet>
  );
}

const ICON: Record<Reward["kind"], string> = { gift: "🎁", chapter: "🖼️", stars: "⭐" };

function RewardRow({ r, colors, onClaim }: { r: Reward; colors: Colors; onClaim: () => void }) {
  const fly = useRef(new Animated.Value(0)).current;
  const [flying, setFlying] = useState(false);
  const claimable = r.state === "claimable";
  function press() {
    if (claimable) {
      setFlying(true);
      fly.setValue(0);
      Animated.timing(fly, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setFlying(false));
    }
    onClaim();
  }
  return (
    <View style={[styles.row, { backgroundColor: claimable ? colors.slot : colors.slotDeep, borderColor: claimable ? "#FFE27A" : colors.frameEdge }]}>
      <Txt size={26}>{ICON[r.kind]}</Txt>
      <View style={styles.text}>
        <Txt weight="display" size={16} color="#FFFFFF" style={styles.outlinedSmall}>{r.title}</Txt>
        <Txt weight="label" size={13} color="#FFFFFFC8">{r.detail}</Txt>
        {r.state === "locked" && (
          <View style={[styles.track, { backgroundColor: "rgba(0,0,0,0.3)" }]}>
            <View style={{ width: `${Math.max(4, r.progress * 100)}%`, height: "100%", borderRadius: 4, backgroundColor: colors.paint }} />
          </View>
        )}
      </View>
      <View>
        <PressableScale
          onPress={press}
          hitSlop={8}
          scaleTo={0.92}
          style={[styles.btn, { backgroundColor: claimable ? "#FFB627" : r.state === "claimed" ? "#2FBF71" : "rgba(255,255,255,0.14)" }]}
        >
          {r.state === "claimed" ? (
            <Txt weight="black" size={14} color="#FFFFFF">✓ Claimed</Txt>
          ) : (
            <View style={styles.btnInner}>
              <Txt weight="black" size={14} color={claimable ? "#4A2A00" : "#FFFFFFC0"}>{claimable ? "Claim" : "Locked"}</Txt>
              <Txt weight="black" size={12} color={claimable ? "#4A2A00" : "#FFFFFFA0"}>🪙 {r.coins}</Txt>
            </View>
          )}
        </PressableScale>
        {flying && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fly,
              {
                opacity: fly.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [{ translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -46] }) }, { scale: fly.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.2, 1] }) }],
              },
            ]}
          >
            <Txt weight="black" size={18} color="#FFE27A" style={styles.outlinedSmall}>+{r.coins} 🪙</Txt>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 2, minHeight: 66 },
  text: { flex: 1, gap: 2 },
  track: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  btn: { minWidth: 92, minHeight: 46, paddingHorizontal: 12, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnInner: { alignItems: "center" },
  fly: { position: "absolute", top: -6, left: 0, right: 0, alignItems: "center" },
  empty: { marginHorizontal: 4, lineHeight: 20 },
  outlinedSmall: { textShadowColor: "rgba(10,12,35,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
