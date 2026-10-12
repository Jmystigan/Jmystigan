// End-to-end check of the Unreal sample's LOGIC against the REAL server (no Unreal needed):
//   1. start the platform, create parks, release Texas (1.0.0) then California (1.1.0), capture the real manifest JSON each time
//   2. compile + run the C++ harness (unreal/tests/test_main.cpp) which feeds that JSON to JMPlatformSubsystem
//   3. take the stats / check-in bodies the C++ built and POST them to the real server; assert they were accepted and stored
// usage: node unreal/tests/run.mjs        (needs g++ or clang++)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cxx = ['g++', 'clang++'].find((c) => spawnSync(c, ['--version']).status === 0);
if (!cxx) { console.log('SKIP: no C++ compiler (g++/clang++) found'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-unreal-'));
Object.assign(process.env, { DATA_DIR: path.join(dir, 'data'), ADMIN_USERNAME: 'boss', REGISTER_PER_HOUR: '1000', LAUNCHER_API_KEY: 'k' });
const { app } = await import('../../server/index.js');
const server = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async (m, u, b, t, key) => {
  const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...((t || key) && { authorization: `Bearer ${t ?? key}` }) }, body: typeof b === 'string' ? b : b && JSON.stringify(b) });
  return { status: r.status, text: await r.text() };
};
const json = (r) => JSON.parse(r.text);
let exitCode = 0;
try {
  const admin = json(await call('POST', '/auth/register', { username: 'boss', password: 'password123', birthYear: 1990 }));
  const mk = (name, city, state, lat, lng, status) => call('POST', '/admin/parks', { name, city, state, lat, lng, status }, admin.token);
  await mk('Rail Yard', 'Austin', 'TX', 30.27, -97.74, 'scanned'); await mk('Bowl Town', 'Dallas', 'TX', 32.78, -96.8, 'scanned');
  await mk('Venice Plaza', 'Los Angeles', 'CA', 34.05, -118.24, 'scanned');
  const release = (code, version) => call('POST', `/partner/regions/${code}/release`, { version }, null, 'k');
  assert.equal((await release('TX', '1.0.0')).status, 200);
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const m1 = (await call('GET', '/world/manifest')).text; fs.writeFileSync(path.join(dir, 'm1.json'), m1);
  assert.equal((await release('CA', '1.1.0')).status, 200);
  const m2 = (await call('GET', '/world/manifest')).text; fs.writeFileSync(path.join(dir, 'm2.json'), m2);
  console.log('captured real manifests: rev', json({ text: m1 }).revision, '->', json({ text: m2 }).revision, '\n  ', m2.slice(0, 160) + '…');

  const bin = path.join(dir, 'harness');
  console.log(`compiling the sample with ${cxx} -Wall -Wextra ...`);
  execFileSync(cxx, ['-std=c++17', '-Wall', '-Wextra', '-Wno-unused-parameter', '-I', path.join(here, 'stubs'), path.join(here, 'test_main.cpp'), '-o', bin], { stdio: 'inherit' });
  const run = spawnSync(bin, [path.join(dir, 'm1.json'), path.join(dir, 'm2.json'), path.join(dir, 'out')], { encoding: 'utf8' });
  process.stdout.write(run.stdout); process.stderr.write(run.stderr.split('\n').filter((l) => l.startsWith('  FAIL')).join('\n') + (run.status ? '\n' : ''));
  assert.equal(run.status, 0, 'C++ harness reported failures');

  // what the C++ built must be accepted by the real server
  const code = json(await call('POST', '/admin/licenses', { count: 1 }, admin.token)).keys[0];
  const player = json(await call('POST', '/auth/register', { username: 'cpp_rider', password: 'password123', birthYear: 1999, signupCode: code }));
  const stats = fs.readFileSync(path.join(dir, 'out/captured_stats.json'), 'utf8'), checkin = fs.readFileSync(path.join(dir, 'out/captured_checkin.json'), 'utf8');
  console.log('C++-built stats body:', stats.slice(0, 150) + '…');
  const gt = json(await call('POST', '/launcher/game-token', {}, player.token)).token ?? player.token;   // game token if hosting is on, else the login token
  assert.equal((await call('PUT', '/game/stats', stats, player.token)).status, 200, 'server rejected the C++ stats body');
  assert.equal((await call('POST', '/game/checkin', checkin, player.token)).status, 200, 'server rejected the C++ check-in body');
  const prof = json(await call('GET', '/players/cpp_rider'));
  assert.equal(prof.level, 7); assert.equal(prof.bestScore, 777);
  assert.deepEqual(prof.tricks.map((t) => [t.name, t.landed]).sort(), [['Boardslide', 3], ['Kickflip', 12]]);
  assert.equal(prof.parks[0].slug, 'rail-yard-austin'); assert.equal(prof.parks[0].bestCombo, 31);
  const parks = json(await call('GET', '/parks')).parks; assert.equal(parks.find((p) => p.slug === 'rail-yard-austin').onlineNow, 1);
  console.log('✓ server accepted the C++-built stats + check-in; profile shows level 7, 2 tricks, park best 777, 1 rider online');
} catch (e) { console.error('✗', e.message); exitCode = 1; }
finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
process.exit(exitCode);
