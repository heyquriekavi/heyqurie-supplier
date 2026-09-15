import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PersonRow } from '@/components/PersonRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { getPeople, personSummary } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees } from '@/lib/format';
import type { PersonKind } from '@/lib/types';
import { colors, space } from '@/theme/tokens';

/** Who owes money, worst first. Shops owe us; we owe brands. */
export default function Dues() {
  const [side, setSide] = useState<PersonKind>('customer');
  const txns = useAppState((s) => s.txns);
  const people = useAppState((s) => s.people);

  const { rows, overdue, upcoming } = useMemo(() => {
    const list = getPeople(side)
      .map((p) => ({ person: p, summary: personSummary(p.id) }))
      .filter((r) => r.summary.duePaise + r.summary.upcomingPaise > 0)
      // Overdue first, then by size: the one to ring this morning is at the top.
      .sort((a, b) =>
        b.summary.duePaise - a.summary.duePaise ||
        b.summary.upcomingPaise - a.summary.upcomingPaise);
    return {
      rows: list,
      overdue: list.reduce((n, r) => n + r.summary.duePaise, 0),
      upcoming: list.reduce((n, r) => n + r.summary.upcomingPaise, 0),
    };
  }, [side, txns, people]);

  const shops = side === 'customer';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader title="Dues" />
      <Segmented<PersonKind>
        options={[
          { key: 'customer', label: 'Shops owe us' },
          { key: 'supplier', label: 'We owe brands' },
        ]}
        value={side}
        onChange={setSide}
      />
      <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg, paddingBottom: space.sm }}>
        <StatTile
          label={shops ? 'Overdue to collect' : 'Overdue to pay'}
          value={rupees(overdue)}
          sub={overdue > 0 ? 'past the due date' : 'nothing late'}
          subColor={overdue > 0 ? colors.red : colors.muted}
        />
        <StatTile
          label="Not due yet"
          value={rupees(upcoming)}
          sub={`${rows.length} ${shops ? (rows.length === 1 ? 'shop' : 'shops') : rows.length === 1 ? 'brand' : 'brands'}`}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.person.id}
        renderItem={({ item }) => <PersonRow person={item.person} summary={item.summary} />}
        ListEmptyComponent={
          <Txt color={colors.muted} center style={{ padding: space.xxl }}>
            {shops ? 'No shop owes you anything right now.' : 'You owe no brand anything right now.'}
          </Txt>
        }
        contentContainerStyle={{ paddingBottom: space.xxl }}
      />
    </SafeAreaView>
  );
}
