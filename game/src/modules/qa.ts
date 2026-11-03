import { Dimensions } from "react-native";
import { analytics } from "./analytics";

/**
 * QA level replay (the factory's on-device QA, never seen by players): `<scheme>://qa/level/<n>` opens level n
 * directly — no tutorial gate, no ads. While in this mode the game reports, after the level opens and after every
 * move it accepts, the NEXT real touch its solver would make to win: device QA performs exactly those touches with
 * real taps/swipes and checks that every accepted move is visibly drawn and that playing the solution wins.
 */
export const qa = { level: null as number | null };

export type QaTouch = { x: number; y: number; x2?: number; y2?: number }; // window pixels (x2/y2: swipe end)

/** Report the next solution touch for `level` (null = nothing left to do, the level should be won). */
export function reportNext(level: number, touch: QaTouch | null): void {
  if (qa.level == null) return;
  const { width, height } = Dimensions.get("window");
  const n = (v: number, d: number) => Math.round((v / d) * 10000) / 10000;
  analytics.qa(
    "qa_next",
    touch
      ? { level, x: n(touch.x, width), y: n(touch.y, height), ...(touch.x2 != null && touch.y2 != null ? { x2: n(touch.x2, width), y2: n(touch.y2, height) } : {}) }
      : { level, done: true },
  );
}
