import { Router } from 'express';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';
import { signToken, requireAuth, requireWeb, rateLimit } from '../auth.js';

export const router = Router();

const buildJson = (b) => ({ id: b.id, kind: b.kind, channel: b.channel, platform: b.platform, version: b.version,
  filename: b.filename, size: b.size, sha256: b.sha256, notes: b.notes, createdAt: b.created_at });

export const ownsGame = (u) => u.role === 'admin' || !!db.prepare('SELECT 1 FROM licenses WHERE user_id = ?').get(u.id);

// Branding for launcher + web: studio name is config so a rename never needs a rebuild.
router.get('/config', (_req, res) => res.json({ studioName: config.studioName, gameName: config.gameName }));

// Latest published build per kind/channel/platform. The launcher polls this to self-update and to update the game.
router.get('/launcher/manifest', (req, res) => {
  const kind = req.query.kind === 'launcher' ? 'launcher' : 'game';
  const channel = req.query.channel === 'beta' ? 'beta' : 'stable';
  const platform = String(req.query.platform ?? 'win64');
  const b = db.prepare('SELECT * FROM builds WHERE kind=? AND channel=? AND platform=? AND published=1 ORDER BY id DESC LIMIT 1').get(kind, channel, platform);
  res.json({ build: b ? { ...buildJson(b), downloadUrl: `/api/launcher/download/${b.id}` } : null, studioName: config.studioName, gameName: config.gameName });
});

// Launcher downloads are public (so people can get the launcher); game builds require a license.
router.get('/launcher/download/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM builds WHERE id = ? AND published = 1').get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Build not found' });
  if (b.kind === 'game') {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    if (!ownsGame(req.user)) return res.status(403).json({ error: 'You need to own the game (redeem a key) to download it' });
  }
  // express/send handles Range requests, so the launcher can resume large downloads.
  res.download(path.join(config.buildsDir, b.stored_as), b.filename);
});

router.get('/library', requireAuth, (req, res) => res.json({ owned: ownsGame(req.user) }));

router.post('/licenses/redeem', requireWeb, rateLimit('redeem', 10, 3600_000), (req, res) => {
  const key = String(req.body?.key ?? '').trim().toUpperCase();
  const lic = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  if (!lic) return res.status(404).json({ error: 'That key is not valid' });
  if (lic.user_id && lic.user_id !== req.user.id) return res.status(409).json({ error: 'That key has already been used' });
  db.prepare("UPDATE licenses SET user_id = ?, redeemed_at = COALESCE(redeemed_at, datetime('now')) WHERE key = ?").run(req.user.id, key);
  res.json({ ok: true });
});

// Launcher -> game handoff: a limited, short-lived token the launcher passes to the game executable
// (e.g. `-JMToken=...`). It can upload stats / check in, but can't touch account or admin endpoints.
router.post('/launcher/game-token', requireWeb, (req, res) => {
  if (!ownsGame(req.user)) return res.status(403).json({ error: 'You need to own the game' });
  res.json({ token: signToken(req.user, 'game') });
});
