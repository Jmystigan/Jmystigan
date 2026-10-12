// Interactive US map: states coloured by open-world release status, park pins, community-spot pins,
// pan/zoom (drag, wheel, pinch, buttons), a side panel for states/parks/spots, and the "drop a pin" spot-submission flow.
import { $, esc, state, get, post, del, api, toast, fmt, pill, when, loadWorld, loadMap, STATUS } from './util.js';

const W = 975, H = 610, PIN_PX = 9;
const STAR = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 4.4 : 10, a = (i * Math.PI) / 5; return `${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)}`; }).join(' ');
let poll = null;

/** SVG markup for the whole map. `interactive:false` is used for the small preview on the home page. */
function mapSvg(geo, world, { labels = true } = {}) {
  const status = Object.fromEntries(world.regions.map((r) => [r.code, r.status]));
  const states = geo.states.map((s) => `<path class="st ${esc(status[s.code] ?? 'planned')}" d="${s.d}" data-code="${esc(s.code)}"><title>${esc(s.name)} — ${esc(STATUS[status[s.code] ?? 'planned'])}</title></path>`
    + (labels && s.bbox[2] - s.bbox[0] > 26 ? `<text class="stl" x="${s.label[0]}" y="${s.label[1] + 3}">${esc(s.code)}</text>` : '')).join('');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of the United States showing open-world release status and skateparks">
    <g id="states">${states}</g><g id="spotpins"></g><g id="parkpins"></g><g id="newpin"></g></svg>`;
}

function parkPin(p, k) {
  const shape = p.status === 'in_game' ? `<polygon class="pin-star" points="${STAR}"/>` : p.status === 'planned' ? '<circle class="pin-dot" r="5"/>' : '<circle class="pin-soon" r="6"/>';
  return `<g class="pin" tabindex="0" role="button" aria-label="${esc(p.name)}, ${esc(STATUS[p.status])}" data-park="${esc(p.slug)}" transform="translate(${p.x} ${p.y}) scale(${k})"><circle class="halo" r="15"/>${shape}</g>`;
}
const spotPin = (s, k) => `<g class="pin" tabindex="0" role="button" aria-label="Community spot: ${esc(s.name)}" data-spot="${s.id}" transform="translate(${s.x} ${s.y}) scale(${k})"><circle class="halo" r="13"/><polygon class="pin-spot" points="0,-6 6,0 0,6 -6,0"/></g>`;

/** Small, non-interactive map for the home page. */
export async function previewMap(el) {
  const [world, geo] = await Promise.all([loadWorld(), loadMap()]);
  el.innerHTML = mapSvg(geo, world, { labels: false });
  const k = 1.1;
  $('#parkpins', el).innerHTML = world.parks.filter((p) => p.x != null).map((p) => parkPin(p, k)).join('');
  el.querySelectorAll('.pin,.st').forEach((n) => n.addEventListener('click', () => { location.hash = n.dataset.code ? `#/map/${n.dataset.code}` : '#/map'; }));
}

/* ------------------------------------------------------------------------------------------------ page */
export async function mapPage() {
  return `<div class="row"><h1 class="grow">The open world</h1></div>
    <p class="mute">Every state is its own open-world level. Tap a state to see what's released, tap a pin to meet the riders from that park — or drop a pin to tell us about a spot we've missed.</p>
    <div class="row" style="margin-bottom:10px"><label class="row" style="flex-direction:row;font-weight:600"><input type="checkbox" id="ly-parks" checked style="width:auto"> Parks</label>
      <label class="row" style="flex-direction:row;font-weight:600"><input type="checkbox" id="ly-spots" checked style="width:auto"> Community spots</label>
      <span class="grow"></span><button class="btn" id="dropbtn">📍 Found a new spot?</button></div>
    <div class="mapgrid"><div class="mapwrap" id="mapwrap"><div id="map"></div>
      <div class="mapctl"><button id="zin" aria-label="Zoom in">+</button><button id="zout" aria-label="Zoom out">−</button><button id="zreset" aria-label="Reset view">⌂</button></div>
      <div class="maplegend"><span><i style="background:#c4492a"></i>Open world (released)</span><span><i style="background:#f2b84b"></i>Being scanned</span><span><i style="background:#dcc590"></i>Not scanned yet</span>
        <span>★ in the game · ● coming · ◆ community spot</span></div></div>
      <aside class="card mappanel" id="panel" aria-live="polite"></aside></div>`;
}

mapPage.after = async ([code]) => {
  clearInterval(poll);
  const [world0, geo] = await Promise.all([loadWorld(true), loadMap()]);
  let world = world0, spotsFull = null;
  const wrap = $('#mapwrap'), mapEl = $('#map'), panel = $('#panel');
  mapEl.innerHTML = mapSvg(geo, world);
  const svg = mapEl.querySelector('svg');
  let vb = { x: 0, y: 0, w: W, h: H };
  let sel = { type: null, id: null }, placing = false, newPin = null;
  const showParks = () => $('#ly-parks').checked, showSpots = () => $('#ly-spots').checked;

  const clientW = () => svg.getBoundingClientRect().width || W;
  const pinScale = () => (PIN_PX * vb.w) / clientW() / 8;       // constant on-screen pin size at any zoom
  function drawPins() {
    const k = pinScale();
    $('#parkpins', svg).innerHTML = showParks() ? world.parks.filter((p) => p.x != null).map((p) => parkPin(p, k)).join('') : '';
    $('#spotpins', svg).innerHTML = showSpots() ? world.spots.filter((s) => s.x != null).map((s) => spotPin(s, k)).join('') : '';
    $('#newpin', svg).innerHTML = newPin ? `<g transform="translate(${newPin.x} ${newPin.y}) scale(${k})"><circle class="pin-new" r="8"/><circle cx="0" cy="0" r="2.5" fill="#c4492a"/></g>` : '';
    svg.querySelectorAll('.pin').forEach((n) => n.classList.toggle('sel', (sel.type === 'park' && n.dataset.park === sel.id) || (sel.type === 'spot' && n.dataset.spot === String(sel.id))));
    svg.querySelectorAll('.st').forEach((n) => n.classList.toggle('sel', sel.type === 'state' && n.dataset.code === sel.id));
  }
  const applyVb = () => { svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`); drawPins(); };
  const clampVb = () => {
    vb.w = Math.min(W, Math.max(W / 60, vb.w)); vb.h = vb.w * (H / W);
    vb.x = Math.min(W - vb.w * 0.6, Math.max(-vb.w * 0.4, vb.x)); vb.y = Math.min(H - vb.h * 0.6, Math.max(-vb.h * 0.4, vb.y));
  };
  function tween(to, ms = 380) {
    const from = { ...vb }, t0 = performance.now();
    const step = (t) => {
      const e = Math.min(1, (t - t0) / ms), s = 1 - (1 - e) ** 3;
      for (const k of ['x', 'y', 'w', 'h']) vb[k] = from[k] + (to[k] - from[k]) * s;
      applyVb(); if (e < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const fitBox = ([x0, y0, x1, y1], pad = 0.35) => {
    let w = (x1 - x0) * (1 + pad * 2), h = (y1 - y0) * (1 + pad * 2);
    w = Math.max(w, h * (W / H), 170); h = w * (H / W);
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  };
  const toMap = (cx, cy) => { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  function zoomAt(cx, cy, f) {
    const p = toMap(cx, cy), nw = Math.min(W, Math.max(W / 60, vb.w / f)), r = nw / vb.w;
    vb.x = p.x - (p.x - vb.x) * r; vb.y = p.y - (p.y - vb.y) * r; vb.w = nw; vb.h = nw * (H / W); clampVb(); applyVb();
  }
  const center = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  $('#zin').onclick = () => zoomAt(...center(), 1.6); $('#zout').onclick = () => zoomAt(...center(), 1 / 1.6);
  $('#zreset').onclick = () => { sel = { type: null }; tween({ x: 0, y: 0, w: W, h: H }); location.hash = '#/map'; panelHome(); };
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0017)); }, { passive: false });

  // drag to pan, pinch to zoom, tap to select
  const ptrs = new Map(); let downTarget = null, moved = false, startPt = null, pinch0 = null;
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); downTarget = e.target; moved = false; startPt = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), w: vb.w }; }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); moved = true;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch0.w / vb.w) * (d / pinch0.d)); return;
    }
    if (!moved && Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) < 5) return;
    if (!moved) { moved = true; wrap.classList.add('drag'); svg.setPointerCapture(e.pointerId); }
    const u = vb.w / clientW(); vb.x -= (e.clientX - prev.x) * u; vb.y -= (e.clientY - prev.y) * u; clampVb(); applyVb();
  });
  const end = (e) => {
    const wasTap = ptrs.size === 1 && !moved; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; wrap.classList.remove('drag');
    if (wasTap && e.type === 'pointerup') tap(downTarget, e.clientX, e.clientY);
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.pin')) { e.preventDefault(); tap(e.target, 0, 0); } });

  function tap(t, cx, cy) {
    if (placing && !t.closest?.('.pin')) { const p = toMap(cx, cy); return placeAt(p.x, p.y); }
    const pin = t.closest?.('.pin');
    if (pin?.dataset.park) return selectPark(pin.dataset.park);
    if (pin?.dataset.spot) return selectSpot(Number(pin.dataset.spot));
    const st = t.closest?.('.st'); if (st) selectState(st.dataset.code);
  }

  /* ---------- panel views */
  const regionOf = (c) => world.regions.find((r) => r.code === c);
  const stateName = (c) => geo.states.find((s) => s.code === c)?.name ?? c;
  const parkRow = (p) => `<div class="post"><a href="#" data-park="${esc(p.slug)}"><b>${esc(p.name)}</b></a> ${pill(p.status)}<div class="small mute">${esc(p.city)}, ${esc(p.state)} · ${p.members} rep${p.members === 1 ? '' : 's'}${p.onlineNow ? ` · ${p.onlineNow} skating now` : ''}</div></div>`;
  function regionBanner(r) {
    if (!r) return '';
    if (r.status === 'released') return `<div class="notice">🌵 <b>OPEN WORLD</b> — ${esc(r.name)} is in the game${r.releaseVersion ? ` (v${esc(r.releaseVersion)}${r.releasedAt ? `, ${esc(when(r.releasedAt))}` : ''})` : ''}. ${r.live} park${r.live === 1 ? '' : 's'} to explore.</div>`;
    if (r.status === 'scanning') return `<div class="notice">📷 <b>SCANNING NOW</b> — the developer is capturing ${esc(r.name)} for the open world.</div>`;
    return `<p class="mute small">Not scanned yet. Found a spot here? <a href="#" data-submit>Drop a pin</a> and it might get the developer to visit.</p>`;
  }
  function bindPanel() {
    panel.querySelectorAll('[data-park]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); selectPark(a.dataset.park); }));
    panel.querySelectorAll('[data-spot]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); selectSpot(Number(a.dataset.spot)); }));
    panel.querySelectorAll('[data-submit]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); startSubmit(); }));
    panel.querySelectorAll('[data-state]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); selectState(a.dataset.state); }));
  }
  function panelHome() {
    const live = world.regions.filter((r) => r.status === 'released'), scanning = world.regions.filter((r) => r.status === 'scanning');
    panel.innerHTML = `<h2>Where to?</h2><p class="small mute">Tap a state or a pin. The more riders rep their park, the sooner we visit.</p>
      <p><b>${live.length}</b> state${live.length === 1 ? '' : 's'} open${live.length ? ': ' + live.map((r) => `<a href="#" data-state="${esc(r.code)}">${esc(r.name)}</a>`).join(', ') : ''}<br>
      <b>${scanning.length}</b> being scanned${scanning.length ? ': ' + scanning.map((r) => `<a href="#" data-state="${esc(r.code)}">${esc(r.name)}</a>`).join(', ') : ''}<br>
      <b>${world.parks.length}</b> parks · <b>${world.spots.length}</b> community spots</p>
      <h3>From the frontier</h3>${world.news.slice(0, 4).map((n) => `<div class="newsitem"><b>${esc(n.title)}</b><div class="small mute">${esc(n.body)}</div></div>`).join('') || '<p class="mute small">Nothing yet.</p>'}
      <p><button class="btn" data-submit>📍 Found a new spot?</button></p>`;
    bindPanel();
  }
  function selectState(c) {
    sel = { type: 'state', id: c }; placing = false; wrap.classList.remove('placing');
    const g = geo.states.find((s) => s.code === c); if (!g) return;
    tween(fitBox(g.bbox, c === 'AK' || c === 'HI' ? 0.6 : 0.25)); history.replaceState(null, '', `#/map/${c}`);
    const r = regionOf(c), ps = world.parks.filter((p) => p.state === c), ss = world.spots.filter((s) => s.state === c);
    panel.innerHTML = `<h2>${esc(g.name)}</h2>${regionBanner(r)}
      <h3>Parks (${ps.length})</h3>${ps.map(parkRow).join('') || '<p class="mute small">No parks here yet.</p>'}
      <h3 style="margin-top:12px">Community spots (${ss.length})</h3>${ss.map((s) => `<div class="post"><a href="#" data-spot="${s.id}">◆ <b>${esc(s.name)}</b></a> <span class="small mute">${s.votes} vote${s.votes === 1 ? '' : 's'}${s.status === 'planned' ? ' · dev plans to visit' : ''}</span></div>`).join('') || '<p class="mute small">None yet — be the first to find one.</p>'}
      <p><button class="btn" data-submit>📍 Submit a spot in ${esc(g.name)}</button></p>`;
    bindPanel(); drawPins();
  }
  async function selectPark(slug) {
    const p = world.parks.find((x) => x.slug === slug); if (!p) return;
    sel = { type: 'park', id: slug }; placing = false; wrap.classList.remove('placing');
    if (p.x != null) tween(fitBox([p.x, p.y, p.x, p.y], 0)); drawPins();
    panel.innerHTML = '<p class="mute">Saddling up…</p>';
    let d; try { d = await get(`/parks/${encodeURIComponent(slug)}`); } catch (e) { panel.textContent = e.message; return; }
    if (sel.id !== slug) return;
    const r = regionOf(p.state), u = state.user;
    const action = !u ? '<a class="btn ghost sm" href="#/login">Log in to represent</a>' : !u.social ? '' : d.isMember ? '<span class="pill released">You rep this park</span>' : '<button class="btn sm" id="rep">Represent this park</button>';
    panel.innerHTML = `<p class="small"><a href="#" data-state="${esc(p.state)}">← ${esc(stateName(p.state))}</a></p>
      <div class="row"><h2 class="grow" style="margin:0">${esc(p.name)}</h2>${pill(p.status)}</div>
      <p class="small mute">${esc(p.city)}, ${esc(p.state)}${r?.status === 'released' && p.status === 'in_game' ? ` · part of the ${esc(r.name)} open world` : ''}${d.discoveredBy ? ` · found by ${esc(d.discoveredBy)}` : ''}</p>
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
      <p><b>${p.members}</b> rider${p.members === 1 ? '' : 's'} rep this park · <b>${p.onlineNow}</b> skating now · crew score <b>${fmt(p.crewScore)}</b></p>
      <h3>Top riders</h3>${d.leaderboard.slice(0, 5).map((r2, i) => `<div>${i + 1}. <a href="#/u/${esc(r2.username)}">${esc(r2.username)}</a> <span class="mute small">${fmt(r2.bestScore)} pts</span></div>`).join('') || '<p class="mute small">No scores yet.</p>'}
      <h3 style="margin-top:12px">Riders from here</h3>
      <div class="chips">${d.crew.slice(0, 14).map((c) => `<a class="chip" href="#/u/${esc(c.username)}"><span class="dot ${c.online ? '' : 'off'}"></span>${esc(c.username)} <span class="mute small">Lv ${c.level}</span></a>`).join('') || '<span class="mute small">Nobody yet.</span>'}${d.privateRiders ? `<span class="chip" style="cursor:default">🔒 +${d.privateRiders} private</span>` : ''}</div>
      <h3 style="margin-top:12px">On the board</h3>
      ${d.posts.slice(0, 3).map((m) => `<div class="post">${m.username ? `<a href="#/u/${esc(m.username)}"><b>${esc(m.username)}</b></a>` : '<b>A rider</b>'} <span class="small mute">${esc(when(m.createdAt))}</span><br>${esc(m.body)}
        ${u?.social ? ` <button class="chip" data-respect="${m.id}" data-on="${m.respected ? 1 : 0}" style="min-height:28px;padding:2px 10px">🤙 ${m.respects}</button>` : `<span class="small mute">🤙 ${m.respects}</span>`}</div>`).join('') || '<p class="mute small">Quiet so far.</p>'}
      <div class="row" style="margin-top:12px"><a class="btn sm ghost" href="#/parks/${esc(slug)}">Open park page</a>${action}</div>`;
    bindPanel();
    $('#rep', panel)?.addEventListener('click', async () => { try { await post(`/parks/${encodeURIComponent(slug)}/join`); toast("You're representing this park!"); world = await loadWorld(true); drawPins(); selectPark(slug); } catch (e) { toast(e.message); } });
    panel.querySelectorAll('[data-respect]').forEach((b) => b.addEventListener('click', async () => {
      try { await (b.dataset.on === '1' ? del : post)(`/posts/${b.dataset.respect}/respect`); selectPark(slug); } catch (e) { toast(e.message); }
    }));
  }
  async function selectSpot(id) {
    sel = { type: 'spot', id }; placing = false; wrap.classList.remove('placing');
    const ls = world.spots.find((s) => s.id === id); if (ls?.x != null) tween(fitBox([ls.x, ls.y, ls.x, ls.y], 0)); drawPins();
    spotsFull = spotsFull ?? (await get('/spots')).spots;
    let s = spotsFull.find((x) => x.id === id); if (!s) { spotsFull = (await get('/spots')).spots; s = spotsFull.find((x) => x.id === id); }
    if (!s) return;
    const u = state.user;
    panel.innerHTML = `<p class="small"><a href="#" data-state="${esc(s.state ?? '')}">← ${esc(stateName(s.state))}</a></p>
      <div class="row"><h2 class="grow" style="margin:0">◆ ${esc(s.name)}</h2>${pill(s.status === 'approved' ? 'scanned' : s.status)}</div>
      <p class="small mute">${s.status === 'approved' ? 'Community-found spot' : s.status === 'planned' ? 'The developer plans to visit this one' : s.status === 'converted' ? 'Now on the tour' : STATUS[s.status]} · found by ${s.discoveredBy ? esc(s.discoveredBy) : 'a rider'}</p>
      <div>${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>${s.description ? `<p>${esc(s.description)}</p>` : ''}
      ${s.photos.length ? `<div class="thumbs">${s.photos.map((u2) => `<a href="${esc(u2)}" target="_blank" rel="noopener"><img src="${esc(u2)}" alt="Photo of ${esc(s.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
      <p style="margin-top:12px"><b>${s.votes}</b> rider${s.votes === 1 ? '' : 's'} want${s.votes === 1 ? 's' : ''} this scanned.</p>
      <div class="row">${s.parkSlug ? `<a class="btn sm" href="#" data-park="${esc(s.parkSlug)}">See the park</a>` : u?.social && ['approved', 'planned'].includes(s.status)
        ? `<button class="btn sm ${s.voted ? 'ghost' : ''}" id="vote">${s.voted ? '✓ You voted' : "🤙 I'd skate here too"}</button>` : !u ? '<a class="btn ghost sm" href="#/login">Log in to vote</a>' : ''}</div>`;
    bindPanel();
    $('#vote', panel)?.addEventListener('click', async () => { try { await (s.voted ? del : post)(`/spots/${id}/vote`); spotsFull = null; world = await loadWorld(true); drawPins(); selectSpot(id); } catch (e) { toast(e.message); } });
  }

  /* ---------- submit a spot */
  function startSubmit() {
    const u = state.user;
    sel = { type: 'submit' }; drawPins();
    if (!u) { panel.innerHTML = '<h2>Found a spot?</h2><p>Log in with your game account to drop a pin.</p><a class="btn" href="#/login">Log in</a>'; return; }
    if (!u.social) { panel.innerHTML = '<h2>Found a spot?</h2><p>Spot submissions unlock once a parent/guardian approves your account.</p>'; return; }
    const kid = u.age < 13; let loc = null, tags = new Set(), files = [];
    panel.innerHTML = `<h2>Found a new spot?</h2>
      <p class="small mute">Tell us where it is. If it's good, the developer might visit and scan it into the game — and you get the credit${u.profilePrivate ? ' (shown as “a rider”, since your profile is private)' : ''}.</p>
      ${kid ? '<div class="notice small">Under 13: you can drop a pin and pick what it has. Names, notes and photos are for players 13+.</div>' : ''}
      <h3>1 · Where is it?</h3>
      <div class="row"><button class="btn sm" type="button" id="loc-tap">Tap the map</button><button class="btn sm ghost" type="button" id="loc-gps">Use my location</button></div>
      <label style="margin-top:8px">…or paste coordinates<input id="loc-paste" placeholder="30.2672, -97.7431" inputmode="decimal"></label>
      <p class="small" id="loc-out"><span class="mute">No location yet.</span></p>
      ${kid ? '' : `<label>Name<input id="sp-name" maxlength="60" placeholder="Courthouse ledges"></label><label>Notes (optional)<textarea id="sp-desc" rows="2" maxlength="300" placeholder="What's it like? Best time to go?"></textarea></label>`}
      <h3>${kid ? '2' : '2'} · What's there?</h3><div class="chips" id="sp-tags">${(world.tags ?? ['ledge', 'rail', 'stairs', 'bowl', 'pool', 'gap', 'flatground', 'manual pad', 'banks', 'transition', 'plaza', 'ramp']).map((t) => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      ${kid ? '' : `<h3 style="margin-top:12px">3 · Photos (optional, up to 3)</h3>
        <input type="file" id="sp-files" accept="image/jpeg,image/png" multiple><div class="thumbs" id="sp-prev" style="margin-top:8px"></div>
        <p class="small mute">Only photos of the spot — no people or faces, please. Location data in photos is removed automatically.</p>`}
      <div class="err" id="sp-err"></div><div class="row"><button class="btn" id="sp-go">Submit spot</button><button class="btn ghost" id="sp-cancel" type="button">Cancel</button></div>
      <p class="small mute">An admin reviews every spot before it shows up for other riders.</p>`;
    const out = (h) => { $('#loc-out', panel).innerHTML = h; };
    const setLoc = (info) => {
      loc = info; newPin = { x: info.x, y: info.y }; placing = false; wrap.classList.remove('placing'); drawPins();
      out(`📍 <b>${esc(info.state)}</b> · ${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}`);
      tween(fitBox([info.x, info.y, info.x, info.y], 0));
    };
    $('#loc-tap', panel).onclick = () => { placing = true; wrap.classList.add('placing'); out('<b>Tap the map where the spot is.</b> Zoom in first for a more exact pin.'); wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    $('#loc-gps', panel).onclick = () => {
      if (!navigator.geolocation) return out('<span class="err">Location isn\'t available on this device.</span>');
      out('<span class="mute">Finding you…</span>');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try { const r = await get(`/geo/project?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`); setLoc({ ...r, lat: pos.coords.latitude, lng: pos.coords.longitude }); }
        catch (e) { out(`<span class="err">${esc(e.message)}</span>`); }
      }, () => out('<span class="err">Couldn\'t get your location — tap the map instead.</span>'), { enableHighAccuracy: true, timeout: 12000 });
    };
    $('#loc-paste', panel).onchange = async (e) => {
      const m = e.target.value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/); if (!m) return out('<span class="err">Use the format 30.2672, -97.7431</span>');
      try { const r = await get(`/geo/project?lat=${m[1]}&lng=${m[2]}`); setLoc({ ...r, lat: +m[1], lng: +m[2] }); } catch (x) { out(`<span class="err">${esc(x.message)}</span>`); }
    };
    placeAt = async (x, y) => {
      try { const r = await get(`/geo/unproject?x=${x.toFixed(1)}&y=${y.toFixed(1)}`); setLoc({ x, y, lat: r.lat, lng: r.lng, state: r.state }); }
      catch (e) { out(`<span class="err">${esc(e.message)}</span>`); }
    };
    panel.querySelectorAll('[data-tag]').forEach((b) => b.onclick = () => { tags.has(b.dataset.tag) ? tags.delete(b.dataset.tag) : tags.add(b.dataset.tag); b.classList.toggle('on'); });
    $('#sp-files', panel)?.addEventListener('change', (e) => {
      files = [...e.target.files].slice(0, 3); const prev = $('#sp-prev', panel); prev.innerHTML = '';
      for (const f of files) { const rd = new FileReader(); rd.onload = () => { const im = document.createElement('img'); im.src = rd.result; im.alt = 'Selected photo'; prev.append(im); }; rd.readAsDataURL(f); } // data: URL (CSP-friendly)
    });
    $('#sp-cancel', panel).onclick = () => { placing = false; wrap.classList.remove('placing'); newPin = null; sel = { type: null }; drawPins(); panelHome(); };
    $('#sp-go', panel).onclick = async (e) => {
      const err = $('#sp-err', panel); err.textContent = '';
      if (!loc) return (err.textContent = 'Pick the spot\'s location first.');
      const fd = new FormData(); fd.append('lat', loc.lat); fd.append('lng', loc.lng); fd.append('tags', [...tags].join(','));
      if (!kid) { fd.append('name', $('#sp-name', panel).value); fd.append('description', $('#sp-desc', panel).value); files.forEach((f) => fd.append('photos', f)); }
      e.target.disabled = true;
      try {
        await api('POST', '/spots', fd); toast('Spot sent! An admin will review it.'); newPin = null; spotsFull = null; sel = { type: null }; drawPins();
        panel.innerHTML = '<h2>Thanks, rider! 🤠</h2><p>Your spot is waiting for review. Once approved it shows up on the map and other riders can vote on it.</p><p><button class="btn ghost" id="again">Submit another</button></p>';
        $('#again', panel).onclick = startSubmit;
      } catch (x) {
        e.target.disabled = false; err.textContent = x.message;
        if (x.data?.spotId) err.innerHTML = `${esc(x.message)} <a href="#" id="seespot">See it</a>`, $('#seespot', panel)?.addEventListener('click', (ev) => { ev.preventDefault(); selectSpot(x.data.spotId); });
        if (x.data?.parkSlug) err.innerHTML = `${esc(x.message)} <a href="#" id="seepark">See it</a>`, $('#seepark', panel)?.addEventListener('click', (ev) => { ev.preventDefault(); selectPark(x.data.parkSlug); });
      }
    };
  }
  let placeAt = () => {};
  $('#dropbtn').onclick = () => { startSubmit(); panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  $('#ly-parks').onchange = drawPins; $('#ly-spots').onchange = drawPins;

  // The world can change while someone is looking (a state just shipped): poll the cheap manifest endpoint.
  poll = setInterval(async () => {
    if (!document.body.contains(svg)) return clearInterval(poll);
    try {
      const m = await (await fetch(`/api/world/manifest?since=${world.revision}`)).json();
      if (m.changed) { world = await loadWorld(true); mapEl.querySelectorAll('.st').forEach((n) => { n.setAttribute('class', `st ${world.regions.find((r) => r.code === n.dataset.code)?.status ?? 'planned'}`); }); drawPins(); toast('🌵 The world just changed — map updated'); }
    } catch { /* offline: try again next tick */ }
  }, 60_000);

  applyVb();
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('submit')) startSubmit();
  else if (code && geo.states.some((s) => s.code === code.toUpperCase())) selectState(code.toUpperCase());
  else panelHome();
};
