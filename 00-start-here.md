# 00 · Start here — handoff for a new chat

Read this first, then the six documents in order. Written 10 Sep 2026.

## What we are building
A mobile app named **Qurie** (final name later) for GST-registered hardware, electrical and pharmacy shops in India. The owner photographs or shares a supplier bill, Qurie reads it, asks "Sahi hai?", keeps the supplier ledger, records sales and customer udhaar, answers Hindi or English questions by voice or text, reminds before due dates, and sends the month's bills to the CA in one tap. Qurie is the voice assistant inside the app. This is NOT the tutor and NOT the desktop companion.

## Decisions already made (do not reopen)
- Mobile app, not WhatsApp-only. Stack: React Native 0.87 + Expo SDK 57, TypeScript, Expo Router, native Swift/Kotlin Expo module for audio. Details in `02-trd.md`.
- Login: mobile number + OTP only. No Google, no email on the app.
- Backend: the existing FastAPI in `backend/` is extended, not replaced. Postgres on Supabase Mumbai in production, SQLite locally.
- First customers: GST-registered hardware, electrical and pharmacy shops. Kiranas later, free tier.
- Phase 0 before any code: measure reading accuracy on 20 real bills (see `06-implementation-plan.md`). Readers to test: Sarvam Vision first, Gemini 3.5 Flash second, Mistral OCR 3 third (web research, 10 Sep).
- Layout (10 Sep, from a mockup Devansh shared): chat with Qurie is the home screen; three bottom tabs Chat · People · More; People has Suppliers and Customers tabs. A centre Qurie button and more tabs come in later builds.
- Scope additions (10 Sep): sales bills and customer udhaar are in v1. Inventory, GST filing, payments processing stay out.

## Read in this order
1. `app/01-prd.md` — what and for whom
2. `app/02-trd.md` — stack, hosting, services, folder layout, env variable names, constraints
3. `app/03-app-flow.md` — every screen and journey
4. `app/04-design-brief.md` — colours, type, components
5. `app/05-backend-schema.md` — tables, auth, storage, API list
6. `app/06-implementation-plan.md` — phases with done checks

## The existing backend the app must reuse (`backend/app/`)
- `main.py` — FastAPI app, desktop routes (`/api/chat`, `/api/converse`, `/api/speak`, `/api/transcribe`, `/api/upload`). Mobile routes go under a new `/api/v1` router; desktop routes stay untouched.
- `auth.py` — JWT issue/verify, `get_current_user` dependency (reuse it; add the `shop` claim). Google and admin routes are desktop-only.
- `db.py` — SQLite schema and queries. Owner: Divya. Rule that never bends: every read/write is scoped by `user_id` (and now `shop_id`). Same SQL runs on Postgres at deploy.
- `llm.py` — the brain (OpenRouter, Qwen 3.6 27B) and speech-to-text (`transcribe`, Groq Whisper).
- `voice.py` — text-to-speech switch: `TTS_PROVIDER` = cartesia | sarvam | local; `stream(text)` yields raw 24 kHz PCM; local server with Cartesia fallback (uncommitted change + `backend/test_voice.py`).
- `companion.py`, `tutor.py`, `study.py`, `papers.py`, `ingest.py`, `agent.py` — desktop features; not used by the app.
- `backend/.env` — all secrets. Never print values. Variable names are listed in `02-trd.md`.
- `backend/requirements.txt`, tests `backend/test_*.py`, run with `backend/.venv/Scripts/python.exe`.

## Other folders
- `frontend/` — the Electron desktop app. Not reused for mobile, but its Web Audio playback logic (sentence-by-sentence PCM streaming, barge-in) is the reference for the phone's audio.
- `E:/siya_voice/` — outside the repo. Voice dataset, training and serving notebooks, `server.py`. Development voice only; a hired artist's voice replaces it before release.
- `memory/` at repo root — old, untracked, never committed. The live memory is in Claude's own memory directory.

## Rules that always apply
- HARD PRODUCT RULE: Qurie (the model) never gets system or filesystem access, on phone or server. It sees only the single photo/file the owner picks, plus text and voice.
- Secrets only in `backend/.env`; never echo keys.
- Commit only when Devansh asks; no `Co-Authored-By` trailer; never commit `memory/`.
- Quote the cost before any batch over about 20 model calls; measure before asserting.
- Explain first, build stepwise, easy English.

## State on 10 Sep 2026
- `app/` holds only these documents; no Expo project yet.
- Uncommitted: `backend/app/voice.py` (local TTS + fallback), `backend/test_voice.py`, `app/`.
- Waiting on Devansh: 20 real bills (10 printed, 10 handwritten) for Phase 0.
- Research reports (artifacts): Bill Bhejo https://claude.ai/code/artifact/1d653175-a840-4b2d-98c1-168aea16f293 ; SME report https://claude.ai/code/artifact/7e833897-c442-4de3-a3de-cf9b59d954a5

## Built so far (10 Sep 2026)
- Phase 0 reader test: `backend/tools/bill_reader_test.py`, 20 bills in `backend/tools/bills/`, dashboard artifact https://claude.ai/code/artifact/b9772c5b-7844-4e09-adba-f964a610831e . Sarvam reads printed and thermal bills well; its confidence score is meaningless (always ~1.0), so validators decide what to ask the owner; GSTIN checksum caught every misread. Gemini 3.5 Flash run on the same 20 (`--gemini`, dashboard column beside Sarvam): reads the faint and blurry GSTINs correctly where Sarvam failed both, reads handwritten names (Aman) and mess-bill number, reads the khata ledger lines as 8 items, but is twice as slow (16.8 s avg vs 7.8 s), hit the free-tier quota at call 19, and is not Indian-hosted. Verdict: Sarvam stays primary, Gemini as the fallback when our GSTIN checksum fails or a key field is missing.
- Mobile OTP login: `backend/migrations/001_mobile_auth.sql` (shops, users rebuilt with phone/role/shop_id/language, otp_codes, refresh_tokens, audit_log), runner `backend/app/migrate.py` (runs at API start), routes `backend/app/otp.py` under `/api/v1/auth`, SMS `backend/app/sms.py` (MSG91; dev mode prints the code), test `backend/test_otp.py`. Exact request/response shapes are in `05-backend-schema.md`. MSG91 auth key is in `.env`; template id and DLT are pending, so `APP_ENV=dev` and the code is 123456.
- Shop setup: `backend/app/shops.py` (`POST /api/v1/shops` creates the shop, links the user, returns a new access token with the shop claim; `GET/PATCH /api/v1/shops/me`; GSTIN check digit validated).
- The Expo project in `app/` is Divya's (commit ab9b8be, 10 Sep evening, folder renamed from `APP` to `app`): SDK 57, Expo Router with routes under `app/src/app/`, path alias `@/`, Noto Sans via expo-google-fonts, Reanimated + gesture handler, zustand, Ionicons, `PhoneFrame` for browser preview. Her screens: home (`index.tsx`: greeting, bell, "at a glance" tiles, Qurie as a draggable sheet), `people.tsx`, `supplier/[id]`, `customer/[id]`, `profile.tsx`. They read mock data through `src/lib/api.ts`; each function names the `/api/v1` route it becomes. Her look comes from `app/home-reference.png` (ink, lime, forest) and is now the app's look; `04-design-brief.md` colours are superseded by `src/theme/tokens.ts`.
- Divya's second commit a325e99 (10 Sep 20:19) is merged in too: bill flow in the chat (printed bill matched by GSTIN shown as a confirm card with a confidence dot per field; handwritten bill makes Qurie ask supplier chips, date, amount; nothing saved until "Sahi hai"), `AddSheet.tsx` behind the plus button (camera, sample bills, photos, files, supplier contact, sale and payment placeholders; expo-image-picker and expo-document-picker), `BillCards.tsx`, statuses due red / confirmed green / paid blue, richer people rows, plus/typing/mic expand the sheet to full screen. Her `appState.ts` now holds people, txns, drafts and the confirm flow; our voice additions (`voiceOpen`, `addMessages`) sit inside it. Her b702a70 (20:28) redraws the Add sheet as an in-app overlay owned by the home screen (`addSheetOpen` in appState) instead of a system modal; merged the same way.
- Devansh's login was merged into it on 10 Sep night: `src/app/(auth)/welcome|phone|otp|setup-shop.tsx` restyled with her tokens (`src/components/Form.tsx`: FormScreen, Button ink+lime, Field, Chip, ErrorText), `src/lib/http.ts` (real fetch, token refresh), `src/lib/session.tsx` (user, tokens in secure store, language bridged into her `appState`), `src/lib/storage.ts`, `src/lib/strings.ts` (Hindi/English). Root `_layout.tsx` wraps everything in `SessionProvider` + `AuthGate` (signed out → welcome; no shop → setup; else home). Home shows the real shop name; profile Log out and Language work. Not done: setup/ca, permissions screen, dark mode, Hindi for her screens.
- Run it: `cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`, then `cd app && npx expo start` (press `w` for the browser, or scan the QR with Expo Go on a phone on the same Wi-Fi). `app/.env` (git-ignored) holds `EXPO_PUBLIC_API_URL=http://<PC Wi-Fi IP>:8000`. Dev OTP is always 123456.
- Supabase (10 Sep): project `qurie`, Mumbai, Postgres 17, private bucket `bills`. `backend/app/db.py` opens Supabase when `DATABASE_URL` is set and SQLite when it is empty; the same SQL runs on both (a few spellings are translated in `db.pg_sql`). Supabase holds only the billing app's tables (users, shops, otp_codes, refresh_tokens, audit_log); the desktop schema in `db.py` is never created there. Migrations apply on both; `001_mobile_auth.pg.sql` is the Postgres form of 001 and creates users directly. `test_otp.py` runs on SQLite by default and on Supabase with `QURIE_TEST_PG=1` (all 7 pass there; `--clean-pg` removes its rows). The desktop tutor/companion queries still use SQLite-only SQL and work only with `DATABASE_URL` empty.
- Voice mode (10 Sep night): tap the mic in Divya's composer → voice mode inside the chat sheet, like Claude's app: `app/src/components/VoiceMode.tsx` (`EdgeGlow`: lime gradient bands on the four screen edges, sides strongest, that breathe always, shimmer while thinking and swell with sound, the owner's mic level while listening and Qurie's playback level while speaking; `VoiceLayer` lightly dims the messages; `VoiceBar` replaces the composer with bill · status pill · close, the close button where the mic was). No orb, no icon: Devansh rejected both. Hook is called in `QurieSheet.tsx`. Loop in `app/src/lib/voice.ts`: record until the owner has spoken and gone quiet 1.1 s (expo-audio metering on phones, MediaRecorder + AnalyserNode in the browser) → `POST /api/v1/voice` (multipart clip + last 8 messages) → Sarvam Saaras hears, the brain answers as Qurie (female, Hindi/Hinglish/English matching the owner), Sarvam Bulbul speaks (mp3 base64) → play → listen again. No interruption: mic is off while she speaks. Both turns land in the chat sheet. Backend `backend/app/voice_api.py` (+ `POST /api/v1/ask` for typed questions), test `backend/test_voice_api.py` (3 checks, real Sarvam and brain calls). Qurie cannot see bills yet and says so; `ask.py` over real data replaces `think()` later.
- Bill reading (10 Sep late): plus → "Printed bill" or "Handwritten bill" → device file chooser (JPG/PNG/PDF; camera and All photos read as printed) → `POST /api/v1/bills/read` (`backend/app/bills.py`: Sarvam extract with `tools/bill_schema.json`, then our validators: GSTIN check digit, date parsing to ISO, items-add-up-to-total; confidence is ours, not Sarvam's) → her `readBill()` in `src/lib/api.ts` maps it to `DraftFields` and matches the supplier on the phone by GSTIN then normalised name → her existing confirm card (now with Tax and Items rows) and "Sahi hai?" flow, unchanged. Nothing is saved on the server yet (no bills tables); the draft lives in her appState. Measured: one printed receipt read in 13.8 s; test `backend/test_bills.py`.
- Divya builds the app screens from these documents; Devansh builds the backend.

## Next step
Phase 0: write `backend/tools/bill_reader_test.py` and run it on the 20 bills; then Phase 1 setup of the Expo project inside `app/`.
