import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Image, ScrollView, StyleSheet, View, type ImageSourcePropType } from "react-native";
import type { Colors } from "../game/theme";
import { useBottomInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { PressableScale } from "../ui/PressableScale";

/**
 * Shared bottom-sheet look for the Shop, Inbox and Settings: the game's deep,
 * glossy chapter-frame panel (same as the HUD and board), a header with art +
 * title + live coin balance, a scrolling body and a pinned footer button that
 * always clears the gesture bar. Render inside a Modal that mounts its own
 * SafeAreaProvider (useBottomInset reads the modal's real inset).
 */
export function GameSheet({
  colors,
  title,
  icon,
  coins,
  toast,
  closeLabel = "Close",
  onClose,
  children,
}: {
  colors: Colors;
  title: string;
  icon?: ImageSourcePropType;
  coins?: number;
  toast?: ReactNode;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const bottomInset = useBottomInset(14, { modal: true });
  // Body height = its content, capped so header + body + pinned footer fit in
  // 90% of the measured screen. Measured (not flex-shrunk): a shrinking
  // ScrollView in a %-max sheet collapsed to 0 px on RN-web.
  const [m, setM] = useState({ back: 0, head: 0, content: 0 });
  // Footer = paddingTop 10 + button (54 + 5 lip) + inset — fixed, so it is
  // computed rather than measured (a flex parent can stretch the measured box).
  const foot = 10 + FOOTER_BTN + bottomInset;
  const cap = m.back > 0 ? Math.floor(m.back * 0.9) - Math.min(m.head, 140) - foot : 0;
  const bodyH = m.content > 0 && cap > 0 ? Math.max(120, Math.min(m.content, cap)) : undefined;
  const measure = (k: "back" | "head" | "content") => (v: number) => setM((o) => (o[k] === Math.ceil(v) ? o : { ...o, [k]: Math.ceil(v) }));
  return (
    <View style={styles.backdrop} onLayout={(e) => measure("back")(e.nativeEvent.layout.height)}>
      <View style={[styles.sheet, { backgroundColor: colors.frame, borderColor: colors.frameEdge }]}>
        <View pointerEvents="none" style={styles.gloss} />
        <View style={styles.header} onLayout={(e) => measure("head")(e.nativeEvent.layout.height)}>
          {icon != null && <Image source={icon} style={styles.headerIcon} resizeMode="contain" />}
          <Txt weight="display" size={28} color="#FFFFFF" style={[styles.outlined, { flex: 1 }]}>
            {title}
          </Txt>
          {coins != null && <CoinPill coins={coins} colors={colors} />}
        </View>
        <ScrollView
          style={bodyH != null ? { height: bodyH, flexGrow: 0, flexShrink: 0 } : styles.scroll}
          onContentSizeChange={(_w, h) => measure("content")(h)}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: bottomInset }]}>
          <PressableScale onPress={onClose} hitSlop={8} style={[styles.closeLip, { backgroundColor: colors.paintDeep }]}>
            <View style={[styles.close, { backgroundColor: colors.paint, borderColor: colors.paintEdge }]}>
              <Txt weight="display" size={18} color="#FFFFFF" style={styles.outlinedSmall}>
                {closeLabel}
              </Txt>
            </View>
          </PressableScale>
        </View>
        {toast}
      </View>
    </View>
  );
}

const FOOTER_BTN = 59;

/** Coin balance that counts up/down to its new value (visible result of a claim or purchase). */
export function CoinPill({ coins, colors }: { coins: number; colors: Colors }) {
  const [shown, setShown] = useState(coins);
  const from = useRef(coins);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const start = from.current;
    if (start === coins) return;
    from.current = coins;
    const t0 = Date.now();
    const dur = 650;
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      setShown(Math.round(start + (coins - start) * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) clearInterval(id);
    }, 30);
    pop.setValue(1.25);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    return () => clearInterval(id);
  }, [coins, pop]);
  return (
    <Animated.View style={[styles.coinPill, { backgroundColor: colors.slotDeep, borderColor: colors.frameEdge, transform: [{ scale: pop }] }]}>
      <Txt size={16}>🪙</Txt>
      <Txt weight="black" size={18} color="#FFE27A">
        {shown}
      </Txt>
    </Animated.View>
  );
}

/** A visible, lasting message strip at the top of a sheet (≈4 s). */
export function useToast(): [ReactNode, (msg: string, tone?: "info" | "good" | "warn") => void] {
  const [msg, setMsg] = useState<{ text: string; tone: "info" | "good" | "warn"; n: number } | null>(null);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!msg) return;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const t = setTimeout(() => setMsg(null), 4200);
    return () => clearTimeout(t);
  }, [msg, a]);
  const show = useCallback((text: string, tone: "info" | "good" | "warn" = "info") => setMsg((m) => ({ text, tone, n: (m?.n ?? 0) + 1 })), []);
  const node = msg ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          backgroundColor: msg.tone === "good" ? "#E8FFF1" : msg.tone === "warn" ? "#FFF4E0" : "#FFFFFF",
          borderColor: msg.tone === "good" ? "#2FBF71" : msg.tone === "warn" ? "#FF9F1C" : "#C9D3E6",
          opacity: a,
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        },
      ]}
    >
      <Txt weight="body" size={15} color="#1C2033" style={{ textAlign: "center" }}>
        {msg.text}
      </Txt>
    </Animated.View>
  ) : null;
  return [node, show];
}

/** Section heading inside a sheet. */
export function SheetSection({ children }: { children: ReactNode }) {
  return (
    <Txt weight="display" size={14} color="#FFFFFFC0" style={styles.section}>
      {children}
    </Txt>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(12,16,32,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 2, borderTopWidth: 3, borderBottomWidth: 0, maxHeight: "90%", overflow: "hidden" },
  gloss: { position: "absolute", left: 0, right: 0, top: 0, height: 70, backgroundColor: "rgba(255,255,255,0.08)" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  headerIcon: { width: 44, height: 44 },
  scroll: { flexGrow: 0, flexShrink: 0 },
  body: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 10 },
  closeLip: { borderRadius: 20, paddingBottom: 5 },
  close: { minHeight: 54, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  coinPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 2 },
  toast: { position: "absolute", left: 16, right: 16, top: 10, padding: 12, borderRadius: 16, borderWidth: 2, elevation: 12, zIndex: 20, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  section: { textTransform: "uppercase", letterSpacing: 1.4, marginTop: 6, marginLeft: 4 },
  outlined: { textShadowColor: "rgba(10,12,35,0.7)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  outlinedSmall: { textShadowColor: "rgba(10,12,35,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
