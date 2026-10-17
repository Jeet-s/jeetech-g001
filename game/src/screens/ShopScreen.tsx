import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { iap, type ShopItem } from "../modules/iap";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { feedback } from "../modules/feedback";

/**
 * Shop: Remove Ads, coin packs, a rewarded "free coins" offer, and Restore
 * purchases (required so remove_ads survives reinstalls). The builder restyles
 * it per the GDD but keeps all four actions.
 */
export function ShopScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [state, setState] = useState(store.get());
  const [items, setItems] = useState<ShopItem[]>(iap.items());

  useEffect(() => store.subscribe(setState), []);
  useEffect(() => {
    if (visible) setItems(iap.items());
  }, [visible]);

  const removeAds = items.find((i) => i.sku === "remove_ads");
  const packs = items.filter((i) => i.sku !== "remove_ads");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Shop</Text>
          <Text style={styles.coins}>Coins: {state.coins}</Text>

          {!state.adsRemoved && (
            <Pressable
              style={styles.row}
              onPress={() => {
                feedback.tap();
                iap.purchase("remove_ads");
              }}
            >
              <Text style={styles.label}>Remove Ads</Text>
              <Text style={styles.price}>{removeAds?.price ?? "—"}</Text>
            </Pressable>
          )}
          {packs.map((p) => (
            <Pressable
              key={p.sku}
              style={styles.row}
              onPress={() => {
                feedback.tap();
                iap.purchase(p.sku);
              }}
            >
              <Text style={styles.label}>{p.title}</Text>
              <Text style={styles.price}>{p.price}</Text>
            </Pressable>
          ))}
          {ads.rewardedAvailable() && (
            <Pressable
              style={styles.row}
              onPress={() => {
                feedback.tap();
                ads.showRewarded(() => store.set({ coins: store.get().coins + 50 }));
              }}
            >
              <Text style={styles.label}>Watch an ad for 50 coins</Text>
              <Text style={styles.price}>Free</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              feedback.tap();
              iap.restore();
            }}
          >
            <Text style={styles.link}>Restore purchases</Text>
          </Pressable>
          <Pressable
            style={styles.close}
            onPress={() => {
              feedback.tap();
              onClose();
            }}
          >
            <Text style={styles.label}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#151826", padding: 24, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { color: "#e7e9f0", fontSize: 22, fontWeight: "700" },
  coins: { color: "#f5c451", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1f2336", padding: 16, borderRadius: 12 },
  label: { color: "#e7e9f0", fontSize: 16 },
  price: { color: "#6d8bff", fontSize: 16, fontWeight: "600" },
  link: { color: "#8b90a6", textAlign: "center", paddingVertical: 8 },
  close: { alignItems: "center", padding: 12 },
});
