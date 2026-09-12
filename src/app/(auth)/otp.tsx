import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Button, ErrorText, FormScreen } from '@/components/Form';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { ApiError, request } from '@/lib/http';
import { useSession, type User } from '@/lib/session';
import { colors, radius, space } from '@/theme/tokens';

type Verified = { access_token: string; refresh_token: string; user: User; is_new: boolean };

export default function Otp() {
  const { phone, dev, wait } = useLocalSearchParams<{ phone: string; dev?: string; wait?: string }>();
  const { t, signIn } = useSession();
  const router = useRouter();
  const [code, setCode] = useState(dev || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(Number(wait) || 30);
  const [devCode, setDevCode] = useState(dev || '');
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  useEffect(() => {
    if (code.length === 6) verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function verify(c: string) {
    setBusy(true);
    setError('');
    try {
      const r = await request<Verified>('/api/v1/auth/otp/verify', { body: { phone, code: c }, auth: false });
      await signIn(r, r.user);
      router.replace(r.user.shop_id ? '/' : '/(auth)/setup-shop');
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 0 ? t.networkError : err.message || t.wrongCode);
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const r = await request<{ retry_after_seconds: number; dev_code?: string }>('/api/v1/auth/otp/send', { body: { phone }, auth: false });
      setLeft(r.retry_after_seconds);
      setDevCode(r.dev_code ?? '');
      if (r.dev_code) setCode(r.dev_code);
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 0 ? t.networkError : err.message || t.somethingWrong);
    }
  }

  const boxes = Array.from({ length: 6 }, (_, i) => code[i] ?? '');

  return (
    <FormScreen>
      <View style={{ marginHorizontal: -space.md }}>
        <ScreenHeader title="" />
      </View>
      <View style={{ gap: space.xs }}>
        <Txt v="title">{t.otpTitle}</Txt>
        <Txt v="secondary" color={colors.muted}>
          {t.otpHint(`+91 ${phone}`)}
        </Txt>
      </View>

      <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: space.sm }}>
        {boxes.map((ch, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 56,
              borderWidth: 1.5,
              borderRadius: radius.card,
              borderColor: i === code.length ? colors.forest : colors.border,
              backgroundColor: i < code.length ? colors.limeSoft : colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Txt v="title" w="semibold" num>
              {ch}
            </Txt>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />

      <ErrorText>{error}</ErrorText>
      {devCode ? (
        <Txt v="caption" color={colors.amber}>
          {t.devCode} {devCode}
        </Txt>
      ) : null}

      <Pressable disabled={left > 0} onPress={resend} accessibilityRole="button">
        <Txt v="secondary" w="medium" color={left > 0 ? colors.muted : colors.forest}>
          {left > 0 ? t.resendIn(left) : t.resend}
        </Txt>
      </Pressable>

      <View style={{ flex: 1 }} />
      <Button title={t.verify} onPress={() => verify(code)} disabled={code.length !== 6} loading={busy} />
    </FormScreen>
  );
}
