# Skate Platform

Companion platform for the skateboarding game: **accounts, player profiles (level / tricks / bests), park crews & leaderboards, a "bring us to your park" tour, a launcher with admin drag-and-drop updates**, and the public website that explains it. Mobile-first and installable as a phone app (PWA).

```
server/    Express API + SQLite (node:sqlite, no native deps)
web/       Website + player portal + admin panel (no build step; PWA)
launcher/  core.js (tested) + Electron shell (untested) — installs/updates the game
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
| `MAX_UPLOAD_GB` | 8 | |

## How the pieces talk

1. Player logs into the **launcher** (same account as the website). Launcher installs/updates the game from the **manifest** the admin publishes.
2. Launcher asks the server for a **12h game token** and starts the game with `-JMToken=… -JMServer=…`.
3. Game (`UJMPlatformSubsystem`) calls `CheckInToPark` and `UploadStats`. Server keeps the max of each best.
4. Website/phone shows the profile, park leaderboards, crew and board — live from the same database.

See `docs/ARCHITECTURE.md` for API reference and production notes.
