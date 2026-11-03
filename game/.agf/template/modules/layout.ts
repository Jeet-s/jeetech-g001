import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Shared layout facts screens must respect. bannerHeight is measured from the
 * real banner in App.tsx (0 when no banner shows) so bottom controls are never
 * hidden under the ad. Since 2026-10-28 the banner's own box includes the
 * bottom safe-area inset (it sits ABOVE the gesture pill / home indicator), so
 * a measured banner height already covers the inset.
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
 * Minimum bottom clearance. Android's gesture pill is ~24 dp tall, and inside a <Modal> (its own native window) or a
 * headless QA capture the measured inset can read 0 — the "Done button under the gesture pill" layout_small blocker
 * (Settings / Shop / Premium screens in 4 games, 2026-10-20..27). Never go below this.
 */
export const GESTURE_FLOOR = 24;

/**
 * Bottom padding for anything anchored to the bottom of a screen: clears the banner ad (which itself clears the
 * system bars), the gesture pill / home indicator, with a floor for windows that misreport the inset.
 * Use: <View style={{ paddingBottom: useBottomInset() + 12 }}>…buttons…</View>
 */
export function useBottomInset(): number {
  const banner = useBannerHeight();
  const { bottom } = useSafeAreaInsets();
  return Math.max(banner, bottom, GESTURE_FLOOR);
}
