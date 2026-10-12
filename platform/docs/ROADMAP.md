# Status & roadmap

## Built and tested
- API, auth, kid-safety rules, stats sync, park social, tour requests, license keys, build upload/publish, Range-capable downloads — `npm test` (6 integration tests).
- Web app/PWA smoke-tested in headless Chromium at phone width: signup, join crew, post, PII rejection, XSS escaping, admin drag-and-drop upload + publish, no horizontal overflow.
- Launcher core (login, manifest, resume, SHA-256 verify, up-to-date check) — `node launcher/test.mjs`.

## Written but NOT run
- `launcher/` Electron shell (needs `npm i`, a real unzip step, packaging with code-signing, and the "Play" button wired to the unpacked exe).
- `unreal/` C++ subsystem (never compiled — expect small fixes for your module name / UE version).

## Product decisions
- Customers-only: signup needs a one-time code (partner API from your launcher, admin-generated keys, or bootstrap admin).
- One represented park per player (switching replaces). In-game check-in is presence only.
- Build hosting/launcher are optional (`HOST_BUILDS=1`); your own launcher is the default assumption.

## Done in the latest round
- Western restyle (parchment/rust/gold, concept art hero), wanted-poster profiles with PNG export, interactive US map, open-world regions + release flow + world manifest, rider-submitted spots with photos and an admin review/promote flow, 🤙 reactions, crew feed. 22 API tests + a browser run (phone and desktop).
- Launcher core `world()`; admin can release a state in one click, or your build pipeline can via the partner endpoint.

## Not done / untested for this round
- **The game itself** (Unreal) doesn't read the world manifest yet: the sample subsystem only uploads stats/check-ins. Next step there is a `FetchWorldManifest()` that decides which state levels to stream.
- Map is **US-only** (50 states + DC). International would need another basemap.
- Pins are drawn client-side without clustering; fine for tens of parks, add clustering at hundreds.
- No push/email notification when a state ships (it appears on the site, map, news and feed).
- Photo moderation is manual (admin review). Add automated screening before opening spot uploads widely.

## Title
- Working title is now **Blacktop Outlaws** (`GAME_NAME`). Concept art in `docs/concept-art/`. Stripe product + emails use `GAME_NAME`, so create the Stripe product with this name.

## Done most recently
- **Private profiles for under-13s** (always on; 13+ can opt in): hidden from profiles, search, leaderboards, rider lists, follow; posts show as "A rider"; anonymous counts only. Parent email/page and Safety page say so. Title set to **Sk8**.

## Done earlier
- Parent consent by email (Resend, dev console fallback), parent review/approve/delete page, resend, auto-purge of unapproved accounts.
- Stripe Checkout + signed webhooks: auto-issued codes (idempotent), emailed; full refund / dispute → access ends & account suspended; dispute won → reinstated; suspended accounts auto-deleted after 90 days.
- 16 integration tests (Stripe signatures are real; only the outbound Checkout call is stubbed).

## Not verified against live services
- Never run against **real Stripe or Resend** (no credentials/network here). Do a full test-mode purchase, refund, and email send before launch.

## Not built yet (highest value first)
1. **Lawyer-reviewed privacy policy / ToS / consent method** — see docs/LEGAL_CHECKLIST.md (consider private profiles for under-13s).
3. Launcher: unpack + launch flow, self-update application, code-signing (Windows SmartScreen/macOS notarisation).
4. Object storage (R2/S3) for builds; CDN.
5. Mobile: the web app is installable; a native companion app (or push notifications for "your crew is online") is a later step.
6. Real-time presence/chat (currently polling-based board); friends-only messaging.
7. Stronger anti-cheat for ranked boards; replay validation.
8. Map view of the tour; park photos; 3D park preview (glTF viewer) on each park page.
9. Account recovery (needs email), admin audit log, 2FA for admins.
