/**
 * Seed data for the supplier app. Empty on purpose: shops, brands, items,
 * bills and payments come from Supabase through the server. What is here
 * is only the shop profile placeholder and Qurie's first message.
 */
import type { Item, Message, Person, Shop, Txn } from './types';

export const shop: Shop = {
  name: 'Your business',
  type: 'other',
  city: '',
  gstin: '',
  ownerPhone: '',
  caName: '',
  caPhone: '',
};

export const people: Person[] = [];

export const items: Item[] = [];

export const txns: Txn[] = [];

const now = new Date().toISOString();

export const seedMessages: Message[] = [
  {
    id: 'm1',
    role: 'qurie',
    at: now,
    text: "Hello, I'm Qurie. Tap the plus to begin: add your first shop, or just tell me an order like \"Order for Balaji: 20 fan, 5 box wire\".",
  },
];
