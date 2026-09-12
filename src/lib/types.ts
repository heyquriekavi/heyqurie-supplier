export type PersonKind = 'supplier' | 'customer';

/** In the supplier app a "customer" is a shop we sell to and a "supplier" is a brand we buy from. */
export type Person = {
  id: string;
  kind: PersonKind;
  name: string;
  phone: string;
  gstin?: string;
  creditDays: number;
  /** Shop is on the Qurie shop app: bills land in their ledger directly. */
  paired?: boolean;
  /** Salesman's beat this shop belongs to. */
  beat?: string;
};

/** The distributor's item list, exported once from Marg or Tally so Qurie speaks the same names the invoice will carry. */
export type Item = { id: string; name: string; unit: string; ratePaise: number; brand?: string; stock?: number };

/** How money moved. Matches the CHECK on the payments table. */
export type PayMode = 'cash' | 'upi' | 'bank' | 'cheque' | 'other';

export type OrderLine = { itemId?: string; name: string; qty: number; unit?: string; ratePaise?: number };

/** shop: which shop. items: waiting for the lines. confirm: card shown. sent: handed to billing. billed: invoice matched. */
export type OrderStage = 'shop' | 'newShop' | 'items' | 'confirm' | 'sent' | 'billed' | 'cancelled';

export type Order = {
  id: string;
  number: string;
  shopId?: string;
  lines: OrderLine[];
  stage: OrderStage;
  createdAt: string;
  invoiceTxnId?: string;
};

/** One row of the invoice table, as printed. */
export type InvoiceLine = {
  product: string;
  qty: number;
  rate_paise: number | null;
  amount_paise: number;
  pack?: string;
  hsn?: string;
  batch?: string;
  /** 'YYYY-MM' */
  expiry?: string;
  free_qty?: number;
  mrp_paise?: number;
  discount_pct?: number;
  gst_pct?: number;
};

/** An invoice from the billing software, read and waiting to be filed under a shop. */
export type InvoiceDraft = {
  id: string;
  /** shop: waiting to know which shop. confirm: card shown, nothing saved yet. */
  stage: 'shop' | 'confirm' | 'saved' | 'cancelled';
  shopId?: string;
  number: string;
  date: string;
  totalPaise: number;
  subtotalPaise?: number;
  discountPaise?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  cessPaise?: number;
  taxPaise?: number;
  roundOffPaise?: number;
  items: InvoiceLine[];
  attachment?: Attachment;
  /** The party the invoice is billed to, as printed. */
  buyerName?: string;
  buyerGstin?: string;
  /** Set when it matched an order we had already sent to billing. */
  orderId?: string;
  orderNumber?: string;
  mismatch?: string;
};

/** confirm: the card is up and nothing has been posted. Money is never written without it. */
export type CollectionStage = 'shop' | 'amount' | 'confirm' | 'done' | 'cancelled';
export type Collection = {
  id: string;
  shopId?: string;
  stage: CollectionStage;
  amountPaise?: number;
  mode?: PayMode;
  txnId?: string;
};

/** due: unpaid and the due date has arrived. confirmed: checked and saved, not yet due. paid: settled. */
export type BillStatus = 'due' | 'confirmed' | 'paid';

export type Txn = {
  id: string;
  personId: string;
  /** ISO date */
  date: string;
  /** For a supplier: purchase bill, payment out. For a customer: sale, payment in. */
  kind: 'bill' | 'payment';
  number?: string;
  description: string;
  amountPaise: number;
  status: 'paid' | 'outstanding';
  dueDate?: string;
  /** Paid so far against this bill (server-side sum). */
  paidPaise?: number;
  /** The bill has a soft copy stored on the server. */
  hasImage?: boolean;
  itemCount?: number;
  mode?: PayMode;
  reference?: string;
};

/** What the reader found on a bill photo. Missing means it could not read it. */
export type DraftFields = {
  supplierId?: string;
  supplierName?: string;
  gstin?: string;
  /** supplier's phone as printed on the bill, kept when a new supplier is created from it */
  phone?: string;
  /** the party billed to, used to file an invoice we raised under the right shop */
  buyerName?: string;
  buyerGstin?: string;
  number?: string;
  date?: string;
  dueDate?: string;
  totalPaise?: number;
  matchedBy?: 'gstin' | 'name' | 'chosen' | 'new';
  subtotalPaise?: number;
  discountPaise?: number;
  /** A bill shows CGST+SGST within a state, or IGST across one, never both. */
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  cessPaise?: number;
  /** All tax components added up, whether printed as a total or summed from the halves. */
  taxPaise?: number;
  roundOffPaise?: number;
  sellerLicence?: string;
  buyerLicence?: string;
  salesman?: string;
  orderNumber?: string;
  terms?: string;
  items?: {
    description?: string;
    pack?: string;
    hsn?: string;
    batch?: string;
    /** 'YYYY-MM', because batch expiry is printed to the month. */
    expiry?: string;
    qty?: number;
    freeQty?: number;
    mrpPaise?: number;
    ratePaise?: number;
    discountPct?: number;
    gstPct?: number;
    amountPaise?: number;
  }[];
  warnings?: string[];
};

export type Confidence = Partial<Record<'supplier' | 'number' | 'date' | 'total' | 'tax', number>>;

export type DraftStage = 'supplier' | 'newSupplier' | 'date' | 'amount' | 'confirm' | 'saved' | 'cancelled';

export type Draft = {
  id: string;
  source: 'printed' | 'handwritten';
  fields: DraftFields;
  confidence: Confidence;
  stage: DraftStage;
  savedTxnId?: string;
  /** The photo or file being read, uploaded with the bill on confirm. */
  attachment?: Attachment;
};

export type Card =
  | { kind: 'summary'; salesPaise: number; bills: number; items: number }
  | { kind: 'outstanding'; personId: string; amountPaise: number }
  | { kind: 'extraction'; draftId: string }
  | { kind: 'choose-supplier'; draftId: string }
  | { kind: 'choose-date'; draftId: string }
  | { kind: 'contact'; personId: string }
  | { kind: 'reading'; what: 'bill' | 'invoice' }
  | { kind: 'choose-shop'; orderId?: string; collectionId?: string; invoiceId?: string }
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'collection'; collectionId: string };

export type Attachment = { kind: 'photo' | 'file'; uri?: string; name?: string; mime?: string; /** web only: the picked File */ file?: unknown };

export type Message = {
  id: string;
  role: 'user' | 'qurie';
  at: string;
  text?: string;
  card?: Card;
  attachment?: Attachment;
};

export type Shop = {
  name: string;
  type: 'hardware' | 'electrical' | 'pharmacy' | 'other';
  city: string;
  gstin: string;
  ownerPhone: string;
  caName: string;
  caPhone: string;
};

export type Period = 'today' | 'week' | 'month';

export type Summary = {
  salesInPaise: number;
  billsOutPaise: number;
  change: number;
};

export type PersonSummary = {
  duePaise: number;
  upcomingPaise: number;
  billCount: number;
  lastBillDate?: string;
};

export type Ledger = {
  person: Person;
  totalPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  txns: Txn[];
};
