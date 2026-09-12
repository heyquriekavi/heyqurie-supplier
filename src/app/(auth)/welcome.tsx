import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, FormScreen } from '@/components/Form';
import { Txt } from '@/components/Txt';
import { useSession } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

export default function Welcome() {
  const { t } = useSession();
  const router = useRouter();
  return (
    <FormScreen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <View style={{ gap: space.md }}>
          <Avatar name="Q" shape="square" size={64} />
          <Txt v="display" w="bold">
            Qurie
          </Txt>
          <Txt v="body" color={colors.muted}>
            {t.appLine}
          </Txt>
        </View>
      </View>
      <Button title={t.start} onPress={() => router.push('/(auth)/phone')} />
    </FormScreen>
  );
}
