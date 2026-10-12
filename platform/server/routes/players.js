import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireSocial, requireWeb } from '../auth.js';

export const router = Router();

export function profileOf(u, viewerId) {
  const p = db.prepare('SELECT * FROM players WHERE user_id = ?').get(u.id);
  const tricks = db.prepare('SELECT name, landed, best_score AS bestScore FROM tricks WHERE user_id = ? ORDER BY best_score DESC, landed DESC').all(u.id);
  const parks = db.prepare(`SELECT pk.slug, pk.name, pk.city, pk.state, ps.best_score AS bestScore, ps.best_combo AS bestCombo
    FROM park_scores ps JOIN parks pk ON pk.id = ps.park_id WHERE ps.user_id = ? ORDER BY ps.best_score DESC`).all(u.id);
  const home = db.prepare('SELECT pk.slug, pk.name FROM park_members m JOIN parks pk ON pk.id = m.park_id WHERE m.user_id = ?').get(u.id);
  const followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id = ?').get(u.id).c;
  const following = viewerId ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, u.id) : false;
  return {
    username: u.username, private: !!u.profile_private, joined: u.created_at, level: p.level, xp: p.xp, bestScore: p.best_score, bestCombo: p.best_combo,
    playHours: Math.round((p.play_seconds / 3600) * 10) / 10, avatar: JSON.parse(p.avatar || '{}'),
    tricks, parks, homePark: home ?? null, followers, following,
  };
}

router.get('/players/search', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (q.length < 2) return res.json({ players: [] });
  const rows = db.prepare(`SELECT u.username, p.level FROM users u JOIN players p ON p.user_id = u.id
    WHERE u.username LIKE ? AND u.banned = 0 AND u.consent_status != 'pending' AND u.profile_private = 0 ORDER BY p.level DESC LIMIT 20`).all(`${q}%`);
  res.json({ players: rows });
});

router.get('/players/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ? AND banned = 0').get(req.params.username.toLowerCase());
  // Pending-approval and private profiles are invisible to everyone but the player (and admins, for moderation).
  const hidden = u && (u.consent_status === 'pending' || u.profile_private);
  if (!u || (hidden && req.user?.id !== u.id && req.user?.role !== 'admin')) return res.status(404).json({ error: 'Player not found' });
  res.json(profileOf(u, req.user?.id));
});

router.post('/players/:username/follow', requireWeb, requireSocial, (req, res) => {
  const t = db.prepare("SELECT id FROM users WHERE username = ? AND banned = 0 AND consent_status != 'pending' AND profile_private = 0").get(req.params.username.toLowerCase());
  if (!t || t.id === req.user.id) return res.status(400).json({ error: 'Cannot follow that player' });
  db.prepare('INSERT OR IGNORE INTO follows VALUES (?,?)').run(req.user.id, t.id);
  res.json({ ok: true });
});
router.delete('/players/:username/follow', requireWeb, (req, res) => {
  const t = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (t) db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, t.id);
  res.json({ ok: true });
});

router.get('/me/profile', requireAuth, (req, res) => res.json(profileOf(req.user, req.user.id)));
