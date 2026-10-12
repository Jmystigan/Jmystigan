import { Router } from 'express';
import crypto from 'node:crypto';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, signToken, ageOf, canSocial, requireAuth, requireWeb, rateLimit } from '../auth.js';

export const router = Router();

export const publicUser = (u) => ({
  id: u.id, username: u.username, role: u.role, age: ageOf(u),
  consentStatus: u.consent_status, social: canSocial(u),
});

router.post('/auth/register', rateLimit('reg', 10, 3600_000, (r) => r.ip), (req, res) => {
  const { username, password, birthYear, parentEmail } = req.body ?? {};
  const name = String(username ?? '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return res.status(400).json({ error: 'Username: 3-20 letters, numbers or _ (use a nickname, not your real name)' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const year = Number(birthYear), now = new Date().getFullYear();
  if (!Number.isInteger(year) || year < now - 100 || year > now) return res.status(400).json({ error: 'Enter a valid birth year' });
  const under13 = now - year < 13;
  if (under13 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(parentEmail ?? ''))) return res.status(400).json({ error: 'A parent/guardian email is required for players under 13' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) return res.status(409).json({ error: 'That username is taken' });

  const consentToken = under13 ? crypto.randomBytes(24).toString('hex') : null;
  const role = name === config.adminUsername ? 'admin' : 'player';
  const user = tx(() => {
    const r = db.prepare(`INSERT INTO users (username, pass_hash, role, birth_year, parent_email, consent_status, consent_token)
      VALUES (?,?,?,?,?,?,?)`).run(name, hashPassword(password), role, year, under13 ? parentEmail : null, under13 ? 'pending' : 'not_required', consentToken);
    db.prepare('INSERT INTO players (user_id) VALUES (?)').run(r.lastInsertRowid);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  });
  if (under13) {
    // TODO: send this link by email (SES/Postmark/etc). Logged for development only.
    console.log(`[consent] ${config.publicUrl}/#/consent/${consentToken}  (parent: ${parentEmail}, child: ${name})`);
  }
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/auth/login', rateLimit('login', 20, 600_000, (r) => r.ip), (req, res) => {
  const { username, password } = req.body ?? {};
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').toLowerCase());
  // Always run a hash comparison to avoid username-existence timing differences.
  const ok = u ? verifyPassword(String(password ?? ''), u.pass_hash) : (verifyPassword('x', hashPassword('y')), false);
  if (!ok || u.banned) return res.status(401).json({ error: 'Wrong username or password' });
  res.json({ token: signToken(u), user: publicUser(u) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Parent opens the emailed link; the web page posts here.
router.get('/consent/:token', (req, res) => {
  const u = db.prepare("SELECT username FROM users WHERE consent_token = ? AND consent_status = 'pending'").get(req.params.token);
  if (!u) return res.status(404).json({ error: 'This link is invalid or already used' });
  res.json({ child: u.username });
});
router.post('/consent/:token', (req, res) => {
  const r = db.prepare("UPDATE users SET consent_status = 'approved', consent_token = NULL WHERE consent_token = ? AND consent_status = 'pending'").run(req.params.token);
  if (!r.changes) return res.status(404).json({ error: 'This link is invalid or already used' });
  res.json({ ok: true });
});

// Parents can delete their child's data (COPPA expectation). Players can delete their own account too.
router.delete('/me', requireWeb, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});
