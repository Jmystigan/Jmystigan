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
  gameName: process.env.GAME_NAME || 'Skateboarding Kid',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  // Username that is granted admin on registration (bootstrap). Or use `npm run make-admin`.
  adminUsername: (process.env.ADMIN_USERNAME || '').toLowerCase(),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_GB || 8) * 1024 ** 3,
  // Stat sanity caps (server-side anti-cheat floor; tune to your game's real ceilings).
  caps: { level: 100, score: 50_000_000, combo: 1_000_000, playSeconds: 60 * 60 * 24 * 365, tricks: 500 },
  presenceMinutes: 10,
};
