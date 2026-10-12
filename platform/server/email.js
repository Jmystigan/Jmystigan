import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Plain-text email only (no HTML => nothing to inject). Swap the body of send() to use Postmark/SES instead of Resend.
export const outbox = []; // dev/test: captured messages when no provider is configured

export async function sendMail({ to, subject, text }) {
  if (!config.resendKey || !config.emailFrom) {
    outbox.push({ to, subject, text, at: new Date().toISOString() });
    if (outbox.length > 100) outbox.shift();
    fs.appendFileSync(path.join(config.dataDir, 'outbox.log'), `\n--- ${new Date().toISOString()} to ${to}\n${subject}\n\n${text}\n`);
    console.log(`[email:dev] to=${to} subject="${subject}" (set RESEND_API_KEY + EMAIL_FROM to really send)`);
    return { dev: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text, reply_to: config.supportEmail || undefined }),
  });
  if (!r.ok) throw new Error(`Email provider error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { dev: false };
}

const sig = () => `\n\n— ${config.studioName}${config.supportEmail ? `\nQuestions? ${config.supportEmail}` : ''}`;

export function parentConsentEmail(child, parentLink) {
  return {
    subject: `Please review ${config.gameName} account for your child`,
    text: `Hello,

Someone signed up for ${config.gameName} (from ${config.studioName}) with this email as the parent/guardian contact. The player's nickname is "${child}". Because they are under 13, their account stays locked until you approve it.

WHAT WE COLLECT: the nickname, birth year, this parent email, and in-game stats (level, tricks, scores). No real name, address, phone number or photo. We show no ads and never sell data.
WHAT THEY CAN DO IF YOU APPROVE: pick one local skatepark to represent and send pre-written phrases (never free text) on that park's board. They can't message anyone privately.
PRIVACY: under-13 profiles are ALWAYS PRIVATE. Their nickname, level, tricks and scores are never shown to other players — not on profiles, leaderboards, rider lists or search. Their board phrases appear only as "A rider". They are counted only in anonymous park totals.

Review, approve, or delete your child's account and all its data at any time:
${parentLink}

If you did not expect this email, do not click the link — the account will be deleted automatically in ${config.pendingConsentDays} days.${sig()}`,
  };
}

export function purchaseEmail(code, signupUrl) {
  return {
    subject: `Your ${config.gameName} code`,
    text: `Thanks for buying ${config.gameName}!

Your game code: ${code}

Create your crew account (pick the skatepark you represent):
${signupUrl}

Keep this code private — it works once. If a child will be playing, a parent/guardian will be asked to approve their account.${sig()}`,
  };
}
