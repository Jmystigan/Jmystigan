import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

/** Delete accounts for good: cascades all rows, and removes uploaded photo files from disk (the DB can't). */
export function deleteUsers(ids) {
  let n = 0;
  for (const id of ids) {
    for (const p of db.prepare('SELECT sp.stored_as FROM spot_photos sp JOIN spots s ON s.id = sp.spot_id WHERE s.user_id = ?').all(id)) {
      fs.rmSync(path.join(config.uploadsDir, p.stored_as), { force: true });
    }
    n += db.prepare('DELETE FROM users WHERE id = ?').run(id).changes;
  }
  return n;
}
export const deleteUser = (id) => deleteUsers([id]);
