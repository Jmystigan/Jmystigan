# Skate Platform — "Represent your park"

The crew app for the skateboarding game. **Customers only** sign up (with a code that comes with the game), pick the **one skatepark they represent**, and see locals, who's skating now, park leaderboards, and their own level / tricks / bests. Parks compete on rider count and crew score. Mobile-first and installable as a phone app (PWA).

**Your launcher stays in charge of the game** (scans, builds, updates). This app only needs to know who bought it — see *Connecting your launcher* below. (Optional built-in build hosting + a reference launcher exist behind `HOST_BUILDS=1`; ignore them if you don't need them.)

```
server/    Express API + SQLite (node:sqlite, no native deps)
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
npm test                              # API integration tests
node launcher/test.mjs http://localhost:3000 <user> <pass>   # launcher core vs live server
```

Register with the username you set in `ADMIN_USERNAME` to become admin (or `npm run make-admin -- yourname`).
Admin panel: `#/admin` → **builds** (drag & drop, publish/rollback), **parks** (tour status + visit dates), **licenses** (key batches), **moderation**, **users**.

### Config (env vars)
| Var | Default | |
|---|---|---|
| `STUDIO_NAME` | JMystigan Game Studios | Shown everywhere (web, launcher). **Change here when the name changes — no rebuild.** |
| `GAME_NAME` | Skateboarding Kid | |
| `PORT`, `PUBLIC_URL`, `DATA_DIR` | 3000, localhost, `./data` | |
| `JWT_SECRET` | generated & saved in `DATA_DIR` | Set explicitly in production |
| `LAUNCHER_API_KEY` | _(empty = partner API off)_ | Shared secret your launcher backend uses to mint signup codes |
| `LAUNCHER_URL` | | Where the "Get the game" page sends people |
| `HOST_BUILDS` | off | `1` enables optional build hosting/launcher endpoints + admin "builds" tab |
| `MAX_UPLOAD_GB` | 8 | Only with `HOST_BUILDS=1` |
| `REGISTER_PER_HOUR` | 10 | Signups per IP per hour |

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

Keep `LAUNCHER_API_KEY` on your server only — never inside the launcher binary.

## How the pieces talk

1. Customer gets a code from your launcher, signs up here, and **represents one park**.
2. Game (`UJMPlatformSubsystem`) needs a token for the player. With your own launcher, use `POST /api/auth/login` from the launcher (or the built-in `POST /api/launcher/game-token` under `HOST_BUILDS=1`) and pass the token to the game as `-JMToken=… -JMServer=…`.
3. Game calls `CheckInToPark` (shows "skating now" — does **not** change the park they represent) and `UploadStats`. Server keeps the max of each best.
4. Website/phone shows the profile, park leaderboards, riders and board — live from the same database.
5. When you add a scanned park to the game, add it in Admin → parks with the **same slug** the game uses.

See `docs/ARCHITECTURE.md` for API reference and production notes.
