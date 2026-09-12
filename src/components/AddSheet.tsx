import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { Txt } from './Txt';
import { getPeople } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import type { Attachment } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

type Props = Record<string, never>;

/** Printed or handwritten: tap to pick that kind of bill from the device. Qurie reads it and asks you to confirm. */
function SampleBill({ label, handwritten, onPress }: { label: string; handwritten?: boolean; onPress: () => void }) {
  const lines = handwritten ? [70, 40, 55, 30] : [80, 80, 60, 80, 45];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 96, gap: 6, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ height: 120, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 7, justifyContent: 'center' }}>
        <View style={{ height: 8, width: handwritten ? 50 : 40, borderRadius: 4, backgroundColor: handwritten ? colors.amberSoft : colors.lime, marginBottom: 4 }} />
        {lines.map((w, i) => (
          <View key={i} style={{ height: handwritten ? 5 : 4, width: `${w}%`, borderRadius: 3, backgroundColor: handwritten ? colors.amber : colors.border, transform: handwritten ? [{ rotate: i % 2 ? '-2deg' : '1.5deg' }] : undefined }} />
        ))}
        <View style={{ height: 6, width: 36, borderRadius: 3, backgroundColor: colors.ink, alignSelf: 'flex-end', marginTop: 4 }} />
      </View>
      <Txt v="caption" color={colors.muted} center numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

function Row({ icon, label, value, onPress, chevron }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value?: string; onPress: () => void; chevron?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' })}>
      <Ionicons name={icon} size={22} color={colors.forest} />
      <Txt style={{ flex: 1 }}>{label}</Txt>
      {value ? (
        <Txt v="secondary" color={colors.muted}>
          {value}
        </Txt>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>{children}</View>;
}

/**
 * What the plus button opens. Camera and recent photos on top, then files
 * and a supplier's contact, the way WhatsApp's attach sheet and Claude's
 * "Add to chat" do it. Photos and files go to Qurie to read as a bill.
 */
export function AddSheet(_: Props) {
  const insets = useSafeAreaInsets();
  const open = useAppState((s) => s.addSheetOpen);
  const setOpen = useAppState((s) => s.setAddSheetOpen);
  const onClose = () => setOpen(false);
  const startBill = useAppState((s) => s.startBill);
  const shareContact = useAppState((s) => s.shareContact);
  const askNewShop = useAppState((s) => s.askNewShop);
  const startOrder = useAppState((s) => s.startOrder);
  const startCollection = useAppState((s) => s.startCollection);
  const matchInvoice = useAppState((s) => s.matchInvoice);
  const people = useAppState((s) => s.people);
  const [view, setView] = useState<'add' | 'contacts' | 'source'>('add');
  /** What the chosen photo or file is for, once the owner picks Camera, Gallery or File. */
  const [pending, setPending] = useState<'brand' | 'invoice' | null>(null);

  const close = () => {
    setView('add');
    setPending(null);
    onClose();
  };
  const read = (source: 'printed' | 'handwritten', attachment?: Attachment) => {
    close();
    startBill(source, attachment);
  };

  /** Hand the picked attachment to the right flow. */
  const deliver = (attachment: Attachment) => {
    const what = pending;
    close();
    if (what === 'invoice') matchInvoice(attachment);
    else startBill('printed', attachment);
  };

  const camera = async () => {
    const ok = await ImagePicker.requestCameraPermissionsAsync();
    if (!ok.granted) {
      Alert.alert('Camera', 'Qurie needs the camera to photograph a bill. Allow it in Settings.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    deliver({ kind: 'photo', uri: r.assets[0].uri, name: 'Camera', mime: r.assets[0].mimeType ?? 'image/jpeg', file: r.assets[0].file });
  };

  const gallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    deliver({ kind: 'photo', uri: r.assets[0].uri, name: r.assets[0].fileName ?? 'Photo', mime: r.assets[0].mimeType ?? 'image/jpeg', file: r.assets[0].file });
  };

  const files = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    deliver({ kind: (a.mimeType ?? '').startsWith('image/') ? 'photo' : 'file', uri: a.uri, name: a.name, mime: a.mimeType ?? undefined, file: a.file });
  };

  /** Tiles and rows open the source chooser first. */
  const choose = (what: 'brand' | 'invoice') => {
    setPending(what);
    setView('source');
  };
  const sampleInvoice = () => {
    close();
    matchInvoice();
  };

  const shops = getPeople('customer');
  void people;

  if (!open) return null;

  // Drawn inside the app tree, not as a system modal, so it stays inside the
  // screen (and the phone frame in the browser) and slides up like the chat sheet.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(21,26,23,0.35)' }]}>
        <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(24).stiffness(220)} exiting={SlideOutDown.duration(180)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: space.sm, paddingBottom: space.lg + insets.bottom, gap: space.md, maxHeight: '85%' }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.handle }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel={view === 'contacts' ? 'Back' : 'Close'} onPress={view === 'add' ? close : () => setView('add')} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={view === 'add' ? 'close' : 'arrow-back'} size={22} color={colors.ink} />
          </Pressable>
          <Txt v="heading" center style={{ flex: 1 }}>
            {view === 'contacts' ? 'Shop contact' : view === 'source' ? (pending === 'invoice' ? 'Invoice to a shop' : 'Bill from a brand') : 'Add to chat'}
          </Txt>
          {view === 'add' ? (
            <Pressable accessibilityRole="button" onPress={() => choose('brand')} hitSlop={8} style={{ minWidth: 48 }}>
              <Txt v="secondary" w="semibold" color={colors.forest}>
                All photos
              </Txt>
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>

        {view === 'add' ? (
          <View style={{ gap: space.md }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, alignItems: 'flex-start' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Camera" onPress={() => choose('brand')} style={({ pressed }) => ({ width: 120, height: 120, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
                <Ionicons name="camera-outline" size={30} color={colors.lime} />
                <Txt v="secondary" w="semibold" color={colors.lime}>
                  Camera
                </Txt>
              </Pressable>
              <SampleBill label="Invoice to a shop" onPress={() => choose('invoice')} />
              <SampleBill label="Bill from a brand" handwritten onPress={() => choose('brand')} />
            </ScrollView>
            <View style={{ paddingHorizontal: space.md, gap: space.md }}>
              <Group>
                <Row icon="cart-outline" label="Take an order" value="speak or type" onPress={() => { close(); startOrder(); }} />
                <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 54 }} />
                <Row icon="cash-outline" label="Record a collection" onPress={() => { close(); startCollection(); }} />
              </Group>
              <Group>
                <Row icon="receipt-outline" label="Invoice to a shop" value="from Marg, Tally or a photo" onPress={() => choose('invoice')} />
                <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 54 }} />
                <Row icon="document-attach-outline" label="Bill from a brand" value="what you owe them" onPress={() => choose('brand')} />
                <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 54 }} />
                <Row icon="flask-outline" label="Sample invoice" value="needs a sent order" onPress={sampleInvoice} />
                <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 54 }} />
                <Row icon="storefront-outline" label="Shop contact" value={`${shops.length}`} chevron onPress={() => setView('contacts')} />
              </Group>
            </View>
          </View>
        ) : view === 'source' ? (
          <View style={{ paddingHorizontal: space.md, gap: space.md }}>
            <Txt v="secondary" color={colors.muted} style={{ paddingHorizontal: space.xs }}>
              {pending === 'invoice' ? 'Qurie reads it, matches it to a sent order if there is one, and otherwise asks which shop it is for.' : 'Qurie will read it and ask you to confirm before saving.'}
            </Txt>
            <Group>
              <Row icon="camera-outline" label="Camera" value="take a photo now" onPress={camera} />
              <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 54 }} />
              <Row icon="images-outline" label="Gallery" value="a photo already taken" onPress={gallery} />
              <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 54 }} />
              <Row icon="document-attach-outline" label="File" value="PDF or image" onPress={files} />
            </Group>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: space.md }}>
            <Group>
              <Pressable accessibilityRole="button" onPress={() => { close(); askNewShop(); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.lg, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' })}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.button, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add" size={22} color={colors.onButton} />
                </View>
                <Txt w="semibold" style={{ flex: 1 }}>
                  New shop
                </Txt>
              </Pressable>
              {shops.map((p) => (
                <View key={p.id}>
                  <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 72 }} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Share ${p.name}`} onPress={() => { close(); shareContact(p.id); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.lg, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' })}>
                    <Avatar name={p.name} size={40} />
                    <View style={{ flex: 1 }}>
                      <Txt w="semibold">{p.name}</Txt>
                      <Txt v="caption" color={colors.muted} num>
                        {p.phone || 'No phone'}
                        {p.paired ? ' · On Qurie' : p.beat ? ` · ${p.beat}` : ''}
                      </Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </Group>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}
