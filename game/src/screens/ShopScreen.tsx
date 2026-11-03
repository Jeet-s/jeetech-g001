import { useEffect, useMemo, useState } from "react";
import { Modal, View, StyleSheet, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import monetization from "../../monetization.json";
import { iap, type ShopItem } from "../modules/iap";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { connectStore } from "../modules/storeConnect";
import { analytics } from "../modules/analytics";
import { makeColors, type Colors } from "../game/theme";
import { levelById, TOTAL_LEVELS } from "../game/levels";
import { SKINS, skinPaint, type Skin } from "../game/cosmetics";
import { art } from "../art";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { GameSheet, SheetSection, useToast } from "./SheetKit";

/**
 * Shop: Remove Ads, coin packs, a free-coins video (opt-in), Brushes (paint
 * colours bought with coins) and Restore purchases. Every row is always shown:
 * real store prices come from iap.items(); when the store can't be reached the
 * row says "Store unavailable" (never an invented price) and a tap explains
 * why and retries the connection. Every tap answers with a visible message.
 */
const REWARD_COINS = 50;
const STORE_DOWN = "Couldn't reach the store — check you're signed in, then try again.";

type CatalogEntry = { sku: string; title: string; description: string; coins?: number };
const CATALOG: CatalogEntry[] = monetization.iap;

export function ShopScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    // A Modal lives in its own native window the root SafeAreaProvider can't
    // reach, so we mount a fresh provider here to measure the real gesture-bar
    // inset and keep the Close button above the pill (QA: layout_small).
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>{visible && <ShopSheet onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function ShopSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState(store.get());
  const [items, setItems] = useState<ShopItem[]>(iap.items());
  const [busy, setBusy] = useState(false);
  const [toast, say] = useToast();
  useEffect(() => store.subscribe(setState), []);
  useEffect(() => {
    // Opening the Shop quietly retries a store that was unreachable at boot.
    let live = true;
    connectStore().then(() => live && setItems(iap.items()));
    return () => {
      live = false;
    };
  }, []);

  const chapter = levelById(Math.min(TOTAL_LEVELS, Math.max(1, state.level)))?.chapter ?? 1;
  const colors = useMemo(
    () => makeColors(state.settings.palette, state.settings.highContrast, chapter, state.skin),
    [state.settings.palette, state.settings.highContrast, chapter, state.skin]
  );
  const priceOf = (sku: string) => items.find((i) => i.sku === sku)?.price;

  async function buy(sku: string, title: string) {
    if (busy) return;
    if (!priceOf(sku)) {
      // Not offered by the store right now: explain, then try to reconnect.
      say(STORE_DOWN, "warn");
      setBusy(true);
      await connectStore();
      setBusy(false);
      const now = iap.items();
      setItems(now);
      if (now.some((i) => i.sku === sku)) say(`Store connected — tap ${title} again to buy.`, "good");
      return;
    }
    say(`Opening the store for ${title}…`);
    analytics.track("iap_tap", { sku });
    try {
      await iap.purchase(sku);
    } catch {
      say("The purchase didn't go through. Nothing was charged — please try again.", "warn");
    }
  }

  async function restore() {
    if (busy) return;
    say("Checking the store for your purchases…");
    setBusy(true);
    await connectStore();
    if (!iap.isConnected()) {
      setBusy(false);
      say(STORE_DOWN, "warn");
      return;
    }
    const ok = await iap.restore().catch(() => null);
    setBusy(false);
    setItems(iap.items());
    if (ok == null) say(STORE_DOWN, "warn");
    else if (ok) say("Purchases restored — ads are removed.", "good");
    else say(Platform.OS === "ios" ? "Nothing to restore — no earlier purchases on this Apple ID." : "Nothing to restore — no earlier purchases on this account.", "info");
  }

  function watchVideo() {
    const started = ads.rewardedAvailable() && ads.showRewarded(() => {
      store.set({ coins: store.get().coins + REWARD_COINS });
      say(`+${REWARD_COINS} coins — thanks for watching!`, "good");
    });
    if (!started) say("No video available right now — try again in a minute.", "info");
  }

  function pickSkin(skin: Skin) {
    const s = store.get();
    const owned = skin.price === 0 || s.ownedSkins.includes(skin.id);
    if (owned) {
      if (s.skin === skin.id) return say(`${skin.name} is already your brush.`, "info");
      store.set({ skin: skin.id });
      analytics.track("skin_equip", { skin: skin.id });
      return say(`${skin.name} brush equipped!`, "good");
    }
    if (s.coins < skin.price) return say(`You need ${skin.price - s.coins} more coins for ${skin.name}. Paint levels to earn coins.`, "warn");
    store.set({ coins: s.coins - skin.price, ownedSkins: [...s.ownedSkins, skin.id], skin: skin.id });
    analytics.track("skin_buy", { skin: skin.id, price: skin.price });
    say(`${skin.name} unlocked and equipped!`, "good");
  }

  const removeAds = CATALOG.find((c) => c.sku === "remove_ads");
  const packs = CATALOG.filter((c) => c.sku !== "remove_ads");
  const safePalette = state.settings.palette !== "classic" || state.settings.highContrast;

  return (
    <GameSheet colors={colors} title="Shop" icon={art.icon_shop} coins={state.coins} toast={toast} onClose={onClose}>
      <SheetSection>No ads</SheetSection>
      {removeAds &&
        (state.adsRemoved ? (
          <View style={[styles.row, { backgroundColor: colors.slotDeep, borderColor: colors.frameEdge }]}>
            <Txt size={26}>🚫</Txt>
            <View style={styles.rowText}>
              <Txt weight="display" size={17} color="#FFFFFF">Remove Ads</Txt>
              <Txt weight="label" size={13} color="#FFFFFFB0">Owned — no banners or between-level ads. Thank you!</Txt>
            </View>
            <View style={[styles.tag, { backgroundColor: "#2FBF71" }]}>
              <Txt weight="black" size={14} color="#FFFFFF">✓ Owned</Txt>
            </View>
          </View>
        ) : (
          <OfferRow
            emoji="🚫"
            title={removeAds.title}
            subtitle={removeAds.description}
            price={priceOf("remove_ads")}
            colors={colors}
            feature
            onPress={() => buy("remove_ads", removeAds.title)}
          />
        ))}

      <SheetSection>Coins</SheetSection>
      {packs.map((p) => (
        <OfferRow
          key={p.sku}
          emoji={p.coins && p.coins >= 1000 ? "💰" : "🪙"}
          title={p.title}
          subtitle={p.description}
          price={priceOf(p.sku)}
          colors={colors}
          onPress={() => buy(p.sku, p.title)}
        />
      ))}
      <PressableScale onPress={watchVideo} scaleTo={0.97} style={[styles.row, { backgroundColor: colors.slotDeep, borderColor: colors.frameEdge }]}>
        <Txt size={26}>🎬</Txt>
        <View style={styles.rowText}>
          <Txt weight="display" size={17} color="#FFFFFF">Watch a video for {REWARD_COINS} coins</Txt>
          <Txt weight="label" size={13} color="#FFFFFFB0">Optional — only plays when you tap here</Txt>
        </View>
        <View style={[styles.tag, { backgroundColor: "#FFB627" }]}>
          <Txt weight="black" size={14} color="#4A2A00">Free</Txt>
        </View>
      </PressableScale>

      <SheetSection>Brushes · paint colours</SheetSection>
      <Txt weight="label" size={13} color="#FFFFFFB0" style={styles.note}>
        {safePalette
          ? "Your colourblind / high-contrast setting keeps its safe paint while it is on; brushes show in the Classic palette."
          : "Pick the colour your brush paints with. Bought once with coins, yours to keep."}
      </Txt>
      <View style={styles.skinGrid}>
        {SKINS.map((sk) => (
          // PressableScale styles its inner view, so the % width lives on a wrapper.
          <View key={sk.id} style={styles.skinCell}>
            <SkinCard skin={sk} chapter={chapter} colors={colors} owned={sk.price === 0 || state.ownedSkins.includes(sk.id)} equipped={state.skin === sk.id} coins={state.coins} onPress={() => pickSkin(sk)} />
          </View>
        ))}
      </View>

      <PressableScale onPress={restore} hitSlop={6} scaleTo={0.97} style={[styles.restore, { borderColor: colors.frameEdge }]}>
        <Txt weight="display" size={15} color="#FFFFFF">Restore purchases</Txt>
      </PressableScale>
    </GameSheet>
  );
}

function OfferRow({
  emoji,
  title,
  subtitle,
  price,
  colors,
  feature,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  /** The store's own price; undefined = the store didn't offer it (unreachable). */
  price?: string;
  colors: Colors;
  feature?: boolean;
  onPress: () => void;
}) {
  const bg = feature ? colors.paint : colors.slotDeep;
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={[styles.row, { backgroundColor: bg, borderColor: feature ? colors.paintEdge : colors.frameEdge }]}>
      <Txt size={26}>{emoji}</Txt>
      <View style={styles.rowText}>
        <Txt weight="display" size={17} color="#FFFFFF" style={styles.outlinedSmall}>{title}</Txt>
        <Txt weight="label" size={13} color="#FFFFFFD0">{subtitle}</Txt>
      </View>
      {price ? (
        <View style={[styles.tag, { backgroundColor: "#FFFFFF" }]}>
          <Txt weight="black" size={15} color="#1C2033">{price}</Txt>
        </View>
      ) : (
        <View style={[styles.tag, styles.tagOff]}>
          <Txt weight="label" size={12} color="#FFFFFFD8" style={{ textAlign: "center" }}>Store{"\n"}unavailable</Txt>
        </View>
      )}
    </PressableScale>
  );
}

function SkinCard({
  skin,
  chapter,
  colors,
  owned,
  equipped,
  coins,
  onPress,
}: {
  skin: Skin;
  chapter: number;
  colors: Colors;
  owned: boolean;
  equipped: boolean;
  coins: number;
  onPress: () => void;
}) {
  const base = makeColors("classic", false, chapter);
  // Preview: three painted tiles in the skin's colour (Rainbow shows three worlds).
  const swatches = [0, 1, 2].map((i) => skinPaint(skin.id, skin.perChapter ? chapter + i * 2 : chapter) ?? { paint: base.paint, paintEdge: base.paintEdge, paintDeep: base.paintDeep });
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      style={[styles.skin, { backgroundColor: colors.slotDeep, borderColor: equipped ? "#FFE27A" : colors.frameEdge, borderWidth: equipped ? 3 : 2 }]}
    >
      <View style={styles.swatchRow}>
        {swatches.map((p, i) => (
          <View key={i} style={[styles.swatchLip, { backgroundColor: p.paintDeep }]}>
            <View style={[styles.swatch, { backgroundColor: p.paint, borderColor: p.paintEdge }]} />
          </View>
        ))}
      </View>
      <Txt weight="display" size={15} color="#FFFFFF" style={{ textAlign: "center" }}>{skin.name}</Txt>
      <Txt weight="label" size={11} color="#FFFFFFA8" style={{ textAlign: "center" }}>{skin.blurb}</Txt>
      <View
        style={[
          styles.skinTag,
          { backgroundColor: equipped ? "#2FBF71" : owned ? colors.paint : coins >= skin.price ? "#FFB627" : "rgba(255,255,255,0.14)" },
        ]}
      >
        <Txt weight="black" size={13} color={equipped || owned ? "#FFFFFF" : coins >= skin.price ? "#4A2A00" : "#FFFFFFC8"}>
          {equipped ? "✓ Equipped" : owned ? "Equip" : `🪙 ${skin.price}`}
        </Txt>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 2, minHeight: 64 },
  rowText: { flex: 1, gap: 2 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minWidth: 64, alignItems: "center" },
  tagOff: { backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", paddingVertical: 4 },
  note: { marginHorizontal: 4, lineHeight: 18 },
  skinGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  skinCell: { width: "48%" },
  skin: { alignItems: "center", minHeight: 168, gap: 4, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 18 },
  swatchRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  swatchLip: { width: 30, height: 34, borderRadius: 9 },
  swatch: { width: 30, height: 30, borderRadius: 9, borderWidth: 2 },
  skinTag: { marginTop: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, minWidth: 96, alignItems: "center" },
  restore: { marginTop: 8, alignItems: "center", paddingVertical: 14, borderRadius: 16, borderWidth: 2, backgroundColor: "rgba(0,0,0,0.18)" },
  outlinedSmall: { textShadowColor: "rgba(10,12,35,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
