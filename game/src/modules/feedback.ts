import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { store } from "./store";

/**
 * Tactile + audio feedback layer. Every interaction routes through here so the
 * Settings sound/haptics toggles are honoured in one place. Players are created
 * lazily and every call is wrapped so a missing audio route or haptics engine
 * can never interrupt gameplay (or the screenshot-capture launch).
 */
type Cue = "move" | "tap" | "win" | "fail";

const SOURCES: Record<Cue, number> = {
  move: require("../assets/sfx/move.wav"),
  tap: require("../assets/sfx/tap.wav"),
  win: require("../assets/sfx/win.wav"),
  fail: require("../assets/sfx/fail.wav"),
};

const players: Partial<Record<Cue, AudioPlayer>> = {};

function soundOn(): boolean {
  return store.get().settings.sound;
}
function hapticsOn(): boolean {
  return store.get().settings.haptics && Platform.OS !== "web";
}

function play(cue: Cue): void {
  if (!soundOn()) return;
  try {
    let p = players[cue];
    if (!p) {
      p = createAudioPlayer(SOURCES[cue]);
      p.volume = 0.6;
      players[cue] = p;
    }
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // audio unavailable — silently ignore, haptics still fire
  }
}

function buzz(fn: () => Promise<void>): void {
  if (!hapticsOn()) return;
  fn().catch(() => {});
}

export const feedback = {
  /** A roller swipe that painted tiles. */
  move(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    play("move");
  },
  /** A generic UI button / selection. */
  tap(): void {
    buzz(() => Haptics.selectionAsync());
    play("tap");
  },
  /** A gate opened — a touch more emphasis than a normal move. */
  gate(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    play("tap");
  },
  /** Level cleared. */
  win(): void {
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    play("win");
  },
  /** Level failed (timer). */
  fail(): void {
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    play("fail");
  },
};
