import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, ErrorText, Field } from '@/components/Form';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { ApiError } from '@/lib/http';
import { updateShop } from '@/lib/server';
import { useSession, type Shop } from '@/lib/session';
import { colors, radius, space } from '@/theme/tokens';

const TYPES = ['hardware', 'electrical', 'pharmacy', 'other'] as const;
const SCHEMES = [
  { key: 'regular', label: 'Regular', hint: 'You charge GST and file monthly or quarterly.' },
  { key: 'composition', label: 'Composition', hint: 'A flat rate on turnover. You may not charge GST separately on a bill.' },
  { key: 'unregistered', label: 'Unregistered', hint: 'Below the threshold, no GSTIN.' },
] as const;

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt v="caption" caps color={colors.muted} style={{ paddingHorizontal: space.xs }}>
        {title}
      </Txt>
      <View style={{ gap: space.md, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
        {children}
      </View>
      {note ? (
        <Txt v="caption" color={colors.muted} style={{ paddingHorizontal: space.xs }}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** Every column of the shop the owner is allowed to set, in one form. */
export default function EditShop() {
  const router = useRouter();
  const { user, setUser, t } = useSession();
  const shop = user?.shop;

  const [name, setName] = useState(shop?.name ?? '');
  const [ownerName, setOwnerName] = useState(user?.name ?? '');
  const [type, setType] = useState<string>(shop?.type ?? 'other');
  const [gstin, setGstin] = useState(shop?.gstin ?? '');
  const [scheme, setScheme] = useState<string>(shop?.scheme ?? (shop?.gstin ? 'regular' : 'unregistered'));
  const [address, setAddress] = useState(shop?.address ?? '');
  const [city, setCity] = useState(shop?.city ?? '');
  const [pin, setPin] = useState(shop?.pin ?? '');
  const [caName, setCaName] = useState(shop?.ca_name ?? '');
  const [caPhone, setCaPhone] = useState(shop?.ca_phone ?? '');
  const [caEmail, setCaEmail] = useState(shop?.ca_email ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user || !shop) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
        <ScreenHeader title="Edit shop" />
        <Txt color={colors.muted} style={{ padding: space.lg }}>
          Set up your business first.
        </Txt>
      </SafeAreaView>
    );
  }

  async function useLocation() {
    setLocating(true);
    setError('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setError(t.locationDenied);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
      if (place) {
        const line = [place.name, place.street, place.district, place.subregion].filter(Boolean);
        const cityName = place.city || place.subregion || '';
        setAddress([...new Set([...line, cityName, place.region].filter(Boolean))].join(', '));
        if (cityName) setCity(cityName);
        if (place.postalCode) setPin(place.postalCode.replace(/\D/g, '').slice(0, 6));
      }
    } catch {
      setError(t.locationFailed);
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const g = gstin.replace(/\s/g, '').toUpperCase();
    if (name.trim().length < 2) return setError('Enter the shop name.');
    if (g && g.length !== 15) return setError('A GSTIN is 15 characters. Leave it blank if you do not have one.');
    if (!g && scheme !== 'unregistered') return setError('Add the GSTIN, or set the scheme to Unregistered.');
    if (pin && pin.length !== 6) return setError('A PIN code is 6 digits.');
    setBusy(true);
    setError('');
    try {
      const updated = (await updateShop({
        name: name.trim(),
        type,
        owner_name: ownerName.trim() || null,
        gstin: g || null,
        scheme,
        address: address.trim() || null,
        city: city.trim() || null,
        pin: pin || null,
        ca_name: caName.trim() || null,
        ca_phone: caPhone.trim() || null,
        ca_email: caEmail.trim() || null,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : { lat: shop!.lat ?? null, lng: shop!.lng ?? null }),
      })) as unknown as Shop;
      setUser({ ...user!, name: ownerName.trim() || user!.name, shop: updated });
      router.back();
    } catch (e) {
      setError((e as ApiError)?.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const schemeHint = SCHEMES.find((s) => s.key === scheme)?.hint;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenHeader title="Edit shop" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Group title="Business">
          <Field label="Shop name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Your name" value={ownerName} onChangeText={setOwnerName} autoCapitalize="words" placeholder="Owner's name" />
          <View style={{ gap: 7 }}>
            <Txt v="caption" color={colors.muted}>
              Shop type
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {TYPES.map((k) => (
                <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} on={type === k} onPress={() => setType(k)} />
              ))}
            </View>
          </View>
        </Group>

        <Group title="Tax" note={schemeHint}>
          <Field
            label="GSTIN"
            value={gstin}
            onChangeText={(v) => setGstin(v.toUpperCase().slice(0, 15))}
            autoCapitalize="characters"
            maxLength={15}
            placeholder="15 characters, or leave blank"
          />
          <View style={{ gap: 7 }}>
            <Txt v="caption" color={colors.muted}>
              GST scheme
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {SCHEMES.map((s) => (
                <Chip key={s.key} label={s.label} on={scheme === s.key} onPress={() => setScheme(s.key)} />
              ))}
            </View>
          </View>
          {gstin.length === 15 ? (
            <Txt v="caption" color={colors.muted} num>
              State code {gstin.slice(0, 2)}, taken from the GSTIN
            </Txt>
          ) : null}
        </Group>

        <Group title="Where you are">
          <Field label="Address" value={address} onChangeText={setAddress} multiline />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 2 }}>
              <Field label="City" value={city} onChangeText={setCity} autoCapitalize="words" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="PIN" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
            </View>
          </View>
          <Button title={locating ? t.locating : t.useLocation} kind="secondary" onPress={useLocation} loading={locating} />
          {coords || shop.lat ? (
            <Txt v="caption" color={colors.muted} num>
              Pinned at {(coords?.lat ?? shop.lat)!.toFixed(4)}, {(coords?.lng ?? shop.lng)!.toFixed(4)}
            </Txt>
          ) : null}
        </Group>

        <Group title="Your CA" note="Used when you send a month's books across.">
          <Field label="Name" value={caName} onChangeText={setCaName} autoCapitalize="words" placeholder="Optional" />
          <Field label="Phone" value={caPhone} onChangeText={setCaPhone} keyboardType="phone-pad" placeholder="Optional" />
          <Field label="Email" value={caEmail} onChangeText={setCaEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" />
        </Group>

        <Group title="Account">
          <View style={{ gap: 3 }}>
            <Txt v="caption" color={colors.muted}>
              Your phone
            </Txt>
            <Txt num>{user.phone}</Txt>
            <Txt v="caption" color={colors.muted}>
              This is how you sign in, so it cannot be changed here.
            </Txt>
          </View>
          <View style={{ gap: 3 }}>
            <Txt v="caption" color={colors.muted}>
              Plan
            </Txt>
            <Txt>
              {shop.plan ? shop.plan[0].toUpperCase() + shop.plan.slice(1) : 'Trial'}
              {shop.plan_until ? ` until ${shop.plan_until.slice(0, 10)}` : ''}
            </Txt>
          </View>
        </Group>

        <ErrorText>{error}</ErrorText>
        <Button title="Save" onPress={save} loading={busy} disabled={name.trim().length < 2} />
      </ScrollView>
    </SafeAreaView>
  );
}
