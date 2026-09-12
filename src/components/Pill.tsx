import { View } from 'react-native';

import { Txt } from './Txt';
import { colors, radius } from '@/theme/tokens';

/** due: red. confirmed: green. paid: blue. neutral: grey. */
export type PillTone = 'due' | 'confirmed' | 'paid' | 'neutral';

const tones: Record<PillTone, { bg: string; ink: string }> = {
  due: { bg: colors.redSoft, ink: colors.red },
  confirmed: { bg: colors.greenSoft, ink: colors.green },
  paid: { bg: colors.blueSoft, ink: colors.blue },
  neutral: { bg: colors.surfaceMuted, ink: colors.muted },
};

export function Pill({ tone, text }: { tone: PillTone; text: string }) {
  const t = tones[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Txt v="caption" w="semibold" color={t.ink} num>
        {text}
      </Txt>
    </View>
  );
}
