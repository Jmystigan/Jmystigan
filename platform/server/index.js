import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import './db.js';
import { loadUser } from './auth.js';
import { router as auth } from './routes/auth.js';
import { router as game } from './routes/game.js';
import { router as players } from './routes/players.js';
import { router as parks } from './routes/parks.js';
import { router as launcher } from './routes/launcher.js';
import { router as admin } from './routes/admin.js';
import { router as billing, webhook } from './routes/billing.js';
import { startJobs } from './jobs.js';

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    // All JS/CSS is same-origin; no inline script, so a strict CSP blocks injected scripts outright.
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  });
  next();
});
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), webhook); // needs the raw body for signature check
app.use(express.json({ limit: '100kb' }));
app.use('/api', loadUser, auth, game, players, parks, launcher, billing, admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(config.webDir, { extensions: ['html'] }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(config.webDir, 'index.html'))); // SPA fallback

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  startJobs();
  app.listen(config.port, () => console.log(`${config.studioName} platform on ${config.publicUrl}`));
}
