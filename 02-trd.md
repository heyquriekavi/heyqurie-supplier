# 02 · TRD — Technical Requirements Document

Draft v0.1, 10 Sep 2026. Stack chosen on 10 Sep: React Native + Expo with a native audio module. The backend is the existing FastAPI in `backend/`, extended, not replaced.

## Frontend (mobile)
- React Native 0.86 (what Expo SDK 57 ships, created 10 Sep) with Expo SDK 57, TypeScript strict, Expo Router (file-based screens).
- UI: React Native core components plus our own design system (see 04). Animations: Reanimated 4. Custom drawing (Qurie avatar, waveform): React Native Skia.
- Audio: react-native-audio-api for PCM playback (same Web Audio interface the desktop code uses); custom Expo module `modules/qurie-audio` in Swift and Kotlin for microphone capture at 16 kHz, voice/silence detection and barge-in.
- Camera and files: expo-camera, expo-image-picker, expo-document-picker, expo-sharing, expo-file-system; share-into-app via expo-share-intent (Android intent, iOS share extension).
- Push: expo-notifications (Expo push service, free).
- State and data: TanStack Query for server state, Zustand for local state, MMKV for small local storage, expo-sqlite for the offline bill queue.
- Build and ship: EAS Build, EAS Submit, EAS Update (over-the-air for JavaScript-only fixes).

## Backend
- Existing FastAPI (Python 3.12) in `backend/app/`. Keep `auth.py` (JWT; the Google route stays for desktop only), `llm.py` (brain, STT), `voice.py` (TTS switch), `db.py` (owner: Divya).
- New modules: `bills.py` (capture, extraction, confirm, ledger), `suppliers.py`, `ask.py` (questions over the shop's bills), `reminders.py` (scheduler), `ca_pack.py` (PDF and XLSX), `otp.py`, `ws_voice.py`.
- Voice on mobile: one WebSocket route `/ws/voice` receives 16 kHz PCM from the phone, runs STT, brain and TTS, and streams 24 kHz PCM back. Barge-in: the client sends `stop`. The desktop routes `/api/converse` and `/api/speak` stay untouched.
- Bill extraction: one vision-model call with a fixed JSON schema and per-field confidence, then validators: GSTIN checksum, date order, totals equal to the sum of items within one rupee.
- Background jobs: APScheduler inside the API process for reminders and monthly CA packs. One instance is enough for the first thousand shops; move to a worker later.

## Database
- Production: PostgreSQL 17 on Supabase, Mumbai region (ap-south-1), project created 10 Sep; connect through the session pooler on port 5432 (direct is IPv6-only on the free plan). Local development: the same schema on SQLite when `DATABASE_URL` is empty, the existing pattern in `db.py`. One switch, no ORM. Raw SQL as today; migrations as numbered `.sql` files in `backend/migrations/` applied by a small runner. No ORM added.
- Rule that never bends (from `db.py`): every read and write is scoped by `shop_id` and `user_id`.

## Auth
- Phone number plus 6-digit OTP over SMS (MSG91, DLT-registered template), 5-minute expiry, hashed at rest, five tries then a 10-minute lock. OTP over a WhatsApp authentication template (Rs 0.115) once the WhatsApp number exists.
- Mobile OTP is the only login on the app. No Google, no email. The existing Google route serves the desktop only and is not exposed under `/api/v1`.
- Backend issues a JWT access token (30 days) and a refresh token (180 days, rotated on use), stored in expo-secure-store. Same `get_current_user` dependency; a user belongs to one shop in v1.

## Hosting
- API: Fly.io, Mumbai region (bom), one machine; two when needed. Alternative: a DigitalOcean Bangalore droplet.
- DB and object storage: Supabase Mumbai (Postgres plus a private Storage bucket `bills`).
- TTS: Cartesia during development; the artist-voice server (Chatterbox fine-tune, same shape as `E:/siya_voice/server.py`) on Modal or a rented GPU in India for release. The Siya voice never ships.
- Mobile: EAS cloud builds (no Mac needed for iOS); Google Play internal testing then production; TestFlight then App Store.

## Third-party APIs
| Service | Purpose | Tier |
|---|---|---|
| OpenRouter, Qwen 3.6 27B | brain: answers, confirmations, Hindi | paid, about Rs 0.05 per answer |
| Groq, Whisper | speech to text | paid, small |
| Google Gemini 2.5 Flash | bill reading (best measured on real Hindi print); fallback Qwen3-VL via OpenRouter | about Rs 0.11 per bill |
| Cartesia (dev), own server (prod), Sarvam (fallback) | text to speech | dev free tier; prod GPU Rs 10,000 to 35,000 a month depending on always-on or on-demand |
| MSG91 | OTP SMS | about Rs 0.20 per SMS |
| Expo push | reminders | free |
| Supabase | Postgres and Storage | free tier, then about Rs 2,400 a month |
| Fly.io | API hosting | Rs 500 to 1,500 a month |
| Sentry | crash and error reports | free tier |
| Meta WhatsApp Cloud API via Interakt or AiSensy | v1.1: intake, OTP, reminders | Rs 1,499 a month plus per message |

## Key Libraries
Mobile: expo-router, react-native-reanimated, @shopify/react-native-skia, react-native-audio-api, expo-camera, expo-image-picker, expo-document-picker, expo-share-intent, expo-notifications, expo-secure-store, react-native-mmkv, expo-sqlite, @tanstack/react-query, zustand, zod, i18next, date-fns, react-native-pdf, sentry-expo.
Backend: fastapi, uvicorn, httpx, pydantic, pyjwt, google-auth, openai (OpenRouter client), groq, google-genai, reportlab (CA PDF), openpyxl (CA sheet), apscheduler, pillow, psycopg.

## Folder Structure
```
app/                         mobile app (Expo project root) and these six documents
  app/                       Expo Router screens: (auth)/, (tabs)/, bill/[id].tsx, supplier/[id].tsx ...
  src/components/            design system: Button, Amount, BillCard, ConfirmSheet, MicButton ...
  src/features/              bills/, suppliers/, dues/, ask/, ca/, auth/ (hooks, api, types per feature)
  src/lib/                   api client, auth store, i18n, audio player, formatters
  src/theme/                 tokens from 04-design-brief.md
  modules/qurie-audio/       native Expo module (Swift, Kotlin): mic capture, VAD, barge-in
  assets/                    fonts (Noto Sans, Noto Sans Devanagari), icons, avatar
backend/app/                 existing FastAPI plus bills.py, suppliers.py, ask.py, reminders.py, ca_pack.py, otp.py, ws_voice.py
backend/migrations/          001_shops.sql, 002_bills.sql ...
```
Naming: screens and components PascalCase; hooks `useX`; mobile API routes under `/api/v1/` (desktop routes untouched); SQL tables snake_case plural; money stored in paise as integers.

## Environment Variables (names only)
Backend, in `backend/.env`, never committed. Existing: `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `SARVAM_API_KEY`, `CARTESIA_API_KEY`, `GOOGLE_CLIENT_IDS`, `JWT_SECRET`, `ADMIN_ACCESS_KEY`, `LLM_PROVIDER`, `TTS_PROVIDER`, `TTS_VOICE`, `LOCAL_TTS_URL`, `LOCAL_TTS_TOKEN`. New: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `STORAGE_BUCKET`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `OTP_PEPPER`, `EXPO_ACCESS_TOKEN`, `SENTRY_DSN`, `BILL_READER` (gemini or qwen), `APP_ENV`.
Mobile, public, in `app/.env` and EAS secrets: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN`. Never a model or server key inside the app binary.

## Constraints
- HARD PRODUCT RULE: Qurie, the model, never gets system or filesystem access, on the phone or on the server. It sees only the single photo or file the owner picks or shares, plus text and voice. No gallery scanning, no background capture.
- Secrets live only in `backend/.env`; never printed, never in the app.
- Siya-voice models are development only; release uses a hired artist's voice.
- Bills are kept 72 months (GST section 36); delete is soft delete; export is always available.
- Hindi and Hinglish first: every string goes through i18n; amounts in Indian grouping (12,480 and 1,24,800).
- Runs on Android 10+ and iOS 16+; must stay smooth on a Rs 10,000 Android phone: no heavy JavaScript on scroll, images downscaled to 1600 px before upload.
- Token budget: quote the cost before any batch over about 20 model calls; measure before asserting.
- Commits: no Co-Authored-By trailer; commit only when Devansh asks; `memory/` is never committed.
