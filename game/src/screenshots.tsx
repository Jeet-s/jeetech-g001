import { View, StyleSheet } from "react-native";
import { GameScreen, type ScreenshotConfig } from "./screens/GameScreen";
import type { Direction } from "./game/PathEngine";
import { levelById } from "./game/levels";
import { store } from "./modules/store";

/** First `frac` of a level's proven solution — a believable mid-solve state. */
function partial(levelId: number, frac: number): Direction[] {
  const sol = levelById(levelId)?.solution ?? [];
  return sol.slice(0, Math.max(1, Math.floor(sol.length * frac)));
}
/** A level's full solution — drives the board to a completed win state. */
function full(levelId: number): Direction[] {
  return levelById(levelId)?.solution ?? [];
}

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> on an
 * emulator and captures the screen for the Play Store listing. Every scene
 * renders a REAL state of the game through the real GameScreen — we only seed
 * progress and drive a few real swipes, never mock-ups. Ads/billing are off.
 */

/** Seed believable progress so the map and HUD look lived-in. Idempotent. */
function seedDemo(): void {
  const stars: Record<number, number> = {};
  for (let id = 1; id <= 24; id++) stars[id] = 3;
  for (let id = 25; id <= 32; id++) stars[id] = 2;
  store.set({ coins: 1240, level: 33, stars, tutorialDone: true });
}

const SCENES: Record<string, ScreenshotConfig> = {
  // The title screen: logo, the mascot painting its hero board, chapter progress, Play.
  home: { view: "home" },
  // Triple-gate maze mid-solve: creamy paint trail, switches painted, gates ahead.
  solve: { view: "play", levelId: 16, moves: partial(16, 0.5) },
  // A gate + crumble level showing the sprite iconography and hazards.
  gates: { view: "play", levelId: 22, moves: partial(22, 0.45) },
  // The celebratory win screen with three stars over a completed board.
  win: { view: "play", levelId: 14, moves: full(14), showWin: true },
  // The chapter progress map.
  map: { view: "map" },
  // A sprawling master maze part-painted.
  master: { view: "play", levelId: 36, moves: partial(36, 0.65) },
};

export function ScreenshotScene({ id }: { id: string }) {
  seedDemo();
  const config = SCENES[id] ?? SCENES.solve;
  return (
    <View style={styles.root}>
      <GameScreen screenshot={config} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#E7EDF7" } });
