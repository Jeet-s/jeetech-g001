import { Fredoka_600SemiBold, Fredoka_700Bold } from "@expo-google-fonts/fredoka";
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";

/**
 * Typography. Fredoka (rounded, friendly) carries the brand and headings;
 * Nunito carries body + numbers. Loaded once in App.tsx via useFonts; every
 * screen references these family names through the <Txt> component so the game
 * never falls back to the system font (which the quality bar rejects).
 */
export const fontMap = {
  Fredoka600: Fredoka_600SemiBold,
  Fredoka700: Fredoka_700Bold,
  Nunito600: Nunito_600SemiBold,
  Nunito700: Nunito_700Bold,
  Nunito800: Nunito_800ExtraBold,
} as const;

export const font = {
  display: "Fredoka700", // big titles, brand, buttons
  heading: "Fredoka600", // section headings, level names
  body: "Nunito700", // emphasised body + stats
  label: "Nunito600", // small labels
  black: "Nunito800", // loudest numbers (stars, coins)
} as const;

export type FontWeight = keyof typeof font;
