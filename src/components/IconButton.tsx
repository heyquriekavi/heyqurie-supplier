import { Ionicons } from '@expo/vector-icons';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { colors, tap } from '@/theme/tokens';

type Props = {
  name: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  /** `ring` draws the thin outlined circle from the home reference. */
  variant?: 'plain' | 'ring' | 'forest';
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ name, label, onPress, size = 22, color, variant = 'plain', dot, style }: Props) {
  const ring = variant === 'ring';
  const forest = variant === 'forest';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: tap,
          height: tap,
          borderRadius: tap / 2,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        },
        ring && { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
        forest && { backgroundColor: colors.forest },
        style,
      ]}>
      <Ionicons name={name} size={size} color={color ?? (forest ? colors.lime : colors.ink)} />
      {dot && (
        <Ionicons
          name="ellipse"
          size={8}
          color={colors.red}
          style={{ position: 'absolute', top: 11, right: 12 }}
        />
      )}
    </Pressable>
  );
}
