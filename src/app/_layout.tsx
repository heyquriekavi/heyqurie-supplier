import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhoneFrame } from '@/components/PhoneFrame';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/** Sends a signed-out user to welcome, a new user to shop setup, a signed-in user home. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user } = useSession();
  const segments = useSegments() as string[];
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) router.replace('/(auth)/welcome');
    else if (user && !user.shop_id && segments[1] !== 'setup-shop') router.replace('/(auth)/setup-shop');
    else if (user && user.shop_id && inAuth) router.replace('/');
  }, [ready, user, segments, router]);
  if (!ready) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <PhoneFrame>
      <SessionProvider>
      <AuthGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="index" />
        <Stack.Screen name="people" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="edit-shop" />
        <Stack.Screen name="all-bills" />
        <Stack.Screen name="dues" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="supplier/[id]" />
        <Stack.Screen name="customer/[id]" />
        <Stack.Screen name="bill/[id]" />
      </Stack>
      </AuthGate>
      </SessionProvider>
      </PhoneFrame>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
