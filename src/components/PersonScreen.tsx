import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { BillsTab } from './BillsTab';
import { ConfirmBar } from './ConfirmBar';
import { IconButton } from './IconButton';
import { ScreenHeader } from './ScreenHeader';
import { Segmented } from './Segmented';
import { Txt } from './Txt';
import { TxnRow } from './TxnRow';
import { getLedger, personSummary } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { deletePerson } from '@/lib/server';
import { useSession } from '@/lib/session';
import type { Strings } from '@/lib/strings';
import { rupees } from '@/lib/format';
import type { PersonKind } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

type Tab = 'txns' | 'bills' | 'details';
/** The history mixes bills and money; this narrows it to one or the other. */
type TxnFilter = 'all' | 'bills' | 'payments';
const FILTERS: TxnFilter[] = ['all', 'bills', 'payments'];

function filterLabel(f: TxnFilter, t: Strings): string {
  return f === 'bills' ? t.filterBills : f === 'payments' ? t.filterPayments : t.filterAll;
}

/** Supplier and customer profiles share one layout; only the labels differ. */
export function PersonScreen({ kind }: { kind: PersonKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('txns');
  const [filter, setFilter] = useState<TxnFilter>('all');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useSession();
  const refresh = useAppState((s) => s.refresh);
  const txnsVersion = useAppState((s) => s.txns.length);
  void txnsVersion;
  const ledger = getLedger(String(id));
  const summary = personSummary(String(id));

  if (!ledger) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
        <ScreenHeader title="Not found" />
        <Txt style={{ padding: space.lg }} color={colors.muted}>
          This {kind === 'supplier' ? 'brand' : 'shop'} is not in your list any more.
        </Txt>
      </SafeAreaView>
    );
  }

  const { person, txns, totalPaise, paidPaise, outstandingPaise } = ledger;
  const supplier = kind === 'supplier';
  const shownTxns = filter === 'all' ? txns : txns.filter((x) => (filter === 'bills' ? x.kind === 'bill' : x.kind === 'payment'));
  const cycleFilter = () => setFilter(FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length]);
  const cells = [
    { label: supplier ? 'Total purchases' : 'Total billed', value: totalPaise, color: colors.ink },
    { label: supplier ? 'Paid' : 'Collected', value: paidPaise, color: colors.blue },
    { label: supplier ? 'Outstanding' : 'To collect', value: outstandingPaise, color: summary.duePaise > 0 ? colors.red : outstandingPaise > 0 ? colors.green : colors.blue },
  ];

  const details = [
    { label: 'Phone', value: person.phone },
    { label: 'GSTIN', value: person.gstin ?? 'Not added' },
    { label: 'Credit days', value: `${person.creditDays} days` },
    { label: 'Type', value: supplier ? 'Brand' : 'Shop' },
    ...(supplier ? [] : [{ label: 'Beat', value: person.beat ?? 'Not set' }, { label: 'On Qurie', value: person.paired ? 'Yes, bills land in their app' : 'No, gets WhatsApp PDF' }]),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenHeader
        center={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={person.name} size={40} />
            <View style={{ flex: 1 }}>
              <Txt v="heading" numberOfLines={1}>
                {person.name}
              </Txt>
              <Txt v="secondary" color={colors.muted} num>
                {person.phone}
              </Txt>
            </View>
          </View>
        }
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton name="ellipsis-vertical" label="More actions" onPress={() => { setTab('details'); setConfirm(true); }} />
          </View>
        }
      />

      <Segmented<Tab>
        options={[
          { key: 'txns', label: 'Transactions' },
          { key: 'bills', label: supplier ? 'Bills' : 'Invoices' },
          { key: 'details', label: 'Details' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
          {cells.map((c, i) => (
            <View key={c.label} style={{ flex: 1, padding: space.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
              <Txt v="caption" color={colors.muted} numberOfLines={2}>
                {c.label}
              </Txt>
              <Txt v="heading" w="bold" num color={c.color} adjustsFontSizeToFit numberOfLines={1}>
                {rupees(c.value)}
              </Txt>
            </View>
          ))}
        </View>

        {tab === 'bills' ? (
          <View style={{ marginTop: space.xl }}>
            <BillsTab txns={txns} kind={kind} />
          </View>
        ) : tab === 'txns' ? (
          <View style={{ marginTop: space.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
              <Txt v="heading">Transaction history</Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${filterLabel(filter, t)}. Tap to change.`}
                onPress={cycleFilter}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  borderWidth: 1,
                  borderColor: filter === 'all' ? colors.border : colors.forest,
                  backgroundColor: filter === 'all' ? 'transparent' : colors.forestSoft,
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  opacity: pressed ? 0.6 : 1,
                })}>
                <Txt v="caption" w="semibold" color={filter === 'all' ? colors.ink : colors.forest}>
                  {filterLabel(filter, t)}
                </Txt>
                <Ionicons name="swap-vertical" size={13} color={filter === 'all' ? colors.ink : colors.forest} />
              </Pressable>
            </View>
            {shownTxns.length === 0 ? (
              <Txt color={colors.muted} style={{ paddingVertical: space.xl }}>
                {txns.length === 0
                  ? supplier
                    ? 'No bills from this brand yet.'
                    : 'No invoices to this shop yet.'
                  : filter === 'bills'
                    ? supplier
                      ? 'No bills from this brand yet.'
                      : 'No invoices to this shop yet.'
                    : supplier
                      ? 'No payments to this brand yet.'
                      : 'No payments from this shop yet.'}
              </Txt>
            ) : (
              shownTxns.map((x) => <TxnRow key={x.id} txn={x} kind={kind} />)
            )}
          </View>
        ) : (
          <View style={{ marginTop: space.xl, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
            {confirm ? (
              <View style={{ padding: space.md }}>
                <ConfirmBar
                  text={`Delete ${person.name}? Only possible when there are no bills.`}
                  busy={busy}
                  onCancel={() => setConfirm(false)}
                  onConfirm={async () => {
                    setBusy(true);
                    setNotice(null);
                    try {
                      await deletePerson(person.id);
                      await refresh();
                      router.canGoBack() ? router.back() : router.replace('/people');
                    } catch (e) {
                      setNotice((e as Error)?.message ?? 'Could not delete');
                      setConfirm(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            ) : null}
            {notice ? (
              <Txt v="secondary" color={colors.red} style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
                {notice}
              </Txt>
            ) : null}
            {details.map((d, i) => (
              <View key={d.label} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Txt color={colors.muted}>{d.label}</Txt>
                <Txt w="medium" num>
                  {d.value}
                </Txt>
              </View>
            ))}
            {!confirm ? (
              <Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={({ pressed }) => ({ padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 })}>
                <Txt w="semibold" color={colors.red}>
                  Delete {supplier ? 'brand' : 'shop'}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
