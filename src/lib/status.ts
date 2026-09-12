/**
 * The three money states, and what they are called on each side of the ledger.
 *
 * They are derived, never set by hand: a bill is collected because a payment
 * exists, not because someone tapped a button. The buttons on the bill screen
 * record the payment, and the status follows. The one thing the owner does set
 * directly is the due date, which is what moves a bill between confirmed and due.
 *
 *   confirmed  green   saved and checked, nothing owed yet
 *   due        red     the due date has arrived and money is still out
 *   settled    blue    nothing left on it
 */
import type { PillTone } from '@/components/Pill';

export type Money = { totalPaise: number; paidPaise: number; dueDate?: string | null };

export type Status = 'confirmed' | 'due' | 'settled';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function statusOf(m: Money): Status {
  const left = Math.max(m.totalPaise - m.paidPaise, 0);
  if (left <= 0) return 'settled';
  if (!m.dueDate) return 'due';
  return m.dueDate.slice(0, 10) <= today() ? 'due' : 'confirmed';
}

/** `sale` means an invoice we raised to a shop: money comes in, so it is collected, not paid. */
export function statusLabel(status: Status, m: Money, sale: boolean): string {
  const part = m.paidPaise > 0 && m.paidPaise < m.totalPaise;
  if (status === 'settled') return sale ? 'Collected' : 'Paid';
  const half = sale ? 'Part collected' : 'Part paid';
  if (status === 'due') return part ? `${half} · due` : 'Due';
  return part ? half : 'Confirmed';
}

export const statusTone: Record<Status, PillTone> = { confirmed: 'confirmed', due: 'due', settled: 'paid' };

/** What the button on a bill offers next. */
export function nextAction(m: Money, sale: boolean): { full: string; part: string } | null {
  const left = Math.max(m.totalPaise - m.paidPaise, 0);
  if (left <= 0) return null;
  return sale
    ? { full: 'Mark collected', part: 'Part collection' }
    : { full: 'Mark paid', part: 'Part payment' };
}
