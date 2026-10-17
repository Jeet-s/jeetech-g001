import { useEffect, useState } from "react";
import { View, StyleSheet, Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { GameScreen } from "./screens/GameScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { analytics } from "./modules/analytics";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store } from "./modules/store";
import { ScreenshotScene } from "./screenshots";

/**
 * Root of the base runtime. Boot order matters: player state → consent + ads
 * → billing. The Claude Code builder extends the screen set per the GDD but
 * keeps this boot sequence and the banner slot.
 */
export default function App() {
  // Screenshot mode (<scheme>://shot/<id>): render a store-screenshot scene
  // without ads or billing. undefined = still checking the launch URL.
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    Linking.getInitialURL()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
  }, []);
  if (shot === undefined) return <View style={styles.root} />;
  if (shot) return <ScreenshotScene id={shot} />;
  return <Game />;
}

function Game() {
  const [booted, setBooted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

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

  const [shopOpen, setShopOpen] = useState(false);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.game}>{booted && <GameScreen onOpenShop={() => setShopOpen(true)} />}</View>
      <ShopScreen visible={shopOpen} onClose={() => setShopOpen(false)} />
      {showBanner && (
        <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0c10" },
  game: { flex: 1 },
});
