import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Txt } from './Txt';
import { rupees, shortDate } from '@/lib/format';
import { colors, font, space, type } from '@/theme/tokens';

/** ISO date -> what the owner types, and back. Dates on Indian bills are day first. */
export function isoToTyped(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : '';
}

export function typedToIso(text: string): string | undefined {
  const m = text.trim().match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined;
  // A real calendar day, so 31-02 is refused rather than silently rolled forward.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function rupeesToPaise(text: string): number | undefined {
  const clean = text.replace(/[₹,\s]/g, '');
  if (!clean) return undefined;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export type RowKind = 'text' | 'money' | 'date' | 'number';
export type Value = string | number | undefined;

function display(value: Value, kind: RowKind, placeholder: string): { text: string; faint: boolean } {
  if (value === undefined || value === '' || value === null) return { text: placeholder, faint: true };
  if (kind === 'money') return { text: rupees(Number(value)), faint: false };
  if (kind === 'date') return { text: shortDate(`${String(value).slice(0, 10)}T10:00:00`), faint: false };
  return { text: String(value), faint: false };
}

function toTyped(value: Value, kind: RowKind): string {
  if (value === undefined || value === null || value === '') return '';
  if (kind === 'money') return String(Math.round(Number(value) / 100));
  if (kind === 'date') return isoToTyped(String(value));
  return String(value);
}

type ValueProps = {
  value: Value;
  kind?: RowKind;
  placeholder?: string;
  onChange?: (next: Value) => void;
  /** A tap opens something else (a picker) instead of the inline editor. */
  onPress?: () => void;
  editable?: boolean;
  align?: 'left' | 'right';
  small?: boolean;
  /** Text shown instead of the raw value, e.g. "Qty 2". */
  render?: (shown: string) => string;
  lines?: number;
};

/** A value the owner can tap and retype. The heart of the review cards. */
export function EditValue({ value, kind = 'text', placeholder = 'Not read', onChange, onPress, editable = true, align = 'left', small, render, lines = 1 }: ValueProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const can = editable && (!!onChange || !!onPress);

  const commit = () => {
    const raw = text.trim();
    if (!raw) {
      onChange?.(undefined);
      setEditing(false);
      return;
    }
    if (kind === 'money') {
      const p = rupeesToPaise(raw);
      if (p === undefined) return setBad(true);
      onChange?.(p);
    } else if (kind === 'date') {
      const iso = typedToIso(raw);
      if (!iso) return setBad(true);
      onChange?.(iso);
    } else if (kind === 'number') {
      const n = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(n)) return setBad(true);
      onChange?.(n);
    } else {
      onChange?.(raw);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setBad(false);
        }}
        onSubmitEditing={commit}
        onBlur={commit}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        keyboardType={kind === 'money' || kind === 'number' ? 'numeric' : kind === 'date' ? 'numbers-and-punctuation' : 'default'}
        placeholder={kind === 'date' ? 'dd-mm-yyyy' : kind === 'money' ? 'rupees' : ''}
        placeholderTextColor={colors.muted}
        style={{
          flex: 1,
          minWidth: 60,
          fontFamily: font.semibold,
          fontSize: small ? type.caption : type.secondary,
          color: colors.ink,
          paddingVertical: 2,
          paddingHorizontal: 7,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: bad ? colors.red : colors.forest,
          backgroundColor: colors.surface,
          textAlign: align,
        }}
      />
    );
  }

  const shown = display(value, kind, placeholder);
  const label = render ? render(shown.text) : shown.text;

  return (
    <Pressable
      accessibilityRole={can ? 'button' : undefined}
      accessibilityLabel={can ? `${label}. Tap to change` : label}
      disabled={!can}
      onPress={() => {
        if (onPress) return onPress();
        setText(toTyped(value, kind));
        setBad(false);
        setEditing(true);
      }}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 4,
        opacity: pressed ? 0.55 : 1,
      })}>
      <Txt
        v={small ? 'caption' : 'secondary'}
        w={small ? 'medium' : 'semibold'}
        num
        color={shown.faint ? colors.muted : colors.ink}
        numberOfLines={lines}
        style={{ flexShrink: 1, textAlign: align }}>
        {label}
      </Txt>
      {can ? <Ionicons name={onPress ? 'chevron-forward' : 'create-outline'} size={small ? 11 : 13} color={colors.muted} /> : null}
    </Pressable>
  );
}

type RowProps = ValueProps & { label: string; dot?: string; caption?: string; labelWidth?: number };

/** A labelled field of a bill: dot, short label, and the value the owner can correct. */
export function EditRow({ label, dot, caption, labelWidth = 58, ...rest }: RowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 9 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot ?? colors.border, marginTop: 7 }} />
      <Txt v="secondary" color={colors.muted} style={{ width: labelWidth, paddingTop: 1 }} numberOfLines={1}>
        {label}
      </Txt>
      <View style={{ flex: 1, gap: 1 }}>
        <EditValue {...rest} />
        {caption ? (
          <Txt v="caption" color={colors.muted} numberOfLines={2}>
            {caption}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

type ItemProps = {
  index: number;
  name?: string;
  qty?: number;
  amountPaise?: number;
  ratePaise?: number;
  /** Pack, HSN, batch, expiry, MRP: what the bill printed about this line. */
  detail?: string;
  editable?: boolean;
  onName?: (v: Value) => void;
  onQty?: (v: Value) => void;
  onAmount?: (v: Value) => void;
};

/**
 * One line of a bill, compact enough for a chat bubble: the name and the
 * amount share a line, the quantity sits under it. Each one is tappable.
 */
export function ItemRow({ index, name, qty, amountPaise, ratePaise, detail, editable = true, onName, onQty, onAmount }: ItemProps) {
  return (
    <View style={{ paddingHorizontal: space.md, paddingVertical: 7, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt v="caption" color={colors.muted} style={{ width: 16 }} num>
          {index + 1}.
        </Txt>
        <View style={{ flex: 1 }}>
          <EditValue value={name} placeholder="Item" onChange={onName} editable={editable} lines={2} />
        </View>
        <View style={{ width: 96 }}>
          <EditValue value={amountPaise || undefined} kind="money" placeholder="—" align="right" onChange={onAmount} editable={editable} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 22 }}>
        <View style={{ maxWidth: 130 }}>
          <EditValue value={qty} kind="number" placeholder="Qty" small onChange={onQty} editable={editable} render={(t) => (t === 'Qty' ? 'Qty' : `Qty ${t}`)} />
        </View>
        {ratePaise ? (
          <Txt v="caption" color={colors.muted} num style={{ marginLeft: 8 }}>
            × {rupees(ratePaise)}
          </Txt>
        ) : null}
      </View>
      {detail ? (
        <Txt v="caption" color={colors.muted} num numberOfLines={2} style={{ paddingLeft: 22 }}>
          {detail}
        </Txt>
      ) : null}
    </View>
  );
}
