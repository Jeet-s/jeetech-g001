/**
 * Brush colours: paint skins bought with coins in the Shop's "Brushes"
 * section. Fixed, known prices; every skin is shown and picked directly (no
 * random rolls). The equipped skin recolours the paint on the board, the hero
 * board on Home and the Play button (wired through makeColors in theme.ts).
 * Colourblind palettes and High Contrast keep their safe paint colours.
 */
export type SkinId = "world" | "coral" | "mint" | "sunflower" | "grape" | "rainbow";

export interface Skin {
  id: SkinId;
  name: string;
  /** Coin price; 0 = free and owned from the start. */
  price: number;
  /** Fixed paint (paint / edge / deep lip). Undefined = follows the chapter (see `perChapter`). */
  paint?: { paint: string; paintEdge: string; paintDeep: string };
  /** Per-chapter paint, chapter 1..6 (Rainbow). */
  perChapter?: { paint: string; paintEdge: string; paintDeep: string }[];
  blurb: string;
}

export const SKINS: Skin[] = [
  { id: "world", name: "World Colours", price: 0, blurb: "Each world's own paint" },
  { id: "coral", name: "Coral", price: 150, paint: { paint: "#FF6F61", paintEdge: "#FFB8AF", paintDeep: "#C9443A" }, blurb: "Warm sunset coral" },
  { id: "mint", name: "Mint", price: 250, paint: { paint: "#2FE0B0", paintEdge: "#A8F7E1", paintDeep: "#17A57F" }, blurb: "Cool fresh mint" },
  { id: "sunflower", name: "Sunflower", price: 350, paint: { paint: "#FFC21A", paintEdge: "#FFE699", paintDeep: "#C98C00" }, blurb: "Bright golden yellow" },
  { id: "grape", name: "Grape", price: 450, paint: { paint: "#A35CFF", paintEdge: "#D7B8FF", paintDeep: "#7231CC" }, blurb: "Deep juicy purple" },
  {
    id: "rainbow",
    name: "Rainbow",
    price: 600,
    perChapter: [
      { paint: "#FF5A5A", paintEdge: "#FFB3B3", paintDeep: "#C73434" },
      { paint: "#FF9F1C", paintEdge: "#FFD49A", paintDeep: "#C47200" },
      { paint: "#FFD60A", paintEdge: "#FFEC8A", paintDeep: "#BF9C00" },
      { paint: "#3DDC84", paintEdge: "#A9F2C9", paintDeep: "#22A35C" },
      { paint: "#3FA7FF", paintEdge: "#A9D6FF", paintDeep: "#1F72C4" },
      { paint: "#B266FF", paintEdge: "#DDBDFF", paintDeep: "#7E3BCC" },
    ],
    blurb: "A new colour in every world",
  },
];

export const DEFAULT_SKIN: SkinId = "world";

export function skinById(id: string | undefined): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/** The skin's paint for a chapter, or null when it follows the chapter theme. */
export function skinPaint(id: string | undefined, chapter: number): { paint: string; paintEdge: string; paintDeep: string } | null {
  const s = skinById(id);
  if (s.paint) return s.paint;
  if (s.perChapter) return s.perChapter[(Math.max(1, chapter) - 1) % s.perChapter.length];
  return null;
}
