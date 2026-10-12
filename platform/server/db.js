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
CREATE INDEX IF NOT EXISTS idx_posts_park ON posts(park_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_scores_park ON park_scores(park_id, best_score DESC);
`);

try { db.exec('ALTER TABLE licenses ADD COLUMN external_id TEXT'); } catch { /* already exists */ }

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
