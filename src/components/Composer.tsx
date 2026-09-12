import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData } from 'react-native';

import { Txt } from './Txt';
import { colors, radius, space } from '@/theme/tokens';

type Props = {
  /** On the home screen the field is a button that opens the full chat. */
  previewOnly?: boolean;
  onExpand?: () => void;
  onSend?: (text: string) => void;
  onBill: () => void;
  onMic: () => void;
  autoFocus?: boolean;
  busy?: boolean;
  /** Fired when the field is focused, so the sheet can expand. */
  onFocus?: () => void;
};

const SIDE = 56;
const LINE = 23;
/** One line at rest, up to six before the field scrolls inside itself. */
const MIN_TEXT = LINE;
const MAX_TEXT = LINE * 6;

/** Bottom bar: bill button, the field Qurie is asked through, mic. */
export function Composer({ previewOnly, onExpand, onSend, onBill, onMic, autoFocus, busy, onFocus }: Props) {
  const [text, setText] = useState('');
  const [textHeight, setTextHeight] = useState(MIN_TEXT);

  const submit = () => {
    const t = text.trim();
    if (!t || !onSend) return;
    onSend(t);
    setText('');
    setTextHeight(MIN_TEXT);
  };

  /** The field grows with what is typed, then scrolls once it is five lines tall. */
  const measure = (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const h = e.nativeEvent.contentSize.height;
    setTextHeight(Math.min(Math.max(MIN_TEXT, Math.ceil(h)), MAX_TEXT));
  };

  const ready = text.trim().length > 0;
  const grown = textHeight > MIN_TEXT;
  const boxHeight = Math.max(SIDE, textHeight + 20);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a bill photo or file"
        onPress={onBill}
        style={({ pressed }) => ({
          width: SIDE,
          height: SIDE,
          borderRadius: 18,
          backgroundColor: colors.plusBg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}>
        <Ionicons name="add" size={30} color={colors.plusIcon} />
      </Pressable>

      {previewOnly ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open chat with Qurie"
          onPress={onExpand}
          style={({ pressed }) => ({
            flex: 1,
            height: SIDE,
            borderRadius: radius.pill + 4,
            backgroundColor: colors.fieldBg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 18,
            opacity: pressed ? 0.8 : 1,
          })}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.fieldIcon} />
          <Txt v="body" w="regular" color={colors.fieldPlaceholder} numberOfLines={1} style={{ flex: 1 }}>
            Ask Qurie
          </Txt>
        </Pressable>
      ) : (
        <View
          style={{
            flex: 1,
            minWidth: 0,
            height: boxHeight,
            // A pill on one line; as it grows the corners stay generous but stop rounding away the text.
            borderRadius: grown ? 24 : radius.pill + 4,
            backgroundColor: colors.fieldBg,
            flexDirection: 'row',
            alignItems: grown ? 'flex-end' : 'center',
            paddingLeft: 18,
            paddingRight: 18,
            paddingVertical: grown ? 10 : 0,
            gap: 8,
          }}>
          {!text ? <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.fieldIcon} /> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            onContentSizeChange={measure}
            onSubmitEditing={submit}
            onFocus={onFocus}
            // On a keyboard, Enter sends and Shift+Enter starts a new line.
            onKeyPress={(e) => {
              const ev = e.nativeEvent as { key?: string; shiftKey?: boolean; preventDefault?: () => void };
              if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault?.();
                submit();
              }
            }}
            multiline
            scrollEnabled={textHeight >= MAX_TEXT}
            blurOnSubmit={false}
            placeholder="Ask Qurie"
            placeholderTextColor={colors.fieldPlaceholder}
            returnKeyType="send"
            autoFocus={autoFocus}
            editable={!busy}
            accessibilityLabel="Message Qurie"
            style={[
              {
                flex: 1,
                minWidth: 0,
                height: textHeight,
                fontFamily: 'NotoSans_400Regular',
                fontSize: 17,
                lineHeight: LINE,
                color: colors.fieldText,
                paddingTop: 0,
                paddingBottom: 0,
                textAlignVertical: 'center',
              },
              // react-native-web draws a focus ring on the input; the pill is the visible edge
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />
        </View>
      )}

      {/* One button, two jobs: talk to Qurie, or send what has been typed. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ready ? 'Send' : 'Talk to Qurie'}
        onPress={ready ? submit : onMic}
        style={({ pressed }) => ({
          width: SIDE,
          height: SIDE,
          borderRadius: SIDE / 2,
          backgroundColor: ready ? colors.button : colors.mic,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
          shadowColor: colors.ink,
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        })}>
        <Ionicons name={ready ? 'arrow-up' : 'mic'} size={24} color={ready ? colors.onButton : colors.micIcon} />
      </Pressable>
    </View>
  );
}
