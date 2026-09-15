import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pill, type PillTone } from '@/components/Pill';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { getPerson } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees, shortDate } from '@/lib/format';
import { orderTotal } from '@/lib/orders';
import type { Order, OrderStage } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

// The same four tones the bill pills use, so a colour means one thing app-wide.
const STAGE: Record<OrderStage, { label: string; tone: PillTone }> = {
  shop: { label: 'Choosing the shop', tone: 'neutral' },
  newShop: { label: 'Adding the shop', tone: 'neutral' },
  items: { label: 'Being written', tone: 'neutral' },
  confirm: { label: 'Waiting for you', tone: 'due' },
  sent: { label: 'With billing', tone: 'paid' },
  billed: { label: 'Billed', tone: 'confirmed' },
  cancelled: { label: 'Dropped', tone: 'neutral' },
};

/** Every order taken, newest first. Orders live on this phone until billing returns an invoice. */
export default function Orders() {
  const router = useRouter();
  const orders = useAppState((s) => s.orders);

  const rows = useMemo(
    () => Object.values(orders).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [orders],
  );
  const open = rows.filter((o) => o.stage !== 'billed' && o.stage !== 'cancelled').length;

  const row = ({ item }: { item: Order }) => {
    const shop = item.shopId ? getPerson(item.shopId) : undefined;
    const total = orderTotal(item.lines);
    const partial = item.lines.some((l) => !l.ratePaise);
    const stage = STAGE[item.stage];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Order ${item.number} for ${shop?.name ?? 'no shop'}`}
        // The order's card lives in the chat; that is where it can still be worked on.
        onPress={() => router.push('/')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        })}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cube-outline" size={18} color={colors.muted} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Txt w="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {shop?.name ?? 'No shop chosen'}
            </Txt>
            <Txt w="semibold" num>
              {total ? `${rupees(total)}${partial ? ' +' : ''}` : '—'}
            </Txt>
          </View>
          <Txt v="caption" color={colors.muted} num numberOfLines={1}>
            {[item.number, `${item.lines.length} ${item.lines.length === 1 ? 'item' : 'items'}`, shortDate(item.createdAt)].join(' · ')}
          </Txt>
          <Pill tone={stage.tone} text={stage.label} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader title="Orders" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <Txt v="secondary" color={colors.muted}>
          {rows.length} {rows.length === 1 ? 'order' : 'orders'}
        </Txt>
        <Txt v="secondary" w="semibold" color={open ? colors.forest : colors.muted}>
          {open} still open
        </Txt>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(o) => o.id}
        renderItem={row}
        ListEmptyComponent={
          <Txt color={colors.muted} center style={{ padding: space.xxl }}>
            No orders yet. Say &ldquo;Balaji ka order: 20 fan&rdquo; in the chat, or use the plus.
          </Txt>
        }
        contentContainerStyle={{ paddingBottom: space.xxl, borderRadius: radius.card }}
      />
    </SafeAreaView>
  );
}
