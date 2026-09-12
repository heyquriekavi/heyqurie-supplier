import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar } from './Avatar';
import { EditRow, ItemRow } from './EditRow';
import { Txt } from './Txt';
import { addDays, getPeople } from '@/lib/api';
import { useAppState } from '@/lib/appState';
import { rupees, shortDate } from '@/lib/format';
import type { Draft, DraftFields } from '@/lib/types';
import { colors, radius, space } from '@/theme/tokens';

/** Confidence colour from the design brief: green at 0.9 and above, amber 0.6 to 0.9, red under 0.6. */
/** What the bill printed on this line, under the name. */
function lineDetail(it: NonNullable<DraftFields['items']>[number]): string | undefined {
  const bits = [
    it.pack,
    it.hsn ? `HSN ${it.hsn}` : null,
    it.batch ? `B ${it.batch}` : null,
    it.expiry ? `exp ${it.expiry}` : null,
    it.mrpPaise ? `MRP ${rupees(it.mrpPaise)}` : null,
    it.freeQty ? `+${it.freeQty} free` : null,
    it.discountPct ? `${it.discountPct}% off` : null,
    it.gstPct ? `GST ${it.gstPct}%` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' \u00b7 ') : undefined;
}

function dotColor(c: number | undefined, present: boolean) {
  if (!present) return colors.red;
  if (c === undefined) return colors.muted;
  if (c >= 0.9) return colors.green;
  if (c >= 0.6) return colors.amber;
  return colors.red;
}

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
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

/** What Qurie read, one row per field, with a confidence dot. Saved only after the owner confirms. */
export function ExtractionCard({ draftId }: { draftId: string }) {
  const draft = useAppState((s) => s.drafts[draftId]);
  const confirmDraft = useAppState((s) => s.confirmDraft);
  const changeSupplier = useAppState((s) => s.changeSupplier);
  const cancelDraft = useAppState((s) => s.cancelDraft);
  const editDraft = useAppState((s) => s.editDraft);
  const editDraftItem = useAppState((s) => s.editDraftItem);
  if (!draft) return null;
  const f = draft.fields;
  const c = draft.confidence;
  const active = draft.stage === 'confirm';

  const rows: { label: string; value?: string | number; dot: string; caption?: string; kind?: 'text' | 'money' | 'date'; edit?: (v: string | number | undefined) => void }[] = [
    {
      label: 'Brand',
      value: f.supplierName,
      dot: dotColor(f.matchedBy === 'chosen' || f.matchedBy === 'new' ? 1 : c.supplier, !!f.supplierId),
      caption:
        f.matchedBy === 'gstin' ? `Matched by GSTIN ${f.gstin}` : f.matchedBy === 'chosen' ? 'Chosen by you' : f.matchedBy === 'new' ? 'New brand' : undefined,
    },
    { label: 'No.', value: f.number, dot: dotColor(c.number, !!f.number), edit: (v) => editDraft(draftId, { number: v === undefined ? undefined : String(v) }) },
    { label: 'Date', value: f.date, kind: 'date', dot: dotColor(c.date, !!f.date), edit: (v) => editDraft(draftId, { date: v === undefined ? undefined : String(v) }) },
    { label: 'Due', value: f.dueDate, kind: 'date', dot: dotColor(f.dueDate ? 1 : undefined, !!f.dueDate), edit: (v) => editDraft(draftId, { dueDate: v === undefined ? undefined : String(v) }) },
    { label: 'Total', value: f.totalPaise, kind: 'money', dot: dotColor(c.total, !!f.totalPaise), edit: (v) => editDraft(draftId, { totalPaise: v === undefined ? undefined : Number(v) }) },
  ];
  // Everything the bill printed between the date and the total. Rows the bill did
  // not carry are left out; a blank CGST line on a kirana bill is only noise, but
  // a wrong one has to be correctable, so anything read is shown.
  const money: { key: 'subtotalPaise' | 'discountPaise' | 'cgstPaise' | 'sgstPaise' | 'igstPaise' | 'cessPaise' | 'taxPaise' | 'roundOffPaise'; label: string }[] = [
    { key: 'subtotalPaise', label: 'Taxable value' },
    { key: 'discountPaise', label: 'Discount' },
    { key: 'cgstPaise', label: 'CGST' },
    { key: 'sgstPaise', label: 'SGST' },
    { key: 'igstPaise', label: 'IGST' },
    { key: 'cessPaise', label: 'Cess' },
    { key: 'taxPaise', label: 'Tax total' },
    { key: 'roundOffPaise', label: 'Round off' },
  ];
  const split = (f.cgstPaise ?? 0) + (f.sgstPaise ?? 0) + (f.igstPaise ?? 0) + (f.cessPaise ?? 0);
  for (const m of money) {
    const v = f[m.key];
    if (v === undefined || v === null || v === 0) continue;
    // With the halves shown, a separate "Tax total" row just repeats their sum.
    if (m.key === 'taxPaise' && split > 0) continue;
    rows.splice(rows.length - 1, 0, {
      label: m.label,
      value: v,
      kind: 'money',
      dot: dotColor(c.tax ?? 0.9, true),
      edit: (x) => editDraft(draftId, { [m.key]: x === undefined ? undefined : Number(x) }),
    });
  }
  const items = f.items ?? [];

  return (
    <View style={{ marginTop: space.sm, gap: space.sm }}>
      <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
        {rows.map((r, i) => (
          <View key={r.label} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <EditRow
              label={r.label}
              value={r.value}
              dot={r.dot}
              caption={r.caption}
              kind={r.kind}
              onChange={r.edit}
              onPress={r.label === 'Brand' ? () => changeSupplier(draftId) : undefined}
              placeholder={r.label === 'Brand' ? 'Not read' : undefined}
              editable={active && (!!r.edit || r.label === 'Brand')}
            />
          </View>
        ))}
        {items.length ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: 9, paddingBottom: 3 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor(0.9, true) }} />
              <Txt v="secondary" color={colors.muted}>
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </Txt>
              <Txt v="caption" color={colors.muted} style={{ flex: 1 }} numberOfLines={1}>
                tap to fix
              </Txt>
            </View>
            {items.map((it, i) => (
              <View key={i} style={{ borderTopWidth: 1, borderTopColor: colors.limeSoft }}>
                <ItemRow
                  index={i}
                  name={it.description}
                  qty={it.qty}
                  amountPaise={it.amountPaise}
                  ratePaise={it.ratePaise}
                  detail={lineDetail(it)}
                  editable={active}
                  onName={(v) => editDraftItem(draftId, i, { description: v === undefined ? undefined : String(v) })}
                  onQty={(v) => editDraftItem(draftId, i, { qty: v === undefined ? undefined : Number(v) })}
                  onAmount={(v) => editDraftItem(draftId, i, { amountPaise: v === undefined ? undefined : Number(v) })}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {active ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Button label="Looks right" primary onPress={() => confirmDraft(draftId)} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => cancelDraft(draftId)} hitSlop={8} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <Txt v="caption" color={draft.stage === 'saved' ? colors.green : colors.muted}>
          {draft.stage === 'saved' ? 'Confirmed and filed' : draft.stage === 'cancelled' ? 'Dropped' : 'Being changed'}
        </Txt>
      )}
    </View>
  );
}

/** The owner's own suppliers as chips, plus New supplier. */
export function SupplierChooser({ draftId }: { draftId: string }) {
  const draft = useAppState((s) => s.drafts[draftId]);
  const people = useAppState((s) => s.people);
  const chooseSupplier = useAppState((s) => s.chooseSupplier);
  const active = draft?.stage === 'supplier';
  const suppliers = getPeople('supplier');
  void people;
  if (!active) return <Txt v="caption" color={colors.muted} style={{ marginTop: 4 }}>{draft?.fields.supplierName ? `Chose ${draft.fields.supplierName}` : 'Answered'}</Txt>;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm, marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
      {suppliers.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${p.name}`}
          onPress={() => chooseSupplier(draftId, p.id)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14, paddingLeft: 6, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
          <Avatar name={p.name} size={28} />
          <View>
            <Txt v="secondary" w="semibold">
              {p.name}
            </Txt>
            {p.gstin ? (
              <Txt v="caption" color={colors.green}>
                GSTIN on file
              </Txt>
            ) : null}
          </View>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New brand"
        onPress={() => chooseSupplier(draftId, 'new')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.forest, opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="add" size={18} color={colors.lime} />
        <Txt v="secondary" w="semibold" color={colors.lime}>
          New brand
        </Txt>
      </Pressable>
    </ScrollView>
  );
}

/** Today, yesterday, day before, or type a date in the field as dd-mm-yyyy. */
export function DateChooser({ draftId }: { draftId: string }) {
  const draft = useAppState((s) => s.drafts[draftId]);
  const chooseDate = useAppState((s) => s.chooseDate);
  const active = draft?.stage === 'date';
  if (!active) return <Txt v="caption" color={colors.muted} style={{ marginTop: 4 }}>{draft?.fields.date ? `Chose ${shortDate(draft.fields.date)}` : 'Answered'}</Txt>;

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const options = [
    { label: 'Today', iso: today },
    { label: 'Yesterday', iso: addDays(today, -1) },
    { label: shortDate(addDays(today, -2)), iso: addDays(today, -2) },
  ];
  return (
    <View style={{ marginTop: space.sm, gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Pressable
            key={o.iso}
            accessibilityRole="button"
            onPress={() => chooseDate(draftId, o.iso)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
            <Txt v="secondary" w="semibold">
              {o.label}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Txt v="caption" color={colors.muted}>
        Or type it below as dd-mm-yyyy
      </Txt>
    </View>
  );
}

export type { Draft };
