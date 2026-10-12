// Single-page app, no build step. All dynamic text goes through esc() — never interpolate raw.
import { $, esc, state, api, get, post, del, toast, setSession, fmt, bytes, STATUS, pill, when, loadWorld } from './util.js';
import { mapPage, previewMap } from './map.js';
import { posterSvg, downloadPoster } from './poster.js';
const app = $('#app');

async function refreshUser() {
  state.user = null;
  if (state.token) { try { state.user = (await get('/me')).user; } catch { setSession(null); } }
  renderNav();
}
function renderNav() {
  const u = state.user, h = location.hash || '#/';
  const l = (href, text) => `<a href="${href}" class="${h === href || (href !== '#/' && h.startsWith(href)) ? 'on' : ''}">${text}</a>`;
  $('#nav').innerHTML = [l('#/map', 'Map'), l('#/parks', 'Parks'), l('#/spots', 'Spots'), u ? l('#/feed', 'Crew') : '',
    (state.cfg.hostBuilds || state.cfg.launcherUrl || state.cfg.canBuy) ? l('#/play', 'Get the game') : '',
    u ? l('#/me', esc(u.username)) : l('#/login', 'Log in'),
    u?.role === 'admin' ? l('#/admin', 'Admin') : '',
    u ? '<a href="#/logout">Log out</a>' : '<a class="btn sm" href="#/register">Sign up</a>'].join('');
}
$('#burger').onclick = () => { const n = $('#nav'); const o = n.classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); };

// ---------- pages ----------
const pages = {};

pages.home = async () => {
  const world = await loadWorld(true);
  const parks = world.parks, reps = parks.reduce((n, p) => n + p.members, 0);
  const top = [...parks].sort((a, b) => b.members - a.members || b.crewScore - a.crewScore).slice(0, 6);
  const open = world.regions.filter((r) => r.status === 'released').length;
  return `
  <section class="hero-art"><div class="hero-in">
    <div class="kicker">★ ${esc(state.cfg.studioName)} presents ★</div>
    <h1>${esc(state.cfg.gameName)}</h1></div>
    <div class="hero-cta row">${state.cfg.canBuy ? '<a class="btn" href="#/play">Get the game</a><a class="btn ghost" href="#/register">I have a code</a>' : '<a class="btn" href="#/register">Sign up with your game code</a>'}<a class="btn ghost" href="#/map">Open the map</a></div>
  </section>
  <p class="lead">An open-world skate game built from <b>real skateparks</b>, state by state. Rep your local park, find your crew, and put your name on the board.
     Players only — you sign up with the code that comes with the game.</p>
  <div class="rope"></div>
  <div class="mapgrid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)">
    <div><div class="mapwrap" id="homemap" style="cursor:pointer" title="Open the map"></div></div>
    <div class="card"><h2>The open world</h2><p><b>${open}</b> state${open === 1 ? '' : 's'} open · <b>${parks.length}</b> parks mapped · <b>${reps}</b> rider${reps === 1 ? '' : 's'} repping.</p>
      <h3>Latest from the frontier</h3>${world.news.slice(0, 4).map((n) => `<div class="newsitem"><b>${esc(n.title)}</b><div class="small mute">${esc(n.body)}</div></div>`).join('') || '<p class="mute small">The first state is on its way.</p>'}
      <p><a class="btn sm" href="#/map">Explore the map</a></p></div>
  </div>
  <h2 style="margin-top:30px">How it works</h2>
  <ol class="steps">
    <li><h3>Get the game</h3>Install ${esc(state.cfg.gameName)} from the ${esc(state.cfg.studioName)} launcher. You'll get a code to unlock your account here.</li>
    <li><h3>Pick your park</h3>Choose the skatepark you rep. One park per rider — switch any time.</li>
    <li><h3>Meet your crew</h3>Find locals on the map, see who's skating now, and trade quick messages on your park's board.</li>
    <li><h3>Find new spots</h3>Know a spot we're missing? Drop a pin (and photos, if you're 13+). The developer may visit and scan it into the game.</li>
  </ol>
  <h2 style="margin-top:30px">Top parks</h2>
  <p class="mute">Your park not here? <a href="#/map?submit=1">Drop a pin</a> and put it on the map.</p>
  <div class="grid">${top.map(parkCard).join('') || '<p class="mute">The first parks are coming soon.</p>'}</div>`;
};
pages.home.after = () => previewMap($('#homemap')).then(() => { $('#homemap').onclick = () => { location.hash = '#/map'; }; });

function parkCard(p) {
  return `<a class="card" href="#/parks/${esc(p.slug)}" style="display:block;color:inherit;text-decoration:none">
    <div class="row"><h3 class="grow">${esc(p.name)}</h3>${pill(p.status)}</div>
    <div class="mute small">${esc(p.city)}, ${esc(p.state)}${p.visitDate && p.status === 'scheduled' ? ' · visit ' + esc(when(p.visitDate)) : ''}</div>
    <div class="small" style="margin-top:8px"><span class="dot ${p.onlineNow ? '' : 'off'}"></span>${p.onlineNow} playing now · ${p.members} rep${p.members === 1 ? '' : 's'} · crew score ${fmt(p.crewScore)}</div></a>`;
}

pages.parks = async () => {
  const { parks } = await get('/parks');
  state.parks = parks;
  const states = [...new Set(parks.map((p) => p.state))].sort();
  return `<h1>Find your park</h1>
    <div class="row" style="margin-bottom:16px;align-items:end">
      <label class="grow" style="min-width:200px">Search<input id="q" placeholder="Park, city or state"></label>
      <label>State<select id="st"><option value="">All</option>${states.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label>Sort<select id="sort"><option value="reps">Most riders</option><option value="score">Crew score</option><option value="status">In the game first</option></select></label>
      <button class="btn ghost" id="near" type="button">📍 Near me</button></div>
    <div class="grid" id="plist"></div>`;
};
pages.parks.after = () => {
  const all = state.parks; let here = null;
  const km = (p) => { // haversine
    const r = Math.PI / 180, dLat = (p.lat - here.lat) * r, dLng = (p.lng - here.lng) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(here.lat * r) * Math.cos(p.lat * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };
  const draw = () => {
    const q = $('#q').value.toLowerCase(), st = $('#st').value, sort = $('#sort').value;
    let list = all.filter((p) => (!st || p.state === st) && `${p.name} ${p.city} ${p.state}`.toLowerCase().includes(q));
    if (here) list = list.filter((p) => p.lat != null).sort((a, b) => km(a) - km(b));
    else if (sort === 'reps') list.sort((a, b) => b.members - a.members || b.crewScore - a.crewScore);
    else if (sort === 'score') list.sort((a, b) => b.crewScore - a.crewScore);
    $('#plist').innerHTML = list.map((p) => here ? parkCard(p).replace('</a>', `<div class="mute small">${Math.round(km(p))} km away</div></a>`) : parkCard(p)).join('') || '<p class="mute">No matches.</p>';
  };
  ['q', 'st', 'sort'].forEach((id) => $('#' + id).addEventListener('input', () => { here = null; draw(); }));
  $('#near').onclick = () => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition((pos) => { here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; draw(); }, () => toast('Location blocked — use the state filter instead'))
    : toast('Location not available');
  draw();
};

pages.park = async ([slug]) => {
  const d = await get(`/parks/${encodeURIComponent(slug)}`);
  const p = d.park, u = state.user;
  const kid = u && u.age < 13;
  const presets = kid ? (await get('/parks/presets')).presets : [];
  let compose = '';
  if (!u) compose = '<p class="mute"><a href="#/login">Log in</a> to represent this park.</p>';
  else if (!u.social) compose = '<p class="mute">Social features unlock once a parent/guardian approves your account.</p>';
  else if (!d.isMember) compose = `<p>${d.representing ? `You currently represent <b>${esc(d.representing.name)}</b>.` : "You don't represent a park yet."}</p>
    <button class="btn" id="join">Represent ${esc(p.name)}</button>`;
  else compose = (kid
    ? `<div class="chips">${presets.map((t, i) => `<button class="chip" data-preset="${i}">${esc(t)}</button>`).join('')}</div>`
    : `<form id="postform" style="max-width:none"><div class="row"><input class="grow" name="body" maxlength="200" placeholder="Say something to the crew…" required><button class="btn">Post</button></div></form>`)
    + '<p class="small"><a href="#" id="leave" class="mute">Stop representing this park</a></p>';
  return `<p><a href="#/parks">← All parks</a></p>
    <div class="row"><h1 class="grow">${esc(p.name)}</h1>${pill(p.status)}</div>
    <p class="mute">${esc(p.city)}, ${esc(p.state)}${p.visitDate ? ' · developer visit ' + esc(when(p.visitDate)) : ''}</p>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    ${p.lat != null ? `<p class="small"><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${+p.lat}&mlon=${+p.lng}#map=17/${+p.lat}/${+p.lng}">View on map ↗</a></p>` : ''}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="card"><h3>Park leaderboard</h3>${d.leaderboard.length ? `<div class="tablewrap"><table><tr><th>#</th><th>Rider</th><th>Best score</th><th>Best combo</th></tr>
        ${d.leaderboard.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#/u/${esc(r.username)}">${esc(r.username)}</a></td><td>${fmt(r.bestScore)}</td><td>${fmt(r.bestCombo)}</td></tr>`).join('')}</table></div>` : '<p class="mute">No scores yet — be the first.</p>'}</section>
      <section class="card"><h3>Riders representing <span class="mute small">(${d.crew.length + d.privateRiders})</span></h3>${d.crew.length ? d.crew.map((c) =>
        `<div><span class="dot ${c.online ? '' : 'off'}"></span><a href="#/u/${esc(c.username)}">${esc(c.username)}</a> <span class="mute small">Lv ${c.level} · ${fmt(c.bestScore)} pts${c.online ? ' · skating now' : ''}</span></div>`).join('') : (d.privateRiders ? '' : '<p class="mute">Nobody yet.</p>')}
        ${d.privateRiders ? `<p class="mute small">🔒 + ${d.privateRiders} private rider${d.privateRiders === 1 ? '' : 's'}</p>` : ''}</section>
    </div>
    <section class="card" style="margin-top:14px"><h3>Park board</h3>${compose}
      <div id="posts">${d.posts.map((m) => `<div class="post">${m.username ? `<a href="#/u/${esc(m.username)}"><b>${esc(m.username)}</b></a>` : '<b>A rider</b>'} <span class="mute small">${esc(when(m.createdAt))}</span><br>${esc(m.body)}
        ${u?.social ? ` <button class="chip" data-respect="${m.id}" data-on="${m.respected ? 1 : 0}" style="min-height:28px;padding:2px 10px">🤙 ${m.respects}</button> <a href="#" class="small mute" data-report="${m.id}">report</a>` : `<span class="small mute">🤙 ${m.respects}</span>`}</div>`).join('') || '<p class="mute">Quiet so far.</p>'}</div></section>`;
};
pages.park.after = ([slug]) => {
  const p = `/parks/${encodeURIComponent(slug)}`;
  const run = (fn) => async (e) => { e.preventDefault(); try { await fn(e); route(); } catch (x) { toast(x.message); } };
  $('#join')?.addEventListener('click', run(async () => { await post(`${p}/join`); toast("You're representing this park!"); }));
  $('#leave')?.addEventListener('click', run(() => del(`${p}/join`)));
  $('#postform')?.addEventListener('submit', run((e) => post(`${p}/posts`, { body: new FormData(e.target).get('body') })));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', run(() => post(`${p}/posts`, { preset: +b.dataset.preset }))));
  document.querySelectorAll('[data-respect]').forEach((b) => b.addEventListener('click', run(() => (b.dataset.on === '1' ? del : post)(`/posts/${b.dataset.respect}/respect`))));
  document.querySelectorAll('[data-report]').forEach((a) => a.addEventListener('click', async (e) => { e.preventDefault(); try { await post(`/posts/${a.dataset.report}/report`); toast('Thanks — reported'); a.remove(); } catch (x) { toast(x.message); } }));
};

pages.map = mapPage; pages.map.after = mapPage.after;

pages.spots = async () => {
  const [{ parks }, { spots }] = await Promise.all([get('/parks'), get('/spots')]);
  const up = parks.filter((p) => p.status === 'scheduled').sort((a, b) => (a.visitDate || '').localeCompare(b.visitDate || ''));
  const u = state.user, PUBLIC = ['approved', 'planned', 'converted'];
  const mine = spots.filter((s) => s.mine && !PUBLIC.includes(s.status)), pub = spots.filter((s) => PUBLIC.includes(s.status));
  const card = (s, voting = true) => `<div class="card"><div class="row"><h3 class="grow">◆ ${esc(s.name)}</h3>${pill(s.status === 'approved' ? 'scanned' : s.status)}</div>
    <div>${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>${s.description ? `<p class="small">${esc(s.description)}</p>` : ''}
    ${s.photos.length ? `<div class="thumbs">${s.photos.map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Photo of ${esc(s.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:8px"><span class="small mute grow">${esc(s.state ?? '')} · found by ${s.discoveredBy ? esc(s.discoveredBy) : 'a rider'}</span>
      ${s.parkSlug ? `<a class="btn sm" href="#/parks/${esc(s.parkSlug)}">See the park</a>` : voting ? `<button class="btn sm ${s.voted ? 'ghost' : ''}" data-vote="${s.id}" data-on="${s.voted ? 1 : 0}" ${u?.social ? '' : 'disabled'}>🤙 ${s.votes}</button>` : `<button class="btn sm danger" data-withdraw="${s.id}">Withdraw</button>`}</div></div>`;
  return `<div class="row"><h1 class="grow">Spots &amp; the tour</h1><a class="btn" href="#/map?submit=1">📍 Found a new spot?</a></div>
    <p class="mute">Where the developer is headed next — and the spots riders like you have found. The more votes a spot gets, the sooner it moves up the list.</p>
    <h2>Scheduled visits</h2><div class="grid">${up.map(parkCard).join('') || '<p class="mute">Nothing scheduled yet.</p>'}</div>
    ${mine.length ? `<h2 style="margin-top:28px">Your submissions</h2><p class="small mute">Only you can see these until an admin approves them.</p><div class="grid">${mine.map((s) => card(s, false)).join('')}</div>` : ''}
    <h2 style="margin-top:28px">Community spots</h2><div class="grid">${pub.map((s) => card(s)).join('') || '<p class="mute">No community spots yet — be the first.</p>'}</div>`;
};
pages.spots.after = () => {
  document.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', async () => {
    try { await (b.dataset.on === '1' ? del : post)(`/spots/${b.dataset.vote}/vote`); route(); } catch (x) { toast(x.message); }
  }));
  document.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Withdraw this spot?')) return;
    try { await del(`/spots/${b.dataset.withdraw}`); route(); } catch (x) { toast(x.message); }
  }));
};
pages.tour = pages.spots; // old links

pages.feed = async () => {
  if (!state.user) return redirect('#/login');
  const f = await get('/feed');
  return `<h1>Your crew</h1>${f.home ? `<p class="mute">You rep <a href="#/parks/${esc(f.home.slug)}"><b>${esc(f.home.name)}</b></a>.</p>` : '<div class="notice">You don\'t rep a park yet — <a href="#/map">find yours on the map</a>.</div>'}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="card"><h3>From the frontier</h3>${f.news.map((n) => `<div class="newsitem"><b>${esc(n.title)}</b><div class="small mute">${esc(n.body)}</div></div>`).join('') || '<p class="mute">Nothing yet.</p>'}</section>
      <section class="card"><h3>Your park's board</h3>${f.posts.map((m) => `<div class="post">${m.username ? `<a href="#/u/${esc(m.username)}"><b>${esc(m.username)}</b></a>` : '<b>A rider</b>'} <span class="small mute">${esc(when(m.createdAt))}</span><br>${esc(m.body)} <span class="small mute">🤙 ${m.respects}</span></div>`).join('') || '<p class="mute">Quiet so far.</p>'}</section>
      <section class="card"><h3>New spots near you</h3>${f.spots.map((s) => `<div class="post"><a href="#/map"><b>◆ ${esc(s.name)}</b></a> <span class="small mute">${s.votes} vote${s.votes === 1 ? '' : 's'}</span></div>`).join('') || '<p class="mute">Nothing nearby yet.</p>'}
        <p><a class="btn sm" href="#/map?submit=1">📍 Add a spot</a></p></section></div>`;
};

function profileHtml(p, mine) {
  const lock = p.private && mine ? `<div class="notice">🔒 <b>Your profile is private.</b> Only you${state.user?.age < 13 ? ' and your parent' : ''} can see it. It isn't shown on leaderboards, rider lists or search, and your park posts show as “A rider”.</div>` : '';
  const next = p.level * 1000, pct = Math.min(100, Math.round(((p.xp % next) / next) * 100));
  const svg = posterSvg(p); state.poster = { svg, username: p.username };
  return `${lock}<div class="profile-grid">
    <div><div class="poster" id="poster">${svg}</div>
      <div class="row" style="justify-content:center;margin-top:20px"><button class="btn sm" id="dlposter">⬇ Save poster</button>${!p.private ? '<button class="btn sm ghost" id="cplink">Copy profile link</button>' : ''}</div></div>
    <div>
      <div class="row"><h1 class="grow">${esc(p.username)}${p.private ? ' 🔒' : ''}</h1>${p.homePark ? `<a class="pill released" href="#/parks/${esc(p.homePark.slug)}">🏠 ${esc(p.homePark.name)}</a>` : ''}</div>
      <div class="row mute small"><span>Joined ${esc(when(p.joined))}</span><span>${p.followers} follower${p.followers === 1 ? '' : 's'}</span></div>
      <div class="stats"><div class="stat"><b>${p.level}</b><span>Level</span></div><div class="stat"><b>${fmt(p.bestScore)}</b><span>Best score</span></div>
        <div class="stat"><b>${fmt(p.bestCombo)}</b><span>Best combo</span></div><div class="stat"><b>${p.tricks.length}</b><span>Tricks known</span></div><div class="stat"><b>${p.playHours}h</b><span>Time skated</span></div></div>
      <div class="level" title="XP progress"><i style="width:${pct}%"></i></div>
      ${!mine && state.user?.social ? `<p><button class="btn sm ${p.following ? 'ghost' : ''}" id="follow" data-on="${p.following ? 1 : 0}">${p.following ? 'Following' : 'Follow'}</button></p>` : ''}
      <section class="card" style="margin-top:14px"><h3>Wanted for</h3>${p.tricks.length ? `<div class="tablewrap"><table><tr><th>Trick</th><th>Landed</th><th>Best</th></tr>${p.tricks.map((t) => `<tr><td>${esc(t.name)}</td><td>${fmt(t.landed)}×</td><td>${fmt(t.bestScore)}</td></tr>`).join('')}</table></div>` : '<p class="mute">No tricks recorded yet.</p>'}</section>
      <section class="card" style="margin-top:14px"><h3>Park bests</h3>${p.parks.length ? p.parks.map((k) => `<div class="post"><a href="#/parks/${esc(k.slug)}">${esc(k.name)}</a><br><span class="mute small">Score ${fmt(k.bestScore)} · Combo ${fmt(k.bestCombo)}</span></div>`).join('') : '<p class="mute">Skate a park to set a best.</p>'}</section>
    </div></div>`;
}
const bindProfile = () => {
  $('#dlposter')?.addEventListener('click', () => state.poster && downloadPoster(state.poster.svg, `wanted-${state.poster.username}.png`));
  $('#cplink')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}/#/u/${state.poster.username}`); toast('Link copied'); } catch { toast(`${location.origin}/#/u/${state.poster.username}`); } });
};
pages.me = async () => {
  if (!state.user) return redirect('#/login');
  const p = await get('/me/profile'), u = state.user;
  return `${u.consentStatus === 'pending' ? '<div class="notice">We emailed your parent/guardian to approve your account. Social features unlock after they approve. <button class="btn sm ghost" id="resend" style="margin-left:8px">Resend the email</button></div>' : ''}
    ${profileHtml(p, true)}
    <section class="card" style="margin-top:14px"><h3>Account</h3>
      ${u.canChangePrivacy ? `<label class="row" style="flex-direction:row;font-weight:400;margin-bottom:12px"><input type="checkbox" id="priv" style="width:auto;min-height:0" ${u.profilePrivate ? 'checked' : ''}> <span>Private profile — hide me from leaderboards, rider lists and search (my posts show as “A rider”)</span></label>`
        : '<p class="small mute">🔒 Profiles for players under 13 are always private.</p>'}
      <div class="row"><a class="btn ghost sm" href="#/play">Redeem a key / get the game</a><button class="btn danger sm" id="delacct">Delete my account &amp; data</button></div></section>`;
};
pages.me.after = () => {
  bindProfile();
  $('#priv')?.addEventListener('change', async (e) => {
    try { await api('PATCH', '/me/settings', { profilePrivate: e.target.checked }); await refreshUser(); toast(e.target.checked ? 'Profile is now private' : 'Profile is now public'); route(); }
    catch (x) { toast(x.message); e.target.checked = !e.target.checked; }
  });
  $('#resend')?.addEventListener('click', async () => { try { await post('/auth/resend-consent'); toast('Sent! Ask your parent to check their inbox (and spam).'); } catch (x) { toast(x.message); } });
  $('#delacct')?.addEventListener('click', async () => {
    if (!confirm('Delete your account and all your data? This cannot be undone.')) return;
    await del('/me'); setSession(null); await refreshUser(); location.hash = '#/';
  });
};
pages.u = async ([name]) => profileHtml(await get(`/players/${encodeURIComponent(name)}`), false);
pages.u.after = ([name]) => {
  bindProfile();
  $('#follow')?.addEventListener('click', async (e) => {
    try { await (e.target.dataset.on === '1' ? del : post)(`/players/${encodeURIComponent(name)}/follow`); route(); } catch (x) { toast(x.message); }
  });
};

pages.login = () => `<h1>Log in</h1><form id="f"><label>Username<input name="username" autocomplete="username" required></label>
  <label>Password<input type="password" name="password" autocomplete="current-password" required></label><div class="err" id="err"></div><button class="btn">Log in</button></form>
  <p class="mute">New here? <a href="#/register">Create an account</a></p>`;
pages.login.after = () => $('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const r = await post('/auth/login', Object.fromEntries(new FormData(e.target))); setSession(r.token); await refreshUser(); location.hash = '#/me'; }
  catch (x) { $('#err').textContent = x.message; }
});

pages.register = () => `<h1>Create your account</h1>
  <p class="mute">Pick a nickname — please don't use your real name. We only ask for birth year so we can keep younger players safe.</p>
  <form id="f"><label>Game code<input name="signupCode" placeholder="XXXXXX-XXXXXX-XXXXXX" autocomplete="off" required></label>
  <p class="mute small" style="margin:-6px 0 0">Comes with the game from ${esc(state.cfg.studioName)}. Players only.${state.cfg.canBuy ? ' <a href="#/play">Don\'t have it yet?</a>' : ''}</p>
  <label>Username<input name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,20}" required></label>
  <label>Password (8+ characters)<input type="password" name="password" minlength="8" autocomplete="new-password" required></label>
  <label>Birth year<input name="birthYear" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></label>
  <label id="pe" hidden>Parent/guardian email<input type="email" name="parentEmail"></label>
  <div class="err" id="err"></div><button class="btn">Sign up</button></form>
  <p class="mute small">Players under 13 need a parent or guardian to approve. See <a href="#/safety">Safety &amp; privacy</a>.</p>`;
pages.register.after = () => {
  const f = $('#f');
  const pre = new URLSearchParams((location.hash.split('?')[1] || '')).get('code'); if (pre) f.signupCode.value = pre;
  f.birthYear.addEventListener('input', () => {
    const y = +f.birthYear.value, kid = y > 1900 && new Date().getFullYear() - y < 13;
    $('#pe').hidden = !kid; f.parentEmail.required = kid;
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await post('/auth/register', Object.fromEntries(new FormData(f))); setSession(r.token); await refreshUser(); location.hash = '#/me'; }
    catch (x) { $('#err').textContent = x.message; }
  });
};

pages.parent = async ([token]) => {
  let d;
  try { d = await get(`/parent/${encodeURIComponent(token)}`); } catch (x) { return `<h1>Parent / guardian controls</h1><p>${esc(x.message)}</p>`; }
  const s = d.stored;
  return `<h1>Parent / guardian controls</h1>
    <p><b>${esc(d.child)}</b> signed up for ${esc(state.cfg.gameName)}. Status: <span class="pill ${d.status === 'approved' ? 'in_game' : 'scheduled'}">${d.status === 'approved' ? 'Approved' : 'Waiting for your approval'}</span></p>
    <div class="card"><h3>Everything we store about your child</h3>
      <table><tr><td>Nickname</td><td>${esc(s.nickname)}</td></tr><tr><td>Birth year</td><td>${esc(s.birthYear)}</td></tr><tr><td>Your email</td><td>${esc(s.parentEmail)}</td></tr>
      <tr><td>Level / best score</td><td>${esc(s.level)} / ${fmt(s.bestScore)}</td></tr><tr><td>Tricks known</td><td>${esc(s.tricksKnown)}</td></tr><tr><td>Skatepark they represent</td><td>${esc(s.representing ?? '—')}</td></tr></table>
      <p class="small mute">No real name, address, phone number or photo. No ads. We never sell data. See <a href="#/safety">Safety &amp; privacy</a>.</p></div>
    <div class="card" style="margin-top:14px"><h3>What approving allows</h3>
      <ul><li>Representing one local skatepark.</li><li>Sending <b>pre-written phrases</b> on that park's board (never free text). No private messages.</li></ul>
      <p>🔒 <b>Their profile is always private.</b> Their nickname, level, tricks and scores are never shown to other players — not on profiles, leaderboards, rider lists or search. Their phrases appear only as “A rider”, and they're counted only in anonymous park totals.</p>
      <div class="row">${d.status === 'approved' ? '' : '<button class="btn" id="approve">Approve</button>'}<button class="btn danger" id="del">Delete account &amp; all data</button></div>
      <p class="small mute">You can come back to this page any time from the email link. Deleting is permanent.</p></div>`;
};
pages.parent.after = ([token]) => {
  $('#approve')?.addEventListener('click', async () => { await post(`/parent/${encodeURIComponent(token)}`, { action: 'approve' }); toast('Approved'); route(); });
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Permanently delete this account and all its data?')) return;
    await post(`/parent/${encodeURIComponent(token)}`, { action: 'delete' }); app.innerHTML = '<h1>Deleted</h1><p>The account and its data have been removed.</p>';
  });
};

pages.thanks = async () => {
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('session_id') || '';
  const r = id ? await get(`/checkout/session/${encodeURIComponent(id)}`) : { paid: false };
  if (!r.paid) {
    if (id && !pages.thanks.tries--) return '<h1>Almost there</h1><p>We haven\'t seen your payment yet. If you were charged, your code will arrive by email shortly.</p>';
    if (id) setTimeout(() => { if (location.hash.startsWith('#/thanks')) route(); }, 2500);
    return `<h1>Thanks!</h1><p class="mute">Confirming your payment…</p>`;
  }
  return `<h1>You're in 🛹</h1><p>Thanks for buying ${esc(state.cfg.gameName)}! ${r.email ? `We also emailed your code to <b>${esc(r.email)}</b>.` : ''}</p>
    <div class="card"><div class="mute small">Your game code</div><div class="mono" style="font-size:1.4rem;margin:6px 0">${esc(r.code)}</div>
    ${r.used ? '<p class="mute">This code has already been used to create an account.</p>' : `<a class="btn" href="#/register?code=${encodeURIComponent(r.code)}">Create my crew account</a>`}</div>
    <p class="small mute">Keep this code private — it works once. If a child will play, a parent/guardian will be asked to approve their account.</p>`;
};
pages.thanks.tries = 8;

const buyBox = () => state.cfg.canBuy ? `<div class="card" style="margin:16px 0"><h3>Buy ${esc(state.cfg.gameName)}</h3>
    <p class="mute small">Secure checkout by Stripe — we never see your card. You'll get a code by email and on the next page. (Under 18? Ask a parent or guardian to buy it.)</p>
    <form id="buy" class="row" style="max-width:none"><label class="grow" style="min-width:220px">Email for your code<input type="email" name="email" required autocomplete="email"></label><button class="btn" style="align-self:end">Buy now</button></form><div class="err" id="err"></div></div>` : '';
pages.play = async () => {
  if (!state.cfg.hostBuilds) return `<h1>Get the game</h1>${buyBox()}<p class="mute">${esc(state.cfg.gameName)} is distributed through the ${esc(state.cfg.studioName)} launcher.</p>
    ${state.cfg.launcherUrl ? `<p><a class="btn" href="${esc(state.cfg.launcherUrl)}" rel="noopener">Open the launcher page</a></p>` : ''}
    <p class="mute">After you get the game you'll receive a code to <a href="#/register">create your crew account</a>.</p>`;
  // Optional built-in build hosting (HOST_BUILDS=1)
  const ua = navigator.userAgent, plat = /Android/.test(ua) ? 'android' : /iPhone|iPad/.test(ua) ? 'ios' : /Mac/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'win64';
  const platforms = ['win64', 'mac', 'linux', 'android', 'ios'];
  const ms = await Promise.all(platforms.map((p) => get(`/launcher/manifest?kind=launcher&platform=${p}`).then((r) => [p, r.build])));
  const names = { win64: 'Windows', mac: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS' };
  const lib = state.user ? await get('/library').catch(() => ({})) : {};
  return `<h1>Play</h1>${buyBox()}<p class="mute">The ${esc(state.cfg.studioName)} launcher installs and updates ${esc(state.cfg.gameName)} for you — including every new park we scan.</p>
    <div class="grid">${ms.map(([p, b]) => `<div class="card"><h3>${names[p]}${p === plat ? ' <span class="pill">your device</span>' : ''}</h3>
      ${b ? `<p class="mute small">v${esc(b.version)} · ${bytes(b.size)}</p><a class="btn" href="${esc(b.downloadUrl)}">Download launcher</a>` : '<p class="mute small">Coming soon</p>'}</div>`).join('')}</div>
    <h2 style="margin-top:28px">Own the game?</h2>
    ${!state.user ? '<p><a href="#/login">Log in</a> to redeem your key and link the game to your profile.</p>'
      : lib.owned ? '<p>✅ This account owns the game. Open the launcher and log in with the same username.</p>'
      : `<form id="redeem"><label>Game key<input name="key" placeholder="XXXXXX-XXXXXX-XXXXXX" required></label><div class="err" id="err2"></div><button class="btn">Redeem</button></form>`}`;
};
pages.play.after = () => {
  $('#redeem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/licenses/redeem', { key: new FormData(e.target).get('key') }); toast('Unlocked!'); route(); } catch (x) { $('#err2').textContent = x.message; }
  });
  $('#buy')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { const r = await post('/checkout', { email: new FormData(e.target).get('email') }); location.href = r.url; }
    catch (x) { $('#err').textContent = x.message; btn.disabled = false; }
  });
};

pages.safety = () => `<h1>Safety &amp; privacy</h1>
  <div class="card"><ul>
  <li><b>Nicknames only.</b> No real names, no addresses, no phone numbers — and the park board blocks messages that look like contact details.</li>
  <li><b>Under 13?</b> We email a parent or guardian, and the account stays locked and hidden until they approve. They can review everything we store and delete it any time from the link in that email. Unapproved accounts are deleted automatically after 14 days. Younger players send pre-written phrases only, never free text.</li>
  <li><b>Under-13 profiles are always private.</b> Their name, stats and scores are never shown to other players; their board phrases appear as “A rider”. Players 13+ can also hide their profile in account settings.</li>
  <li><b>Reporting.</b> Every board message has a report link. Reported messages are hidden quickly and reviewed by a human.</li>
  <li><b>Your data.</b> We store your username, birth year, game stats and (for under-13s) a parent email. You or a parent can delete the account and all data any time from the profile page.</li>
  <li><b>Players only.</b> Accounts need a code that comes with the game, so everyone here is a real player.</li><li><b>Spot photos.</b> Only players 13+ can upload photos, only photos of the spot (no people), every photo is reviewed before anyone else can see it, and location data is stripped from the file. Under-13s can drop a pin and pick tags, nothing more.</li><li><b>No ads, no selling data.</b></li></ul>
  <p class="small mute">This page is a plain-language summary; replace it with your final privacy policy and terms before launch.</p></div>`;

// ---------- admin ----------
pages.admin = async () => {
  if (state.user?.role !== 'admin') return '<h1>Admins only</h1>';
  const tab = sessionStorage.getItem('atab') || 'world';
  const tabs = [...(state.cfg.hostBuilds ? ['builds'] : []), 'world', 'spots', 'parks', 'licenses', 'moderation', 'users'];
  return `<h1>Admin</h1><div class="tabs">${tabs.map((t) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tabbody">Loading…</div>`;
};
pages.admin.after = () => {
  let tab = sessionStorage.getItem('atab') || 'world';
  if (tab === 'builds' && !state.cfg.hostBuilds) tab = 'world';
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('atab', b.dataset.tab); route(); }));
  adminTabs[tab]($('#tabbody')).catch((e) => { $('#tabbody').textContent = e.message; });
};
const adminTabs = {
  async builds(el) {
    const { builds } = await get('/admin/builds');
    el.innerHTML = `<div class="card"><h3>Upload a build</h3>
      <p class="mute small">Drag a packaged game or launcher build (zip/installer) onto the box. It uploads as a draft — publish it when you're ready and every launcher updates to it.</p>
      <div class="row" style="margin-bottom:12px">
        <label>Type<select id="b-kind"><option value="game">Game</option><option value="launcher">Launcher</option></select></label>
        <label>Platform<select id="b-plat"><option>win64</option><option>mac</option><option>linux</option><option>android</option><option>ios</option></select></label>
        <label>Channel<select id="b-chan"><option>stable</option><option>beta</option></select></label>
        <label>Version<input id="b-ver" placeholder="1.2.0" style="width:120px"></label></div>
      <label style="margin-bottom:12px">Release notes<textarea id="b-notes" rows="2"></textarea></label>
      <div class="drop" id="drop" tabindex="0" role="button">⬆ Drop file here or click to choose<input type="file" id="file" hidden></div>
      <div class="bar" hidden id="bar"><i></i></div><div class="err" id="uerr"></div></div>
      <h3 style="margin-top:20px">Builds</h3><div class="card tablewrap"><table><tr><th>Type</th><th>Ver</th><th>Platform</th><th>Chan</th><th>Size</th><th>Status</th><th></th></tr>
      ${builds.map((b) => `<tr><td>${esc(b.kind)}</td><td>${esc(b.version)}</td><td>${esc(b.platform)}</td><td>${esc(b.channel)}</td><td>${bytes(b.size)}</td>
        <td>${b.published ? '<span class="pill in_game">live</span>' : '<span class="pill">draft</span>'}</td>
        <td class="row"><button class="btn sm ${b.published ? 'ghost' : ''}" data-pub="${b.id}" data-on="${b.published ? 0 : 1}">${b.published ? 'Unpublish' : 'Publish'}</button><button class="btn sm danger" data-bdel="${b.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="mute">No builds yet.</td></tr>'}</table></div>`;
    const drop = $('#drop', el), file = $('#file', el);
    const send = (f) => {
      const ver = $('#b-ver', el).value.trim();
      if (!ver) { $('#uerr', el).textContent = 'Enter a version first.'; return; }
      const fd = new FormData();
      fd.append('kind', $('#b-kind', el).value); fd.append('platform', $('#b-plat', el).value); fd.append('channel', $('#b-chan', el).value);
      fd.append('version', ver); fd.append('notes', $('#b-notes', el).value); fd.append('file', f); // file last so fields are parsed first
      const x = new XMLHttpRequest(); x.open('POST', '/api/admin/builds'); x.setRequestHeader('authorization', `Bearer ${state.token}`);
      const bar = $('#bar', el); bar.hidden = false;
      x.upload.onprogress = (e) => { if (e.lengthComputable) $('i', bar).style.width = (e.loaded / e.total * 100) + '%'; };
      x.onload = () => { if (x.status === 201) { toast('Uploaded as draft'); route(); } else $('#uerr', el).textContent = (JSON.parse(x.responseText || '{}').error) || 'Upload failed'; };
      x.onerror = () => { $('#uerr', el).textContent = 'Network error during upload'; };
      x.send(fd);
    };
    drop.onclick = () => file.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') file.click(); };
    file.onchange = () => file.files[0] && send(file.files[0]);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && send(e.dataTransfer.files[0]));
    el.querySelectorAll('[data-pub]').forEach((b) => b.onclick = async () => { await post(`/admin/builds/${b.dataset.pub}/publish`, { published: b.dataset.on === '1' }); route(); });
    el.querySelectorAll('[data-bdel]').forEach((b) => b.onclick = async () => { if (confirm('Delete this build file?')) { await del(`/admin/builds/${b.dataset.bdel}`); route(); } });
  },
  async world(el) {
    const [{ regions }, w] = await Promise.all([get('/admin/regions'), get('/world')]);
    const open = regions.filter((r) => r.status !== 'planned');
    el.innerHTML = `<div class="card"><h3>Open world · revision ${esc(w.revision)}</h3>
      <p class="small mute">Each state is one open-world level. When you ship a state build in your launcher, <b>Release</b> it here: its scanned parks flip to “in the game”, a news post goes up, the map turns the state rust-red, and the launcher/game see the change through <code>/api/world/manifest</code> (revision goes up). Your launcher pipeline can do this automatically with <code>POST /api/partner/regions/TX/release</code>.</p>
      <form id="relform" class="row" style="max-width:none;align-items:end"><label>State<select name="code">${regions.map((r) => `<option value="${esc(r.code)}">${esc(r.name)} (${esc(r.status)})</option>`).join('')}</select></label>
        <label>Game version<input name="version" placeholder="1.2.0" required style="width:120px"></label><label class="grow" style="min-width:200px">Notes (optional)<input name="notes" maxlength="300" placeholder="Austin, Dallas and 3 new parks"></label>
        <button class="btn">Release state</button></form><div class="err" id="relerr"></div></div>
      <div class="row" style="margin-top:18px"><h3 class="grow">States in progress</h3></div><div class="card tablewrap"><table><tr><th>State</th><th>Status</th><th>Version</th><th>Parks</th><th></th></tr>
      ${open.map((r) => `<tr><td>${esc(r.name)}</td><td>${pill(r.status)}</td><td>${esc(r.releaseVersion ?? '—')}</td><td>${r.parks}</td><td><select data-st="${esc(r.code)}">${['planned', 'scanning', 'released'].map((x) => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" class="mute">Nothing yet — start by setting a state to “scanning”.</td></tr>'}</table></div>
      <details class="card" style="margin-top:14px"><summary><b>Mark another state as scanning</b></summary><div class="row" style="margin-top:10px">${regions.filter((r) => r.status === 'planned').map((r) => `<button class="chip" data-scan="${esc(r.code)}">${esc(r.code)}</button>`).join('')}</div></details>
      <div class="card" style="margin-top:14px"><h3>Post an announcement</h3><form id="newsform" style="max-width:none"><label>Headline<input name="title" maxlength="120" required></label><label>Details<textarea name="body" rows="2" maxlength="500"></textarea></label><button class="btn">Post</button></form></div>`;
    $('#relform', el).onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (!confirm(`Release ${f.code} at v${f.version}? Players and launchers will see it immediately.`)) return;
      const go = (force) => post(`/admin/regions/${f.code}/release`, { version: f.version, notes: f.notes, force });
      try { const r = await go(false); toast(`Released — ${r.promoted} park(s) promoted to in-game`); route(); }
      catch (x) {
        if (x.data?.needsForce && confirm(`${x.message}\n\nRelease anyway?`)) { try { await go(true); toast('Released'); route(); } catch (y) { $('#relerr', el).textContent = y.message; } }
        else $('#relerr', el).textContent = x.message;
      }
    };
    el.querySelectorAll('[data-st]').forEach((s2) => s2.onchange = async () => { try { await post(`/admin/regions/${s2.dataset.st}`, { status: s2.value }); toast('Saved'); } catch (x) { toast(x.message); } });
    el.querySelectorAll('[data-scan]').forEach((b) => b.onclick = async () => { await post(`/admin/regions/${b.dataset.scan}`, { status: 'scanning' }); route(); });
    $('#newsform', el).onsubmit = async (e) => { e.preventDefault(); await post('/admin/news', Object.fromEntries(new FormData(e.target))); toast('Posted'); route(); };
  },
  async spots(el) {
    const status = sessionStorage.getItem('spotfilter') || 'pending';
    const { spots } = await get(`/admin/spots?status=${status}`);
    el.innerHTML = `<div class="tabs">${['pending', 'approved', 'planned', 'converted', 'rejected'].map((x) => `<button data-sf="${x}" class="${x === status ? 'on' : ''}">${x}</button>`).join('')}</div>
      ${spots.map((s) => `<div class="card" style="margin-bottom:12px"><div class="row"><h3 class="grow" style="margin:0">◆ ${esc(s.name)}</h3>${pill(s.status === 'approved' ? 'scanned' : s.status)}</div>
        <p class="small mute">${esc(s.state ?? '?')} · ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)} · by <b>${esc(s.submittedBy)}</b> · ${s.votes} vote${s.votes === 1 ? '' : 's'} · <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${+s.lat}&mlon=${+s.lng}#map=18/${+s.lat}/${+s.lng}">open in maps ↗</a></p>
        <div>${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>${s.description ? `<p>${esc(s.description)}</p>` : ''}
        ${s.photos.length ? `<div class="thumbs">${s.photos.map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Photo submitted for ${esc(s.name)}"></a>`).join('')}</div><p class="small mute">Check photos for faces, plates and personal info before approving.</p>` : ''}
        ${s.adminNote ? `<p class="small"><b>Note:</b> ${esc(s.adminNote)}</p>` : ''}
        <div class="row" style="margin-top:8px">${s.status !== 'converted' ? `${s.status !== 'approved' ? `<button class="btn sm" data-sa="${s.id}" data-v="approved">Approve</button>` : ''}
          ${s.status !== 'planned' ? `<button class="btn sm ghost" data-sa="${s.id}" data-v="planned">Plan a visit</button>` : ''}
          ${s.status !== 'rejected' ? `<button class="btn sm danger" data-sa="${s.id}" data-v="rejected">Reject</button>` : ''}
          <button class="btn sm ghost" data-promote="${s.id}" data-name="${esc(s.name)}" data-state="${esc(s.state ?? '')}">➜ Add to the tour</button>` : s.parkSlug ? `<a class="btn sm" href="#/parks/${esc(s.parkSlug)}">View park</a>` : ''}</div></div>`).join('') || `<p class="mute">No ${esc(status)} spots.</p>`}`;
    el.querySelectorAll('[data-sf]').forEach((b) => b.onclick = () => { sessionStorage.setItem('spotfilter', b.dataset.sf); route(); });
    el.querySelectorAll('[data-sa]').forEach((b) => b.onclick = async () => {
      const note = b.dataset.v === 'rejected' ? (prompt('Reason (shown only to admins):') ?? '') : null;
      try { await post(`/admin/spots/${b.dataset.sa}`, { status: b.dataset.v, note }); route(); } catch (x) { toast(x.message); }
    });
    el.querySelectorAll('[data-promote]').forEach((b) => b.onclick = async () => {
      const city = prompt(`City for “${b.dataset.name}”${b.dataset.state ? ` (${b.dataset.state})` : ''}:`); if (!city) return;
      const visitDate = prompt('Planned visit date (YYYY-MM-DD, or leave blank):') || '';
      try { const r = await post(`/admin/spots/${b.dataset.promote}/promote`, { city, visitDate }); toast('Added to the tour'); location.hash = `#/parks/${r.slug}`; } catch (x) { toast(x.message); }
    });
  },
  async parks(el) {
    const { parks } = await get('/parks');
    el.innerHTML = `<div class="card"><h3>Add a park</h3><form id="pf" style="max-width:none"><div class="grid">
      <label>Name<input name="name" required></label><label>City<input name="city" required></label><label>State (2 letters)<input name="state" required maxlength="2" placeholder="TX" style="text-transform:uppercase"></label>
      <label>Latitude (puts it on the map)<input name="lat" type="number" step="any"></label><label>Longitude<input name="lng" type="number" step="any"></label>
      <label>Visit date<input name="visitDate" type="date"></label>
      <label>Status<select name="status"><option value="planned">planned</option><option value="scheduled">scheduled</option><option value="scanned">scanned</option><option value="in_game">in_game</option></select></label></div>
      <label>Description<textarea name="description" rows="2"></textarea></label><div class="err" id="err"></div><button class="btn">Add park</button></form></div>
      <h3 style="margin-top:20px">All parks</h3><div class="card tablewrap"><table><tr><th>Park</th><th>Status</th><th>Visit</th></tr>${parks.map((p) => `<tr><td><a href="#/parks/${esc(p.slug)}">${esc(p.name)}</a><div class="mute small">${esc(p.city)}, ${esc(p.state)}</div></td>
      <td><select data-st="${esc(p.slug)}">${['planned', 'scheduled', 'scanned', 'in_game'].map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><input type="date" data-dt="${esc(p.slug)}" value="${esc(p.visitDate ?? '')}"></td></tr>`).join('')}</table></div>`;
    $('#pf', el).onsubmit = async (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.target));
      for (const k of ['lat', 'lng']) b[k] = b[k] === '' ? null : Number(b[k]);
      try { await post('/admin/parks', b); toast('Park added'); route(); } catch (x) { $('#err', el).textContent = x.message; }
    };
    el.querySelectorAll('[data-st]').forEach((s) => s.onchange = async () => { await api('PATCH', `/admin/parks/${s.dataset.st}`, { status: s.value }); toast('Saved'); });
    el.querySelectorAll('[data-dt]').forEach((s) => s.onchange = async () => { await api('PATCH', `/admin/parks/${s.dataset.dt}`, { visitDate: s.value }); toast('Saved'); });
  },
  async licenses(el) {
    const { licenses } = await get('/admin/licenses');
    el.innerHTML = `<div class="card"><h3>Generate keys</h3><form id="lf" class="row" style="max-width:none"><label>How many<input name="count" type="number" min="1" max="500" value="1" style="width:100px"></label>
      <label>Note<input name="note" placeholder="e.g. Kickstarter backers"></label><button class="btn" style="align-self:end">Generate</button></form><pre id="keys" class="mono"></pre></div>
      <h3 style="margin-top:20px">Keys</h3><div class="card tablewrap"><table><tr><th>Key</th><th>Source</th><th>Buyer</th><th>Used by</th><th>Status</th><th></th></tr>${licenses.map((l) => `<tr><td class="mono">${esc(l.key)}</td><td>${esc(l.note)}</td><td>${esc(l.email ?? '—')}</td><td>${esc(l.redeemedBy ?? '—')}</td>
      <td>${l.revokedAt ? `<span class="pill">revoked: ${esc(l.revokedReason ?? '')}</span>` : '<span class="pill in_game">active</span>'}</td>
      <td>${l.revokedAt ? `<button class="btn sm ghost" data-re="${esc(l.key)}">Reinstate</button>` : `<button class="btn sm danger" data-rv="${esc(l.key)}">Revoke</button>`}</td></tr>`).join('')}</table></div>`;
    el.querySelectorAll('[data-rv]').forEach((b) => b.onclick = async () => { if (confirm('Revoke this key and suspend the account that used it?')) { await post(`/admin/licenses/${b.dataset.rv}/revoke`, { reason: 'admin revoke' }); route(); } });
    el.querySelectorAll('[data-re]').forEach((b) => b.onclick = async () => { await post(`/admin/licenses/${b.dataset.re}/reinstate`); route(); });
    $('#lf', el).onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); const r = await post('/admin/licenses', { count: +f.get('count'), note: f.get('note') }); $('#keys', el).textContent = r.keys.join('\n'); };
  },
  async moderation(el) {
    const { reports } = await get('/admin/reports');
    el.innerHTML = reports.length ? reports.map((r) => `<div class="card" style="margin-bottom:10px"><b>${esc(r.author)}</b> <span class="mute small">in ${esc(r.park)} · ${r.reports} report(s)${r.hidden ? ' · auto-hidden' : ''}</span>
      <p>${esc(r.body)}</p><button class="btn sm danger" data-mod="${r.postId}" data-act="remove">Remove</button> <button class="btn sm ghost" data-mod="${r.postId}" data-act="restore">Keep / restore</button></div>`).join('') : '<p class="mute">No open reports 🎉</p>';
    el.querySelectorAll('[data-mod]').forEach((b) => b.onclick = async () => { await post(`/admin/posts/${b.dataset.mod}/moderate`, { action: b.dataset.act }); route(); });
  },
  async users(el) {
    el.innerHTML = `<label style="max-width:320px">Search username<input id="uq" placeholder="start typing…"></label><div id="ulist" class="card tablewrap" style="margin-top:12px"></div>`;
    const load = async () => {
      const { users } = await get(`/admin/users?q=${encodeURIComponent($('#uq', el).value)}`);
      $('#ulist', el).innerHTML = `<table><tr><th>User</th><th>Role</th><th>Consent</th><th></th></tr>${users.map((u) => `<tr><td>${esc(u.username)}${u.banned === 2 ? ' <span class="pill">suspended (refund)</span>' : u.banned ? ' <span class="pill">banned</span>' : ''}</td><td>${esc(u.role)}</td><td>${esc(u.consentStatus)}</td>
        <td class="row"><button class="btn sm ghost" data-ban="${u.id}" data-v="${u.banned ? 0 : 1}">${u.banned ? 'Unban' : 'Ban'}</button>
        <button class="btn sm ghost" data-role="${u.id}" data-v="${u.role === 'admin' ? 'player' : 'admin'}">Make ${u.role === 'admin' ? 'player' : 'admin'}</button></td></tr>`).join('')}</table>`;
      el.querySelectorAll('[data-ban]').forEach((b) => b.onclick = async () => { await post(`/admin/users/${b.dataset.ban}`, { banned: b.dataset.v === '1' }); load(); });
      el.querySelectorAll('[data-role]').forEach((b) => b.onclick = async () => { await post(`/admin/users/${b.dataset.role}`, { role: b.dataset.v }); load(); });
    };
    $('#uq', el).oninput = load; load();
  },
};

// ---------- router ----------
function redirect(h) { location.hash = h; return ''; }
async function route() {
  renderNav();
  const parts = (location.hash.slice(2).split('?')[0] || '').split('/').map(decodeURIComponent);
  const [name, ...args] = parts;
  let key = name || 'home';
  if (key === 'parks' && args.length) key = 'park';
  if (key === 'logout') { setSession(null); await refreshUser(); return redirect('#/'); }
  const page = pages[key] ?? (() => '<h1>Not found</h1><p><a href="#/">Go home</a></p>');
  app.innerHTML = '<p class="mute">Loading…</p>';
  try {
    const html = await page(args);
    if (typeof html === 'string' && html) { app.innerHTML = html; window.scrollTo(0, 0); page.after?.(args); }
  } catch (e) { app.innerHTML = `<h1>Oops</h1><p>${esc(e.message)}</p>`; }
  $('#nav').classList.remove('open');
}
window.addEventListener('hashchange', route);

(async () => {
  try { state.cfg = await get('/config'); } catch {}
  $('#brand').textContent = state.cfg.gameName;
  document.title = `${state.cfg.gameName} · ${state.cfg.studioName}`;
  $('#foot').textContent = `© ${new Date().getFullYear()} ${state.cfg.studioName}`;
  await refreshUser();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  route();
})();
