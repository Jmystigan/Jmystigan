import { db } from './db.js';
import { config } from './config.js';
import { deleteUsers } from './users.js';

// Data minimisation:
//  - under-13 accounts nobody approved are deleted after PENDING_CONSENT_DAYS
//  - accounts suspended for a refund/dispute are deleted after REFUND_RETENTION_DAYS (window to reverse a mistake or won dispute)
export function purgeUnapproved() {
  const ids = db.prepare("SELECT id FROM users WHERE consent_status = 'pending' AND created_at < datetime('now', ?)").all(`-${config.pendingConsentDays} days`).map((r) => r.id);
  const n = deleteUsers(ids);
  if (n) console.log(`[jobs] purged ${n} unapproved child account(s)`);
  return n;
}
export function purgeSuspended() {
  const ids = db.prepare(`SELECT id FROM users WHERE banned = 2 AND id IN
    (SELECT user_id FROM licenses WHERE user_id IS NOT NULL AND revoked_at < datetime('now', ?))`).all(`-${config.refundRetentionDays} days`).map((r) => r.id);
  const n = deleteUsers(ids);
  if (n) console.log(`[jobs] purged ${n} suspended account(s) past retention`);
  return n;
}
const all = () => { purgeUnapproved(); purgeSuspended(); };
export function startJobs() { all(); setInterval(all, 6 * 3600_000).unref(); }
