import fs from 'node:fs';
import path from 'node:path';
import { db, tx } from './db.js';
import { config } from './config.js';

// ---- map data (states) -> regions table
export const mapData = JSON.parse(fs.readFileSync(path.join(config.webDir, 'us-states.json'), 'utf8'));
const ins = db.prepare('INSERT OR IGNORE INTO regions (code, name) VALUES (?, ?)');
for (const s of mapData.states) ins.run(s.code, s.name);
db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('world_revision', '1')").run();

export const getRevision = () => Number(db.prepare("SELECT value FROM meta WHERE key = 'world_revision'").get().value);
/** Bump whenever anything the launcher/game/map cares about changes (state released, park added/changed...). */
export const bumpRevision = () => { db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'world_revision'").run(); return getRevision(); };

export const addNews = (kind, title, body = '', region = null) =>
  db.prepare('INSERT INTO news (kind, title, body, region) VALUES (?,?,?,?)').run(kind, title, body, region);

/**
 * The developer shipped a state build: mark it released at `version`, flip its 'scanned' parks to 'in_game',
 * post a news item, and bump the world revision so launchers/games/maps pick it up.
 */
export function releaseRegion(code, { version, notes = '' }) {
  const r = db.prepare('SELECT * FROM regions WHERE code = ?').get(code);
  if (!r) throw Object.assign(new Error('Unknown state'), { status: 404 });
  if (!/^[\w.\-+]{1,32}$/.test(version ?? '')) throw Object.assign(new Error('A version like 1.2.0 is required'), { status: 400 });
  return tx(() => {
    db.prepare("UPDATE regions SET status = 'released', release_version = ?, released_at = datetime('now'), notes = ? WHERE code = ?").run(version, String(notes).slice(0, 500), code);
    const promoted = db.prepare("UPDATE parks SET status = 'in_game' WHERE state = ? AND status = 'scanned'").run(code).changes;
    const live = db.prepare("SELECT COUNT(*) c FROM parks WHERE state = ? AND status = 'in_game'").get(code).c;
    addNews('release', `${r.name} is now open!`, `Version ${version}: ${live} skatepark${live === 1 ? '' : 's'} to explore.${notes ? ' ' + String(notes).slice(0, 300) : ''}`, code);
    return { revision: bumpRevision(), promoted, live };
  });
}

export function setRegionStatus(code, status, notes) {
  if (!['planned', 'scanning', 'released'].includes(status)) throw Object.assign(new Error('Bad status'), { status: 400 });
  const r = db.prepare('UPDATE regions SET status = ?, notes = COALESCE(?, notes) WHERE code = ?').run(status, notes ?? null, code);
  if (!r.changes) throw Object.assign(new Error('Unknown state'), { status: 404 });
  if (status === 'scanning') {
    const n = db.prepare('SELECT name FROM regions WHERE code = ?').get(code).name;
    addNews('tour', `The developer is scanning ${n}`, 'New skateparks are being captured for the open world.', code);
  }
  return bumpRevision();
}
