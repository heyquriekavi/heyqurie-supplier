import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { EditRow } from './EditRow';
import { Txt } from './Txt';
import { dueFor, getPerson } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees } from '@/lib/format';
import type { PayMode } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

const MODES: { key: PayMode; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'bank', label: 'Bank' },
  { key: 'cheque', label: 'Cheque' },
];

function Line() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

/**
 * Money coming in, as Qurie read it. Nothing reaches the server until
 * "Record it": a mis-heard amount is a wrong balance, and balances are what
 * the owner trusts this app for.
 */
export function PaymentCard({ collectionId }: { collectionId: string }) {
  const c = useAppState((s) => s.collections[collectionId]);
  const editCollection = useAppState((s) => s.editCollection);
  const confirmCollection = useAppState((s) => s.confirmCollection);
  const changeCollectionShop = useAppState((s) => s.changeCollectionShop);
  const cancelCollection = useAppState((s) => s.cancelCollection);
  if (!c) return null;

  const shop = c.shopId ? getPerson(c.shopId) : undefined;
  const active = c.stage === 'confirm';
  const owed = c.shopId ? dueFor(c.shopId) : 0;
  const amount = c.amountPaise ?? 0;
  const over = amount > 0 && owed > 0 && amount > owed;
  const left = Math.max(owed - amount, 0);

  return (
    <View style={{ marginTop: space.sm, gap: space.sm }}>
      <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <EditRow
          label="From"
          value={shop?.name}
          dot={shop ? colors.green : colors.red}
          caption={shop ? (owed > 0 ? `Owes ${rupees(owed)}` : 'Owes nothing right now') : 'Tap to choose'}
          placeholder="Not chosen"
          onPress={active ? () => changeCollectionShop(collectionId) : undefined}
          editable={active}
        />
        <Line />
        <EditRow
          label="Amount"
          value={amount || undefined}
          kind="money"
          dot={amount ? (over ? colors.amber : colors.green) : colors.red}
          caption={over ? `More than the ${rupees(owed)} owed` : amount && owed ? `${rupees(left)} would be left` : undefined}
          onChange={(v) => editCollection(collectionId, { amountPaise: Number(v ?? 0) })}
          editable={active}
        />

        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10, gap: 7 }}>
          <Txt v="caption" color={colors.muted}>
            How it came in
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {MODES.map((m) => {
              const on = (c.mode ?? 'cash') === m.key;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={m.label}
                  onPress={active ? () => editCollection(collectionId, { mode: m.key }) : undefined}
                  disabled={!active}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: on ? colors.forest : colors.border,
                    backgroundColor: on ? colors.forestSoft : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Txt v="caption" w="semibold" color={on ? colors.forest : colors.muted}>
                    {m.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {active ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => confirmCollection(collectionId)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.button,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Txt v="secondary" w="semibold" color={colors.onButton}>
              {shop ? `Record ${rupees(amount)}` : 'Choose a shop first'}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => cancelCollection(collectionId)}
            hitSlop={8}
            style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <Txt v="caption" color={c.stage === 'done' ? colors.green : colors.muted}>
          {c.stage === 'done' ? 'Recorded' : c.stage === 'cancelled' ? 'Dropped' : 'Choosing the shop'}
        </Txt>
      )}
    </View>
  );
}
