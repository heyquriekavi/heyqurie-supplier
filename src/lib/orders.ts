/**
 * Turns "20 Havells fan, 5 box Finolex wire, 2 MCB" into order lines against
 * the item list. Pure functions, no state, so they are easy to test and easy
 * to replace with the server's matcher later.
 */
import type { Item, OrderLine } from './types';

const UNITS = ['pcs', 'pc', 'nos', 'no', 'box', 'boxes', 'pkt', 'packet', 'packets', 'dozen', 'dz', 'roll', 'rolls', 'bundle', 'bundles', 'piece', 'pieces'];
const STOP = new Set(['ka', 'ke', 'ki', 'ko', 'aur', 'and', 'the', 'of', 'x', 'wala', 'wale', 'bhi']);

const WORD_NUMBERS: Record<string, number> = { ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, fifty: 50, hundred: 100 };

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9. ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

/** Score an item against the words the owner said. Every said word that appears in the item name counts; brand words count double. */
export function matchItem(said: string, items: Item[]): { item: Item; score: number } | undefined {
  const words = tokens(said);
  if (!words.length) return undefined;
  let best: { item: Item; score: number } | undefined;
  for (const item of items) {
    const name = tokens(item.name);
    const brand = item.brand ? tokens(item.brand) : [];
    let score = 0;
    for (const w of words) {
      const hit = name.find((n) => n.startsWith(w) || w.startsWith(n));
      if (hit) score += brand.includes(hit) ? 2 : 1;
    }
    // "fan" matches both the fan and its regulator; prefer the shorter, more exact name.
    const coverage = score / Math.max(name.length, 1);
    const total = score + coverage;
    if (score > 0 && (!best || total > best.score)) best = { item, score: total };
  }
  return best && best.score >= 1 ? best : undefined;
}

/** Split the sentence into lines: commas, "aur", "and", new lines, or a number starting a new phrase. */
export function splitLines(text: string): string[] {
  return text
    .replace(/\b(aur|and)\b/gi, ',')
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseLine(piece: string, items: Item[]): OrderLine {
  let rest = piece.trim();
  let qty = 1;
  const m = rest.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (m) {
    qty = Number(m[1]);
    rest = m[2];
  } else {
    const first = rest.split(/\s+/)[0]?.toLowerCase();
    if (first && WORD_NUMBERS[first]) {
      qty = WORD_NUMBERS[first];
      rest = rest.slice(first.length).trim();
    }
  }
  // trailing "x 20" or "qty 20"
  const tail = rest.match(/^(.*?)\s*(?:x|qty)\s*(\d+)$/i);
  if (tail) {
    rest = tail[1];
    qty = Number(tail[2]);
  }
  let unit: string | undefined;
  const u = rest.match(/^(\w+)\s+(.*)$/);
  if (u && UNITS.includes(u[1].toLowerCase())) {
    unit = u[1].toLowerCase().replace(/es$|s$/, '');
    rest = u[2];
  }
  const hit = matchItem(rest, items);
  if (hit) return { itemId: hit.item.id, name: hit.item.name, qty, unit: unit ?? hit.item.unit, ratePaise: hit.item.ratePaise };
  return { name: rest.trim() || piece.trim(), qty, unit };
}

export function parseOrder(text: string, items: Item[]): OrderLine[] {
  return splitLines(text).map((p) => parseLine(p, items)).filter((l) => l.name);
}

export function orderTotal(lines: OrderLine[]): number {
  return lines.reduce((s, l) => s + (l.ratePaise ?? 0) * l.qty, 0);
}

/** "5000 cash", "₹13,838 upi", "2500 by cheque" → amount in paise and a mode. */
export function parseCollection(text: string): { amountPaise: number; mode: 'cash' | 'upi' | 'bank' | 'cheque' } | undefined {
  const digits = text.replace(/[,₹]/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!digits) return undefined;
  const amount = Number(digits[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const t = text.toLowerCase();
  const mode = /upi|gpay|phonepe|paytm/.test(t) ? 'upi' : /cheque|check/.test(t) ? 'cheque' : /bank|neft|rtgs|imps|transfer/.test(t) ? 'bank' : 'cash';
  return { amountPaise: Math.round(amount * 100), mode };
}
