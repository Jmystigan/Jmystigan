import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [s, h] = stored.split(':');
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'hex'));
}

// scope 'web' = full session; 'game' = short-lived token handed from launcher to game (stats/check-in only).
export function signToken(user, scope = 'web') {
  return jwt.sign({ sub: user.id, scope }, config.jwtSecret, { expiresIn: scope === 'game' ? '12h' : '30d' });
}

export const ageOf = (u) => new Date().getFullYear() - u.birth_year;
// Social features need either age 13+ or parental consent on file.
export const canSocial = (u) => u.consent_status !== 'pending';

export function loadUser(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const p = jwt.verify(h.slice(7), config.jwtSecret);
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(p.sub);
      if (u && !u.banned) { req.user = u; req.scope = p.scope; }
    } catch { /* invalid token => anonymous */ }
  }
  next();
}
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}
// Web-session only (not the limited game token).
export function requireWeb(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (req.scope !== 'web') return res.status(403).json({ error: 'Not allowed with a game token' });
  next();
}
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (req.scope !== 'web' || req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}
export function requireSocial(req, res, next) {
  if (!canSocial(req.user)) return res.status(403).json({ error: 'Waiting on parent/guardian approval for social features' });
  next();
}

// Tiny in-memory fixed-window limiter (per key). Swap for Redis if you run multiple instances.
const hits = new Map();
export function rateLimit(name, max, windowMs, keyFn = (req) => req.user?.id ?? req.ip) {
  return (req, res, next) => {
    const k = `${name}:${keyFn(req)}`, now = Date.now();
    const e = hits.get(k);
    if (!e || now > e.reset) hits.set(k, { n: 1, reset: now + windowMs });
    else if (++e.n > max) return res.status(429).json({ error: 'Slow down a little' });
    next();
  };
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (n > v.reset) hits.delete(k); }, 60_000).unref();

// Server-to-server calls from your launcher backend (shared secret in LAUNCHER_API_KEY; never ship it in a client).
export function requirePartner(req, res, next) {
  const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(config.partnerApiKey);
  if (!config.partnerApiKey || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Bad or missing partner key' });
  next();
}
