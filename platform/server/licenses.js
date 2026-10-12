import crypto from 'node:crypto';
import { db } from './db.js';

export const mintCode = () => Array.from({ length: 3 }, () => crypto.randomBytes(3).toString('hex').toUpperCase()).join('-');

// users.banned: 0 = ok, 1 = banned by an admin, 2 = suspended because the purchase was refunded/disputed.
const COLS = new Set(['key', 'external_id', 'payment_intent']);

/** Ends access for the license(s) matching column=value, and suspends the account that used it. */
export function revokeLicense(col, value, reason) {
  if (!COLS.has(col) || !value) return 0;
  const rows = db.prepare(`SELECT key, user_id FROM licenses WHERE ${col} = ? AND revoked_at IS NULL`).all(value);
  for (const l of rows) {
    db.prepare("UPDATE licenses SET revoked_at = datetime('now'), revoked_reason = ? WHERE key = ?").run(reason, l.key);
    if (l.user_id) db.prepare('UPDATE users SET banned = 2 WHERE id = ? AND banned = 0').run(l.user_id);
  }
  return rows.length;
}

/** Undo a revoke (e.g. dispute won, or a refund was a mistake). */
export function reinstateLicense(col, value) {
  if (!COLS.has(col) || !value) return 0;
  const rows = db.prepare(`SELECT key, user_id FROM licenses WHERE ${col} = ? AND revoked_at IS NOT NULL`).all(value);
  for (const l of rows) {
    db.prepare('UPDATE licenses SET revoked_at = NULL, revoked_reason = NULL WHERE key = ?').run(l.key);
    if (l.user_id) db.prepare('UPDATE users SET banned = 0 WHERE id = ? AND banned = 2').run(l.user_id);
  }
  return rows.length;
}
