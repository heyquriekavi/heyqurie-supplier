import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ErrorText, Field, FormScreen } from '@/components/Form';
import { Txt } from '@/components/Txt';
import { ApiError, request, setTokens } from '@/lib/http';
import { type Shop, useSession } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

const TYPES = ['hardware', 'electrical', 'pharmacy', 'other'] as const;

export default function SetupShop() {
  const { t, user, setUser } = useSession();
  const router = useRouter();
  const [ownerName, setOwnerName] = useState(user?.name ?? '');
  const [name, setName] = useState('');
  const [shopType, setShopType] = useState<(typeof TYPES)[number]>('hardware');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function useLocation() {
    setLocating(true);
    setError('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError(t.locationDenied);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
      if (place) {
        const line = [place.name, place.street, place.district, place.subregion].filter(Boolean);
        const cityName = place.city || place.subregion || '';
        const tail = [cityName, place.region, place.postalCode].filter(Boolean);
        setAddress([...new Set([...line, ...tail])].join(', '));
        if (cityName) setCity(cityName);
      }
    } catch {
      setError(t.locationFailed);
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await request<{ shop: Shop; access_token: string }>('/api/v1/shops', {
        body: {
          owner_name: ownerName || null,
          name,
          type: shopType,
          address: address || null,
          city: city || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        },
      });
      await setTokens({ access_token: r.access_token });
      if (user) setUser({ ...user, name: ownerName || user.name, shop_id: r.shop.id, shop: r.shop });
      router.replace('/');
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 0 ? t.networkError : err.message || t.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Txt v="title">{t.shopTitle}</Txt>
      <Field label={t.ownerName} value={ownerName} onChangeText={setOwnerName} placeholder="Ramesh Sharma" autoFocus autoComplete="name" />
      <Field label={t.shopName} value={name} onChangeText={setName} placeholder="Sharma Hardware" />
      <View style={{ gap: space.sm }}>
        <Txt v="caption" caps color={colors.muted}>
          {t.shopType}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {TYPES.map((k) => (
            <Chip key={k} label={t[k]} on={shopType === k} onPress={() => setShopType(k)} />
          ))}
        </View>
      </View>
      <Field
        label={t.address}
        value={address}
        onChangeText={setAddress}
        placeholder="12, MG Road, Pune"
        multiline
        style={{ height: 88, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <Button title={locating ? t.locating : t.useLocation} kind="secondary" onPress={useLocation} loading={locating} />
      {coords ? (
        <Txt v="caption" color={colors.muted} num>
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </Txt>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <View style={{ flex: 1 }} />
      <Button title={t.save} onPress={save} disabled={name.trim().length < 2} loading={busy} />
    </FormScreen>
  );
}
