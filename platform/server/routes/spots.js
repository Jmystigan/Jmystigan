import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { requireWeb, requireSocial, rateLimit, ageOf } from '../auth.js';
import { checkText } from '../moderation.js';
import { project, unproject, stateAt, distanceM } from '../geo.js';
import { sanitizeImage } from '../images.js';

export const router = Router();
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const SPOT_TAGS = ['ledge', 'rail', 'stairs', 'bowl', 'pool', 'gap', 'flatground', 'manual pad', 'banks', 'transition', 'plaza', 'ramp'];
const PUBLIC = ['approved', 'planned', 'converted'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 3, fields: 12 } });

const spotJson = (s, viewer) => {
  const p = project(s.lat, s.lng) ?? [null, null];
  const pub = PUBLIC.includes(s.status), canSee = pub || viewer?.id === s.user_id || viewer?.role === 'admin';
  return {
    id: s.id, name: s.name, description: s.description, lat: s.lat, lng: s.lng, state: s.state, x: p[0], y: p[1], tags: JSON.parse(s.tags), status: s.status,
    votes: s.votes, voted: !!s.voted, mine: viewer?.id === s.user_id, createdAt: s.created_at,
    discoveredBy: s.private || !s.username ? null : s.username,
    parkSlug: s.park_slug ?? null,
    photos: canSee ? db.prepare('SELECT id FROM spot_photos WHERE spot_id = ?').all(s.id).map((r) => `/api/spots/${s.id}/photos/${r.id}`) : [],
  };
};
export const SPOT_SELECT = `SELECT s.*, u.username, u.profile_private AS private, pk.slug AS park_slug,
    (SELECT COUNT(*) FROM spot_votes v WHERE v.spot_id = s.id) AS votes,
    EXISTS (SELECT 1 FROM spot_votes v WHERE v.spot_id = s.id AND v.user_id = ?) AS voted
  FROM spots s JOIN users u ON u.id = s.user_id LEFT JOIN parks pk ON pk.id = s.park_id`;
export { spotJson };

router.get('/spots', (req, res) => {
  const rows = db.prepare(`${SPOT_SELECT} WHERE s.status IN ('approved','planned','converted') OR s.user_id = ? ORDER BY votes DESC, s.id DESC LIMIT 500`).all(req.user?.id ?? 0, req.user?.id ?? 0);
  res.json({ spots: rows.map((r) => spotJson(r, req.user)), tags: SPOT_TAGS });
});

// Found a new spot? Drop a pin. Under-13s: pin + tags only (no free text, no photos). 13+: name, notes, up to 3 photos.
// Nothing is public until an admin approves it.
router.post('/spots', requireWeb, requireSocial, rateLimit('spot', 20, 24 * 3600_000), upload.array('photos', 3), (req, res) => {
  const kid = ageOf(req.user) < 13, files = req.files ?? [];
  // Position comes from GPS / pasted coordinates (lat,lng) or from tapping the map (x,y in the map frame).
  let lat = Number(req.body?.lat), lng = Number(req.body?.lng);
  if (req.body?.x !== undefined && req.body?.lat === undefined) { const u = unproject(Number(req.body.x), Number(req.body.y)); lat = u?.lat; lng = u?.lng; }
  const xy = project(lat, lng), state = xy ? stateAt(xy[0], xy[1]) : null;
  if (!state) return res.status(400).json({ error: 'Drop the pin on US land (the map covers the 50 states + DC)' });
  let tags = String(req.body?.tags ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tags.some((t) => !SPOT_TAGS.includes(t))) return res.status(400).json({ error: 'Unknown tag' });
  tags = [...new Set(tags)].slice(0, 8);

  let name = 'New spot', description = '';
  if (kid) {
    if (files.length) return res.status(400).json({ error: 'Photos are for players 13 and over' });
  } else {
    const n = checkText(req.body?.name);
    if (!n.ok || n.text.length < 3 || n.text.length > 60) return res.status(400).json({ error: n.ok ? 'Give the spot a name (3-60 characters)' : n.error });
    name = n.text;
    if (String(req.body?.description ?? '').trim()) {
      const d = checkText(req.body.description);
      if (!d.ok) return res.status(400).json({ error: d.error });
      description = d.text.slice(0, 300);
    }
  }
  const cleaned = [];
  for (const f of files) {
    const img = sanitizeImage(f.buffer);
    if (!img) return res.status(400).json({ error: 'Photos must be real JPG or PNG images' });
    cleaned.push(img);
  }

  // Duplicates: an existing park or spot within ~70 m.
  for (const p of db.prepare('SELECT slug, name, lat, lng FROM parks WHERE lat IS NOT NULL').all())
    if (distanceM(lat, lng, p.lat, p.lng) < 70) return res.status(409).json({ error: `That's already in the game map: ${p.name}`, parkSlug: p.slug });
  for (const s of db.prepare("SELECT id, name, lat, lng FROM spots WHERE status != 'rejected'").all())
    if (distanceM(lat, lng, s.lat, s.lng) < 70) return res.status(409).json({ error: 'Someone already found this spot — give it a vote instead!', spotId: s.id });

  const id = tx(() => {
    const r = db.prepare('INSERT INTO spots (user_id, name, description, lat, lng, tags, state) VALUES (?,?,?,?,?,?,?)').run(req.user.id, name, description, lat, lng, JSON.stringify(tags), state);
    for (const img of cleaned) {
      const stored = `${crypto.randomUUID()}.${img.ext}`;
      fs.writeFileSync(path.join(config.uploadsDir, stored), img.data, { mode: 0o640 });
      db.prepare('INSERT INTO spot_photos (spot_id, stored_as, mime, size) VALUES (?,?,?,?)').run(r.lastInsertRowid, stored, img.mime, img.data.length);
    }
    db.prepare('INSERT OR IGNORE INTO spot_votes VALUES (?,?)').run(r.lastInsertRowid, req.user.id);
    return Number(r.lastInsertRowid);
  });
  res.status(201).json({ id, status: 'pending' });
});

router.get('/spots/:id/photos/:pid', (req, res) => {
  const row = db.prepare(`SELECT sp.stored_as, sp.mime, s.status, s.user_id FROM spot_photos sp JOIN spots s ON s.id = sp.spot_id WHERE sp.id = ? AND s.id = ?`).get(Number(req.params.pid), Number(req.params.id));
  const ok = row && (PUBLIC.includes(row.status) || req.user?.id === row.user_id || req.user?.role === 'admin');
  if (!ok) return res.status(404).end();
  res.set({ 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' });
  res.sendFile(path.join(config.uploadsDir, row.stored_as), { headers: { 'Content-Type': row.mime } });
});

router.post('/spots/:id/vote', requireWeb, requireSocial, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare("SELECT 1 FROM spots WHERE id = ? AND status IN ('approved','planned')").get(id)) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO spot_votes VALUES (?,?)').run(id, req.user.id);
  res.json({ ok: true });
});
router.delete('/spots/:id/vote', requireWeb, (req, res) => {
  db.prepare('DELETE FROM spot_votes WHERE spot_id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// Withdraw your own spot (only before it goes public).
router.delete('/spots/:id', requireWeb, (req, res) => {
  const s = db.prepare('SELECT id, status FROM spots WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (!['pending', 'rejected'].includes(s.status)) return res.status(409).json({ error: 'This spot is already public — ask an admin to remove it' });
  for (const p of db.prepare('SELECT stored_as FROM spot_photos WHERE spot_id = ?').all(s.id)) fs.rmSync(path.join(config.uploadsDir, p.stored_as), { force: true });
  db.prepare('DELETE FROM spots WHERE id = ?').run(s.id);
  res.json({ ok: true });
});
