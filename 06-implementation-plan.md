# 06 · Implementation Plan — Step-by-Step Build Sequence

Draft v0.1, 10 Sep 2026. Each phase ends with a "done" check that is run, not assumed. Any model-call batch over about 20 calls is costed before it runs.

## Phase 0: Measure before building (2 days)
- Collect 20 real bills: 10 printed (PDF or clear photo) and 10 handwritten, from one hardware shop and one pharmacy.
- Script `backend/tools/bill_reader_test.py`: run each bill through Sarvam Vision, Gemini 3.5 Flash and Mistral OCR 3 (Qwen3-VL via OpenRouter as a fourth if cheap) with the fixed JSON schema; score seller, number, date, total and GSTIN against a hand-typed answer sheet. About 60 calls, under Rs 30.
- Done: a table of field accuracy per reader per bill type, and a recorded decision on which readers to use and whether handwritten ships in v1.
- **Result (11 Sep):** answer key `backend/tools/bills/truth.json` (20 bills read by eye), scorer `backend/tools/score_readers.py` (runs each reader's raw fields through `bills.shape()`, so repairs count; "invented" = a value the bill does not carry). Fields scored: supplier, GSTIN, number, date, due date, total, item count, buyer; 153 checks.

  | Reader | Right | Invented | Misses left |
  |---|---|---|---|
  | Sarvam extract, raw | 146/153 | 1 | Starbucks and Quorum GSTINs, "INPUT HERE" kept as a GSTIN, khata items 0/8, handwritten name, two faint numbers |
  | Sarvam + our repairs | 148/153 | 0 | Quorum GSTIN (3 characters wrong; the PAN printed under it would fix it), khata items, handwritten name, two faint numbers |
  | Gemini 3.5 Flash | 147/153 | 3 | invents a khata total that is not written, invents buyers on the Kumar invoices, drops a digit of the WeWork number |

  Our repairs (no LLM): GSTIN look-alike swap fixed by the check digit (`gstin_repair`, only a single passing candidate is accepted, flagged `gstin_repaired`, confidence 0.8); a GSTIN that is not 15 characters is dropped with `gstin_unreadable`; a time printed before the date parses. Rule kept everywhere: nothing on the card that is not on the bill (the 21-day due-date fill is gone from server and app). Next: the brain pass (digitised text + fields + warnings → LLM fixes and cross-checks, e.g. PAN vs GSTIN, and writes the questions to ask), measured with the same scorer.

## Phase 1: Setup (2 days)
- `app/`: create the Expo project (SDK 57, TypeScript, Expo Router); folders per the TRD; fonts; ESLint and Prettier; `.env` with `EXPO_PUBLIC_API_URL`; EAS project; Android dev build running on Devansh's phone; iOS dev build via EAS cloud.
- Backend: `backend/migrations/` runner; `/api/v1` router mounted; Sentry; Fly.io app in Mumbai with `DATABASE_URL` pointing at Supabase Mumbai; health check green from the phone.
- Done: the app on a real Android phone shows the welcome screen and reads `GET /api/health` from Fly.

## Phase 2: Database (2 days)
- Migrations 001 to 006 for shops, suppliers, customers, bills (with kind), bill_items, payments (with direction), reminders, ca_packs, devices, otp_codes, audit_log; alter users, conversations, messages.
- Seed script: one shop, 3 suppliers, 3 customers, 12 purchase bills, 8 sales (3 on udhaar), 4 payments out, 2 payments in.
- Done: migrations apply cleanly on SQLite and Postgres; seed data visible through a temporary `GET /api/v1/bills`.

## Phase 3: Auth (3 days) — backend and login screens done 10 Sep; setup/ca, setup/permissions and the device check remain
- OTP send and verify with MSG91 (dev mode: fixed code, no SMS), hashing, lockout; JWT access and refresh; `get_current_user` reads the `shop` claim. No Google or email path on the app.
- App: welcome, phone, otp, setup/shop, setup/ca, setup/permissions; secure-store tokens; silent refresh; logout.
- Done: a new user reaches Chat with a shop row created; kill and reopen keeps the session; five wrong OTPs lock.

## Phase 4: Capture and read (5 days)
- App: camera modal, gallery, document picker, share intent (Android and iOS extension), image downscale, upload with progress, offline queue.
- Backend: `bills.py` read endpoint: store the image, call the reader with the schema, validators (GSTIN checksum, date order, totals), confidence per field, supplier match (normalized name or GSTIN), duplicate check, warnings; returns a draft bill.
- App: chat home with the three tabs (Chat, People, More), greeting card, "+" menu; review sheet with confidence colours, one-at-a-time questions for red fields, "Sahi hai?" → confirm endpoint; bill detail; bills list with chips and the month header under More.
- Done: 10 of the Phase-0 printed bills go camera → confirmed in under 60 seconds each on a real phone; a re-shot duplicate is flagged.

## Phase 5: People, sales, udhaar, dues, payments (5 days)
- People tab with Suppliers and Customers lists (avatar, phone, due/paid pill); supplier and customer ledgers with the Total / Paid / Outstanding card and dated history; sale sheet (cash or udhaar); payment sheet in both directions; dues screen; sales report; payment_status recompute; audit log.
- Done: marking a bill paid drops it from dues; a udhaar sale shows on the customer with a red pill and turns green after payment; ledger and sales totals match a hand calculation on the seed data.

## Phase 6: Ask Qurie (5 days)
- Backend `ask.py`: question → intent and a fixed set of SQL queries over the shop's bills (dues by supplier, due tomorrow, month total, kitna diya, yesterday's sales, udhaar by customer, duplicate check) → Hindi or English answer with citations and summary cards; SSE. Chat actions: "Ramesh ko 2,400 ka udhaar" creates a sale after a confirm card; "kal yaad dilana" creates a reminder. Morning greeting from `GET home`. Guardrail: only the shop's own rows; the model never writes SQL.
- Voice: `/ws/voice` (PCM in → Groq Whisper → ask → TTS → PCM out); native module `qurie-audio` (mic at 16 kHz, VAD, barge-in) in Swift and Kotlin; playback via react-native-audio-api; waveform in Skia.
- App: ask tab, chat, mic, answer cards with "Dekho" links, voice on/off.
- Done: 20 scripted Hindi, Hinglish and English questions on the seed data answered correctly, checked by hand; a sale and a reminder created from chat; voice round trip under 2.5 s to first sound on Android over mobile data; barge-in stops playback within 300 ms.

## Phase 7: Reminders and CA pack (3 days)
- APScheduler jobs; Expo push; deep links; monthly ca_pack nudge.
- `ca_pack.py`: PDF (cover sheet plus one page per bill image, reportlab) and XLSX (one row per bill, openpyxl); share sheet to the saved CA contact; history.
- Done: a bill due in two days produces a push on a real phone at 09:00 IST; a month pack opens in WhatsApp with the CA contact preselected; the XLSX opens in Excel with correct totals.

## Phase 8: UI polish (4 days)
- Empty, loading and error states for every screen; Hindi strings reviewed by a native speaker; dark-mode pass; font scaling to 130 percent; coach marks; avatar and personality lines; export ZIP; subscription screen (trial logic only; payment can be manual for the first 20 shops).
- Done: a checklist walk through every screen in both languages and both themes on a 720 px Android and an iPhone; no clipped amounts.

## Phase 9: Testing and hardening (4 days)
- Backend tests: reader validators, duplicate logic, dues maths, OTP lockout, shop scoping (a user can never read another shop's bill).
- Device tests: five phones (two under Rs 10,000), airplane-mode capture, slow 4G, share intent from WhatsApp, permission denials.
- Security: rate limits on OTP and read; signed URLs; secrets audit; DPDP notice text; breach process document.
- Done: all tests green; the "other shop" test fails closed; crash-free sessions on five phones.

## Phase 10: Deploy (3 days)
- Fly.io production app and Supabase production project; env vars set; backups on; Sentry alerts.
- EAS production builds; Play Console internal testing, then closed testing with the first 10 shops; TestFlight; store listings in Hindi and English with the permission explanations (mic, camera).
- Done: installable from Play internal testing and TestFlight; first 10 shops onboarded; monitoring shows bills confirmed per day.

## Done Criteria (v1)
- All five core journeys (first bill, ask by voice, month to CA, sale on udhaar, reminder to paid) work end to end on Android and iPhone against the production backend.
- Phase-0 accuracy targets met for whatever bill types v1 claims.
- 20 shops using it, at least 10 paying; no shop can see another's data; every bill exportable.
- Build estimate: about 38 working days for two people, ahead of the 90-day sales window.
