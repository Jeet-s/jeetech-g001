import { View } from "react-native";

/** A drawn gold coin (no emoji / font dependency): rim, face, inner ring, shine. */
export function Coin({ size = 20 }: { size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: "#C98A00", alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: s * 0.84, height: s * 0.84, borderRadius: s * 0.42, backgroundColor: "#FFC53B", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: s * 0.5, height: s * 0.5, borderRadius: s * 0.25, borderWidth: Math.max(1, s * 0.08), borderColor: "#E9A100" }} />
        <View style={{ position: "absolute", left: s * 0.14, top: s * 0.1, width: s * 0.2, height: s * 0.14, borderRadius: s * 0.07, backgroundColor: "rgba(255,255,255,0.7)" }} />
      </View>
    </View>
  );
}
