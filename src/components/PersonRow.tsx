import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar } from './Avatar';
import { Pill, type PillTone } from './Pill';
import { Txt } from './Txt';
import { rupees, shortDate } from '@/lib/format';
import type { Person, PersonKind, PersonSummary } from '@/lib/types';
import { colors, space } from '@/theme/tokens';

/** Which pill a person gets: red if anything is due, green if bills are confirmed and not yet due, blue if all paid. */
export function personPill(s: PersonSummary, kind: PersonKind = 'customer'): { tone: PillTone; text: string } {
  if (s.duePaise > 0) return { tone: 'due', text: `${rupees(s.duePaise)} due` };
  if (s.upcomingPaise > 0) return { tone: 'confirmed', text: `${rupees(s.upcomingPaise)} confirmed` };
  return { tone: 'paid', text: kind === 'customer' ? 'Collected' : 'Paid' };
}

export function PersonRow({ person, summary }: { person: Person; summary: PersonSummary }) {
  const router = useRouter();
  const path = person.kind === 'supplier' ? '/supplier/[id]' : '/customer/[id]';
  const pill = personPill(summary, person.kind);
  const detail = [
    person.beat ?? null,
    summary.billCount ? `${summary.billCount} ${summary.billCount === 1 ? 'invoice' : 'invoices'}` : 'No invoices yet',
    summary.lastBillDate ? `last ${shortDate(summary.lastBillDate)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.name}, ${pill.text}`}
      onPress={() => router.push({ pathname: path, params: { id: person.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      })}>
      <Avatar name={person.name} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt w="semibold" numberOfLines={1}>
          {person.name}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt v="secondary" color={colors.muted} num>
            {person.phone || 'No phone'}
          </Txt>
          {person.paired ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.forestSoft, borderRadius: 24, paddingHorizontal: 8, paddingVertical: 1 }}>
              <Ionicons name="sparkles" size={11} color={colors.forest} />
              <Txt v="caption" color={colors.forest}>
                Qurie
              </Txt>
            </View>
          ) : person.gstin ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Ionicons name="shield-checkmark" size={13} color={colors.green} />
              <Txt v="caption" color={colors.green}>
                GSTIN
              </Txt>
            </View>
          ) : null}
        </View>
        <Txt v="caption" color={colors.muted}>
          {detail}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Pill tone={pill.tone} text={pill.text} />
        {pill.tone === 'due' && summary.upcomingPaise > 0 ? (
          <Txt v="caption" color={colors.green} num>
            +{rupees(summary.upcomingPaise)} confirmed
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}
