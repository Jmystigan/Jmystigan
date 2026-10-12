import { Router } from 'express';
import crypto from 'node:crypto';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, signToken, ageOf, canSocial, requireAuth, requireWeb, rateLimit } from '../auth.js';
import { sendMail, parentConsentEmail } from '../email.js';

export const router = Router();

export const publicUser = (u) => ({
  id: u.id, username: u.username, role: u.role, age: ageOf(u),
  consentStatus: u.consent_status, social: canSocial(u),
});

const parentLink = (u) => `${config.publicUrl}/#/parent/${u.consent_token}`;
const sendParentEmail = (u) => sendMail({ to: u.parent_email, ...parentConsentEmail(u.username, parentLink(u)) });

router.post('/auth/register', rateLimit('reg', config.registerPerHour, 3600_000, (r) => r.ip), (req, res) => {
  const { username, password, birthYear, parentEmail, signupCode } = req.body ?? {};
  const name = String(username ?? '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return res.status(400).json({ error: 'Username: 3-20 letters, numbers or _ (use a nickname, not your real name)' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const year = Number(birthYear), now = new Date().getFullYear();
  if (!Number.isInteger(year) || year < now - 100 || year > now) return res.status(400).json({ error: 'Enter a valid birth year' });
  const under13 = now - year < 13;
  if (under13 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(parentEmail ?? ''))) return res.status(400).json({ error: 'A parent/guardian email is required for players under 13' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) return res.status(409).json({ error: 'That username is taken' });

  // Customers only: a signup code comes from the game (your launcher) or a game key. The bootstrap admin is exempt.
  const isBootstrapAdmin = !!config.adminUsername && name === config.adminUsername;
  const code = String(signupCode ?? '').trim().toUpperCase();
  const lic = code ? db.prepare('SELECT * FROM licenses WHERE key = ?').get(code) : null;
  if (!isBootstrapAdmin) {
    if (!lic) return res.status(403).json({ error: 'A valid game code is required. Get yours from the launcher after purchasing the game.' });
    if (lic.revoked_at) return res.status(403).json({ error: 'That game code is no longer valid' });
    if (lic.user_id) return res.status(409).json({ error: 'That game code has already been used' });
  }

  const consentToken = under13 ? crypto.randomBytes(24).toString('hex') : null;
  const role = name === config.adminUsername ? 'admin' : 'player';
  const user = tx(() => {
    const r = db.prepare(`INSERT INTO users (username, pass_hash, role, birth_year, parent_email, consent_status, consent_token)
      VALUES (?,?,?,?,?,?,?)`).run(name, hashPassword(password), role, year, under13 ? parentEmail : null, under13 ? 'pending' : 'not_required', consentToken);
    db.prepare('INSERT INTO players (user_id) VALUES (?)').run(r.lastInsertRowid);
    if (lic) db.prepare("UPDATE licenses SET user_id = ?, redeemed_at = datetime('now') WHERE key = ?").run(r.lastInsertRowid, code);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  });
  if (under13) sendParentEmail(user).catch((e) => console.error('[email] parent consent failed:', e.message)); // signup still succeeds; parent can be re-sent
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/auth/login', rateLimit('login', 20, 600_000, (r) => r.ip), (req, res) => {
  const { username, password } = req.body ?? {};
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').toLowerCase());
  // Always run a hash comparison to avoid username-existence timing differences.
  const ok = u ? verifyPassword(String(password ?? ''), u.pass_hash) : (verifyPassword('x', hashPassword('y')), false);
  if (!ok || u.banned === 1) return res.status(401).json({ error: 'Wrong username or password' });
  if (u.banned === 2) return res.status(403).json({ error: `Access ended because the game purchase was refunded or disputed.${config.supportEmail ? ` Contact ${config.supportEmail} if this is a mistake.` : ''}` });
  res.json({ token: signToken(u), user: publicUser(u) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Parent control page (link only ever goes to the parent email). Same token lets them review, approve, or delete.
const parentRow = (token) => (/^[a-f0-9]{48}$/.test(token) ? db.prepare('SELECT * FROM users WHERE consent_token = ?').get(token) : null);
router.get('/parent/:token', rateLimit('parent', 60, 600_000, (r) => r.ip), (req, res) => {
  const u = parentRow(req.params.token);
  if (!u) return res.status(404).json({ error: 'This link is invalid or the account was deleted' });
  const p = db.prepare('SELECT level, best_score, play_seconds FROM players WHERE user_id = ?').get(u.id);
  const tricks = db.prepare('SELECT COUNT(*) c FROM tricks WHERE user_id = ?').get(u.id).c;
  const park = db.prepare('SELECT pk.name FROM park_members m JOIN parks pk ON pk.id = m.park_id WHERE m.user_id = ?').get(u.id);
  res.json({ child: u.username, status: u.consent_status, joined: u.created_at,
    stored: { nickname: u.username, birthYear: u.birth_year, parentEmail: u.parent_email, level: p.level, bestScore: p.best_score, tricksKnown: tricks, representing: park?.name ?? null } });
});
router.post('/parent/:token', rateLimit('parent', 60, 600_000, (r) => r.ip), (req, res) => {
  const u = parentRow(req.params.token);
  if (!u) return res.status(404).json({ error: 'This link is invalid or the account was deleted' });
  const action = req.body?.action;
  if (action === 'approve') {
    db.prepare("UPDATE users SET consent_status = 'approved' WHERE id = ?").run(u.id);
    return res.json({ ok: true, status: 'approved' });
  }
  if (action === 'delete') { db.prepare('DELETE FROM users WHERE id = ?').run(u.id); return res.json({ ok: true, deleted: true }); }
  res.status(400).json({ error: 'action must be approve or delete' });
});
// Child (or parent mistyped nothing) can ask us to re-send the approval email.
router.post('/auth/resend-consent', requireWeb, rateLimit('resend', 3, 3600_000), async (req, res) => {
  if (req.user.consent_status !== 'pending') return res.status(400).json({ error: 'Nothing to approve' });
  try { await sendParentEmail(req.user); } catch { return res.status(502).json({ error: 'Could not send the email right now' }); }
  res.json({ ok: true });
});

// Parents can delete their child's data (COPPA expectation). Players can delete their own account too.
router.delete('/me', requireWeb, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});
