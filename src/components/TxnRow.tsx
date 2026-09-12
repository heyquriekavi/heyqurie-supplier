import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Pill } from './Pill';
import { Txt } from './Txt';
import { billStatus } from '@/lib/api';
import { statusLabel } from '@/lib/status';
import { rupees, shortDate } from '@/lib/format';
import type { PersonKind, Txn } from '@/lib/types';
import { colors, space } from '@/theme/tokens';

const modeLabel: Record<NonNullable<Txn['mode']>, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', other: 'Other' };

export function TxnRow({ txn, kind }: { txn: Txn; kind: PersonKind }) {
  const router = useRouter();
  const bill = txn.kind === 'bill';
  const status = billStatus(txn);
  const title = bill
    ? `${kind === 'supplier' ? 'Purchase bill' : 'Invoice'}${txn.number ? ` ${txn.number}` : ''}`
    : kind === 'supplier'
      ? 'Payment'
      : 'Collection';
  const sub = bill
    ? [txn.description, txn.dueDate && status !== 'paid' ? `due ${shortDate(txn.dueDate)}` : null].filter(Boolean).join(' · ')
    : [txn.mode ? modeLabel[txn.mode] : null, txn.reference ? `Ref ${txn.reference}` : null].filter(Boolean).join(' · ');
  const pillText = bill
    ? statusLabel(status === 'paid' ? 'settled' : status, { totalPaise: txn.amountPaise, paidPaise: txn.paidPaise ?? 0, dueDate: txn.dueDate }, kind === 'customer')
    : kind === 'customer'
      ? 'Collected'
      : 'Paid';

  return (
    <Pressable
      accessibilityRole={bill ? 'button' : undefined}
      disabled={!bill}
      onPress={() => router.push({ pathname: '/bill/[id]', params: { id: txn.id } })}
      style={({ pressed }) => ({ gap: space.xs, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 })}>
      <Txt v="caption" color={colors.muted}>
        {shortDate(txn.date)}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bill ? colors.surfaceMuted : colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={bill ? (txn.hasImage ? 'image-outline' : 'document-text-outline') : 'cash-outline'} size={20} color={bill ? colors.ink : colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt w="semibold">{title}</Txt>
          <Txt v="secondary" color={colors.muted}>
            {sub}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Txt v="body" w="semibold" num>
            {rupees(txn.amountPaise)}
          </Txt>
          <Pill tone={status} text={pillText} />
        </View>
        {bill ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
      </View>
    </Pressable>
  );
}
