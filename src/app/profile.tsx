import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { getShop } from '@/lib/api';
import { useAppState } from '@/lib/appState';
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
  const shop = getShop();
  const voiceOn = useAppState((s) => s.voiceOn);
  const toggleVoice = useAppState((s) => s.toggleVoice);
  const language = useAppState((s) => s.language);
  const { setLang, signOut } = useSession();
  const setLanguage = setLang;

  const soon = (what: string) => () => Alert.alert(what, 'Arrives in a later build.');

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
          <Avatar name={shop.name} shape="square" size={72} />
          <View style={{ flex: 1 }}>
            <Txt v="title">{shop.name}</Txt>
            <Txt v="secondary" color={colors.muted}>
              {shop.city}
            </Txt>
          </View>
        </View>

        <Group
          title="Shop"
          rows={[
            { label: 'Owner phone', value: shop.ownerPhone },
            { label: 'GSTIN', value: shop.gstin },
            { label: 'Shop type', value: shop.type[0].toUpperCase() + shop.type.slice(1) },
            { label: 'Edit shop', onPress: soon('Edit shop') },
          ]}
        />

        <Group
          title="People and money"
          rows={[
            { label: 'Shops', onPress: () => router.push('/people') },
            { label: 'Brands', onPress: () => router.push({ pathname: '/people', params: { tab: 'brands' } }) },
            { label: 'All bills', onPress: soon('Bills list') },
            { label: 'Dues', onPress: soon('Dues') },
            { label: 'Orders', onPress: soon('Orders list') },
            { label: 'Beats', onPress: soon('Beat planning') },
          ]}
        />

        <Group
          title="CA"
          rows={[
            { label: shop.caName, value: shop.caPhone },
            { label: 'Send this month to CA', onPress: soon('CA pack') },
          ]}
        />

        <Group
          title="Qurie"
          rows={[
            { label: 'Voice replies', toggle: { value: voiceOn, onChange: toggleVoice } },
            { label: 'Language', value: `${current.label} (${current.own})`, onPress: pickLanguage },
          ]}
        />

        <Group
          title="Account"
          rows={[
            { label: 'Export all data', onPress: soon('Export') },
            { label: 'Subscription', value: 'Trial', onPress: soon('Subscription') },
            { label: 'Help', onPress: soon('Help') },
            { label: 'Server', value: API_URL.replace(/^https?:\/\//, '') },
            { label: 'Log out', danger: true, onPress: () => { signOut().then(() => router.replace('/(auth)/welcome')); } },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
