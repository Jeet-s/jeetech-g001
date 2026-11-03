import { useEffect, useRef, useState } from "react";
import { Text, type TextStyle } from "react-native";

/**
 * Counts smoothly to `value` (coins, score) — rewards should never just "snap". `from` = where the first count
 * starts (e.g. 0 for a reward that counts up as it appears); by default it starts at `value`, never at a
 * placeholder — a "+0" sitting on screen before the real number arrives is a render_defects blocker (3 games,
 * 2026-10-25..27).
 */
export function AnimatedNumber({ value, style, duration = 600, from }: { value: number; style?: TextStyle; duration?: number; from?: number }) {
  const [shown, setShown] = useState(from ?? value);
  const start = useRef(from ?? value);
  useEffect(() => {
    const t0 = Date.now();
    const a = start.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else start.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <Text style={style}>{shown.toLocaleString()}</Text>;
}
