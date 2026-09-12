# 04 · UI/UX Design Brief

Draft v0.1, 10 Sep 2026.

## Aesthetic
"Counter-top clarity." Bright, calm, high contrast, big type, Hindi first. It should feel like a clean ledger page, not a fintech dashboard. Familiar to a Khatabook user, quieter than Khatabook. One playful element only: Qurie's avatar and voice. No gradients, no confetti, no emoji as UI.

## Colors
**Superseded 10 Sep evening:** Divya's home screen follows `app/home-reference.png` (paper `#FAFAF7`, ink `#151A17`, lime accent `#D9F36A` with `#1B3A2C` text on it, forest brand `#1E4A3B`; red, green, amber and blue keep their meanings). The live tokens are `app/src/theme/tokens.ts`; the login screens use the same. The list below is the earlier palette, kept for reference.

- Primary, ledger green ("confirmed", "paid"): `#1F7A4D`
- Accent / CTA, Qurie blue (the mic and Qurie's bubbles only): `#2F5BEA`
- Due / overdue red: `#C43B2E`
- Warning amber (low confidence, GST hygiene): `#B7791F`
- Background, paper: `#FBFAF6`
- Surface, cards: `#FFFFFF`
- Text: `#1B2430`; secondary text `#5B6670`; border `#E1E4DE`
- Dark mode: background `#121816`, surface `#1B2320`, text `#E9EDE7`, secondary `#A7B0A9`, border `#2A3430`; primary lifts to `#4CAF7E`, red to `#E8776C`, blue to `#7C96FF`.

Rule: green and red mean money states only; blue means Qurie only. Never decorative.

## Typography
- UI font: Noto Sans and Noto Sans Devanagari (one family, both scripts align; shipped in `assets/fonts`).
- Amounts: Noto Sans with tabular numerals, Indian grouping (1,24,800), rupee sign before, no decimals unless paise exist.
- Scale: display 32 (month total), title 22, heading 18, body 17, secondary 15, caption 13. Nothing under 13.
- Line height 1.4 for Devanagari (taller conjuncts).

## Component Style
- Border radius 12 on cards and sheets, 24 on pills and the mic button.
- Cards are flat with a 1 px border. The only shadow in the app sits under the raised mic button.
- Buttons: primary filled green, 52 px tall, full width on forms; secondary outlined; destructive is red text.
- Bill card: supplier name, amount right-aligned, due-date chip (green paid, red overdue, grey upcoming), a small dot when unconfirmed.
- Confidence colouring on the review sheet: green at 0.9 and above, amber 0.6 to 0.9, red under 0.6. Red fields are asked, not just coloured.
- Chat: owner bubbles right in paper grey; Qurie bubbles left in light blue with the avatar; answer cards inside bubbles carry a "Dekho" link.

## Dark / Light Mode
Light is primary: shops are bright and screens face the sun. Dark follows the system setting. Every colour comes from the token set above and both themes are tested.

## Reference Mockup
The three-screen mockup Devansh shared on 10 Sep (chat home with summary cards, People list with initial avatars and due/paid pills, supplier detail with a Total / Paid / Outstanding card and a dated transaction history) is the layout reference. Colours and fonts follow the tokens above, not the mockup's.

## Reference Apps
Khatabook (the familiar mental model), Google Pay India (amounts, big targets, Hindi), WhatsApp (share sheet, simplicity), Notion (calm cards), Zerodha Kite (how tabular numbers should look).

## Key UI Patterns
Three bottom tabs; chat cards (summary in three columns, outstanding payment with a link); initial-letter avatars in a pastel circle; status pills (red due amount, green Paid); full-screen camera modal; bottom sheets for review, sale and payment; filter chips; a month header with one big number; Hindi toast confirmations; coach marks only on first run.

## Mobile
Portrait only. One-hand reach: primary actions in the bottom half, the mic in the chat field (a centre tab-bar button comes later). Text scales with the system font size up to 130 percent without truncation: amounts wrap to a new line, never clip. Works on a 5.5-inch screen at 720 px wide.

## Accessibility
- Contrast AA everywhere, checked in both themes.
- Touch targets 48 dp minimum; 56 for the mic and "+ Bill".
- Every icon has a label; every amount has a spoken form ("barah hazaar chaar sau assi rupaye") for TalkBack, VoiceOver and Qurie's voice.
- Language toggle in one tap from More; Hindi strings reviewed by a native speaker before release.
- Reduce-motion respected: the waveform becomes a static level bar.

## Voice and Personality
Qurie speaks in short Hindi or Hinglish sentences, never more than two lines on screen. She confirms before acting, admits when she cannot read a bill, and never says "error". The artist voice is warm and quick. The Siya voice is used only in development.
