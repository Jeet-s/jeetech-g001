import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  Dimensions,
  ScrollView,
} from "react-native";
import { PathEngine, type Direction } from "../game/PathEngine";
import { LEVELS, CHAPTERS, levelById, TOTAL_LEVELS } from "../game/levels";
import { makeColors, type Colors } from "../game/theme";
import { analytics } from "../modules/analytics";
import { ads } from "../modules/ads";
import { store } from "../modules/store";
import { SettingsModal } from "./SettingsModal";

const HINT_COST = 40;
const SWIPE_THRESHOLD = 18;

type ViewMode = "map" | "play";

export function GameScreen({ onOpenShop }: { onOpenShop: () => void }) {
  const [snap, setSnap] = useState(store.get());
  useEffect(() => store.subscribe(setSnap), []);

  const colors = useMemo(
    () => makeColors(snap.settings.palette, snap.settings.highContrast),
    [snap.settings.palette, snap.settings.highContrast]
  );

  const [view, setView] = useState<ViewMode>("map");
  const [levelId, setLevelId] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function openLevel(id: number) {
    setLevelId(id);
    setView("play");
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {view === "map" ? (
        <MapView
          colors={colors}
          onPlay={openLevel}
          onSettings={() => setSettingsOpen(true)}
          onOpenShop={onOpenShop}
        />
      ) : (
        <PlayView
          key={levelId}
          levelId={levelId}
          colors={colors}
          onExit={() => setView("map")}
          onSettings={() => setSettingsOpen(true)}
          onGoToLevel={openLevel}
        />
      )}
      <SettingsModal
        visible={settingsOpen}
        colors={colors}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}

/* ------------------------------- Map / levels ------------------------------ */

function MapView({
  colors,
  onPlay,
  onSettings,
  onOpenShop,
}: {
  colors: Colors;
  onPlay: (id: number) => void;
  onSettings: () => void;
  onOpenShop: () => void;
}) {
  const state = store.get();
  return (
    <View style={styles.flex}>
      <View style={styles.mapHeader}>
        <Text style={[styles.brand, { color: colors.text }]}>Path Painter</Text>
        <Text style={[styles.subtle, { color: colors.subtext }]}>
          ⭐ {store.totalStars()} / {TOTAL_LEVELS * 3} · 🪙 {state.coins}
        </Text>
        <View style={styles.mapButtons}>
          <Pressable
            style={[styles.pill, { backgroundColor: colors.surface }]}
            onPress={onOpenShop}
          >
            <Text style={[styles.pillText, { color: colors.accent }]}>🛍 Shop</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, { backgroundColor: colors.surface }]}
            onPress={onSettings}
          >
            <Text style={[styles.pillText, { color: colors.accent }]}>⚙ Settings</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.mapScroll}>
        {CHAPTERS.map((chapter, ci) => {
          const chapterLevels = LEVELS.filter((l) => l.chapter === ci + 1);
          if (chapterLevels.length === 0) return null;
          return (
            <View key={chapter} style={styles.chapterBlock}>
              <Text style={[styles.chapterTitle, { color: colors.subtext }]}>
                Chapter {ci + 1} · {chapter}
              </Text>
              <View style={styles.levelGrid}>
                {chapterLevels.map((lvl) => {
                  const unlocked = state.level >= lvl.id;
                  const stars = state.stars[lvl.id] ?? 0;
                  return (
                    <Pressable
                      key={lvl.id}
                      disabled={!unlocked}
                      onPress={() => onPlay(lvl.id)}
                      style={[
                        styles.levelNode,
                        {
                          backgroundColor: unlocked ? colors.surface : colors.wall,
                          borderColor: unlocked ? colors.paint : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.levelNum,
                          { color: unlocked ? colors.text : colors.subtext },
                        ]}
                      >
                        {unlocked ? lvl.id : "🔒"}
                      </Text>
                      <Text style={styles.levelStars}>
                        {unlocked ? "★".repeat(stars) + "☆".repeat(3 - stars) : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* --------------------------------- Play ----------------------------------- */

type Overlay =
  | { kind: "none" }
  | { kind: "won"; stars: number; coins: number }
  | { kind: "lost" };

function PlayView({
  levelId,
  colors,
  onExit,
  onSettings,
  onGoToLevel,
}: {
  levelId: number;
  colors: Colors;
  onExit: () => void;
  onSettings: () => void;
  onGoToLevel: (id: number) => void;
}) {
  const level = levelById(levelId)!;
  const engineRef = useRef<PathEngine>(new PathEngine(level));
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [timeLeft, setTimeLeft] = useState(level.timeLimitSeconds);
  const [hintDir, setHintDir] = useState<Direction | null>(null);

  useEffect(() => {
    analytics.track("level_start", { level: levelId, chapter: level.chapter });
  }, [levelId, level.chapter]);

  // Countdown timer for timed levels.
  useEffect(() => {
    if (level.timeLimitSeconds <= 0) return;
    if (overlay.kind !== "none") return;
    if (timeLeft <= 0) {
      engineRef.current.timeUp();
      analytics.track("level_fail", { level: levelId, reason: "timer" });
      setOverlay({ kind: "lost" });
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, overlay.kind, level.timeLimitSeconds, levelId]);

  function applyMove(dir: Direction) {
    const engine = engineRef.current;
    if (engine.status !== "playing" || overlay.kind !== "none") return;
    setHintDir(null);
    const status = engine.move(dir);
    rerender();
    if (status === "won") finishWin();
  }

  function finishWin() {
    const engine = engineRef.current;
    const stars = engine.starsForMoves();
    const coins = 10 + stars * 10;
    store.recordWin(levelId, stars, coins);
    analytics.track("level_complete", {
      level: levelId,
      stars,
      moves: engine.moves,
      coins,
    });
    setOverlay({ kind: "won", stars, coins });
    ads.showInterstitial();
  }

  function restart() {
    engineRef.current.reset();
    setHintDir(null);
    setOverlay({ kind: "none" });
    setTimeLeft(level.timeLimitSeconds);
    analytics.track("level_start", { level: levelId, chapter: level.chapter });
    rerender();
  }

  function doUndo() {
    engineRef.current.undo();
    setHintDir(null);
    rerender();
  }

  function doReset() {
    engineRef.current.reset();
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
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > SWIPE_THRESHOLD || Math.abs(g.dy) > SWIPE_THRESHOLD,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < SWIPE_THRESHOLD && Math.abs(g.dy) < SWIPE_THRESHOLD) return;
          if (Math.abs(g.dx) > Math.abs(g.dy)) {
            applyMove(g.dx > 0 ? "right" : "left");
          } else {
            applyMove(g.dy > 0 ? "down" : "up");
          }
        },
      }),
    [levelId, overlay.kind]
  );

  const engine = engineRef.current;
  const canSpendHint = store.get().coins >= HINT_COST;

  return (
    <View style={styles.flex}>
      {/* HUD */}
      <View style={styles.hud}>
        <Pressable onPress={onExit} style={[styles.pill, { backgroundColor: colors.surface }]}>
          <Text style={[styles.pillText, { color: colors.accent }]}>‹ Levels</Text>
        </Pressable>
        <Text style={[styles.levelName, { color: colors.text }]}>
          {levelId}. {level.name}
        </Text>
        <Pressable onPress={onSettings} style={[styles.pill, { backgroundColor: colors.surface }]}>
          <Text style={[styles.pillText, { color: colors.accent }]}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Fill" value={`${engine.fillPercent}%`} colors={colors} />
        <Stat label="Moves" value={`${engine.moves}`} colors={colors} />
        <Stat
          label="Par"
          value={`${level.parMoves}`}
          colors={colors}
        />
        {level.timeLimitSeconds > 0 && (
          <Stat label="Time" value={`${timeLeft}s`} colors={colors} />
        )}
      </View>

      {/* Board */}
      <View style={styles.boardWrap}>
        <Board engine={engine} colors={colors} pan={pan} hintDir={hintDir} />
      </View>

      <Text style={[styles.hintText, { color: colors.subtext }]}>
        Swipe to roll the brush — it paints until it hits a wall.
      </Text>

      {/* Action bar */}
      <View style={styles.actions}>
        <ActionButton
          label="Undo"
          disabled={!engine.canUndo() || overlay.kind !== "none"}
          onPress={doUndo}
          colors={colors}
        />
        <ActionButton label="Reset" onPress={doReset} colors={colors} />
        <ActionButton
          label={hintDir ? "Hint ✓" : canSpendHint ? `Hint ${HINT_COST}🪙` : "Hint (ad)"}
          disabled={!!hintDir || overlay.kind !== "none"}
          onPress={tryHint}
          colors={colors}
          highlight
        />
      </View>

      {/* Overlays */}
      {overlay.kind === "won" && (
        <WinOverlay
          colors={colors}
          stars={overlay.stars}
          coins={overlay.coins}
          hasNext={levelId < TOTAL_LEVELS}
          onNext={() => onGoToLevel(levelId + 1)}
          onReplay={restart}
          onMap={onExit}
        />
      )}
      {overlay.kind === "lost" && (
        <LoseOverlay
          colors={colors}
          canAddTime={ads.rewardedAvailable()}
          onAddTime={grantExtraTime}
          onRetry={restart}
          onMap={onExit}
        />
      )}
    </View>
  );
}

/* --------------------------------- Board ---------------------------------- */

function Board({
  engine,
  colors,
  pan,
  hintDir,
}: {
  engine: PathEngine;
  colors: Colors;
  pan: ReturnType<typeof PanResponder.create>;
  hintDir: Direction | null;
}) {
  const maxW = Math.min(Dimensions.get("window").width - 32, 360);
  const cell = Math.floor(maxW / engine.width);
  const arrow: Record<Direction, string> = { up: "↑", down: "↓", left: "←", right: "→" };

  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.board,
        { width: cell * engine.width, height: cell * engine.height, backgroundColor: colors.wall },
      ]}
    >
      {engine.tiles.map((row, y) => (
        <View key={y} style={styles.boardRow}>
          {row.map((tile, x) => {
            const painted = engine.isPainted(x, y);
            const isCursor = engine.cursorX === x && engine.cursorY === y;
            let bg = colors.wall;
            if (tile.type !== "wall") bg = painted ? colors.paint : colors.floor;

            return (
              <View
                key={x}
                style={{
                  width: cell,
                  height: cell,
                  padding: 1,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: bg,
                    borderRadius: tile.type === "wall" ? 0 : 6,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: painted ? 2 : 0,
                    borderColor: colors.paintEdge,
                  }}
                >
                  {tile.type === "switch" && (
                    <View
                      style={{
                        width: cell * 0.5,
                        height: cell * 0.5,
                        borderRadius: cell * 0.25,
                        backgroundColor: colors.switch,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[styles.marker, { fontSize: cell * 0.28 }]}>{tile.group}</Text>
                    </View>
                  )}
                  {tile.type === "gate" && (
                    <View
                      style={{
                        width: cell * 0.6,
                        height: cell * 0.6,
                        borderRadius: 3,
                        backgroundColor: painted ? "transparent" : colors.gate,
                        borderWidth: 2,
                        borderColor: colors.gate,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[styles.markerDark, { fontSize: cell * 0.3 }]}>
                        {(tile.group ?? "").toLowerCase()}
                      </Text>
                    </View>
                  )}
                  {tile.type === "crumble" && !painted && (
                    <Text style={{ color: colors.subtext, fontSize: cell * 0.4 }}>▞</Text>
                  )}
                  {isCursor && (
                    <View
                      style={{
                        position: "absolute",
                        width: cell * 0.42,
                        height: cell * 0.42,
                        borderRadius: cell * 0.21,
                        backgroundColor: colors.brush,
                      }}
                    />
                  )}
                  {isCursor && hintDir && (
                    <Text
                      style={{
                        position: "absolute",
                        color: colors.accent,
                        fontSize: cell * 0.6,
                        fontWeight: "900",
                      }}
                    >
                      {arrow[hintDir]}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------- Small bits -------------------------------- */

function Stat({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  colors,
  highlight,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: Colors;
  highlight?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        {
          backgroundColor: highlight ? colors.paint : colors.surface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text style={[styles.actionText, { color: highlight ? "#0b0c10" : colors.text }]}>
        {label}
      </Text>
    </Pressable>
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
  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Level Complete!</Text>
        <Text style={styles.bigStars}>
          {"★".repeat(stars)}
          <Text style={{ color: colors.subtext }}>{"☆".repeat(3 - stars)}</Text>
        </Text>
        <Text style={[styles.cardCoins, { color: colors.accent }]}>+{coins} 🪙</Text>
        {hasNext ? (
          <ActionButton label="Next Level" onPress={onNext} colors={colors} highlight />
        ) : (
          <Text style={[styles.subtle, { color: colors.subtext }]}>
            You finished every level — more coming soon!
          </Text>
        )}
        <ActionButton label="Replay" onPress={onReplay} colors={colors} />
        <ActionButton label="Level Map" onPress={onMap} colors={colors} />
      </View>
    </View>
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
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Time's Up!</Text>
        {canAddTime && (
          <ActionButton label="+30s (watch ad)" onPress={onAddTime} colors={colors} highlight />
        )}
        <ActionButton label="Retry" onPress={onRetry} colors={colors} />
        <ActionButton label="Level Map" onPress={onMap} colors={colors} />
      </View>
    </View>
  );
}

/* ------------------------------- Hint logic -------------------------------- */

/** Suggest the move that paints the most new tiles — never soft-locks. */
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

function measureGain(engine: PathEngine, dir: Direction): number {
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let x = engine.cursorX;
  let y = engine.cursorY;
  let gain = 0;
  // Walk the same rules the engine uses, counting unpainted tiles.
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  mapHeader: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8, alignItems: "center", gap: 6 },
  mapButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  brand: { fontSize: 30, fontWeight: "800" },
  subtle: { fontSize: 14, textAlign: "center" },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  pillText: { fontWeight: "700" },
  mapScroll: { padding: 16, paddingBottom: 100, gap: 20 },
  chapterBlock: { gap: 10 },
  chapterTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  levelNode: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  levelNum: { fontSize: 22, fontWeight: "800" },
  levelStars: { fontSize: 11, color: "#f5c451" },

  hud: { paddingTop: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  levelName: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  statsRow: { flexDirection: "row", justifyContent: "center", gap: 28, paddingVertical: 14 },
  stat: { alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },

  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  board: { borderRadius: 10, overflow: "hidden" },
  boardRow: { flexDirection: "row" },
  marker: { color: "#0b0c10", fontWeight: "900" },
  markerDark: { color: "#0b0c10", fontWeight: "900" },

  hintText: { textAlign: "center", fontSize: 13, paddingHorizontal: 24 },
  actions: { flexDirection: "row", justifyContent: "center", gap: 12, padding: 16, paddingBottom: 24 },
  action: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, minWidth: 92, alignItems: "center" },
  actionText: { fontWeight: "700", fontSize: 15 },

  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 340, borderRadius: 24, padding: 28, gap: 14, alignItems: "center" },
  cardTitle: { fontSize: 24, fontWeight: "800" },
  bigStars: { fontSize: 44, color: "#f5c451", letterSpacing: 4 },
  cardCoins: { fontSize: 20, fontWeight: "700" },
});
