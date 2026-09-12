# 01 · PRD — Product Requirements Document

Draft v0.1, 10 Sep 2026. Written from the Bill Bhejo research (9 Sep) and the mobile-app decision (10 Sep). Devansh corrects this; nothing here is final until he says so.

**Confirmed by Devansh, 10 Sep:** the app is the supplier-bill product for shops with Qurie (the voice assistant) inside it, not the tutor; the app is named Qurie (final name decided later); login is mobile OTP only; first customers are GST-registered hardware, electrical and pharmacy shops. Later on 10 Sep, from a mockup: chat is the home screen with three tabs (Chat, People, More); sales bills and customer udhaar are in scope; UI switches between English and Hindi.

## App Name
**Qurie**. Campaign line: "Bill Bhejo".

## Tagline
Bill ka photo bhejo, hisaab Qurie rakhegi. (Send the bill's photo; Qurie keeps the account.)

## Problem
Indian small shops get 20 to 100 supplier bills a month, as WhatsApp PDFs from the distributor's software and as paper, some handwritten. The bills sit in a drawer or a chat. Because of that:
- The owner does not know exactly what he owes each distributor or when it is due. Disputes with the salesman happen from memory.
- The CA spends 30 to 40 percent of the month chasing those bills. Three of five small businesses have lost GST credit at least once because a bill never reached the return before the 30 November cutoff.
- Since 1 October 2025 every GST-registered shop must accept or reject each supplier invoice on the portal every month (IMS). That is impossible without the bill in hand.
- Existing apps (Khatabook, OkCredit, Vyapar, myBillBook) only send bills out. None reads a bill in, and none answers in Hindi.

Who feels it: the owner, aged 35 to 55, on an Android phone; and his CA.

## Target User
Primary: the owner of a GST-registered hardware, electrical or pharmacy shop in a tier-1 or tier-2 Indian city, turnover Rs 40 lakh to 5 crore, 5 to 30 suppliers, who runs the shop from his phone and WhatsApp and pays a CA Rs 800 to 2,000 a month. He speaks Hindi or Hinglish, prefers voice notes to typing, and has been burned once by an app that went paid or lost his data.
Secondary: the CA who files his GST (v2, web view). Later: kirana owners on a free tier.

## Core Features (Must Have)
1. Capture a bill: camera, gallery, or share-into-app from WhatsApp (PDF or photo, printed or handwritten).
2. Qurie reads the bill (seller, GSTIN, number, date, due date, total, tax, items) and shows "Sahi hai?". Nothing is saved until the owner confirms. Low-confidence fields are asked one at a time, in Hindi.
3. Duplicate check: "yeh bill pehle aaya tha" when the same supplier and number, or the same amount and date, already exist.
4. Supplier ledger: per-supplier dues, bill list, mark paid or part paid, credit days.
5. Dues view: overdue, due today, this week, later; total owed.
6. Ask Qurie: text or voice, in Hindi, Hinglish or English, over the shop's own bills: dues, due tomorrow, month total, supplier-wise, "kitna diya". Answer as text, optionally spoken.
7. Reminders: push notification two days before a due date and on the day.
8. CA pack: one tap turns the month's bills into a PDF bundle and an Excel sheet and shares them on WhatsApp or email to the saved CA contact.
9a. Sales: record a sale (customer, amount, items optional, cash or udhaar) by tapping or by telling Qurie; daily and monthly sales totals; Qurie's morning greeting shows yesterday's sales and bill count.
9b. Customer udhaar: per-customer credit ledger (sales on credit, payments received, balance due); customer list under People next to suppliers; reminders to collect.
9. GST hygiene warnings: bill missing GSTIN or invoice number (not valid for credit); bill unpaid over 40 days from a micro or small manufacturer (Section 43B(h)); bill approaching 180 days unpaid (credit reversal).
10. Login with mobile number and OTP only. No email, no Google.
11. Hindi and English UI, switchable from More in one tap, voice first.
12. Data promise: export every bill any day; nothing that was free ever moves behind a paywall.

## Nice to Have
- Qurie's WhatsApp number as a second intake: forward a bill without opening the app.
- GSTR-2B matching: owner uploads the 2B file from the portal; Qurie lists which bills are missing and drafts a Hindi message to the supplier.
- Line items with batch and expiry for pharmacies; expiry alerts.
- Staff login (capture and confirm only).
- CA web view of all clients' packs.
- Qurie voice replies in the artist voice; WhatsApp voice-note answers.
- Pay from the bill: deep link into the owner's UPI app with the amount prefilled.
- Offline capture with later sync.
- Kirana free tier and distributor onboarding.

## Out of Scope (this version)
- Printed sales invoices, inventory, stock. (Recording a sale is in; generating a GST invoice for the customer is not.)
- Filing GST returns or touching the GST portal on the owner's behalf.
- Payments processing, lending, insurance.
- Tally, Marg or Busy sync.
- The tutor and companion features of the desktop Qurie.
- Any access by Qurie to the phone's files, gallery or system beyond the single photo or file the owner explicitly picks.

## User Stories
- As an owner, I want to photograph a distributor's bill in five seconds so that it is never lost.
- As an owner, I want Qurie to show me what it read and let me say "haan" so that no wrong amount enters my accounts.
- As an owner, I want to ask "Sharma ko kitna dena hai" by voice so that I get the answer without typing while standing at the counter.
- As an owner, I want a reminder two days before a bill is due so that I never pay late or pay twice.
- As an owner, I want to note a sale and who owes me for it in ten seconds so that udhaar is never forgotten.
- As an owner, I want Qurie to tell me yesterday's sales when I open the app so that I start the day knowing where I stand.
- As an owner, I want to send the whole month to my CA in one tap so that he stops calling me.
- As an owner, I want to be told when a bill is not valid for GST credit so that I can get a proper bill from the supplier in time.
- As an owner, I want to download everything any day so that I am never locked in.
- As a CA, I want the month's bills as one PDF and one sheet on the 5th so that my staff does not retype them. (v2: web view)

## Success Metrics
- Week-1 gate, before building: reading accuracy on 20 real bills. Printed at or above 90 percent on seller, total, date and GSTIN; handwritten at or above 70 percent. Below 70 on handwritten means v1 ships printed-only and says so.
- 90 days after launch: 20 paying shops in one city; at least 60 percent of shops confirm 20 or more bills a month by month two.
- At least 90 percent of captured bills confirmed within one minute; at most 5 percent edited after confirmation.
- At least half the shops send a CA pack in a month.
- Monthly churn under 10 percent; at least one shop quoting "credit found" in rupees.
