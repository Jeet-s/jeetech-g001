import { useEffect, useRef, type ComponentRef } from "react";
import { Animated, Easing, Image, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { LEVELS, CHAPTERS, TOTAL_LEVELS } from "../game/levels";
import { chapterTheme, type Colors } from "../game/theme";
import { art, paintingArt, pieceCols, PAINTING_ASPECT } from "../art";
import { store } from "../modules/store";
import { useBannerHeight, useBottomInset, useTopInset } from "../modules/layout";
import { Txt } from "../ui/Txt";
import { HudNumber, HudPanel, IconButton } from "../ui/Hud";
import { PressableScale } from "../ui/PressableScale";

/**
 * The Levels screen is an art collection: every chapter is a painting of its
 * world, cut into one piece per level. Painting a level reveals its piece in
 * full colour; the next level's piece glows on blank canvas; later ones stay
 * locked. Tap a revealed or glowing piece to play it.
 */
export function LevelsScreen({
  colors,
  awardedId,
  onPlay,
  onHome,
  onSettings,
  onShop,
}: {
  colors: Colors;
  awardedId: number | null;
  onPlay: (id: number) => void;
  onHome: () => void;
  onSettings: () => void;
  onShop: () => void;
}) {
  const state = store.get();
  const bannerH = useBannerHeight();
  const bottomInset = useBottomInset();
  const topInset = useTopInset(44);
  const { width } = useWindowDimensions();
  const cardW = Math.min(440, Math.floor(width - 32));
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const current = Math.min(TOTAL_LEVELS, Math.max(1, state.level));
  const currentChapter = LEVELS.find((l) => l.id === current)?.chapter ?? 1;

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { paddingTop: topInset }]}>
        <IconButton icon={art.icon_back} label="Home" onPress={onHome} colors={colors} size={46} />
        <View style={styles.headerMid}>
          <Txt weight="display" size={30} color="#FFFFFF" style={styles.outlined}>Gallery</Txt>
          <HudPanel colors={colors} style={styles.statusPill}>
            <Image source={art.star_gold} style={styles.pillIcon} resizeMode="contain" />
            <HudNumber value={`${store.totalStars()}`} size={17} />
            <Txt weight="display" size={14} color="#FFFFFFAA">{` / ${TOTAL_LEVELS * 3}`}</Txt>
            <Txt size={15}>{"   🪙 "}</Txt>
            <HudNumber value={`${state.coins}`} size={17} />
          </HudPanel>
        </View>
        <View style={styles.headerSide}>
          <IconButton icon={art.icon_shop} label="Shop" onPress={onShop} colors={colors} size={46} />
          <IconButton icon={art.icon_gear} label="Settings" onPress={onSettings} colors={colors} size={46} />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 + Math.max(bannerH, bottomInset) }]}
        showsVerticalScrollIndicator={false}
      >
        {CHAPTERS.map((name, ci) => {
          const chapter = ci + 1;
          const levels = LEVELS.filter((l) => l.chapter === chapter);
          if (levels.length === 0) return null;
          return (
            <View
              key={name}
              onLayout={(e) => {
                if (chapter === currentChapter && chapter > 1) scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: false });
              }}
            >
              <ChapterPainting
                chapter={chapter}
                name={name}
                levels={levels.map((l) => l.id)}
                width={cardW}
                colors={colors}
                awardedId={awardedId}
                onPlay={onPlay}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ChapterPainting({
  chapter,
  name,
  levels,
  width,
  colors,
  awardedId,
  onPlay,
}: {
  chapter: number;
  name: string;
  levels: number[];
  width: number;
  colors: Colors;
  awardedId: number | null;
  onPlay: (id: number) => void;
}) {
  const state = store.get();
  const theme = chapterTheme(chapter);
  const pad = 10;
  const COLS = pieceCols(levels.length);
  const rows = Math.ceil(levels.length / COLS);
  const imgW = width - pad * 2;
  const imgH = Math.floor(imgW * PAINTING_ASPECT);
  const cellW = Math.floor(imgW / COLS);
  const cellH = Math.floor(imgH / rows);
  const done = levels.filter((id) => (state.stars[id] ?? 0) > 0).length;
  const stars = levels.reduce((a, id) => a + (state.stars[id] ?? 0), 0);
  const complete = done === levels.length;
  const unlockedAny = state.level >= levels[0];

  return (
    <View style={[styles.card, { width, backgroundColor: theme.frame, borderColor: theme.frameEdge }]}>
      <View pointerEvents="none" style={styles.cardGloss} />
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Txt weight="display" size={13} color="#FFFFFFB0" style={styles.kicker}>Chapter {chapter} · {theme.world}</Txt>
          <Txt weight="display" size={21} color="#FFFFFF" style={styles.outlined}>{name}</Txt>
        </View>
        <View style={styles.cardStars}>
          <Image source={art.star_gold} style={styles.pillIcon} resizeMode="contain" />
          <HudNumber value={`${stars}/${levels.length * 3}`} size={16} />
        </View>
      </View>
      <View style={{ width: cellW * COLS, height: cellH * rows, alignSelf: "center", borderRadius: 14, overflow: "hidden", backgroundColor: "#F4EEE2" }}>
        <Image source={paintingArt(chapter)} style={{ position: "absolute", left: 0, top: 0, width: cellW * COLS, height: cellH * rows }} resizeMode="cover" />
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={styles.row}>
            {levels.slice(r * COLS, r * COLS + COLS).map((id) => (
              <Piece
                key={id}
                id={id}
                w={cellW}
                h={cellH}
                stars={state.stars[id] ?? 0}
                unlocked={state.level >= id}
                awarded={id === awardedId}
                colors={colors}
                accent={theme.paint}
                onPress={() => onPlay(id)}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.cardFoot}>
        <View style={[styles.track, { backgroundColor: theme.slotDeep }]}>
          <View style={{ width: `${Math.max(4, (done / levels.length) * 100)}%`, height: "100%", borderRadius: 5, backgroundColor: theme.paint }} />
        </View>
        <Txt weight="display" size={14} color="#FFFFFF" style={styles.outlinedSmall}>
          {complete ? "Painting complete!" : unlockedAny ? `${done}/${levels.length} pieces painted` : "Finish the chapter before to unlock"}
        </Txt>
      </View>
    </View>
  );
}

/** One level's piece of the painting: revealed (painted) / glowing blank canvas
 *  (next to play) / locked canvas. A just-earned piece paints itself in. */
function Piece({
  id,
  w,
  h,
  stars,
  unlocked,
  awarded,
  colors,
  accent,
  onPress,
}: {
  id: number;
  w: number;
  h: number;
  stars: number;
  unlocked: boolean;
  awarded: boolean;
  colors: Colors;
  accent: string;
  onPress: () => void;
}) {
  const revealed = stars > 0;
  // 10-level chapters cut the painting 5 wide: on narrow pieces the tag stacks.
  const tagStar = w < 84 ? Math.max(9, Math.min(13, Math.floor((w - 14) / 3))) : 13;
  // Awarded piece: the canvas cover wipes away to reveal the art (one shot).
  const reveal = useRef(new Animated.Value(awarded && revealed ? 0 : 1)).current;
  useEffect(() => {
    if (!(awarded && revealed)) return;
    Animated.sequence([
      Animated.delay(350),
      Animated.timing(reveal, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [awarded, revealed, reveal]);
  // The next-to-play piece breathes so the eye finds it.
  const glow = useRef(new Animated.Value(0)).current;
  const isNext = unlocked && !revealed;
  useEffect(() => {
    if (!isNext) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isNext, glow]);

  const body = (
    <View style={{ width: w, height: h }}>
      {/* canvas cover over unrevealed art (fades off a freshly painted piece) */}
      {(!revealed || awarded) && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.cover,
            {
              backgroundColor: isNext ? "#FBF6EC" : "#E3DCCD",
              opacity: revealed ? reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1,
              transform: revealed ? [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] : [],
            },
          ]}
        >
          <Image source={art.bg_paper_canvas} style={{ position: "absolute", width: w, height: h, opacity: 0.55 }} resizeMode="cover" />
        </Animated.View>
      )}
      {/* grid seams between pieces */}
      <View pointerEvents="none" style={styles.seam} />
      {revealed ? (
        <View style={[styles.revealedTag, w < 84 && styles.revealedTagNarrow]}>
          <Txt weight="display" size={13} color="#FFFFFF" style={styles.outlinedSmall}>{id}</Txt>
          <View style={styles.tagStars}>
            {[0, 1, 2].map((i) => (
              <Image key={i} source={i < stars ? art.star_gold : art.star_empty} style={{ width: tagStar, height: tagStar }} resizeMode="contain" />
            ))}
          </View>
        </View>
      ) : isNext ? (
        <View style={styles.centerFill}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.nextRing,
              { borderColor: accent, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
            ]}
          />
          <Txt weight="display" size={Math.round(h * 0.3)} color={accent}>{id}</Txt>
          <View style={[styles.playChip, { backgroundColor: accent }]}>
            <Txt weight="display" size={13} color="#FFFFFF">Play</Txt>
          </View>
        </View>
      ) : (
        <View style={styles.centerFill}>
          <Image source={art.icon_lock} style={{ width: h * 0.26, height: h * 0.26, tintColor: "#A79C88" }} resizeMode="contain" />
          <Txt weight="display" size={14} color="#9A8F7B">{id}</Txt>
        </View>
      )}
    </View>
  );
  if (!unlocked) return body;
  return (
    <PressableScale onPress={onPress} rippleColor={colors.paint} scaleTo={0.95} style={{ borderRadius: 0 }}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  outlined: { textShadowColor: "rgba(10,12,35,0.7)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  outlinedSmall: { textShadowColor: "rgba(10,12,35,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 },
  headerMid: { flex: 1, alignItems: "center", gap: 4 },
  headerSide: { flexDirection: "row", gap: 8 },
  statusPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 },
  pillIcon: { width: 18, height: 18, marginRight: 4 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 18, alignItems: "center" },
  card: { borderRadius: 22, borderWidth: 2, borderTopWidth: 3, paddingBottom: 10, overflow: "hidden" },
  cardGloss: { position: "absolute", left: 0, right: 0, top: 0, height: 60, backgroundColor: "rgba(255,255,255,0.08)" },
  cardHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  kicker: { textTransform: "uppercase", letterSpacing: 1.2 },
  cardStars: { flexDirection: "row", alignItems: "center" },
  row: { flexDirection: "row" },
  cover: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden" },
  seam: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)" },
  revealedTag: { position: "absolute", left: 6, bottom: 5, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(20,20,40,0.38)" },
  revealedTagNarrow: { left: 3, bottom: 3, flexDirection: "column", gap: 0, paddingHorizontal: 4 },
  tagStars: { flexDirection: "row" },
  centerFill: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  nextRing: { position: "absolute", left: 4, top: 4, right: 4, bottom: 4, borderRadius: 10, borderWidth: 3 },
  playChip: { paddingHorizontal: 12, paddingVertical: 2, borderRadius: 10, marginTop: 2 },
  cardFoot: { paddingHorizontal: 14, paddingTop: 10, gap: 6, alignItems: "center" },
  track: { width: "100%", height: 10, borderRadius: 5, overflow: "hidden" },
});
