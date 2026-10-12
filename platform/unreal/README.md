# Unreal integration: `UJMPlatformSubsystem`

One `UGameInstanceSubsystem` that does three things:
1. **Stats & presence** — `UploadStats`, `CheckInToPark` (needs the launcher's token).
2. **World manifest** — knows which states are released and which parks are in the game, caches that on disk (offline play still works), polls for changes, and tells you when a new state opens.
3. **Update awareness** — compares the *installed game version* with each state's *release version*, so you can show "Texas is now open!" / "Update the game to play California".

> **Status.** The sample is **not compiled inside Unreal yet.** Its logic is verified by `npm run test:unreal` (below) using a stub of the Unreal APIs, and the JSON it builds/reads is checked against the real server. Expect small fixes for your UE version/module on first compile.

## 1. Add it to your project
1. Copy `JMPlatformSubsystem.h/.cpp` into `Source/<YourGame>/`; replace `YOURGAME_API` with your module's macro.
2. `<YourGame>.Build.cs` → `PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "HTTP", "Json" });`
3. For running in the editor (no launcher), add to `Config/DefaultGame.ini`:
   ```ini
   [/Script/YourGame.JMPlatformSubsystem]
   DefaultServerUrl=https://your-domain.example
   WorldPollSeconds=300
   RegionLevelPrefix=L_
   ```
4. Set **Project Settings → Description → Project Version** to the same number you upload to the launcher (e.g. `1.1.0`). When launched by the launcher this is overridden by `-JMGameVersion`.

## 2. What the launcher passes
`-JMToken=<12h game token> -JMServer=<https://…> -JMGameVersion=<installed version>` (`launcher/core.js` → `launch()`).
No launcher / no `-JMServer`? Then `DefaultServerUrl` is used; with neither, everything runs offline from the cache.

## 3. Using it in Blueprints
Get it with **Get Game Instance Subsystem → JMPlatformSubsystem**.

| You want to… | Do this |
|---|---|
| Show "Texas is now open!" | Bind **On World Updated** → loop **Newly Released** (each has `Name`, `Version`) → show your toast. It's empty on the first launch so players aren't spammed. |
| Decide if a state's door/portal works | **Is Region Playable(`"TX"`)** — released *and* this build contains it. |
| Tell players to update | **Region Needs Update(`"TX"`)** → show "Update the game in the launcher to play Texas". **Get Regions Needing Update** lists all of them (good for a banner on the main menu). |
| Stream the right level | **Get Region Level Name(`"TX"`)** → `L_TX`, feed it to *Load Stream Level* / *Open Level*. |
| Gate park content | **Is Park In Game(slug)**, **Get Parks In Region(`"TX"`)** (name, city, lat/lng). The slug is the same id you pass to Check In / Upload Stats. |
| Refresh now | **Fetch World Manifest** (it also runs on a timer; ≥30 s apart). |
| Handle offline | Bind **On World Fetch Failed** (optional) — queries keep answering from the cache. |

Typical flow when a player enters a park: `IsRegionPlayable(State)` → `CheckInToPark(Slug)` → play → `UploadStats(...)` at session end.

## 4. Conventions that make it work
- **Use the same version number** for a state's release (`POST /api/partner/regions/TX/release {"version":"1.2.0"}`) as for the game build you ship it in. The game treats `installed >= release` as "I have it".
- **Park slugs** in the game data must match the slugs on the site (Admin → parks).
- The manifest is **public and a hint only**: it never tells the game to download or run anything. New content arrives through your launcher's normal game update. (Serve the API over HTTPS in production.)
- Region level names default to `L_<STATE>` (`L_TX`); change `RegionLevelPrefix` if your levels are named differently.

## 5. How it's tested (no Unreal needed)
```bash
npm run test:unreal      # needs g++ or clang++
```
It starts the real server, creates parks, releases Texas (1.0.0) then California (1.1.0), and captures the **real** manifest JSON. Then it compiles the sample *as-is* against `tests/stubs/ue_stub.h` (a minimal imitation of the Unreal APIs we use) and runs 76 checks: version comparison, offline start, first fetch, `?since=` polling, "changed:false" silence, newly-opened detection, playable vs needs-update, failures resetting the in-flight guard, on-disk cache, the launcher token never being sent to the public manifest endpoint, and request verbs/paths/auth. Finally the stats and check-in JSON **built by the C++** is POSTed to the real server, which must accept and store it.

I checked the harness catches real bugs by breaking the sample three ways (off-by-one in "playable", leaking the token on the manifest request, forgetting to reset the in-flight flag) — each made it fail.

**What this does not prove:** that the code compiles against *your* Unreal version (the stubs mirror the API as I understand it), or Blueprint/editor behaviour. Do a real compile and a quick in-editor test (bind the delegate, release a test state, watch the toast) before relying on it.
