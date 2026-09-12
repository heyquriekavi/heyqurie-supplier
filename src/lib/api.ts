/**
 * The one place the screens get data from. Today every function answers
 * from the phone-side state seeded by mock.ts. When /api/v1 lands, each
 * function becomes a fetch to the route named beside it and the screens
 * stay the same.
 */
import * as mock from './mock';
import * as server from './server';
import { rupees } from './format';
import { normalize, useAppState } from './appState';
import { statusOf } from './status';
import type { Attachment, BillStatus, Confidence, DraftFields, Ledger, Message, Period, Person, PersonKind, PersonSummary, Shop, Summary, Txn } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = () => useAppState.getState();

// GET /api/v1/shops/me
export function getShop(): Shop {
  return mock.shop;
}

/** Start of the period, as an ISO date, for the "at a glance" tiles. */
function periodStart(period: Period): string {
  const d = new Date();
  if (period === 'today') return todayIso();
  if (period === 'week') d.setDate(d.getDate() - 7);
  else d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/v1/home + GET /api/v1/sales/summary?range=
/** salesInPaise: invoices billed to shops in the period. billsOutPaise: what shops still owe, all time. change: overdue part of that. */
export function getSummary(period: Period): Summary {
  const since = periodStart(period);
  const shops = state().people.filter((p) => p.kind === 'customer');
  const billed = state().txns.filter((t) => t.kind === 'bill' && t.date.slice(0, 10) >= since && shops.some((p) => p.id === t.personId)).reduce((s, t) => s + t.amountPaise, 0);
  let toCollect = 0;
  let overdue = 0;
  for (const p of shops) {
    const ps = personSummary(p.id);
    toCollect += ps.duePaise + ps.upcomingPaise;
    overdue += ps.duePaise;
  }
  return { salesInPaise: billed, billsOutPaise: toCollect, change: overdue };
}

export function getItems() {
  return state().items;
}

// ---- server rows -> app rows ----

export function personFromServer(p: server.ServerPerson): Person {
  return { id: p.id, kind: p.kind, name: p.name, phone: p.phone ?? '', gstin: p.gstin ?? undefined, creditDays: p.credit_days, paired: p.paired, beat: p.beat ?? undefined };
}

export function txnsFromServer(bills: server.ServerBill[]): Txn[] {
  const out: Txn[] = [];
  for (const b of bills) {
    const personId = b.customer_id ?? b.supplier_id ?? '';
    const who = b.kind === 'sale' ? b.buyer_name : b.seller_name;
    out.push({
      id: b.id,
      personId,
      date: b.bill_date.length > 10 ? b.bill_date : `${b.bill_date}T10:00:00+05:30`,
      kind: 'bill',
      number: b.number ?? undefined,
      description: [b.items.length ? `${b.items.length} ${b.items.length === 1 ? 'item' : 'items'}` : null, b.order_number ? `order ${b.order_number}` : null, !b.items.length && who ? who : null].filter(Boolean).join(' · ') || (b.kind === 'sale' ? 'Invoice' : 'Bill'),
      amountPaise: b.total_paise,
      status: b.payment_status === 'paid' ? 'paid' : 'outstanding',
      dueDate: b.due_date ?? undefined,
      paidPaise: b.paid_paise,
      hasImage: b.has_image,
      itemCount: b.items.length,
    });
    for (const p of b.payments) {
      out.push({
        id: p.id,
        personId,
        date: p.paid_on.length > 10 ? p.paid_on : `${p.paid_on}T12:00:00+05:30`,
        kind: 'payment',
        description: b.kind === 'sale' ? 'Collection' : 'Payment',
        amountPaise: p.amount_paise,
        status: 'paid',
        mode: (p.mode as Txn['mode']) ?? undefined,
        reference: p.reference ?? undefined,
      });
    }
  }
  return out;
}

/** Everything the screens need, from the server: shops, brands, bills with their payments. */
export async function loadLedger(): Promise<{ people: Person[]; txns: Txn[] }> {
  const [shops, brands, bills] = await Promise.all([server.listPeople('customer'), server.listPeople('supplier'), server.listBills()]);
  return { people: [...shops.map(personFromServer), ...brands.map(personFromServer)], txns: txnsFromServer(bills) };
}

// GET /api/v1/suppliers · GET /api/v1/customers
export function getPeople(kind: PersonKind): Person[] {
  return state().people.filter((p) => p.kind === kind);
}

export function getPerson(id: string): Person | undefined {
  return state().people.find((p) => p.id === id);
}

/** Today at midnight, so "due today" counts as due. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The three colours: red when due, green when confirmed and not yet due, blue when paid. */
export function billStatus(txn: Txn): BillStatus {
  if (txn.kind === 'payment') return 'paid';
  const s = statusOf({ totalPaise: txn.amountPaise, paidPaise: txn.paidPaise ?? (txn.status === 'paid' ? txn.amountPaise : 0), dueDate: txn.dueDate });
  return s === 'settled' ? 'paid' : s;
}

export function personSummary(personId: string): PersonSummary {
  const bills = state().txns.filter((t) => t.personId === personId && t.kind === 'bill');
  let duePaise = 0;
  let upcomingPaise = 0;
  let lastBillDate: string | undefined;
  for (const b of bills) {
    const s = billStatus(b);
    const left = Math.max(b.amountPaise - (b.paidPaise ?? 0), 0);
    if (s === 'due') duePaise += left;
    if (s === 'confirmed') upcomingPaise += left;
    if (!lastBillDate || b.date > lastBillDate) lastBillDate = b.date;
  }
  return { duePaise, upcomingPaise, billCount: bills.length, lastBillDate };
}

/** Sum of bills still outstanding for one person, due or not. */
export function dueFor(personId: string): number {
  const s = personSummary(personId);
  return s.duePaise + s.upcomingPaise;
}

// GET /api/v1/suppliers/{id}/ledger · GET /api/v1/customers/{id}/ledger
export function getLedger(id: string): Ledger | undefined {
  const person = getPerson(id);
  if (!person) return undefined;
  const txns = state()
    .txns.filter((t) => t.personId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalPaise = txns.filter((t) => t.kind === 'bill').reduce((s, t) => s + t.amountPaise, 0);
  const paidPaise = txns.filter((t) => t.kind === 'payment').reduce((s, t) => s + t.amountPaise, 0);
  return { person, txns, totalPaise, paidPaise, outstandingPaise: totalPaise - paidPaise };
}

// GET /api/v1/ask history (conversations, messages)
export function getMessages(): Message[] {
  return mock.seedMessages;
}

let seq = 100;
export const nextId = () => `m${seq++}`;

/**
 * POST /api/v1/bills/read. Stand-in for the reader: two sample bills, one
 * printed with a GSTIN that matches a supplier, one handwritten with gaps.
 * The real reader returns the same shape: fields plus a confidence each.
 */
type ReadReply = {
  fields: {
    supplier_name: string | null; gstin: string | null; gstin_valid: boolean; phone: string | null; number: string | null; date: string | null;
    due_date: string | null; subtotal_paise: number | null; tax_paise: number | null; total_paise: number | null;
    buyer_name: string | null; buyer_gstin: string | null;
    seller_licence: string | null; buyer_licence: string | null; salesman: string | null;
    order_number: string | null; terms: string | null;
    discount_paise: number | null; cgst_paise: number | null; sgst_paise: number | null;
    igst_paise: number | null; cess_paise: number | null; round_off_paise: number | null;
    items: {
      description: string | null; qty: number | null; rate_paise: number | null; amount_paise: number | null;
      pack: string | null; hsn: string | null; batch: string | null; expiry: string | null;
      free_qty: number | null; mrp_paise: number | null; discount_pct: number | null; gst_pct: number | null;
    }[];
  };
  confidence: { supplier: number; gstin: number; number: number; date: number; total: number; tax?: number };
  warnings: string[];
};

export async function readBill(source: 'printed' | 'handwritten', attachment?: Attachment): Promise<{ fields: DraftFields; confidence: Confidence }> {
  if (attachment?.file || attachment?.uri) {
    const or = await import('./openrouter');
    return or.hasKey() ? readBillWithOpenRouter(attachment) : readBillOnServer(source, attachment);
  }
  await wait(900);
  if (source === 'printed') {
    const gstin = '33AAACR5055K1ZX';
    const match = state().people.find((p) => p.kind === 'supplier' && p.gstin === gstin);
    const date = todayIso();
    return {
      fields: {
        gstin,
        supplierId: match?.id,
        supplierName: match?.name ?? 'Rajesh Electronics',
        matchedBy: match ? 'gstin' : undefined,
        number: 'RJ-1092',
        date,
        dueDate: addDays(date, match?.creditDays ?? 21),
        totalPaise: 2456000,
      },
      confidence: { supplier: 0.98, number: 0.95, date: 0.93, total: 0.97 },
    };
  }
  return {
    fields: { totalPaise: 485000 },
    confidence: { supplier: 0, number: 0, date: 0.3, total: 0.72 },
  };
}

const BILL_PROMPT = `You read Indian supplier bills and GST invoices from a photo or PDF page. Return ONLY a JSON object:
{"supplier_name": string|null, "gstin": string|null, "phone": string|null, "seller_licence": string|null,
 "buyer_name": string|null, "buyer_gstin": string|null, "buyer_licence": string|null,
 "number": string|null, "date": "YYYY-MM-DD"|null, "due_date": "YYYY-MM-DD"|null,
 "salesman": string|null, "order_number": string|null, "terms": string|null,
 "subtotal": number|null, "discount": number|null,
 "cgst": number|null, "sgst": number|null, "igst": number|null, "cess": number|null,
 "tax": number|null, "round_off": number|null, "total": number|null,
 "items": [{"description": string, "pack": string|null, "hsn": string|null, "batch": string|null,
            "expiry": "YYYY-MM"|null, "qty": number|null, "free_qty": number|null, "mrp": number|null,
            "rate": number|null, "discount_pct": number|null, "gst_pct": number|null, "amount": number|null}],
 "confidence": {"supplier": 0-1, "number": 0-1, "date": 0-1, "total": 0-1, "tax": 0-1}}
Amounts are in rupees. supplier_name and gstin belong to the SELLER who raised the bill. buyer_name and buyer_gstin belong to the party billed to, often printed after "M/s", "Billed to" or "To". A GSTIN is 15 characters.
Tax: a bill shows either CGST and SGST together (same state) or IGST alone (interstate), never both. Put each half in its own field and their sum in "tax". If only a single total tax is printed, fill "tax" and leave the halves null.
"subtotal" is the taxable value before tax. "round_off" is negative if it was subtracted.
Per line, read every column the bill prints: pack size, HSN or SAC code, batch number, expiry (as YYYY-MM), MRP, free quantity, discount percent and GST percent.
Use null when a field is not on the bill; never guess. Confidence is how sure you are per field.`;

type OrBillItem = { description: string; pack: string | null; hsn: string | null; batch: string | null; expiry: string | null; qty: number | null; free_qty: number | null; mrp: number | null; rate: number | null; discount_pct: number | null; gst_pct: number | null; amount: number | null };
type OrBill = { supplier_name: string | null; gstin: string | null; phone: string | null; seller_licence: string | null; buyer_name: string | null; buyer_gstin: string | null; buyer_licence: string | null; number: string | null; date: string | null; due_date: string | null; salesman: string | null; order_number: string | null; terms: string | null; subtotal: number | null; discount: number | null; cgst: number | null; sgst: number | null; igst: number | null; cess: number | null; tax: number | null; round_off: number | null; total: number | null; items: OrBillItem[]; confidence: { supplier: number; number: number; date: number; total: number; tax?: number } };

const paise = (r: number | null | undefined) => (typeof r === 'number' && Number.isFinite(r) ? Math.round(r * 100) : undefined);

/** When only the halves are printed, their sum is the tax. */
function taxFromParts(r: { cgst: number | null; sgst: number | null; igst: number | null; cess: number | null }): number | undefined {
  const sum = [r.cgst, r.sgst, r.igst, r.cess].reduce<number>((n, v) => n + (paise(v) ?? 0), 0);
  return sum > 0 ? sum : undefined;
}

/** Local testing: the photo goes straight to OpenRouter's vision model; the brand is matched here by GSTIN, then name. */
async function readBillWithOpenRouter(attachment: Attachment): Promise<{ fields: DraftFields; confidence: Confidence }> {
  const or = await import('./openrouter');
  const url = await or.toDataUrl(attachment);
  const r = await or.complete<OrBill>(
    [
      { role: 'system', content: BILL_PROMPT },
      { role: 'user', content: [{ type: 'text', text: 'Read this bill.' }, { type: 'image_url', image_url: { url } }] },
    ],
    // 12 fields a line adds up: a 40-line wholesale bill needs several thousand
    // tokens of JSON. 1200 truncated a 7-line bill mid-string.
    { json: true, maxTokens: 6000 },
  );
  const people = state().people.filter((p) => p.kind === 'supplier');
  const gstin = r.gstin?.replace(/\s/g, '').toUpperCase() ?? null;
  const byGstin = gstin && gstin.length === 15 ? people.find((p) => p.gstin === gstin) : undefined;
  const byName = !byGstin && r.supplier_name ? people.find((p) => normalize(p.name) === normalize(r.supplier_name!)) : undefined;
  const match = byGstin ?? byName;
  const c = r.confidence ?? { supplier: 0.5, number: 0.5, date: 0.5, total: 0.5 };
  return {
    fields: {
      gstin: gstin ?? undefined,
      phone: r.phone ?? undefined,
      buyerName: r.buyer_name ?? undefined,
      buyerGstin: r.buyer_gstin?.replace(/\s/g, '').toUpperCase() ?? undefined,
      supplierId: match?.id,
      supplierName: match?.name ?? r.supplier_name ?? undefined,
      matchedBy: byGstin ? 'gstin' : byName ? 'name' : undefined,
      number: r.number ?? undefined,
      date: r.date ?? undefined,
      dueDate: r.due_date ?? undefined,
      totalPaise: paise(r.total),
      subtotalPaise: paise(r.subtotal),
      discountPaise: paise(r.discount),
      cgstPaise: paise(r.cgst),
      sgstPaise: paise(r.sgst),
      igstPaise: paise(r.igst),
      cessPaise: paise(r.cess),
      // Either the halves or a single total is printed; reconcile the same way the server does.
      taxPaise: paise(r.tax) ?? taxFromParts(r),
      roundOffPaise: paise(r.round_off),
      sellerLicence: r.seller_licence ?? undefined,
      buyerLicence: r.buyer_licence ?? undefined,
      salesman: r.salesman ?? undefined,
      orderNumber: r.order_number ?? undefined,
      terms: r.terms ?? undefined,
      items: (r.items ?? []).map((i) => ({
        description: i.description ?? undefined, qty: i.qty ?? undefined,
        ratePaise: paise(i.rate), amountPaise: paise(i.amount),
        pack: i.pack ?? undefined, hsn: i.hsn ?? undefined, batch: i.batch ?? undefined,
        expiry: i.expiry ?? undefined, freeQty: i.free_qty ?? undefined,
        mrpPaise: paise(i.mrp), discountPct: i.discount_pct ?? undefined, gstPct: i.gst_pct ?? undefined,
      })),
    },
    confidence: { supplier: match ? Math.max(c.supplier, 0.9) : c.supplier, number: c.number, date: c.date, total: c.total, tax: c.tax },
  };
}

/** POST /api/v1/bills/read: Sarvam reads it, the server validates, we match the supplier here. */
async function readBillOnServer(source: 'printed' | 'handwritten', attachment: Attachment): Promise<{ fields: DraftFields; confidence: Confidence }> {
  const { upload } = await import('./http');
  const form = new FormData();
  if (attachment.file) form.append('file', attachment.file as Blob, attachment.name ?? 'bill.jpg');
  else form.append('file', { uri: attachment.uri, name: attachment.name ?? 'bill.jpg', type: attachment.mime ?? 'image/jpeg' } as unknown as Blob);
  form.append('source', source);
  const r = await upload<ReadReply>('/api/v1/bills/read', form);
  const f = r.fields;
  const people = state().people.filter((p) => p.kind === 'supplier');
  const byGstin = f.gstin && f.gstin_valid ? people.find((p) => p.gstin === f.gstin) : undefined;
  const byName = !byGstin && f.supplier_name ? people.find((p) => normalize(p.name) === normalize(f.supplier_name!)) : undefined;
  const match = byGstin ?? byName;
  const date = f.date ?? undefined;
  return {
    fields: {
      gstin: f.gstin ?? undefined,
      phone: f.phone ?? undefined,
      supplierId: match?.id,
      supplierName: match?.name ?? f.supplier_name ?? undefined,
      matchedBy: byGstin ? 'gstin' : byName ? 'name' : undefined,
      number: f.number ?? undefined,
      date,
      dueDate: f.due_date ?? undefined, // only what is printed on the bill; never a guess
      totalPaise: f.total_paise ?? undefined,
      subtotalPaise: f.subtotal_paise ?? undefined,
      discountPaise: f.discount_paise ?? undefined,
      cgstPaise: f.cgst_paise ?? undefined,
      sgstPaise: f.sgst_paise ?? undefined,
      igstPaise: f.igst_paise ?? undefined,
      cessPaise: f.cess_paise ?? undefined,
      taxPaise: f.tax_paise ?? undefined,
      roundOffPaise: f.round_off_paise ?? undefined,
      buyerName: f.buyer_name ?? undefined,
      buyerGstin: f.buyer_gstin ?? undefined,
      sellerLicence: f.seller_licence ?? undefined,
      buyerLicence: f.buyer_licence ?? undefined,
      salesman: f.salesman ?? undefined,
      orderNumber: f.order_number ?? undefined,
      terms: f.terms ?? undefined,
      items: f.items.map((i) => ({
        description: i.description ?? undefined, qty: i.qty ?? undefined,
        ratePaise: i.rate_paise ?? undefined, amountPaise: i.amount_paise ?? undefined,
        pack: i.pack ?? undefined, hsn: i.hsn ?? undefined, batch: i.batch ?? undefined,
        expiry: i.expiry ?? undefined, freeQty: i.free_qty ?? undefined,
        mrpPaise: i.mrp_paise ?? undefined, discountPct: i.discount_pct ?? undefined,
        gstPct: i.gst_pct ?? undefined,
      })),
      warnings: r.warnings,
    },
    confidence: { supplier: match ? Math.max(r.confidence.supplier, 0.9) : r.confidence.supplier, number: r.confidence.number, date: r.confidence.date, total: r.confidence.total, tax: r.confidence.tax },
  };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * POST /api/v1/ask. The server decides whether the question is about this
 * business, is general trade knowledge, or is out of scope, then answers the
 * first kind from the database. The phone sends the question, not the facts.
 */
export async function ask(text: string): Promise<Message[]> {
  const at = new Date().toISOString();
  const say = (t: string, card?: Message['card']): Message => ({ id: nextId(), role: 'qurie', at, text: t, card });
  const s = state();
  const history = s.messages.filter((m) => m.text).slice(-8).map((m) => ({ role: m.role, text: m.text }));
  let r: { answer: string; person_id?: string | null; scope?: string };
  try {
    const { request } = await import('./http');
    r = await request('/api/v1/ask', { method: 'POST', body: { text, history } });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return [say(err?.status === 0 ? 'No internet right now. Try again.' : `I could not answer that. ${err?.message ?? ''}`.trim())];
  }
  const person = r.person_id ? s.people.find((p) => p.id === r.person_id) : undefined;
  if (!person || r.scope !== 'data') return [say(r.answer)];
  const due = dueFor(person.id);
  return [say(r.answer, due > 0 ? { kind: 'outstanding', personId: person.id, amountPaise: due } : { kind: 'contact', personId: person.id })];
}
