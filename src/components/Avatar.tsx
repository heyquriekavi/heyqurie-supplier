import { View } from 'react-native';

import { Txt } from './Txt';
import { initials, toneIndex } from '@/lib/format';
import { avatarTones, colors } from '@/theme/tokens';

type Props = {
  name: string;
  size?: number;
  /** `square` is the shop's own mark (forest square, lime letters). */
  shape?: 'circle' | 'square';
};

export function Avatar({ name, size = 44, shape = 'circle' }: Props) {
  const tone = avatarTones[toneIndex(name, avatarTones.length)];
  const square = shape === 'square';
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: square ? size * 0.28 : size / 2,
        backgroundColor: square ? colors.forest : tone.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Txt
        w="bold"
        color={square ? colors.lime : tone.ink}
        style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {initials(name)}
      </Txt>
    </View>
  );
}
