import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { EditRow, ItemRow } from './EditRow';
import { Txt } from './Txt';
import type { InvoiceLine } from '@/lib/types';
import { getPerson } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees } from '@/lib/format';
import { colors, radius, space } from '@/theme/tokens';

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 46,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.button : 'transparent',
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Txt v="secondary" w="semibold" color={primary ? colors.onButton : colors.ink} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

function Line() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

/** What the bill printed on this line, under the name: pack, code, batch, expiry, MRP, tax. */
function lineDetail(it: InvoiceLine): string | undefined {
  const bits = [
    it.pack,
    it.hsn ? `HSN ${it.hsn}` : null,
    it.batch ? `B ${it.batch}` : null,
    it.expiry ? `exp ${it.expiry}` : null,
    it.mrp_paise ? `MRP ${rupees(it.mrp_paise)}` : null,
    it.free_qty ? `+${it.free_qty} free` : null,
    it.discount_pct ? `${it.discount_pct}% off` : null,
    it.gst_pct ? `GST ${it.gst_pct}%` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : undefined;
}

/**
 * An invoice the owner raised, as Qurie read it. Every field can be corrected
 * by tapping it, and the shop row opens the picker. Nothing reaches the server
 * until "Looks right".
 */
export function InvoiceCard({ invoiceId }: { invoiceId: string }) {
  const draft = useAppState((s) => s.invoices[invoiceId]);
  const editInvoice = useAppState((s) => s.editInvoice);
  const editInvoiceItem = useAppState((s) => s.editInvoiceItem);
  const confirmInvoice = useAppState((s) => s.confirmInvoice);
  const changeInvoiceShop = useAppState((s) => s.changeInvoiceShop);
  const cancelInvoice = useAppState((s) => s.cancelInvoice);
  if (!draft) return null;

  const shop = draft.shopId ? getPerson(draft.shopId) : undefined;
  const active = draft.stage === 'confirm';
  const lineSum = draft.items.reduce((n, i) => n + (i.amount_paise || 0), 0);
  const off = lineSum > 0 && draft.totalPaise > 0 && Math.abs(lineSum - draft.totalPaise) > 100;

  // Only rows the bill actually printed. A blank GST row on a kirana bill is noise,
  // but a wrong one has to be correctable, so anything read is shown.
  const rows: { key: 'subtotalPaise' | 'discountPaise' | 'cgstPaise' | 'sgstPaise' | 'igstPaise' | 'cessPaise' | 'roundOffPaise'; label: string }[] = [
    { key: 'subtotalPaise', label: 'Taxable value' },
    { key: 'discountPaise', label: 'Discount' },
    { key: 'cgstPaise', label: 'CGST' },
    { key: 'sgstPaise', label: 'SGST' },
    { key: 'igstPaise', label: 'IGST' },
    { key: 'cessPaise', label: 'Cess' },
    { key: 'roundOffPaise', label: 'Round off' },
  ];
  const money = rows.filter((r) => draft[r.key] !== undefined && draft[r.key] !== null && draft[r.key] !== 0);
  const taxSum = (draft.cgstPaise ?? 0) + (draft.sgstPaise ?? 0) + (draft.igstPaise ?? 0) + (draft.cessPaise ?? 0);
  const taxNote = taxSum > 0 ? `Includes ${rupees(taxSum)} tax` : draft.taxPaise ? `Includes ${rupees(draft.taxPaise)} tax` : undefined;

  return (
    <View style={{ marginTop: space.sm, gap: space.sm }}>
      <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <EditRow
          label="Shop"
          value={shop?.name}
          dot={shop ? colors.green : colors.red}
          caption={shop && draft.buyerName && draft.buyerName !== shop.name ? `Bill says ${draft.buyerName}` : shop ? undefined : 'Tap to choose'}
          placeholder={draft.buyerName ?? 'Not chosen'}
          onPress={active ? () => changeInvoiceShop(invoiceId) : undefined}
          editable={active}
        />
        <Line />
        <EditRow label="No." value={draft.number} dot={draft.number ? colors.green : colors.amber} placeholder="None on bill" onChange={(v) => editInvoice(invoiceId, { number: String(v ?? '') })} editable={active} />
        <Line />
        <EditRow label="Date" value={draft.date} kind="date" dot={draft.date ? colors.green : colors.red} onChange={(v) => v && editInvoice(invoiceId, { date: String(v) })} editable={active} />
        <Line />
        {money.map((m) => (
          <View key={m.key}>
            <Line />
            <EditRow
              label={m.label}
              value={draft[m.key] || undefined}
              kind="money"
              dot={colors.green}
              onChange={(v) => editInvoice(invoiceId, { [m.key]: Number(v ?? 0) })}
              editable={active}
            />
          </View>
        ))}
        <Line />
        <EditRow
          label="Total"
          value={draft.totalPaise || undefined}
          kind="money"
          dot={draft.totalPaise ? (off ? colors.amber : colors.green) : colors.red}
          caption={off ? `Lines add up to ${rupees(lineSum)}` : taxNote}
          onChange={(v) => editInvoice(invoiceId, { totalPaise: Number(v ?? 0) })}
          editable={active}
        />

        {draft.items.length ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: 9, paddingBottom: 3 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }} />
              <Txt v="secondary" color={colors.muted}>
                {draft.items.length} {draft.items.length === 1 ? 'item' : 'items'}
              </Txt>
              <Txt v="caption" color={colors.muted} style={{ flex: 1 }} numberOfLines={1}>
                tap to fix
              </Txt>
            </View>
            {draft.items.map((it, i) => (
              <View key={i} style={{ borderTopWidth: 1, borderTopColor: colors.limeSoft }}>
                <ItemRow
                  index={i}
                  name={it.product}
                  qty={it.qty}
                  amountPaise={it.amount_paise}
                  ratePaise={it.rate_paise ?? undefined}
                  detail={lineDetail(it)}
                  editable={active}
                  onName={(v) => editInvoiceItem(invoiceId, i, { product: String(v ?? '') })}
                  onQty={(v) => editInvoiceItem(invoiceId, i, { qty: Number(v ?? 0) })}
                  onAmount={(v) => editInvoiceItem(invoiceId, i, { amount_paise: Number(v ?? 0) })}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {active ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Button label={shop ? 'Looks right' : 'Choose a shop first'} primary onPress={() => (shop ? confirmInvoice(invoiceId) : changeInvoiceShop(invoiceId))} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => cancelInvoice(invoiceId)} hitSlop={8} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <Txt v="caption" color={draft.stage === 'saved' ? colors.green : colors.muted}>
          {draft.stage === 'saved' ? 'Filed' : draft.stage === 'cancelled' ? 'Dropped' : 'Choosing the shop'}
        </Txt>
      )}
    </View>
  );
}
