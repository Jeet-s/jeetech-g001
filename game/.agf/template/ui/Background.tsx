import { memo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Canvas, Circle, BlurMask } from "@shopify/react-native-skia";
import { palette } from "./theme";

type BackgroundProps = { colors?: [string, string]; children?: React.ReactNode };

/**
 * Full-screen brand gradient with soft bokeh light — the base of every screen. Memoised: it sits under the game
 * screen, which re-renders on every move — an unmemoised blurred Skia canvas redrawn per tap is soak-ANR fuel.
 * Keep BlurMask off boards and anything that animates; a static backdrop like this one is drawn once.
 */
export const Background = memo(
  BackgroundCanvas,
  (a: BackgroundProps, b: BackgroundProps) => a.colors?.[0] === b.colors?.[0] && a.colors?.[1] === b.colors?.[1] && a.children === b.children,
);

function BackgroundCanvas({ colors, children }: BackgroundProps) {
  const { width, height } = useWindowDimensions();
  const [top, bottom] = colors ?? [palette.bgTop, palette.bgBottom];
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[top, bottom]} style={StyleSheet.absoluteFill} />
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle cx={width * 0.15} cy={height * 0.12} r={width * 0.35} color="rgba(255,255,255,0.06)">
          <BlurMask blur={40} style="normal" />
        </Circle>
        <Circle cx={width * 0.9} cy={height * 0.55} r={width * 0.45} color="rgba(123,92,255,0.18)">
          <BlurMask blur={60} style="normal" />
        </Circle>
        <Circle cx={width * 0.3} cy={height * 0.95} r={width * 0.4} color="rgba(47,211,193,0.10)">
          <BlurMask blur={60} style="normal" />
        </Circle>
      </Canvas>
      {children}
    </View>
  );
}
