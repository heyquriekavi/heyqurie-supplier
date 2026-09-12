import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field } from '@/components/Form';
import { IconButton } from '@/components/IconButton';
import { PersonRow } from '@/components/PersonRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
import { Txt } from '@/components/Txt';
import { getPeople, personSummary } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { createPerson } from '@/lib/server';
import type { PersonKind } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

const BLANK = { name: '', phone: '', gstin: '' };

export default function People() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<PersonKind>(params.tab === 'brands' ? 'supplier' : 'customer');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const txns = useAppState((s) => s.txns);
  const people = useAppState((s) => s.people);
  const refresh = useAppState((s) => s.refresh);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return getPeople(tab)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.phone.replace(/\s/g, '').includes(needle))
      .map((p) => ({ person: p, summary: personSummary(p.id) }));
  }, [tab, q, txns, people]);

  const brand = tab === 'supplier';

  const openAdd = () => {
    setForm(BLANK);
    setError('');
    setSearching(false);
    setAdding((a) => !a);
  };

  async function save() {
    const name = form.name.trim();
    const gstin = form.gstin.replace(/\s/g, '').toUpperCase();
    if (name.length < 2) return setError('Enter a name.');
    if (gstin && gstin.length !== 15) return setError('A GSTIN is 15 characters. Leave it blank if you do not have it.');
    // The same name twice makes the ledger unreadable, and Qurie could not tell them apart.
    if (getPeople(tab).some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      return setError(`${brand ? 'A brand' : 'A shop'} called ${name} is already here.`);
    }
    setBusy(true);
    setError('');
    try {
      await createPerson({ kind: brand ? 'supplier' : 'customer', name, phone: form.phone.trim() || undefined, gstin: gstin || undefined });
      await refresh();
      setForm(BLANK);
      setAdding(false);
    } catch (e) {
      setError((e as Error)?.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScreenHeader
        title="People"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton name="search" label="Search" onPress={() => { setAdding(false); setSearching((s) => !s); }} />
            <IconButton
              name={adding ? 'close' : 'add'}
              label={adding ? 'Cancel' : brand ? 'Add brand' : 'Add shop'}
              variant="forest"
              size={26}
              onPress={openAdd}
              style={{ width: 44, height: 44, marginRight: space.sm }}
            />
          </View>
        }
      />

      {searching && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, marginBottom: space.sm, paddingHorizontal: space.md, height: 44, borderRadius: radius.card, backgroundColor: colors.surfaceMuted }}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Name or phone"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search people"
            style={{ flex: 1, fontFamily: 'NotoSans_400Regular', fontSize: 16, color: colors.ink, paddingVertical: 0 }}
          />
        </View>
      )}

      {adding && (
        <View style={{ marginHorizontal: space.lg, marginBottom: space.sm, padding: space.md, gap: space.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper }}>
          <Txt v="secondary" w="semibold">
            {brand ? 'New brand' : 'New shop'}
          </Txt>
          <Field
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
            placeholder={brand ? 'Brand name' : 'Shop name'}
            autoFocus
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Field
            value={form.phone}
            onChangeText={(phone) => setForm((f) => ({ ...f, phone: phone.replace(/[^\d+\s]/g, '') }))}
            placeholder="Phone (optional)"
            keyboardType="phone-pad"
          />
          <Field
            value={form.gstin}
            onChangeText={(gstin) => setForm((f) => ({ ...f, gstin: gstin.toUpperCase().slice(0, 15) }))}
            placeholder="GSTIN (optional)"
            autoCapitalize="characters"
            maxLength={15}
            onSubmitEditing={save}
            returnKeyType="done"
          />
          <ErrorText>{error}</ErrorText>
          <Button title={brand ? 'Add brand' : 'Add shop'} onPress={save} disabled={form.name.trim().length < 2} loading={busy} />
        </View>
      )}

      <Segmented<PersonKind>
        options={[
          { key: 'customer', label: 'Shops' },
          { key: 'supplier', label: 'Brands' },
        ]}
        value={tab}
        onChange={(k) => { setTab(k); setError(''); }}
      />

      <FlatList
        data={rows}
        keyExtractor={(r) => r.person.id}
        renderItem={({ item }) => <PersonRow person={item.person} summary={item.summary} />}
        ListEmptyComponent={
          <Txt color={colors.muted} center style={{ padding: space.xxl }}>
            {q ? 'No one matches that.' : brand ? 'No brands yet. Tap plus to add one.' : 'No shops yet. Tap plus to add one.'}
          </Txt>
        }
        contentContainerStyle={{ paddingBottom: space.xxl }}
      />
    </SafeAreaView>
  );
}
