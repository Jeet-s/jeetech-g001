/**
 * Visual theme + accessibility. Paint / switch / gate colours come from the
 * asset palette, with colourblind-safe alternatives and a high-contrast mode.
 * Switches and gates also carry a distinct SHAPE (round vs square) and a letter
 * so objectives stay readable with no colour at all (QA: colourblind gate).
 */
export type Palette = "classic" | "deuteranopia" | "protanopia" | "tritanopia";

export interface Colors {
  bg: string;
  surface: string;
  wall: string;
  floor: string;
  paint: string;
  paintEdge: string;
  brush: string;
  switch: string;
  gate: string;
  text: string;
  subtext: string;
  accent: string;
}

const BASE = {
  bg: "#0b0c10",
  surface: "#151826",
  wall: "#0f1118",
  floor: "#20243a",
  text: "#e7e9f0",
  subtext: "#8b90a6",
  brush: "#ffffff",
};

const PAINTS: Record<Palette, { paint: string; paintEdge: string; switch: string; gate: string; accent: string }> = {
  classic: { paint: "#6d8bff", paintEdge: "#9bb0ff", switch: "#38d9a9", gate: "#ffd43b", accent: "#f5c451" },
  // Colourblind-safe sets lean on blue/orange/white contrast.
  deuteranopia: { paint: "#4da3ff", paintEdge: "#9fd0ff", switch: "#ffb84d", gate: "#f0f0f0", accent: "#ffb84d" },
  protanopia: { paint: "#4dc3ff", paintEdge: "#a8e4ff", switch: "#ffd43b", gate: "#e8e8e8", accent: "#ffd43b" },
  tritanopia: { paint: "#ff6d9b", paintEdge: "#ffb0c7", switch: "#38d9a9", gate: "#f0f0f0", accent: "#38d9a9" },
};

export function makeColors(palette: Palette, highContrast: boolean): Colors {
  const p = PAINTS[palette];
  if (highContrast) {
    return {
      bg: "#000000",
      surface: "#0a0a0a",
      wall: "#000000",
      floor: "#2a2a2a",
      paint: "#ffffff",
      paintEdge: "#ffe34d",
      brush: "#ffe34d",
      switch: "#00e5a0",
      gate: "#ff8a00",
      text: "#ffffff",
      subtext: "#cccccc",
      accent: "#ffe34d",
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
