import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skate-test-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_USERNAME = 'boss';
process.env.HOST_BUILDS = '1';
process.env.REGISTER_PER_HOUR = '1000';
process.env.LAUNCHER_API_KEY = 'partner-secret';
const { app } = await import('../server/index.js');
let server, base;
before(() => new Promise((ok) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; ok(); }); }));
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body, token) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let adminToken;
const mint = async () => (await call('POST', '/admin/licenses', { count: 1 }, adminToken)).body.keys[0];
// Signup needs a game code; the bootstrap admin ('boss') is exempt.
const reg = async (username, birthYear = 2000, extra = {}) =>
  call('POST', '/auth/register', { username, password: 'password123', birthYear, signupCode: username === 'boss' ? undefined : await mint(), ...extra });

let admin, teen, kid, parkSlug;

test('register/login, admin bootstrap, validation', async () => {
  admin = (await reg('boss')).body;
  assert.equal(admin.user.role, 'admin');
  adminToken = admin.token;
  assert.equal((await reg('x')).status, 400);
  assert.equal((await reg('boss')).status, 409);
  assert.equal((await call('POST', '/auth/login', { username: 'boss', password: 'nope' })).status, 401);
  teen = (await reg('shredder', new Date().getFullYear() - 15)).body;
  assert.equal(teen.user.social, true);
});

test('signup is customers-only: code required, single-use, partner API mints codes', async () => {
  const body = { username: 'nocode1', password: 'password123', birthYear: 2000 };
  assert.equal((await call('POST', '/auth/register', body)).status, 403);
  assert.equal((await call('POST', '/auth/register', { ...body, signupCode: 'AAAAAA-BBBBBB-CCCCCC' })).status, 403);
  const used = await mint();
  assert.equal((await call('POST', '/auth/register', { ...body, signupCode: used.toLowerCase() })).status, 201); // case-insensitive
  assert.equal((await call('POST', '/auth/register', { ...body, username: 'nocode2', signupCode: used })).status, 409);
  // partner API (your launcher backend)
  const hdr = (k) => ({ method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ externalId: 'cust-42' }) });
  assert.equal((await fetch(`${base}/partner/codes`, hdr('wrong'))).status, 401);
  const a = await (await fetch(`${base}/partner/codes`, hdr('partner-secret'))).json();
  const b = await (await fetch(`${base}/partner/codes`, hdr('partner-secret'))).json();
  assert.equal(a.code, b.code); // idempotent per customer
  assert.equal((await call('POST', '/auth/register', { ...body, username: 'nocode3', signupCode: a.code })).status, 201);
  assert.equal((await (await fetch(`${base}/partner/codes`, hdr('partner-secret'))).json()).registered, true);
});

test('under-13 needs parent email and is locked from social until approved', async () => {
  const y = new Date().getFullYear() - 9;
  assert.equal((await reg('kidskater', y)).status, 400);
  const r = await reg('kidskater', y, { parentEmail: 'parent@example.com' });
  kid = r.body;
  assert.equal(kid.user.social, false);
  // invisible to others while pending
  assert.equal((await call('GET', '/players/kidskater')).status, 404);
  const { db } = await import('../server/db.js');
  const tok = db.prepare('SELECT consent_token t FROM users WHERE username = ?').get('kidskater').t;
  assert.equal((await call('POST', `/consent/${tok}`)).status, 200);
  assert.equal((await call('POST', `/consent/${tok}`)).status, 404); // single use
  assert.equal((await call('GET', '/players/kidskater')).status, 200);
});

test('admin creates a park; non-admin cannot', async () => {
  assert.equal((await call('POST', '/admin/parks', { name: 'X', city: 'Y', state: 'Z' }, teen.token)).status, 403);
  const r = await call('POST', '/admin/parks', { name: 'Test Park', city: 'Austin', state: 'TX', status: 'in_game' }, admin.token);
  assert.equal(r.status, 201); parkSlug = r.body.slug;
  assert.equal((await call('GET', '/parks')).body.parks.length, 1);
});

test('stats upload: bests only increase, caps enforced, bad trick names dropped', async () => {
  const up = (b) => call('PUT', '/game/stats', b, teen.token);
  await up({ level: 5, bestScore: 1000, bestCombo: 10, tricks: [{ name: 'Kickflip', landed: 3, bestScore: 200 }, { name: '<script>', landed: 1 }], parkScores: [{ park: parkSlug, bestScore: 900, bestCombo: 8 }] });
  await up({ level: 2, bestScore: 50, tricks: [{ name: 'Kickflip', landed: 1, bestScore: 10 }] }); // stale upload
  await up({ level: 9999, bestScore: 9e15 });
  const p = (await call('GET', '/players/shredder')).body;
  assert.equal(p.level, 100); // capped
  assert.equal(p.bestScore, 50_000_000);
  assert.equal(p.tricks.length, 1);
  assert.equal(p.tricks[0].landed, 3);
  assert.equal(p.parks[0].bestScore, 900);
});

test('park social: join required, filters, presets for kids, reports auto-hide', async () => {
  const post = (tok, b) => call('POST', `/parks/${parkSlug}/posts`, b, tok);
  assert.equal((await post(teen.token, { body: 'hi' })).status, 403); // not a member
  await call('POST', `/parks/${parkSlug}/join`, null, teen.token);
  assert.equal((await post(teen.token, { body: 'text me 555-123-4567' })).status, 400);
  assert.equal((await post(teen.token, { body: 'add me on snapchat' })).status, 400);
  assert.equal((await post(teen.token, { body: 'Anyone here at 5?' })).status, 201);
  await call('POST', `/parks/${parkSlug}/join`, null, kid.token);
  assert.equal((await post(kid.token, { body: 'free text' })).status, 400); // presets only
  assert.equal((await post(kid.token, { preset: 1 })).status, 201);

  const id = (await call('GET', `/parks/${parkSlug}`)).body.posts.find((p) => p.username === 'shredder').id;
  for (const n of ['rep_one', 'rep_two', 'rep_three']) {
    const t = (await reg(n)).body.token;
    await call('POST', `/posts/${id}/report`, null, t);
  }
  assert.equal((await call('GET', `/parks/${parkSlug}`)).body.posts.some((p) => p.id === id), false);
});

test('represent exactly one park; in-game check-in is presence only', async () => {
  const p2 = (await call('POST', '/admin/parks', { name: 'Second Park', city: 'Dallas', state: 'TX', status: 'in_game' }, admin.token)).body.slug;
  await call('POST', `/parks/${p2}/join`, null, teen.token); // switches from the first
  const me = (await call('GET', '/players/shredder')).body;
  assert.equal(me.homePark.slug, p2);
  assert.equal((await call('GET', `/parks/${parkSlug}`, null, teen.token)).body.isMember, false);
  assert.equal((await call('POST', '/game/checkin', { park: parkSlug }, teen.token)).status, 200);
  assert.equal((await call('GET', '/players/shredder')).body.homePark.slug, p2); // unchanged by check-in
  const list = (await call('GET', '/parks')).body.parks;
  assert.equal(list.find((p) => p.slug === parkSlug).onlineNow, 1); // present, though not representing
  assert.equal(list.find((p) => p.slug === p2).members, 1);
  assert.equal((await call('GET', `/parks/${parkSlug}`)).body.crew.every((c) => c.username !== 'shredder'), true);
  await call('POST', `/parks/${parkSlug}/join`, null, teen.token); // restore for later tests
});

test('launcher: upload, publish, manifest, license-gated download, game token scope', async () => {
  const fd = new FormData();
  Object.entries({ kind: 'game', channel: 'stable', platform: 'win64', version: '1.0.0', notes: 'first' }).forEach(([k, v]) => fd.append(k, v));
  fd.append('file', new Blob(['hello build']), 'game.zip');
  const up = await fetch(`${base}/admin/builds`, { method: 'POST', headers: { authorization: `Bearer ${admin.token}` }, body: fd });
  assert.equal(up.status, 201);
  const { id, sha256 } = await up.json();
  assert.equal((await call('GET', '/launcher/manifest?kind=game&platform=win64')).body.build, null); // unpublished
  await call('POST', `/admin/builds/${id}/publish`, {}, admin.token);
  const m = (await call('GET', '/launcher/manifest?kind=game&platform=win64')).body.build;
  assert.equal(m.version, '1.0.0'); assert.equal(m.sha256, sha256);

  const dl = (tok) => fetch(`${base}/launcher/download/${id}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  assert.equal((await dl()).status, 401);
  const { db } = await import('../server/db.js');
  const { signToken } = await import('../server/auth.js');
  const legacy = db.prepare("INSERT INTO users (username, pass_hash, birth_year, consent_status) VALUES ('nolicense','x',2000,'not_required')").run();
  const legacyTok = signToken({ id: Number(legacy.lastInsertRowid) });
  assert.equal((await dl(legacyTok)).status, 403); // account without a license can't download
  const key = (await call('POST', '/admin/licenses', { count: 1 }, admin.token)).body.keys[0];
  assert.equal((await call('POST', '/licenses/redeem', { key }, teen.token)).status, 200);
  assert.equal((await call('POST', '/licenses/redeem', { key }, kid.token)).status, 409); // already used
  const ok = await dl(teen.token);
  assert.equal(ok.status, 200); assert.equal(await ok.text(), 'hello build');

  const gt = (await call('POST', '/launcher/game-token', null, teen.token)).body.token;
  assert.equal((await call('PUT', '/game/stats', { level: 3 }, gt)).status, 200);
  assert.equal((await call('POST', '/launcher/game-token', null, gt)).status, 403); // game token can't mint tokens
  assert.equal((await call('POST', '/admin/licenses', { count: 1 }, gt)).status, 403);
  assert.equal((await call('DELETE', '/me', null, gt)).status, 403);
});
