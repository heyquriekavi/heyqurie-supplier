/**
 * Calls to the supplier backend's ledger routes (app/ledger.py). Shapes here are
 * the server's; api.ts turns them into the app's Person and Txn.
 */
import { API_URL, getTokens, request, upload } from './http';
import type { Attachment } from './types';

export type ServerPerson = { id: string; kind: 'customer' | 'supplier'; name: string; phone: string | null; gstin: string | null; credit_days: number; paired: boolean; beat: string | null };
export type ServerItem = { id: string; line_no: number; qty: number; free_qty: number; pack: string | null; product: string; batch: string | null; expiry: string | null; hsn: string | null; mrp_paise: number | null; rate_paise: number | null; discount_pct: number; sgst_pct: number; cgst_pct: number; igst_pct: number; amount_paise: number };
export type ServerPayment = { id: string; bill_id: string | null; customer_id: string | null; supplier_id: string | null; direction: 'in' | 'out'; amount_paise: number; paid_on: string; mode: string | null; reference: string | null; note: string | null };
export type ServerBill = {
  id: string; kind: 'purchase' | 'sale'; customer_id: string | null; supplier_id: string | null;
  seller_name: string | null; seller_gstin: string | null; seller_licence: string | null; seller_phone: string | null;
  buyer_name: string | null; buyer_gstin: string | null; buyer_licence: string | null;
  number: string | null; bill_date: string; due_date: string | null; salesman: string | null; order_number: string | null;
  subtotal_paise: number | null; discount_paise: number; sgst_paise: number; cgst_paise: number; igst_paise: number; adjust_paise: number; total_paise: number;
  status: string; payment_status: 'unpaid' | 'partial' | 'paid'; source: string | null; image_path: string | null; has_image: boolean; terms: string | null;
  created_at: string; items: ServerItem[]; payments: ServerPayment[]; paid_paise: number;
};

export const listPeople = (kind: 'customer' | 'supplier') => request<ServerPerson[]>(`/api/v1/people?kind=${kind}`);
export const createPerson = (body: { kind: 'customer' | 'supplier'; name: string; phone?: string; gstin?: string; credit_days?: number; paired?: boolean; beat?: string }) =>
  request<ServerPerson>('/api/v1/people', { method: 'POST', body });
export const listBills = (q: { kind?: 'purchase' | 'sale'; person_id?: string; month?: string } = {}) => {
  const qs = Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return request<ServerBill[]>(`/api/v1/bills${qs ? `?${qs}` : ''}`);
};
export const getBill = (id: string) => request<ServerBill>(`/api/v1/bills/${id}`);
export const createBill = (body: Record<string, unknown>) => request<ServerBill>('/api/v1/bills', { method: 'POST', body });
export const createPayment = (body: { person_id: string; bill_id?: string; amount_paise: number; mode: string; reference?: string; note?: string }) =>
  request<{ payments: { id: string; bill_id: string | null; amount_paise: number }[]; direction: 'in' | 'out' }>('/api/v1/payments', { method: 'POST', body });
export const home = () => request<{ month: string; billed_paise: number; billed_count: number; to_collect_paise: number; overdue_paise: number }>('/api/v1/home');

/** Attach the soft copy to a bill. */
export async function uploadBillImage(billId: string, attachment: Attachment) {
  const form = new FormData();
  if (attachment.file) form.append('file', attachment.file as Blob, attachment.name ?? 'bill.jpg');
  else form.append('file', { uri: attachment.uri, name: attachment.name ?? 'bill.jpg', type: attachment.mime ?? 'image/jpeg' } as unknown as Blob);
  return upload<{ ok: boolean; image_path: string; stored_in: string }>(`/api/v1/bills/${billId}/image`, form);
}

/** The soft copy as a data URL the Image component can show; the bucket itself is never exposed. */
export async function billImageDataUrl(billId: string): Promise<string | null> {
  const { access } = await getTokens();
  const res = await fetch(`${API_URL}/api/v1/bills/${billId}/image`, { headers: access ? { authorization: `Bearer ${access}` } : {} });
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

export const patchPerson = (id: string, body: { name?: string; phone?: string; gstin?: string; credit_days?: number; paired?: boolean; beat?: string }) =>
  request<ServerPerson>(`/api/v1/people/${id}`, { method: 'PATCH', body });

export const deleteBill = (id: string) => request<{ ok: boolean }>(`/api/v1/bills/${id}`, { method: 'DELETE' });
export const deletePayment = (id: string) => request<{ ok: boolean }>(`/api/v1/payments/${id}`, { method: 'DELETE' });
export const deletePerson = (id: string) => request<{ ok: boolean }>(`/api/v1/people/${id}`, { method: 'DELETE' });

/** Record money against one bill. Direction is decided by the server from who the person is. */
export const payBill = (body: { person_id: string; bill_id: string; amount_paise: number; mode: string; reference?: string; note?: string }) =>
  request<{ payments: { id: string; bill_id: string | null; amount_paise: number }[]; direction: 'in' | 'out' }>('/api/v1/payments', { method: 'POST', body });
