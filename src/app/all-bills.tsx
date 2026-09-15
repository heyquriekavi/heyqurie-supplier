import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pill } from '@/components/Pill';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
import { Txt } from '@/components/Txt';
import { getPerson } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees, shortDate } from '@/lib/format';
import { statusLabel, statusOf, statusTone } from '@/lib/status';
import type { Txn } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type Side = 'all' | 'sale' | 'purchase';

function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-');
  const i = Number(m) - 1;
  return MONTHS[i] ? `${MONTHS[i]} ${y}` : iso.slice(0, 7);
}

/** Every bill and invoice in one place, newest first, grouped by month. */
export default function AllBills() {
  const router = useRouter();
  const [side, setSide] = useState<Side>('all');
  const txns = useAppState((s) => s.txns);
  const people = useAppState((s) => s.people);

  const { sections, total, count } = useMemo(() => {
    const bills = txns
      .filter((t) => t.kind === 'bill')
      .map((t) => ({ txn: t, person: getPerson(t.personId) }))
      // A bill against a shop is one we raised; against a brand, one we were given.
      .filter((r) => (side === 'all' ? true : side === 'sale' ? r.person?.kind === 'customer' : r.person?.kind === 'supplier'))
      .sort((a, b) => (a.txn.date < b.txn.date ? 1 : -1));

    const out: { title: string; sum: number; data: typeof bills }[] = [];
    for (const b of bills) {
      const key = monthLabel(b.txn.date);
      const last = out[out.length - 1];
      if (last && last.title === key) {
        last.data.push(b);
        last.sum += b.txn.amountPaise;
      } else {
        out.push({ title: key, sum: b.txn.amountPaise, data: [b] });
      }
    }
    return { sections: out, total: bills.reduce((n, b) => n + b.txn.amountPaise, 0), count: bills.length };
  }, [txns, people, side]);

  const row = ({ item }: { item: { txn: Txn; person: ReturnType<typeof getPerson> } }) => {
    const t = item.txn;
    const money = { totalPaise: t.amountPaise, paidPaise: t.paidPaise ?? 0, dueDate: t.dueDate };
    const state = statusOf(money);
    const sale = item.person?.kind === 'customer';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.number ?? 'Bill'}, ${rupees(t.amountPaise)}`}
        onPress={() => router.push({ pathname: '/bill/[id]', params: { id: t.id } })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        })}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={t.hasImage ? 'image-outline' : 'document-text-outline'} size={18} color={t.hasImage ? colors.forest : colors.muted} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Txt w="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {item.person?.name ?? 'Unknown'}
            </Txt>
            <Txt w="semibold" num>
              {rupees(t.amountPaise)}
            </Txt>
          </View>
          <Txt v="caption" color={colors.muted} num numberOfLines={1}>
            {[sale ? 'Invoice' : 'Bill', t.number, shortDate(t.date)].filter(Boolean).join(' · ')}
          </Txt>
          <Pill tone={statusTone[state]} text={statusLabel(state, money, sale)} />
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader title="All bills" />
      <Segmented<Side>
        options={[
          { key: 'all', label: 'All' },
          { key: 'sale', label: 'To shops' },
          { key: 'purchase', label: 'From brands' },
        ]}
        value={side}
        onChange={setSide}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <Txt v="secondary" color={colors.muted}>
          {count} {count === 1 ? 'bill' : 'bills'}
        </Txt>
        <Txt v="secondary" w="semibold" num>
          {rupees(total)}
        </Txt>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.txn.id}
        renderItem={row}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs, backgroundColor: colors.paper }}>
            <Txt v="caption" caps color={colors.muted}>
              {section.title}
            </Txt>
            <Txt v="secondary" w="semibold" num color={colors.muted}>
              {rupees(section.sum)}
            </Txt>
          </View>
        )}
        ListEmptyComponent={
          <Txt color={colors.muted} center style={{ padding: space.xxl }}>
            No bills yet. Add one from the chat.
          </Txt>
        }
        contentContainerStyle={{ paddingBottom: space.xxl, borderRadius: radius.card }}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}
