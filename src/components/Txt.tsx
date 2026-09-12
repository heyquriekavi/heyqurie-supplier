import { Text, type TextProps } from 'react-native';

import { colors, font, type } from '@/theme/tokens';

type Variant = keyof typeof type;
type Weight = keyof typeof font;

type Props = TextProps & {
  v?: Variant;
  w?: Weight;
  color?: string;
  /** Tabular numerals for amounts that line up. */
  num?: boolean;
  center?: boolean;
  caps?: boolean;
};

const defaultWeight: Record<Variant, Weight> = {
  display: 'bold',
  title: 'bold',
  heading: 'semibold',
  body: 'regular',
  secondary: 'regular',
  caption: 'medium',
};

/** The one text component. Sets the font family so nothing falls back to system. */
export function Txt({ v = 'body', w, color = colors.ink, num, center, caps, style, ...rest }: Props) {
  const size = type[v];
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: font[w ?? defaultWeight[v]],
          fontSize: size,
          lineHeight: Math.round(size * 1.4),
          color,
        },
        num && { fontVariant: ['tabular-nums'] },
        center && { textAlign: 'center' },
        caps && { textTransform: 'uppercase', letterSpacing: 0.8 },
        style,
      ]}
    />
  );
}
