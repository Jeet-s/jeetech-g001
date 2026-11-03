import {
  initConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
} from "./expo-iap-ios";
import { Platform } from "react-native";
import monetization from "../../monetization.json";
import { store } from "./store";
import { analytics } from "./analytics";

/**
 * Store billing via expo-iap: Google Play Billing on Android, StoreKit on iOS.
 * Products are defined in monetization.json and created in both stores by the
 * factory's publisher (same SKUs). Only products the store returns are shown,
 * at the store's own prices.
 */
type Sku = { sku: string; consumable: boolean; coins?: number };
const catalog: Sku[] = monetization.iap;
const bySku = new Map(catalog.map((p) => [p.sku, p]));

export interface ShopItem {
  sku: string;
  title: string;
  price: string;
}

let connected = false;
let items: ShopItem[] = [];

function grant(p: Purchase): void {
  const def = bySku.get(p.productId);
  if (!def) return;
  if (p.productId === "remove_ads") store.set({ adsRemoved: true });
  if (def.coins) store.set({ coins: store.get().coins + def.coins });
  analytics.track("iap_purchase", { sku: p.productId });
}

export const iap = {
  async init(): Promise<void> {
    try {
      connected = await initConnection();
      if (!connected) return;
      purchaseUpdatedListener(async (p) => {
        grant(p);
        const def = bySku.get(p.productId);
        await finishTransaction({ purchase: p, isConsumable: !!def?.consumable }).catch(() => {});
      });
      purchaseErrorListener((e) => {
        if (__DEV__) console.warn("[iap] purchase error", e);
      });
      const products = (await fetchProducts({ skus: catalog.map((p) => p.sku), type: "in-app" })) ?? [];
      items = products.map((p) => ({
        sku: p.id,
        title: p.title,
        price: p.displayPrice,
      }));
      await iap.restore();
    } catch (e) {
      if (__DEV__) console.warn("[iap] init failed", e);
    }
  },

  /** Whether the store connection is up (Restore can actually reach the store). */
  isConnected(): boolean {
    return connected;
  },

  items(): ShopItem[] {
    return items;
  },

  async purchase(sku: string): Promise<void> {
    if (!connected) return;
    if (Platform.OS === "ios") {
      // StoreKit. A cancelled sheet rejects here; the error listener logs it.
      await requestPurchase({ request: { apple: { sku }, google: { skus: [sku] } }, type: "in-app" }).catch(() => {});
      return;
    }
    await requestPurchase({ request: { google: { skus: [sku] } }, type: "in-app" });
  },

  /** Re-grant non-consumables (remove_ads) on reinstall / new device. */
  async restore(): Promise<boolean> {
    if (!connected) return false;
    const owned = await getAvailablePurchases();
    let restored = false;
    for (const p of owned ?? []) {
      if (p.productId === "remove_ads") {
        store.set({ adsRemoved: true });
        restored = true;
      }
    }
    return restored;
  },
};
