import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { IconButton } from './IconButton';
import { Txt } from './Txt';
import { space } from '@/theme/tokens';

type Props = {
  title?: string;
  /** Replaces the title when a richer header is needed (avatar + name). */
  center?: React.ReactNode;
  right?: React.ReactNode;
};

export function ScreenHeader({ title, center, right }: Props) {
  const router = useRouter();
  // After a refresh or a deep link there is nothing behind this screen, so go home instead.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.xs, gap: space.xs }}>
      <IconButton name="arrow-back" label="Back" onPress={back} />
      <View style={{ flex: 1 }}>
        {center ?? (
          <Txt v="title" w="bold">
            {title}
          </Txt>
        )}
      </View>
      {right}
    </View>
  );
}
