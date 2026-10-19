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
} as const;
export type ArtId = keyof typeof art;
