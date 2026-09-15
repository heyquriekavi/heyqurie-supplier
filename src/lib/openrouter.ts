/**
 * Direct calls to OpenRouter from the phone, for local testing only.
 * Active when EXPO_PUBLIC_OPENROUTER_API_KEY is set in .env; otherwise
 * api.ts sends the same requests to the backend, which holds the key.
 * One model does both text and photos: Gemini 3.5 Flash Lite by default.
 */
import type { Attachment } from './types';

const KEY = (process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '').trim();
/**
 * Measured on 20 real Indian bills against the answer key in
 * backend/tools/bills/truth.json, scored through the same shape() the app uses.
 * Latency and cost are from this prompt on one GST invoice.
 *
 *   reader                      right   invented   time    cost
 *   gemini-3.1-flash-lite @1600  147/153     3      4.0s   $0.0014   <- this
 *   gemini-3.5-flash-lite        untested    -      3.1s   $0.0022
 *   gemini-2.5-flash-lite        141/153     7        -      -
 *   qwen3.6-35b-a3b @1600        148/153     2     63.6s      -
 *
 * qwen reads one field better out of 153 and takes sixty seconds to do it,
 * which is not a trade to make while someone stands holding a phone. 3.5 was
 * the old default: never scored, dearer, and its 2.5 sibling was the worst of
 * the set. "Invented" is a field the bill does not carry that the reader filled
 * in anyway, and is the worst kind of wrong: it reads as data, not as a gap.
 */
export const MODEL = (process.env.EXPO_PUBLIC_OPENROUTER_MODEL ?? 'google/gemini-3.1-flash-lite').trim();

/** The long side the reader is happiest with. Bigger is not better: the full-size
 *  photos invented more fields than their 1600 px copies, and cost more to send. */
export const MAX_PX = 1600;
// Not named URL: that shadows the browser global this file also needs.
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const hasKey = () => KEY.length > 0;

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type Msg = { role: 'system' | 'user' | 'assistant'; content: string | Part[] };

/** One chat completion. With `json` the model is asked for a JSON object and the parsed object is returned. */
export async function complete<T = string>(messages: Msg[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://qurie.app', 'X-Title': 'Qurie Supplier (local test)' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0.2,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `OpenRouter ${res.status}`);
  const choice = data.choices?.[0];
  const text: string = choice?.message?.content ?? '';
  if (!opts.json) return text as unknown as T;

  // The model stopped because it ran out of room, so the JSON is a fragment.
  // Say that, rather than letting JSON.parse report a mystery at some offset.
  if (choice?.finish_reason === 'length') {
    throw new Error('The bill is longer than the reader had room for. Try a clearer photo of one page, or send the PDF.');
  }
  // Models sometimes wrap JSON in a code fence; strip it before parsing.
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!clean) throw new Error('The reader sent nothing back. Try again.');
  try {
    return JSON.parse(clean) as T;
  } catch {
    throw new Error('The reader sent something that was not a bill. Try a clearer photo.');
  }
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Turn a picked photo or PDF into a data URL the model can look at, shrinking a
 * photo to MAX_PX on the long side first. A PDF is left alone: it is not an
 * image and the manipulator cannot open it.
 */
export async function toDataUrl(attachment: Attachment): Promise<string> {
  const isPdf = (attachment.mime ?? '').includes('pdf') || (attachment.name ?? '').toLowerCase().endsWith('.pdf');
  const blob: Blob = attachment.file ? (attachment.file as Blob) : await (await fetch(attachment.uri as string)).blob();
  if (isPdf) return readAsDataUrl(blob);

  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const source = attachment.uri ?? URL.createObjectURL(blob);
    const ctx = ImageManipulator.manipulate(source);
    const image = await ctx.renderAsync();
    const long = Math.max(image.width, image.height);
    if (long > MAX_PX) {
      const scale = MAX_PX / long;
      ctx.resize({ width: Math.round(image.width * scale), height: Math.round(image.height * scale) });
    }
    const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
    if (out.base64) return `data:image/jpeg;base64,${out.base64}`;
    if (out.uri) return readAsDataUrl(await (await fetch(out.uri)).blob());
  } catch {
    // Manipulation is an optimisation, not a requirement: a photo the library
    // cannot open is still a photo the reader can try.
  }
  return readAsDataUrl(blob);
}
