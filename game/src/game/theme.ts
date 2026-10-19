/**
 * Visual theme + accessibility. The game wears the generated art's calm, pastel
 * look: light canvas backgrounds, satin ceramic tiles, creamy paint. Paint /
 * switch / gate colours come from the asset palette, with colourblind-safe
 * alternatives and a high-contrast mode. Switches and gates also carry a
 * distinct SHAPE (round vs square) and a letter so objectives stay readable
 * with no colour at all (QA: colourblind gate).
 */
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

export function makeColors(palette: Palette, highContrast: boolean): Colors {
  const p = PAINTS[palette];
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
    };
  }
  return {
    ...BASE,
    paint: p.paint,
    paintEdge: p.paintEdge,
    switch: p.switch,
    gate: p.gate,
    accent: p.accent,
  };
}

export const PALETTE_LABELS: Record<Palette, string> = {
  classic: "Classic",
  deuteranopia: "Deuteranopia",
  protanopia: "Protanopia",
  tritanopia: "Tritanopia",
};

export const PALETTE_ORDER: Palette[] = ["classic", "deuteranopia", "protanopia", "tritanopia"];
