# Qurie Supplier

The distributor's side of Qurie. Same Expo project shape as `../app` (SDK 57,
Expo Router, Noto Sans, Reanimated, zustand), same components, the palette
reversed: dark ground, off-white ink, lime and forest kept.

## Run it

```sh
npm install
npx expo start
```

Backend: the same FastAPI on port 8000 (`cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000`).
Login is phone + dev OTP 123456. Orders, collections and invoice matching run on the phone
against seed data until the supplier routes exist.

## v1 shape (11 Sep 2026)

Qurie is the agent. Everything is spoken or typed to her, shown as a card, and done after "Sahi hai".

- **Take an order**: "Balaji ka order: 20 Havells fan, 5 box Finolex wire" or plus → Take an order.
  Lines are matched to the item list (`src/lib/mock.ts` items, `src/lib/orders.ts` parser). Confirmed
  orders go to billing as a sheet; Qurie does not make the invoice in v1 (Marg or Tally does).
- **Invoice from Marg / Tally**: plus → Invoice from Marg / Tally (or the sample tile). Qurie matches it to
  the latest sent order, files it under the shop, sets the due date from credit days, and sends it into
  the shop's Qurie app if paired, else WhatsApp PDF with an invite.
- **Record a collection**: "Balaji ne 13838 UPI diye" or plus → Record a collection. Both ledgers update.
- **Shops and Brands** under People. Shops carry a beat and an On Qurie flag. Due red, confirmed green, paid blue.
- **Brand bills** use the shop app's reader unchanged (needs the backend key).

Folder: `src/app` routes · `src/components` (OrderCards.tsx is new) · `src/lib` (appState.ts holds the flows) · `src/theme/tokens.ts`.
