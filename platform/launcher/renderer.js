const $ = (id) => document.getElementById(id);
const show = (m) => { $('err').textContent = m || ''; };
launcher.branding().then((b) => { $('name').textContent = b.studioName; document.title = `${b.gameName} — ${b.studioName}`; });
async function refresh() {
  const { game, launcherUpdate } = await launcher.status();
  $('info').textContent = game.latest ? `${game.upToDate ? 'Up to date' : 'Update available'} — v${game.latest.version}` + (launcherUpdate ? ` · launcher v${launcherUpdate.version} available` : '') : 'No build published yet';
  $('act').textContent = game.upToDate ? 'Play' : game.installed ? 'Update' : 'Install';
  $('act').dataset.mode = game.upToDate ? 'play' : 'install';
}
$('go').onclick = async () => { try { await launcher.login($('u').value, $('p').value); $('login').hidden = true; $('home').hidden = false; await refresh(); } catch (e) { show(e.message); } };
$('act').onclick = async () => {
  try {
    if ($('act').dataset.mode === 'play') return show('TODO: set the game executable path after unpack (see ROADMAP)');
    $('prog').hidden = false; launcher.onProgress((v) => { $('prog').value = v; });
    await launcher.install(); $('prog').hidden = true; await refresh();
  } catch (e) { show(e.message); }
};
