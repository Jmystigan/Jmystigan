# Skate Platform — "Represent your park"

The crew app for the skateboarding game. **Customers only** sign up (with a code that comes with the game), pick the **one skatepark they represent**, and see locals, who's skating now, park leaderboards, and their own level / tricks / bests. Parks compete on rider count and crew score. Mobile-first and installable as a phone app (PWA).

**Your launcher stays in charge of the game** (scans, builds, updates). This app only needs to know who bought it — see *Connecting your launcher* below. (Optional built-in build hosting + a reference launcher exist behind `HOST_BUILDS=1`; ignore them if you don't need them.)

```
server/    Express API + SQLite (node:sqlite, no native deps); world.js = regions/releases, geo.js = map projection
web/       Website + player portal + admin panel (no build step; PWA)
launcher/  OPTIONAL reference launcher (core.js tested, Electron shell untested) — only if you want to host builds here
unreal/    C++ subsystem that uploads stats and checks in to parks (untested)
docs/      ARCHITECTURE.md, SCANNING.md, ROADMAP.md
```

## Run it

```bash
npm install
ADMIN_USERNAME=yourname npm start     # http://localhost:3000
npm run seed                          # optional demo parks
npm test                              # API integration tests (22)
npm run build-map                     # regenerate web/us-states.json (needs dev deps)
node launcher/test.mjs http://localhost:3000 <user> <pass>   # launcher core vs live server
```

Register with the username you set in `ADMIN_USERNAME` to become admin (or `npm run make-admin -- yourname`).
Admin panel: `#/admin` → **builds** (drag & drop, publish/rollback), **parks** (tour status + visit dates), **licenses** (key batches), **moderation**, **users**.

### Config (env vars)
| Var | Default | |
|---|---|---|
| `STUDIO_NAME` | JMystigan Game Studios | Shown everywhere (web, launcher). **Change here when the name changes — no rebuild.** |
| `GAME_NAME` | Blacktop Outlaws | Working title (see docs/NAMES.md) |
| `PORT`, `PUBLIC_URL`, `DATA_DIR` | 3000, localhost, `./data` | |
| `JWT_SECRET` | generated & saved in `DATA_DIR` | Set explicitly in production |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | | Sell the game with Stripe Checkout; webhooks issue codes and handle refunds → [docs/SETUP_STRIPE_EMAIL.md](docs/SETUP_STRIPE_EMAIL.md) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | _(dev: console)_ | Parent-consent + purchase emails |
| `PENDING_CONSENT_DAYS`, `REFUND_RETENTION_DAYS` | 14, 90 | Auto-delete unapproved child accounts / refunded accounts |
| `LAUNCHER_API_KEY` | _(empty = partner API off)_ | Shared secret your launcher backend uses to mint signup codes |
| `LAUNCHER_URL` | | Where the "Get the game" page sends people |
| `HOST_BUILDS` | off | `1` enables optional build hosting/launcher endpoints + admin "builds" tab |
| `MAX_UPLOAD_GB` | 8 | Only with `HOST_BUILDS=1` |
| `REGISTER_PER_HOUR` | 10 | Signups per IP per hour |

## The open world: states, releases, and keeping the launcher in step

The game is released **state by state**; each state is one open-world level. The site tracks this with *regions* (the 50 states + DC):
`planned → scanning → released`. A **world revision** number goes up every time something changes (a state is released, a park is added or changes status, a spot is promoted).

**When you ship a new state** (your launcher/build pipeline does this, or use Admin → world → *Release state*):
```bash
curl -X POST $PUBLIC_URL/api/partner/regions/TX/release -H "Authorization: Bearer $LAUNCHER_API_KEY" \
     -H 'content-type: application/json' -d '{"version":"1.2.0","notes":"Austin, Dallas and Houston"}'
```
That marks Texas released at v1.2.0, flips its *scanned* parks to **in the game**, posts a news item ("Texas is now open!"), turns the state rust-red on the map, and bumps the revision. (If no park in the state is scanned yet, it asks for `"force":true`.)

**Your launcher / game learns about it** by polling a cheap public endpoint (no personal data):
```
GET /api/world/manifest?since=<last revision you saw>
-> {"revision":12,"changed":false}                                   # nothing new
-> {"revision":13,"changed":true,"regions":[{"code":"TX","name":"Texas","version":"1.2.0","releasedAt":"…"}],"parks":[{"slug":"rail-yard-austin","name":"Rail Yard","state":"TX","lat":30.27,"lng":-97.74}]}
```
When a state appears that the player hasn't installed (or its `version` is newer than theirs), the launcher prompts the update. `launcher/core.js` has `world(sinceRevision)` for this. Park `slug`s are the same ones the game passes to `CheckInToPark` / `UploadStats`. The website's map also polls this and updates itself live.

## The map, social, and "found a spot"

- **`#/map`** — interactive US map (drag / wheel / pinch to zoom, tap a state or pin). States are coloured by release status; ★ = park in the game, ● = coming, ◆ = community spot. Selecting a park shows its leaderboard, riders (public profiles only — private riders show as "+N private"), board posts with 🤙 *respect*, and a *Represent this park* button.
- **Wanted-poster profiles** — every player page is a downloadable "WANTED" poster (level, reward = best score, tricks they're "wanted for", last-seen park). Private players' posters are only visible to them (stamped PRIVATE).
- **Found a new spot?** Riders drop a pin (tap the map, use GPS, or paste coordinates). 13+ add a name, notes and up to 3 photos; **under-13s can only pin + pick tags**. Photos are re-written without EXIF/GPS, only JPG/PNG are accepted, and nothing is public until an admin approves it (Admin → spots). Approved spots get votes (🤙) so you can see demand; *Add to the tour* turns one into a park (planned/scheduled) and credits the finder (as "a rider" if their profile is private). Deleting an account deletes its spots and photo files.
- **Crew feed** (`#/feed`) — news, your park's board, and new spots near you.
- Map data is generated from `us-atlas` by `npm run build-map` (committed; production needs no dev deps). Pins use the same Albers projection, so lat/lng from the admin form or GPS land on the right state.

## Connecting your launcher (customers only)

Signup requires a one-time code. Three ways to get codes to customers:

1. **Launcher backend → this app (recommended).** When someone buys/installs, your backend calls:
   ```bash
   curl -X POST $PUBLIC_URL/api/partner/codes -H "Authorization: Bearer $LAUNCHER_API_KEY" \
        -H 'content-type: application/json' -d '{"externalId":"<your customer id>"}'
   # -> {"code":"1A2B3C-…","registered":false,"signupUrl":"https://…/#/register?code=1A2B3C-…"}
   ```
   Show the `code`, or open `signupUrl` from the launcher, which pre-fills it. The call is idempotent per `externalId` (same customer → same code; `registered: true` once used).
2. **Admin panel → licenses:** generate batches by hand (giveaways, early backers).
3. **Bootstrap:** the account named in `ADMIN_USERNAME` signs up without a code.

**Selling it:** with Stripe configured the site has a "Buy" button (hosted Checkout). A paid purchase emails the buyer a code automatically, and a **refund or lost dispute ends access** with no manual work. See [docs/SETUP_STRIPE_EMAIL.md](docs/SETUP_STRIPE_EMAIL.md). Before launch read [docs/LEGAL_CHECKLIST.md](docs/LEGAL_CHECKLIST.md); for naming see [docs/NAMES.md](docs/NAMES.md).

Keep `LAUNCHER_API_KEY` on your server only — never inside the launcher binary.

## How the pieces talk

1. Customer gets a code from your launcher, signs up here, and **represents one park**.
2. Game (`UJMPlatformSubsystem`) needs a token for the player. With your own launcher, use `POST /api/auth/login` from the launcher (or the built-in `POST /api/launcher/game-token` under `HOST_BUILDS=1`) and pass the token to the game as `-JMToken=… -JMServer=…`.
3. Game calls `CheckInToPark` (shows "skating now" — does **not** change the park they represent) and `UploadStats`. Server keeps the max of each best.
4. Website/phone shows the profile, park leaderboards, riders and board — live from the same database.
5. When you add a scanned park to the game, add it in Admin → parks with the **same slug** the game uses.

See `docs/ARCHITECTURE.md` for API reference and production notes.
