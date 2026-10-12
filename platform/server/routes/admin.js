import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from '../auth.js';
import { revokeLicense, reinstateLicense } from '../licenses.js';
import { releaseRegion, setRegionStatus, bumpRevision, addNews } from '../world.js';
import { SPOT_SELECT, spotJson } from './spots.js';
import { tx } from '../db.js';

export const router = Router();
router.use('/admin', requireAdmin);
router.use('/admin/builds', (_req, res, next) => (config.hostBuilds ? next() : res.status(404).json({ error: 'Build hosting is off (set HOST_BUILDS=1)' })));
fs.mkdirSync(config.buildsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: config.buildsDir,
    filename: (_r, _f, cb) => cb(null, crypto.randomUUID()), // never trust the client's filename on disk
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

const sha256 = (file) => new Promise((ok, fail) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
});

// Drag-and-drop target in the admin UI posts here. For multi-GB builds in production, move storage to
// S3/R2 with presigned uploads (see docs/ARCHITECTURE.md) — the manifest contract stays the same.
router.post('/admin/builds', upload.single('file'), async (req, res) => {
  const f = req.file;
  try {
    const { kind, channel = 'stable', platform, version, notes = '' } = req.body;
    if (!f) return res.status(400).json({ error: 'No file received' });
    if (!['game', 'launcher'].includes(kind) || !['stable', 'beta'].includes(channel)
      || !['win64', 'mac', 'linux', 'android', 'ios'].includes(platform) || !/^[\w.\-+]{1,32}$/.test(version ?? '')) {
      fs.rmSync(f.path, { force: true });
      return res.status(400).json({ error: 'kind, channel, platform and version are required and must be valid' });
    }
    const hash = await sha256(f.path);
    const r = db.prepare(`INSERT INTO builds (kind, channel, platform, version, filename, stored_as, size, sha256, notes, published)
      VALUES (?,?,?,?,?,?,?,?,?,0)`).run(kind, channel, platform, version, path.basename(f.originalname), path.basename(f.path), f.size, hash, String(notes).slice(0, 2000));
    res.status(201).json({ id: Number(r.lastInsertRowid), sha256: hash, size: f.size });
  } catch (e) { if (f) fs.rmSync(f.path, { force: true }); throw e; }
});

router.get('/admin/builds', (_req, res) => {
  res.json({ builds: db.prepare('SELECT id, kind, channel, platform, version, filename, size, sha256, notes, published, created_at AS createdAt FROM builds ORDER BY id DESC').all() });
});
// Publishing makes this build the "latest" for its kind/channel/platform. Unpublish to roll back.
router.post('/admin/builds/:id/publish', (req, res) => {
  const r = db.prepare('UPDATE builds SET published = ? WHERE id = ?').run(req.body?.published === false ? 0 : 1, Number(req.params.id));
  res.status(r.changes ? 200 : 404).json(r.changes ? { ok: true } : { error: 'Not found' });
});
router.delete('/admin/builds/:id', (req, res) => {
  const b = db.prepare('SELECT stored_as FROM builds WHERE id = ?').get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM builds WHERE id = ?').run(Number(req.params.id));
  fs.rmSync(path.join(config.buildsDir, b.stored_as), { force: true });
  res.json({ ok: true });
});

// Parks (the tour)
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const STATUSES = ['planned', 'scheduled', 'scanned', 'in_game'];
router.post('/admin/parks', (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.city || !b.state) return res.status(400).json({ error: 'name, city and state are required' });
  b.state = String(b.state).toUpperCase();
  if (!db.prepare('SELECT 1 FROM regions WHERE code = ?').get(b.state)) return res.status(400).json({ error: 'State must be a 2-letter US state code (e.g. TX)' });
  if (b.status && !STATUSES.includes(b.status)) return res.status(400).json({ error: 'Bad status' });
  const slug = slugify(`${b.name}-${b.city}`);
  try {
    db.prepare('INSERT INTO parks (slug, name, city, state, lat, lng, status, visit_date, description) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(slug, b.name, b.city, b.state, b.lat ?? null, b.lng ?? null, b.status ?? 'planned', b.visitDate || null, b.description ?? '');
  } catch { return res.status(409).json({ error: 'A park with that name/city already exists' }); }
  bumpRevision();
  res.status(201).json({ slug });
});
router.patch('/admin/parks/:slug', (req, res) => {
  const b = req.body ?? {};
  if (b.status && !STATUSES.includes(b.status)) return res.status(400).json({ error: 'Bad status' });
  const cur = db.prepare('SELECT * FROM parks WHERE slug = ?').get(req.params.slug);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE parks SET name=?, city=?, state=?, lat=?, lng=?, status=?, visit_date=?, description=? WHERE slug=?').run(
    b.name ?? cur.name, b.city ?? cur.city, b.state ?? cur.state, b.lat ?? cur.lat, b.lng ?? cur.lng,
    b.status ?? cur.status, b.visitDate === undefined ? cur.visit_date : (b.visitDate || null), b.description ?? cur.description, req.params.slug);
  bumpRevision();
  res.json({ ok: true });
});

// License keys: generate batches to sell/hand out. (If you sell via Steam/Epic, sync ownership here instead.)
router.post('/admin/licenses', (req, res) => {
  const n = Math.min(Math.max(Number(req.body?.count) || 1, 1), 500);
  const note = String(req.body?.note ?? '').slice(0, 100);
  const keys = [];
  const ins = db.prepare('INSERT INTO licenses (key, note) VALUES (?,?)');
  for (let i = 0; i < n; i++) {
    const k = Array.from({ length: 3 }, () => crypto.randomBytes(3).toString('hex').toUpperCase()).join('-');
    ins.run(k, note); keys.push(k);
  }
  res.status(201).json({ keys });
});
router.post('/admin/licenses/:key/revoke', (req, res) => {
  const n = revokeLicense('key', String(req.params.key).toUpperCase(), String(req.body?.reason ?? 'admin revoke').slice(0, 100));
  res.status(n ? 200 : 404).json(n ? { ok: true } : { error: 'No active license with that key' });
});
router.post('/admin/licenses/:key/reinstate', (req, res) => {
  const n = reinstateLicense('key', String(req.params.key).toUpperCase());
  res.status(n ? 200 : 404).json(n ? { ok: true } : { error: 'That license is not revoked' });
});
router.get('/admin/licenses', (_req, res) => {
  res.json({ licenses: db.prepare(`SELECT l.key, l.note, l.email, l.revoked_at AS revokedAt, l.revoked_reason AS revokedReason, l.created_at AS createdAt, l.redeemed_at AS redeemedAt, u.username AS redeemedBy
    FROM licenses l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 500`).all() });
});

// Moderation
router.get('/admin/reports', (_req, res) => {
  res.json({ reports: db.prepare(`SELECT po.id AS postId, po.body, po.hidden, u.username AS author, pk.name AS park,
      COUNT(r.id) AS reports FROM reports r JOIN posts po ON po.id = r.post_id JOIN users u ON u.id = po.user_id
      JOIN parks pk ON pk.id = po.park_id WHERE r.status = 'open' GROUP BY po.id ORDER BY reports DESC`).all() });
});
router.post('/admin/posts/:id/moderate', (req, res) => {
  const id = Number(req.params.id);
  const remove = req.body?.action === 'remove';
  db.prepare('UPDATE posts SET hidden = ? WHERE id = ?').run(remove ? 1 : 0, id);
  db.prepare("UPDATE reports SET status = 'closed' WHERE post_id = ?").run(id);
  res.json({ ok: true });
});
router.get('/admin/users', (req, res) => {
  const q = `${String(req.query.q ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')}%`;
  res.json({ users: db.prepare(`SELECT id, username, role, banned, consent_status AS consentStatus, parent_email AS parentEmail, created_at AS createdAt
    FROM users WHERE username LIKE ? ORDER BY id DESC LIMIT 100`).all(q) });
});
router.post('/admin/users/:id', (req, res) => {
  const { banned, role } = req.body ?? {};
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't change your own account here" });
  if (banned === false) { // un-ban also lifts a refund suspension and restores their license
    for (const l of db.prepare('SELECT key FROM licenses WHERE user_id = ?').all(id)) reinstateLicense('key', l.key);
  }
  if (banned !== undefined) db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id);
  if (role === 'admin' || role === 'player') db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ ok: true });
});
router.post('/admin/requests/:id/delete', (req, res) => {
  db.prepare('DELETE FROM park_requests WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Open world: regions (states)
router.get('/admin/regions', (_req, res) => {
  res.json({ regions: db.prepare(`SELECT r.code, r.name, r.status, r.release_version AS releaseVersion, r.released_at AS releasedAt, r.notes,
    (SELECT COUNT(*) FROM parks p WHERE p.state = r.code) AS parks FROM regions r ORDER BY r.name`).all() });
});
router.post('/admin/regions/:code/release', (req, res) => {
  try { res.json({ ok: true, ...releaseRegion(req.params.code.toUpperCase(), req.body ?? {}) }); }
  catch (e) { res.status(e.status ?? 500).json({ error: e.message }); }
});
router.post('/admin/regions/:code', (req, res) => {
  try { res.json({ ok: true, revision: setRegionStatus(req.params.code.toUpperCase(), req.body?.status, req.body?.notes) }); }
  catch (e) { res.status(e.status ?? 500).json({ error: e.message }); }
});
router.post('/admin/news', (req, res) => {
  const title = String(req.body?.title ?? '').trim().slice(0, 120);
  if (!title) return res.status(400).json({ error: 'title is required' });
  addNews('news', title, String(req.body?.body ?? '').slice(0, 500));
  res.status(201).json({ ok: true });
});

// ---- Spot submissions from riders
router.get('/admin/spots', (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'planned', 'converted'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ spots: db.prepare(`${SPOT_SELECT} WHERE s.status = ? ORDER BY votes DESC, s.id DESC LIMIT 200`).all(0, status)
    .map((r) => ({ ...spotJson(r, req.user), submittedBy: r.username, adminNote: r.admin_note })) });
});
router.post('/admin/spots/:id', (req, res) => {
  const { status, note } = req.body ?? {};
  if (!['approved', 'rejected', 'planned', 'pending'].includes(status)) return res.status(400).json({ error: 'status must be approved, rejected, planned or pending' });
  const r = db.prepare('UPDATE spots SET status = ?, admin_note = COALESCE(?, admin_note) WHERE id = ? AND status != ?').run(status, note ?? null, Number(req.params.id), 'converted');
  if (!r.changes) return res.status(404).json({ error: 'Not found (or already converted to a park)' });
  bumpRevision();
  res.json({ ok: true });
});
// Turn a rider-found spot into a stop on the tour: creates a park (planned/scheduled) and credits the finder.
router.post('/admin/spots/:id/promote', (req, res) => {
  const spot = db.prepare('SELECT * FROM spots WHERE id = ?').get(Number(req.params.id));
  if (!spot) return res.status(404).json({ error: 'Not found' });
  if (spot.status === 'converted') return res.status(409).json({ error: 'Already converted' });
  const b = req.body ?? {};
  const state = String(b.state || spot.state || '').toUpperCase(), city = String(b.city ?? '').trim();
  if (!city || !db.prepare('SELECT 1 FROM regions WHERE code = ?').get(state)) return res.status(400).json({ error: 'city is required (and a 2-letter state if the spot has none)' });
  const name = String(b.name || spot.name).trim().slice(0, 80);
  const slugBase = `${name}-${city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  try {
    const out = tx(() => {
      const r = db.prepare('INSERT INTO parks (slug, name, city, state, lat, lng, status, visit_date, description, spot_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(slugBase, name, city, state, spot.lat, spot.lng, b.visitDate ? 'scheduled' : 'planned', b.visitDate || null, spot.description, spot.id);
      db.prepare("UPDATE spots SET status = 'converted', park_id = ? WHERE id = ?").run(r.lastInsertRowid, spot.id);
      addNews('tour', `New stop on the tour: ${name}`, `${city}, ${state} — found by a rider.`, state);
      bumpRevision();
      return slugBase;
    });
    res.status(201).json({ slug: out });
  } catch { res.status(409).json({ error: 'A park with that name/city already exists' }); }
});
