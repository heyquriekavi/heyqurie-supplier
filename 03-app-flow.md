# 03 · App Flow — Navigation & User Journey Map

Draft v0.1, 10 Sep 2026.

## Pages List
Auth
- `/welcome`: language pick (हिंदी / English), one line on what Qurie does, "Shuru karein".
- `/phone`: mobile number. Then `/otp`: 6-digit code (auto-read on Android), resend after 30 seconds. The only way in.
- `/setup/shop` (built 10 Sep as `app/app/(auth)/setup-shop.tsx`): owner name, shop name, type (hardware / electrical / pharmacy / other), address, and a "fill address from current location" button (expo-location, reverse geocoded; saves lat/lng too). GSTIN removed from this screen for now; it stays in the shops table and comes back on the Shop page in More before the CA pack.
- `/setup/ca`: CA name and WhatsApp number (optional, "baad mein" allowed).
- `/setup/permissions`: camera, microphone, notifications, each with one Hindi line on why.

Main (bottom tabs, three for now; more tabs and a centre Qurie button come in later builds)
- `/(tabs)/chat`: Home. Header: menu, shop name with dropdown (city under it), People shortcut. Chat with Qurie: morning greeting card (yesterday's sales, bill count), summary cards (Sales / Bills / Items), outstanding-payment cards with "View Details", reminders set by chat. Bottom: "+" (bill photo, sale, payment), text field "Qurie ko likho...", mic.
- `/(tabs)/people`: two tabs, Suppliers and Customers. Each row: initial avatar, name, phone, status pill on the right (red "₹13,838 due" or green "Paid"). Search and "+" in the header.
- `/(tabs)/more`: Bills list, Dues, CA pack, Sales report, Shop, CA contact, language (English / हिंदी), voice on/off, subscription, export all data, help, logout.

Screens reached from More (former tabs, same content)
- `/bills`: month header with total and count, bills newest first, filter chips (All / Unconfirmed / Unpaid / Paid), "+ Bill".
- `/dues`: Overdue, Today, This week, Later; per-supplier totals; a second section for udhaar to collect, per customer.
- `/ca`: CA pack. Month picker, what will be sent (count, total), "CA ko bhejo", history of sent packs.
- `/sales`: today, this week, this month; cash vs udhaar split; list of sales.

Stack screens
- `/bill/new`: capture. Camera by default, gallery, file; multi-page for PDFs.
- `/bill/review`: "Sahi hai?" sheet. Fields with confidence colours, editable inline; low-confidence fields asked one by one; Save or Reject.
- `/bill/[id]`: bill detail. Image, fields, payments, warnings, "yeh bill pehle aaya tha" banner when a duplicate; actions Mark paid, Part paid, Share, Delete (soft).
- `/supplier/[id]`: supplier ledger. Total due, credit days, bills, payments; edit supplier.
- `/supplier/[id]`, layout from the mockup: header with avatar, name, phone, call and menu icons; tabs Transactions and Details; a three-column card Total Purchases / Paid (green) / Outstanding (red); dated history mixing purchase bills (number, item count, amount, Paid or Outstanding pill) and payments (mode, reference).
- `/supplier/new`: add a supplier by hand.
- `/customer/[id]`: same layout as the supplier screen with Total Sales / Received / Udhaar due.
- `/customer/new`: add a customer by hand.
- `/sale/new`: customer (optional for cash), amount, items (optional), cash or udhaar, note. Also creatable by telling Qurie "Ramesh ko 2,400 ka udhaar".
- `/payment/new?bill=` or `?customer=`: amount, date, mode (cash / UPI / bank / cheque), note. Money out to a supplier or money in from a customer.
- `/subscription`: plans (Rs 299 / Rs 499), trial state, restore.
- `/export`: progress, then share of the ZIP.

## Navigation Type
Bottom tabs, three: Chat · People · More. Stack screens push over the tabs with a back arrow. Capture opens as a full-screen modal from the "+" in chat, from `/bills`, and from the share intent. Later builds add a raised centre Qurie button and more tabs; nothing in the screen list changes when they do.

## First Screen
Brand-new visitor: `/welcome` with the language pick. Returning, logged-in user: `/(tabs)/chat` with the morning greeting. Returning user with an unconfirmed bill: the greeting includes "2 bill confirm karne hain" with a link to `/bills?status=unconfirmed`.

## Auth Flow
welcome → phone → otp → (new user) setup/shop → setup/ca → setup/permissions → chat (three-step first-bill coach mark)
welcome → phone → otp → (existing user) chat
Token refresh is silent; on refresh failure → phone with "Dobara login karein".

## Core User Journey 1: first bill
Owner opens the app → chat (greeting: "Pehla bill add karo") → "+" → Bill photo → camera → shoots → review sheet fills in seller, number, date, due date, total with confidence colours → total is low confidence → Qurie asks "Yeh 12,480 hai ya 12,430?" with two buttons → owner taps → "Sahi hai?" → "Haan" → toast "Sharma Traders, Rs 12,480, due 27 Sep. Supplier ban gaya." → chat shows a bill card; People shows Sharma Traders with a red "₹12,480 due" pill.

Rules fixed on 11 Sep after the first live upload: the supplier name printed on the bill is used as is (matched to the list by GSTIN, then by name, else added as a new supplier with the bill's phone and GSTIN); Qurie asks "kis supplier ka hai?" only when no name was read, and "Change supplier" on the card fixes a wrong one. The bill photo in the chat is tappable and opens full screen. While Qurie reads or thinks, the bubble shows three moving dots, not a static ellipsis. Nothing appears on the card that is not on the bill: no computed due date.
Share-intent variant: owner is in WhatsApp → long-press the PDF → Share → Qurie → app opens directly at `/bill/review`.

## Core User Journey 2: ask by voice
Owner at the counter → taps the mic in the chat field → says "Sharma ko kitna dena hai" → waveform while listening → transcript shown → answer card: "Sharma Traders: Rs 31,200 baaki, 2 bill, agla due 27 Sep" with a "View Details" link to the supplier → if voice is on, Qurie speaks the same line; tapping the mic again interrupts her (barge-in).

## Core User Journey 3: month to CA
On the 3rd, a push: "August ke 46 bill CA ko bhejein?" → tap → `/ca` with August selected → 46 bills, Rs 3,12,000, 2 unconfirmed (link to fix) → "CA ko bhejo" → PDF and Excel generated → WhatsApp share sheet with the saved CA contact → history row "Sent 3 Sep, 46 bills".

## Core User Journey 4: sale on udhaar
Customer takes goods on credit → owner says "Ramesh ko 2,400 ka udhaar" or taps "+" → Sale → confirm card "Ramesh, ₹2,400, udhaar. Sahi hai?" → "Haan" → People → Customers shows Ramesh with a red "₹2,400 due" pill → a week later Ramesh pays → payment sheet → green "Paid".

## Core User Journey 5: reminder to paid
Push two days before: "Sharma Traders Rs 12,480, 27 Sep ko due" → tap → `/bill/[id]` → "Paid" → payment sheet with the amount prefilled → save → dues drop; supplier ledger updated.

## Empty States
- Chat: Qurie's first message with three chips: Pehla bill add karo, Sale likho, Sawaal poocho; one line about sharing from WhatsApp.
- Bills: drawing of a bill with a camera; "Pehla bill add karo" button.
- Customers: "Koi udhaar nahi".
- Dues: "Koi bakaya nahi" with a tick.
- CA: "Pehle CA ka number save karo" if no contact; else "Is mahine koi bill nahi".
- Supplier ledger with no bills: "Is supplier ka koi bill nahi".

## Error States
- No network on capture: the photo is kept in a local queue; banner "Internet aane par padh lungi"; automatic retry.
- Reader fails or exceeds 20 s: the review sheet opens with empty fields and "Khud bhar do ya dobara photo lo".
- Image unreadable (blur, dark): "Photo thoda paas se, roshni mein lo" with retake.
- Wrong OTP five times: 10-minute lock with a countdown.
- Subscription failure: stay on `/subscription`, show the store's message; no feature lock during the trial.
- Mic permission denied: the mic button opens the settings deep link; text input still works.
- Server error anywhere: inline "Kuch gadbad hui, phir try karo" with retry; never a blank screen.

## Loading States
Skeleton rows on lists. On review, fields fill in as the reader streams. On ask, typing dots then streamed text. Voice shows the waveform.

## Modals and Sheets
Review sheet (bottom, full height), payment sheet, confirm delete, permission explainers, system share sheet.

## Redirects
- After OTP: new user → setup/shop; existing user → chat.
- After setup/permissions → chat with coach marks.
- After Save on review → bill/[id]; back returns to where capture started (chat or bills).
- After a share intent completes → chat.
- After logout → welcome (local queue cleared only after sync).
- Deep links from pushes: `qurie://bill/{id}`, `qurie://ca?month=YYYY-MM`.
