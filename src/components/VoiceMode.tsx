/**
 * Voice mode inside the chat sheet, the way Claude's app does it: the conversation
 * stays visible behind a soft dim, a glow breathes around the screen edges and
 * swells with sound, and the bottom row becomes bill button · status pill · close
 * (where the mic was).
 * No interruption: the mic is off while Qurie speaks.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Txt } from './Txt';
import { useSession } from '@/lib/session';
import type { Strings } from '@/lib/strings';
import type { Phase } from '@/lib/voice';
import { colors, radius, space } from '@/theme/tokens';

const SIDE = 56;

/** What the status pill says, in whichever language is on. */
function statusOf(phase: Phase, t: Strings): string {
  return phase === 'listening' ? t.voiceListening
    : phase === 'thinking' ? t.voiceThinking
    : phase === 'speaking' ? t.voiceSpeaking
    : phase === 'error' ? t.voiceFailed
    : t.voiceStarting;
}

/**
 * The glow around the screen edges, like Claude's voice mode: four gradient bands
 * that breathe all the time, shimmer while Qurie thinks, and swell with sound,
 * the owner's voice while listening and Qurie's while she speaks.
 */
export function EdgeGlow({ phase, level }: { phase: Phase; level: number }) {
  const breathe = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const sound = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 3200, easing: Easing.inOut(Easing.sin) })), -1, true);
    return () => cancelAnimation(breathe);
  }, [breathe]);

  useEffect(() => {
    cancelAnimation(shimmer);
    if (phase === 'thinking') {
      shimmer.value = withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })), -1, true);
    } else {
      shimmer.value = withTiming(0, { duration: 300 });
    }
  }, [phase, shimmer]);

  useEffect(() => {
    sound.value = withSpring(level * 0.6, { damping: 20, stiffness: 160, mass: 0.8 });
  }, [level, sound]);

  // Sides carry the most; top and bottom a little, so it reads as a halo around the screen.
  const side = useAnimatedStyle(() => ({
    width: 22 + breathe.value * 5 + shimmer.value * 6 + sound.value * 36,
    opacity: 0.4 + breathe.value * 0.08 + shimmer.value * 0.12 + sound.value * 0.3,
  }));
  const cap = useAnimatedStyle(() => ({
    height: 12 + breathe.value * 3 + shimmer.value * 4 + sound.value * 20,
    opacity: 0.28 + breathe.value * 0.06 + shimmer.value * 0.1 + sound.value * 0.25,
  }));

  const tint = phase === 'error' ? colors.red : colors.lime;
  const strong = phase === 'error' ? 'rgba(196,59,46,0.55)' : 'rgba(217,243,106,0.95)';
  const clear = phase === 'error' ? 'rgba(196,59,46,0)' : 'rgba(217,243,106,0)';

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0 }, side]}>
        <LinearGradient colors={[strong, clear]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, right: 0 }, side]}>
        <LinearGradient colors={[clear, strong]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, cap]}>
        <LinearGradient colors={[strong, clear]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0 }, cap]}>
        <LinearGradient colors={[clear, strong]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }} />
      </Animated.View>
      {/* a thin solid line at the very edge so the glow has a defined rim */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, backgroundColor: tint, opacity: 0.9 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, backgroundColor: tint, opacity: 0.9 }} />
    </View>
  );
}

type VoiceProps = { phase: Phase; level: number; transcript: string; answer: string; error: string };

/** Sits over the message list while voice mode is on: a light dim, and the error line if there is one. */
export function VoiceLayer({ phase, error }: VoiceProps) {
  const { t } = useSession();
  return (
    <Animated.View entering={FadeIn.duration(180)} pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.sheet, opacity: 0.45 }} />
      {phase === 'error' ? (
        <Txt v="secondary" color={colors.red} center style={{ paddingHorizontal: space.xl, paddingBottom: space.lg }}>
          {error === 'mic' ? t.micDenied
            : error === 'nomic' ? t.micMissing
              : error === 'insecure' ? t.micInsecure
                : error === 'network' ? t.noInternet
                  : error}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/** Replaces the composer while voice mode is on: bill · status · close. */
export function VoiceBar({ phase, onBill, onClose }: { phase: Phase; onBill: () => void; onClose: () => void }) {
  const { t } = useSession();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a bill photo or file"
        onPress={onBill}
        style={({ pressed }) => ({ width: SIDE, height: SIDE, borderRadius: 18, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="add" size={30} color={colors.lime} />
      </Pressable>

      <View style={{ flex: 1, height: SIDE, borderRadius: radius.pill + 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: phase === 'speaking' ? colors.limeInk : phase === 'listening' ? colors.red : colors.muted }} />
        <Txt v="body" w="medium" color={colors.ink}>
          {statusOf(phase, t)}
        </Txt>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close voice mode"
        onPress={onClose}
        style={({ pressed }) => ({
          width: SIDE,
          height: SIDE,
          borderRadius: SIDE / 2,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
          shadowColor: colors.ink,
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        })}>
        <Ionicons name="close" size={26} color={colors.lime} />
      </Pressable>
    </View>
  );
}
