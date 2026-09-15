/**
 * The conversation, kept twice.
 *
 * On the device first, because opening the app should show yesterday's chat
 * without waiting for a network. Then pushed to /api/v1/chat, so a reinstall or
 * a second phone gets it back. The device copy is the one the screen reads; the
 * server is the durable one.
 *
 * Drafts, orders, invoices and collections ride along, so a card left mid-flow
 * is still a working card after a reload rather than a dead rectangle.
 */
// The legacy entry point: SDK 57's new File/Directory classes are not needed
// for one small JSON file, and this keeps a simple read/write/delete.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { Collection, Draft, InvoiceDraft, Message, Order } from './types';

const web = Platform.OS === 'web';
const KEY = 'qurie.chat.v1';
const FILE = `${FileSystem.documentDirectory ?? ''}${KEY}.json`;

/** Enough to scroll back through a few weeks; the file stays well under a megabyte. */
export const MAX_KEPT = 400;

export type Snapshot = {
  v: 1;
  shopId: string | null;
  messages: Message[];
  orders: Record<string, Order>;
  invoices: Record<string, InvoiceDraft>;
  collections: Record<string, Collection>;
  drafts: Record<string, Draft>;
  /** Ids already accepted by the server, so a resend is not attempted forever. */
  synced: string[];
};

/**
 * A picked file on web is a Blob, which does not survive JSON. Keep what
 * describes it and drop the bytes: the photo itself is already on the server
 * once the bill was saved, and an unsent one is not worth persisting.
 */
function tidy(m: Message): Message {
  if (!m.attachment) return m;
  const { kind, uri, name, mime } = m.attachment;
  const keepUri = web ? undefined : uri; // a web blob: URL is dead on the next load
  return { ...m, attachment: { kind, uri: keepUri, name, mime } };
}

export function trim(messages: Message[]): Message[] {
  return messages.length > MAX_KEPT ? messages.slice(messages.length - MAX_KEPT) : messages;
}

export async function loadLocal(): Promise<Snapshot | null> {
  try {
    const raw = web
      ? typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(KEY)
      : (await FileSystem.getInfoAsync(FILE)).exists
        ? await FileSystem.readAsStringAsync(FILE)
        : null;
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    return snap && snap.v === 1 && Array.isArray(snap.messages) ? snap : null;
  } catch {
    return null; // a half-written or hand-edited file must not stop the app opening
  }
}

export async function saveLocal(snap: Snapshot): Promise<void> {
  const body = JSON.stringify({ ...snap, messages: trim(snap.messages).map(tidy) });
  try {
    if (web) localStorage?.setItem(KEY, body);
    else await FileSystem.writeAsStringAsync(FILE, body);
  } catch {
    // Out of space, or storage blocked. The chat still works in memory.
  }
}

export async function clearLocal(): Promise<void> {
  try {
    if (web) localStorage?.removeItem(KEY);
    else await FileSystem.deleteAsync(FILE, { idempotent: true });
  } catch {
    /* nothing to do */
  }
}

/** Newest `at` we hold, so the server is asked only for what came after it. */
export function newestAt(messages: Message[]): string | undefined {
  let out: string | undefined;
  for (const m of messages) if (!out || m.at > out) out = m.at;
  return out;
}

/** One list, no duplicates, oldest first. Later copies of an id win. */
export function merge(a: Message[], b: Message[]): Message[] {
  const by = new Map<string, Message>();
  for (const m of [...a, ...b]) by.set(m.id, m);
  return [...by.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}
