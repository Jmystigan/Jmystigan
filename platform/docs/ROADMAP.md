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

## Not built yet (highest value first)
0. **Revoking access** when a purchase is refunded (partner endpoint to disable a customer's code/account) — today you'd ban the user from Admin → users.
1. **Email delivery** for parent consent (link currently logged to console).
2. **Real privacy policy / ToS** + lawyer review for children's data.
3. Launcher: unpack + launch flow, self-update application, code-signing (Windows SmartScreen/macOS notarisation).
4. Object storage (R2/S3) for builds; CDN.
5. Mobile: the web app is installable; a native companion app (or push notifications for "your crew is online") is a later step.
6. Real-time presence/chat (currently polling-based board); friends-only messaging.
7. Stronger anti-cheat for ranked boards; replay validation.
8. Map view of the tour; park photos; 3D park preview (glTF viewer) on each park page.
9. Account recovery (needs email), admin audit log, 2FA for admins.
