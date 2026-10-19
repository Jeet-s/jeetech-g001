import { useEffect, useState } from "react";
import { View, StyleSheet, Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { GameScreen } from "./screens/GameScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { analytics } from "./modules/analytics";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store } from "./modules/store";
import { layout } from "./modules/layout";
import { fontMap } from "./ui/fonts";
import { ScreenshotScene } from "./screenshots";

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
    Linking.getInitialURL()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
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

  useEffect(() => {
    (async () => {
      await store.load();
      analytics.track("app_open");
      setBooted(true);
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
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
        <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
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
