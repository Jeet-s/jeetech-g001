/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system
 * fonts. The builder re-skins a game by editing `palette` (from the art bible),
 * not by hard-coding styles in components.
 */
export const palette = {
  // Brand
  primary: "#7B5CFF",
  primaryDark: "#5A3FE0",
  secondary: "#2FD3C1",
  secondaryDark: "#1BA597",
  accent: "#FFC23D",
  accentDark: "#E09A12",
  danger: "#FF5A6E",
  dangerDark: "#D8384D",
  // Surfaces
  bgTop: "#2B1E6B",
  bgBottom: "#120C33",
  surface: "#FFFFFF",
  surfaceAlt: "#F1EEFF",
  surfaceDark: "#24195A",
  ink: "#2A1F5C",
  inkSoft: "#6E66A3",
  onPrimary: "#FFFFFF",
  // Game feedback
  star: "#FFD24A",
  coin: "#FFC23D",
  success: "#3DDC84",
};

export const fonts = {
  display: "Fredoka_700Bold",
  displayMedium: "Fredoka_600SemiBold",
  body: "Nunito_700Bold",
  bodyRegular: "Nunito_600SemiBold",
};

export const radius = { sm: 12, md: 18, lg: 26, xl: 36, pill: 999 };
export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28, xxl: 40 };

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 44, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 30 },
  heading: { fontFamily: fonts.displayMedium, fontSize: 22 },
  body: { fontFamily: fonts.body, fontSize: 16 },
  caption: { fontFamily: fonts.bodyRegular, fontSize: 13 },
  button: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.6 },
};

/** Soft drop shadow used on cards and buttons (iOS + Android). */
export const shadow = {
  shadowColor: "#0B0626",
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 10,
};

/** Spring presets — use these so every animation in the game feels consistent. */
export const springs = {
  press: { damping: 14, stiffness: 320, mass: 0.6 },
  pop: { damping: 9, stiffness: 220, mass: 0.7 },
  gentle: { damping: 18, stiffness: 140, mass: 1 },
};
