import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
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
import { art, worldArt } from "../art";
import { analytics } from "../modules/analytics";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { feedback } from "../modules/feedback";
import { useBannerHeight, useBottomInset, useTopInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";
import { Board, travelMs, tileDelay, boardBounds, framePad, groupColor, type Stroke, type Bump, type Rewind } from "../ui/Board";
import { Confetti } from "../ui/Confetti";
import { Coin } from "../ui/Coin";
import { BoardBurst } from "../fx/BoardBurst";
import { ComboPop } from "../fx/ComboPop";
import { LevelIntro } from "../fx/LevelIntro";
import { WorldBackdrop } from "../ui/Ambient";
import { HudNumber, HudPanel, IconButton, FillBucket, ParMeter } from "../ui/Hud";
import { DAILY_BONUS, dailyClaimed, todayKey } from "../game/daily";
import { SettingsModal } from "./SettingsModal";
import { qa, reportNext } from "../modules/qa";
import { nextWinningMove } from "../game/solver";
import { HomeScreen } from "./HomeScreen";
import { LevelsScreen } from "./LevelsScreen";

const HINT_COST = 40;
/** Distance (dp) at which a drag commits to a direction — mid-gesture, so the
 *  brush is already rolling while the finger is still moving. */
const SWIPE_THRESHOLD = 14;

type ViewMode = "home" | "map" | "play";


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

  // QA level replay (<scheme>://qa/level/<n>) opens straight into level n.
  const qaLevel = !screenshot && qa.level != null ? Math.min(TOTAL_LEVELS, qa.level) : null;
  const [view, setView] = useState<ViewMode>(screenshot?.view ?? (qaLevel ? "play" : "home"));
  const [levelId, setLevelId] = useState(screenshot?.levelId ?? qaLevel ?? 1);
  // Whether the open level is today's Daily Paint (pays the daily bonus once).
  const [dailyRun, setDailyRun] = useState(false);
  // Each chapter is its own world: backdrop, brush colour and board frame.
  // Home and the gallery wear the chapter the player is currently in.
  const progressChapter = levelById(Math.min(TOTAL_LEVELS, Math.max(1, snap.level)))?.chapter ?? 1;
  const chapter = view === "play" ? levelById(levelId)?.chapter ?? 1 : progressChapter;
  const colors = useMemo(
    () => makeColors(snap.settings.palette, snap.settings.highContrast, chapter, snap.skin),
    [snap.settings.palette, snap.settings.highContrast, chapter, snap.skin]
  );
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

  // Bumped to remount the level (e.g. Replay tutorial while Level 1 is already open).
  const [playNonce, setPlayNonce] = useState(0);
  function openLevel(id: number, daily = false) {
    setDailyRun(daily);
    setLevelId(id);
    setView("play");
  }
  /** Settings → Replay tutorial: coach levels 1–2 again, starting at Level 1. */
  function replayTutorial() {
    store.set({ tutorialDone: false });
    analytics.track("tutorial_replay");
    setSettingsOpen(false);
    setPlayNonce((n) => n + 1);
    openLevel(1);
  }

  return (
    <View style={styles.root}>
      <WorldBackdrop source={worldArt(chapter)} tint={colors.paintEdge} />
      <FadeSwap swapKey={view === "play" ? `play-${levelId}-${playNonce}` : view} grow={view === "play"}>
        {view === "home" ? (
          <HomeScreen
            colors={colors}
            onPlay={(id) => openLevel(id)}
            onDaily={(id) => openLevel(id, true)}
            onLevels={() => setView("map")}
            onShop={() => onOpenShop?.()}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : view === "map" ? (
          <LevelsScreen colors={colors} awardedId={awardedId} onPlay={(id) => openLevel(id)} onHome={() => setView("home")} onSettings={() => setSettingsOpen(true)} onShop={() => onOpenShop?.()} />
        ) : (
          <PlayView
            key={`${levelId}-${playNonce}`}
            levelId={levelId}
            colors={colors}
            onExit={() => setView("map")}
            onSettings={() => setSettingsOpen(true)}
            onGoToLevel={(id) => openLevel(id)}
            onAward={setAwardedId}
            daily={dailyRun}
            demo={screenshot}
          />
        )}
      </FadeSwap>
      <SettingsModal
        visible={settingsOpen}
        colors={colors}
        onClose={() => setSettingsOpen(false)}
        onReplayTutorial={screenshot ? undefined : replayTutorial}
      />
    </View>
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

/* --------------------------------- Play ----------------------------------- */

type Overlay = { kind: "none" } | { kind: "won"; stars: number; coins: number; moves: number; dailyBonus: number } | { kind: "lost" };

/** The mechanics a level shows for the first time in the campaign: crumble
 *  tiles, turn pads and each new switch/door colour. Their tiles are spotlit
 *  until the player's first move, and the level's tip names them. */
type MechKind = "crumble" | "gate" | "pad";
function featureOf(ch: string): string | null {
  if (ch === "*") return "crumble";
  if ("<>^v".includes(ch)) return "pad";
  if (/[A-Da-d]/.test(ch)) return "g" + ch.toUpperCase();
  return null;
}
function newMechanicTiles(levelId: number): { keys: Set<string>; kind: MechKind | null; group?: string } {
  const seen = new Set<string>();
  for (const l of LEVELS) if (l.id < levelId) for (const row of l.grid) for (const ch of row) { const f = featureOf(ch); if (f) seen.add(f); }
  const lvl = levelById(levelId);
  const keys = new Set<string>();
  let kind: MechKind | null = null;
  let group: string | undefined;
  lvl?.grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const f = featureOf(ch);
      if (!f || seen.has(f)) return;
      keys.add(`${x},${y}`);
      if (!kind) {
        kind = f === "crumble" ? "crumble" : f === "pad" ? "pad" : "gate";
        group = kind === "gate" ? ch.toUpperCase() : undefined;
      }
    })
  );
  return { keys, kind, group };
}

function PlayView({
  levelId,
  colors,
  onExit,
  onSettings,
  onGoToLevel,
  onAward,
  daily,
  demo,
}: {
  levelId: number;
  colors: Colors;
  onExit: () => void;
  onSettings: () => void;
  onGoToLevel: (id: number) => void;
  onAward: (id: number) => void;
  /** Opened as today's Daily Paint: the first clear today pays DAILY_BONUS. */
  daily?: boolean;
  demo?: ScreenshotConfig;
}) {
  const level = levelById(levelId)!;
  const engineRef = useRef<PathEngine>(new PathEngine(level));
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  // QA level replay: the board's window position, for reportNext's touches.
  const boardRef = useRef<ComponentRef<typeof View>>(null);
  const qaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellRef = useRef(0);
  useEffect(() => () => { if (qaTimer.current) clearTimeout(qaTimer.current); }, []);
  const bannerH = useBannerHeight();
  const bottomInset = useBottomInset();
  const topInset = useTopInset(50);

  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [timeLeft, setTimeLeft] = useState(level.timeLimitSeconds);
  const [hintDir, setHintDir] = useState<Direction | null>(null);
  const [coaching, setCoaching] = useState(levelId <= 2 && !store.get().tutorialDone && !demo && qa.level == null);
  // Out of coins for a hint: offer a rewarded ad (or say none is available).
  const [hintOffer, setHintOffer] = useState(false);
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
  // The paint combo: one rising note + tick per freshly painted tile, timed to the brush.
  const noteTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearNotes = () => { noteTimers.current.forEach(clearTimeout); noteTimers.current = []; };
  useEffect(() => clearNotes, []);

  // Streak feedback: "+5 Splash!" for a long fresh stroke, "Combo xN" when
  // consecutive strokes keep painting new tiles.
  const [combo, setCombo] = useState<{ id: number; x: number; y: number; text: string; big: boolean; delay: number } | null>(null);
  const streak = useRef(0);
  // Win beat 1 (board celebrates): tile wave id + confetti from the board.
  const [celebrate, setCelebrate] = useState(0);
  const [burst, setBurst] = useState(false);

  // New-mechanic spotlight (rings the tiles until the first move) + tip icon.
  const mech = useMemo(() => newMechanicTiles(levelId), [levelId]);
  const [spotOn, setSpotOn] = useState(mech.keys.size > 0);

  // Level intro: the board settles in (a short drop + grow, no 3D tilt — a
  // perspective tilt rasterised soft on Android) while the level banner sweeps.
  const tilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(tilt, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [tilt]);
  const showIntro = !demo && qa.level == null;

  // Juice: board pulse + the win glow around the board.
  const pulse = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  // Deferred reveal of the results card so the win celebration plays first.
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (winTimer.current) clearTimeout(winTimer.current); }, []);
  const boardScale = Animated.multiply(
    pulse.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.02, 1] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] })
  );
  function triggerPulse() {
    pulse.setValue(0);
    Animated.timing(pulse, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }
  function pressIn() {
    Animated.timing(press, { toValue: 1, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    if (overlay.kind === "none" && engineRef.current.status === "playing") feedback.press();
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
  // Any popup (win card, hint offer, time-up) hides the ghost hand at once.
  const popupOpen = overlay.kind !== "none" || hintOffer;
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
      setOverlay({ kind: "won", stars, coins: 10 + stars * 10, moves: engine.moves, dailyBonus: 0 });
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
    // Which tiles along this stroke are still bare (they get the combo notes).
    const paintedBefore = new Set(engine.painted);
    const status = engine.move(dir);
    if (engine.moves === movesBefore) {
      // Swiped straight into a wall: no move is spent, but the brush knocks
      // against it with a soft tick so the touch never feels dead.
      setBump({ id: ++strokeSeq.current, dir });
      feedback.bump();
      streak.current = 0;
      return;
    }
    analytics.qa("move", { level: levelId });
    // The roll's real path (turn pads bend it): its length drives every timing below.
    const path = engine.lastPath;
    const steps = path.length;
    const endTile = engine.tileAt(engine.cursorX, engine.cursorY);
    const endDir: Direction = endTile?.type === "pad" && endTile.dir ? endTile.dir : path[steps - 1].dir;
    setStroke({ id: ++strokeSeq.current, fromX, fromY, dir, steps, path, endDir });
    if (spotOn) setSpotOn(false);
    triggerPulse();
    clearNotes();
    let note = 0;
    const noted = new Set<string>();
    path.forEach((p, idx) => {
      const k0 = `${p.x},${p.y}`;
      if (paintedBefore.has(k0) || noted.has(k0)) return;
      noted.add(k0);
      const k = note++;
      noteTimers.current.push(setTimeout(() => feedback.paintTile(k), tileDelay(idx + 1, steps)));
    });
    if (engine.openGroups.size > gatesBefore) feedback.gate();
    else if (note === 0) feedback.move();
    // Streak: strokes that keep painting fresh tiles build a combo.
    streak.current = note >= 2 ? streak.current + 1 : 0;
    const comboText = streak.current >= 2 ? `Combo x${streak.current}` : note >= 3 ? `+${note} Splash!` : null;
    if (comboText && status !== "won") {
      setCombo({ id: strokeSeq.current, x: engine.cursorX, y: engine.cursorY, text: comboText, big: streak.current >= 3 || note >= 5, delay: travelMs(steps) });
      if (streak.current >= 2 || note >= 4) setTimeout(() => feedback.combo(), travelMs(steps));
    }
    // A soft thud as the brush meets the wall.
    if (impactTimer.current) clearTimeout(impactTimer.current);
    impactTimer.current = setTimeout(() => feedback.bump(), travelMs(steps));
    rerender();
    if (status === "won") finishWin(travelMs(steps));
    qaReport(status === "won" ? 0 : travelMs(steps) + 250);
  }

  /** QA replay: report the solver's next swipe (brush centre → 1.6 cells along
   *  the stroke), measured fresh from the board's on-screen box. */
  function qaReport(delay: number) {
    if (qa.level == null || demo) return;
    if (qaTimer.current) clearTimeout(qaTimer.current);
    qaTimer.current = setTimeout(() => {
      const e = engineRef.current;
      if (e.status === "won") return reportNext(levelId, null);
      const dir = nextWinningMove(e);
      const node = boardRef.current;
      const cell = cellRef.current;
      if (!dir || !node || cell <= 0) return reportNext(levelId, null);
      node.measureInWindow((x, y, w) => {
        const b = boardBounds(e);
        const F = framePad(cell);
        const k = w > 0 ? w / (b.w * cell + 2 * F) : 1; // board transforms (tilt/pulse) scale the box
        const cx = x + (F + (e.cursorX - b.x0 + 0.5) * cell) * k;
        const cy = y + (F + (e.cursorY - b.y0 + 0.5) * cell) * k;
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        reportNext(levelId, { x: cx, y: cy, x2: cx + dx * cell * 1.6 * k, y2: cy + dy * cell * 1.6 * k });
      });
    }, delay);
  }

  function finishWin(landMs: number) {
    const engine = engineRef.current;
    const stars = engine.starsForMoves();
    const dailyBonus = daily && !dailyClaimed(store.get()) ? DAILY_BONUS : 0;
    const coins = 10 + stars * 10 + dailyBonus;
    store.recordWin(levelId, stars, coins);
    if (dailyBonus > 0) store.set({ dailyDay: todayKey() });
    onAward(levelId);
    analytics.track("level_complete", { level: levelId, stars, moves: engine.moves, coins });
    // Wait for the last tile's paint to land, then a soft paint-coloured bloom
    // swells out of the board (never a hard white frame) while the board zooms
    // gently; the results card eases in as the bloom fades.
    // Beat 1 — the BOARD celebrates: once the last tile's paint lands, a hop +
    // flash wave ripples across every painted tile from the brush, the frame
    // rim glows and confetti fires out of the board. Beat 2 — the results card
    // (its own staged reveal) only once that wave has crossed the board.
    const land = landMs + 120;
    const b = boardBounds(engine);
    const waveMs = (b.w + b.h) * 55 + 260;
    const quick = qa.level != null;
    bloom.setValue(0);
    Animated.sequence([
      Animated.delay(land),
      Animated.timing(bloom, { toValue: 1, duration: Math.max(700, waveMs + 200), easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    winTimer.current = setTimeout(() => {
      feedback.win();
      setCelebrate(++strokeSeq.current);
      setBurst(true);
      winTimer.current = setTimeout(() => setOverlay({ kind: "won", stars, coins, moves: engine.moves, dailyBonus }), quick ? 300 : Math.min(1100, waveMs + 250));
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
    setCelebrate(0);
    setBurst(false);
    setCombo(null);
    streak.current = 0;
    bloom.setValue(0);
    setHintDir(null);
    setOverlay({ kind: "none" });
    setTimeLeft(level.timeLimitSeconds);
    analytics.track("level_start", { level: levelId });
    rerender();
  }

  function doUndo() {
    streak.current = 0;
    withRewind(false, () => engineRef.current.undo());
    setStroke(null);
    setHintDir(null);
    rerender();
    qaReport(450);
  }
  function doReset() {
    streak.current = 0;
    withRewind(true, () => engineRef.current.reset());
    setStroke(null);
    setHintDir(null);
    rerender();
    qaReport(450);
  }

  function revealHint() {
    setHintOffer(false);
    setHintDir(nextWinningMove(engineRef.current) ?? bestHintDirection(engineRef.current));
    analytics.track("hint_used", { level: levelId });
  }
  function tryHint() {
    if (hintDir) return;
    const coins = store.get().coins;
    if (coins >= HINT_COST) {
      store.set({ coins: coins - HINT_COST });
      analytics.track("currency_spend", { type: "coins", amount: HINT_COST, sink: "hint" });
      revealHint();
    } else {
      feedback.tap();
      setHintOffer(true);
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
  // Size the board to the space between HUD and controls: only the playable
  // bounding box is drawn, plus its frame (≈0.2 cell each side).
  const bb = boardBounds(engine);
  const cell =
    boardBox.w > 0
      ? Math.max(14, Math.min(120, Math.floor(Math.min((boardBox.w - 16) / (bb.w + 0.4), (boardBox.h - 6) / (bb.h + 0.4)))))
      : 0;
  const F = cell > 0 ? framePad(cell) : 0;
  cellRef.current = cell;
  // QA replay: first report once the board has laid out and its intro tilt settled.
  const laidOut = cell > 0;
  useEffect(() => {
    if (laidOut) qaReport(900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidOut]);
  const canSpendHint = store.get().coins >= HINT_COST;
  const timed = level.timeLimitSeconds > 0;
  const tiltY = tilt.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] });
  const tiltScale = tilt.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <View style={styles.flex}>
      {/* Gameplay layer — never scaled or washed as a whole (that read as a
          dimmed, shifted, blurry frame on device); the win plays on the board. */}
      <View style={styles.flex}>
      {/* HUD (dimmed during the first-move tutorial) */}
      <Animated.View style={[styles.hud, { paddingTop: topInset, opacity: uiDim }]}>
        <PressableScale onPress={onExit} rippleColor="#FFFFFF" accessibilityLabel="Levels" style={[styles.backPill, { backgroundColor: colors.frame, borderColor: colors.frameEdge }]}>
          <View pointerEvents="none" style={styles.pillGloss} />
          <Image source={art.icon_back} style={styles.backIcon} resizeMode="contain" />
          <Txt weight="display" size={15} color="#FFFFFF" style={styles.outlinedSmall}>Levels</Txt>
        </PressableScale>
        <View style={[styles.titleRibbon, { backgroundColor: colors.paint, borderColor: colors.paintEdge }]}>
          <View pointerEvents="none" style={styles.pillGloss} />
          <Txt weight="display" size={12} color="#FFFFFFDD" style={styles.ribbonKicker} numberOfLines={1}>{daily ? "Daily Paint" : `Level ${levelId}`}</Txt>
          <Txt weight="display" size={18} color="#FFFFFF" style={styles.outlinedSmall} numberOfLines={1} adjustsFontSizeToFit>{level.name}</Txt>
        </View>
        <IconButton icon={art.icon_gear} onPress={onSettings} colors={colors} size={46} />
      </Animated.View>

      <Animated.View style={{ opacity: uiDim }}>
        <HudPanel colors={colors} style={styles.statsRow}>
          <FillBucket percent={engine.fillPercent} colors={colors} />
          <View style={[styles.statDivider, { backgroundColor: colors.frameEdge }]} />
          {timed ? (
            <View style={styles.timedStats}>
              <Stat label="Time" value={timeLeft} suffix="s" warn={timeLeft <= 10} />
              <Stat label="Moves" value={engine.moves} tween punch />
            </View>
          ) : (
            <ParMeter moves={engine.moves} par={level.parMoves} colors={colors} />
          )}
        </HudPanel>
      </Animated.View>

      {/* Board */}
      {/* The whole board area takes swipes, not just the tiles. */}
      <View {...pan.panHandlers} style={styles.boardWrap} onLayout={(e) => setBoardBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {cell > 0 && (
          <Animated.View style={{ transform: [{ translateY: tiltY }, { scale: tiltScale }] }}>
          <Animated.View ref={boardRef} collapsable={false} style={{ transform: [{ scale: boardScale }] }}>
            <WinGlow t={bloom} colors={colors} />
            <Board engine={engine} cell={cell} colors={colors} hintDir={hintDir} stroke={stroke} bump={bump} press={press} rewind={rewind} spotlight={spotOn && !demo ? mech.keys : null} celebrate={celebrate} />
            {combo && (
              <View pointerEvents="none" style={{ position: "absolute", left: F - bb.x0 * cell, top: F - bb.y0 * cell, width: engine.width * cell, height: engine.height * cell }}>
                <ComboPop key={combo.id} x={combo.x} y={combo.y} cell={cell} text={combo.text} big={combo.big} delay={combo.delay} color={colors.paintDeep} />
              </View>
            )}
            {coachShown && !popupOpen && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: F - bb.x0 * cell,
                  top: F - bb.y0 * cell,
                  width: engine.width * cell,
                  height: engine.height * cell,
                  opacity: coachFade,
                  transform: [{ scale: coachFade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                }}
              >
                <SwipeCoach cell={cell} colors={colors} engine={engine} />
              </Animated.View>
            )}
            {burst && <BoardBurst width={bb.w * cell + 2 * F} height={bb.h * cell + 2 * F} paint={colors.paint} />}
          </Animated.View>
          </Animated.View>
        )}
        {showIntro && boardBox.w > 0 && (
          <LevelIntro kicker={daily ? "Daily Paint" : `Level ${levelId}`} name={level.name} color={colors.paint} edge={colors.paintDeep} width={boardBox.w} />
        )}
      </View>

      {/* Stays mounted (only hidden) under a popup: unmounting it re-laid out the
          board mid-celebration — the board jumped bigger and the brush slid. */}
      {level.hint && (
        <View style={{ opacity: overlay.kind === "none" ? 1 : 0 }}>
          <MechanicCallout text={level.hint} colors={colors} kind={mech.kind ?? (timed ? "timed" : "paint")} group={mech.group} />
        </View>
      )}

      {/* Action bar — padded by the banner height so the ad never covers it. */}
      <Animated.View style={[styles.actions, { paddingBottom: 14 + Math.max(bannerH, bottomInset), opacity: uiDim }]}>
        <IconButton icon={art.icon_undo} label="Undo" disabled={!engine.canUndo() || overlay.kind !== "none"} onPress={doUndo} colors={colors} size={58} />
        <IconButton icon={art.icon_reset} label="Reset" onPress={doReset} colors={colors} size={58} />
        {/* Hint stays neutral until the player's first stroke (QA: tutorial focus). */}
        <IconButton
          icon={art.icon_hint}
          label={hintDir ? "Hint ✓" : "Hint"}
          badge={!hintDir && canSpendHint ? `${HINT_COST}` : !hintDir && ads.rewardedAvailable() ? "AD" : undefined}
          disabled={!!hintDir || overlay.kind !== "none"}
          onPress={tryHint}
          colors={colors}
          tone={coaching ? "frame" : "gold"}
          size={58}
        />
      </Animated.View>

      </View>

      {/* Overlays */}
      {overlay.kind === "won" && (
        <WinOverlay
          colors={colors}
          stars={overlay.stars}
          coins={overlay.coins}
          moves={overlay.moves}
          par={level.parMoves}
          dailyBonus={overlay.dailyBonus}
          hasNext={levelId < TOTAL_LEVELS}
          onNext={() => leaveWin(() => onGoToLevel(levelId + 1))}
          onReplay={() => leaveWin(restart)}
          onMap={() => leaveWin(onExit)}
        />
      )}
      {hintOffer && overlay.kind === "none" && (
        <HintOffer colors={colors} cost={HINT_COST} adReady={ads.rewardedAvailable()} onWatch={() => ads.showRewarded(() => revealHint())} onClose={() => setHintOffer(false)} />
      )}
      {overlay.kind === "lost" && (
        <LoseOverlay colors={colors} canAddTime={ads.rewardedAvailable()} onAddTime={grantExtraTime} onRetry={restart} onMap={onExit} />
      )}
    </View>
  );
}

/** The level's tip as an animated callout: it springs up from below with an
 *  icon of the mechanic it teaches (key + door colour, crumble tile, clock or
 *  paint drop) so a new rule is introduced visually, not only in words. */
function MechanicCallout({ text, colors, kind, group }: { text: string; colors: Colors; kind: MechKind | "timed" | "paint"; group?: string }) {
  const t = useRef(new Animated.Value(0)).current;
  const wob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(550),
      Animated.spring(t, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.timing(wob, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(wob, { toValue: 0, friction: 3, tension: 200, useNativeDriver: true }),
    ]).start();
  }, [t, wob]);
  const gc = kind === "gate" ? groupColor(group, colors) : colors.paint;
  return (
    <Animated.View
      style={[
        styles.callout,
        {
          opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}
    >
      <Animated.View style={[styles.calloutIcon, { backgroundColor: kind === "crumble" || kind === "pad" ? colors.slot : gc, transform: [{ rotate: wob.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-14deg"] }) }] }]}>
        {kind === "crumble" ? (
          <Image source={art.sprite_crumble_tile} style={{ width: 34, height: 34 }} resizeMode="contain" />
        ) : kind === "pad" ? (
          <Image source={art.sprite_one_way_arrow} style={{ width: 34, height: 34 }} resizeMode="contain" />
        ) : (
          <Image source={kind === "gate" ? art.icon_key : kind === "timed" ? art.icon_daily : art.icon_drop} style={{ width: 26, height: 26 }} resizeMode="contain" />
        )}
      </Animated.View>
      <Txt weight="body" size={14} color={colors.text} style={styles.calloutText}>{text}</Txt>
    </Animated.View>
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

/** A HUD number that counts up/down to its new value (~200 ms) instead of
 *  swapping, punches when `punch` is set, and floats a "+N" above itself when
 *  it rises (e.g. +1 move, +12% fill). */
function Stat({
  label,
  value,
  suffix = "",
  punch,
  warn,
  tween,
}: {
  label: string;
  value: number;
  suffix?: string;
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
        <HudNumber value={`${tween ? shown : value}${suffix}`} size={22} color={warn ? "#FF8A80" : "#FFFFFF"} />
      </Animated.View>
      <Txt weight="display" size={13} color="#FFFFFF" style={[styles.statLabel, styles.outlinedSmall]}>{label}</Txt>
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
          <Txt weight="display" size={14} color="#FFE08A" style={styles.outlinedSmall}>{`+${gain}${suffix}`}</Txt>
        </Animated.View>
      )}
    </View>
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
  // The arrow track: a dashed lane along the whole stroke with chevrons that
  // light up in sequence in the swipe direction — readable even mid-loop.
  const horiz = delta[0] !== 0;
  const n = steps + 1;
  const laneL = Math.min(sx, sx + tx) + (horiz ? cell * 0.12 : cell * 0.22);
  const laneT = Math.min(sy, sy + ty) + (horiz ? cell * 0.22 : cell * 0.12);
  const laneW = horiz ? n * cell - cell * 0.24 : cell * 0.56;
  const laneH = horiz ? cell * 0.56 : n * cell - cell * 0.24;
  const chev = { up: "▲", down: "▼", left: "◀", right: "▶" }[dir];
  const chevrons = Array.from({ length: Math.max(2, steps) }, (_, i) => i);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: "absolute", left: laneL, top: laneT, width: laneW, height: laneH, borderRadius: cell * 0.28, borderWidth: 3, borderStyle: "dashed", borderColor: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.18)" }} />
      {chevrons.map((i) => {
        const k = (i + 1) / (chevrons.length + 1);
        const at = (i + 0.5) / chevrons.length;
        return (
          <Animated.View
            key={`c${i}`}
            style={{
              position: "absolute",
              left: sx + tx * k,
              top: sy + ty * k,
              width: cell,
              height: cell,
              alignItems: "center",
              justifyContent: "center",
              opacity: t.interpolate({ inputRange: [0, Math.max(0.01, at - 0.25), at, Math.min(0.99, at + 0.3), 1], outputRange: [0.35, 0.35, 1, 0.5, 0.35] }),
              transform: [{ scale: t.interpolate({ inputRange: [0, Math.max(0.01, at - 0.2), at, 1], outputRange: [0.85, 0.85, 1.2, 0.9] }) }],
            }}
          >
            <Txt weight="black" size={cell * 0.3} color="#FFFFFF" style={styles.outlinedSmall}>{chev}</Txt>
          </Animated.View>
        );
      })}
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
          opacity: t.interpolate({ inputRange: [0, 0.05, 0.95, 1], outputRange: [0.6, 1, 1, 0.6] }),
          transform: [
            ...along(1),
            { scale: t.interpolate({ inputRange: [0, 0.12, 0.9, 1], outputRange: [1.15, 0.95, 0.95, 1.1] }) },
          ],
        }}
      >
        <View style={[styles.coachDot, { borderColor: colors.paint, alignItems: "center", justifyContent: "center" }]}>
          <Txt weight="black" size={22} color={colors.paintDeep}>{arrow}</Txt>
        </View>
        <Txt weight="black" size={Math.min(64, cell * 0.68)} style={{ position: "absolute", top: cell * 0.38, textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>👆</Txt>
      </Animated.View>
    </View>
  );
}

/** Backdrop + card that springs into view when an overlay mounts. The dim
 *  backdrop eases in on its own layer (the game underneath is never faded or
 *  scaled); a win card gets confetti BEHIND it. */
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
  const dim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(dim, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
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
  }, [appear, pulse, dim, confetti]);
  return (
    <View style={styles.overlay}>
      <Animated.View pointerEvents="none" style={[styles.overlayDim, { opacity: dim }]} />
      {/* confetti rains over the screen BEHIND the card for ~1.6s */}
      {confetti && <Confetti count={36} height={Dimensions.get("window").height} spread={900} />}
      <Animated.View
        onLayout={(e) => onCardLayout?.(e.nativeEvent.layout.width)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            // Opaque within ~2 frames: a half-transparent card let the board show
            // through it (read as a dimmed, blurry, half-built frame).
            opacity: appear.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
            transform: [
              { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [confetti ? 0.55 : 0.85, 1] }) },
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** The win card's timeline (ms after it mounts). Every slot is laid out from
 *  the first frame — ribbon, three star sockets, par line, reward row, buttons —
 *  and things only light up in order, so the card is never half-built and
 *  nothing shifts. */
function winTimeline(stars: number) {
  const STAR0 = 300; // first star lands just after the card settles
  const STEP = 260; // one star every 260 ms, each with its chime
  const starsDone = STAR0 + Math.max(1, stars) * STEP;
  // The reward pops in with the first star and counts up while they land, so
  // the card fills out in ~1.2 s and is never a big empty white panel.
  const reward = 180; // the reward row pops while the card settles
  const count = STAR0 + 40; // and counts 0→N once, alongside the star pops
  return { STAR0, STEP, par: starsDone, reward, count, countMs: Math.max(700, starsDone - count + 250), cta: starsDone - 40 };
}

/** Three star sockets (always drawn); the earned stars pop into them one at a
 *  time with a bounce, a sparkle burst and a chime. */
function AnimatedStars({ stars, start, step }: { stars: number; start: number; step: number }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const timers = [0, 1, 2].filter((i) => i < stars).map((i) => setTimeout(() => feedback.star(), start + i * step + 120));
    const anims = vals.map((v, i) =>
      i < stars
        ? Animated.sequence([Animated.delay(start + i * step), Animated.spring(v, { toValue: 1, friction: 3.6, tension: 170, useNativeDriver: true })])
        : Animated.delay(0)
    );
    Animated.parallel(anims).start();
    return () => timers.forEach(clearTimeout);
  }, [vals, stars, start, step]);
  return (
    <View style={styles.starRow}>
      {[0, 1, 2].map((i) => {
        const st = i === 1 ? styles.bigStarMid : styles.bigStar;
        const tilt = i === 1 ? "0deg" : i === 0 ? "-8deg" : "8deg";
        return (
          <View key={i} style={[st, { alignItems: "center", justifyContent: "center" }]}>
            {/* socket: always there, so the row is never empty */}
            <Image source={art.star_empty} resizeMode="contain" style={[st, { position: "absolute", marginTop: 0, opacity: 0.9, transform: [{ rotate: tilt }] }]} />
            {i < stars && (
              <>
                <StarSparkle t={vals[i]} />
                <Animated.Image
                  source={art.star_gold}
                  resizeMode="contain"
                  style={[
                    st,
                    {
                      position: "absolute",
                      marginTop: 0,
                      opacity: vals[i].interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
                      transform: [
                        { scale: vals[i].interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] }) },
                        { rotate: vals[i].interpolate({ inputRange: [0, 1], outputRange: [i === 2 ? "40deg" : "-40deg", tilt] }) },
                      ],
                    },
                  ]}
                />
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Six sparkle diamonds that spray out of a star as it lands. */
function StarSparkle({ t }: { t: Animated.Value }) {
  const bits = useRef(Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.4; return { dx: Math.cos(a) * 44, dy: Math.sin(a) * 44, s: 7 + (i % 2) * 4 }; })).current;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      {bits.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: b.s,
            height: b.s,
            borderRadius: 2,
            backgroundColor: i % 2 ? "#FFFFFF" : "#FFC53B",
            borderWidth: i % 2 ? 1 : 0,
            borderColor: "#FFC53B",
            opacity: t.interpolate({ inputRange: [0, 0.35, 0.9, 1], outputRange: [0, 1, 0.6, 0], extrapolate: "clamp" }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, b.dx * 0.6, b.dx], extrapolate: "clamp" }) },
              { translateY: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, b.dy * 0.6, b.dy], extrapolate: "clamp" }) },
              { rotate: "45deg" },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** Coins that burst out of the reward chest and arc into the wallet pill in
 *  the card's top-right corner (x eases, y lifts then drops in — a real arc).
 *  `to` is the wallet's offset from the chest. */
function CoinFly({ to, start }: { to: { x: number; y: number }; start: number }) {
  const coins = useRef(
    Array.from({ length: 8 }, (_, i) => ({ delay: start + i * 70, size: 16 + (i % 3) * 3, lift: 50 + (i % 4) * 14, spread: ((i % 5) - 2) * 10 }))
  ).current;
  return (
    <View pointerEvents="none" style={styles.coinFly}>
      {coins.map((c, i) => (
        <CoinChip key={i} {...c} to={to} />
      ))}
    </View>
  );
}

function CoinChip({ delay, size, lift, spread, to }: { delay: number; size: number; lift: number; spread: number; to: { x: number; y: number } }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 560, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        position: "absolute",
        opacity: t.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, spread, to.x] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, Math.min(0, to.y) * 0.4 - lift, to.y] }) },
          { scale: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.15, 0.6] }) },
        ],
      }}
    >
      <Coin size={size} />
    </Animated.View>
  );
}

/** Text that follows a shared 0..1 progress: `from + (to-from)·p`. The reward
 *  (+0→+N) and the wallet (old→new) both read the SAME progress, so they always
 *  agree frame by frame and each counts exactly once. Renders nothing until the
 *  progress starts (no "+0" placeholder); its slot keeps a fixed width. */
function CountText({ prog, from, to, prefix = "", size, color, width, showAtRest }: { prog: Animated.Value; from: number; to: number; prefix?: string; size: number; color: string; width: number; showAtRest?: boolean }) {
  const [txt, setTxt] = useState(showAtRest ? `${prefix}${from}` : "");
  useEffect(() => {
    const id = prog.addListener(({ value }) => {
      if (value <= 0) return;
      const n = Math.round(from + (to - from) * value);
      // first visible reward frame is never 0
      setTxt(`${prefix}${showAtRest ? n : Math.max(1, n)}`);
    });
    return () => prog.removeListener(id);
  }, [prog, from, to, prefix, showAtRest]);
  return (
    <View style={{ width, alignItems: "center" }}>
      <Txt weight="black" size={size} color={color} numberOfLines={1}>{txt}</Txt>
    </View>
  );
}

/** A CTA that pops in at `delay`, then keeps breathing (gentle 1→1.05 loop). */
function BreathingIn({ delay, live, children }: { delay: number; live: boolean; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  const br = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(br, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(br, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true })]).start(() => loop.start());
    return () => loop.stop();
  }, [v, br, delay]);
  return (
    <Animated.View
      pointerEvents={live ? "auto" : "none"}
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
          { scale: br.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
        ],
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
  moves,
  par,
  dailyBonus,
  hasNext,
  onNext,
  onReplay,
  onMap,
}: {
  colors: Colors;
  stars: number;
  coins: number;
  moves: number;
  par: number;
  dailyBonus: number;
  hasNext: boolean;
  onNext: () => void;
  onReplay: () => void;
  onMap: () => void;
}) {
  const T = useRef(winTimeline(stars)).current;
  // The wallet balance is captured once: the win was already recorded, so the
  // pill starts at (new − reward) and counts to the new total exactly once.
  const total = useRef(store.get().coins).current;
  const prog = useRef(new Animated.Value(0)).current; // JS-driven: feeds the text counters
  const rewardIn = useRef(new Animated.Value(0)).current;
  const walletPop = useRef(new Animated.Value(0)).current;
  const [ctaLive, setCtaLive] = useState(false);
  useEffect(() => {
    Animated.sequence([Animated.delay(T.reward), Animated.spring(rewardIn, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true })]).start();
    Animated.sequence([
      Animated.delay(T.count),
      Animated.timing(prog, { toValue: 1, duration: T.countMs, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
    // The wallet bounces as the coins land and once more when the tally settles.
    Animated.sequence([
      Animated.delay(T.reward + 640),
      Animated.timing(walletPop, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.spring(walletPop, { toValue: 0, friction: 4, tension: 220, useNativeDriver: true }),
      Animated.delay(Math.max(0, T.countMs - 450)),
      Animated.timing(walletPop, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.spring(walletPop, { toValue: 0, friction: 3.5, tension: 200, useNativeDriver: true }),
    ]).start();
    const live = setTimeout(() => setCtaLive(true), T.cta + 120);
    return () => clearTimeout(live);
  }, [T, prog, rewardIn, walletPop]);
  // Measure where the chest sits so the coins arc exactly into the wallet.
  const [cardW, setCardW] = useState(300);
  const [chest, setChest] = useState<{ x: number; y: number } | null>(null);
  const wallet = { x: cardW - 16 - 40, y: 16 + 16 };
  const parText = moves < par ? "Par beaten!" : moves === par ? "Perfect par!" : null;
  const digits = (n: number) => String(n).length;
  return (
    <OverlayCard colors={colors} confetti onCardLayout={(w) => setCardW(w)}>
      <View style={[styles.winRibbon, { backgroundColor: colors.paint, borderColor: colors.paintDeep }]}>
        <View pointerEvents="none" style={styles.pillGloss} />
        <Txt weight="display" size={25} color="#FFFFFF" style={styles.outlined} numberOfLines={1} adjustsFontSizeToFit>Level Complete!</Txt>
      </View>
      <View style={styles.walletSlot}>
        <Animated.View style={[styles.wallet, { backgroundColor: colors.bg, transform: [{ scale: walletPop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }] }]}>
          <Coin size={16} />
          <CountText prog={prog} from={total - coins} to={total} size={15} color={colors.text} width={10 + digits(total) * 10} showAtRest />
        </Animated.View>
      </View>
      <View style={styles.starStage}>
        <SunBurst delay={T.STAR0} />
        <AnimatedStars stars={stars} start={T.STAR0} step={T.STEP} />
      </View>
      {parText ? <ParBanner text={parText} delay={T.par} /> : <Txt weight="display" size={14} color={colors.subtext}>{moves} moves · par {par}</Txt>}
      <Animated.View
        style={[
          styles.rewardRow,
          {
            opacity: rewardIn.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
            transform: [{ scale: rewardIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
        onLayout={(e) => {
          const l = e.nativeEvent.layout;
          setChest({ x: l.x + 20, y: l.y + l.height / 2 });
        }}
      >
        <View>
          <Image source={art.ui_reward_chest} style={styles.rewardChest} resizeMode="contain" />
          {chest && <CoinFly to={{ x: wallet.x - chest.x, y: wallet.y - chest.y }} start={T.reward + 80} />}
        </View>
        <CountText prog={prog} from={0} to={coins} prefix="+" size={24} color={colors.accent} width={16 + (digits(coins) + 1) * 15} />
        <Coin size={22} />
        <DancingBrush delay={T.reward} />
      </Animated.View>
      {dailyBonus > 0 && (
        <Txt weight="display" size={14} color={colors.paintDeep}>Daily Paint bonus +{dailyBonus} included</Txt>
      )}
      {hasNext ? (
        <BreathingIn delay={T.cta} live={ctaLive}>
          <BigButton label="Next Level" colors={colors} onPress={onNext} highlight />
        </BreathingIn>
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

/** Slow-turning light rays behind the stars (results card only, never the board). */
function SunBurst({ delay = 200 }: { delay?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const show = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(show, { toValue: 1, duration: 500, delay, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, show, delay]);
  return (
    <Animated.Image
      pointerEvents="none"
      source={art.fx_sunburst}
      resizeMode="contain"
      style={{
        position: "absolute",
        width: 230,
        height: 230,
        opacity: show,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }, { scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }}
    />
  );
}

/** Gold "Par beaten!" ribbon that slams in after the stars land. */
function ParBanner({ text, delay }: { text: string; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 4, tension: 170, useNativeDriver: true })]).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        styles.parBanner,
        {
          opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }, { rotate: "-3deg" }],
        },
      ]}
    >
      <View pointerEvents="none" style={styles.pillGloss} />
      <Txt weight="display" size={16} color="#5A3300">★ {text} ★</Txt>
    </Animated.View>
  );
}

/** The brush mascot's victory dance beside the reward: hop, wiggle, squash. */
function DancingBrush({ delay = 500 }: { delay?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 3, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 4, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const start = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(start); loop.stop(); };
  }, [t, delay]);
  return (
    <Animated.Image
      source={art.character_brush_mascot}
      resizeMode="contain"
      style={{
        width: 40,
        height: 60,
        marginLeft: 6,
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: [0, -14, 0, -14, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: ["0deg", "-14deg", "0deg", "14deg", "0deg"] }) },
          { scaleY: t.interpolate({ inputRange: [0, 0.15, 1, 1.85, 2, 2.15, 3, 3.85, 4], outputRange: [0.85, 1.08, 1, 1.05, 0.85, 1.08, 1, 1.05, 0.85] }) },
        ],
      }}
    />
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

/** Hint with too few coins: opt-in rewarded ad for a free hint, or a clear
 *  "no ad right now" note with how to earn coins instead — never a dead tap. */
function HintOffer({ colors, cost, adReady, onWatch, onClose }: { colors: Colors; cost: number; adReady: boolean; onWatch: () => void; onClose: () => void }) {
  return (
    <OverlayCard colors={colors}>
      <Image source={art.icon_hint} style={{ width: 56, height: 56 }} resizeMode="contain" />
      <Txt weight="display" size={24} color={colors.text}>Need a hint?</Txt>
      <Txt weight="label" size={14} color={colors.subtext} style={{ textAlign: "center" }}>
        {adReady
          ? `A hint costs ${cost} coins. Watch a short video to get this one free.`
          : `A hint costs ${cost} coins. No video is available right now — try again in a moment, or earn coins by painting levels (+10 per star).`}
      </Txt>
      {adReady && <BigButton label="Watch video · free hint" colors={colors} onPress={onWatch} highlight />}
      <BigButton label="Not now" colors={colors} onPress={onClose} small />
    </OverlayCard>
  );
}

function BigButton({ label, colors, onPress, highlight, small }: { label: string; colors: Colors; onPress: () => void; highlight?: boolean; small?: boolean }) {
  const face = highlight ? colors.paint : "#EEF1F8";
  const lip = highlight ? colors.paintDeep : "#C3C9D9";
  return (
    <PressableScale onPress={onPress} rippleColor={highlight ? "#FFFFFF" : colors.paint} style={[styles.bigBtnOuter, { backgroundColor: lip }]}>
      <View style={[styles.bigBtn, small && styles.bigBtnSmall, { backgroundColor: face }]}>
        <View pointerEvents="none" style={styles.pillGloss} />
        <Txt weight="display" size={small ? 16 : 20} color={highlight ? "#FFFFFF" : colors.text} style={highlight ? styles.outlinedSmall : undefined} numberOfLines={1} adjustsFontSizeToFit>{label}</Txt>
      </View>
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

/** How many tiles a stroke in `dir` would roll from the brush right now (turn pads included). */
function strokeLength(engine: PathEngine, dir: Direction): number {
  return engine.peek(dir).length;
}

/** Bare tiles a stroke in `dir` would paint (each tile once, bends included). */
function measureGain(engine: PathEngine, dir: Direction): number {
  return new Set(engine.peek(dir).filter((p) => !engine.isPainted(p.x, p.y)).map((p) => `${p.x},${p.y}`)).size;
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
  statsRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginHorizontal: 14, marginTop: 10, paddingVertical: 8, paddingHorizontal: 8 },
  stat: { alignItems: "center", minWidth: 64 },
  statFloat: { position: "absolute", top: -6, alignSelf: "center" },
  statLabel: { textTransform: "uppercase", letterSpacing: 1.5, marginTop: 1 },

  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 8 },
  coachDot: { position: "absolute", width: 46, height: 46, borderRadius: 23, borderWidth: 4, backgroundColor: "#FFFFFF" },
  coachTrailDot: { position: "absolute", width: 26, height: 26, borderRadius: 13 },

  hintBanner: { marginHorizontal: 24, marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },

  actions: { flexDirection: "row", justifyContent: "center", gap: 28, paddingHorizontal: 16, paddingTop: 10 },
  action: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, minWidth: 96, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 1 },

  flash: { ...FILL, backgroundColor: "#FFFFFF" },
  overlay: { ...FILL, alignItems: "center", justifyContent: "center", padding: 24 },
  overlayDim: { ...FILL, backgroundColor: "rgba(20,24,40,0.55)" },
  card: { width: "100%", maxWidth: 340, borderRadius: 28, paddingVertical: 30, paddingHorizontal: 26, gap: 16, alignItems: "center", overflow: "hidden" },
  cardRow: { flexDirection: "row", gap: 12 },
  starRow: { flexDirection: "row", gap: 10 },
  coinFly: { position: "absolute", left: 20, top: 20, width: 0, height: 0, alignItems: "center", justifyContent: "center" },
  walletSlot: { position: "absolute", top: 16, right: 16 },
  wallet: { flexDirection: "row", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, minWidth: 64, alignItems: "center" },
  bloomWrap: { alignItems: "center", justifyContent: "center" },
  winHalo: { position: "absolute", top: -10, left: -10, right: -10, bottom: -10, borderRadius: 26 },
  winRim: { position: "absolute", top: -3, left: -3, right: -3, bottom: -3, borderRadius: 21, borderWidth: 4 },
  bloomDisc: { position: "absolute", width: 140, height: 140, borderRadius: 70 },
  bloomRing: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 8 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardChest: { width: 40, height: 40 },
  bigStar: { width: 62, height: 62, marginTop: 14 },
  bigStarMid: { width: 78, height: 78 },
  bigBtnOuter: { borderRadius: 20, paddingBottom: 5 },
  bigBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 20, minWidth: 200, alignItems: "center", overflow: "hidden" },
  bigBtnSmall: { minWidth: 110, paddingHorizontal: 18, paddingVertical: 11 },
  outlined: { textShadowColor: "rgba(10,12,35,0.7)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  outlinedSmall: { textShadowColor: "rgba(10,12,35,0.65)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  pillGloss: { position: "absolute", left: 6, right: 6, top: 3, height: "42%", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)" },
  backPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 8, paddingRight: 12, minHeight: 46, borderRadius: 16, borderWidth: 2, borderTopWidth: 3, overflow: "hidden" },
  backIcon: { width: 18, height: 18 },
  titleRibbon: { flex: 1, alignItems: "center", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16, borderWidth: 2, overflow: "hidden", minHeight: 46, justifyContent: "center" },
  ribbonKicker: { textTransform: "uppercase", letterSpacing: 1.4 },
  statDivider: { width: 2, alignSelf: "stretch", borderRadius: 1, opacity: 0.6 },
  timedStats: { flexDirection: "row", gap: 18 },
  callout: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 18, marginTop: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 2, borderColor: "#FFFFFF" },
  calloutIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  calloutText: { flex: 1 },
  winRibbon: { alignSelf: "stretch", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderBottomWidth: 5, overflow: "hidden", marginTop: 26 },
  starStage: { alignItems: "center", justifyContent: "center", height: 100, alignSelf: "stretch" },
  parBanner: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: "#FFC93C", borderWidth: 2, borderColor: "#FFFFFF", overflow: "hidden" },
});
