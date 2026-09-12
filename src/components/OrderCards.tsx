import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar } from './Avatar';
import { EditValue } from './EditRow';
import { Txt } from './Txt';
import { getPeople, getPerson } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees } from '@/lib/format';
import { orderTotal } from '@/lib/orders';
import { colors, radius, space } from '@/theme/tokens';

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: primary ? 1.4 : 1,
        minHeight: 46,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.button : 'transparent',
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Txt v="secondary" w="semibold" color={primary ? colors.onButton : colors.ink}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The order as Qurie understood it: one row per line, the total, and the confirm button. */
export function OrderCard({ orderId }: { orderId: string }) {
  const order = useAppState((s) => s.orders[orderId]);
  const confirmOrder = useAppState((s) => s.confirmOrder);
  const editOrder = useAppState((s) => s.editOrder);
  const cancelOrder = useAppState((s) => s.cancelOrder);
  const editOrderLine = useAppState((s) => s.editOrderLine);
  const removeOrderLine = useAppState((s) => s.removeOrderLine);
  const addOrderLine = useAppState((s) => s.addOrderLine);
  const changeOrderShop = useAppState((s) => s.changeOrderShop);
  if (!order) return null;
  const shop = getPerson(order.shopId ?? '');
  const total = orderTotal(order.lines);
  const active = order.stage === 'confirm';
  const status =
    order.stage === 'sent' ? 'Sent to billing, waiting for the invoice' : order.stage === 'billed' ? 'Billed and sent to the shop' : order.stage === 'cancelled' ? 'Dropped' : order.stage === 'items' ? 'Being changed' : undefined;

  return (
    <View style={{ marginTop: space.sm, gap: space.sm }}>
      <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
        <Pressable
          accessibilityRole={active ? 'button' : 'text'}
          accessibilityLabel={active ? `Shop: ${shop?.name ?? 'not chosen'}. Tap to change.` : undefined}
          onPress={active ? () => changeOrderShop(orderId) : undefined}
          disabled={!active}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            padding: space.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
          })}>
          {shop ? <Avatar name={shop.name} size={28} /> : null}
          <View style={{ flex: 1 }}>
            <Txt v="secondary" w="semibold" numberOfLines={1}>
              {shop?.name ?? 'Shop not chosen'}
            </Txt>
            <Txt v="caption" color={colors.muted}>
              {order.number}
              {shop?.paired ? ' · on Qurie' : ''}
              {active ? ' · tap to change' : ''}
            </Txt>
          </View>
          {active ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
        </Pressable>
        {order.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.itemId ? colors.green : colors.amber }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <EditValue
                value={l.name}
                placeholder="Item"
                onChange={(v) => editOrderLine(orderId, i, { name: String(v ?? '') })}
                editable={active}
                lines={2}
              />
              {!l.itemId && l.name.trim() ? (
                <Txt v="caption" color={colors.amber}>
                  Not in your item list, billing sets the rate
                </Txt>
              ) : null}
            </View>
            <View style={{ width: 64 }}>
              <EditValue
                value={l.qty}
                kind="number"
                placeholder="Qty"
                align="right"
                small
                onChange={(v) => editOrderLine(orderId, i, { qty: Number(v ?? 0) })}
                editable={active}
                render={(txt) => (l.unit && txt !== 'Qty' ? `${txt} ${l.unit}` : txt)}
              />
            </View>
            <Txt v="secondary" w="semibold" num style={{ minWidth: 66, textAlign: 'right' }}>
              {l.ratePaise ? rupees(l.ratePaise * l.qty) : '—'}
            </Txt>
            {active ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${l.name || 'this line'}`}
                onPress={() => removeOrderLine(orderId, i)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingLeft: 2 })}>
                <Ionicons name="close-circle-outline" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}

        {active ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add an item to this order"
            onPress={() => addOrderLine(orderId)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: space.md,
              paddingVertical: 9,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
            })}>
            <Ionicons name="add" size={16} color={colors.forest} />
            <Txt v="caption" w="semibold" color={colors.forest}>
              Add an item
            </Txt>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Txt v="secondary" color={colors.muted}>
            {order.lines.length} {order.lines.length === 1 ? 'item' : 'items'}
          </Txt>
          <Txt v="body" w="bold" num>
            {rupees(total)}
            {order.lines.some((l) => !l.ratePaise) ? ' +' : ''}
          </Txt>
        </View>
      </View>
      {active ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Looks right" primary onPress={() => confirmOrder(orderId)} />
          <Button label="Retype all" onPress={() => editOrder(orderId)} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => cancelOrder(orderId)} hitSlop={8} style={{ width: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : status ? (
        <Txt v="caption" color={order.stage === 'billed' ? colors.green : colors.muted}>
          {status}
        </Txt>
      ) : null}
    </View>
  );
}

/** The distributor's own shops as chips, plus New shop. Serves an order or a collection. */
export function ShopChooser({ orderId, collectionId, invoiceId }: { orderId?: string; collectionId?: string; invoiceId?: string }) {
  const order = useAppState((s) => (orderId ? s.orders[orderId] : undefined));
  const coll = useAppState((s) => (collectionId ? s.collections[collectionId] : undefined));
  const inv = useAppState((s) => (invoiceId ? s.invoices[invoiceId] : undefined));
  const people = useAppState((s) => s.people);
  const chooseShop = useAppState((s) => s.chooseShop);
  void people;
  const active = orderId ? order?.stage === 'shop' : invoiceId ? inv?.stage === 'shop' : coll?.stage === 'shop';
  const chosen = orderId ? order?.shopId : coll?.shopId;
  if (!active) {
    const name = chosen ? getPerson(chosen)?.name : undefined;
    return (
      <Txt v="caption" color={colors.muted} style={{ marginTop: 4 }}>
        {name ? `Chose ${name}` : 'Answered'}
      </Txt>
    );
  }
  const shops = getPeople('customer');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm, marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
      {shops.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${p.name}`}
          onPress={() => chooseShop({ orderId, collectionId, invoiceId }, p.id)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14, paddingLeft: 6, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
          <Avatar name={p.name} size={28} />
          <View>
            <Txt v="secondary" w="semibold">
              {p.name}
            </Txt>
            <Txt v="caption" color={p.paired ? colors.green : colors.muted}>
              {p.paired ? 'On Qurie' : p.beat ?? ''}
            </Txt>
          </View>
        </Pressable>
      ))}
      {orderId || inv?.buyerName ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inv?.buyerName ? `Add ${inv.buyerName}` : 'New shop'}
          onPress={() => chooseShop({ orderId, invoiceId }, 'new')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.button, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="add" size={18} color={colors.onButton} />
          <Txt v="secondary" w="semibold" color={colors.onButton} numberOfLines={1}>
            {inv?.buyerName ? `Add ${inv.buyerName}` : 'New shop'}
          </Txt>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
