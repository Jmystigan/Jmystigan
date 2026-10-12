// Runs the launcher core against a live server: node launcher/test.mjs http://localhost:3111 user pass
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import assert from 'node:assert/strict';
import { Launcher, cmpVer } from './core.js';
const [server, user, pass] = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-'));
const L = new Launcher({ server, installDir: dir, version: '0.0.1' });
assert.ok(cmpVer('1.10.0', '1.9.9') > 0 && cmpVer('1.0', '1.0.0') === 0);
await L.login(user, pass);
const wm = await L.world(); assert.ok(Number.isInteger(wm.revision)); assert.equal((await L.world(wm.revision)).changed, false);
console.log('✓ world manifest: revision', wm.revision, '| released:', wm.regions.map((r) => `${r.code}@${r.version}`).join(', ') || 'none');
console.log('✓ login; branding =', JSON.stringify(await L.branding()));
const s = await L.gameStatus(); console.log('✓ game status', s.installed, '->', s.latest?.version);
let last = 0; const r = await L.installGame((g, t) => { last = g / t; });
console.log('✓ installGame', JSON.stringify(r), 'progress', last);
assert.equal((await L.installGame()).updated, false); console.log('✓ second run is a no-op (up to date)');
// resume: truncate a part file and re-download
const b = s.latest, f = path.join(dir, 'resume.bin'); fs.writeFileSync(f + '.part', fs.readFileSync(path.join(dir, b.filename)).subarray(0, 4));
await L.download(b, f); assert.equal(fs.statSync(f).size, b.size); console.log('✓ resumed partial download + checksum verified');
fs.writeFileSync(f + '.part', 'garbage-garbage'); await assert.rejects(() => L.download({ ...b, sha256: '0'.repeat(64) }, f + '2'), /Checksum/); console.log('✓ corrupted download rejected');
fs.rmSync(dir, { recursive: true, force: true });
