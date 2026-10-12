// Launcher core: login, self-update check, game install/update with resume + checksum, and launch.
// Pure Node (no Electron dependency) so it is testable and reusable from any shell (Electron UI, CLI).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class Launcher {
  /** @param {{server:string, installDir:string, platform?:string, channel?:string, version:string}} o */
  constructor(o) { this.o = { platform: 'win64', channel: 'stable', ...o }; this.token = null; fs.mkdirSync(o.installDir, { recursive: true }); }

  get stateFile() { return path.join(this.o.installDir, 'installed.json'); }
  installed() { try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch { return null; } }

  async #api(method, url, body) {
    const r = await fetch(this.o.server + url, { method, headers: { ...(body && { 'content-type': 'application/json' }), ...(this.token && { authorization: `Bearer ${this.token}` }) }, body: body && JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async login(username, password) { this.token = (await this.#api('POST', '/api/auth/login', { username, password })).token; }
  branding() { return this.#api('GET', '/api/config'); } // studio/game name — never hardcode, it may change

  async manifest(kind) { return (await this.#api('GET', `/api/launcher/manifest?kind=${kind}&channel=${this.o.channel}&platform=${this.o.platform}`)).build; }

  /** Is a newer launcher published? (Compare as dotted numbers; the shell decides how to apply it.) */
  async launcherUpdate() {
    const b = await this.manifest('launcher');
    return b && cmpVer(b.version, this.o.version) > 0 ? b : null;
  }
  async gameStatus() {
    const latest = await this.manifest('game'), cur = this.installed();
    return { latest, installed: cur?.version ?? null, upToDate: !!latest && cur?.sha256 === latest.sha256 };
  }

  /** Download a build to a .part file (resuming if one exists), verify SHA-256, then move into place. */
  async download(build, dest, onProgress = () => {}) {
    const part = dest + '.part';
    let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (have > build.size) { fs.rmSync(part); have = 0; }
    if (have < build.size) {
      const r = await fetch(this.o.server + build.downloadUrl, { headers: { ...(this.token && { authorization: `Bearer ${this.token}` }), ...(have && { range: `bytes=${have}-` }) } });
      if (!r.ok && r.status !== 206) throw new Error((await r.json().catch(() => ({}))).error || `Download failed (${r.status})`);
      if (r.status === 200 && have) { fs.rmSync(part); have = 0; } // server ignored Range: restart
      let got = have;
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      const src = Readable.fromWeb(r.body);
      src.on('data', (c) => { got += c.length; onProgress(got, build.size); });
      await pipeline(src, out);
    }
    const hash = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(part), hash);
    if (hash.digest('hex') !== build.sha256) { fs.rmSync(part, { force: true }); throw new Error('Checksum mismatch — download was corrupted, please retry'); }
    fs.renameSync(part, dest);
  }

  /** Install/update the game. Unpacking (zip/installer) is the shell's job; we record what was installed. */
  async installGame(onProgress) {
    const { latest, upToDate } = await this.gameStatus();
    if (!latest) throw new Error('No game build has been published yet');
    if (upToDate) return { updated: false };
    const file = path.join(this.o.installDir, latest.filename);
    await this.download(latest, file, onProgress);
    fs.writeFileSync(this.stateFile, JSON.stringify({ version: latest.version, sha256: latest.sha256, file: latest.filename, at: new Date().toISOString() }));
    return { updated: true, version: latest.version, file };
  }

  /** Launch the game, handing it a limited 12h token so the player never types a password in-game. */
  async launch(exePath, extraArgs = []) {
    const { token } = await this.#api('POST', '/api/launcher/game-token', {});
    const child = spawn(exePath, [`-JMToken=${token}`, `-JMServer=${this.o.server}`, ...extraArgs], { detached: true, stdio: 'ignore' });
    child.unref();
    return child.pid;
  }
}

export function cmpVer(a, b) {
  const pa = String(a).split(/[.\-+]/).map((x) => parseInt(x, 10) || 0), pb = String(b).split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
