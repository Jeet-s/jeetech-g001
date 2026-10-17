import {
  initConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
} from "expo-iap";
import monetization from "../../monetization.json";
import { store } from "./store";
import { analytics } from "./analytics";

/**
 * Google Play Billing via expo-iap. Products are defined in monetization.json
 * and created in Play Console by the factory's publisher (same SKUs).
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

  items(): ShopItem[] {
    return items;
  },

  async purchase(sku: string): Promise<void> {
    if (!connected) return;
    await requestPurchase({ request: { google: { skus: [sku] } }, type: "in-app" });
  },

  /** Re-grant non-consumables (remove_ads) on reinstall / new device. */
  async restore(): Promise<void> {
    if (!connected) return;
    const owned = await getAvailablePurchases();
    for (const p of owned ?? []) {
      if (p.productId === "remove_ads") store.set({ adsRemoved: true });
    }
  },
};
