import { Router } from 'express';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';
import { signToken, requireAuth, requireWeb, rateLimit } from '../auth.js';
import { stripeEnabled } from '../stripe.js';
import { mintCode, revokeLicense } from '../licenses.js';

import crypto from 'node:crypto';

export const router = Router();

// Build hosting is optional (HOST_BUILDS=1). By default your own launcher distributes the game.
router.use(['/launcher', '/admin/builds'], (_req, res, next) => (config.hostBuilds ? next() : res.status(404).json({ error: 'Not found' })));

const buildJson = (b) => ({ id: b.id, kind: b.kind, channel: b.channel, platform: b.platform, version: b.version,
  filename: b.filename, size: b.size, sha256: b.sha256, notes: b.notes, createdAt: b.created_at });

export const ownsGame = (u) => u.role === 'admin' || !!db.prepare('SELECT 1 FROM licenses WHERE user_id = ? AND revoked_at IS NULL').get(u.id);

// Branding for launcher + web: studio name is config so a rename never needs a rebuild.
router.get('/config', (_req, res) => res.json({ studioName: config.studioName, gameName: config.gameName, launcherUrl: config.launcherUrl, hostBuilds: config.hostBuilds, canBuy: stripeEnabled() }));

// Server-to-server: your launcher backend calls this when someone buys/installs the game, then shows the returned
// code to the player (or opens `${PUBLIC_URL}/#/register?code=...`). Idempotent per externalId. Auth: LAUNCHER_API_KEY.
const sameKey = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
router.post('/partner/codes', (req, res) => {
  const given = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!config.partnerApiKey || !sameKey(given, config.partnerApiKey)) return res.status(401).json({ error: 'Bad or missing partner key' });
  const ext = String(req.body?.externalId ?? '').trim().slice(0, 100);
  if (!ext) return res.status(400).json({ error: 'externalId (your customer id) is required' });
  const existing = db.prepare('SELECT key, user_id, revoked_at FROM licenses WHERE external_id = ?').get(ext);
  if (existing?.revoked_at) return res.status(403).json({ error: 'This customer\'s access was revoked' });
  if (existing) return res.json({ code: existing.key, registered: !!existing.user_id, signupUrl: `${config.publicUrl}/#/register?code=${existing.key}` });
  const code = mintCode();
  db.prepare('INSERT INTO licenses (key, external_id, note) VALUES (?,?,?)').run(code, ext, 'partner');
  res.status(201).json({ code, registered: false, signupUrl: `${config.publicUrl}/#/register?code=${code}` });
});

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

// Refund/chargeback on YOUR side (not Stripe)? Tell us and the customer's access ends + account is suspended.
router.delete('/partner/codes/:externalId', (req, res) => {
  const given = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!config.partnerApiKey || !sameKey(given, config.partnerApiKey)) return res.status(401).json({ error: 'Bad or missing partner key' });
  res.json({ revoked: revokeLicense('external_id', req.params.externalId, 'partner revoke') });
});

router.post('/licenses/redeem', requireWeb, rateLimit('redeem', 10, 3600_000), (req, res) => {
  const key = String(req.body?.key ?? '').trim().toUpperCase();
  const lic = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  if (!lic || lic.revoked_at) return res.status(404).json({ error: 'That key is not valid' });
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
