import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, Field, FormScreen } from '@/components/Form';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { ApiError, request } from '@/lib/http';
import { useSession } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

export default function Phone() {
  const { t } = useSession();
  const router = useRouter();
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = /^[6-9]\d{9}$/.test(digits);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const r = await request<{ retry_after_seconds: number; dev_code?: string }>('/api/v1/auth/otp/send', {
        body: { phone: digits },
        auth: false,
      });
      router.push({ pathname: '/(auth)/otp', params: { phone: digits, dev: r.dev_code ?? '', wait: String(r.retry_after_seconds) } });
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 0 ? t.networkError : err.message || t.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <View style={{ marginHorizontal: -space.md }}>
        <ScreenHeader title="" />
      </View>
      <View style={{ gap: space.xs }}>
        <Txt v="title">{t.phoneTitle}</Txt>
        <Txt v="secondary" color={colors.muted}>
          {t.phoneHint}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Txt v="body" w="semibold">
          +91
        </Txt>
        <View style={{ flex: 1 }}>
          <Field
            value={digits}
            onChangeText={(v) => setDigits(v.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={10}
            placeholder="98765 43210"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => valid && send()}
          />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      <View style={{ flex: 1 }} />
      <Button title={t.continue} onPress={send} disabled={!valid} loading={busy} />
    </FormScreen>
  );
}
