import { useEffect, useLayoutEffect, useState } from "react";
import { Linking, Platform, Settings, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from "@expo-google-fonts/fredoka";
import { Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { HomeScreen } from "./screens/HomeScreen";
import { LevelsScreen } from "./screens/LevelsScreen";
import { GameScreen } from "./screens/GameScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { SettingsPopup, initAudio } from "./ui";
import { analytics } from "./modules/analytics";
import { layout } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store } from "./modules/store";
import { ScreenshotScene } from "./screenshots";
import { qa } from "./modules/qa";

// Screenshot mode: <scheme>://shot/<id> on Android; on iOS the factory passes the scene as the launch argument
// -AGFShot <id> (iOS 27 asks "Open in …?" for deep links, which would end up in the store screenshots).
const initialShotUrl = (): Promise<string | null | undefined> => {
  const id = Platform.OS === "ios" ? (Settings.get("AGFShot") as string | undefined) : undefined;
  return id ? Promise.resolve(`agf://shot/${id}`) : Linking.getInitialURL();
};

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root of the premium runtime. Boot order matters: fonts → player state →
 * audio → consent + ads → billing. The builder adds screens/flows but keeps
 * this shell: providers, fonts, the banner slot and screenshot mode.
 */
export default function App() {
  const [fontsLoaded] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_600SemiBold, Nunito_700Bold });
  // Screenshot mode (<scheme>://shot/<id>): render a store-screenshot scene
  // without ads or billing. undefined = still checking the launch URL.
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    initialShotUrl()
      .then((u) => {
        // QA level replay (<scheme>://qa/level/<n>, src/modules/qa.ts): straight into level n.
        const lv = Number(u?.match(/qa\/level\/(\d+)/)?.[1] ?? NaN);
        if (Number.isFinite(lv) && lv > 0) qa.level = lv;
        setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null);
      })
      .catch(() => setShot(null));
  }, []);
  const ready = fontsLoaded && shot !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <View style={styles.root} />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {shot ? <ScreenshotScene id={shot} /> : <Game />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Game() {
  const [booted, setBooted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [screen, setScreen] = useState<{ name: "home" } | { name: "levels" } | { name: "game"; level: number }>(
    qa.level ? { name: "game", level: qa.level } : { name: "home" },
  );
  const [shopOpen, setShopOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      await store.load();
      analytics.track("app_open");
      setBooted(true);
      await initAudio();
      if (qa.level) return; // QA replay: no ads, no billing — nothing may cover the board
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
    })();
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);
  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);

  if (!booted) return <View style={styles.root} />;
  return (
    <View style={styles.root}>
      <ScreenFade id={screen.name === "game" ? `game-${screen.level}` : screen.name}>
        {screen.name === "home" ? (
          <HomeScreen
            onPlay={(level) => setScreen({ name: "game", level })}
            onLevels={() => setScreen({ name: "levels" })}
            onShop={() => setShopOpen(true)}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : screen.name === "levels" ? (
          <LevelsScreen onPlay={(level) => setScreen({ name: "game", level })} onBack={() => setScreen({ name: "home" })} />
        ) : (
          <GameScreen
            key={screen.level}
            levelNumber={screen.level}
            onExit={() => setScreen({ name: "home" })}
            onSettings={() => setSettingsOpen(true)}
            onNextLevel={(level) => setScreen({ name: "game", level })}
          />
        )}
      </ScreenFade>
      <ShopScreen visible={shopOpen} onClose={() => setShopOpen(false)} />
      <SettingsPopup visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {showBanner && (
        // The banner sits ABOVE the gesture pill / home indicator (edge-to-edge draws the app under them — "banner ad
        // covered by the gesture bar", layout_small 2026-10-23); its measured height includes that inset, so
        // useBottomInset() clears both.
        <View style={[styles.banner, { paddingBottom: insets.bottom }]} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
          <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
        </View>
      )}
    </View>
  );
}

/**
 * Screen change: the new screen eases in from 35 % opacity — a stable container, never a keyed `entering` /
 * `exiting` layout animation and never a fade from 0. Why (2026-10-20..27): keyed entering containers stuck blank on
 * Android ("blank screen after Play"), and their transform skewed every measureInWindow taken while they ran (QA
 * replay touches landed off the board). Opacity only: positions are final from the first frame.
 */
function ScreenFade({ id, children }: { id: string; children: React.ReactNode }) {
  const o = useSharedValue(1);
  const [first] = useState(() => ({ id }));
  useLayoutEffect(() => {
    if (first.id === id) return; // the launch screen just appears
    first.id = "";
    o.value = 0.35;
    o.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [id, o, first]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.root, st]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#120C33" },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
});
