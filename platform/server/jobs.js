import { db } from './db.js';
import { config } from './config.js';

// Data minimisation:
//  - under-13 accounts nobody approved are deleted after PENDING_CONSENT_DAYS
//  - accounts suspended for a refund/dispute are deleted after REFUND_RETENTION_DAYS (window to reverse a mistake or won dispute)
export function purgeUnapproved() {
  const r = db.prepare("DELETE FROM users WHERE consent_status = 'pending' AND created_at < datetime('now', ?)").run(`-${config.pendingConsentDays} days`);
  if (r.changes) console.log(`[jobs] purged ${r.changes} unapproved child account(s)`);
  return r.changes;
}
export function purgeSuspended() {
  const r = db.prepare(`DELETE FROM users WHERE banned = 2 AND id IN
    (SELECT user_id FROM licenses WHERE user_id IS NOT NULL AND revoked_at < datetime('now', ?))`).run(`-${config.refundRetentionDays} days`);
  if (r.changes) console.log(`[jobs] purged ${r.changes} suspended account(s) past retention`);
  return r.changes;
}
const all = () => { purgeUnapproved(); purgeSuspended(); };
export function startJobs() { all(); setInterval(all, 6 * 3600_000).unref(); }
