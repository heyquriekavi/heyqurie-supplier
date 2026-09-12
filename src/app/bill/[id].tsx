import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmBar } from '@/components/ConfirmBar';
import { IconButton } from '@/components/IconButton';
import { EditValue } from '@/components/EditRow';
import { Pill } from '@/components/Pill';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Txt } from '@/components/Txt';
import { rupees, shortDate } from '@/lib/format';
import { useAppState } from '@/lib/appState';
import { billImageDataUrl, deleteBill, deletePayment, getBill, payBill, type ServerBill } from '@/lib/server';
import { nextAction, statusLabel, statusOf, statusTone } from '@/lib/status';
import { colors, radius, space } from '@/theme/tokens';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Row({ label, value, strong, color }: { label: string; value?: string | null; strong?: boolean; color?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 6 }}>
      <Txt v="secondary" color={colors.muted}>
        {label}
      </Txt>
      <Txt v="secondary" w={strong ? 'bold' : 'medium'} num color={color} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

/** One bill: its soft copy, the parties, the lines, the money, the payments. Read from the server. */
export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [bill, setBill] = useState<ServerBill | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'bill' } | { kind: 'payment'; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [partPaise, setPartPaise] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState('cash');
  const router = useRouter();
  const refresh = useAppState((s) => s.refresh);

  const reload = () => getBill(String(id)).then(setBill).catch(() => {});

  /** Status is never set by hand: recording the money is what moves it. */
  const record = async (amountPaise: number, mode: string) => {
    if (!bill || amountPaise <= 0) return;
    const personId = bill.customer_id ?? bill.supplier_id;
    if (!personId) return;
    setBusy(true);
    setNotice(null);
    try {
      await payBill({ person_id: personId, bill_id: bill.id, amount_paise: amountPaise, mode });
      await refresh();
      await reload();
      setSettling(false);
    } catch (e) {
      setNotice((e as Error)?.message ?? 'Could not record it');
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    setNotice(null);
    try {
      if (confirm.kind === 'bill') {
        await deleteBill(String(id));
        await refresh();
        router.canGoBack() ? router.back() : router.replace('/');
        return;
      }
      await deletePayment(confirm.id);
      await refresh();
      await reload();
      setConfirm(null);
    } catch (e) {
      setNotice((e as Error)?.message ?? 'Could not delete');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    getBill(String(id))
      .then((b) => {
        if (!alive) return;
        setBill(b);
        if (b.has_image) billImageDataUrl(b.id).then((u) => alive && setImage(u));
      })
      .catch((e) => alive && setError((e as Error)?.message ?? 'Could not load'));
    return () => {
      alive = false;
    };
  }, [id]);

  const sale = bill?.kind === 'sale';
  const money = bill ? { totalPaise: bill.total_paise, paidPaise: bill.paid_paise, dueDate: bill.due_date } : null;
  const state = money ? statusOf(money) : null;
  const status = money && state ? { tone: statusTone[state], text: statusLabel(state, money, sale) } : { tone: 'neutral' as const, text: '' };
  const action = money ? nextAction(money, sale) : null;
  const party = sale ? bill?.buyer_name : bill?.seller_name;
  const left = bill ? Math.max(bill.total_paise - bill.paid_paise, 0) : 0;
  const isPdf = !!image && image.startsWith('data:application/pdf');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <ScreenHeader
        center={
          <View>
            <Txt v="heading" numberOfLines={1}>
              {bill ? `${sale ? 'Invoice' : 'Bill'}${bill.number ? ` ${bill.number}` : ''}` : 'Bill'}
            </Txt>
            {bill ? (
              <Txt v="caption" color={colors.muted}>
                {shortDate(bill.bill_date.length > 10 ? bill.bill_date : `${bill.bill_date}T10:00:00`)}
                {party ? ` · ${party}` : ''}
              </Txt>
            ) : null}
          </View>
        }
        right={
          bill ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginRight: space.xs }}>
              <Pill tone={status.tone} text={status.text} />
              <IconButton name="trash-outline" label="Delete this bill" color={colors.red} onPress={() => setConfirm({ kind: 'bill' })} />
            </View>
          ) : undefined
        }
      />

      {error ? (
        <Txt color={colors.red} style={{ padding: space.lg }}>
          {error}
        </Txt>
      ) : !bill ? (
        <ActivityIndicator color={colors.forest} style={{ marginTop: space.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
          {confirm?.kind === 'bill' ? (
            <ConfirmBar text={`Delete ${sale ? 'invoice' : 'bill'}${bill.number ? ` ${bill.number}` : ''}? It leaves every list. The record is kept for GST.`} busy={busy} onCancel={() => setConfirm(null)} onConfirm={doDelete} />
          ) : null}
          {notice ? (
            <Txt v="secondary" color={colors.red}>
              {notice}
            </Txt>
          ) : null}
          {/* Soft copy */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minHeight: 120, alignItems: 'center', justifyContent: 'center' }}>
            {bill.has_image && image && !isPdf ? (
              <Image source={{ uri: image }} resizeMode="contain" style={{ width: '100%', aspectRatio: 3 / 4 }} accessibilityLabel="Bill photo" />
            ) : bill.has_image && !image ? (
              <ActivityIndicator color={colors.forest} />
            ) : bill.has_image && isPdf ? (
              <View style={{ alignItems: 'center', gap: 6, padding: space.lg }}>
                <Ionicons name="document-attach-outline" size={30} color={colors.forest} />
                <Txt v="secondary" color={colors.muted}>PDF stored with this bill</Txt>
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 6, padding: space.lg }}>
                <Ionicons name="image-outline" size={30} color={colors.muted} />
                <Txt v="secondary" color={colors.muted}>No soft copy attached</Txt>
              </View>
            )}
          </View>

          {/* Money */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
            <Row label={sale ? 'Billed' : 'Bill total'} value={rupees(bill.total_paise)} strong />
            <Row label={sale ? 'Collected' : 'Paid'} value={bill.paid_paise ? rupees(bill.paid_paise) : null} color={colors.blue} />
            <Row label={sale ? 'To collect' : 'Outstanding'} value={left ? rupees(left) : null} strong color={status.tone === 'due' ? colors.red : colors.green} />
            <Row label="Due date" value={bill.due_date ? shortDate(`${bill.due_date.slice(0, 10)}T10:00:00`) : null} />
            <Row label="Order" value={bill.order_number} />
          </View>

          {/* Settle: the physical control. It writes a payment, and the status follows. */}
          {action ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md }}>
              {!settling ? (
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => record(left, mode)}
                    style={({ pressed }) => ({ flex: 1.5, minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.button, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}>
                    <Txt v="secondary" w="semibold" color={colors.onButton} numberOfLines={1}>
                      {busy ? 'Saving…' : `${action.full} · ${rupees(left)}`}
                    </Txt>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setPartPaise(undefined);
                      setSettling(true);
                    }}
                    style={({ pressed }) => ({ flex: 1, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Txt v="secondary" w="semibold" numberOfLines={1}>
                      Part
                    </Txt>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Txt v="secondary" color={colors.muted} style={{ width: 58 }}>
                      Amount
                    </Txt>
                    <EditValue value={partPaise} kind="money" placeholder="Tap to type" onChange={(v) => setPartPaise(v === undefined ? undefined : Number(v))} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Txt v="secondary" color={colors.muted} style={{ width: 58 }}>
                      Mode
                    </Txt>
                    <View style={{ flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {['cash', 'upi', 'bank', 'cheque'].map((m) => (
                        <Pressable
                          key={m}
                          accessibilityRole="button"
                          accessibilityState={{ selected: mode === m }}
                          onPress={() => setMode(m)}
                          style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: mode === m ? colors.forestSoft : 'transparent', borderWidth: 1, borderColor: mode === m ? colors.forest : colors.border }}>
                          <Txt v="caption" w="semibold" color={mode === m ? colors.forest : colors.muted}>
                            {m.toUpperCase()}
                          </Txt>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy || !partPaise}
                      onPress={() => record(Math.min(partPaise ?? 0, left), mode)}
                      style={({ pressed }) => ({ flex: 1.5, minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.button, alignItems: 'center', justifyContent: 'center', opacity: busy || !partPaise ? 0.45 : pressed ? 0.7 : 1 })}>
                      <Txt v="secondary" w="semibold" color={colors.onButton}>
                        {busy ? 'Saving…' : 'Record'}
                      </Txt>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSettling(false)}
                      style={({ pressed }) => ({ flex: 1, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                      <Txt v="secondary" w="semibold">
                        Cancel
                      </Txt>
                    </Pressable>
                  </View>
                </View>
              )}
              <Txt v="caption" color={colors.muted}>
                {sale ? 'Recording the money is what marks it collected.' : 'Recording the money is what marks it paid.'}
              </Txt>
            </View>
          ) : null}

          {/* Parties */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
            <Row label="Seller" value={bill.seller_name} />
            <Row label="Seller GSTIN" value={bill.seller_gstin} />
            <Row label="Seller licence" value={bill.seller_licence} />
            <Row label="Buyer" value={bill.buyer_name} />
            <Row label="Buyer GSTIN" value={bill.buyer_gstin} />
            <Row label="Salesman" value={bill.salesman} />
          </View>

          {/* Lines */}
          {bill.items.length ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Txt v="secondary" w="semibold">
                  {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}
                </Txt>
              </View>
              {bill.items.map((it) => (
                <View key={it.id} style={{ paddingHorizontal: space.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                    <Txt v="secondary" w="medium" style={{ flex: 1 }} numberOfLines={2}>
                      {it.product}
                    </Txt>
                    <Txt v="secondary" w="semibold" num>
                      {rupees(it.amount_paise)}
                    </Txt>
                  </View>
                  <Txt v="caption" color={colors.muted} num>
                    {[`${it.qty}${it.pack ? ` × ${it.pack}` : ''}`, it.rate_paise ? `@ ${rupees(it.rate_paise)}` : null, it.batch ? `batch ${it.batch}` : null, it.expiry ? `exp ${it.expiry}` : null, it.hsn ? `HSN ${it.hsn}` : null, it.sgst_pct || it.cgst_pct ? `GST ${it.sgst_pct + it.cgst_pct}%` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Txt>
                </View>
              ))}
              <View style={{ padding: space.md, gap: 2 }}>
                <Row label="Subtotal" value={bill.subtotal_paise ? rupees(bill.subtotal_paise) : null} />
                <Row label="Discount" value={bill.discount_paise ? rupees(bill.discount_paise) : null} />
                <Row label="SGST" value={bill.sgst_paise ? rupees(bill.sgst_paise) : null} />
                <Row label="CGST" value={bill.cgst_paise ? rupees(bill.cgst_paise) : null} />
                <Row label="IGST" value={bill.igst_paise ? rupees(bill.igst_paise) : null} />
                <Row label="Grand total" value={rupees(bill.total_paise)} strong />
              </View>
            </View>
          ) : null}

          {/* Payments */}
          {bill.payments.length ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
              <Txt v="secondary" w="semibold" style={{ marginBottom: 4 }}>
                {sale ? 'Collections' : 'Payments'}
              </Txt>
              {bill.payments.map((p) => (
                <View key={p.id} style={{ gap: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Row label={`${shortDate(`${p.paid_on.slice(0, 10)}T12:00:00`)}${p.mode ? ` · ${p.mode.toUpperCase()}` : ''}${p.reference ? ` · ${p.reference}` : ''}`} value={rupees(p.amount_paise)} />
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Delete this payment" onPress={() => setConfirm({ kind: 'payment', id: p.id })} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="trash-outline" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                  {confirm?.kind === 'payment' && confirm.id === p.id ? (
                    <ConfirmBar text={`Delete this ${sale ? 'collection' : 'payment'} of ${rupees(p.amount_paise)}?`} busy={busy} onCancel={() => setConfirm(null)} onConfirm={doDelete} />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
