/** Generated game art (assets/art/manifest.json has kind/usage/size for each). Use with expo Image or Skia useImage. */
export const art = {
  bg_paper_canvas: require("../assets/art/bg_paper_canvas.png"),
  bg_wood_desk: require("../assets/art/bg_wood_desk.png"),
  bg_canvas_studio: require("../assets/art/bg_canvas_studio.png"),
  bg_pastel_gradient: require("../assets/art/bg_pastel_gradient.png"),
  sprite_board_tile: require("../assets/art/sprite_board_tile.png"),
  sprite_paint_trail: require("../assets/art/sprite_paint_trail.png"),
  sprite_gate: require("../assets/art/sprite_gate.png"),
  sprite_switch_pad: require("../assets/art/sprite_switch_pad.png"),
  sprite_key_pickup: require("../assets/art/sprite_key_pickup.png"),
  sprite_one_way_arrow: require("../assets/art/sprite_one_way_arrow.png"),
  sprite_crumble_tile: require("../assets/art/sprite_crumble_tile.png"),
  sprite_color_well: require("../assets/art/sprite_color_well.png"),
  sprite_color_mixer: require("../assets/art/sprite_color_mixer.png"),
  character_brush_mascot: require("../assets/art/character_brush_mascot.png"),
  ui_logo_emblem: require("../assets/art/ui_logo_emblem.png"),
  ui_reward_chest: require("../assets/art/ui_reward_chest.png"),
  logo: require("../assets/art/logo.png"),
  // Baked in-workspace (scripts/art/bake.py): chapter worlds, reveal paintings, icons.
  world_1: require("../assets/art/world_1.jpg"),
  world_2: require("../assets/art/world_2.jpg"),
  world_3: require("../assets/art/world_3.jpg"),
  world_4: require("../assets/art/world_4.jpg"),
  world_5: require("../assets/art/world_5.jpg"),
  world_6: require("../assets/art/world_6.jpg"),
  painting_1: require("../assets/art/painting_1.jpg"),
  painting_2: require("../assets/art/painting_2.jpg"),
  painting_3: require("../assets/art/painting_3.jpg"),
  painting_4: require("../assets/art/painting_4.jpg"),
  painting_5: require("../assets/art/painting_5.jpg"),
  painting_6: require("../assets/art/painting_6.jpg"),
  icon_undo: require("../assets/art/icon_undo.png"),
  icon_reset: require("../assets/art/icon_reset.png"),
  icon_hint: require("../assets/art/icon_hint.png"),
  icon_gear: require("../assets/art/icon_gear.png"),
  icon_back: require("../assets/art/icon_back.png"),
  icon_lock: require("../assets/art/icon_lock.png"),
  icon_key: require("../assets/art/icon_key.png"),
  icon_drop: require("../assets/art/icon_drop.png"),
  icon_daily: require("../assets/art/icon_daily.png"),
  icon_shop: require("../assets/art/icon_shop.png"),
  icon_map: require("../assets/art/icon_map.png"),
  icon_gift: require("../assets/art/icon_gift.png"),
  icon_help: require("../assets/art/icon_help.png"),
  star_gold: require("../assets/art/star_gold.png"),
  star_empty: require("../assets/art/star_empty.png"),
  fx_sunburst: require("../assets/art/fx_sunburst.png"),
} as const;
export type ArtId = keyof typeof art;

/** Chapter N's world backdrop and its reveal painting (6 chapters). */
const WORLDS = [art.world_1, art.world_2, art.world_3, art.world_4, art.world_5, art.world_6];
const PAINTINGS = [art.painting_1, art.painting_2, art.painting_3, art.painting_4, art.painting_5, art.painting_6];
export const worldArt = (chapter: number) => WORLDS[(Math.max(1, chapter) - 1) % WORLDS.length];
export const paintingArt = (chapter: number) => PAINTINGS[(Math.max(1, chapter) - 1) % PAINTINGS.length];
/** Reveal paintings are 4:3 (720x540). */
export const PAINTING_ASPECT = 540 / 720;

/**
 * Columns to cut a chapter painting into, one piece per level: the widest of
 * 5/4/3/6/2 that fills every row (10 levels → 5×2, 6 → 3×2, 12 → 4×3);
 * otherwise the smallest column count whose last row is nearly full.
 */
export function pieceCols(n: number): number {
  for (const c of [5, 4, 3, 6, 2]) if (n % c === 0 && n / c <= c) return c;
  return Math.max(1, Math.min(5, Math.ceil(Math.sqrt(n * (4 / 3)))));
}
