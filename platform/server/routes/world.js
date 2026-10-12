import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePartner } from '../auth.js';
import { getRevision, releaseRegion } from '../world.js';
import { listParks } from './parks.js';
import { SPOT_SELECT, spotJson } from './spots.js';
import { distanceM, project } from '../geo.js';

export const router = Router();

const regionRows = () => db.prepare(`SELECT r.code, r.name, r.status, r.release_version AS releaseVersion, r.released_at AS releasedAt, r.notes,
    (SELECT COUNT(*) FROM parks p WHERE p.state = r.code) AS parks,
    (SELECT COUNT(*) FROM parks p WHERE p.state = r.code AND p.status = 'in_game') AS live FROM regions r ORDER BY r.name`).all();
const newsRows = (n = 10) => db.prepare('SELECT id, kind, title, body, region, created_at AS createdAt FROM news ORDER BY id DESC LIMIT ?').all(n);

// Everything the website map needs in one call.
router.get('/world', (req, res) => {
  res.json({
    revision: getRevision(), regions: regionRows(), parks: listParks(), news: newsRows(),
    spots: db.prepare(`${SPOT_SELECT} WHERE s.status IN ('approved','planned') ORDER BY votes DESC LIMIT 500`).all(0).map((r) => {
      const j = spotJson(r, null); return { id: j.id, name: j.name, x: j.x, y: j.y, votes: j.votes, status: j.status, tags: j.tags };
    }),
  });
});

// For the LAUNCHER / GAME to poll: "has the world changed since revision N, and what is released?"
// Cheap and public (no personal data). Revision bumps on state release, park add/status change, etc.
router.get('/world/manifest', (req, res) => {
  const rev = getRevision(), since = Number(req.query.since);
  res.set('Cache-Control', 'public, max-age=30');
  if (Number.isFinite(since) && since === rev) return res.json({ revision: rev, changed: false });
  res.json({
    revision: rev, changed: true,
    regions: db.prepare("SELECT code, name, release_version AS version, released_at AS releasedAt FROM regions WHERE status = 'released' ORDER BY name").all(),
    parks: db.prepare(`SELECT p.slug, p.name, p.city, p.state, p.lat, p.lng FROM parks p WHERE p.status = 'in_game' ORDER BY p.state, p.name`).all(),
  });
});

router.get('/news', (_req, res) => res.json({ news: newsRows(30) }));

// Your crew's home feed: news, your park's board, community spots near your park.
router.get('/feed', requireAuth, (req, res) => {
  const home = db.prepare('SELECT pk.id, pk.slug, pk.name, pk.lat, pk.lng FROM park_members m JOIN parks pk ON pk.id = m.park_id WHERE m.user_id = ?').get(req.user.id);
  const posts = home ? db.prepare(`SELECT po.id, CASE WHEN u.profile_private = 1 THEN NULL ELSE u.username END AS username, po.body, po.created_at AS createdAt,
      (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id = po.id) AS respects
    FROM posts po JOIN users u ON u.id = po.user_id WHERE po.park_id = ? AND po.hidden = 0 AND u.banned = 0 AND u.consent_status != 'pending' ORDER BY po.id DESC LIMIT 20`).all(home.id) : [];
  const near = home?.lat == null ? [] : db.prepare(`${SPOT_SELECT} WHERE s.status IN ('approved','planned') ORDER BY s.id DESC LIMIT 100`).all(req.user.id)
    .filter((s) => distanceM(home.lat, home.lng, s.lat, s.lng) < 200_000).slice(0, 10).map((s) => spotJson(s, req.user));
  res.json({ home: home ? { slug: home.slug, name: home.name } : null, news: newsRows(8), posts, spots: near });
});

// Your launcher's build pipeline calls this when a new state ships, so the site, map and news update by themselves.
router.post('/partner/regions/:code/release', requirePartner, (req, res) => {
  try { res.json({ ok: true, ...releaseRegion(String(req.params.code).toUpperCase(), req.body ?? {}) }); }
  catch (e) { res.status(e.status ?? 500).json({ error: e.message }); }
});
