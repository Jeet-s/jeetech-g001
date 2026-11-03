import { useEffect, useState } from "react";
import { View, StyleSheet, Linking, Platform, Settings } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { GameScreen } from "./screens/GameScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { analytics } from "./modules/analytics";
import { ads } from "./modules/ads";
import { connectStore } from "./modules/storeConnect";
import { store } from "./modules/store";
import { layout } from "./modules/layout";
import { fontMap } from "./ui/fonts";
import { ScreenshotScene } from "./screenshots";
import { qa } from "./modules/qa";

/**
 * Root of the premium runtime. Boot order matters: fonts → player state →
 * consent + ads → billing. The builder keeps this shell: font loading, the
 * banner slot (whose measured height feeds layout so controls clear it), and
 * screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts(fontMap);
  // Screenshot mode (<scheme>://shot/<id>): render a store-screenshot scene
  // without ads or billing. undefined = still checking the launch URL.
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // iOS store captures launch with `-AGFShot <id>` (a deep link would raise
    // an "Open in …?" prompt); the argument lands in NSUserDefaults.
    if (Platform.OS === "ios") {
      const arg = Settings.get("AGFShot");
      if (typeof arg === "string" && /^[\w-]+$/.test(arg)) {
        setShot(arg);
        return;
      }
    }
    Linking.getInitialURL()
      .then((u) => {
        // QA level replay (<scheme>://qa/level/<n>, src/modules/qa.ts): straight into level n.
        const lv = Number(u?.match(/qa\/level\/(\d+)/)?.[1] ?? NaN);
        if (Number.isFinite(lv) && lv > 0) qa.level = lv;
        setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null);
      })
      .catch(() => setShot(null));
  }, []);

  const ready = fontsLoaded && shot !== undefined;
  return (
    <SafeAreaProvider>
      {!ready ? (
        <View style={styles.root} />
      ) : shot ? (
        <View style={styles.root}>
          <StatusBar style="dark" />
          <ScreenshotScene id={shot} />
        </View>
      ) : (
        <Game />
      )}
    </SafeAreaProvider>
  );
}

function Game() {
  const [booted, setBooted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  // The banner sits above the gesture pill / home indicator; its measured
  // height includes that inset so bottom controls clear both.
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      await store.load();
      analytics.track("app_open");
      setBooted(true);
      if (qa.level) return; // QA replay: no ads, no billing — nothing may cover the board
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await connectStore();
    })();
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);

  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.flex}>{booted && <GameScreen onOpenShop={() => setShopOpen(true)} />}</View>
      <ShopScreen visible={shopOpen} onClose={() => setShopOpen(false)} />
      {showBanner && (
        <View style={[styles.banner, { paddingBottom: insets.bottom }]} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
          <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#E7EDF7" },
  flex: { flex: 1 },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
});
