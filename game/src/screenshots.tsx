import { View, StyleSheet } from "react-native";
import { GameScreen, type ScreenshotConfig } from "./screens/GameScreen";
import type { Direction } from "./game/PathEngine";
import { store } from "./modules/store";

/**
 * Screenshot mode: the factory opens the app with <scheme>://shot/<id> on an
 * emulator and captures the screen for the Play Store listing. Every scene
 * renders a REAL state of the game through the real GameScreen — we only seed
 * progress and drive a few real swipes, never mock-ups. Ads/billing are off.
 */

/** Optimal swipe sequence that fully fills an R-row horizontal snake. */
function snakeSolution(rows: number): Direction[] {
  const moves: Direction[] = ["right"];
  for (let r = 1; r < rows; r++) {
    moves.push("down");
    moves.push(r % 2 === 1 ? "left" : "right");
  }
  return moves;
}

/** Seed believable progress so the map and HUD look lived-in. Idempotent. */
function seedDemo(): void {
  const stars: Record<number, number> = {};
  for (let id = 1; id <= 18; id++) stars[id] = 3;
  for (let id = 19; id <= 21; id++) stars[id] = 2;
  store.set({ coins: 1240, level: 22, stars });
}

const SCENES: Record<string, ScreenshotConfig> = {
  // Progress map across the chapters.
  map: { view: "map" },
  // A color-sequencing level mid-solve: switches painted, gates still ahead.
  solve: { view: "play", levelId: 16, moves: snakeSolution(5).slice(0, 4) },
  // A triple-gate level showing the switch/gate iconography.
  gates: { view: "play", levelId: 17, moves: snakeSolution(5).slice(0, 3) },
  // The celebratory win screen with three stars over a completed board.
  win: { view: "play", levelId: 6, moves: snakeSolution(5), showWin: true },
  // A sprawling master maze part-painted.
  master: { view: "play", levelId: 32, moves: snakeSolution(6).slice(0, 5) },
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

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#0b0c10" } });
