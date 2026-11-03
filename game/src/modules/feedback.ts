import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { store } from "./store";

/**
 * Tactile + audio feedback layer. Every interaction routes through here so the
 * Settings sound/haptics toggles are honoured in one place. Players are created
 * lazily and every call is wrapped so a missing audio route or haptics engine
 * can never interrupt gameplay (or the screenshot-capture launch).
 */
type Cue = "move" | "tap" | "win" | "fail" | "unlock" | "star" | `paint${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;

const SOURCES: Record<Cue, number> = {
  move: require("../assets/sfx/move.wav"),
  tap: require("../assets/sfx/tap.wav"),
  win: require("../assets/sfx/win.wav"),
  fail: require("../assets/sfx/fail.wav"),
  unlock: require("../assets/sfx/unlock.wav"),
  star: require("../assets/sfx/star.wav"),
  // The paint combo: one rising note per tile a stroke paints.
  paint0: require("../assets/sfx/paint0.wav"),
  paint1: require("../assets/sfx/paint1.wav"),
  paint2: require("../assets/sfx/paint2.wav"),
  paint3: require("../assets/sfx/paint3.wav"),
  paint4: require("../assets/sfx/paint4.wav"),
  paint5: require("../assets/sfx/paint5.wav"),
  paint6: require("../assets/sfx/paint6.wav"),
  paint7: require("../assets/sfx/paint7.wav"),
};

const players: Partial<Record<Cue, AudioPlayer>> = {};

function soundOn(): boolean {
  return store.get().settings.sound;
}
function hapticsOn(): boolean {
  return store.get().settings.haptics && Platform.OS !== "web";
}

/**
 * iOS audio session: game SFX respect the Ring/Silent switch (like every iOS
 * game) and mix with the player's own music instead of stopping it.
 */
let audioModeSet = Platform.OS !== "ios";
function ensureAudioMode(): void {
  if (audioModeSet) return;
  audioModeSet = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }).catch(() => {});
}

function play(cue: Cue): void {
  if (!soundOn()) return;
  ensureAudioMode();
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
  /** The brush meeting a wall (end of a stroke, or a swipe straight into one). */
  bump(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  },
  /** Finger lands on the board: an instant light tick (the brush squashes in the same frame). */
  press(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** A combo / big splash stroke: a firmer thump under the "Combo xN" pop. */
  combo(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    play("star");
  },
  /** A generic UI button / selection. */
  tap(): void {
    buzz(() => Haptics.selectionAsync());
    play("tap");
  },
  /** One freshly painted tile in a stroke: the i-th tile plays the i-th note
   *  of a rising ladder (the combo climbs in pitch) with a light tick. */
  paintTile(i: number): void {
    buzz(() => Haptics.selectionAsync());
    play(`paint${Math.max(0, Math.min(7, i)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`);
  },
  /** A gate opened — a touch more emphasis than a normal move. */
  gate(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    play("unlock");
  },
  /** A star landing on the results card. */
  star(): void {
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    play("star");
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
