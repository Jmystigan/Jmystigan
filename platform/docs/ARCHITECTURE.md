# Architecture

## API (all JSON under `/api`)
| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `GET /me` `DELETE /me` `POST /auth/resend-consent` · `GET/POST /parent/:token` (parent review/approve/delete) |
| Billing | `POST /checkout` `GET /checkout/session/:id` `POST /stripe/webhook` (raw body, signature-verified) |
| Game | `PUT /game/stats` `POST /game/checkin` (game token or web token) |
| Players | `GET /players/:name` `GET /players/search?q=` `POST/DELETE /players/:name/follow` `GET /me/profile` |
| Parks | `GET /parks` `GET /parks/:slug` `POST/DELETE /parks/:slug/join` `POST /parks/:slug/posts` `POST /posts/:id/report` |
| Tour | `GET/POST /requests` `POST/DELETE /requests/:id/vote` |
| Partner (your launcher backend) | `POST /partner/codes` (Bearer `LAUNCHER_API_KEY`) — mint/lookup a one-time signup code per customer |
| Launcher (only with `HOST_BUILDS=1`) | `GET /config` `GET /launcher/manifest?kind=game\|launcher&channel=&platform=` `GET /launcher/download/:id` (Range-capable) `POST /launcher/game-token` `POST /licenses/redeem` `GET /library` |
| World | `GET /world` (map payload) `GET /world/manifest?since=N` (launcher/game poll) `GET /news` `GET /feed` · partner: `POST /partner/regions/:code/release` |
| Spots | `GET /spots` `POST /spots` (multipart: lat,lng *or* x,y; tags; 13+: name, description, ≤3 photos) `GET /spots/:id/photos/:pid` `POST/DELETE /spots/:id/vote` `DELETE /spots/:id` |
| Geo | `GET /geo/project?lat&lng` `GET /geo/unproject?x&y` (map ⇄ coordinates; US land only) |
| Social | `POST/DELETE /posts/:id/respect` |
| Admin | `/admin/builds` (upload/list/publish/delete) `/admin/parks` `/admin/licenses` `/admin/reports` `/admin/posts/:id/moderate` `/admin/users` `/admin/regions` (+ `/release`) `/admin/spots` (+ `/promote`) `/admin/news` |

### Token scopes
`web` (30d, full) vs `game` (12h, stats/check-in only — rejected by admin, account-deletion and token-minting routes). A leaked game token from a command line can't hurt an account.

## Kid safety model (built in, not bolted on)
- Nickname-only accounts; birth **year** only.
- **Private profiles:** under-13 profiles are *always* private (enforced at signup, by migration, and in `PATCH /me/settings`). Private = absent from profile pages, search, leaderboards, rider lists, follow, and park-request attribution; their preset phrases show as "A rider"; they count only in anonymous totals. Visible to the player, their parent (parent page) and admins (moderation). 13+ can opt in from account settings.
- Under 13: parent email required → account locked from social + invisible to others until the parent approves via an emailed link (`server/email.js`; Resend, or console in dev). The same link opens a **parent page**: see everything stored, approve, or delete. Unapproved accounts are deleted after `PENDING_CONSENT_DAYS`; resend is rate-limited.
- Under 13 can only post **preset phrases**. 13+ gets free text filtered for profanity, contact info, links and other platforms (`server/moderation.js` — extend the blocklist).
- Report links; 3 reports auto-hide pending admin review. Delete-my-account removes all data.
- **This is engineering, not legal advice.** Have a lawyer review COPPA/GDPR-K/state laws and write the real privacy policy & ToS before collecting data from children.

## Anti-cheat reality
Stats are client-reported. Server caps and monotonic bests stop casual tampering and stale-upload overwrites, but a determined cheater can forge a leaderboard score. For ranked boards later: submit a replay/input log or have a dedicated server validate runs.

## Going to production
- **Host:** `Dockerfile` included. One small VPS/Fly/Render/Railway instance + a persistent volume at `/data` is plenty to start. Put it behind HTTPS (required for PWA install and for the launcher).
- **Database:** SQLite is fine for thousands of players. Move to Postgres when you need multiple server instances (queries are plain SQL; `db.js` is the only coupling).
- **Big builds:** a multi-GB game through the Node server works but is slow/expensive. Move build storage to Cloudflare R2 / S3 and have `/admin/builds` return a presigned upload URL and `/launcher/download` redirect to a signed download URL. The manifest contract (`version`, `sha256`, `size`, `downloadUrl`) doesn't change, so launchers don't care.
- **Rate limiting** is in-memory per instance; use Redis if you scale out. **Email:** see above.
- **Store builds vs own launcher:** if you also ship on Steam/Epic, they handle their own updating; this launcher + license keys is for direct distribution. Keep ownership in `licenses` (sync from store APIs if you want both).

## Open world & map internals
- `regions` (one row per state) + `meta.world_revision`. `releaseRegion()` is the single code path for Admin and the partner endpoint; it runs in a transaction.
- Anything the map/launcher cares about calls `bumpRevision()`; the manifest is cacheable for 30 s.
- `geo.js`: `project()` (d3 Albers-USA, same parameters as us-atlas), `stateAt()` (point-in-polygon against the state outlines with ~4 px coastal slack — the projection alone only checks a rectangle, so Canada/ocean would pass), `unproject()`.
- Spots: photos are sanitised by `images.js` (JPEG: drop APP1/EXIF/XMP/IPTC/comments; PNG: keep only render-critical chunks) and stored under `DATA_DIR/uploads` with random names; served only if the spot is public or you own it / are admin. `users.js:deleteUsers()` removes files when an account is deleted (parent delete, self delete, retention jobs).
- Under-13: can submit pin + tags only (no text, no photos), can vote and 🤙; their attribution is hidden when private.
