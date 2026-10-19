import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Palette } from "../game/theme";

/**
 * Tiny persisted player state (entitlements + currency + progress + settings).
 * Loaded once at boot; reads are synchronous afterwards so gameplay code stays
 * simple. All Path Painter progress lives here (no network, no accounts).
 */
export interface Settings {
  sound: boolean;
  haptics: boolean;
  palette: Palette;
  highContrast: boolean;
}

export interface PlayerState {
  adsRemoved: boolean;
  coins: number;
  level: number; // highest unlocked level id
  /** Best stars earned per level id (0..3). */
  stars: Record<number, number>;
  settings: Settings;
  /** Whether the levels 1–2 tutorial has been completed (fires analytics once). */
  tutorialDone: boolean;
}

const KEY = "player_state_v1";

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  palette: "classic",
  highContrast: false,
};

let state: PlayerState = {
  adsRemoved: false,
  coins: 0,
  level: 1,
  stars: {},
  settings: DEFAULT_SETTINGS,
  tutorialDone: false,
};

const listeners = new Set<(s: PlayerState) => void>();

export const store = {
  async load(): Promise<PlayerState> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PlayerState>;
        state = {
          ...state,
          ...parsed,
          stars: { ...state.stars, ...(parsed.stars ?? {}) },
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        };
      }
    } catch {
      // first launch / corrupted → defaults
    }
    return state;
  },
  get(): PlayerState {
    return state;
  },
  set(patch: Partial<PlayerState>): void {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  },
  /** Merge a settings change without clobbering the rest. */
  setSettings(patch: Partial<Settings>): void {
    store.set({ settings: { ...state.settings, ...patch } });
  },
  /** Record a level result: unlock the next level and keep the best star count. */
  recordWin(levelId: number, stars: number, coinsEarned: number): void {
    const best = Math.max(state.stars[levelId] ?? 0, stars);
    store.set({
      stars: { ...state.stars, [levelId]: best },
      level: Math.max(state.level, levelId + 1),
      coins: state.coins + coinsEarned,
    });
  },
  totalStars(): number {
    return Object.values(state.stars).reduce((a, b) => a + b, 0);
  },
  subscribe(l: (s: PlayerState) => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
