import { Pressable, View } from 'react-native';

import { Txt } from './Txt';
import { colors, space } from '@/theme/tokens';

type Props<T extends string> = {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
};

/** Underlined tabs as in the People and supplier references. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 2, borderBottomColor: active ? colors.forest : 'transparent', marginBottom: -1 }}>
            <Txt v="secondary" w="semibold" color={active ? colors.forest : colors.muted}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
