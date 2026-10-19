import { StyleSheet, Text, View } from "react-native";
import { AnimatedNumber } from "./AnimatedNumber";
import { fonts, palette } from "./theme";

/** HUD pill: icon + animated count (coins, stars, gems). */
export function CurrencyPill({ icon, value, color = palette.coin }: { icon: string; value: number; color?: string }) {
  return (
    <View style={styles.pill}>
      <View style={[styles.icon, { backgroundColor: color }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <AnimatedNumber value={value} style={styles.value} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(10,6,40,0.55)", borderRadius: 999, paddingRight: 14, height: 38, borderWidth: 2, borderColor: "rgba(255,255,255,0.12)" },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginLeft: 1, marginRight: 8 },
  iconText: { fontSize: 18 },
  value: { fontFamily: fonts.display, fontSize: 18, color: "#fff", minWidth: 28 },
});
