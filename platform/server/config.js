import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Persist a generated secret so tokens survive restarts when JWT_SECRET isn't set.
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(dataDir, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
}

export const config = {
  root,
  dataDir,
  buildsDir: path.join(dataDir, 'builds'),
  webDir: path.join(root, 'web'),
  port: Number(process.env.PORT || 3000),
  jwtSecret: secret(),
  // Branding is config, not code: the studio name is expected to change.
  studioName: process.env.STUDIO_NAME || 'JMystigan Game Studios',
  gameName: process.env.GAME_NAME || 'Sk8',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  // Username that is granted admin on registration (bootstrap). Or use `npm run make-admin`.
  adminUsername: (process.env.ADMIN_USERNAME || '').toLowerCase(),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_GB || 8) * 1024 ** 3,
  // Stat sanity caps (server-side anti-cheat floor; tune to your game's real ceilings).
  caps: { level: 100, score: 50_000_000, combo: 1_000_000, playSeconds: 60 * 60 * 24 * 365, tricks: 500 },
  presenceMinutes: 10,
  // Email (Resend HTTP API). Unset => emails are printed to the console and kept in an in-memory outbox (dev).
  resendKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',            // e.g. "JMystigan Game Studios <noreply@yourdomain.com>" (domain must be verified)
  supportEmail: process.env.SUPPORT_EMAIL || '',       // shown in parent emails
  refundRetentionDays: Number(process.env.REFUND_RETENTION_DAYS || 90), // suspended (refunded) accounts are deleted after this
  pendingConsentDays: Number(process.env.PENDING_CONSENT_DAYS || 14), // unapproved under-13 accounts are deleted after this
  // Stripe (Checkout + webhooks). Card details never touch this server.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceId: process.env.STRIPE_PRICE_ID || '',   // the Price you create in the Stripe dashboard for the game
  stripeAutomaticTax: process.env.STRIPE_AUTOMATIC_TAX === '1',
  registerPerHour: Number(process.env.REGISTER_PER_HOUR || 10), // per IP
  // Your existing launcher stays the source of truth for the game. This app only needs to know who is a customer.
  // Your launcher backend calls POST /api/partner/codes with this key to mint a one-time signup code per customer.
  partnerApiKey: process.env.LAUNCHER_API_KEY || '',
  launcherUrl: process.env.LAUNCHER_URL || '',        // where "Get the game" sends people
  hostBuilds: process.env.HOST_BUILDS === '1',        // optional built-in build hosting/launcher endpoints (off by default)
};
