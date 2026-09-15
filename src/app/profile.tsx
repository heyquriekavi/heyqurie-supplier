import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { getPeople, personSummary } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees } from '@/lib/format';
import { API_URL } from '@/lib/http';
import { useSession } from '@/lib/session';
import { LANGUAGES } from '@/lib/strings';
import { colors, radius, space } from '@/theme/tokens';

type Row = { label: string; value?: string; onPress?: () => void; danger?: boolean; toggle?: { value: boolean; onChange: () => void } };

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt v="caption" caps color={colors.muted} style={{ paddingHorizontal: space.xs }}>
        {title}
      </Txt>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
        {rows.map((r, i) => (
          <Pressable
            key={r.label}
            accessibilityRole={r.toggle ? 'switch' : 'button'}
            onPress={r.toggle ? r.toggle.onChange : r.onPress}
            disabled={!r.onPress && !r.toggle}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 52,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              gap: space.md,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
            })}>
            <Txt color={r.danger ? colors.red : colors.ink} w={r.danger ? 'semibold' : 'regular'} style={{ flex: 1 }}>
              {r.label}
            </Txt>
            {r.value ? (
              <Txt v="secondary" color={colors.muted} num numberOfLines={1} style={{ maxWidth: '55%' }}>
                {r.value}
              </Txt>
            ) : null}
            {r.toggle ? (
              <Switch value={r.toggle.value} onValueChange={r.toggle.onChange} trackColor={{ true: colors.forest, false: colors.border }} thumbColor={colors.surface} />
            ) : r.onPress ? (
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Profile() {
  const router = useRouter();
  const { setLang, signOut, user } = useSession();
  const shop = user?.shop;
  const shopType = shop?.type ? shop.type[0].toUpperCase() + shop.type.slice(1) : undefined;
  const voiceOn = useAppState((s) => s.voiceOn);
  const toggleVoice = useAppState((s) => s.toggleVoice);
  const language = useAppState((s) => s.language);
  const setLanguage = setLang;

  const soon = (what: string, why: string) => () => Alert.alert(what, why);

  const clearChat = useAppState((s) => s.clearChat);
  const orders = useAppState((s) => s.orders);
  const txns = useAppState((s) => s.txns);
  const openOrders = Object.values(orders).filter((o) => o.stage !== 'billed' && o.stage !== 'cancelled').length;
  // What the shops still owe: the number the owner checks first.
  const dueTotal = useMemo(
    () => getPeople('customer').reduce((n, p) => n + personSummary(p.id).duePaise, 0),
    [txns],
  );
  const confirmClearChat = () =>
    Alert.alert(
      'Clear chat history',
      'Removes the conversation from this phone and from the server. Your shops, bills and payments are not touched.',
      [
        { text: 'Cancel', style: 'cancel' as const },
        { text: 'Clear', style: 'destructive' as const, onPress: () => clearChat() },
      ],
    );

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];
  const pickLanguage = () =>
    Alert.alert(
      'Language',
      'Qurie speaks English in this version. Hindi and Tamil are written and will be switched on together.',
      [
        ...LANGUAGES.map((l) => ({
          text: l.ready ? `${l.label} (${l.own})` : `${l.label} (${l.own}) — soon`,
          onPress: () => (l.ready ? setLanguage(l.code) : undefined),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenHeader title="Profile" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar name={shop?.name ?? 'Q'} shape="square" size={72} />
          <View style={{ flex: 1 }}>
            <Txt v="title">{shop?.name ?? 'Your business'}</Txt>
            <Txt v="secondary" color={colors.muted}>
              {[shop?.city, user?.name].filter(Boolean).join(' · ') || 'Tap Edit shop to fill this in'}
            </Txt>
          </View>
        </View>

        <Group
          title="Shop"
          rows={[
            { label: 'Owner phone', value: user?.phone ?? '—' },
            { label: 'GSTIN', value: shop?.gstin || 'Not added', onPress: () => router.push('/edit-shop') },
            { label: 'Shop type', value: shopType ?? '—', onPress: () => router.push('/edit-shop') },
            { label: 'Address', value: [shop?.address, shop?.city].filter(Boolean).join(', ') || 'Not added', onPress: () => router.push('/edit-shop') },
            { label: 'Edit shop', onPress: () => router.push('/edit-shop') },
          ]}
        />

        <Group
          title="People and money"
          rows={[
            { label: 'Shops', onPress: () => router.push('/people') },
            { label: 'Brands', onPress: () => router.push({ pathname: '/people', params: { tab: 'brands' } }) },
            { label: 'All bills', onPress: () => router.push('/all-bills') },
            { label: 'Dues', value: dueTotal ? rupees(dueTotal) : undefined, onPress: () => router.push('/dues') },
            { label: 'Orders', value: openOrders ? `${openOrders} open` : undefined, onPress: () => router.push('/orders') },
          ]}
        />

        <Group
          title="CA"
          rows={[
            { label: shop?.ca_name || 'No CA added', value: shop?.ca_phone || undefined, onPress: () => router.push('/edit-shop') },
            { label: 'Send this month to CA', onPress: soon('Send this month to CA', 'Not built yet. It will put the month\u2019s bills and payments into one file and send it to the CA above.') },
          ]}
        />

        <Group
          title="Qurie"
          rows={[
            { label: 'Voice replies', toggle: { value: voiceOn, onChange: toggleVoice } },
            { label: 'Language', value: `${current.label} (${current.own})`, onPress: pickLanguage },
            { label: 'Clear chat history', onPress: confirmClearChat },
          ]}
        />

        <Group
          title="Account"
          rows={[
            { label: 'Export all data', onPress: soon('Export all data', 'Not built yet. Meanwhile everything is in your Supabase project and can be read from there.') },
            { label: 'Subscription', value: shop?.plan ? shop.plan[0].toUpperCase() + shop.plan.slice(1) : 'Trial', onPress: soon('Subscription', 'Not built yet. Nothing is charged and nothing expires while Qurie is in testing.') },
            {
              label: 'Help',
              value: '7867922243',
              onPress: () =>
                Alert.alert(
                  'Help',
                  'Ask Qurie in the chat \u2014 she answers about your shops, brands, bills and dues.\n\nFor anything else, call or message 7867922243.',
                  [
                    { text: 'Close', style: 'cancel' as const },
                    { text: 'Call', onPress: () => Linking.openURL('tel:7867922243') },
                    { text: 'WhatsApp', onPress: () => Linking.openURL('https://wa.me/917867922243') },
                  ],
                ),
            },
            { label: 'Server', value: API_URL.replace(/^https?:\/\//, '') },
            { label: 'Log out', danger: true, onPress: () => { signOut().then(() => router.replace('/(auth)/welcome')); } },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
