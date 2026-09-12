import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateChooser, ExtractionCard, SupplierChooser } from './BillCards';
import { PaymentCard } from './PaymentCard';
import { OrderCard, ShopChooser } from './OrderCards';
import { Avatar } from './Avatar';
import { InvoiceCard } from './InvoiceCard';
import { ReadingCard } from './ReadingCard';
import { Txt } from './Txt';
import { getPerson } from '@/lib/api';
import { rupees, timeOf } from '@/lib/format';
import type { Card, Message } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

function SummaryCard({ card }: { card: Extract<Card, { kind: 'summary' }> }) {
  const cells = [
    { label: 'Sales', value: rupees(card.salesPaise) },
    { label: 'Bills', value: String(card.bills) },
    { label: 'Items', value: String(card.items) },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, marginTop: space.sm }}>
      {cells.map((c, i) => (
        <View
          key={c.label}
          style={{ flex: i === 0 ? 1.5 : 1, paddingVertical: space.md, paddingHorizontal: space.sm, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
          <Txt v="caption" color={colors.muted}>
            {c.label}
          </Txt>
          <Txt v="body" w="bold" num numberOfLines={1}>
            {c.value}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function OutstandingCard({ card }: { card: Extract<Card, { kind: 'outstanding' }> }) {
  const router = useRouter();
  const person = getPerson(card.personId);
  if (!person) return null;
  const path = person.kind === 'supplier' ? '/supplier/[id]' : '/customer/[id]';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
      <Txt v="title" num>
        {rupees(card.amountPaise)}
      </Txt>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View details for ${person.name}`}
        onPress={() => router.push({ pathname: path, params: { id: person.id } })}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Txt v="secondary" w="semibold" color={colors.forest}>
          View details
        </Txt>
        <Ionicons name="chevron-forward" size={16} color={colors.forest} />
      </Pressable>
    </View>
  );
}

function ContactCard({ personId }: { personId: string }) {
  const router = useRouter();
  const person = getPerson(personId);
  if (!person) return null;
  const path = person.kind === 'supplier' ? '/supplier/[id]' : '/customer/[id]';
  return (
    <View style={{ marginTop: space.sm, backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={person.name} size={40} />
        <View style={{ flex: 1 }}>
          <Txt w="semibold">{person.name}</Txt>
          <Txt v="secondary" color={colors.muted} num>
            {person.phone || 'No phone yet'}
          </Txt>
          {person.paired ? (
            <Txt v="caption" color={colors.green}>
              On Qurie · bills land in their app
            </Txt>
          ) : person.gstin ? (
            <Txt v="caption" color={colors.green} num>
              GSTIN {person.gstin}
            </Txt>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${person.name}`}
          onPress={() => router.push({ pathname: path, params: { id: person.id } })}
          style={({ pressed }) => ({ flex: 1, minHeight: 42, borderRadius: radius.pill, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Txt v="secondary" w="semibold" color={colors.lime}>View details</Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** The bill photo, full screen on a dark ground; tap anywhere or the cross to close. */
function PhotoViewer({ uri, label, onClose }: { uri: string; label: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(21,26,23,0.94)' }}>
        <Image source={{ uri }} accessibilityLabel={label} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
        <View style={{ position: 'absolute', top: insets.top + space.md, right: space.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={24} color={colors.paper} />
        </View>
      </Pressable>
    </Modal>
  );
}

function AttachmentView({ attachment }: { attachment: NonNullable<Message['attachment']> }) {
  const [open, setOpen] = useState(false);
  if (attachment.kind === 'photo' && attachment.uri) {
    const label = attachment.name ?? 'Bill photo';
    return (
      <>
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${label}, tap to view`} onPress={() => setOpen(true)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Image source={{ uri: attachment.uri }} accessibilityLabel={label} style={{ width: 200, height: 150, borderRadius: 14, marginBottom: 6 }} resizeMode="cover" />
        </Pressable>
        {open ? <PhotoViewer uri={attachment.uri} label={label} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 }}>
      <Ionicons name={attachment.kind === 'file' ? 'document-attach-outline' : 'image-outline'} size={20} color={colors.onBubbleMine} />
      <Txt v="secondary" w="semibold" color={colors.onBubbleMine} numberOfLines={1}>
        {attachment.name ?? (attachment.kind === 'file' ? 'File' : 'Photo')}
      </Txt>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    const up = { duration: 300, easing: Easing.inOut(Easing.quad) };
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, up), withTiming(0, up), withTiming(0, { duration: 360 })), -1, false));
    return () => cancelAnimation(v);
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.65, transform: [{ translateY: -v.value * 3 }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.muted }, style]} />;
}

/** Three dots that rise one after another while Qurie is reading or thinking. */
export function TypingDots() {
  return (
    <View accessibilityLabel="Qurie is working" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 20 }}>
      {[0, 160, 320].map((d) => (
        <Dot key={d} delay={d} />
      ))}
    </View>
  );
}

export function ChatBubble({ message, compact }: { message: Message; compact?: boolean }) {
  const mine = message.role === 'user';
  // A review card is a form, not a sentence: it takes the bubble's full width and drops the avatar.
  const wide = message.card?.kind === 'extraction' || message.card?.kind === 'invoice' || message.card?.kind === 'order' || message.card?.kind === 'collection';
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: space.sm }}>
      {!mine && !compact && !wide && (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
          <Ionicons name="sparkles" size={14} color={colors.lime} />
        </View>
      )}
      <View style={message.card ? { flex: 1, gap: 2 } : { maxWidth: '84%', flexShrink: 1, gap: 2 }}>
        <View
          style={{
            backgroundColor: mine ? colors.bubbleMine : colors.surface,
            borderRadius: 22,
            borderBottomLeftRadius: mine ? 22 : 6,
            borderBottomRightRadius: mine ? 6 : 22,
            shadowColor: colors.ink,
            shadowOpacity: 0.06,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
            paddingHorizontal: wide ? space.sm : space.lg,
            paddingVertical: wide ? space.sm : space.md,
          }}>
          {message.attachment ? <AttachmentView attachment={message.attachment} /> : null}
          {message.text ? <Txt color={mine ? colors.onBubbleMine : colors.ink}>{message.text}</Txt> : null}
          {message.card?.kind === 'summary' && <SummaryCard card={message.card} />}
          {message.card?.kind === 'outstanding' && <OutstandingCard card={message.card} />}
          {message.card?.kind === 'extraction' && <ExtractionCard draftId={message.card.draftId} />}
          {message.card?.kind === 'choose-supplier' && <SupplierChooser draftId={message.card.draftId} />}
          {message.card?.kind === 'choose-date' && <DateChooser draftId={message.card.draftId} />}
          {message.card?.kind === 'contact' && <ContactCard personId={message.card.personId} />}
          {message.card?.kind === 'reading' && <ReadingCard what={message.card.what} />}
          {message.card?.kind === 'invoice' && <InvoiceCard invoiceId={message.card.invoiceId} />}
          {message.card?.kind === 'choose-shop' && <ShopChooser orderId={message.card.orderId} collectionId={message.card.collectionId} invoiceId={message.card.invoiceId} />}
          {message.card?.kind === 'order' && <OrderCard orderId={message.card.orderId} />}
          {message.card?.kind === 'collection' && <PaymentCard collectionId={message.card.collectionId} />}
        </View>
        {!compact && (
          <Txt v="caption" color={colors.muted} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}>
            {timeOf(message.at)}
            {mine ? '  ✓✓' : ''}
          </Txt>
        )}
      </View>
    </Animated.View>
  );
}
