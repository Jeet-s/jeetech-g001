import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  Easing,
  BackHandler,
  type ImageSourcePropType,
} from "react-native";
import { PathEngine, type Direction } from "../game/PathEngine";
import { LEVELS, CHAPTERS, levelById, TOTAL_LEVELS } from "../game/levels";
import { makeColors, type Colors } from "../game/theme";
import { art } from "../art";
import { analytics } from "../modules/analytics";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { feedback } from "../modules/feedback";
import { useBannerHeight, useBottomInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { Board, travelMs, type Stroke, type Bump, type Rewind } from "../ui/Board";
import { Confetti } from "../ui/Confetti";
import { SettingsModal } from "./SettingsModal";
import { HomeScreen } from "./HomeScreen";

const HINT_COST = 40;
/** Distance (dp) at which a drag commits to a direction — mid-gesture, so the
 *  brush is already rolling while the finger is still moving. */
const SWIPE_THRESHOLD = 14;

type ViewMode = "home" | "map" | "play";

/** Full-screen background art per chapter (4 backgrounds cycle across 6 chapters). */
const BACKGROUNDS = [art.bg_paper_canvas, art.bg_wood_desk, art.bg_canvas_studio, art.bg_pastel_gradient];
const bgForChapter = (chapter: number) => BACKGROUNDS[(chapter - 1) % BACKGROUNDS.length];

/** Optional directive used only by the store-screenshot renderer to open the
 *  app directly in a specific, attractive state. Normal play never passes this. */
export interface ScreenshotConfig {
  view: ViewMode;
  levelId?: number;
  moves?: Direction[];
  showWin?: boolean;
}

export function GameScreen({
  onOpenShop,
  screenshot,
}: {
  onOpenShop?: () => void;
  screenshot?: ScreenshotConfig;
}) {
  const [snap, setSnap] = useState(store.get());
  useEffect(() => store.subscribe(setSnap), []);
  const colors = useMemo(
    () => makeColors(snap.settings.palette, snap.settings.highContrast),
    [snap.settings.palette, snap.settings.highContrast]
  );

  const [view, setView] = useState<ViewMode>(screenshot?.view ?? "home");
  const [levelId, setLevelId] = useState(screenshot?.levelId ?? 1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The level whose stars were just earned — the map sparkles that tile on return.
  const [awardedId, setAwardedId] = useState<number | null>(null);

  // Android back walks up the screen stack: level → map → home → (system).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (settingsOpen || view === "home") return false;
      setView(view === "play" ? "map" : "home");
      return true;
    });
    return () => sub.remove();
  }, [view, settingsOpen]);

  function openLevel(id: number) {
    setLevelId(id);
    setView("play");
  }

  const level = levelById(levelId);
  const background = view === "play" ? bgForChapter(level?.chapter ?? 1) : art.bg_paper_canvas;

  return (
    <View style={styles.root}>
      <ParallaxBg source={background} />
      <View style={[styles.tint, { backgroundColor: colors.bg + "40" }]} />
      <FadeSwap swapKey={view === "play" ? `play-${levelId}` : view} grow={view === "play"}>
        {view === "home" ? (
          <HomeScreen
            colors={colors}
            onPlay={openLevel}
            onLevels={() => setView("map")}
            onShop={() => onOpenShop?.()}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : view === "map" ? (
          <MapView colors={colors} awardedId={awardedId} onPlay={openLevel} onHome={() => setView("home")} onSettings={() => setSettingsOpen(true)} onOpenShop={onOpenShop} />
        ) : (
          <PlayView
            key={levelId}
            levelId={levelId}
            colors={colors}
            onExit={() => setView("map")}
            onSettings={() => setSettingsOpen(true)}
            onGoToLevel={openLevel}
            onAward={setAwardedId}
            demo={screenshot}
          />
        )}
      </FadeSwap>
      <SettingsModal visible={settingsOpen} colors={colors} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

/** Full-screen background that drifts and breathes slowly so no screen — the
 *  level map especially — ever feels frozen (gentle idle parallax). */
function ParallaxBg({ source }: { source: ImageSourcePropType }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  return (
    <Animated.Image
      source={source}
      resizeMode="cover"
      style={[
        StyleSheet.absoluteFill,
        {
          width: undefined,
          height: undefined,
          transform: [
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1.12] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) },
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [6, -6] }) },
          ],
        },
      ]}
    />
  );
}

/** Snappy fade (+ gentle grow into a level) whenever the active screen changes.
 *  Kept short (~150ms into a level) so the board's staggered tile pop-in is what
 *  the player reads on entry, never a lingering white wash. */
function FadeSwap({ swapKey, grow, children }: { swapKey: string; grow?: boolean; children: ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: grow ? 150 : 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [swapKey, grow, a]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: a,
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [grow ? 0.97 : 1.01, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/* ------------------------------- Map / levels ------------------------------ */

function MapView({
  colors,
  awardedId,
  onPlay,
  onHome,
  onSettings,
  onOpenShop,
}: {
  colors: Colors;
  awardedId: number | null;
  onPlay: (id: number) => void;
  onHome: () => void;
  onSettings: () => void;
  onOpenShop?: () => void;
}) {
  const state = store.get();
  const bannerH = useBannerHeight();
  const bottomInset = useBottomInset();
  return (
    <View style={styles.flex}>
      <View style={styles.mapHeader}>
        <Image source={art.ui_logo_emblem} style={styles.logo} resizeMode="contain" />
        <Txt weight="display" size={34} color={colors.text}>Levels</Txt>
        <View style={[styles.statusPill, { backgroundColor: colors.surface }]}>
          <Txt weight="body" size={14} color={colors.accent}>★ {store.totalStars()}</Txt>
          <Txt weight="body" size={14} color={colors.subtext}>  /  {TOTAL_LEVELS * 3}</Txt>
          <Txt weight="body" size={14} color={colors.text}>    🪙 {state.coins}</Txt>
        </View>
        <View style={styles.mapButtons}>
          <HeaderPill label="‹ Home" colors={colors} onPress={onHome} />
          <HeaderPill label="Shop" colors={colors} onPress={() => onOpenShop?.()} />
          <HeaderPill label="Settings" colors={colors} onPress={onSettings} />
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.mapScroll, { paddingBottom: 48 + Math.max(bannerH, bottomInset) }]} showsVerticalScrollIndicator={false}>
        {CHAPTERS.map((chapter, ci) => {
          const chapterLevels = LEVELS.filter((l) => l.chapter === ci + 1);
          if (chapterLevels.length === 0) return null;
          return (
            <View key={chapter} style={styles.chapterBlock}>
              <Txt weight="heading" size={14} color={colors.subtext} style={styles.chapterTitle}>
                Chapter {ci + 1} · {chapter}
              </Txt>
              <View style={styles.levelGrid}>
                {chapterLevels.map((lvl) => {
                  const unlocked = state.level >= lvl.id;
                  const stars = state.stars[lvl.id] ?? 0;
                  return <LevelNode key={lvl.id} id={lvl.id} unlocked={unlocked} stars={stars} awarded={lvl.id === awardedId} colors={colors} onPress={() => onPlay(lvl.id)} />;
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function HeaderPill({ label, colors, onPress }: { label: string; colors: Colors; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} rippleColor={colors.paint} style={[styles.pill, { backgroundColor: colors.surface }]}>
      <Txt weight="body" size={15} color={colors.text}>{label}</Txt>
    </PressableScale>
  );
}

function LevelNode({
  id,
  unlocked,
  stars,
  awarded,
  colors,
  onPress,
}: {
  id: number;
  unlocked: boolean;
  stars: number;
  awarded?: boolean;
  colors: Colors;
  onPress: () => void;
}) {
  // Locked tiles breathe gently (2.6s) so the map never feels frozen.
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (unlocked) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [unlocked, breathe]);
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  // Just-cleared tile: a one-shot celebratory bounce + sparkle burst on return
  // to the map, so earning stars reads as a reward instead of a hard cut.
  const award = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!awarded) return;
    award.setValue(0);
    Animated.sequence([
      Animated.delay(180),
      Animated.spring(award, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [awarded, award]);
  const awardScale = award.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.18, 1] });

  if (!unlocked) {
    return (
      <Animated.View style={[styles.levelNode, { transform: [{ scale: breatheScale }], opacity: breatheOpacity }]}>
        <Image source={art.sprite_board_tile} style={[styles.nodeTile, { opacity: 0.6 }]} resizeMode="stretch" />
        <Txt weight="display" size={22} color={colors.subtext}>🔒</Txt>
      </Animated.View>
    );
  }
  return (
    // hitSlop widens the touch target past the visual tile so edge/near taps
    // reliably enter the level (QA: ftue_hitbox).
    <Animated.View style={{ transform: [{ scale: awardScale }] }}>
      <PressableScale onPress={onPress} rippleColor={colors.paint} hitSlop={10} style={styles.levelNode}>
        <Image source={art.sprite_board_tile} style={styles.nodeTile} resizeMode="stretch" />
        <Txt weight="display" size={24} color={colors.text}>{id}</Txt>
        <View style={styles.nodeStars}>
          {[0, 1, 2].map((i) => (
            <Txt key={i} weight="black" size={12} color={i < stars ? colors.accent : colors.subtext + "66"}>★</Txt>
          ))}
        </View>
        {awarded && <NodeSparkle award={award} colors={colors} />}
      </PressableScale>
    </Animated.View>
  );
}

/** A short sparkle burst over a level tile the moment its stars are awarded. */
function NodeSparkle({ award, colors }: { award: Animated.Value; colors: Colors }) {
  const sparks = useRef(
    Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return { dx: Math.cos(angle) * 34, dy: Math.sin(angle) * 34, size: 9 + (i % 3) * 3 };
    })
  ).current;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {sparks.map((s, i) => (
        <Animated.Text
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            marginLeft: -s.size / 2,
            marginTop: -s.size / 2,
            fontSize: s.size,
            color: colors.accent,
            opacity: award.interpolate({ inputRange: [0, 0.2, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: award.interpolate({ inputRange: [0, 1], outputRange: [0, s.dx] }) },
              { translateY: award.interpolate({ inputRange: [0, 1], outputRange: [0, s.dy] }) },
              { scale: award.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.6] }) },
            ],
          }}
        >
          ✦
        </Animated.Text>
      ))}
    </View>
  );
}

/* --------------------------------- Play ----------------------------------- */

type Overlay = { kind: "none" } | { kind: "won"; stars: number; coins: number } | { kind: "lost" };

function PlayView({
  levelId,
  colors,
  onExit,
  onSettings,
  onGoToLevel,
  onAward,
  demo,
}: {
  levelId: number;
  colors: Colors;
  onExit: () => void;
  onSettings: () => void;
  onGoToLevel: (id: number) => void;
  onAward: (id: number) => void;
  demo?: ScreenshotConfig;
}) {
  const level = levelById(levelId)!;
  const engineRef = useRef<PathEngine>(new PathEngine(level));
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const bannerH = useBannerHeight();
  const bottomInset = useBottomInset();

  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [timeLeft, setTimeLeft] = useState(level.timeLimitSeconds);
  const [hintDir, setHintDir] = useState<Direction | null>(null);
  const [coaching, setCoaching] = useState(levelId <= 2 && !store.get().tutorialDone && !demo);
  const [boardBox, setBoardBox] = useState({ w: 0, h: 0 });
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const [bump, setBump] = useState<Bump | null>(null);
  const [rewind, setRewind] = useState<Rewind | null>(null);
  const strokeSeq = useRef(0);
  // Finger-down on the board: the brush dips and a halo blooms within ~80ms.
  const press = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  const impactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (impactTimer.current) clearTimeout(impactTimer.current); }, []);

  // Juice: board pulse + win paint bloom + win "camera" nudge.
  const pulse = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const winZoom = useRef(new Animated.Value(0)).current;
  // Deferred reveal of the results card so the win celebration plays first.
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (winTimer.current) clearTimeout(winTimer.current); }, []);
  const boardScale = Animated.multiply(
    pulse.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.02, 1] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] })
  );
  // Board zoom on win: a gentle push-in that eases back (~0.9s).
  const cameraScale = winZoom.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1.04, 1] });
  function triggerPulse() {
    pulse.setValue(0);
    Animated.timing(pulse, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }
  function pressIn() {
    Animated.timing(press, { toValue: 1, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }
  function pressOut() {
    Animated.spring(press, { toValue: 0, friction: 5, tension: 180, useNativeDriver: true }).start();
  }

  // Dim the HUD / stats / actions while the first-move tutorial is up, then
  // brighten everything the instant the player makes their first stroke.
  const uiDim = useRef(new Animated.Value(coaching ? 0.4 : 1)).current;
  useEffect(() => {
    if (!coaching) Animated.timing(uiDim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [coaching, uiDim]);
  // The swipe coach fades + shrinks away within ~180ms of the first stroke
  // instead of popping off (or lingering), then unmounts.
  const [coachShown, setCoachShown] = useState(coaching);
  const coachFade = useRef(new Animated.Value(coaching ? 1 : 0)).current;
  useEffect(() => {
    if (coaching || !coachShown) return;
    Animated.timing(coachFade, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setCoachShown(false));
  }, [coaching, coachShown, coachFade]);

  useEffect(() => {
    if (!demo) analytics.track("level_start", { level: levelId });
  }, [levelId, demo]);

  // Screenshot mode: replay fixed swipes (and optionally the win card).
  useEffect(() => {
    if (!demo) return;
    const engine = engineRef.current;
    for (const dir of demo.moves ?? []) engine.move(dir);
    if (demo.showWin) {
      const stars = engine.status === "won" ? engine.starsForMoves() : 3;
      setOverlay({ kind: "won", stars, coins: 10 + stars * 10 });
    }
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer for timed levels.
  useEffect(() => {
    if (demo) return;
    if (level.timeLimitSeconds <= 0) return;
    if (overlay.kind !== "none") return;
    if (timeLeft <= 0) {
      engineRef.current.timeUp();
      analytics.track("level_fail", { level: levelId });
      feedback.fail();
      setOverlay({ kind: "lost" });
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, overlay.kind, level.timeLimitSeconds, levelId, demo]);

  function finishTutorial() {
    if (store.get().tutorialDone) return;
    store.set({ tutorialDone: true });
    analytics.track("tutorial_done");
  }

  function applyMove(dir: Direction) {
    const engine = engineRef.current;
    if (engine.status !== "playing" || overlay.kind !== "none") return;
    setHintDir(null);
    setRewind(null);
    if (coaching) {
      setCoaching(false);
      if (levelId <= 2) finishTutorial();
    }
    const movesBefore = engine.moves;
    const gatesBefore = engine.openGroups.size;
    const fromX = engine.cursorX;
    const fromY = engine.cursorY;
    const status = engine.move(dir);
    if (engine.moves === movesBefore) {
      // Swiped straight into a wall: no move is spent, but the brush knocks
      // against it with a soft tick so the touch never feels dead.
      setBump({ id: ++strokeSeq.current, dir });
      feedback.bump();
      return;
    }
    const steps = Math.abs(engine.cursorX - fromX) + Math.abs(engine.cursorY - fromY);
    setStroke({ id: ++strokeSeq.current, fromX, fromY, dir, steps });
    triggerPulse();
    if (engine.openGroups.size > gatesBefore) feedback.gate();
    else feedback.move();
    // A soft thud as the brush meets the wall.
    if (impactTimer.current) clearTimeout(impactTimer.current);
    impactTimer.current = setTimeout(() => feedback.bump(), travelMs(steps));
    rerender();
    if (status === "won") finishWin(travelMs(steps));
  }

  function finishWin(landMs: number) {
    const engine = engineRef.current;
    const stars = engine.starsForMoves();
    const coins = 10 + stars * 10;
    store.recordWin(levelId, stars, coins);
    onAward(levelId);
    analytics.track("level_complete", { level: levelId, stars, moves: engine.moves, coins });
    // Wait for the last tile's paint to land, then a soft paint-coloured bloom
    // swells out of the board (never a hard white frame) while the board zooms
    // gently; the results card eases in as the bloom fades.
    const land = landMs + 120;
    bloom.setValue(0);
    winZoom.setValue(0);
    Animated.sequence([
      Animated.delay(land),
      Animated.timing(bloom, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(land),
      Animated.timing(winZoom, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
    winTimer.current = setTimeout(() => {
      feedback.win();
      winTimer.current = setTimeout(() => setOverlay({ kind: "won", stars, coins }), 300);
    }, land);
  }

  // The interstitial fires when the player LEAVES the win card (still a level-end
  // natural break, same once-per-level frequency) so it never covers the
  // celebration — the flash, confetti and star pops play out uninterrupted.
  function leaveWin(go: () => void) {
    ads.showInterstitial();
    go();
  }

  /** Run an undo / reset and hand the paint it removed to the board, which
   *  shrinks it away farthest-first while the brush rolls back. */
  function withRewind(wipe: boolean, op: () => void) {
    const engine = engineRef.current;
    const before: { x: number; y: number }[] = [];
    for (let y = 0; y < engine.height; y++) for (let x = 0; x < engine.width; x++) if (engine.isPainted(x, y)) before.push({ x, y });
    op();
    const dist = (p: { x: number; y: number }) => Math.abs(p.x - engine.cursorX) + Math.abs(p.y - engine.cursorY);
    const removed = before.filter((p) => !engine.isPainted(p.x, p.y));
    const far = Math.max(0, ...removed.map(dist));
    setRewind(removed.length ? { id: ++strokeSeq.current, wipe, tiles: removed.map((p) => ({ ...p, rank: far - dist(p) })) } : null);
  }

  function restart() {
    withRewind(true, () => engineRef.current.reset());
    setStroke(null);
    bloom.setValue(0);
    setHintDir(null);
    setOverlay({ kind: "none" });
    setTimeLeft(level.timeLimitSeconds);
    analytics.track("level_start", { level: levelId });
    rerender();
  }

  function doUndo() {
    withRewind(false, () => engineRef.current.undo());
    setStroke(null);
    setHintDir(null);
    rerender();
  }
  function doReset() {
    withRewind(true, () => engineRef.current.reset());
    setStroke(null);
    setHintDir(null);
    rerender();
  }

  function revealHint() {
    setHintDir(bestHintDirection(engineRef.current));
    analytics.track("hint_used", { level: levelId });
  }
  function tryHint() {
    if (hintDir) return;
    const coins = store.get().coins;
    if (coins >= HINT_COST) {
      store.set({ coins: coins - HINT_COST });
      analytics.track("currency_spend", { type: "coins", amount: HINT_COST, sink: "hint" });
      revealHint();
    } else if (ads.rewardedAvailable()) {
      ads.showRewarded(() => revealHint());
    }
  }
  function grantExtraTime() {
    if (!ads.rewardedAvailable()) return;
    ads.showRewarded(() => {
      engineRef.current.status = "playing";
      setTimeLeft(30);
      setOverlay({ kind: "none" });
      rerender();
    });
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          committed.current = false;
          pressIn();
        },
        // Commit the swipe the moment it crosses the threshold — the brush rolls
        // while the finger is still travelling instead of waiting for release.
        onPanResponderMove: (_e, g) => {
          if (committed.current) return;
          if (Math.abs(g.dx) < SWIPE_THRESHOLD && Math.abs(g.dy) < SWIPE_THRESHOLD) return;
          committed.current = true;
          pressOut();
          applyMove(swipeDir(g.dx, g.dy));
        },
        onPanResponderRelease: (_e, g) => {
          pressOut();
          if (committed.current) return;
          // A very fast flick can end before any move event crosses the line.
          if (Math.abs(g.dx) < SWIPE_THRESHOLD * 0.6 && Math.abs(g.dy) < SWIPE_THRESHOLD * 0.6) return;
          committed.current = true;
          applyMove(swipeDir(g.dx, g.dy));
        },
        onPanResponderTerminate: () => pressOut(),
      }),
    [levelId, overlay.kind, coaching]
  );

  const engine = engineRef.current;
  const cell =
    boardBox.w > 0
      ? Math.max(14, Math.floor(Math.min((boardBox.w - 8) / engine.width, (boardBox.h - 8) / engine.height)))
      : 0;
  const canSpendHint = store.get().coins >= HINT_COST;
  const hintLabel = hintDir ? "Hint ✓" : canSpendHint ? `Hint ${HINT_COST}🪙` : "Hint";

  return (
    <View style={styles.flex}>
      {/* Gameplay layer — gets the win "camera" nudge. */}
      <Animated.View style={[styles.flex, { transform: [{ scale: cameraScale }] }]}>
      {/* HUD (dimmed during the first-move tutorial) */}
      <Animated.View style={[styles.hud, { opacity: uiDim }]}>
        <PressableScale onPress={onExit} style={[styles.pill, { backgroundColor: colors.surface }]}>
          <Txt weight="body" size={15} color={colors.text}>‹ Levels</Txt>
        </PressableScale>
        <Txt weight="heading" size={17} color={colors.text} numberOfLines={1} style={styles.levelName}>
          {levelId}. {level.name}
        </Txt>
        <PressableScale onPress={onSettings} style={[styles.pill, styles.pillSquare, { backgroundColor: colors.surface }]}>
          <Txt weight="body" size={17} color={colors.text}>⚙</Txt>
        </PressableScale>
      </Animated.View>

      <Animated.View style={[styles.statsRow, { backgroundColor: colors.surface + "D9", opacity: uiDim }]}>
        <Stat label="Fill" value={engine.fillPercent} suffix="%" colors={colors} tween />
        <Stat label="Moves" value={engine.moves} colors={colors} tween punch />
        {level.timeLimitSeconds > 0 ? (
          <Stat label="Time" value={timeLeft} suffix="s" colors={colors} warn={timeLeft <= 10} />
        ) : (
          <Stat label="Par" value={level.parMoves} colors={colors} />
        )}
      </Animated.View>

      {/* Board */}
      {/* The whole board area takes swipes, not just the tiles. */}
      <View {...pan.panHandlers} style={styles.boardWrap} onLayout={(e) => setBoardBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {cell > 0 && (
          <Animated.View style={{ transform: [{ scale: boardScale }] }}>
            <WinGlow t={bloom} colors={colors} />
            <Board engine={engine} cell={cell} colors={colors} hintDir={hintDir} stroke={stroke} bump={bump} press={press} rewind={rewind} />
            {coachShown && (
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { opacity: coachFade, transform: [{ scale: coachFade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}
              >
                <SwipeCoach cell={cell} colors={colors} engine={engine} />
              </Animated.View>
            )}
            <WinBloom t={bloom} colors={colors} />
          </Animated.View>
        )}
      </View>

      {level.hint && (
        <View style={[styles.hintBanner, { backgroundColor: colors.surface + "F2" }]}>
          <Txt weight="label" size={13} color={colors.text} style={{ textAlign: "center" }}>💡 {level.hint}</Txt>
        </View>
      )}

      {/* Action bar — padded by the banner height so the ad never covers it. */}
      <Animated.View style={[styles.actions, { paddingBottom: 18 + Math.max(bannerH, bottomInset), opacity: uiDim }]}>
        <ActionButton label="Undo" icon="↶" disabled={!engine.canUndo() || overlay.kind !== "none"} onPress={doUndo} colors={colors} />
        <ActionButton label="Reset" icon="⟳" onPress={doReset} colors={colors} />
        {/* Hint stays neutral until the player's first stroke (QA: tutorial focus). */}
        <ActionButton label={hintLabel} icon="💡" disabled={!!hintDir || overlay.kind !== "none"} onPress={tryHint} colors={colors} highlight={!coaching} />
      </Animated.View>

      {/* Soft full-screen wash under the bloom — peaks at 22%, never a white frame. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { backgroundColor: colors.paintEdge, opacity: bloom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.22, 0] }) }]}
      />
      </Animated.View>

      {/* Overlays */}
      {overlay.kind === "won" && (
        <WinOverlay
          colors={colors}
          stars={overlay.stars}
          coins={overlay.coins}
          hasNext={levelId < TOTAL_LEVELS}
          onNext={() => leaveWin(() => onGoToLevel(levelId + 1))}
          onReplay={() => leaveWin(restart)}
          onMap={() => leaveWin(onExit)}
        />
      )}
      {overlay.kind === "lost" && (
        <LoseOverlay colors={colors} canAddTime={ads.rewardedAvailable()} onAddTime={grantExtraTime} onRetry={restart} onMap={onExit} />
      )}
    </View>
  );
}

/* ------------------------------- Small bits -------------------------------- */

function swipeDir(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Board-complete glow: a paint-coloured halo swells behind the board and a
 *  bright rim pulses around its edge as the win bloom plays. */
function WinGlow({ t, colors }: { t: Animated.Value; colors: Colors }) {
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.winHalo,
          {
            backgroundColor: colors.paintEdge,
            opacity: t.interpolate({ inputRange: [0, 0.15, 0.6, 1], outputRange: [0, 0.75, 0.5, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1.05, 1.02] }) }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.winRim,
          {
            borderColor: colors.paintEdge,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.35, 0.6, 1], outputRange: [0, 1, 0.5, 0.9, 0] }),
          },
        ]}
      />
    </>
  );
}

/** The win bloom: concentric paint rings + a glow that swell out of the board
 *  centre and fade, with a sparkle ring — the "board complete" moment. */
function WinBloom({ t, colors }: { t: Animated.Value; colors: Colors }) {
  const sparks = useRef(
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return { dx: Math.cos(a) * 150, dy: Math.sin(a) * 150, size: 14 + (i % 3) * 5 };
    })
  ).current;
  // Paint splash: fat drops of the level's paint flung outward, arcing down.
  const drops = useRef(
    Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const dist = 90 + ((i * 37) % 5) * 22;
      return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, size: 10 + ((i * 7) % 4) * 6 };
    })
  ).current;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bloomWrap]}>
      {drops.map((d, i) => (
        <Animated.View
          key={`d${i}`}
          style={{
            position: "absolute",
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: i % 3 === 0 ? colors.paintEdge : colors.paint,
            opacity: t.interpolate({ inputRange: [0, 0.06, 0.6, 1], outputRange: [0, 1, 0.9, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
              // fast out, then a little gravity pulls each drop down
              { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, d.dy * 0.85, d.dy + 40] }) },
              { scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.25, 0.7] }) },
            ],
          }}
        />
      ))}
      <Animated.View
        style={[
          styles.bloomDisc,
          {
            backgroundColor: colors.paintEdge,
            opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 3.2] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.bloomRing,
          {
            borderColor: colors.paint,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 0.9, 0.2, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.6] }) }],
          },
        ]}
      />
      {sparks.map((s, i) => (
        <Animated.Text
          key={i}
          style={{
            position: "absolute",
            fontSize: s.size,
            color: colors.accent,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, s.dx] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, s.dy] }) },
              { scale: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.3, 1.2, 0.6] }) },
            ],
          }}
        >
          ✦
        </Animated.Text>
      ))}
    </View>
  );
}

/** A HUD number that counts up/down to its new value (~200 ms) instead of
 *  swapping, punches when `punch` is set, and floats a "+N" above itself when
 *  it rises (e.g. +1 move, +12% fill). */
function Stat({
  label,
  value,
  suffix = "",
  colors,
  punch,
  warn,
  tween,
}: {
  label: string;
  value: number;
  suffix?: string;
  colors: Colors;
  punch?: boolean;
  warn?: boolean;
  tween?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const float = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  const [shown, setShown] = useState(value);
  const [gain, setGain] = useState(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (!tween) {
      setShown(value);
      return;
    }
    // Count from the old value to the new one, eased out over ~200 ms.
    const start = Date.now();
    const D = 200;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - start) / D);
      const e = 1 - (1 - k) * (1 - k);
      setShown(Math.round(from + (value - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    if (value > from) {
      setGain(value - from);
      float.setValue(0);
      Animated.timing(float, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    if (punch) {
      scale.setValue(1);
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, friction: 4, tension: 200 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      ]).start();
    } else {
      scale.setValue(1.12);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 200 }).start();
    }
    return () => cancelAnimationFrame(raf);
  }, [value, tween, punch, scale, float]);
  return (
    <View style={styles.stat}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Txt weight="black" size={22} color={warn ? "#EB5757" : colors.text}>{`${tween ? shown : value}${suffix}`}</Txt>
      </Animated.View>
      <Txt weight="label" size={11} color={colors.subtext} style={styles.statLabel}>{label}</Txt>
      {gain > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.statFloat,
            {
              opacity: float.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [6, -22] }) },
                { scale: float.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) },
              ],
            },
          ]}
        >
          <Txt weight="black" size={14} color={colors.accent}>{`+${gain}${suffix}`}</Txt>
        </Animated.View>
      )}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  colors,
  highlight,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  colors: Colors;
  highlight?: boolean;
}) {
  return (
    <PressableScale
      disabled={disabled}
      onPress={onPress}
      rippleColor={highlight ? colors.onPaint : colors.paint}
      style={[styles.action, { backgroundColor: highlight ? colors.paint : colors.surface }]}
    >
      <Txt weight="body" size={18} color={highlight ? colors.onPaint : colors.text}>{icon}</Txt>
      <Txt weight="body" size={13} color={highlight ? colors.onPaint : colors.text}>{label}</Txt>
    </PressableScale>
  );
}

/** Animated swipe coach shown over the board on levels 1–2: a ghost hand that
 *  swipes from the brush along the level's real first stroke to the tile where
 *  it will stop (which pulses as the target), looping, with a paint trail. */
function SwipeCoach({ cell, colors, engine }: { cell: number; colors: Colors; engine: PathEngine }) {
  const t = useRef(new Animated.Value(0)).current;
  const target = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(150),
        Animated.timing(t, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(250),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(250),
      ])
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(target, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(target, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [t, target]);
  // Geometry is frozen at mount so the coach doesn't jump to the brush's new
  // spot while it fades out after the first stroke.
  const geo = useRef<{ dir: Direction; steps: number; x: number; y: number } | null>(null);
  if (!geo.current) {
    const d: Direction = engine.level.solution?.[0] ?? bestHintDirection(engine);
    geo.current = { dir: d, steps: Math.max(1, strokeLength(engine, d)), x: engine.cursorX, y: engine.cursorY };
  }
  const { dir, steps } = geo.current;
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  const sx = geo.current.x * cell;
  const sy = geo.current.y * cell;
  const tx = delta[0] * steps * cell;
  const ty = delta[1] * steps * cell;
  const arrow = { up: "↑", down: "↓", left: "←", right: "→" }[dir];
  const trail = [0.25, 0.5, 0.75];
  const along = (k: number) => [
    { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, tx * k] }) },
    { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, ty * k] }) },
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* the tile the stroke will stop on */}
      <Animated.View
        style={{
          position: "absolute",
          left: sx + tx + cell * 0.08,
          top: sy + ty + cell * 0.08,
          width: cell * 0.84,
          height: cell * 0.84,
          borderRadius: cell * 0.22,
          borderWidth: 3,
          borderColor: colors.accent,
          opacity: target.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
          transform: [{ scale: target.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }],
        }}
      />
      {trail.map((k, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: sx,
            top: sy,
            width: cell,
            height: cell,
            alignItems: "center",
            justifyContent: "center",
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.4 - i * 0.08, 0.4 - i * 0.08, 0] }),
            transform: along(k),
          }}
        >
          <View style={[styles.coachTrailDot, { backgroundColor: colors.paint }]} />
        </Animated.View>
      ))}
      <Animated.View
        style={{
          position: "absolute",
          left: sx,
          top: sy,
          width: cell,
          height: cell,
          alignItems: "center",
          justifyContent: "center",
          opacity: t.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            ...along(1),
            { scale: t.interpolate({ inputRange: [0, 0.12, 0.9, 1], outputRange: [1.15, 0.95, 0.95, 1.1] }) },
          ],
        }}
      >
        <View style={[styles.coachDot, { borderColor: colors.paint }]} />
        <Txt weight="black" size={cell * 0.52} style={{ position: "absolute", top: cell * 0.42 }}>👆</Txt>
      </Animated.View>
      <View style={styles.coachLabelWrap}>
        <View style={[styles.coachLabel, { backgroundColor: colors.surface }]}>
          <Txt weight="body" size={13} color={colors.text}>Swipe {arrow} to roll and paint</Txt>
        </View>
      </View>
    </View>
  );
}

/** Backdrop + card that springs into view when an overlay mounts. */
function OverlayCard({
  colors,
  children,
  confetti,
  onCardLayout,
}: {
  colors: Colors;
  children: ReactNode;
  confetti?: boolean;
  onCardLayout?: (width: number) => void;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!confetti) {
      Animated.spring(appear, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
      return;
    }
    // Win panel: a 340 ms zoom in with overshoot, then one celebratory pulse.
    Animated.sequence([
      Animated.timing(appear, { toValue: 1, duration: 340, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
  }, [appear, pulse, confetti]);
  return (
    <View style={styles.overlay}>
      {/* confetti keeps raining over the whole screen for ~1.6s */}
      {confetti && <Confetti count={36} height={Dimensions.get("window").height} spread={900} />}
      <Animated.View
        onLayout={(e) => onCardLayout?.(e.nativeEvent.layout.width)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            opacity: appear.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
            transform: [
              { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [confetti ? 0.6 : 0.85, 1] }) },
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
            ],
          },
        ]}
      >
        {confetti && <Confetti count={18} delayed />}
        {children}
      </Animated.View>
    </View>
  );
}

/** Three stars that pop in one after another, earned ones gold. */
function AnimatedStars({ stars, colors }: { stars: number; colors: Colors }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(220),
      Animated.stagger(80, vals.map((v) => Animated.spring(v, { toValue: 1, friction: 3.5, tension: 160, useNativeDriver: true }))),
    ]).start();
  }, [vals]);
  return (
    <View style={styles.starRow}>
      {[0, 1, 2].map((i) => (
        <Animated.Text
          key={i}
          style={[
            styles.bigStar,
            {
              color: i < stars ? colors.accent : colors.subtext + "55",
              opacity: vals[i].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
              transform: [
                { scale: vals[i].interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
                { rotate: vals[i].interpolate({ inputRange: [0, 1], outputRange: [i === 1 ? "-30deg" : i === 0 ? "-40deg" : "25deg", i === 1 ? "0deg" : i === 0 ? "-8deg" : "8deg"] }) },
              ],
            },
          ]}
        >
          ★
        </Animated.Text>
      ))}
    </View>
  );
}

/** Coins that burst out of the reward chest and arc into the wallet counter
 *  in the card's top-right corner (x eases linearly, y overshoots up then drops
 *  in — a real arc). `to` is the wallet's offset from the chest. */
function CoinFly({ to }: { to: { x: number; y: number } }) {
  const coins = useRef(
    Array.from({ length: 8 }, (_, i) => ({ delay: 420 + i * 70, size: 18 + (i % 3) * 3, lift: 50 + (i % 4) * 14, spread: ((i % 5) - 2) * 10 }))
  ).current;
  return (
    <View pointerEvents="none" style={styles.coinFly}>
      {coins.map((c, i) => (
        <CoinChip key={i} {...c} to={to} />
      ))}
    </View>
  );
}

/** A coin total that ticks up from 0 as the flying coins land in the wallet. */
function TickCounter({ to, colors }: { to: number; colors: Colors }) {
  const [n, setN] = useState(0);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const steps = Math.min(to, 20);
    if (steps <= 0) {
      setN(to);
      return;
    }
    const inc = Math.ceil(to / steps);
    let cur = 0;
    const iv = setInterval(() => {
      cur = Math.min(to, cur + inc);
      setN(cur);
      pop.setValue(1.18);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }).start();
      if (cur >= to) clearInterval(iv);
    }, 42);
    return () => clearInterval(iv);
  }, [to, pop]);
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Txt weight="black" size={22} color={colors.accent}>+{n} 🪙</Txt>
    </Animated.View>
  );
}

function CoinChip({ delay, size, lift, spread, to }: { delay: number; size: number; lift: number; spread: number; to: { x: number; y: number } }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 560, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [t, delay]);
  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize: size,
        opacity: t.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, spread, to.x] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, Math.min(0, to.y) * 0.4 - lift, to.y] }) },
          { scale: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.15, 0.6] }) },
        ],
      }}
    >
      🪙
    </Animated.Text>
  );
}

/** The wallet pill the coins fly into: ticks up from the old balance as they
 *  land and bounces on each hit. */
function WalletCounter({ total, gained, colors }: { total: number; gained: number; colors: Colors }) {
  const [n, setN] = useState(total - gained);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const hits = 8;
    let k = 0;
    let iv: ReturnType<typeof setInterval> | null = null;
    const start = setTimeout(() => {
      iv = setInterval(() => {
        k++;
        setN(total - gained + Math.round((gained * k) / hits));
        pop.setValue(1.25);
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 240, useNativeDriver: true }).start();
        if (k >= hits && iv) clearInterval(iv);
      }, 70);
    }, 420 + 560);
    return () => { clearTimeout(start); if (iv) clearInterval(iv); };
  }, [total, gained, pop]);
  return (
    <Animated.View style={[styles.wallet, { backgroundColor: colors.bg, transform: [{ scale: pop }] }]}>
      <Txt weight="black" size={15} color={colors.text}>🪙 {n}</Txt>
    </Animated.View>
  );
}

/** Springs its child in with an overshoot after `delay` (the CTA bounce). */
function PopIn({ delay, children }: { delay: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true })]).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function WinOverlay({
  colors,
  stars,
  coins,
  hasNext,
  onNext,
  onReplay,
  onMap,
}: {
  colors: Colors;
  stars: number;
  coins: number;
  hasNext: boolean;
  onNext: () => void;
  onReplay: () => void;
  onMap: () => void;
}) {
  // Measure where the chest sits so the coins arc exactly into the wallet.
  const [cardW, setCardW] = useState(300);
  const [chest, setChest] = useState<{ x: number; y: number } | null>(null);
  const wallet = { x: cardW - 16 - 40, y: 16 + 16 };
  return (
    <OverlayCard colors={colors} confetti onCardLayout={(w) => setCardW(w)}>
      <View style={styles.walletSlot}>
        <WalletCounter total={store.get().coins} gained={coins} colors={colors} />
      </View>
      <Txt weight="display" size={26} color={colors.text}>Level Complete!</Txt>
      <AnimatedStars stars={stars} colors={colors} />
      <View
        style={styles.rewardRow}
        onLayout={(e) => {
          const l = e.nativeEvent.layout;
          setChest({ x: l.x + 20, y: l.y + l.height / 2 });
        }}
      >
        <View>
          <Image source={art.ui_reward_chest} style={styles.rewardChest} resizeMode="contain" />
          {chest && <CoinFly to={{ x: wallet.x - chest.x, y: wallet.y - chest.y }} />}
        </View>
        <TickCounter to={coins} colors={colors} />
      </View>
      {hasNext ? (
        <PopIn delay={480}>
          <BigButton label="Next Level" colors={colors} onPress={onNext} highlight />
        </PopIn>
      ) : (
        <Txt weight="label" size={14} color={colors.subtext} style={{ textAlign: "center" }}>You painted every level — a true Path Painter!</Txt>
      )}
      <View style={styles.cardRow}>
        <BigButton label="Replay" colors={colors} onPress={onReplay} small />
        <BigButton label="Levels" colors={colors} onPress={onMap} small />
      </View>
    </OverlayCard>
  );
}

function LoseOverlay({
  colors,
  canAddTime,
  onAddTime,
  onRetry,
  onMap,
}: {
  colors: Colors;
  canAddTime: boolean;
  onAddTime: () => void;
  onRetry: () => void;
  onMap: () => void;
}) {
  return (
    <OverlayCard colors={colors}>
      <Txt weight="display" size={26} color={colors.text}>Time's Up!</Txt>
      <Txt weight="label" size={14} color={colors.subtext} style={{ textAlign: "center" }}>So close — give it another go.</Txt>
      {canAddTime && <BigButton label="+30s (watch ad)" colors={colors} onPress={onAddTime} highlight />}
      <View style={styles.cardRow}>
        <BigButton label="Retry" colors={colors} onPress={onRetry} small />
        <BigButton label="Levels" colors={colors} onPress={onMap} small />
      </View>
    </OverlayCard>
  );
}

function BigButton({ label, colors, onPress, highlight, small }: { label: string; colors: Colors; onPress: () => void; highlight?: boolean; small?: boolean }) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.bigBtn, small && styles.bigBtnSmall, { backgroundColor: highlight ? colors.paint : colors.bg }]}
    >
      <Txt weight="display" size={16} color={highlight ? colors.onPaint : colors.text}>{label}</Txt>
    </PressableScale>
  );
}

/* ------------------------------- Hint logic -------------------------------- */

function bestHintDirection(engine: PathEngine): Direction {
  const dirs: Direction[] = ["up", "down", "left", "right"];
  let best: Direction = "up";
  let bestGain = -1;
  for (const dir of dirs) {
    const gain = measureGain(engine, dir);
    if (gain > bestGain) {
      bestGain = gain;
      best = dir;
    }
  }
  return best;
}

/** How many tiles a stroke in `dir` would roll from the brush right now. */
function strokeLength(engine: PathEngine, dir: Direction): number {
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let x = engine.cursorX;
  let y = engine.cursorY;
  let n = 0;
  for (;;) {
    const t = engine.tileAt(x + dx, y + dy);
    if (!t || t.type === "wall") break;
    if (t.type === "gate" && !engine.openGroups.has(t.group ?? "")) break;
    if (t.type === "crumble" && engine.isPainted(x + dx, y + dy)) break;
    x += dx;
    y += dy;
    n++;
  }
  return n;
}

function measureGain(engine: PathEngine, dir: Direction): number {
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let x = engine.cursorX;
  let y = engine.cursorY;
  let gain = 0;
  for (;;) {
    const nx = x + delta[0];
    const ny = y + delta[1];
    const t = engine.tileAt(nx, ny);
    if (!t || t.type === "wall") break;
    if (t.type === "gate" && !engine.openGroups.has(t.group ?? "")) break;
    if (t.type === "crumble" && engine.isPainted(nx, ny)) break;
    if (!engine.isPainted(nx, ny)) gain++;
    x = nx;
    y = ny;
  }
  return gain;
}

/* -------------------------------- Styles ----------------------------------- */

const FILL = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

const styles = StyleSheet.create({
  root: { flex: 1 },
  tint: { ...FILL },
  flex: { flex: 1 },

  mapHeader: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 6, alignItems: "center", gap: 6 },
  logo: { width: 76, height: 76, marginBottom: -4 },
  statusPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  mapButtons: { flexDirection: "row", gap: 10, marginTop: 2 },
  mapScroll: { padding: 16, gap: 22 },
  chapterBlock: { gap: 12 },
  chapterTitle: { textTransform: "uppercase", letterSpacing: 1.5 },
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  levelNode: { width: 72, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 2 },
  nodeTile: { position: "absolute", width: "100%", height: "100%" },
  nodeStars: { flexDirection: "row", gap: 2 },

  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, minHeight: 48, justifyContent: "center", alignItems: "center" },
  pillSquare: { width: 48, paddingHorizontal: 0 },

  hud: { paddingTop: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  levelName: { flex: 1, textAlign: "center" },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginHorizontal: 24, marginTop: 12, paddingVertical: 12, borderRadius: 18 },
  stat: { alignItems: "center", minWidth: 64 },
  statFloat: { position: "absolute", top: -6, alignSelf: "center" },
  statLabel: { textTransform: "uppercase", letterSpacing: 1.5, marginTop: 1 },

  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 10 },
  coachDot: { position: "absolute", width: 46, height: 46, borderRadius: 23, borderWidth: 3, backgroundColor: "rgba(255,255,255,0.7)" },
  coachTrailDot: { position: "absolute", width: 26, height: 26, borderRadius: 13 },
  coachLabelWrap: { ...FILL, alignItems: "center", justifyContent: "flex-end", paddingBottom: 8 },
  coachLabel: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },

  hintBanner: { marginHorizontal: 24, marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },

  actions: { flexDirection: "row", justifyContent: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  action: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, minWidth: 96, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 1 },

  flash: { ...FILL, backgroundColor: "#FFFFFF" },
  overlay: { ...FILL, backgroundColor: "rgba(20,24,40,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 340, borderRadius: 28, paddingVertical: 30, paddingHorizontal: 26, gap: 16, alignItems: "center", overflow: "hidden" },
  cardRow: { flexDirection: "row", gap: 12 },
  starRow: { flexDirection: "row", gap: 10 },
  coinFly: { position: "absolute", left: 20, top: 20, width: 0, height: 0, alignItems: "center", justifyContent: "center" },
  walletSlot: { position: "absolute", top: 16, right: 16 },
  wallet: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, minWidth: 64, alignItems: "center" },
  bloomWrap: { alignItems: "center", justifyContent: "center" },
  winHalo: { position: "absolute", top: -10, left: -10, right: -10, bottom: -10, borderRadius: 26 },
  winRim: { position: "absolute", top: -3, left: -3, right: -3, bottom: -3, borderRadius: 21, borderWidth: 4 },
  bloomDisc: { position: "absolute", width: 140, height: 140, borderRadius: 70 },
  bloomRing: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 8 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardChest: { width: 40, height: 40 },
  bigStar: { fontSize: 54 },
  bigBtn: { paddingHorizontal: 28, paddingVertical: 15, borderRadius: 18, minWidth: 180, alignItems: "center" },
  bigBtnSmall: { minWidth: 92, paddingHorizontal: 18 },
});
