import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import {
  Background, Burst, Confetti, FailPopup, GameButton, Panel, TopBar, TutorialHand, WinPopup, FloatingText, feedback, fonts, palette, springs, useShake,
} from "../ui";
import { LEVELS, movesAllowed, press, solved, starsFor } from "../game/lights";
import { store } from "../modules/store";
import { ads } from "../modules/ads";
import { analytics } from "../modules/analytics";
import { review } from "../modules/review";
import { useBottomInset } from "../modules/layout";
import { qa, reportNext } from "../modules/qa";

/**
 * One tile. Flips ripple outward from the tapped tile (`delay` grows with distance), the tapped tile
 * fires a ring pulse (`pulse` changes), and a win plays a wave across the board (`wave` > 0).
 */
function Tile({ lit, size, onPress, hint, delay, pulse, pulseDelay = 0, wave }: {
  lit: boolean; size: number; onPress: () => void; hint: boolean; delay: number; pulse: number; pulseDelay?: number; wave: number;
}) {
  const s = useSharedValue(1);
  const glow = useSharedValue(lit ? 1 : 0);
  const ring = useSharedValue(0);
  useEffect(() => {
    glow.value = withDelay(delay, withTiming(lit ? 1 : 0, { duration: 200 }));
    // Squash, overshoot, settle — reads as a physical flip.
    s.value = withDelay(delay, withSequence(withTiming(0.86, { duration: 60 }), withTiming(1.08, { duration: 110 }), withSpring(1, springs.pop)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit]);
  useEffect(() => {
    if (!pulse) return;
    ring.value = 0;
    ring.value = withDelay(pulseDelay, withTiming(1, { duration: 420 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse, ring]);
  useEffect(() => {
    if (wave <= 0) return;
    s.value = withDelay(wave, withSequence(withTiming(1.12, { duration: 120 }), withSpring(1, springs.pop)));
  }, [wave, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const litStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - ring.value, transform: [{ scale: 0.9 + ring.value * 0.45 }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (s.value = withTiming(0.92, { duration: 50 }))}
      onPressOut={() => (s.value = withSpring(1, springs.pop))}
      style={{ width: size, height: size, padding: 5 }}
    >
      <Animated.View style={[styles.tile, style, hint && styles.hint]}>
        <LinearGradient colors={["#3B2F86", "#271C63"]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, litStyle]}>
          <LinearGradient colors={["#FFF1A8", "#FFC23D", "#FF9F1C"]} style={StyleSheet.absoluteFill} />
          <View style={styles.tileShine} />
        </Animated.View>
      </Animated.View>
      {pulse ? <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} /> : null}
    </Pressable>
  );
}

function Punch({ value, children }: { value: number; children: React.ReactNode }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (value) s.value = withSequence(withTiming(1.22, { duration: 90 }), withSpring(1, springs.pop));
  }, [value, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** One level: board, moves, undo, hint (rewarded), win/fail flow. */
export function GameScreen({ levelNumber, onExit, onSettings, onNextLevel, demo }: {
  levelNumber: number; onExit: () => void; onSettings: () => void; onNextLevel: (n: number) => void;
  /** Screenshot mode: replay these taps on mount and optionally show the win popup. */
  demo?: { taps: number[]; win?: boolean };
}) {
  const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelNumber - 1))];
  const { width } = useWindowDimensions();
  const bottomInset = useBottomInset();
  // The board gets whatever space is left between the HUD and the buttons (small phones → smaller,
  // tablets → bigger). Whole-pixel tiles: fractional widths make a flex row wrap.
  const [area, setArea] = useState({ y: 0, h: 0 });
  const fit = Math.min(width - 48, 560, area.h - 32);
  const tile = Math.max(40, Math.floor(fit / level.size));
  const boardSize = tile * level.size;
  const [board, setBoard] = useState(level.start);
  const [history, setHistory] = useState<boolean[][]>([]);
  const [moves, setMoves] = useState(0);
  const [result, setResult] = useState<"win" | "fail" | null>(null);
  const [hintIdx, setHintIdx] = useState<number | null>(null);
  const [floater, setFloater] = useState(0);
  const [lastTap, setLastTap] = useState<{ i: number; n: number }>({ i: -1, n: 0 });
  const [winWave, setWinWave] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; n: number } | null>(null);
  const boardRef = useRef<React.ComponentRef<typeof View>>(null);
  // Board intro: rises and grows into place from 90 % / 50 % opacity — never from 0 (a blank board frame) and never a
  // Reanimated `entering` (it stuck blank on Android and skewed measureInWindow while it ran, 2026-10-20..27).
  const intro = useSharedValue(0);
  const introStyle = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * intro.value, transform: [{ translateY: (1 - intro.value) * 18 }, { scale: 0.9 + 0.1 * intro.value }] }));
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const { style: shakeStyle, shake } = useShake();
  const allowed = movesAllowed(level.par);
  const stars = starsFor(moves, level.par);
  const reward = 10 + stars * 10;

  useEffect(() => {
    setBoard(level.start); setHistory([]); setMoves(0); setResult(null); setHintIdx(null); setTaps([]); setWinWave(false);
    analytics.track("level_start", { level: level.number });
    if (demo) {
      let b = level.start;
      for (const t of demo.taps) b = press(b, level.size, t);
      setBoard(b); setTaps(demo.taps); setMoves(demo.taps.length);
      if (demo.win) setTimeout(() => setResult("win"), 300);
    }
  }, [level, demo]);

  // Presses still needed = solution ⊕ tiles pressed an odd number of times
  // (pressing twice cancels) — always a valid path to solved, even off-script.
  const [taps, setTaps] = useState<number[]>([]);
  const remaining = useMemo(() => {
    const odd = new Set<number>();
    for (const t of taps) (odd.has(t) ? odd.delete(t) : odd.add(t));
    const need = new Set(level.solution);
    for (const t of odd) (need.has(t) ? need.delete(t) : need.add(t));
    return [...need];
  }, [level, taps]);

  // Board geometry in this screen's coordinates (border 2 + padding 10 around the tiles).
  const boardLeft = (width - boardSize) / 2;
  const boardTop = area.y + (area.h - boardSize - 24) / 2 + 12;
  const cellCenter = (i: number) => ({ x: boardLeft + (i % level.size) * tile + tile / 2, y: boardTop + Math.floor(i / level.size) * tile + tile / 2 });

  useEffect(() => {
    if (area.h <= 0) return;
    intro.value = 0;
    intro.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.4)) });
  }, [area.h > 0, level, intro]); // eslint-disable-line react-hooks/exhaustive-deps

  // QA level replay (src/modules/qa.ts): report the solver's next touch once the board is laid out and after every
  // accepted move — measured FRESH at report time (a position cached during a transition skews every touch), after
  // the intro has settled (450 ms) and with move animations short enough that the next report comes well within QA's
  // ~3 s accept window.
  useEffect(() => {
    if (qa.level == null || area.h <= 0 || result) return;
    const id = setTimeout(() => {
      if (solved(board)) return reportNext(level.number, null);
      const next = remaining[0];
      if (next === undefined) return;
      boardRef.current?.measureInWindow((x, y) => {
        reportNext(level.number, { x: x + (next % level.size) * tile + tile / 2, y: y + Math.floor(next / level.size) * tile + tile / 2 });
      });
    }, moves === 0 ? 450 : 300);
    return () => clearTimeout(id);
  }, [board, area.h, tile, result]); // eslint-disable-line react-hooks/exhaustive-deps

  function tap(i: number) {
    if (result) return;
    feedback("pop", "light");
    const next = press(board, level.size, i);
    // Accepted move: on-device QA checks that every one of these visibly changes the board.
    analytics.qa("move", { level: level.number });
    // Per-move juice at the touched tile (ring + sparks), on top of the tile's own squash and the flip ripple.
    setBurst((b) => ({ ...cellCenter(i), n: (b?.n ?? 0) + 1 }));
    setHistory((h) => [...h, board]);
    setTaps((t) => [...t, i]);
    setBoard(next);
    setLastTap((t) => ({ i, n: t.n + 1 }));
    setMoves((m) => m + 1);
    setHintIdx(null);
    if (solved(next)) {
      setFloater((f) => f + 1);
      setWinWave(true);
      flash.value = withSequence(withDelay(200, withTiming(0.55, { duration: 90 })), withTiming(0, { duration: 420 }));
      feedback("success", "success");
      setTimeout(() => {
        setResult("win");
        const prev = store.get().stars ?? {};
        store.set({
          stars: { ...prev, [level.id]: Math.max(prev[level.id] ?? 0, starsFor(moves + 1, level.par)) },
          coins: store.get().coins + reward,
          level: Math.max(store.get().level, level.number + 1),
        });
        analytics.track("level_complete", { level: level.number, moves: moves + 1 });
        review.levelWon(level.number); // Play in-app review at a happy moment (gated: level >= 3, 30-day cooldown, never in QA)
      }, 1100); // let the board celebrate before the popup
    } else if (moves + 1 >= allowed) {
      shake();
      feedback("error", "error");
      setTimeout(() => setResult("fail"), 350);
      analytics.track("level_fail", { level: level.number });
    }
  }

  function undo() {
    const prev = history[history.length - 1];
    if (!prev || result) return;
    feedback("move", "select");
    setBoard(prev);
    setHistory((h) => h.slice(0, -1));
    setTaps((t) => t.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
  }

  const showTutorial = level.number === 1 && moves === 0 && !result;
  const firstHint = remaining[0];

  return (
    <View style={styles.root}>
      <Background />
      <TopBar title={`Level ${level.number}`} onBack={onExit} onSettings={onSettings} />
      <View style={styles.statsRow}>
        <Panel dark style={styles.stat}><Text style={styles.statLabel}>MOVES</Text><Punch value={moves}><Text style={[styles.statValue, allowed - moves <= 2 && !result && styles.statWarn]}>{moves}/{allowed}</Text></Punch></Panel>
        <Panel dark style={styles.stat}><Text style={styles.statLabel}>PAR ⭐⭐⭐</Text><Text style={styles.statValue}>{level.par}</Text></Panel>
      </View>
      <Text style={styles.goal}>Light up every tile</Text>
      {/* Hints hide once the level ends — a result popup must never overlap/clip a tutorial banner. */}
      {level.number <= 2 && !result ? (
        <Text style={styles.coach}>Tap a tile: it flips itself and its neighbours</Text>
      ) : null}
      <View style={styles.boardArea} onLayout={(e) => setArea({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}>
        {/* Render only once the free space is measured (tiles sized to fit from their first frame), then the board
            intro plays on a wrapper; QA touches are measured on the inner tile grid (boardRef). */}
        {area.h > 0 ? (
        <Animated.View style={introStyle}>
        <Animated.View style={[styles.boardWrap, { width: boardSize + 24 }, shakeStyle]}>
          <View ref={boardRef} collapsable={false}>
          {Array.from({ length: level.size }, (_, r) => (
            <View key={r} style={styles.row}>
              {Array.from({ length: level.size }, (_, c) => {
                const i = r * level.size + c;
                const dist = lastTap.i < 0 ? 0 : Math.abs(r - Math.floor(lastTap.i / level.size)) + Math.abs(c - (lastTap.i % level.size));
                return (
                  <Tile
                    key={i}
                    lit={board[i]}
                    size={tile}
                    hint={hintIdx === i}
                    delay={dist * 55}
                    pulse={dist <= 1 && lastTap.i >= 0 ? lastTap.n : 0}
                    pulseDelay={dist * 70}
                    wave={winWave ? 250 + (r + c) * 70 : 0}
                    onPress={() => tap(i)}
                  />
                );
              })}
            </View>
          ))}
          </View>
          <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
        </Animated.View>
        </Animated.View>
        ) : null}
      </View>
      {showTutorial && firstHint !== undefined && area.h > 0 ? (
        <TutorialHand
          from={cellCenter(firstHint)}
        />
      ) : null}
      {burst ? <Burst key={burst.n} x={burst.x} y={burst.y} /> : null}
      {floater ? (
        <FloatingText key={floater} text="Brilliant!" x={width / 2} y={area.y + (area.h - boardSize) / 2 - 6} duration={1500} />
      ) : null}
      <Confetti trigger={winWave ? floater : 0} count={60} origin={{ x: width / 2, y: area.y + area.h / 2 }} />
      <Confetti trigger={winWave ? floater + 1000 : 0} count={50} origin={{ x: width / 2, y: area.y + area.h * 0.3 }} />
      <View style={[styles.actions, { paddingBottom: bottomInset + 12 }]}>
        <GameButton style={{ flex: 1 }} variant="light" label="↶ Undo" onPress={undo} disabled={!history.length} />
        <GameButton
          style={{ flex: 1 }}
          variant="secondary"
          label="💡 Hint"
          onPress={() => ads.showRewarded(() => setHintIdx(firstHint ?? null)) || setHintIdx(firstHint ?? null)}
        />
      </View>
      <WinPopup
        visible={result === "win"}
        stars={stars}
        coins={reward}
        onNext={() => {
          ads.showInterstitial();
          onNextLevel(level.number + 1);
        }}
        onReplay={() => { setResult(null); setBoard(level.start); setHistory([]); setMoves(0); setTaps([]); }}
        onMap={onExit}
      />
      <FailPopup
        visible={result === "fail"}
        onRetry={() => { setResult(null); setBoard(level.start); setHistory([]); setMoves(0); setTaps([]); }}
        onContinue={() => ads.showRewarded(() => { setResult(null); setMoves((m) => Math.max(0, m - 5)); })}
        onMap={onExit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 6 },
  stat: { flex: 1 },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, textAlign: "center" },
  statValue: { fontFamily: fonts.display, fontSize: 28, color: "#fff", textAlign: "center" },
  goal: { fontFamily: fonts.displayMedium, fontSize: 18, color: "rgba(255,255,255,0.85)", textAlign: "center", marginTop: 22 },
  boardArea: { flex: 1, justifyContent: "center" },
  flash: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 30, backgroundColor: "#FFFFFF" },
  coach: { fontFamily: fonts.body, fontSize: 15, color: "#FFE08A", textAlign: "center", marginTop: 6, paddingHorizontal: 24 },
  statWarn: { color: "#FF8A8A" },
  ring: { position: "absolute", left: 5, top: 5, right: 5, bottom: 5, borderRadius: 18, borderWidth: 3, borderColor: "#FFF1A8" },
  row: { flexDirection: "row" },
  boardWrap: { alignSelf: "center", padding: 10, borderRadius: 30, backgroundColor: "rgba(10,6,40,0.55)", borderWidth: 2, borderColor: "rgba(255,255,255,0.12)" },
  tile: { flex: 1, borderRadius: 18, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.18)" },
  tileShine: { position: "absolute", top: 6, left: 8, right: 8, height: "30%", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.45)" },
  hint: { borderColor: palette.secondary, borderWidth: 4 },
  actions: { flexDirection: "row", gap: 14, paddingHorizontal: 20, paddingTop: 10 },
});
