import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddSheet } from '@/components/AddSheet';
import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { QurieSheet } from '@/components/QurieSheet';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getShop, getSummary } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { useSession } from '@/lib/session';
import { greeting, rupees } from '@/lib/format';
import type { Period } from '@/lib/types';
import { colors, space } from '@/theme/tokens';

const periodLabel: Record<Period, string> = { today: 'Today', week: 'This week', month: 'This month' };
const nextPeriod: Record<Period, Period> = { month: 'week', week: 'today', today: 'month' };

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const shop = { ...getShop(), name: user?.shop?.name ?? getShop().name, city: user?.shop?.city ?? getShop().city };
  const period = useAppState((s) => s.period);
  const setPeriod = useAppState((s) => s.setPeriod);
  const summary = getSummary(period);
  const overdue = summary.change;
  const [topHeight, setTopHeight] = useState(0);
  const refresh = useAppState((s) => s.refresh);
  const txnCount = useAppState((s) => s.txns.length);
  void txnCount;
  useEffect(() => {
    if (user?.shop_id) void refresh();
  }, [user?.shop_id, refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {/* Everything behind the sheet: shop mark (opens profile), bell, tiles. */}
      <SafeAreaView
        edges={['top']}
        onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}
        style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open shop profile"
            onPress={() => router.push('/profile')}
            style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.6 : 1 })}>
            <Avatar name={shop.name} shape="square" size={52} />
            <View style={{ flex: 1 }}>
              <Txt v="caption" caps color={colors.muted}>
                {greeting()}
              </Txt>
              <Txt v="heading" w="semibold" numberOfLines={1}>
                {shop.name}
              </Txt>
            </View>
          </Pressable>
          <IconButton name="people-outline" label="Shops and brands" variant="ring" onPress={() => router.push('/people')} />
          <IconButton
            name="notifications-outline"
            label="Reminders"
            variant="ring"
            dot
            onPress={() => Alert.alert('Reminders', 'Kumar Traders ₹52,000 overdue 10 days. Balaji Electronics ₹52,600 due today.')}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt v="title">At a glance</Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Period: ${periodLabel[period]}. Tap to change`}
            onPress={() => setPeriod(nextPeriod[period])}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Txt v="caption" caps w="semibold">
              {periodLabel[period]}
            </Txt>
            <Ionicons name="chevron-down" size={16} color={colors.ink} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatTile label="Billed to shops" value={rupees(summary.salesInPaise)} sub={periodLabel[period]} tone="lime" />
          <StatTile
            label="To collect"
            value={rupees(summary.billsOutPaise)}
            sub={overdue > 0 ? `${rupees(overdue)} overdue` : 'Nothing overdue'}
            subColor={overdue > 0 ? colors.red : colors.green}
          />
        </View>
      </SafeAreaView>

      <QurieSheet topBlockHeight={topHeight} />
      <AddSheet />
    </View>
  );
}
