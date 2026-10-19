import { Text, type TextProps, type TextStyle, type StyleProp } from "react-native";
import { font, type FontWeight } from "./fonts";

/**
 * Text that always renders in one of the game fonts. Pass `weight` to pick a
 * family; `size`/`color` are shortcuts for the common case. Any extra style
 * overrides win.
 */
export function Txt({
  weight = "body",
  size,
  color,
  style,
  children,
  ...rest
}: TextProps & {
  weight?: FontWeight;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      {...rest}
      allowFontScaling={false}
      style={[{ fontFamily: font[weight] }, size != null && { fontSize: size }, color != null && { color }, style]}
    >
      {children}
    </Text>
  );
}
