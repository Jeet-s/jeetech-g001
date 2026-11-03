/**
 * Visual theme + accessibility. The game wears the generated art's calm, pastel
 * look: light canvas backgrounds, satin ceramic tiles, creamy paint. Paint /
 * switch / gate colours come from the asset palette, with colourblind-safe
 * alternatives and a high-contrast mode. Switches and gates also carry a
 * distinct SHAPE (round vs square) and a letter so objectives stay readable
 * with no colour at all (QA: colourblind gate).
 */
import { skinPaint } from "./cosmetics";

export type Palette = "classic" | "deuteranopia" | "protanopia" | "tritanopia";

export interface Colors {
  bg: string; // fallback behind the full-screen background art
  surface: string; // cards, pills, sheets
  board: string; // translucent panel the tiles sit on
  wall: string; // board gaps (shows the background through)
  floor: string; // unpainted tile tint (mostly covered by the ceramic sprite)
  paint: string; // creamy paint fill
  paintEdge: string; // paint highlight / rim
  brush: string;
  switch: string;
  gate: string;
  text: string; // ink on light surfaces
  subtext: string;
  accent: string; // coins / highlights
  onPaint: string; // text/icons sitting on a paint or accent fill
  paintDeep: string; // painted tile's raised lip / shadow side
  frame: string; // the board's deep frame (and the walls between paths)
  frameEdge: string; // frame gloss rim
  slot: string; // unpainted tile: recessed, mid-dark, saturated
  slotDeep: string; // inner shadow at the top of a recessed slot
  /** Switch/gate group colours A..D — fixed per palette, independent of the chapter paint. */
  groups: [string, string, string, string];
}

/**
 * Each chapter is its own painted world: a backdrop (assets/art/world_N), a
 * brush colour, and a board frame whose deep tone sits in that world. Value
 * ladder on the board: frame (darkest) < recessed slot (mid) < paint (bright,
 * raised) so painted / unpainted / wall read apart even squinting.
 */
export interface ChapterTheme {
  world: string;
  paint: string;
  paintEdge: string;
  paintDeep: string;
  frame: string;
  frameEdge: string;
  slot: string;
  slotDeep: string;
}

export const CHAPTER_THEMES: ChapterTheme[] = [
  { world: "Spring Meadow", paint: "#4D7CFF", paintEdge: "#A8C0FF", paintDeep: "#2E52C9", frame: "#2C5747", frameEdge: "#5E937B", slot: "#558A72", slotDeep: "#1F4033" },
  { world: "Dawn Lake", paint: "#FF5C8D", paintEdge: "#FFB0C8", paintDeep: "#C73866", frame: "#3B3D7A", frameEdge: "#6F72B5", slot: "#6467AA", slotDeep: "#2A2C5E" },
  { world: "Lavender Fields", paint: "#1FC7B6", paintEdge: "#93F0E5", paintDeep: "#118C80", frame: "#4A3477", frameEdge: "#8467B8", slot: "#7659A8", slotDeep: "#33215A" },
  { world: "Autumn Canyon", paint: "#7B61FF", paintEdge: "#C3B6FF", paintDeep: "#5139CC", frame: "#6B3A2C", frameEdge: "#A86E5A", slot: "#9C6452", slotDeep: "#4F2519" },
  { world: "Twilight Woods", paint: "#FFC53B", paintEdge: "#FFE6A3", paintDeep: "#D18F00", frame: "#25264F", frameEdge: "#5558A0", slot: "#4A4D88", slotDeep: "#17183A" },
  { world: "Aurora Peaks", paint: "#FF6B5B", paintEdge: "#FFB9AF", paintDeep: "#CF4535", frame: "#21506E", frameEdge: "#5A8DB0", slot: "#4B7E9F", slotDeep: "#153A52" },
];

export function chapterTheme(chapter: number): ChapterTheme {
  return CHAPTER_THEMES[(Math.max(1, chapter) - 1) % CHAPTER_THEMES.length];
}

const BASE = {
  bg: "#E7EDF7",
  surface: "#FFFFFF",
  board: "rgba(255,255,255,0.46)",
  wall: "transparent",
  floor: "#DBE2EE",
  brush: "#FFFFFF",
  text: "#1C2033",
  subtext: "#6B7384",
  onPaint: "#FFFFFF",
};

const PAINTS: Record<Palette, { paint: string; paintEdge: string; switch: string; gate: string; accent: string }> = {
  classic: { paint: "#6D8BFF", paintEdge: "#A9BBFF", switch: "#38D9A9", gate: "#FFC53B", accent: "#FF8A5B" },
  // Colourblind-safe sets lean on blue / orange / white contrast.
  deuteranopia: { paint: "#2F80ED", paintEdge: "#8FB8F5", switch: "#F2994A", gate: "#56CCF2", accent: "#F2994A" },
  protanopia: { paint: "#2D9CDB", paintEdge: "#9AD6F2", switch: "#F2C94C", gate: "#2F80ED", accent: "#F2994A" },
  tritanopia: { paint: "#EB5757", paintEdge: "#F5A3A3", switch: "#27AE60", gate: "#9B51E0", accent: "#EB5757" },
};

/**
 * `skin` = the equipped brush colour (src/game/cosmetics.ts). It recolours the
 * paint in the Classic palette only — colourblind palettes and High Contrast
 * keep their safe paint so accessibility never depends on a purchase.
 */
export function makeColors(palette: Palette, highContrast: boolean, chapter = 1, skin?: string): Colors {
  const p = PAINTS[palette];
  const ch = chapterTheme(chapter);
  const sk = skinPaint(skin, chapter);
  if (highContrast) {
    return {
      bg: "#F7F7F7",
      surface: "#FFFFFF",
      board: "rgba(0,0,0,0.06)",
      wall: "transparent",
      floor: "#E2E2E2",
      paint: "#1663D6",
      paintEdge: "#7FB0F0",
      brush: "#FFFFFF",
      switch: "#0A8F5B",
      gate: "#C85A00",
      text: "#0A0A0A",
      subtext: "#3A3A3A",
      accent: "#C85A00",
      onPaint: "#FFFFFF",
      paintDeep: "#0B3F91",
      frame: "#141414",
      frameEdge: "#4A4A4A",
      slot: "#6A6A6A",
      slotDeep: "#2A2A2A",
      groups: ["#1663D6", "#0A8F5B", "#C85A00", "#9B1FB5"],
    };
  }
  // Classic: every chapter paints with its own brush colour. Colourblind sets
  // keep their safe paint everywhere (only the frame follows the chapter).
  const classic = palette === "classic";
  return {
    ...BASE,
    paint: classic ? (sk ?? ch).paint : p.paint,
    paintEdge: classic ? (sk ?? ch).paintEdge : p.paintEdge,
    paintDeep: classic ? (sk ?? ch).paintDeep : shade(p.paint),
    switch: p.switch,
    gate: p.gate,
    accent: p.accent,
    frame: ch.frame,
    frameEdge: ch.frameEdge,
    slot: ch.slot,
    slotDeep: ch.slotDeep,
    groups: classic ? ["#3F7BFF", "#12B886", "#F59F00", "#E8590C"] : [p.paint, p.switch, p.gate, p.accent],
  };
}

export const PALETTE_LABELS: Record<Palette, string> = {
  classic: "Classic",
  deuteranopia: "Deuteranopia",
  protanopia: "Protanopia",
  tritanopia: "Tritanopia",
};

export const PALETTE_ORDER: Palette[] = ["classic", "deuteranopia", "protanopia", "tritanopia"];

/** A darker shade of a #RRGGBB colour (the raised lip under a paint fill). */
function shade(hex: string, k = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
