import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * A lightweight circular progress ring with no native/SVG dependency. Built from
 * the classic two-semicircle masking trick: a right half sweeps 0–180° and a
 * left half sweeps 180–360°, with an inner hole punched out to make a donut.
 * Used for the Fill chip in the HUD so progress reads at a glance.
 */
export function ProgressRing({
  size,
  thickness,
  progress,
  color,
  track,
  hole,
  children,
}: {
  size: number;
  thickness: number;
  progress: number; // 0..1
  color: string;
  track: string;
  hole: string;
  children?: ReactNode;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const deg = p * 360;
  const rightRot = Math.min(deg, 180);
  const leftRot = Math.max(0, deg - 180);
  const inner = size - thickness * 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: track }} />
      <HalfFill size={size} color={color} rotate={rightRot} side="right" />
      {deg > 180 && <HalfFill size={size} color={color} rotate={leftRot} side="left" />}
      <View
        style={{
          position: "absolute",
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: hole,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function HalfFill({ size, color, rotate, side }: { size: number; color: string; rotate: number; side: "right" | "left" }) {
  const D = size;
  const isRight = side === "right";
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: isRight ? D / 2 : 0,
        width: D / 2,
        height: D,
        overflow: "hidden",
      }}
    >
      {/* D×D box centred on the circle centre so rotation pivots there */}
      <View style={{ position: "absolute", top: 0, left: isRight ? -D / 2 : 0, width: D, height: D, transform: [{ rotate: `${rotate}deg` }] }}>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: isRight ? 0 : D / 2,
            width: D / 2,
            height: D,
            backgroundColor: color,
            borderTopLeftRadius: isRight ? D / 2 : 0,
            borderBottomLeftRadius: isRight ? D / 2 : 0,
            borderTopRightRadius: isRight ? 0 : D / 2,
            borderBottomRightRadius: isRight ? 0 : D / 2,
          }}
        />
      </View>
    </View>
  );
}
