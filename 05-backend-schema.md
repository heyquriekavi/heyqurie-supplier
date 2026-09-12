# 05 · Backend Schema — Data Model & Auth Architecture

Draft v0.1, 10 Sep 2026. Extends `backend/app/db.py` (owner: Divya). Same SQL on SQLite (dev) and Postgres (prod). Money is stored in paise as integers. Times are ISO-8601 text on SQLite and `timestamptz` on Postgres. IDs are UUID text.

## Table: users (existing, extended)
id (uuid pk), email (text, unique, now nullable; desktop users only), phone (text, unique, E.164; required for app users), name, picture, role (text: owner | staff | ca | admin, default owner), shop_id (fk → shops.id, null until setup), language (text: hi | en, default hi), voice_replies (bool, default false), created_at, last_seen_at

## Table: shops
id (uuid pk), name (text), type (text: hardware | electrical | pharmacy | kirana | other), gstin (text, nullable, checksum validated), scheme (text: regular | composition | unregistered), state_code (text), address (text), lat (real), lng (real), city (text), pin (text), ca_name (text), ca_phone (text), ca_email (text), plan (text: trial | bills | plus | free), plan_until (timestamp), created_at

## Table: suppliers
id (uuid pk), shop_id (fk → shops.id), name (text), name_normalized (text, for matching), gstin (text, nullable), phone (text), udyam_type (text: micro | small | medium | trader | unknown), credit_days (int, default 21), created_at
Unique (shop_id, name_normalized). Index (shop_id, gstin).

## Table: customers
id (uuid pk), shop_id (fk), name (text), name_normalized (text), phone (text), credit_days (int, default 30), created_at
Unique (shop_id, name_normalized).

## Table: bills
id (uuid pk), shop_id (fk), kind (text: purchase | sale, default purchase), supplier_id (fk, null until confirmed; purchases only), customer_id (fk → customers.id, nullable; sales only, null for a cash sale), number (text), bill_date (date), due_date (date), subtotal_paise (bigint), tax_paise (bigint), total_paise (bigint), currency (text, 'INR'), status (text: draft | confirmed | rejected), payment_status (text: unpaid | partial | paid, derived; for a sale this is the udhaar state), source (text: camera | gallery | share | whatsapp | manual | chat), image_path (text, storage key), page_count (int), extraction_json (jsonb: raw fields with confidence), reader (text: gemini-2.5-flash | qwen3-vl | manual), confidence (real, minimum over key fields), duplicate_of (fk → bills.id, nullable), warnings (jsonb: no_gstin, no_number, over_40_days, over_180_days), confirmed_at, confirmed_by (fk → users.id), deleted_at (soft delete), created_at
Indexes: (shop_id, kind, bill_date desc); (shop_id, supplier_id); (shop_id, customer_id); (shop_id, due_date) where payment_status != 'paid'; (shop_id, supplier_id, number) for the duplicate check.

## Table: bill_items (created now, filled in v1.1)
id, bill_id (fk), line_no (int), description (text), hsn (text), qty (numeric), unit (text), rate_paise (bigint), amount_paise (bigint), gst_rate (numeric), batch (text), expiry (date), free_qty (numeric)

## Table: payments
id (uuid pk), shop_id (fk), bill_id (fk), direction (text: out | in; out to a supplier, in from a customer), amount_paise (bigint), paid_on (date), mode (text: cash | upi | bank | cheque | other), reference (text), note (text), created_by (fk → users.id), created_at
Index (shop_id, bill_id).

## Table: reminders
id, shop_id (fk), bill_id (fk, nullable for ca_pack), kind (text: due_soon | due_today | overdue | ca_pack), scheduled_at, sent_at, channel (text: push | whatsapp), status (text: pending | sent | failed | cancelled)
Index (status, scheduled_at).

## Table: ca_packs
id, shop_id (fk), month (text 'YYYY-MM'), bill_count (int), total_paise (bigint), pdf_path (text), xlsx_path (text), generated_at, shared_at, shared_to (text)

## Tables: conversations, messages (existing, reused)
conversations gain `shop_id` and `kind` (text: ask | tutor | companion). messages keep role and text and gain `audio_path` (text, nullable), `answer_json` (jsonb: the structured answer and the bill and supplier ids it cites), `tokens_in`, `tokens_out`, `cost_paise`.

## Table: devices
id, user_id (fk), expo_push_token (text, unique), platform (text: android | ios), app_version (text), last_seen_at

## Table: otp_codes
id, phone (text), code_hash (text), expires_at, attempts (int), consumed_at, created_at
Index (phone, created_at desc). Rows older than one day purged nightly.

## Table: audit_log
id, shop_id, user_id, action (text: bill.confirm | bill.delete | payment.add | export | login | admin.read ...), target_id, meta (jsonb), created_at

## Relationships
shops 1 to n users; shops 1 to n suppliers; shops 1 to n customers; suppliers 1 to n purchase bills; customers 1 to n sale bills; bills 1 to n payments; bills 1 to n bill_items; bills 1 to n reminders; shops 1 to n ca_packs; users 1 to n devices; bills.duplicate_of → bills.id (self).

## Auth Provider
Own: mobile number plus OTP (MSG91 SMS; WhatsApp template later). Nothing else on the app; the existing Google route stays desktop-only. FastAPI issues JWT (HS256, `JWT_SECRET`): access 30 days, refresh 180 days rotated on use. Claims: `sub` (user id), `shop` (shop id), `role`.

## Row Level Security
The app never talks to Postgres directly. All access goes through FastAPI, and every query carries `shop_id` from the JWT (the `db.py` rule). If Supabase's PostgREST is ever exposed, enable RLS on every table with `shop_id = auth.jwt() ->> 'shop'`. The service key is used only by the API server.

## User Roles
- owner: everything in own shop, including export and delete.
- staff (v1.1): capture, confirm, add payment; no export, no delete, no CA-contact edit.
- ca (v2): read bills and packs of shops that granted access; no writes.
- admin: support console; every admin read is written to audit_log.

## File Storage
Supabase Storage, private bucket `bills`: `bills/{shop_id}/{bill_id}/{page}.jpg` (downscaled to 1600 px, JPEG quality 85) plus `original.pdf` when a PDF was shared; `packs/{shop_id}/{YYYY-MM}/pack.pdf` and `pack.xlsx`; `audio/{shop_id}/{message_id}.opus`, deleted after 30 days. Signed URLs, 10-minute expiry. Bills and packs are kept 72 months minimum; deletion is soft and blocked before that.

## Sensitive Fields
phone, gstin (a proprietor's GSTIN is personal data under DPDP), ca_phone, bill images (supplier names and phones). Encrypted at rest by Supabase, TLS in transit. OTP stored as a salted hash with `OTP_PEPPER`. JWT secret and every API key only in `backend/.env`. Never store payment-instrument details. Breach process written before launch (DPDP: 72-hour notice).

## Webhooks and Event Triggers
- On bill confirmed: create reminders (due_soon at due_date minus 2 days, 09:00 IST; due_today at 09:00 IST); compute warnings; run the duplicate check.
- On payment saved: recompute payment_status; cancel pending reminders once paid.
- Nightly 02:00 IST: overdue reminders; purge old OTPs; delete audio older than 30 days.
- Monthly on the 3rd, 09:00 IST: ca_pack push for last month.
- On plan change (store receipt verified server-side): update shops.plan and plan_until.

## API Endpoints (mobile, `/api/v1`)
Auth (built 10 Sep 2026, `backend/app/otp.py`; dev mode code is always `123456` and no SMS goes out):
- `POST auth/otp/send` `{"phone": "98765 43210"}` → `200 {"ok": true, "retry_after_seconds": 30, "dev_code": "123456"}` (`dev_code` only when `APP_ENV` is not production). Errors: `400` not a 10-digit Indian mobile; `429` more than 3 codes in 15 minutes; `423` phone locked; `502` SMS provider refused.
- `POST auth/otp/verify` `{"phone": "9876543210", "code": "123456"}` → `200 {"access_token", "refresh_token", "is_new": true, "user": {"id", "phone": "+919876543210", "name": null, "role": "owner", "shop_id": null, "language": "hi", "voice_replies": 0}}`. Errors: `400` wrong code (detail says tries left) or no code requested; `410` code expired (5 minutes); `423` five wrong codes, locked 10 minutes.
- `POST auth/refresh` `{"refresh_token"}` → `200 {"access_token", "refresh_token"}`; the old refresh token is dead after this call. `401` means sign in again.
- `POST auth/logout` `{"refresh_token"}` → `200 {"ok": true}`.
- `GET auth/me` (header `Authorization: Bearer <access_token>`) → the user object above plus `"shop": {...}` once a shop exists, else no shop key. `401` when the token is missing, expired or a refresh token was sent by mistake.
- Access token lives 30 days, refresh token 180 days. Keep both in expo-secure-store. `is_new: true` or `shop_id: null` → go to `/setup/shop`; otherwise → `/(tabs)/chat`.
Shop (built 10 Sep, `backend/app/shops.py`):
- `POST shops` `{"owner_name", "name", "type": "hardware|electrical|pharmacy|kirana|other", "address", "city", "lat", "lng"}` (all optional except name; `gstin` accepted but not on the screen) → `200 {"shop": {...}, "owner_name", "access_token"}`. The new access token carries the shop claim: replace the stored one. `409` if the user already has a shop; `400` bad type, bad GSTIN check digit, or lat/lng out of range.
- `GET shops/me` → shop or `404`. `PATCH shops/me` same body as POST → shop.
- `POST shops/me/ca` (not built yet).
Bills: `POST bills/read` (built 10 Sep: multipart `file` JPG/PNG/PDF ≤ 12 MB + `source` printed|handwritten → `{fields: {supplier_name, gstin, gstin_valid, phone, buyer_name, number, date, due_date, subtotal_paise, tax_paise, total_paise, items[{description, qty, rate_paise, amount_paise}], handwritten}, confidence: {supplier, gstin, number, date, total}, warnings: [no_gstin | no_number | gstin_checksum_failed | gstin_repaired | gstin_unreadable | date_unparsed | items_do_not_add_up], reader, seconds, raw}`; not streamed, about 10 to 15 s; nothing saved; `due_date` is null unless printed on the bill, never computed; `gstin_repaired` = one look-alike character corrected by the check digit, confidence 0.8, the card should ask the owner to confirm it), POST bills (manual purchase or sale, also used by chat), POST bills/{id}/confirm (final fields), POST bills/{id}/reject, GET bills?kind=&month=&status=&supplier=&customer=, GET bills/{id}, DELETE bills/{id} (soft), GET bills/{id}/image (signed URL)
Suppliers: GET suppliers, POST suppliers, PATCH suppliers/{id}, GET suppliers/{id}/ledger
Customers: GET customers, POST customers, PATCH customers/{id}, GET customers/{id}/ledger
Sales: GET sales/summary?range=today|week|month (total, count, items, cash vs udhaar)
Payments: POST payments, DELETE payments/{id}
Dues: GET dues (overdue, today, week, later; per-supplier totals; udhaar to collect per customer)
Home: GET home (greeting data: yesterday's sales and bill count, unconfirmed bills, next due)
Ask (first version built 10 Sep, grounded 11 Sep, `backend/app/voice_api.py`): `POST ask` `{"text", "history": [{role, text}], "context": {today, people[], txns[]}, "speak": false, "language": "hi-IN"}` → `{"answer", "person_id", "audio_b64", "audio_mime"}`; `POST voice` multipart `audio` (webm/m4a/wav/mp3) + `history` (json string) + `context` (json string) → `{"transcript", "language", "answer", "person_id", "audio_b64", "audio_mime": "audio/mpeg"}`; empty transcript means silence, keep listening. `context` is the notebook on the phone (the app's own `Person` and `Txn` shapes, up to 200 transactions); the brain answers only from it, names the bill number and date, computes no due date, and says plainly when a name or figure is not there. `person_id` is the one person the answer is about, so the app can hang their card under the reply. Reply language follows the owner's script: Devanagari in, Hindi out; Hindi words in Latin letters, Hinglish; else English. The app's keyword stand-in in `api.ts ask()` is gone. When bills live in the database, `ask.py` queries them and `context` goes away. The streaming `WS /ws/voice` from the TRD is deferred; one request, one reply for now.
CA: GET ca/packs, POST ca/packs?month= (generate), GET ca/packs/{id}/files
Reminders and devices: GET reminders/upcoming, POST devices (push token)
Export: POST export (ZIP of all images plus CSV), GET export/{id}
Billing: POST billing/verify (store receipt)
Health: GET health (existing)
