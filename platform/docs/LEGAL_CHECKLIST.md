# Keeping it legit — checklist

> I'm not a lawyer and this isn't legal advice. This is a to-do list of what to **take to one**. A kids' game that collects accounts and takes payments is exactly where an hour or two of a children's-privacy attorney's time pays for itself.

## Children's privacy (the big one)
- **COPPA (US)** applies when you knowingly collect personal info from under-13s. Built in: nicknames only, parent email for under-13s, locked/hidden until approval, parent review + delete page, preset-only chat, no ads, auto-deletion of unapproved accounts, delete-my-account.
- **Verifiable parental consent — decide the method with counsel.** The emailed link ("email plus") is generally only accepted when a child's data is *not disclosed to others*. Here an approved child appears on park leaderboards/rider lists, so counsel may want a stronger method. Common options: the **parent makes the Stripe purchase** (a card transaction is a recognised method, if the parent is notified), a signed form, or a verified call. **Already done as a design lever:** under-13 profiles are always private (never shown to other players), which narrows what's disclosed — but whether that is enough for email consent is a question for counsel.
- **Check the current rule.** The FTC's amended COPPA Rule (finalized 2025) added requirements like a written data-retention policy, a written information-security program, and separate consent before sharing with third parties; the compliance date was in spring 2026 — confirm current requirements.
- **Write the Privacy Policy + a direct parent notice** (the email covers part of it). List every processor that touches data: your host, **Stripe**, **Resend**.
- Outside the US: **GDPR / UK GDPR + UK Children's Code** (age of digital consent is 13–16 depending on country) and some US states' kids' design laws. Decide where you'll sell.

## Business & money
- Form the business (LLC/etc.), get an EIN, use a business bank account for Stripe.
- **Terms of Service, Refund Policy, EULA.** Post the refund policy at checkout; the code already revokes access on full refunds/disputes.
- **Sales tax / VAT** on digital goods: register where required, use Stripe Tax (`STRIPE_AUTOMATIC_TAX=1`).
- Contracts with minors are generally voidable and Stripe needs an adult cardholder — the buy page tells under-18s to ask a parent/guardian. Have counsel confirm your Terms handle this.
- Stripe: stay on hosted Checkout (keeps you out of heavy PCI scope); keep the webhook secret private; handle disputes quickly.

## Content & scanning
- Get **permission** for private or city-run parks; follow local drone rules (US: FAA Part 107 for commercial flights).
- **Murals/graffiti are copyrighted art** — clear or remove them before shipping scans.
- Don't ship scans containing identifiable people (faces, plates); capture when empty or blur.
- Trademark: don't use real brand logos (park sponsors, shoe/board brands) without permission.

## User-submitted spots and photos
- **Photos are user content.** Require adults/13+ only (already enforced), review before publishing (already enforced), and have Terms that say you may use submitted spot info/photos to build the game (a licence grant) — and that the uploader owns/has the right to share them.
- **Faces, plates, private property.** Admin review should reject photos with identifiable people and spots on private/unsafe land; the developer should confirm access before scanning.
- **Location data.** Photo EXIF/GPS is stripped. A spot's coordinates are public once approved; the finder's name is hidden if their profile is private.
- **Takedowns.** Keep a way to remove a spot/photo on request (Admin → spots) and consider a DMCA agent registration if you host user content in the US.

## Before launch
- **Trademark search** the game title (USPTO + app stores + domains + handles). See `NAMES.md`.
- Age ratings: **IARC** (free, used by Google Play and others) and ESRB for consoles/Steam as needed; disclose online interaction honestly.
- Security basics: HTTPS, rotate the generated secrets, back up `DATA_DIR`, have a breach-response plan, limit who has admin.
- Replace the placeholder text on the in-app **Safety & privacy** page with the real policy.
