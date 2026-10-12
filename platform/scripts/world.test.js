import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skate-world-'));
Object.assign(process.env, { DATA_DIR: dir, ADMIN_USERNAME: 'boss', REGISTER_PER_HOUR: '1000', LAUNCHER_API_KEY: 'partner-secret' });
const { app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
let server, base;
before(() => new Promise((ok) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; ok(); }); }));
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body, token) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const type = r.headers.get('content-type') ?? '';
  return { status: r.status, body: type.includes('json') ? await r.json().catch(() => null) : Buffer.from(await r.arrayBuffer()), type };
};
const form = (token, url, fields, files = []) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [name, bytes, type] of files) fd.append('photos', new Blob([bytes], { type }), name);
  return fetch(base + url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
};

// tiny hand-built images carrying metadata that must be stripped
const jpegWithExif = () => Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  Buffer.from([0xff, 0xe1, 0x00, 0x20]), Buffer.from('Exif\0\0GPSLatitude=30.27;SerialNumber=1234', 'latin1').subarray(0, 30),
  Buffer.from([0xff, 0xfe, 0x00, 0x0a]), Buffer.from('secretcm'),
  Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]),
  Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
]);
const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); return b; };
const pngWithText = () => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('GPS\0 30.27,-97.74')), chunk('IDAT', Buffer.from([1, 2, 3, 4])), chunk('IEND', Buffer.alloc(0))]);
};

let admin, teen, kid, regCount = 0;
const mint = async () => (await call('POST', '/admin/licenses', { count: 1 }, admin.token)).body.keys[0];
const reg = async (username, birthYear, extra = {}) => (await call('POST', '/auth/register', { username, password: 'password123', birthYear, signupCode: await mint(), ...extra })).body;
const y = new Date().getFullYear();

test('world: regions seeded, parks get map coordinates, state codes validated', async () => {
  admin = (await call('POST', '/auth/register', { username: 'boss', password: 'password123', birthYear: 1990 })).body;
  teen = await reg('spotfinder', y - 16);
  kid = await reg('kidfinder', y - 10, { parentEmail: 'p@example.com' });
  const tok = db.prepare("SELECT consent_token t FROM users WHERE username = 'kidfinder'").get().t;
  await call('POST', `/parent/${tok}`, { action: 'approve' });

  const w = (await call('GET', '/world')).body;
  assert.equal(w.regions.length, 51); assert.equal(w.revision, 1);
  assert.equal(w.regions.find((r) => r.code === 'TX').status, 'planned');

  assert.equal((await call('POST', '/admin/parks', { name: 'Bad', city: 'X', state: 'ZZ' }, admin.token)).status, 400);
  const mk = (b) => call('POST', '/admin/parks', { city: 'Austin', state: 'tx', ...b }, admin.token);
  assert.equal((await mk({ name: 'Rail Yard', lat: 30.27, lng: -97.74, status: 'scanned' })).status, 201);
  assert.equal((await mk({ name: 'Bowl Town', city: 'Dallas', lat: 32.78, lng: -96.8, status: 'scanned' })).status, 201);
  assert.equal((await mk({ name: 'Overseas', lat: 51.5, lng: -0.12 })).status, 201);
  const map = JSON.parse(fs.readFileSync(new URL('../web/us-states.json', import.meta.url), 'utf8'));
  const [x0, y0, x1, y1] = map.states.find((s) => s.code === 'TX').bbox;
  const parks = (await call('GET', '/parks')).body.parks;
  const rail = parks.find((p) => p.name === 'Rail Yard');
  assert.equal(rail.state, 'TX'); // normalised from 'tx'
  assert.ok(rail.x >= x0 && rail.x <= x1 && rail.y >= y0 && rail.y <= y1, 'pin lands inside Texas');
  assert.equal(parks.find((p) => p.name === 'Overseas').x, null); // off-map
  assert.ok((await call('GET', '/world')).body.revision > 1); // park creation bumped it
});

test('open world: releasing a state promotes its parks, posts news, and the launcher manifest reflects it', async () => {
  const before = (await call('GET', '/world/manifest')).body;
  assert.deepEqual(before.regions, []); assert.deepEqual(before.parks, []);
  const rel = (key, code, body) => fetch(`${base}/partner/regions/${code}/release`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  assert.equal((await rel('wrong', 'TX', { version: '1.0.0' })).status, 401);
  assert.equal((await rel('partner-secret', 'TX', { version: 'not a version!' })).status, 400);
  assert.equal((await rel('partner-secret', 'ZZ', { version: '1.0.0' })).status, 404);
  const r = await (await rel('partner-secret', 'tx', { version: '1.0.0', notes: 'Austin & Dallas' })).json();
  assert.equal(r.promoted, 2); assert.ok(r.revision > before.revision);

  const m = (await call('GET', `/world/manifest?since=${before.revision}`)).body;
  assert.equal(m.changed, true);
  assert.deepEqual(m.regions.map((x) => [x.code, x.version]), [['TX', '1.0.0']]);
  assert.deepEqual(m.parks.map((p) => p.name).sort(), ['Bowl Town', 'Rail Yard']);
  assert.deepEqual((await call('GET', `/world/manifest?since=${m.revision}`)).body, { revision: m.revision, changed: false });

  const w = (await call('GET', '/world')).body;
  assert.equal(w.regions.find((x) => x.code === 'TX').status, 'released');
  assert.match(w.news[0].title, /Texas is now open/); assert.match(w.news[0].body, /2 skateparks/);

  // admin route works too; non-admins can't; scanning status posts news
  assert.equal((await call('POST', '/admin/regions/OK/release', { version: '0.1.0' }, teen.token)).status, 403);
  assert.equal((await call('POST', '/admin/regions/NM', { status: 'scanning' }, admin.token)).status, 200);
  assert.match((await call('GET', '/news')).body.news[0].title, /scanning New Mexico/);
});

test('spots: kids pin + tags only, 13+ add name/notes/photos; metadata stripped; nothing public until approved', async () => {
  const pin = { lat: 35.2, lng: -101.8, tags: 'ledge,rail' };
  // kids: no photos, no free text
  const k = await form(kid.token, '/spots', { ...pin, name: 'ignored' });
  assert.equal(k.status, 201);
  assert.equal(db.prepare('SELECT name FROM spots WHERE id = ?').get(k.body.id).name, 'New spot');
  assert.equal((await form(kid.token, '/spots', { lat: 36.1, lng: -101.8 }, [['a.jpg', jpegWithExif(), 'image/jpeg']])).status, 400);

  // validation
  assert.equal((await form(teen.token, '/spots', { lat: 51.5, lng: -0.12, name: 'London spot' })).status, 400); // off-map
  assert.equal((await form(teen.token, '/spots', { ...pin, lat: 36.5, tags: 'nuke', name: 'Bad Tag' })).status, 400);
  assert.equal((await form(teen.token, '/spots', { lat: 36.5, lng: -101.8, name: 'text me 555-123-4567' })).status, 400);
  assert.equal((await form(teen.token, '/spots', { lat: 36.5, lng: -101.8, name: 'Bad Image' }, [['x.jpg', Buffer.from('not an image at all'), 'image/jpeg']])).status, 400);
  assert.equal((await form(teen.token, '/spots', { lat: 36.5, lng: -101.8, name: 'Huge' }, [['x.jpg', Buffer.alloc(7 * 1024 * 1024, 1), 'image/jpeg']])).status, 413);

  // 13+ with a JPEG and a PNG that both carry metadata
  const ok = await form(teen.token, '/spots', { lat: 36.5, lng: -101.8, name: 'Courthouse Ledges', description: 'Smooth marble ledges, quiet on Sundays', tags: 'ledge,plaza' },
    [['a.jpg', jpegWithExif(), 'image/jpeg'], ['b.png', pngWithText(), 'image/png']]);
  assert.equal(ok.status, 201); const id = ok.body.id;
  const stored = fs.readdirSync(path.join(dir, 'uploads'));
  assert.equal(stored.length, 2);
  for (const f of stored) {
    const bytes = fs.readFileSync(path.join(dir, 'uploads', f)).toString('latin1');
    assert.equal(/Exif|GPS|secretcm|SerialNumber|tEXt/.test(bytes), false, `${f} still has metadata`);
  }

  // tapping the map: x,y from our own projection round-trips to (almost) the same place; a tap far from land is refused
  const { project } = await import('../server/geo.js');
  const [mx, my] = project(34.0, -112.0); // Arizona
  const tap = await form(teen.token, '/spots', { x: mx, y: my, name: 'Map Tap Spot' });
  assert.equal(tap.status, 201);
  const tapped = db.prepare('SELECT lat, lng FROM spots WHERE id = ?').get(tap.body.id);
  assert.ok(Math.abs(tapped.lat - 34.0) < 0.2 && Math.abs(tapped.lng + 112.0) < 0.2, `tap -> ${tapped.lat},${tapped.lng}`);
  assert.equal((await form(teen.token, '/spots', { x: 5, y: 5, name: 'Middle Of Ocean' })).status, 400);
  assert.equal((await call('DELETE', `/spots/${tap.body.id}`, null, teen.token)).status, 200);

  // duplicates
  const near = (lat, lng) => form(teen.token, '/spots', { lat, lng, name: 'Same Place' });
  assert.equal((await near(36.50002, -101.80002)).body.spotId, id);          // existing spot
  const dupPark = await near(30.2701, -97.7401);
  assert.equal(dupPark.status, 409); assert.ok(dupPark.body.parkSlug);        // already a park in the game

  // pending => hidden from the public, visible to owner/admin, photos gated the same way
  const pub = (t) => call('GET', '/spots', null, t);
  assert.equal((await pub()).body.spots.some((s) => s.id === id), false);
  assert.equal((await pub(teen.token)).body.spots.find((s) => s.id === id).mine, true);
  const photoUrl = (await pub(teen.token)).body.spots.find((s) => s.id === id).photos[0].replace('/api', '');
  assert.equal((await call('GET', photoUrl)).status, 404);
  assert.equal((await call('GET', photoUrl, null, teen.token)).status, 200);
  assert.equal((await call('GET', photoUrl, null, admin.token)).status, 200);
  assert.equal((await call('GET', '/admin/spots', null, teen.token)).status, 403);
  assert.equal((await call('GET', '/admin/spots', null, admin.token)).body.spots.length, 2);

  // approve -> public with photos; votes (kids may vote); attribution respects privacy
  assert.equal((await call('POST', `/admin/spots/${id}`, { status: 'approved' }, admin.token)).status, 200);
  assert.equal((await call('POST', `/admin/spots/${k.body.id}`, { status: 'approved' }, admin.token)).status, 200);
  const list = (await pub()).body.spots;
  const s = list.find((x) => x.id === id), ks = list.find((x) => x.id === k.body.id);
  assert.equal(s.discoveredBy, 'spotfinder'); assert.equal(ks.discoveredBy, null); // kid stays anonymous
  const photo = await call('GET', s.photos[0].replace('/api', '')); assert.equal(photo.status, 200); assert.match(photo.type, /image\/(jpeg|png)/);
  assert.equal((await call('POST', `/spots/${id}/vote`, null, kid.token)).status, 200);
  await call('POST', `/spots/${id}/vote`, null, kid.token);
  assert.equal((await pub(kid.token)).body.spots.find((x) => x.id === id).votes, 2); // teen + kid, no double vote
  assert.equal((await call('POST', `/spots/${id}/vote`)).status, 401);

  // promote to a park on the tour; finder is credited; revision bumps
  const rev = (await call('GET', '/world')).body.revision;
  assert.equal((await call('POST', `/admin/spots/${id}/promote`, { city: 'Amarillo' }, admin.token)).status, 400); // needs a state
  const pr = await call('POST', `/admin/spots/${id}/promote`, { city: 'Amarillo', state: 'tx', visitDate: '2027-01-15' }, admin.token);
  assert.equal(pr.status, 201);
  const park = (await call('GET', `/parks/${pr.body.slug}`)).body;
  assert.equal(park.park.status, 'scheduled'); assert.equal(park.discoveredBy, 'spotfinder');
  assert.ok((await call('GET', '/world')).body.revision > rev);
  assert.equal((await pub()).body.spots.find((x) => x.id === id).parkSlug, pr.body.slug);
  assert.equal((await call('POST', `/admin/spots/${id}/promote`, { city: 'Amarillo', state: 'TX' }, admin.token)).status, 409);
});

test('spots: withdrawing a pending spot or deleting your account removes the photo files', async () => {
  const mk = async (token, name, lat) => (await form(token, '/spots', { lat, lng: -99.5, name }, [['a.jpg', jpegWithExif(), 'image/jpeg']])).body.id;
  const base0 = fs.readdirSync(path.join(dir, 'uploads')).length;
  const a = await mk(teen.token, 'Withdraw Me', 33.1);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, base0 + 1);
  assert.equal((await call('DELETE', `/spots/${a}`, null, kid.token)).status, 404);   // not yours
  assert.equal((await call('DELETE', `/spots/${a}`, null, teen.token)).status, 200);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, base0);

  const t2 = await reg('leavinguser', y - 20);
  await mk(t2.token, 'Gone With Me', 33.9);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, base0 + 1);
  assert.equal((await call('DELETE', '/me', null, t2.token)).status, 200);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, base0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM spots WHERE name = 'Gone With Me'").get().c, 0);
  // public (approved) spots stay approved-only for non-owners: pending ones from others never leak
  assert.equal((await call('GET', '/spots', null, kid.token)).body.spots.some((s) => s.name === 'Withdraw Me'), false);
});

test('social: respect reactions and the crew feed', async () => {
  const slug = (await call('GET', '/parks')).body.parks.find((p) => p.name === 'Rail Yard').slug;
  for (const t of [teen, kid]) await call('POST', `/parks/${slug}/join`, null, t.token);
  assert.equal((await call('POST', `/parks/${slug}/posts`, { body: 'Who is out tonight?' }, teen.token)).status, 201);
  const pid = (await call('GET', `/parks/${slug}`)).body.posts[0].id;
  assert.equal((await call('POST', `/posts/${pid}/respect`)).status, 401);
  await call('POST', `/posts/${pid}/respect`, null, kid.token); await call('POST', `/posts/${pid}/respect`, null, kid.token);
  await call('POST', `/posts/${pid}/respect`, null, teen.token);
  let post = (await call('GET', `/parks/${slug}`, null, kid.token)).body.posts[0];
  assert.equal(post.respects, 2); assert.equal(post.respected, true);
  await call('DELETE', `/posts/${pid}/respect`, null, kid.token);
  post = (await call('GET', `/parks/${slug}`, null, kid.token)).body.posts[0];
  assert.equal(post.respects, 1); assert.equal(post.respected, false);

  assert.equal((await call('GET', '/feed')).status, 401);
  const feed = (await call('GET', '/feed', null, teen.token)).body;
  assert.equal(feed.home.slug, slug); assert.equal(feed.posts[0].body, 'Who is out tonight?');
  assert.ok(feed.news.length >= 1);
  assert.equal((await call('GET', '/feed', null, admin.token)).body.home, null); // no park represented yet
});
