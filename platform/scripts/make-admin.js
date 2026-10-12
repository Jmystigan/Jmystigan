import { db } from '../server/db.js';
const name = (process.argv[2] || '').toLowerCase();
const r = db.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(name);
console.log(r.changes ? `${name} is now an admin` : `No user named "${name}" (register first)`);
