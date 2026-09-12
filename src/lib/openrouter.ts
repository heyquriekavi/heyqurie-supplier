/**
 * Direct calls to OpenRouter from the phone, for local testing only.
 * Active when EXPO_PUBLIC_OPENROUTER_API_KEY is set in .env; otherwise
 * api.ts sends the same requests to the backend, which holds the key.
 * One model does both text and photos: Gemini 3.5 Flash Lite by default.
 */
import type { Attachment } from './types';

const KEY = (process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '').trim();
export const MODEL = (process.env.EXPO_PUBLIC_OPENROUTER_MODEL ?? 'google/gemini-3.5-flash-lite').trim();
const URL = 'https://openrouter.ai/api/v1/chat/completions';

export const hasKey = () => KEY.length > 0;

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type Msg = { role: 'system' | 'user' | 'assistant'; content: string | Part[] };

/** One chat completion. With `json` the model is asked for a JSON object and the parsed object is returned. */
export async function complete<T = string>(messages: Msg[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<T> {
  const res = await fetch(URL, {
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

/** Turn a picked photo or PDF into a data URL the model can look at. */
export async function toDataUrl(attachment: Attachment): Promise<string> {
  const blob: Blob = attachment.file ? (attachment.file as Blob) : await (await fetch(attachment.uri as string)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
