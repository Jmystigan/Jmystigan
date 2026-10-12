// Shared helpers. All dynamic text must go through esc() — never interpolate raw strings into HTML/SVG.
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const state = { cfg: { studioName: 'Studio', gameName: 'Game' }, token: null, user: null };
try { state.token = localStorage.getItem('token'); } catch {}

export async function api(method, url, body) {
  const form = body instanceof FormData;
  const r = await fetch('/api' + url, {
    method, headers: { ...(body && !form && { 'content-type': 'application/json' }), ...(state.token && { authorization: `Bearer ${state.token}` }) },
    body: body && (form ? body : JSON.stringify(body)),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: r.status, data });
  return data;
}
export const get = (u) => api('GET', u), post = (u, b) => api('POST', u, b ?? {}), del = (u) => api('DELETE', u);

export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); }
export function setSession(token) { state.token = token; try { token ? localStorage.setItem('token', token) : localStorage.removeItem('token'); } catch {} }
export const fmt = (n) => Number(n).toLocaleString();
export const bytes = (n) => n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.ceil(n / 1e3) + ' KB';
export const STATUS = { in_game: 'In the game', scanned: 'Scanned', scheduled: 'Visit scheduled', planned: 'Planned', released: 'Open world', scanning: 'Scanning now', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', converted: 'On the tour' };
export const pill = (s) => `<span class="pill ${esc(s)}">${esc(STATUS[s] ?? s)}</span>`;
export const when = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
export const route = () => window.dispatchEvent(new Event('hashchange'));

let worldCache = null;
export async function loadWorld(force = false) { if (!worldCache || force) worldCache = await get('/world'); return worldCache; }
let mapCache = null;
export async function loadMap() { return (mapCache ??= await (await fetch('/us-states.json')).json()); }
