import { Router } from 'express';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { requireWeb, requireSocial, rateLimit, ageOf } from '../auth.js';
import { PRESETS, checkText } from '../moderation.js';

export const router = Router();
const recent = `datetime('now', '-${config.presenceMinutes} minutes')`;

router.get('/parks', (_req, res) => {
  const parks = db.prepare(`SELECT p.slug, p.name, p.city, p.state, p.lat, p.lng, p.status, p.visit_date AS visitDate, p.description,
      (SELECT COUNT(*) FROM park_members m JOIN users u ON u.id = m.user_id WHERE m.park_id = p.id AND u.banned = 0 AND u.consent_status != 'pending') AS members,
      (SELECT COALESCE(SUM(pl.best_score), 0) FROM park_members m JOIN players pl ON pl.user_id = m.user_id JOIN users u ON u.id = m.user_id
         WHERE m.park_id = p.id AND u.banned = 0 AND u.consent_status != 'pending') AS crewScore,
      (SELECT COUNT(*) FROM park_presence s WHERE s.park_id = p.id AND s.last_seen >= ${recent}) AS onlineNow
    FROM parks p ORDER BY CASE p.status WHEN 'in_game' THEN 0 WHEN 'scanned' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END, p.state, p.name`).all();
  res.json({ parks });
});

router.get('/parks/presets', (_req, res) => res.json({ presets: PRESETS }));

router.get('/parks/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM parks WHERE slug = ?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Park not found' });
  const visible = "u.banned = 0 AND u.consent_status != 'pending'";
  const leaderboard = db.prepare(`SELECT u.username, ps.best_score AS bestScore, ps.best_combo AS bestCombo FROM park_scores ps
    JOIN users u ON u.id = ps.user_id WHERE ps.park_id = ? AND ${visible} ORDER BY ps.best_score DESC LIMIT 20`).all(p.id);
  const crew = db.prepare(`SELECT u.username, pl.level, pl.best_score AS bestScore,
      EXISTS (SELECT 1 FROM park_presence s WHERE s.user_id = u.id AND s.park_id = m.park_id AND s.last_seen >= ${recent}) AS online
    FROM park_members m JOIN users u ON u.id = m.user_id JOIN players pl ON pl.user_id = u.id
    WHERE m.park_id = ? AND ${visible} ORDER BY online DESC, pl.best_score DESC LIMIT 100`).all(p.id);
  const posts = db.prepare(`SELECT po.id, u.username, po.body, po.created_at AS createdAt FROM posts po
    JOIN users u ON u.id = po.user_id WHERE po.park_id = ? AND po.hidden = 0 AND ${visible} ORDER BY po.id DESC LIMIT 50`).all(p.id);
  const isMember = req.user ? !!db.prepare('SELECT 1 FROM park_members WHERE user_id = ? AND park_id = ?').get(req.user.id, p.id) : false;
  const mineRow = req.user ? db.prepare('SELECT pk.slug, pk.name FROM park_members m JOIN parks pk ON pk.id = m.park_id WHERE m.user_id = ?').get(req.user.id) : null;
  res.json({ park: { slug: p.slug, name: p.name, city: p.city, state: p.state, lat: p.lat, lng: p.lng, status: p.status, visitDate: p.visit_date, description: p.description },
    leaderboard, crew: crew.map((c) => ({ ...c, online: !!c.online })), posts, isMember, representing: mineRow ?? null });
});

router.post('/parks/:slug/join', requireWeb, requireSocial, (req, res) => {
  const p = db.prepare('SELECT id FROM parks WHERE slug = ?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Park not found' });
  // You represent exactly one park: representing a new one replaces the old.
  tx(() => {
    db.prepare('DELETE FROM park_members WHERE user_id = ? AND park_id != ?').run(req.user.id, p.id);
    db.prepare('INSERT OR IGNORE INTO park_members (user_id, park_id) VALUES (?,?)').run(req.user.id, p.id);
  });
  res.json({ ok: true });
});
router.delete('/parks/:slug/join', requireWeb, (req, res) => {
  const p = db.prepare('SELECT id FROM parks WHERE slug = ?').get(req.params.slug);
  if (p) db.prepare('DELETE FROM park_members WHERE user_id = ? AND park_id = ?').run(req.user.id, p.id);
  res.json({ ok: true });
});

// Under-13s send preset phrases only (body: {preset: index}); 13+ send filtered free text.
router.post('/parks/:slug/posts', requireWeb, requireSocial, rateLimit('post', 6, 60_000), (req, res) => {
  const p = db.prepare('SELECT id FROM parks WHERE slug = ?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Park not found' });
  const member = db.prepare('SELECT 1 FROM park_members WHERE user_id = ? AND park_id = ?').get(req.user.id, p.id);
  if (!member) return res.status(403).json({ error: 'Represent this park to post on its board' });
  let body;
  if (ageOf(req.user) < 13) {
    body = PRESETS[Number(req.body?.preset)];
    if (!body) return res.status(400).json({ error: 'Pick a quick message' });
  } else {
    const c = checkText(req.body?.body);
    if (!c.ok) return res.status(400).json({ error: c.error });
    body = c.text;
  }
  const r = db.prepare('INSERT INTO posts (park_id, user_id, body) VALUES (?,?,?)').run(p.id, req.user.id, body);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.post('/posts/:id/report', requireWeb, rateLimit('report', 20, 3600_000), (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO reports (post_id, reporter_id) VALUES (?,?)').run(post.id, req.user.id);
  // Three independent reports auto-hide pending admin review.
  const n = db.prepare("SELECT COUNT(*) c FROM reports WHERE post_id = ? AND status = 'open'").get(post.id).c;
  if (n >= 3) db.prepare('UPDATE posts SET hidden = 1 WHERE id = ?').run(post.id);
  res.json({ ok: true });
});

// "Bring the developer to my park" requests, with votes — drives the tour order.
router.get('/requests', (req, res) => {
  const rows = db.prepare(`SELECT r.id, r.name, r.city, r.state, r.note, u.username AS requestedBy,
      (SELECT COUNT(*) FROM request_votes v WHERE v.request_id = r.id) AS votes
    FROM park_requests r JOIN users u ON u.id = r.user_id ORDER BY votes DESC, r.id DESC LIMIT 100`).all();
  const mine = req.user ? new Set(db.prepare('SELECT request_id FROM request_votes WHERE user_id = ?').all(req.user.id).map((x) => x.request_id)) : new Set();
  res.json({ requests: rows.map((r) => ({ ...r, voted: mine.has(r.id) })) });
});
router.post('/requests', requireWeb, requireSocial, rateLimit('req', 5, 3600_000), (req, res) => {
  const { name, city, state, note } = req.body ?? {};
  const fields = [name, city, state, note ?? ''].map((x) => String(x ?? '').trim());
  if (!fields[0] || !fields[1] || !fields[2]) return res.status(400).json({ error: 'Park name, city and state are required' });
  for (const f of fields) { const c = f ? checkText(f) : { ok: true }; if (!c.ok) return res.status(400).json({ error: c.error }); }
  const r = db.prepare('INSERT INTO park_requests (user_id, name, city, state, note) VALUES (?,?,?,?,?)')
    .run(req.user.id, fields[0].slice(0, 80), fields[1].slice(0, 60), fields[2].slice(0, 30), fields[3].slice(0, 200));
  db.prepare('INSERT OR IGNORE INTO request_votes VALUES (?,?)').run(Number(r.lastInsertRowid), req.user.id);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
router.post('/requests/:id/vote', requireWeb, requireSocial, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM park_requests WHERE id = ?').get(id)) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO request_votes VALUES (?,?)').run(id, req.user.id);
  res.json({ ok: true });
});
router.delete('/requests/:id/vote', requireWeb, (req, res) => {
  db.prepare('DELETE FROM request_votes WHERE request_id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});
