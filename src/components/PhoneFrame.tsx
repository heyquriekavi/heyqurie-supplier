import { Platform, View, useWindowDimensions } from 'react-native';

import { colors } from '@/theme/tokens';

/** Phone size to preview at in the browser: a mid-range Android, 390 x 844 pt. */
const PHONE = { width: 390, height: 844 };

/**
 * Web only. When the browser window is wider than a phone, draw the app
 * inside a phone-sized frame in the middle of the page so the layout is
 * seen at the size it is designed for. On a real phone this does nothing.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width > PHONE.width + 80;
  if (!wide) return <>{children}</>;

  const frameHeight = Math.min(PHONE.height, height - 48);
  return (
    <View style={{ flex: 1, backgroundColor: colors.frame, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: PHONE.width,
          height: frameHeight,
          borderRadius: 36,
          borderWidth: 10,
          borderColor: colors.ink,
          backgroundColor: colors.paper,
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </View>
  );
}
