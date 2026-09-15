/**
 * PHONE-SIDE STATE ONLY. No server, no database.
 *
 * The distributor's in-memory notebook: shops and brands, invoices and
 * collections, the chat, and whatever Qurie is in the middle of doing:
 * an order being taken, a collection being recorded, a brand bill being
 * confirmed. Seeded from mock.ts. api.ts is the seam to the server.
 *
 * Every action is spoken or typed to Qurie, shown as a card, and done
 * only after the owner confirms. Nothing happens silently.
 */
import { create } from 'zustand';

import * as mock from './mock';
import { orderTotal, parseCollection, parseOrder } from './orders';
import * as server from './server';
import type { PayMode } from './types';
import * as chat from './chatStore';
import type { Lang } from './strings';
import type { Attachment, Collection, Draft, DraftFields, InvoiceDraft, InvoiceLine, Item, Message, Order, OrderLine, Period, Person, Txn } from './types';

type State = {
  people: Person[];
  items: Item[];
  txns: Txn[];
  messages: Message[];
  drafts: Record<string, Draft>;
  orders: Record<string, Order>;
  collections: Record<string, Collection>;
  invoices: Record<string, InvoiceDraft>;
  activeDraftId?: string;
  activeOrderId?: string;
  activeCollectionId?: string;
  activeInvoiceId?: string;
  pendingAction?: 'newShop';
  sending: boolean;
  period: Period;
  voiceOn: boolean;
  language: Lang;
  voiceOpen: boolean;
  addSheetOpen: boolean;

  /** Pull shops, brands, bills and payments from the server. Called after login and after every write. */
  refresh: () => Promise<void>;
  loaded: boolean;
  /** Read the chat back from the device, then catch up with the server. */
  hydrateChat: (shopId: string | null) => Promise<void>;
  chatReady: boolean;
  clearChat: () => Promise<void>;
  setVoiceOpen: (open: boolean) => void;
  addMessages: (msgs: Message[]) => void;
  setPeriod: (p: Period) => void;
  toggleVoice: () => void;
  setLanguage: (l: Lang) => void;
  setAddSheetOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;

  /** Order: "Balaji ka order: 20 Havells fan, 5 box wire". */
  startOrder: (shopId?: string, itemsText?: string) => void;
  chooseShop: (target: { orderId?: string; collectionId?: string; invoiceId?: string }, personId: string | 'new') => void;
  confirmOrder: (orderId: string) => void;
  /** Fix one line in place. Everything on the card is correctable before it is sent. */
  editOrderLine: (orderId: string, index: number, patch: Partial<OrderLine>) => void;
  removeOrderLine: (orderId: string, index: number) => void;
  addOrderLine: (orderId: string) => void;
  changeOrderShop: (orderId: string) => void;
  /** Wipes the lines and asks for the whole order again. The last resort, not the first. */
  editOrder: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;

  /** Collection: "Balaji ne 13,838 UPI diye". */
  startCollection: (shopId?: string) => void;
  /** Put the card up. Nothing is posted until confirmCollection. */
  proposeCollection: (collectionId: string, amountPaise: number, mode: PayMode) => void;
  editCollection: (collectionId: string, patch: Partial<Collection>) => void;
  confirmCollection: (collectionId: string) => Promise<void>;
  changeCollectionShop: (collectionId: string) => void;
  cancelCollection: (collectionId: string) => void;

  /** The invoice Marg or Tally made for a sent order, coming back as a PDF or photo. */
  matchInvoice: (attachment?: Attachment) => Promise<void>;

  /** A brand's bill, read by the reader and confirmed like the shop app does. */
  startBill: (source: 'printed' | 'handwritten', attachment?: Attachment) => Promise<void>;
  shareContact: (personId: string) => void;
  askNewShop: () => void;
  chooseSupplier: (draftId: string, personId: string | 'new') => void;
  chooseDate: (draftId: string, iso: string) => void;
  changeSupplier: (draftId: string) => void;
  confirmDraft: (draftId: string) => void;
  /** Correct a field Qurie read wrong, before anything is saved. */
  editDraft: (draftId: string, patch: Partial<DraftFields>) => void;
  editDraftItem: (draftId: string, index: number, patch: { description?: string; qty?: number; ratePaise?: number; amountPaise?: number }) => void;
  editInvoice: (invoiceId: string, patch: Partial<InvoiceDraft>) => void;
  editInvoiceItem: (invoiceId: string, index: number, patch: Partial<InvoiceLine>) => void;
  confirmInvoice: (invoiceId: string) => void;
  changeInvoiceShop: (invoiceId: string) => void;
  cancelInvoice: (invoiceId: string) => void;
  cancelDraft: (draftId: string) => void;
};

let seq = 1;
let orderSeq = 1043;
const id = (prefix: string) => `${prefix}${seq++}`;
const now = () => new Date().toISOString();
const qurie = (text: string, card?: Message['card']): Message => ({ id: id('q'), role: 'qurie', at: now(), text, card });
const owner = (text: string, attachment?: Attachment): Message => ({ id: id('u'), role: 'user', at: now(), text, attachment });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(traders|and|agency|agencies|co|company|ltd|pvt|electricals?|electronics|stores?|hardware)\b/g, '').replace(/\s+/g, ' ').trim();
const rupeesText = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** First word of a shop's name spoken anywhere in the text, e.g. "balaji" in "Balaji ka order". */
function findShop(text: string, people: Person[]): Person | undefined {
  const t = text.toLowerCase();
  return people.filter((p) => p.kind === 'customer').find((p) => {
    const first = p.name.split(' ')[0].toLowerCase();
    return first.length >= 3 && t.includes(first);
  });
}

export const useAppState = create<State>((set, get) => {
  const push = (...m: Message[]) => {
    set({ messages: [...get().messages, ...m] });
    persist();
  };

  // --- keeping the conversation -------------------------------------------
  // Written to the device after a quiet moment rather than on every keystroke,
  // and pushed to the server in the same beat. A failed push is not an error the
  // owner should see: the device copy is already safe and the ids are idempotent,
  // so the next push sends it again.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pushing = false;

  const snapshot = (): chat.Snapshot => {
    const st = get();
    return {
      v: 1,
      shopId: currentShopId,
      messages: st.messages,
      orders: st.orders,
      invoices: st.invoices,
      collections: st.collections,
      drafts: st.drafts,
      synced: [...syncedIds],
    };
  };

  const syncedIds = new Set<string>();
  // Whose chat is on this device. Guards against showing one shop's history to
  // another account signed in on the same phone.
  let currentShopId: string | null = null;

  const pushToServer = async () => {
    if (pushing) return;
    const pending = get().messages.filter((m) => !syncedIds.has(m.id) && (m.text || m.card));
    if (!pending.length) return;
    pushing = true;
    try {
      const batch = pending.slice(-200).map((m) => ({
        id: m.id, role: m.role, at: m.at, text: m.text ?? null,
        card: (m.card ?? null) as unknown, attachment: (m.attachment ?? null) as unknown,
      }));
      await server.putChat(batch);
      for (const m of batch) syncedIds.add(m.id);
    } catch {
      // Offline, or not signed in yet. The device copy stands; try again later.
    } finally {
      pushing = false;
    }
  };

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chat.saveLocal(snapshot());
      pushToServer();
    }, 600);
  };
  const patchDraft = (draftId: string, patch: Partial<Draft>, fields?: Partial<DraftFields>) => {
    const d = get().drafts[draftId];
    if (!d) return;
    set({ drafts: { ...get().drafts, [draftId]: { ...d, ...patch, fields: { ...d.fields, ...fields } } } });
    persist();
  };
  /** "incl. 445.10 tax (CGST 222.55 + SGST 222.55)" - what the bill charged, said out loud. */
  const taxLine = (m: {
    subtotalPaise?: number; discountPaise?: number; taxPaise?: number;
    cgstPaise?: number; sgstPaise?: number; igstPaise?: number; cessPaise?: number;
  }): string => {
    const parts = [
      m.cgstPaise ? `CGST ${rupeesText(m.cgstPaise)}` : null,
      m.sgstPaise ? `SGST ${rupeesText(m.sgstPaise)}` : null,
      m.igstPaise ? `IGST ${rupeesText(m.igstPaise)}` : null,
      m.cessPaise ? `cess ${rupeesText(m.cessPaise)}` : null,
    ].filter((x): x is string => !!x);
    const total = m.taxPaise ?? (m.cgstPaise ?? 0) + (m.sgstPaise ?? 0) + (m.igstPaise ?? 0) + (m.cessPaise ?? 0);
    if (!total) return '';
    // One component, so name it: "+ 445.10 IGST" says interstate, which "tax" does not.
    const only = parts.length === 1 ? parts[0].split(' ')[0] : 'tax';
    const head = m.subtotalPaise ? `${rupeesText(m.subtotalPaise)} + ${rupeesText(total)} ${only}` : `incl. ${rupeesText(total)} ${only}`;
    const detail = parts.length > 1 ? ` (${parts.join(' + ')})` : '';
    const off = m.discountPaise ? `, ${rupeesText(m.discountPaise)} off` : '';
    return `${head}${detail}${off}`;
  };

  const patchOrder = (orderId: string, patch: Partial<Order>) => {
    const o = get().orders[orderId];
    if (!o) return;
    set({ orders: { ...get().orders, [orderId]: { ...o, ...patch } } });
    persist();
  };
  const patchInvoice = (iid: string, patch: Partial<InvoiceDraft>) => {
    const d = get().invoices[iid];
    if (!d) return;
    set({ invoices: { ...get().invoices, [iid]: { ...d, ...patch } } });
    persist();
  };
  const patchCollection = (cid: string, patch: Partial<Collection>) => {
    const c = get().collections[cid];
    if (!c) return;
    set({ collections: { ...get().collections, [cid]: { ...c, ...patch } } });
    persist();
  };
  const shopName = (shopId?: string) => get().people.find((p) => p.id === shopId)?.name ?? 'the shop';

  /** Move an order to the next thing Qurie needs. */
  const advanceOrder = (orderId: string) => {
    const o = get().orders[orderId];
    if (!o) return;
    if (!o.shopId) {
      patchOrder(orderId, { stage: 'shop' });
      push(qurie('Which shop is this order for?', { kind: 'choose-shop', orderId }));
    } else if (!o.lines.length) {
      patchOrder(orderId, { stage: 'items' });
      push(qurie(`Tell me the order for ${shopName(o.shopId)}. For example: "20 Havells fan, 5 box Finolex wire, 10 MCB".`));
    } else {
      patchOrder(orderId, { stage: 'confirm' });
      const unknown = o.lines.filter((l) => !l.itemId).length;
      push(qurie(unknown ? `${unknown} ${unknown === 1 ? 'item is' : 'items are'} not in your list, so billing will set the rate. Is this right?` : 'Is this right?', { kind: 'order', orderId }));
    }
  };

  /** Move a brand-bill draft to the next thing Qurie needs (same as the shop app). */
  const advanceDraft = (draftId: string) => {
    const d = get().drafts[draftId];
    if (!d) return;
    const f = d.fields;
    if (!f.supplierId) {
      patchDraft(draftId, { stage: 'supplier' });
      push(qurie('Which brand is this bill from? Pick from your list.', { kind: 'choose-supplier', draftId }));
    } else if (!f.date) {
      patchDraft(draftId, { stage: 'date' });
      push(qurie('What date is on the bill?', { kind: 'choose-date', draftId }));
    } else if (!f.totalPaise) {
      patchDraft(draftId, { stage: 'amount' });
      push(qurie('What is the total? Type the amount.'));
    } else {
      patchDraft(draftId, { stage: 'confirm' });
      const t = taxLine(f);
      const n = f.items?.length ?? 0;
      push(qurie(
        `${f.supplierName ?? 'This brand'}, ${rupeesText(f.totalPaise)}${t ? ` (${t})` : ''}${n ? `, ${n} ${n === 1 ? 'item' : 'items'}` : ''}. Is this right?`,
        { kind: 'extraction', draftId },
      ));
    }
  };

  const addShop = async (name: string): Promise<Person> => {
    const { personFromServer } = await import('./api');
    try {
      const person = personFromServer(await server.createPerson({ kind: 'customer', name }));
      if (!get().people.some((p) => p.id === person.id)) set({ people: [...get().people, person] });
      return person;
    } catch {
      const person: Person = { id: id('p'), kind: 'customer', name, phone: '', creditDays: 21 };
      set({ people: [...get().people, person] });
      push(qurie('Could not reach the server, so this shop is only on your phone for now.'));
      return person;
    }
  };

  const addBrand = async (name: string, extra: { phone?: string; gstin?: string } = {}): Promise<Person> => {
    const { personFromServer } = await import('./api');
    try {
      const person = personFromServer(await server.createPerson({ kind: 'supplier', name, phone: extra.phone, gstin: extra.gstin }));
      if (!get().people.some((p) => p.id === person.id)) set({ people: [...get().people, person] });
      return person;
    } catch {
      const person: Person = { id: id('p'), kind: 'supplier', name, phone: extra.phone ?? '', gstin: extra.gstin, creditDays: 30 };
      set({ people: [...get().people, person] });
      return person;
    }
  };

  /** Write an invoice to the server as a sale against one shop, with its soft copy. */
  const fileInvoice = async (invoiceId: string) => {
    const draft = get().invoices[invoiceId];
    if (!draft || draft.stage !== 'confirm' || !draft.shopId) return;
    const shopId = draft.shopId;
    const shop = get().people.find((p) => p.id === shopId);
    set({ sending: true, activeInvoiceId: undefined });
    try {
      const bill = await server.createBill({
        kind: 'sale',
        person_id: shopId,
        number: draft.number,
        bill_date: draft.date,
        due_date: addDays(draft.date, shop?.creditDays ?? 21),
        buyer_name: shop?.name ?? null,
        buyer_gstin: shop?.gstin ?? null,
        order_number: draft.orderNumber ?? null,
        total_paise: draft.totalPaise,
        source: draft.attachment ? 'billing-software' : 'sample',
        items: draft.items,
      });
      let photoNote = '';
      if (draft.attachment?.file || draft.attachment?.uri) {
        try {
          await server.uploadBillImage(bill.id, draft.attachment);
          photoNote = ' The soft copy is stored with the bill.';
        } catch {
          photoNote = ' The soft copy did not upload.';
        }
      }
      if (draft.orderId) patchOrder(draft.orderId, { stage: 'billed', invoiceTxnId: bill.id });
      patchInvoice(invoiceId, { stage: 'saved' });
      await get().refresh();
      const matched = draft.orderNumber ? `matched to order ${draft.orderNumber}` : 'filed';
      const where = shop?.paired
        ? `Sent into ${shop.name}'s Qurie app; they need to confirm it.`
        : `${shop?.name} is not on Qurie, so send them the PDF on WhatsApp.`;
      push(qurie(`Invoice ${draft.number} ${matched} under ${shop?.name}: ${rupeesText(draft.totalPaise)}, ${draft.items.length} ${draft.items.length === 1 ? 'item' : 'items'}, due ${bill.due_date}.${draft.mismatch ?? ''} ${where}${photoNote}`,
        { kind: 'outstanding', personId: shopId, amountPaise: draft.totalPaise }));
    } catch (e) {
      set({ activeInvoiceId: invoiceId });
      patchInvoice(invoiceId, { stage: 'confirm' });
      push(qurie(`Could not save the invoice. ${(e as Error)?.message ?? ''}`.trim()));
    } finally {
      set({ sending: false });
    }
  };

  const recordCollection = async (cid: string, amountPaise: number, mode: Txn['mode']) => {
    const c = get().collections[cid];
    if (!c || !c.shopId) return;
    set({ activeCollectionId: undefined, sending: true });
    try {
      const r = await server.createPayment({ person_id: c.shopId, amount_paise: amountPaise, mode: mode ?? 'cash' });
      patchCollection(cid, { stage: 'done', txnId: r.payments[0]?.id });
      await get().refresh();
    } catch (e) {
      push(qurie(`Could not save the collection. ${(e as Error)?.message ?? ''}`.trim()));
      return;
    } finally {
      set({ sending: false });
    }
    const { dueFor } = require('./api') as typeof import('./api');
    const left = dueFor(c.shopId);
    const shop = get().people.find((p) => p.id === c.shopId);
    const where = shop?.paired ? 'it shows in their Qurie app too' : 'a receipt went out on WhatsApp';
    push(qurie(`${rupeesText(amountPaise)} received from ${shop?.name} by ${mode === 'cash' ? 'cash' : mode?.toUpperCase()}, ${where}. ${left > 0 ? `${rupeesText(left)} still to collect.` : 'Nothing left to collect.'}`, left > 0 ? { kind: 'outstanding', personId: c.shopId, amountPaise: left } : { kind: 'contact', personId: c.shopId }));
  };

  return {
    people: [...mock.people],
    items: [...mock.items],
    txns: [...mock.txns],
    messages: mock.seedMessages,
    drafts: {},
    orders: {},
    collections: {},
    invoices: {},
    activeDraftId: undefined,
    activeOrderId: undefined,
    activeCollectionId: undefined,
    activeInvoiceId: undefined,
    pendingAction: undefined,
    sending: false,
    period: 'month',
    voiceOn: false,
    language: 'en',
    voiceOpen: false,
    addSheetOpen: false,
    loaded: false,

    refresh: async () => {
      try {
        const { loadLedger } = await import('./api');
        const { people, txns } = await loadLedger();
        set({ people, txns, loaded: true });
      } catch {
        // not signed in yet, or no network: keep what is on the phone
      }
    },

    setVoiceOpen: (voiceOpen) => set({ voiceOpen }),
    addMessages: (msgs) => push(...msgs),
    setPeriod: (period) => set({ period }),
    toggleVoice: () => set({ voiceOn: !get().voiceOn }),
    setLanguage: (language) => set({ language }),
    setAddSheetOpen: (addSheetOpen) => set({ addSheetOpen }),

    send: async (text) => {
      const clean = text.trim();
      if (!clean || get().sending) return;
      push(owner(clean));
      const s = get();

      // A new shop's name was asked for.
      if (s.pendingAction === 'newShop') {
        set({ pendingAction: undefined });
        const person = await addShop(clean);
        push(qurie(`${person.name} added to your shops. Add a phone and GSTIN from their profile.`, { kind: 'contact', personId: person.id }));
        return;
      }

      // An order is being taken: typed text is the lines, or the new shop's name.
      const order = s.activeOrderId ? s.orders[s.activeOrderId] : undefined;
      if (order && order.stage === 'newShop') {
        const person = await addShop(clean);
        patchOrder(order.id, { shopId: person.id });
        push(qurie(`${person.name} added to your shops.`));
        advanceOrder(order.id);
        return;
      }
      if (order && order.stage === 'items') {
        const lines = parseOrder(clean, s.items);
        if (!lines.length) {
          push(qurie('I could not read those items. Try it like this: "20 Havells fan, 5 box wire".'));
          return;
        }
        patchOrder(order.id, { lines });
        advanceOrder(order.id);
        return;
      }

      // A collection is being recorded: typed text is the amount and mode.
      const coll = s.activeCollectionId ? s.collections[s.activeCollectionId] : undefined;
      if (coll && coll.stage === 'amount') {
        const parsed = parseCollection(clean);
        if (!parsed) {
          push(qurie('I could not read that amount. Try "5000 cash" or "13838 UPI".'));
          return;
        }
        get().proposeCollection(coll.id, parsed.amountPaise, parsed.mode);
        return;
      }

      // A brand bill is being confirmed.
      const draft = s.activeDraftId ? s.drafts[s.activeDraftId] : undefined;
      if (draft && draft.stage === 'newSupplier') {
        const person = await addBrand(clean);
        patchDraft(draft.id, {}, { supplierId: person.id, supplierName: person.name, matchedBy: 'new' });
        push(qurie(`${person.name} added to your brands.`));
        advanceDraft(draft.id);
        return;
      }
      if (draft && draft.stage === 'amount') {
        const digits = clean.replace(/[^0-9.]/g, '');
        const rupeesTyped = Number(digits);
        if (!digits || !Number.isFinite(rupeesTyped) || rupeesTyped <= 0) {
          push(qurie('I could not read that amount. Type just the number, like 4850.'));
          return;
        }
        patchDraft(draft.id, {}, { totalPaise: Math.round(rupeesTyped * 100) });
        advanceDraft(draft.id);
        return;
      }
      if (draft && draft.stage === 'date') {
        const m = clean.match(/^(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})$/);
        if (m) {
          const y = m[3].length === 2 ? `20${m[3]}` : m[3];
          get().chooseDate(draft.id, `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
          return;
        }
      }

      // Nothing in progress: does the sentence start an order or a collection?
      // English first, since v1 speaks English; the Hindi forms stay because owners type them.
      const orderMatch =
        clean.match(/^order for\s+(.+?)\s*[:\-]\s*(.*)$/i) ||           // "Order for Balaji: 20 fan"
        clean.match(/^(.+?)\s+(?:ka|ki|ke)\s+order\s*[:\-]?\s*(.*)$/i) || // "Balaji ka order: 20 fan"
        clean.match(/^(.+?)\s+order\s*[:\-]\s*(.+)$/i);                  // "Balaji order: 20 fan"
      if (orderMatch) {
        const shop = findShop(orderMatch[1], s.people);
        get().startOrder(shop?.id, orderMatch[2] || undefined);
        return;
      }
      if (/\border\b/i.test(clean) && /^(new|take|naya|lo|le)\b/i.test(clean)) {
        get().startOrder();
        return;
      }
      // Who paid, and how much. The name can come before or after the amount, so
      // each order of the words is matched on its own.
      const paidBy = clean.match(/^(.+?)\s+(?:has |have |had )?(?:already\s+)?(?:paid|pay|pays|payed|gave|give|given|sent|send|settled|settle|cleared|clear|deposited|deposit|transferred|transfer|returned)\s+(.+)$/i)
        || clean.match(/^(.+?)\s+(?:ne|se)\s+(.+?)\s*(?:diye|diya|mila|mile|aaya|aaye|de diye)\.?$/i);
      const fromWho = clean.match(/^(?:received|recieved|recived|receved|rcvd|got|collected|collect|took|take)\s+(.+?)\s+(?:from|se)\s+(.+?)\.?$/i)
        // amount first: "2 lakh received from Balaji"
        || clean.match(/^(.+?)\s+(?:received|recieved|recived|receved|rcvd|collected|got)\s+(?:from|se)\s+(.+?)\.?$/i)
        || clean.match(/^(?:payment|paid|collection|amount)\s*(?:of|:)?\s*(.+?)\s+(?:from|for|by|against)\s+(.+?)\.?$/i)
        || clean.match(/^(?:record|add|enter|log|note)\s+(?:a\s+)?(?:payment|collection)\s*(?:of|:)?\s*(.+?)\s+(?:from|for|by|against)\s+(.+?)\.?$/i);
      const payMatch = paidBy ? { who: paidBy[1], amount: paidBy[2] } : fromWho ? { who: fromWho[2], amount: fromWho[1] } : null;

      // A payment verb and a number, phrased some way none of the above caught.
      const looksLikePayment =
        /\b(paid|payed|pay|pays|payment|pmt|collect|collected|collection|receive[ds]?|recieved|recived|receved|rcvd|settle[ds]?|clear(?:ed)?|deposit(?:ed)?|transfer(?:red)?|diye|diya|mila|mile|aaya|aaye|jama)\b/i.test(clean) &&
        /\d/.test(clean);

      if (payMatch || looksLikePayment) {
        // "collected 7500 from Sharma by cheque" leaves "by cheque" stuck to the name.
        const who = payMatch?.who.replace(/\s+(?:by|via|through|in)?\s*(?:cash|upi|gpay|phonepe|paytm|bank|cheque|check|neft|rtgs|imps|online|transfer)\s*$/i, '').trim();
        const shop = who ? findShop(who, s.people) : undefined;
        const amountPart = payMatch ? parseCollection(payMatch.amount) : parseCollection(clean);
        // The mode may have been written anywhere in the sentence, not just beside the number.
        const parsed = amountPart && { amountPaise: amountPart.amountPaise, mode: parseCollection(clean)?.mode ?? amountPart.mode };
        const cid = id('c');
        set({
          collections: { ...get().collections, [cid]: { id: cid, shopId: shop?.id, stage: shop ? 'amount' : 'shop' } },
          activeCollectionId: cid,
        });
        // Recognised as money coming in, so it never goes to ask(), which can only
        // read and would answer "I cannot record payments". Ask for what is missing.
        if (!shop) {
          if (parsed) patchCollection(cid, { amountPaise: parsed.amountPaise, mode: parsed.mode });
          push(qurie(
            parsed ? `${rupeesText(parsed.amountPaise)} received. Which shop did it come from?` : 'Which shop did the money come from?',
            { kind: 'choose-shop', collectionId: cid },
          ));
          return;
        }
        if (!parsed) {
          push(qurie(`How much did ${shop.name} pay? Try "5000 cash" or "13838 UPI".`));
          return;
        }
        get().proposeCollection(cid, parsed.amountPaise, parsed.mode);
        return;
      }

      set({ sending: true });
      try {
        const { ask } = await import('./api');
        push(...(await ask(clean)));
      } finally {
        set({ sending: false });
      }
    },

    chatReady: false,

    hydrateChat: async (shopId) => {
      currentShopId = shopId ?? null;
      const local = await chat.loadLocal();
      // A different account on the same device must not see the last one's chat.
      const mine = local && (!local.shopId || !shopId || local.shopId === shopId) ? local : null;
      if (mine) {
        for (const id of mine.synced ?? []) syncedIds.add(id);
        set({
          messages: mine.messages.length ? mine.messages : get().messages,
          orders: { ...get().orders, ...mine.orders },
          invoices: { ...get().invoices, ...mine.invoices },
          collections: { ...get().collections, ...mine.collections },
          drafts: { ...get().drafts, ...mine.drafts },
        });
      } else if (local) {
        await chat.clearLocal();
      }
      set({ chatReady: true });

      // Then catch up with the server: anything newer, plus anything it has that
      // this device never saw. Merging by id means a resend cannot duplicate.
      if (!shopId) return;
      try {
        const since = chat.newestAt(get().messages);
        const { messages } = await server.getChat(since);
        if (messages?.length) {
          const incoming = messages.map((m) => ({
            id: m.id, role: m.role as Message['role'], at: m.at,
            text: m.text ?? undefined,
            card: (m.card ?? undefined) as Message['card'],
            attachment: (m.attachment ?? undefined) as Message['attachment'],
          }));
          for (const m of incoming) syncedIds.add(m.id);
          set({ messages: chat.trim(chat.merge(get().messages, incoming)) });
        }
        await pushToServer();
        await chat.saveLocal(snapshot());
      } catch {
        // No network, or no shop yet. The device copy is what the screen shows.
      }
    },

    clearChat: async () => {
      syncedIds.clear();
      set({ messages: [], orders: {}, invoices: {}, collections: {}, drafts: {},
            activeOrderId: undefined, activeInvoiceId: undefined, activeCollectionId: undefined, activeDraftId: undefined });
      await chat.clearLocal();
      try {
        await server.clearChat();
      } catch {
        // Cleared here even if the server could not be reached.
      }
    },

    startOrder: (shopId, itemsText) => {
      const orderId = id('o');
      const lines = itemsText ? parseOrder(itemsText, get().items) : [];
      const order: Order = { id: orderId, number: `O-${orderSeq++}`, shopId, lines, stage: 'shop', createdAt: now() };
      set({ orders: { ...get().orders, [orderId]: order }, activeOrderId: orderId });
      if (!itemsText && !shopId) push(owner('Take an order'));
      advanceOrder(orderId);
    },

    chooseShop: (target, personId) => {
      if (target.orderId) {
        const o = get().orders[target.orderId];
        if (!o || o.stage !== 'shop') return;
        if (personId === 'new') {
          patchOrder(o.id, { stage: 'newShop' });
          push(owner('New shop'), qurie("Type the shop's name."));
          return;
        }
        push(owner(shopName(personId)));
        patchOrder(o.id, { shopId: personId });
        advanceOrder(o.id);
      } else if (target.invoiceId) {
        const draft = get().invoices[target.invoiceId];
        if (!draft || draft.stage !== 'shop') return;
        if (personId === 'new') {
          if (!draft.buyerName) {
            push(qurie('I could not read a name to add. Pick the shop from the list instead.'));
            return;
          }
          push(owner(`Add ${draft.buyerName}`));
          void (async () => {
            const person = await addShop(draft.buyerName as string);
            if (draft.buyerGstin) {
              try {
                await server.patchPerson(person.id, { gstin: draft.buyerGstin });
              } catch {
                // the shop is saved; the GSTIN can be added from the profile
              }
            }
            patchInvoice(draft.id, { shopId: person.id, stage: 'confirm' });
            push(qurie(`${person.name} added. Check the invoice and fix anything I read wrong.`, { kind: 'invoice', invoiceId: draft.id }));
          })();
          return;
        }
        push(owner(shopName(personId)));
        patchInvoice(draft.id, { shopId: personId, stage: 'confirm' });
        push(qurie('Check the invoice and fix anything I read wrong.', { kind: 'invoice', invoiceId: draft.id }));
      } else if (target.collectionId) {
        const c = get().collections[target.collectionId];
        if (!c || c.stage !== 'shop') return;
        if (personId === 'new') {
          push(qurie('Add the shop first, then record the collection.'));
          return;
        }
        push(owner(shopName(personId)));
        patchCollection(c.id, { shopId: personId });
        // The amount was already read out of the sentence, so go to the card.
        if (c.amountPaise) {
          get().proposeCollection(c.id, c.amountPaise, c.mode ?? 'cash');
          return;
        }
        patchCollection(c.id, { stage: 'amount' });
        const { dueFor } = require('./api') as typeof import('./api');
        const due = dueFor(personId);
        push(qurie(`${shopName(personId)} ${due > 0 ? 'owes ' + rupeesText(due) + '. ' : 'owes nothing right now. '}How much came in? Try "5000 cash" or "13838 UPI".`));
      }
    },

    confirmOrder: (orderId) => {
      const o = get().orders[orderId];
      if (!o || o.stage !== 'confirm' || !o.shopId) return;
      if (!o.lines.length) {
        push(qurie('There is nothing on this order yet. Add an item before sending it.'));
        return;
      }
      if (o.lines.some((l) => !l.name.trim())) {
        push(qurie('One line has no item name. Fill it in or remove it before sending.'));
        return;
      }
      if (o.lines.some((l) => !(l.qty > 0))) {
        push(qurie('One line has no quantity. Put a number on it before sending.'));
        return;
      }
      patchOrder(orderId, { stage: 'sent' });
      set({ activeOrderId: undefined });
      const shop = get().people.find((p) => p.id === o.shopId);
      push(owner('Looks right'));
      push(
        qurie(
          `Order ${o.number} confirmed. The order sheet has gone to billing. When the invoice comes back I will match it and ${shop?.paired ? `send it into ${shop.name}'s Qurie app.` : `send it to ${shop?.name} on WhatsApp with an invite to Qurie.`}`,
          { kind: 'order', orderId },
        ),
      );
    },

    editOrderLine: (orderId, index, patch) => {
      const o = get().orders[orderId];
      if (!o || o.stage === 'sent' || o.stage === 'billed' || o.stage === 'cancelled') return;
      const lines = [...o.lines];
      if (!lines[index]) return;
      // A name typed by hand is no longer the matched item, so its rate goes too:
      // keeping it would price a Bajaj fan at the Havells rate without saying so.
      const renamed = patch.name !== undefined && patch.name !== lines[index].name;
      lines[index] = { ...lines[index], ...patch, ...(renamed ? { itemId: undefined, ratePaise: undefined } : null) };
      patchOrder(orderId, { lines });
    },

    removeOrderLine: (orderId, index) => {
      const o = get().orders[orderId];
      if (!o || o.stage === 'sent' || o.stage === 'billed' || o.stage === 'cancelled') return;
      const lines = o.lines.filter((_, i) => i !== index);
      patchOrder(orderId, { lines });
    },

    addOrderLine: (orderId) => {
      const o = get().orders[orderId];
      if (!o || o.stage === 'sent' || o.stage === 'billed' || o.stage === 'cancelled') return;
      patchOrder(orderId, { lines: [...o.lines, { name: '', qty: 1 }] });
    },

    changeOrderShop: (orderId) => {
      const o = get().orders[orderId];
      if (!o || o.stage !== 'confirm') return;
      push(owner('Change shop'));
      patchOrder(orderId, { stage: 'shop', shopId: undefined });
      set({ activeOrderId: orderId });
      push(qurie('Which shop is this order for?', { kind: 'choose-shop', orderId }));
    },

    editOrder: (orderId) => {
      const o = get().orders[orderId];
      if (!o || o.stage !== 'confirm') return;
      push(owner('Change'));
      patchOrder(orderId, { lines: [], stage: 'items' });
      set({ activeOrderId: orderId });
      push(qurie('Alright, tell me the whole order again.'));
    },

    cancelOrder: (orderId) => {
      const o = get().orders[orderId];
      if (!o || o.stage === 'sent' || o.stage === 'billed') return;
      patchOrder(orderId, { stage: 'cancelled' });
      set({ activeOrderId: undefined });
      push(owner('Cancel'), qurie('Order dropped. Nothing was saved.'));
    },

    startCollection: (shopId) => {
      const cid = id('c');
      set({ collections: { ...get().collections, [cid]: { id: cid, shopId, stage: shopId ? 'amount' : 'shop' } }, activeCollectionId: cid });
      push(owner('Record a collection'));
      if (shopId) {
        const { dueFor } = require('./api') as typeof import('./api');
        const due = dueFor(shopId);
        push(qurie(`${shopName(shopId)} ${due > 0 ? 'owes ' + rupeesText(due) + '. ' : 'owes nothing right now. '}How much came in?`));
      } else {
        push(qurie('Which shop did the money come from?', { kind: 'choose-shop', collectionId: cid }));
      }
    },

    proposeCollection: (collectionId, amountPaise, mode) => {
      const c = get().collections[collectionId];
      if (!c) return;
      patchCollection(collectionId, { amountPaise, mode, stage: 'confirm' });
      set({ activeCollectionId: collectionId });
      push(qurie('Check this before I put it in the books.', { kind: 'collection', collectionId }));
    },

    editCollection: (collectionId, patch) => {
      const c = get().collections[collectionId];
      if (!c || c.stage === 'done' || c.stage === 'cancelled') return;
      patchCollection(collectionId, patch);
    },

    confirmCollection: async (collectionId) => {
      const c = get().collections[collectionId];
      if (!c || c.stage !== 'confirm') return;
      if (!c.shopId) {
        push(qurie('Pick the shop first.'));
        return;
      }
      if (!c.amountPaise || c.amountPaise <= 0) {
        push(qurie('Put an amount on it first.'));
        return;
      }
      push(owner('Record it'));
      await recordCollection(collectionId, c.amountPaise, c.mode ?? 'cash');
    },

    changeCollectionShop: (collectionId) => {
      const c = get().collections[collectionId];
      if (!c || c.stage === 'done' || c.stage === 'cancelled') return;
      push(owner('Change shop'));
      patchCollection(collectionId, { stage: 'shop', shopId: undefined });
      set({ activeCollectionId: collectionId });
      push(qurie('Which shop did the money come from?', { kind: 'choose-shop', collectionId }));
    },

    cancelCollection: (collectionId) => {
      patchCollection(collectionId, { stage: 'cancelled' });
      set({ activeCollectionId: undefined });
      push(owner('Cancel'), qurie('Left it.'));
    },

    matchInvoice: async (attachment) => {
      push(owner(attachment?.name ?? 'Invoice from billing', attachment ?? { kind: 'file', name: 'Invoice from billing' }));
      const sent = Object.values(get().orders)
        .filter((o) => o.stage === 'sent' && o.shopId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

      // Nothing to read and no order to fall back on: say what is needed instead of a dead end.
      if (!attachment?.file && !attachment?.uri && !sent) {
        push(qurie('Send me the invoice file or photo and I will file it. The sample only works after an order has gone to billing.'));
        return;
      }

      set({ sending: true });
      const readingId = id('q');
      const dropReading = () => set({ messages: get().messages.filter((m) => m.id !== readingId) });
      try {
        const orderSum = sent ? orderTotal(sent.lines) : 0;
        let number = `INV-${2210 + Object.values(get().orders).filter((o) => o.stage === 'billed').length}`;
        let total = orderSum;
        let date = todayIso();
        let items = sent ? sent.lines.map((l) => ({ product: l.name, qty: l.qty, rate_paise: l.ratePaise ?? null, amount_paise: (l.ratePaise ?? 0) * l.qty })) : [];
        let mismatch = '';
        let buyerName: string | undefined;
        let buyerGstin: string | undefined;
        /** Subtotal, discount, the GST halves and the rounding, as printed. */
        let money: Partial<InvoiceDraft> = {};

        if (attachment?.file || attachment?.uri) {
          push({ id: readingId, role: 'qurie', at: now(), card: { kind: 'reading', what: 'invoice' } });
          const { readBill } = await import('./api');
          const read = await readBill('printed', attachment).finally(dropReading);
          if (read.fields.number) number = read.fields.number;
          if (read.fields.totalPaise) total = read.fields.totalPaise;
          if (read.fields.date) date = read.fields.date;
          if (read.fields.items?.length) {
            items = read.fields.items.filter((i) => i.description).map((i) => ({
              product: i.description as string, qty: i.qty ?? 1,
              rate_paise: i.ratePaise ?? null, amount_paise: i.amountPaise ?? 0,
              pack: i.pack, hsn: i.hsn, batch: i.batch, expiry: i.expiry,
              free_qty: i.freeQty, mrp_paise: i.mrpPaise,
              discount_pct: i.discountPct, gst_pct: i.gstPct,
            }));
          }
          buyerName = read.fields.buyerName;
          buyerGstin = read.fields.buyerGstin;
          money = {
            subtotalPaise: read.fields.subtotalPaise, discountPaise: read.fields.discountPaise,
            cgstPaise: read.fields.cgstPaise, sgstPaise: read.fields.sgstPaise,
            igstPaise: read.fields.igstPaise, cessPaise: read.fields.cessPaise,
            taxPaise: read.fields.taxPaise, roundOffPaise: read.fields.roundOffPaise,
          };
          if (orderSum && Math.abs(total - orderSum) > 100) mismatch = ` Note: the order was ${rupeesText(orderSum)} and the invoice is ${rupeesText(total)}.`;
        }

        if (!total) {
          push(qurie('I could not read a total on that invoice, so I have not filed it. Try a clearer photo, or the PDF.'));
          return;
        }

        const draft: InvoiceDraft = { id: id('i'), stage: 'shop', number, date, totalPaise: total, ...money, items, attachment, buyerName, buyerGstin, orderId: sent?.id, orderNumber: sent?.number, mismatch };
        set({ invoices: { ...get().invoices, [draft.id]: draft } });

        set({ activeInvoiceId: draft.id });
        // An order already went to billing: that is the shop. Otherwise look at the buyer, then ask.
        if (sent?.shopId) {
          patchInvoice(draft.id, { shopId: sent.shopId, stage: 'confirm' });
          const t = taxLine(money);
          push(qurie(`Read invoice ${number} against order ${sent.number}: ${rupeesText(total)}${t ? ` (${t})` : ''}.${mismatch} Check it and fix anything I read wrong.`, { kind: 'invoice', invoiceId: draft.id }));
          return;
        }
        const shops = get().people.filter((p) => p.kind === 'customer');
        const known = buyerGstin ? shops.find((p) => p.gstin === buyerGstin) : undefined;
        const byName = !known && buyerName ? shops.find((p) => normalize(p.name) === normalize(buyerName!)) : undefined;
        const match = known ?? byName;
        const tax = taxLine(money);
        const read = `Invoice ${number}: ${rupeesText(total)}${tax ? ` (${tax})` : ''}${items.length ? `, ${items.length} ${items.length === 1 ? 'item' : 'items'}` : ''}`;

        if (match) {
          patchInvoice(draft.id, { shopId: match.id, stage: 'confirm' });
          push(qurie(`${read}, billed to ${match.name}. Check it and fix anything I read wrong.`, { kind: 'invoice', invoiceId: draft.id }));
          return;
        }
        push(qurie(
          buyerName
            ? `${read}, billed to ${buyerName}, who is not in your shops yet. Tap "Add ${buyerName}" below, or pick the right shop.`
            : `${read}. I could not read who it is billed to. Which shop is it for?`,
          { kind: 'choose-shop', invoiceId: draft.id },
        ));
      } catch (e) {
        dropReading();
        push(qurie(`Could not read the invoice. ${(e as Error)?.message ?? ''}`.trim()));
      } finally {
        set({ sending: false });
      }
    },

    startBill: async (source, attachment) => {
      const draftId = id('d');
      push(owner(attachment?.name ?? 'Brand bill', attachment ?? { kind: 'photo', name: source === 'printed' ? 'Printed bill' : 'Handwritten bill' }));
      const readingId = id('q');
      push({ id: readingId, role: 'qurie', at: now(), text: undefined, card: { kind: 'reading', what: 'bill' } });
      const dropReading = () => set({ messages: get().messages.filter((m) => m.id !== readingId) });
      set({ sending: true });
      try {
        const { readBill } = await import('./api');
        let read: Awaited<ReturnType<typeof readBill>>;
        try {
          read = await readBill(source, attachment);
        } catch (e) {
          dropReading();
          const msg = (e as { status?: number; message?: string })?.status === 0 ? 'No internet right now. Try again.' : `I could not read it. ${(e as Error)?.message ?? ''}`.trim();
          push(qurie(msg));
          return;
        }
        dropReading();
        const f = read.fields;
        if (!f.supplierId && f.supplierName) {
          const person = await addBrand(f.supplierName, { phone: f.phone, gstin: f.gstin });
          f.supplierId = person.id;
          f.supplierName = person.name;
          f.matchedBy = 'new';
        }
        const draft: Draft = { id: draftId, source, fields: f, confidence: read.confidence, stage: 'confirm', attachment };
        set({ drafts: { ...get().drafts, [draftId]: draft }, activeDraftId: draftId });
        const missing = [!f.supplierId && 'brand', !f.date && 'date', !f.totalPaise && 'total'].filter(Boolean);
        const lines = ['Brand bill.'];
        if (f.matchedBy === 'gstin') lines.push(`GSTIN matches ${f.supplierName}.`);
        else if (f.matchedBy === 'new') lines.push(`${f.supplierName} is new, added to your brands.`);
        if (missing.length) lines.push(`Could not read the ${missing.join(' or ')}, so I will ask.`);
        push(qurie(lines.join(' ')));
      } finally {
        set({ sending: false });
      }
      advanceDraft(draftId);
    },

    chooseSupplier: (draftId, personId) => {
      const d = get().drafts[draftId];
      if (!d || d.stage !== 'supplier') return;
      if (personId === 'new') {
        patchDraft(draftId, { stage: 'newSupplier' });
        push(owner('New brand'), qurie("Type the brand's name."));
        return;
      }
      const person = get().people.find((p) => p.id === personId);
      if (!person) return;
      const matchedBy = d.fields.gstin && person.gstin === d.fields.gstin ? 'gstin' : 'chosen';
      push(owner(person.name));
      patchDraft(draftId, {}, { supplierId: person.id, supplierName: person.name, gstin: person.gstin ?? d.fields.gstin, matchedBy });
      advanceDraft(draftId);
    },

    chooseDate: (draftId, iso) => {
      const d = get().drafts[draftId];
      if (!d || d.stage !== 'date') return;
      push(owner(iso === todayIso() ? 'Today' : iso === addDays(todayIso(), -1) ? 'Yesterday' : iso));
      patchDraft(draftId, {}, { date: iso });
      advanceDraft(draftId);
    },

    changeSupplier: (draftId) => {
      const d = get().drafts[draftId];
      if (!d || d.stage !== 'confirm') return;
      push(owner('Change brand'));
      patchDraft(draftId, { stage: 'supplier' }, { supplierId: undefined, supplierName: undefined, matchedBy: undefined });
      push(qurie('Which brand is it from?', { kind: 'choose-supplier', draftId }));
    },

    confirmDraft: async (draftId) => {
      const d = get().drafts[draftId];
      if (!d || d.stage !== 'confirm') return;
      const f = d.fields;
      if (!f.supplierId || !f.date || !f.totalPaise) return;
      push(owner('Looks right'));
      set({ activeDraftId: undefined, sending: true });
      try {
        const bill = await server.createBill({
          kind: 'purchase',
          person_id: f.supplierId,
          number: f.number ?? null,
          bill_date: f.date,
          due_date: f.dueDate ?? null,
          seller_name: f.supplierName ?? null,
          seller_gstin: f.gstin ?? null,
          seller_phone: f.phone ?? null,
          subtotal_paise: f.subtotalPaise ?? null,
          total_paise: f.totalPaise,
          source: d.source,
          items: (f.items ?? []).filter((i) => i.description).map((i) => ({ product: i.description, qty: i.qty ?? 1, rate_paise: i.ratePaise ?? null, amount_paise: i.amountPaise ?? 0 })),
        });
        let photoNote = '';
        if (d.attachment?.file || d.attachment?.uri) {
          try {
            const up = await server.uploadBillImage(bill.id, d.attachment);
            photoNote = up.stored_in === 'supabase' ? ' Photo Supabase mein rakh li.' : ' Photo server par rakh li.';
          } catch {
            photoNote = ' The photo did not upload; the bill is saved.';
          }
        }
        patchDraft(draftId, { stage: 'saved', savedTxnId: bill.id });
        await get().refresh();
        const savedTax = taxLine(f);
        push(qurie(
          `Saved under ${f.supplierName}: ${rupeesText(f.totalPaise)}${savedTax ? ` (${savedTax})` : ''}. Status: confirmed${f.dueDate ? `, due ${f.dueDate}` : ''}.${photoNote}`,
          { kind: 'outstanding', personId: f.supplierId, amountPaise: f.totalPaise },
        ));
      } catch (e) {
        set({ activeDraftId: draftId });
        push(qurie(`Could not save it. ${(e as Error)?.message ?? ''}`.trim()));
      } finally {
        set({ sending: false });
      }
    },

    editDraft: (draftId, patch) => {
      const d = get().drafts[draftId];
      if (!d || d.stage === 'saved' || d.stage === 'cancelled') return;
      patchDraft(draftId, {}, patch);
    },

    editDraftItem: (draftId, index, patch) => {
      const d = get().drafts[draftId];
      if (!d || d.stage === 'saved' || d.stage === 'cancelled') return;
      const items = [...(d.fields.items ?? [])];
      if (!items[index]) return;
      items[index] = { ...items[index], ...patch };
      patchDraft(draftId, {}, { items });
    },

    editInvoice: (invoiceId, patch) => {
      const d = get().invoices[invoiceId];
      if (!d || d.stage === 'saved' || d.stage === 'cancelled') return;
      patchInvoice(invoiceId, patch);
    },

    editInvoiceItem: (invoiceId, index, patch) => {
      const d = get().invoices[invoiceId];
      if (!d || d.stage === 'saved' || d.stage === 'cancelled') return;
      const items = [...d.items];
      if (!items[index]) return;
      items[index] = { ...items[index], ...patch };
      patchInvoice(invoiceId, { items });
    },

    confirmInvoice: (invoiceId) => {
      const d = get().invoices[invoiceId];
      if (!d || d.stage !== 'confirm') return;
      if (!d.totalPaise) {
        push(qurie('The total is empty. Type it in before saving.'));
        return;
      }
      push(owner('Looks right'));
      void fileInvoice(invoiceId);
    },

    changeInvoiceShop: (invoiceId) => {
      const d = get().invoices[invoiceId];
      if (!d || d.stage !== 'confirm') return;
      push(owner('Change shop'));
      patchInvoice(invoiceId, { stage: 'shop', shopId: undefined });
      set({ activeInvoiceId: invoiceId });
      push(qurie('Which shop is it for?', { kind: 'choose-shop', invoiceId }));
    },

    cancelInvoice: (invoiceId) => {
      const d = get().invoices[invoiceId];
      if (!d || d.stage === 'saved') return;
      patchInvoice(invoiceId, { stage: 'cancelled' });
      set({ activeInvoiceId: undefined });
      push(owner('Cancel'), qurie('Dropped. Nothing was saved.'));
    },

    shareContact: (personId) => {
      const person = get().people.find((p) => p.id === personId);
      if (!person) return;
      push(owner(`Contact: ${person.name}`), qurie(person.paired ? `${person.name} is on Qurie.` : person.gstin ? `${person.name}, GSTIN on file.` : `${person.name}.`, { kind: 'contact', personId }));
    },

    askNewShop: () => {
      set({ pendingAction: 'newShop' });
      push(owner('New shop'), qurie("Type the shop's name."));
    },

    cancelDraft: (draftId) => {
      const d = get().drafts[draftId];
      if (!d || d.stage === 'saved') return;
      patchDraft(draftId, { stage: 'cancelled' });
      set({ activeDraftId: undefined });
      push(owner('Cancel'), qurie('Dropped. Nothing was saved.'));
    },
  };
});

export { normalize };
