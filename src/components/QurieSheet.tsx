import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble, TypingDots } from './ChatBubble';
import { Composer } from './Composer';
import { Txt } from './Txt';
import { EdgeGlow, VoiceBar, VoiceLayer } from './VoiceMode';
import { useVoiceMode } from '@/lib/voice';
import { useAppState } from '@/lib/appState';
import { colors, space } from '@/theme/tokens';

/** Handle + header + composer: what stays visible when the sheet is pulled down. */
const PEEK_HEIGHT = 196;
const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

type Props = {
  /** Height of the header and tiles behind the sheet, so "three quarters" never hides them fully. */
  topBlockHeight: number;
};

/**
 * Qurie lives in a sheet that covers about three quarters of the home screen.
 * Drag the handle up to take the whole screen, down to a strip that shows the
 * tiles; tap the handle to toggle full and three-quarter.
 */
export function QurieSheet({ topBlockHeight }: Props) {
  const { height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const full = insets.top + 12;
  const mid = Math.max(Math.round(H * 0.25), topBlockHeight + 10);
  const peek = H - (insets.bottom + PEEK_HEIGHT);

  const top = useSharedValue(mid);
  const start = useSharedValue(mid);
  const snaps = useSharedValue({ full, mid, peek });

  const measured = useRef(false);
  useEffect(() => {
    snaps.value = { full, mid, peek };
    // First real measurement: jump, so the sheet is in place on the first paint. After that, spring.
    if (!measured.current && topBlockHeight > 0) {
      measured.current = true;
      top.value = mid;
      return;
    }
    top.value = withSpring(mid, SPRING);
  }, [full, mid, peek, snaps, top, topBlockHeight]);

  const pan = Gesture.Pan()
    .onStart(() => {
      start.value = top.value;
    })
    .onUpdate((e) => {
      const s = snaps.value;
      top.value = Math.min(s.peek, Math.max(s.full, start.value + e.translationY));
    })
    .onEnd((e) => {
      const s = snaps.value;
      const projected = top.value + e.velocityY * 0.12;
      const points = [s.full, s.mid, s.peek];
      let target = s.mid;
      let best = Number.MAX_VALUE;
      for (const p of points) {
        const d = Math.abs(p - projected);
        if (d < best) {
          best = d;
          target = p;
        }
      }
      top.value = withSpring(target, SPRING);
    });

  const tap = Gesture.Tap().onEnd(() => {
    const s = snaps.value;
    top.value = withSpring(Math.abs(top.value - s.full) < 1 ? s.mid : s.full, SPRING);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  /** Plus, typing and mic all take the chat to full screen first. */
  const expand = () => {
    top.value = withSpring(snaps.value.full, SPRING);
  };
  const sheetStyle = useAnimatedStyle(() => ({ top: top.value }));

  const messages = useAppState((s) => s.messages);
  const sending = useAppState((s) => s.sending);
  const send = useAppState((s) => s.send);
  const voiceOn = useAppState((s) => s.voiceOn);
  const setAddSheetOpen = useAppState((s) => s.setAddSheetOpen);
  const voiceOpen = useAppState((s) => s.voiceOpen);
  const setVoiceOpen = useAppState((s) => s.setVoiceOpen);
  const voice = useVoiceMode(voiceOpen);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, sending]);

  const addBill = () => {
    expand();
    setAddSheetOpen(true);
  };
  const talk = () => {
    expand();
    setVoiceOpen(true);
  };

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.sheet,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          shadowColor: colors.ink,
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
          overflow: 'hidden',
        },
        sheetStyle,
      ]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <GestureDetector gesture={gesture}>
          <View accessibilityRole="adjustable" accessibilityLabel="Qurie chat. Drag up for full screen, down to see the tiles." style={{ paddingTop: space.sm, paddingBottom: space.sm }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.handle, marginBottom: space.sm }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={20} color={colors.lime} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="heading">Qurie</Txt>
                <Txt v="caption" color={colors.muted}>
                  {voiceOn ? 'Voice replies on' : 'Orders, collections, invoices'}
                </Txt>
              </View>
            </View>
          </View>
        </GestureDetector>

        <View style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.lg }}
          keyboardShouldPersistTaps="handled">
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {sending && !messages.some((m) => m.card?.kind === 'reading') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={14} color={colors.lime} />
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderBottomLeftRadius: 6, paddingHorizontal: 18, paddingVertical: 12 }}>
                <TypingDots />
              </View>
            </View>
          )}
        </ScrollView>
        {voiceOpen ? <VoiceLayer {...voice} /> : null}
        </View>

        <View style={{ paddingBottom: insets.bottom }}>
          {voiceOpen ? (
            <VoiceBar phase={voice.phase} onBill={addBill} onClose={() => setVoiceOpen(false)} />
          ) : (
            <Composer onSend={send} onBill={addBill} onMic={talk} busy={sending} onFocus={expand} />
          )}
        </View>
      </KeyboardAvoidingView>
      {voiceOpen ? <EdgeGlow phase={voice.phase} level={voice.level} /> : null}
    </Animated.View>
  );
}
