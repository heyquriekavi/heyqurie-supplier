import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Pill } from './Pill';
import { Txt } from './Txt';
import { rupees, shortDate } from '@/lib/format';
import { statusLabel, statusOf, statusTone } from '@/lib/status';
import type { PersonKind, Txn } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "20 Sep" within this year, "20 Sep 2025" outside it, so the caption line fits. */
function compact(iso: string): string {
  const full = shortDate(iso);
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? full.replace(/ \d{4}$/, '') : full;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-');
  const i = Number(m) - 1;
  return MONTHS[i] ? `${MONTHS[i]} ${y}` : iso.slice(0, 7);
}

/**
 * Only the bills, newest first, grouped by month with a total for each. The
 * Transactions tab mixes bills and money in one running account; this one is
 * the paperwork: what was billed, what is left on it, and whether the soft
 * copy is stored.
 */
export function BillsTab({ txns, kind }: { txns: Txn[]; kind: PersonKind }) {
  const router = useRouter();
  const sale = kind === 'customer';
  const bills = txns.filter((t) => t.kind === 'bill').sort((a, b) => (a.date < b.date ? 1 : -1));

  if (!bills.length) {
    return (
      <Txt color={colors.muted} style={{ paddingVertical: space.xl }}>
        {sale ? 'No invoices to this shop yet.' : 'No bills from this brand yet.'}
      </Txt>
    );
  }

  const months: { key: string; label: string; rows: Txn[] }[] = [];
  for (const b of bills) {
    const key = b.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.rows.push(b);
    else months.push({ key, label: monthLabel(b.date), rows: [b] });
  }

  const withPhoto = bills.filter((b) => b.hasImage).length;

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="heading">{sale ? 'Invoices' : 'Bills'}</Txt>
        <Txt v="caption" color={colors.muted} num>
          {bills.length} total · {withPhoto} with a soft copy
        </Txt>
      </View>

      {months.map((m) => {
        const sum = m.rows.reduce((n, b) => n + b.amountPaise, 0);
        return (
          <View key={m.key} style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Txt v="caption" caps color={colors.muted}>
                {m.label}
              </Txt>
              <Txt v="secondary" w="semibold" num color={colors.muted}>
                {rupees(sum)}
              </Txt>
            </View>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {m.rows.map((b, i) => {
                const money = { totalPaise: b.amountPaise, paidPaise: b.paidPaise ?? 0, dueDate: b.dueDate };
                const state = statusOf(money);
                const left = Math.max(b.amountPaise - (b.paidPaise ?? 0), 0);
                return (
                  <Pressable
                    key={b.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.number ?? 'Bill'}, ${rupees(b.amountPaise)}`}
                    onPress={() => router.push({ pathname: '/bill/[id]', params: { id: b.id } })}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingHorizontal: space.md,
                      paddingVertical: space.md,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                    })}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={b.hasImage ? 'image-outline' : 'document-text-outline'} size={19} color={b.hasImage ? colors.forest : colors.muted} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                        <Txt w="semibold" style={{ flex: 1 }} numberOfLines={1}>
                          {b.number ? `${sale ? 'Invoice' : 'Bill'} ${b.number}` : sale ? 'Invoice' : 'Bill'}
                        </Txt>
                        <Txt w="semibold" num>
                          {rupees(b.amountPaise)}
                        </Txt>
                      </View>
                      <Txt v="caption" color={colors.muted} num numberOfLines={1}>
                        {[compact(b.date), b.itemCount ? `${b.itemCount} ${b.itemCount === 1 ? 'item' : 'items'}` : null, b.dueDate && state !== 'settled' ? `due ${compact(b.dueDate)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Txt>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Pill tone={statusTone[state]} text={statusLabel(state, money, sale)} />
                        {left > 0 && left !== b.amountPaise ? (
                          <Txt v="caption" color={colors.muted} num>
                            {rupees(left)} left
                          </Txt>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
