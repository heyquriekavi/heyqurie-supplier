/**
 * Form pieces for the login and setup screens, in the home-reference look:
 * paper ground, ink button with lime text (like the mic), lime chips when on.
 */
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, type TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Txt } from './Txt';
import { colors, font, radius, space, type } from '@/theme/tokens';

export function FormScreen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  kind = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: 'primary' | 'secondary';
}) {
  const off = disabled || loading;
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        { height: 56, borderRadius: radius.pill + 4, alignItems: 'center', justifyContent: 'center' },
        primary ? { backgroundColor: colors.button } : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        off && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? colors.onButton : colors.ink} />
      ) : (
        <Txt v="body" w="semibold" color={primary ? colors.onButton : colors.ink}>
          {title}
        </Txt>
      )}
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Txt v="caption" caps color={colors.muted}>
          {label}
        </Txt>
      ) : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[
          {
            height: 52,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            paddingHorizontal: 14,
            fontFamily: font.medium,
            fontSize: type.body,
            color: colors.ink,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 16,
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: on ? colors.lime : colors.surfaceMuted,
      }}>
      <Txt v="secondary" w={on ? 'semibold' : 'medium'} color={on ? colors.limeInk : colors.muted}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <Txt v="secondary" color={colors.red}>
      {children}
    </Txt>
  );
}
