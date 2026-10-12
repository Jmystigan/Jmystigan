# Scanning a park → into the game

Plan roughly **one full day on site + several days of cleanup** per park, at least for the first few.

## 1. Before you go
- Ask permission for private/city-run parks; check local drone rules (US: FAA Part 107 for commercial use). Avoid scanning when it's busy — people (esp. kids) in captured photos are a privacy problem; schedule early morning and delete/blur anything with faces.
- Overcast light is best (no hard shadows baked into textures). Note the park's slug (create it in Admin → parks) so the game and website agree.

## 2. Capture
- **Drone:** grid pattern at ~20–30 m with 70–80% overlap, plus an orbit at a lower altitude, plus oblique passes on bowls/rails.
- **Ground:** walk every feature in overlapping loops at 3 heights; close-ups of rail ends, coping, ledges, text/murals. Add ground control points (marked targets) if you want true-scale — or measure one known distance (e.g. a stair set) and scale in post.
- iPhone LiDAR (Polycam/Scaniverse) is fine for individual features, not whole parks.

## 3. Process
RealityCapture (or Metashape/Polycam) → align → dense mesh → export high-poly mesh + textures. Fix scale/orientation (Unreal = cm, Z up).

## 4. Make it game-ready (the real work)
1. **Retopologise** features into clean, low-poly meshes (Blender/RizomUV/Instant Meshes); bake detail to normal maps.
2. **Collision:** hand-build simple collision. Never use the raw scan for physics — skating needs smooth, predictable surfaces.
3. **Grind rails/ledges/coping:** author as splines or tagged meshes your trick system understands; tune friction/surface types.
4. **Cleanup:** remove people, cars, trash; patch holes; flatten ground.
5. Nanite is good for the visual layer; keep gameplay collision separate.

## 5. Ship it
1. Package the park as DLC/chunk (Unreal Pak/IoStore) or a normal build update.
2. Admin → builds: upload, **Publish**. Launchers update players.
3. Admin → parks: set status `scanned` → `in_game`. Its page, crew and leaderboard are already live and waiting (players can join the crew the moment the park exists).
4. In-game: call `CheckInToPark("<slug>")` on load and include `parkScores` in `UploadStats`.
