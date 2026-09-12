import { View } from 'react-native';

import { Txt } from './Txt';
import { colors, radius, space } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  sub: string;
  tone?: 'lime' | 'plain';
  subColor?: string;
};

/** The two "at a glance" tiles from the home reference. */
export function StatTile({ label, value, sub, tone = 'plain', subColor }: Props) {
  const lime = tone === 'lime';
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: lime ? colors.tile : colors.surface,
        borderRadius: radius.tile,
        padding: space.lg,
        gap: space.sm,
        borderWidth: lime ? 0 : 1,
        borderColor: colors.border,
      }}>
      <Txt v="caption" caps color={lime ? colors.onTile : colors.muted}>
        {label}
      </Txt>
      <Txt v="title" w="bold" num numberOfLines={1} style={{ fontSize: 25, lineHeight: 32 }} color={lime ? colors.onTileStrong : colors.ink}>
        {value}
      </Txt>
      <Txt v="secondary" w="medium" color={subColor ?? (lime ? colors.onTile : colors.green)}>
        {sub}
      </Txt>
    </View>
  );
}
