import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Background, CurrencyPill, GameButton, Tappable, fonts, palette, radius, shadow } from "../ui";
import { store } from "../modules/store";
import { LEVELS } from "../game/lights";
import { useBottomInset } from "../modules/layout";

/**
 * HOME = the game's title screen — the first thing a player (and a store screenshot) sees. It sells
 * the game: hero art, the logo, where you are (chapter + progress) and ONE big obvious "Play" that
 * continues the next level. The level list lives on its own screen (Levels), never here.
 * The builder replaces the hero with this game's key art (from src/art.ts / the art-direction target)
 * and keeps the structure: currencies → logo → hero → chapter progress → Play → Levels/Shop/Settings.
 */
export function HomeScreen({
  onPlay,
  onLevels,
  onShop,
  onSettings,
}: {
  onPlay: (levelNumber: number) => void;
  onLevels: () => void;
  onShop: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  const current = Math.min(LEVELS.length, Math.max(1, s.level));
  const chapter = LEVELS[current - 1]?.chapter ?? "";
  const inChapter = LEVELS.filter((l) => l.chapter === chapter);
  const doneInChapter = inChapter.filter((l) => l.number < current).length;
  const totalStars = Object.values(s.stars ?? {}).reduce((a, b) => a + b, 0);

  // Idle life: the logo floats, the Play button breathes — a title screen never sits still.
  const float = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    breathe.value = withDelay(900, withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1));
  }, [float, breathe]);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + float.value * 12 }, { rotate: `${-1.5 + float.value * 3}deg` }] }));
  const playStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.035 }] }));

  return (
    <View style={styles.root}>
      <Background />
      {/* Warm light behind the hero so it reads as the stage. */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(255,210,74,0)", "rgba(255,210,74,0.16)", "rgba(255,210,74,0)"]}
        style={[StyleSheet.absoluteFill, { top: "22%", bottom: "30%" }]}
      />

      <View style={[styles.hud, { paddingTop: insets.top + 8 }]}>
        <CurrencyPill icon="⭐" value={totalStars} color={palette.star} />
        <CurrencyPill icon="🪙" value={s.coins} />
      </View>

      {/* `entering` and an animated transform never share one view (Reanimated lets the layout animation own the
          transform — Strike Lanes' home rendered blank in the web preview, 2026-10-27): entrance outside, idle float inside. */}
      <Animated.View entering={FadeInDown.duration(500).springify()}>
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Text style={styles.logoShadow} numberOfLines={1} adjustsFontSizeToFit>
            __GAME_NAME__
          </Text>
          <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit>
            __GAME_NAME__
          </Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.heroArea} pointerEvents="none">
        <Hero />
      </View>

      <View style={[styles.bottom, { paddingBottom: bottomInset + 14 }]}>
        <Animated.View entering={FadeInUp.delay(150).duration(450)} style={styles.chapterCard}>
          <Text style={styles.chapterLabel}>{chapter}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(6, (doneInChapter / Math.max(1, inChapter.length)) * 100)}%` }]} />
          </View>
          <Text style={styles.chapterCount}>
            {doneInChapter}/{inChapter.length} levels
          </Text>
        </Animated.View>

        <Animated.View entering={ZoomIn.delay(250).springify()} style={styles.playWrap}>
          <Animated.View style={playStyle}>
            <GameButton label={`Play  ·  Level ${current}`} variant="accent" size="lg" sound="whoosh" onPress={() => onPlay(current)} />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(350).duration(450)} style={styles.iconRow}>
          <RoundButton icon="🗺️" label="Levels" onPress={onLevels} />
          <RoundButton icon="🛍️" label="Shop" onPress={onShop} />
          <RoundButton icon="⚙️" label="Settings" onPress={onSettings} />
        </Animated.View>
      </View>
    </View>
  );
}

/** Round icon button with a label — secondary actions on the home screen (Tappable: squash + dim on touch-down). */
function RoundButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Tappable onPress={onPress} hitSlop={8} scaleTo={0.86} style={styles.round} accessibilityLabel={label}>
      <View style={styles.roundFace}>
        <Text style={styles.roundIcon}>{icon}</Text>
      </View>
      <Text style={styles.roundLabel} numberOfLines={1}>{label}</Text>
    </Tappable>
  );
}

/**
 * SHOWCASE hero: a living piece of the game (tiles lighting up in a wave). A real game uses its
 * key art here — the art-direction home target / its hero sprite from src/art.ts — with idle motion.
 */
function Hero() {
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.62, 280);
  const cell = Math.floor(size / 3);
  return (
    <View style={[styles.hero, { width: cell * 3 + 24, height: cell * 3 + 24 }, shadow]}>
      {[0, 1, 2].map((r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {[0, 1, 2].map((c) => (
            <HeroTile key={c} size={cell} delay={(r + c) * 220} />
          ))}
        </View>
      ))}
    </View>
  );
}

function HeroTile({ size, delay }: { size: number; delay: number }) {
  const lit = useSharedValue(0);
  useEffect(() => {
    lit.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 420 }), withDelay(900, withTiming(0, { duration: 420 })), withDelay(700, withTiming(0, { duration: 1 }))), -1),
    );
  }, [lit, delay]);
  const st = useAnimatedStyle(() => ({
    backgroundColor: lit.value > 0.5 ? palette.accent : palette.surfaceDark,
    transform: [{ scale: 0.9 + lit.value * 0.08 }],
    shadowOpacity: lit.value * 0.8,
  }));
  return (
    <View style={{ width: size, height: size, padding: 5 }}>
      <Animated.View style={[styles.heroTile, { shadowColor: palette.accent, shadowRadius: 14 }, st]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hud: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  logoWrap: { marginTop: 18, alignItems: "center", paddingHorizontal: 24 },
  logo: { fontFamily: fonts.display, fontSize: 52, color: "#FFFFFF", textAlign: "center" },
  logoShadow: {
    position: "absolute",
    top: 5,
    left: 24,
    right: 24,
    fontFamily: fonts.display,
    fontSize: 52,
    color: palette.primaryDark,
    textAlign: "center",
  },
  heroArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { padding: 12, borderRadius: radius.xl, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 2, borderColor: "rgba(255,255,255,0.14)" },
  heroTile: { flex: 1, borderRadius: radius.md },
  bottom: { paddingHorizontal: 22, gap: 14 },
  chapterCard: { alignSelf: "center", alignItems: "center", gap: 6, minWidth: "70%" },
  chapterLabel: { fontFamily: fonts.displayMedium, fontSize: 18, color: "#FFFFFF" },
  progressTrack: { width: "100%", height: 10, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: palette.secondary },
  chapterCount: { fontFamily: fonts.bodyRegular, fontSize: 13, color: "rgba(255,255,255,0.75)" },
  playWrap: { alignSelf: "stretch" },
  iconRow: { flexDirection: "row", justifyContent: "center", gap: 28 },
  round: { alignItems: "center", gap: 4 },
  roundFace: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)",
  },
  roundIcon: { fontSize: 26 },
  roundLabel: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.85)" },
});
