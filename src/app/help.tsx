import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field } from '@/components/Form';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { ApiError } from '@/lib/http';
import { getHelp, sendHelp } from '@/lib/server';
import { useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme/tokens';

const PHONE = '7867922243';
const WHATSAPP = '917867922243';

type Past = { id: string; text: string; answered_at: string | null; created_at: string };

function Reach({ icon, label, detail, onPress, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail: string; onPress: () => void; tint: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: space.lg,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.forestSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Txt w="semibold">{label}</Txt>
      <Txt v="caption" color={colors.muted} num>
        {detail}
      </Txt>
    </Pressable>
  );
}

/** Two ways to reach us: ring the number, or leave a message we answer later. */
export default function Help() {
  const { user } = useSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [past, setPast] = useState<Past[]>([]);

  useEffect(() => {
    getHelp()
      .then(setPast)
      .catch(() => setPast([]));
  }, [sent]);

  async function send() {
    const body = text.trim();
    if (body.length < 3) return setError('Write a little more so we know what to look at.');
    setBusy(true);
    setError('');
    try {
      await sendHelp(body);
      setText('');
      setSent(true);
    } catch (e) {
      const err = e as ApiError;
      // No network is the common case here, and it has an obvious answer: ring us.
      setError(err.status === 0 ? 'No internet. Call us instead and we will sort it out.' : err.message || 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenHeader title="Help" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <Txt v="secondary" color={colors.muted}>
            Ask Qurie in the chat about your shops, brands, bills and dues. For anything she cannot do, reach us here.
          </Txt>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Reach
              icon="call"
              label="Call us"
              detail={PHONE}
              tint={colors.forest}
              onPress={() => Linking.openURL(`tel:${PHONE}`)}
            />
            <Reach
              icon="logo-whatsapp"
              label="WhatsApp"
              detail={PHONE}
              tint={colors.green}
              onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)}
            />
          </View>

          <View style={{ gap: space.sm }}>
            <Txt v="caption" caps color={colors.muted} style={{ paddingHorizontal: space.xs }}>
              Or write to us
            </Txt>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm }}>
              <Field
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setSent(false);
                }}
                placeholder="What went wrong, or what would help?"
                multiline
                numberOfLines={5}
                maxLength={2000}
                style={{ minHeight: 110, textAlignVertical: 'top' }}
              />
              <Txt v="caption" color={colors.muted} num>
                {user?.phone ? `We will answer on ${user.phone}.` : 'Sign in so we can answer you.'}
              </Txt>
              <ErrorText>{error}</ErrorText>
              {sent ? (
                <Txt v="secondary" color={colors.green}>
                  Sent. We will get back to you.
                </Txt>
              ) : null}
              <Button title="Send" onPress={send} loading={busy} disabled={text.trim().length < 3} />
            </View>
          </View>

          {past.length ? (
            <View style={{ gap: space.sm }}>
              <Txt v="caption" caps color={colors.muted} style={{ paddingHorizontal: space.xs }}>
                What you have sent
              </Txt>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
                {past.map((m, i) => (
                  <View key={m.id} style={{ padding: space.md, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Txt v="secondary">{m.text}</Txt>
                    <Txt v="caption" color={m.answered_at ? colors.green : colors.muted} num>
                      {m.created_at.slice(0, 10)}
                      {m.answered_at ? ' · answered' : ' · waiting for us'}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
