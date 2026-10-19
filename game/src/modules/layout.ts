import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Shared layout facts screens must respect. bannerHeight is measured from the
 * real banner in App.tsx (0 when no banner shows) so bottom controls are never
 * hidden under the ad.
 */
let bannerHeight = 0;
const listeners = new Set<(h: number) => void>();

export const layout = {
  setBannerHeight(h: number): void {
    const v = Math.round(h);
    if (v === bannerHeight) return;
    bannerHeight = v;
    listeners.forEach((l) => l(v));
  },
};

export function useBannerHeight(): number {
  const [h, setH] = useState(bannerHeight);
  useEffect(() => {
    listeners.add(setH);
    return () => {
      listeners.delete(setH);
    };
  }, []);
  return h;
}

/**
 * Safe bottom padding for anything anchored to the screen bottom (modal sheets,
 * action bars). On Android edge-to-edge the system navigation bar draws over our
 * UI, so every bottom-anchored primary control must clear it.
 *
 * Inside a React Native Modal the inset can read 0 (its window is one the root
 * SafeAreaProvider doesn't reach), so we also take the MAIN window's measured
 * inset (initialWindowMetrics — the real nav-bar height of this device) and a
 * floor. The floor in a modal is the full 3-button navigation bar height (48dp)
 * because a 720x1280 phone typically runs 3-button nav, and a 24dp gesture-pill
 * floor left the lower edge of Settings' "Done" button under it (QA: layout_small).
 */
const GESTURE_PILL_FLOOR = 24;
const NAV_BAR_FLOOR = Platform.OS === "android" ? 48 : GESTURE_PILL_FLOOR;

export function useBottomInset(extra = 0, opts?: { modal?: boolean }): number {
  const insets = useSafeAreaInsets();
  const windowInset = initialWindowMetrics?.insets.bottom ?? 0;
  const floor = opts?.modal ? NAV_BAR_FLOOR : GESTURE_PILL_FLOOR;
  return Math.max(insets.bottom, windowInset, floor) + extra;
}
