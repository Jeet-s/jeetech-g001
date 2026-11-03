import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image, Animated, Easing, useWindowDimensions, type LayoutChangeEvent, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEVELS, CHAPTERS, TOTAL_LEVELS } from "../game/levels";
import { chapterTheme, type Colors } from "../game/theme";
import { art, paintingArt, pieceCols, PAINTING_ASPECT } from "../art";
import { dailyAvailable, dailyClaimed, dailyLevelId, DAILY_BONUS, DAILY_MIN_LEVELS } from "../game/daily";
import { HudNumber, HudPanel, IconButton } from "../ui/Hud";
import { store } from "../modules/store";
import { useBannerHeight, useBottomInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { claimableCount } from "../game/rewards";
import { InboxScreen } from "./InboxScreen";

/**
 * HOME = Path Painter's title screen — the first thing a player (and a store
 * visitor) sees. Currencies → illustrated logo → a living hero (the brush
 * mascot rolling a fresh paint trail across ceramic tiles) → chapter progress →
 * ONE big "Play · Level N" that continues the next level → Levels / Shop /
 * Settings as secondary icon buttons. The level map lives on its own screen.
 *
 * Touch targets (QA tour_2): the Play button has a generous hitSlop, every
 * bottom button's whole icon + label column is tappable, and the hero board
 * itself opens the next level. Logo and hero are sized from the measured free
 * space so they never overlap on a 360x640 dp phone (QA layout_small).
 */
export function HomeScreen({
  colors,
  onPlay,
  onDaily,
  onLevels,
  onShop,
  onSettings,
}: {
  colors: Colors;
  onPlay: (id: number) => void;
  /** Opens today's Daily Paint level. */
  onDaily: (id: number) => void;
  onLevels: () => void;
  onShop: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bannerH = useBannerHeight();
  const bottomInset = useBottomInset();
  const { width } = useWindowDimensions();
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);

  const current = Math.min(TOTAL_LEVELS, Math.max(1, s.level));
  const chapterNo = LEVELS.find((l) => l.id === current)?.chapter ?? 1;
  const inChapter = LEVELS.filter((l) => l.chapter === chapterNo);
  const doneInChapter = inChapter.filter((l) => (s.stars[l.id] ?? 0) > 0).length;
  const progress = doneInChapter / Math.max(1, inChapter.length);
  const totalStars = store.totalStars();

  // Idle life: the logo floats and tilts, the Play button breathes.
  const float = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const f = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    f.start();
    b.start();
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
    return () => {
      f.stop();
      b.stop();
    };
  }, [float, breathe, enter]);

  // Measured space: root height minus the HUD row and the bottom block is
  // shared by the logo (≈36%, capped) and the hero (the rest).
  const { height: winH } = useWindowDimensions();
  const compact = winH < 720;
  const [box, setBox] = useState({ root: 0, hud: 0, bottom: 0 });
  const avail = box.root > 0 ? box.root - box.hud - box.bottom : 0;
  const baseLogoW = Math.min(width * 0.82, 360);
  const baseLogoH = Math.floor((baseLogoW * 445) / 900);
  const logoH = avail > 0 ? Math.max(56, Math.min(baseLogoH, Math.floor(avail * 0.36))) : Math.min(baseLogoH, compact ? 110 : baseLogoH);
  const logoW = Math.floor((logoH * 900) / 445);
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxCount = claimableCount(s);
  // Home-level note (Daily locked etc.): drawn above everything, lasts ~3.5 s.
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3600);
    return () => clearTimeout(t);
  }, [note]);
  const bottomPad = Math.max(bannerH, bottomInset) + (compact ? 10 : 16);
  const btn = compact || width < 380 ? 48 : 54;
  const rise = (from: number) => ({
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });

  // The hero sizes itself to the space actually left between logo and controls.
  const [heroBox, setHeroBox] = useState({ w: 0, h: 0 });
  const onHeroLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setHeroBox({ w: Math.floor(w), h: Math.floor(h) });
  };

  return (
    <View style={styles.root} onLayout={(e) => setBox((b) => ({ ...b, root: Math.floor(e.nativeEvent.layout.height) }))}>
      <View style={[styles.hud, { paddingTop: insets.top + (compact ? 6 : 10) }]} onLayout={(e) => setBox((b) => ({ ...b, hud: Math.ceil(e.nativeEvent.layout.height) }))}>
        <HudPanel colors={colors} style={styles.currency}>
          <Image source={art.star_gold} style={styles.currencyIcon} resizeMode="contain" />
          <HudNumber value={`${totalStars}`} size={18} />
        </HudPanel>
        <HudPanel colors={colors} style={styles.currency}>
          <Txt size={17}>🪙</Txt>
          <HudNumber value={`${s.coins}`} size={18} />
        </HudPanel>
      </View>

      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: enter,
            transform: [
              { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) },
              { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ["-1.5deg", "1.5deg"] }) },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            ],
          },
        ]}
      >
        <Image source={art.logo} style={{ width: logoW, height: logoH }} resizeMode="contain" accessibilityLabel="Path Painter" />
      </Animated.View>

      <View style={styles.heroArea} onLayout={onHeroLayout}>
        {heroBox.h >= 96 && (
          <PressableScale onPress={() => onPlay(current)} scaleTo={0.96} rippleColor={colors.paintEdge} style={{ borderRadius: 26 }} accessibilityLabel={`Play level ${current}`}>
            <Hero box={heroBox} colors={colors} chapter={chapterNo} />
          </PressableScale>
        )}
      </View>

      <View
        style={[styles.bottom, compact && styles.bottomCompact, { paddingBottom: bottomPad }]}
        onLayout={(e) => setBox((b) => ({ ...b, bottom: Math.ceil(e.nativeEvent.layout.height) }))}
      >
        <Animated.View style={rise(30)}>
          <HudPanel colors={colors} style={[styles.chapterCard, compact && styles.chapterCardCompact]}>
            {/* the chapter's painting so far: painted pieces in colour, the rest blank canvas */}
            <PaintingThumb chapter={chapterNo} levels={inChapter.map((l) => l.id)} stars={s.stars} next={current} small={compact} />
            <View style={styles.chapterInfo}>
              <Txt weight="display" size={12} color="#FFFFFFB8" style={styles.chapterKicker} numberOfLines={1}>
                Ch. {chapterNo}/{CHAPTERS.length} · {chapterTheme(chapterNo).world}
              </Txt>
              <Txt weight="display" size={19} color="#FFFFFF" style={styles.outlined} numberOfLines={1} adjustsFontSizeToFit>{CHAPTERS[chapterNo - 1]}</Txt>
              <View style={[styles.track, { backgroundColor: colors.slotDeep }]}>
                <View style={[styles.fill, { backgroundColor: colors.paint, width: `${Math.max(6, progress * 100)}%` }]} />
              </View>
              <Txt weight="display" size={13} color="#FFFFFF" style={styles.outlinedSmall} numberOfLines={2}>
                {doneInChapter}/{inChapter.length} pieces painted · next: Level {current}
              </Txt>
            </View>
          </HudPanel>
        </Animated.View>

        <Animated.View style={[styles.playRow, rise(40)]}>
          <Animated.View style={[styles.playWrap, { transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
            <PressableScale
              onPress={() => onPlay(current)}
              rippleColor="#FFFFFF"
              hitSlop={{ top: 10, bottom: 14, left: 12, right: 12 }}
              accessibilityLabel={`Play level ${current}`}
              style={[styles.playLip, { backgroundColor: colors.paintDeep }]}
            >
              <View style={[styles.play, compact && styles.playCompact, { backgroundColor: colors.paint, borderColor: colors.paintEdge }]}>
                <View pointerEvents="none" style={styles.playGloss} />
                <Txt weight="display" size={26} color="#FFFFFF" style={styles.outlined} numberOfLines={1} adjustsFontSizeToFit>Play · Level {current}</Txt>
              </View>
            </PressableScale>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.iconRow, rise(50)]}>
          <DailyButton colors={colors} onDaily={onDaily} onNote={setNote} size={btn} />
          <HomeButton icon={art.icon_map} label="Gallery" onPress={onLevels} colors={colors} size={btn} />
          <HomeButton
            icon={art.icon_gift}
            label="Inbox"
            badge={inboxCount > 0 ? `${inboxCount}` : undefined}
            tone={inboxCount > 0 ? "gold" : "frame"}
            onPress={() => setInboxOpen(true)}
            colors={colors}
            size={btn}
          />
          <HomeButton icon={art.icon_shop} label="Shop" onPress={onShop} colors={colors} size={btn} />
          <HomeButton icon={art.icon_gear} label="Settings" onPress={onSettings} colors={colors} size={btn} />
        </Animated.View>
      </View>

      {note && (
        <View pointerEvents="none" style={[styles.note, { bottom: bottomPad + btn + 40 }]}>
          <Txt weight="body" size={15} color="#1C2033" style={{ textAlign: "center" }}>{note}</Txt>
        </View>
      )}
      <InboxScreen visible={inboxOpen} colors={colors} onClose={() => setInboxOpen(false)} />
    </View>
  );
}

/** A bottom-row button whose WHOLE column (icon + label + the gap around it)
 *  is tappable: taps on the icon go to IconButton's own press, taps on the
 *  label or just below land on this wrapper (which squashes the column). */
function HomeButton({
  icon,
  label,
  onPress,
  colors,
  size,
  badge,
  tone,
}: {
  icon: ImageSourcePropType;
  label: string;
  onPress: () => void;
  colors: Colors;
  size: number;
  badge?: string;
  tone?: "frame" | "paint" | "gold";
}) {
  return (
    // The flex:1 wrapper stretches the Pressable across the whole column width.
    <View style={styles.homeBtnCell}>
      <PressableScale onPress={onPress} scaleTo={0.94} ripple={false} hitSlop={{ top: 4, bottom: 12, left: 0, right: 0 }} style={styles.homeBtn} accessibilityLabel={label}>
        <IconButton icon={icon} label={label} onPress={onPress} colors={colors} size={size} badge={badge} tone={tone} />
      </PressableScale>
    </View>
  );
}

/** Daily Paint entry: one painted level returns each day for a bonus. Shows
 *  its state on the button (bonus to claim / claimed today / opens after N). */
function DailyButton({ colors, onDaily, onNote, size }: { colors: Colors; onDaily: (id: number) => void; onNote: (msg: string) => void; size: number }) {
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  const open = dailyAvailable(s);
  const claimed = dailyClaimed(s);
  const painted = LEVELS.filter((l) => (s.stars[l.id] ?? 0) > 0).length;
  const badge = !open ? undefined : claimed ? "✓" : `+${DAILY_BONUS}`;
  return (
    <HomeButton
      icon={art.icon_daily}
      label="Daily"
      badge={badge}
      tone={open && !claimed ? "gold" : "frame"}
      onPress={() => {
        if (open) onDaily(dailyLevelId(s));
        else onNote(`Daily Paint opens after ${DAILY_MIN_LEVELS} levels — ${painted}/${DAILY_MIN_LEVELS} painted so far. Tap Play to keep going!`);
      }}
      colors={colors}
      size={size}
    />
  );
}

/** Small version of the chapter's reveal painting for the Home chapter card. */
function PaintingThumb({ chapter, levels, stars, next, small }: { chapter: number; levels: number[]; stars: Record<number, number>; next: number; small?: boolean }) {
  const COLS = pieceCols(levels.length);
  const rows = Math.ceil(levels.length / COLS);
  const w = small ? 76 : 96;
  const h = Math.floor(w * PAINTING_ASPECT);
  const cw = Math.floor(w / COLS);
  const ch = Math.floor(h / rows);
  return (
    <View style={{ width: cw * COLS, height: ch * rows, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#F4EEE2" }}>
      <Image source={paintingArt(chapter)} style={{ position: "absolute", width: cw * COLS, height: ch * rows }} resizeMode="cover" />
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {levels.slice(r * COLS, r * COLS + COLS).map((id) => (
            <View
              key={id}
              style={{
                width: cw,
                height: ch,
                backgroundColor: (stars[id] ?? 0) > 0 ? "transparent" : id === next ? "#FBF6EC" : "#E3DCCD",
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.7)",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/* ---------------------------------- Hero ----------------------------------- */

const GRID = 4;
/** A snake path over the 4x4 showcase board — the mascot rolls it, painting as it goes. */
const PATH: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [3, 1], [2, 1], [1, 1], [0, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
  [3, 3], [2, 3], [1, 3], [0, 3],
];
const STEP_MS = 340;

/** The key art in motion: the brush mascot rolls the board and every tile it
 *  paints reveals a piece of the chapter's picture — then the canvas washes
 *  clean and it paints the picture again (the game's whole promise in a loop). */
function Hero({ box, colors, chapter }: { box: { w: number; h: number }; colors: Colors; chapter: number }) {
  const pad = 12;
  // The mascot pokes ~1.2 cells above the top row: reserve that headroom so it
  // never reaches the logo, and fit board + headroom in the measured box.
  const cell = Math.max(16, Math.floor(Math.min((box.w * 0.78) / GRID, (box.h - pad - 10) / (GRID + 1.2), 330 / GRID)));
  const headroom = Math.max(0, Math.ceil(cell * 1.2 - pad));
  const boardPx = cell * GRID;

  const t = useRef(new Animated.Value(0)).current;
  const wash = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const roll = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(t, { toValue: PATH.length - 1, duration: STEP_MS * (PATH.length - 1), easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(1100),
        Animated.timing(wash, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(wash, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    roll.start();
    b.start();
    return () => {
      roll.stop();
      b.stop();
    };
  }, [t, wash, bob]);

  const idx = PATH.map((_, i) => i);
  // The 4:3 painting is cropped to the square board (centred).
  const artW = Math.round(boardPx / PAINTING_ASPECT);
  const artOff = Math.round((artW - boardPx) / 2);
  const mascotH = Math.floor(cell * 1.7);
  const mascotW = Math.floor((mascotH * 334) / 512);
  const mx = t.interpolate({ inputRange: idx, outputRange: PATH.map(([c]) => c * cell + (cell - mascotW) / 2) });
  const my = t.interpolate({ inputRange: idx, outputRange: PATH.map(([, r]) => r * cell + cell * 0.5 - mascotH) });

  return (
    <View style={[styles.heroBoard, { marginTop: headroom, padding: pad, backgroundColor: colors.frame, borderColor: colors.frameEdge }]}>
      <View pointerEvents="none" style={styles.heroGloss} />
      <View style={{ width: boardPx, height: boardPx }}>
        {Array.from({ length: GRID }, (_, r) => (
          <View key={r} style={styles.heroRow}>
            {Array.from({ length: GRID }, (_, c) => (
              <View key={c} style={{ width: cell, height: cell, padding: 3 }}>
                {/* recessed blank slot */}
                <View style={{ flex: 1, borderRadius: Math.floor(cell * 0.2), backgroundColor: colors.slotDeep, paddingTop: cell * 0.1 }}>
                  <View style={{ flex: 1, borderRadius: Math.floor(cell * 0.18), backgroundColor: colors.slot }} />
                </View>
              </View>
            ))}
          </View>
        ))}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: wash }]}>
          {PATH.map(([c, r], i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                left: c * cell + 3,
                top: r * cell + 3,
                width: cell - 6,
                height: cell - 6,
                borderRadius: Math.floor(cell * 0.2),
                overflow: "hidden",
                borderWidth: 2,
                borderColor: colors.paintEdge,
                backgroundColor: colors.paint,
                opacity: t.interpolate({ inputRange: [i - 0.6, i], outputRange: [0, 1], extrapolate: "clamp" }),
                transform: [{ scale: t.interpolate({ inputRange: [i - 0.6, i, i + 0.5], outputRange: [0.4, 1.1, 1], extrapolate: "clamp" }) }],
              }}
            >
              {/* this tile's piece of the chapter painting */}
              <Image
                source={paintingArt(chapter)}
                resizeMode="stretch"
                style={{ position: "absolute", left: -c * cell - artOff + 1, top: -r * cell + 1, width: artW, height: boardPx }}
              />
            </Animated.View>
          ))}
        </Animated.View>
        <Animated.Image
          source={art.character_brush_mascot}
          resizeMode="contain"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: mascotW,
            height: mascotH,
            transform: [
              { translateX: mx },
              { translateY: Animated.add(my, bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] })) },
              { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "6deg"] }) },
            ],
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hud: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  currency: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, minHeight: 40 },
  currencyIcon: { width: 22, height: 22 },
  outlined: { textShadowColor: "rgba(10,12,35,0.7)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  outlinedSmall: { textShadowColor: "rgba(10,12,35,0.65)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  chapterInfo: { flex: 1, gap: 3 },
  playLip: { borderRadius: 26, paddingBottom: 6 },
  playGloss: { position: "absolute", left: 14, right: 14, top: 5, height: "40%", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.25)" },
  note: { position: "absolute", left: 24, right: 24, padding: 12, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#FFB627", zIndex: 50, elevation: 50, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  homeBtnCell: { flex: 1 },
  homeBtn: { alignItems: "center", paddingTop: 2, paddingBottom: 4, borderRadius: 16 },
  logoWrap: { alignItems: "center", marginTop: 4 },
  heroArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroBoard: { borderRadius: 26, borderWidth: 2, borderTopWidth: 3, overflow: "visible" },
  heroGloss: { position: "absolute", left: 0, right: 0, top: 0, height: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "rgba(255,255,255,0.08)" },
  heroRow: { flexDirection: "row" },
  fillImg: { width: "100%", height: "100%" },
  bottom: { paddingHorizontal: 20, gap: 14 },
  bottomCompact: { gap: 9 },
  chapterCardCompact: { paddingVertical: 6 },
  chapterCard: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 12, width: "100%", maxWidth: 420, paddingVertical: 10, paddingHorizontal: 12 },
  chapterKicker: { textTransform: "uppercase", letterSpacing: 1.5 },
  track: { width: "100%", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 2 },
  fill: { height: "100%", borderRadius: 5 },
  playRow: { alignItems: "center" },
  playWrap: { width: "100%", maxWidth: 420 },
  playCompact: { minHeight: 56 },
  play: { minHeight: 66, borderRadius: 26, borderWidth: 3, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 16 },
  iconRow: { flexDirection: "row", justifyContent: "space-between", alignSelf: "center", width: "100%", maxWidth: 440 },
  round: { alignItems: "center", gap: 4 },
  roundFace: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
