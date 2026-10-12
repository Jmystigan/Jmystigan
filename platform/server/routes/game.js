import { Router } from 'express';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { requireAuth, rateLimit } from '../auth.js';

export const router = Router();
const { caps } = config;
const int = (v, max) => Math.min(Math.max(Math.trunc(Number(v) || 0), 0), max);

// The game (via the launcher-issued token) pushes stats here, typically at session end.
// Bests only ever increase server-side, so a stale/replayed upload can't erase progress.
// NOTE: client-reported stats can be forged. Caps are a floor, not real anti-cheat; for ranked
// boards, have a dedicated server validate runs.
router.put('/game/stats', requireAuth, rateLimit('stats', 30, 60_000), (req, res) => {
  const b = req.body ?? {};
  const uid = req.user.id;
  const tricks = Array.isArray(b.tricks) ? b.tricks.slice(0, caps.tricks) : [];
  const parkScores = Array.isArray(b.parkScores) ? b.parkScores.slice(0, 200) : [];
  let avatar = '{}';
  if (b.avatar && typeof b.avatar === 'object') { avatar = JSON.stringify(b.avatar); if (avatar.length > 2000) avatar = '{}'; }

  tx(() => {
    db.prepare(`UPDATE players SET
        level = MAX(level, ?), xp = MAX(xp, ?), best_score = MAX(best_score, ?), best_combo = MAX(best_combo, ?),
        play_seconds = MAX(play_seconds, ?), avatar = CASE WHEN ? = '{}' THEN avatar ELSE ? END, updated_at = datetime('now')
      WHERE user_id = ?`).run(
      Math.max(1, int(b.level, caps.level)), int(b.xp, caps.score), int(b.bestScore, caps.score), int(b.bestCombo, caps.combo),
      int(b.playSeconds, caps.playSeconds), avatar, avatar, uid);

    const up = db.prepare(`INSERT INTO tricks (user_id, name, landed, best_score) VALUES (?,?,?,?)
      ON CONFLICT(user_id, name) DO UPDATE SET landed = MAX(landed, excluded.landed), best_score = MAX(best_score, excluded.best_score)`);
    for (const t of tricks) {
      const name = String(t?.name ?? '').trim();
      if (!/^[A-Za-z0-9 _\-']{1,40}$/.test(name)) continue;
      up.run(uid, name, int(t.landed, 1_000_000), int(t.bestScore, caps.score));
    }

    const park = db.prepare('SELECT id FROM parks WHERE slug = ?');
    const ps = db.prepare(`INSERT INTO park_scores (user_id, park_id, best_score, best_combo) VALUES (?,?,?,?)
      ON CONFLICT(user_id, park_id) DO UPDATE SET best_score = MAX(best_score, excluded.best_score),
        best_combo = MAX(best_combo, excluded.best_combo), updated_at = datetime('now')`);
    for (const s of parkScores) {
      const p = park.get(String(s?.park ?? ''));
      if (p) ps.run(uid, p.id, int(s.bestScore, caps.score), int(s.bestCombo, caps.combo));
    }
  });
  res.json({ ok: true });
});

// Game calls this when the player loads into a park, so "who's here" works.
router.post('/game/checkin', requireAuth, rateLimit('checkin', 30, 60_000), (req, res) => {
  const p = db.prepare('SELECT id FROM parks WHERE slug = ?').get(String(req.body?.park ?? ''));
  if (!p) return res.status(404).json({ error: 'Unknown park' });
  // Presence only. Which park a player *represents* is their choice on the website and never changes from in-game.
  db.prepare(`INSERT INTO park_presence (user_id, park_id) VALUES (?,?)
    ON CONFLICT(user_id, park_id) DO UPDATE SET last_seen = datetime('now')`).run(req.user.id, p.id);
  res.json({ ok: true });
});
