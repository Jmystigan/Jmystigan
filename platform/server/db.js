import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from './config.js';

export const db = new DatabaseSync(path.join(config.dataDir, 'app.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,          -- lowercase handle; also the public display name (no real names)
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',    -- player | admin
  birth_year INTEGER NOT NULL,
  parent_email TEXT,
  consent_status TEXT NOT NULL,           -- not_required | pending | approved
  consent_token TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS players (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_combo INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0,
  avatar TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tricks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  landed INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  first_landed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, name)
);
CREATE TABLE IF NOT EXISTS parks (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  lat REAL, lng REAL,
  status TEXT NOT NULL DEFAULT 'planned', -- planned | scheduled | scanned | in_game
  visit_date TEXT,                         -- developer tour date (YYYY-MM-DD)
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS park_scores (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_combo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, park_id)
);
CREATE TABLE IF NOT EXISTS park_members (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, park_id)
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, reporter_id)
);
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE TABLE IF NOT EXISTS park_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS request_votes (
  request_id INTEGER NOT NULL REFERENCES park_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, user_id)
);
CREATE TABLE IF NOT EXISTS builds (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                      -- game | launcher
  channel TEXT NOT NULL DEFAULT 'stable',  -- stable | beta
  platform TEXT NOT NULL,                  -- win64 | mac | linux | android | ios
  version TEXT NOT NULL,
  filename TEXT NOT NULL,
  stored_as TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  external_id TEXT UNIQUE,                 -- customer id from your launcher/store, when issued via the partner API
  email TEXT,                              -- purchaser email (Stripe), used to send the code
  payment_intent TEXT,                     -- Stripe payment, so a refund/dispute can find its license
  revoked_at TEXT,                         -- set on refund/dispute/manual revoke; access ends
  revoked_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT
);
-- Where a player is playing right now (set by the game). Separate from the ONE park they represent (park_members).
CREATE TABLE IF NOT EXISTS park_presence (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  park_id INTEGER NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, park_id)
);
-- Open world: one region per state. The launcher/game poll /api/world/manifest to learn what is released.
CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',  -- planned | scanning | released
  release_version TEXT, released_at TEXT, notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', region TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Riders submit skate spots they find; the developer reviews them and may visit/scan them.
CREATE TABLE IF NOT EXISTS spots (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lng REAL NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | planned | converted
  admin_note TEXT NOT NULL DEFAULT '', park_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS spot_photos (
  id INTEGER PRIMARY KEY, spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  stored_as TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spot_votes (
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (spot_id, user_id)
);
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_spots_status ON spots(status);
CREATE INDEX IF NOT EXISTS idx_posts_park ON posts(park_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_scores_park ON park_scores(park_id, best_score DESC);
`);

for (const col of ['external_id TEXT', 'email TEXT', 'payment_intent TEXT', 'revoked_at TEXT', 'revoked_reason TEXT']) {
  try { db.exec(`ALTER TABLE licenses ADD COLUMN ${col}`); } catch { /* already exists */ }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_lic_pi ON licenses(payment_intent)');
try { db.exec('ALTER TABLE parks ADD COLUMN spot_id INTEGER'); } catch { /* already exists */ }
// Private profiles: hidden from lists, search, leaderboards and profile pages; counted only in anonymous totals.
// Always on for under-13s (enforced here and in the settings route); 13+ can choose.
try { db.exec('ALTER TABLE users ADD COLUMN profile_private INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
db.exec("UPDATE users SET profile_private = 1 WHERE profile_private = 0 AND (CAST(strftime('%Y','now') AS INTEGER) - birth_year) < 13");

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
