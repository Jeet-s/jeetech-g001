import { useEffect, useMemo, useState } from "react";
import { Modal, View, StyleSheet, Image } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { iap, type ShopItem } from "../modules/iap";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { makeColors } from "../game/theme";
import { art } from "../art";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { useBottomInset } from "../modules/layout";

/**
 * Shop: Remove Ads, coin packs, a rewarded "free coins" offer, and Restore
 * purchases (required so remove_ads survives reinstalls). All four actions are
 * always available; prices come from Google Play via iap.items().
 */
export function ShopScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    // A Modal lives in its own native window the root SafeAreaProvider can't
    // reach, so we mount a fresh provider here to measure the real gesture-bar
    // inset and keep the Close button above the pill (QA: layout_small).
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>
        <ShopSheet visible={visible} onClose={onClose} />
      </SafeAreaProvider>
    </Modal>
  );
}

function ShopSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [state, setState] = useState(store.get());
  const [items, setItems] = useState<ShopItem[]>(iap.items());
  useEffect(() => store.subscribe(setState), []);
  useEffect(() => {
    if (visible) setItems(iap.items());
  }, [visible]);

  const colors = useMemo(() => makeColors(state.settings.palette, state.settings.highContrast), [state.settings.palette, state.settings.highContrast]);
  const removeAds = items.find((i) => i.sku === "remove_ads");
  const packs = items.filter((i) => i.sku !== "remove_ads");
  // Keep the Close button above the Android gesture pill on edge-to-edge phones.
  const bottomInset = useBottomInset(22, { modal: true });

  return (
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottomInset }]}>
          <Image source={art.sprite_color_well} style={styles.art} resizeMode="contain" />
          <Txt weight="display" size={26} color={colors.text}>Shop</Txt>
          <View style={[styles.coinsPill, { backgroundColor: colors.bg }]}>
            <Txt weight="black" size={16} color={colors.accent}>🪙 {state.coins}</Txt>
          </View>

          {!state.adsRemoved && removeAds && (
            <ShopRow
              title="Remove Ads"
              subtitle="Remove all banner & interstitial ads forever"
              price={removeAds.price}
              colors={colors}
              feature
              onPress={() => iap.purchase("remove_ads")}
            />
          )}
          {packs.map((p) => (
            <ShopRow key={p.sku} title={p.title} price={p.price} colors={colors} onPress={() => iap.purchase(p.sku)} />
          ))}
          {ads.rewardedAvailable() && (
            <ShopRow
              title="Watch an ad for 50 coins"
              price="Free"
              colors={colors}
              onPress={() => ads.showRewarded(() => store.set({ coins: store.get().coins + 50 }))}
            />
          )}

          <PressableScale onPress={() => iap.restore()} style={styles.restore}>
            <Txt weight="label" size={14} color={colors.subtext}>Restore purchases</Txt>
          </PressableScale>
          <PressableScale onPress={onClose} style={[styles.close, { backgroundColor: colors.paint }]}>
            <Txt weight="display" size={16} color={colors.onPaint}>Close</Txt>
          </PressableScale>
        </View>
      </View>
  );
}

function ShopRow({
  title,
  subtitle,
  price,
  colors,
  feature,
  onPress,
}: {
  title: string;
  subtitle?: string;
  price: string;
  colors: ReturnType<typeof makeColors>;
  feature?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={[styles.row, { backgroundColor: feature ? colors.paint : colors.bg }]}>
      <View style={styles.rowText}>
        <Txt weight="body" size={16} color={feature ? colors.onPaint : colors.text}>{title}</Txt>
        {subtitle && <Txt weight="label" size={12} color={feature ? colors.onPaint : colors.subtext}>{subtitle}</Txt>}
      </View>
      <View style={[styles.priceTag, { backgroundColor: feature ? colors.onPaint : colors.surface }]}>
        <Txt weight="black" size={14} color={feature ? colors.paint : colors.text}>{price}</Txt>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,24,40,0.5)", justifyContent: "flex-end" },
  sheet: { padding: 22, paddingBottom: 34, gap: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28, alignItems: "stretch" },
  art: { position: "absolute", right: 18, top: 14, width: 56, height: 56, opacity: 0.9 },
  coinsPill: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 18, gap: 12, minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
  priceTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  restore: { alignItems: "center", paddingVertical: 10 },
  close: { alignItems: "center", paddingVertical: 15, borderRadius: 18, marginTop: 2 },
});
