# Qurie Supplier

The distributor's side of Qurie: take an order, file the invoice your billing
software made, record what came in, and ask about any of it. Separate from the
retail app in every way that matters — its own database, its own login, its own
port.

White ground, forest green and lime. English in v1; the Hindi and Tamil strings
are written and switch on together.

## Run it

Two processes. The backend first:

```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # fill in the keys, see below
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Then the app:

```sh
npm install
cp .env.example .env          # point EXPO_PUBLIC_API_URL at the backend
npx expo start
```

Sign in with any Indian mobile number. With `APP_ENV=dev` no SMS is sent and
the code is always `123456`.

## What it does

**Orders.** "Balaji ka order: 20 Havells fan, 5 box Finolex wire", or the plus
button. Lines are matched against the item list; every field on the card can be
corrected, lines added or dropped, before it goes to billing. Qurie does not
raise the invoice — Marg or Tally does.

**Invoices.** Photograph or attach what billing produced. It is read, matched to
the order it came from, filed under the right shop, and the due date set from
their credit days. Tax is read as printed: CGST and SGST separately, or IGST,
with HSN, batch, expiry and MRP per line. Everything is editable before saving.

**Collections.** "Balaji paid 13838 UPI", or the plus button. A card shows the
shop, the amount and how it came in. Nothing is written until you confirm it.

**Ask Qurie.** Dues either way, a shop's balance, what was billed in a period,
which bills carry a product or batch. Typed or spoken.

**People.** Shops and brands, each with transactions, bills and details.

## How the answering works

Not vector search. A question is routed to one of ten intents, that intent runs
SQL written by hand, and the rows are phrased into a sentence. The model never
writes SQL, never sees a whole table, and never sees another shop's rows —
every query is scoped by the `shop_id` on the token. Off-topic questions are
refused without touching the database. See `backend/app/ask.py`.

## Keys

All of them live in `.env` files, which git ignores. `backend/.env.example` and
`.env.example` list what each one is for. The short version:

| Key | For |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres. Empty falls back to a local SQLite file. |
| `JWT_SECRET`, `OTP_PEPPER` | Signing the session token and salting stored OTP codes. |
| `OPENROUTER_API_KEY` | The brain behind Ask Qurie. |
| `SARVAM_API_KEY` | Reading bills, and speech in and out. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Where bill photos are kept. Empty stores them locally. |

`EXPO_PUBLIC_` variables are baked into any build, so never put a key there
that you would not ship inside the app.

## Layout

```
src/app/          screens, file-based routes
src/components/   cards, rows, the chat sheet
src/lib/          appState.ts holds every flow; api.ts and server.ts talk to the backend
src/theme/        colours and spacing
backend/app/      FastAPI: auth, ledger, bills, voice, ask
backend/migrations/  applied at start, Postgres and SQLite alike
```
