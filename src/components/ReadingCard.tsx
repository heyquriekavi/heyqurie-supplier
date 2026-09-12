import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Txt } from './Txt';
import { colors, radius, space } from '@/theme/tokens';

const ROWS: { label: string; width: number }[] = [
  { label: 'Supplier', width: 190 },
  { label: 'Bill no.', width: 110 },
  { label: 'Date', width: 96 },
  { label: 'Due', width: 48 },
  { label: 'Total', width: 124 },
  { label: 'Items', width: 72 },
];

/**
 * Shown in Qurie's bubble while a photo is being read: the confirm card's
 * shape with its values still blank and breathing, so the owner sees that
 * something is happening and what will appear. Replaced by the real card.
 */
export function ReadingCard({ what = 'bill', labels }: { what?: 'bill' | 'invoice'; labels?: string[] }) {
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const glow = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const rows = labels ? ROWS.map((r, i) => ({ ...r, label: labels[i] ?? r.label })) : ROWS;

  return (
    <View style={{ marginTop: space.sm, gap: space.sm }}>
      <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
        {rows.map((r, i) => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border }} />
            <Txt v="secondary" color={colors.muted} style={{ width: 64 }}>
              {r.label}
            </Txt>
            <Animated.View style={[{ height: 12, width: r.width, maxWidth: '70%', borderRadius: 6, backgroundColor: colors.limeSoft }, glow]} />
          </View>
        ))}
      </View>
      <Txt v="caption" color={colors.muted}>
        {what === 'invoice' ? 'Reading the invoice…' : 'Reading the bill…'}
      </Txt>
    </View>
  );
}
