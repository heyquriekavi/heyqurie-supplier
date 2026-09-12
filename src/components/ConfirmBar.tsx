import { Pressable, View } from 'react-native';

import { Txt } from './Txt';
import { colors, radius, space } from '@/theme/tokens';

/**
 * An in-app yes/no for destructive actions. Alert buttons do not work in the
 * browser, and a confirm should look like the rest of the app anyway.
 */
export function ConfirmBar({ text, confirmLabel = 'Delete', busy, onCancel, onConfirm }: { text: string; confirmLabel?: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <View style={{ backgroundColor: colors.redSoft, borderRadius: radius.card, padding: space.md, gap: space.md }}>
      <Txt v="secondary" w="medium" color={colors.red}>
        {text}
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable accessibilityRole="button" onPress={onCancel} disabled={busy} style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 })}>
          <Txt v="secondary" w="semibold">Cancel</Txt>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onConfirm} disabled={busy} style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red, opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}>
          <Txt v="secondary" w="semibold" color="#FFFFFF">
            {busy ? 'Deleting…' : confirmLabel}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
