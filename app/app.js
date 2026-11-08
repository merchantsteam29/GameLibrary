const $ = s => document.querySelector(s);
let games = [], running = new Set(), current = null;

const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
function paintThumb(el, g) {
  el.textContent = '';
  if (g.thumb) {
    el.classList.remove('gen');
    el.style.backgroundImage = `url("${g.thumb}")`;
  } else {
    const h = hue(g.title);
    el.classList.add('gen');
    el.style.backgroundImage = `linear-gradient(135deg, hsl(${h} 70% 38%), hsl(${(h + 60) % 360} 70% 18%))`;
    el.textContent = g.title;
  }
}

function ago(t) {
  if (!t) return 'Never played';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'Played just now';
  if (s < 3600) return `Played ${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `Played ${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'Played yesterday' : `Played ${d} days ago`;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}

async function refresh() {
  const r = await lib.list();
  games = r.games; running = new Set(r.running);
  renderGrid();
  if (current) { const g = games.find(x => x.id === current); g ? renderDetail(g) : showGrid(); }
}

function sorted() {
  const q = $('#search').value.trim().toLowerCase();
  const list = games.filter(g => !q || g.title.toLowerCase().includes(q) || (g.desc || '').toLowerCase().includes(q));
  const mode = $('#sort').value;
  list.sort((a, b) =>
    (b.favorite | 0) - (a.favorite | 0) ||
    (mode === 'az' ? a.title.localeCompare(b.title)
      : mode === 'added' ? b.added - a.added
      : (b.lastPlayed - a.lastPlayed) || a.title.localeCompare(b.title)));
  return list;
}

function renderGrid() {
  const grid = $('#grid'); grid.textContent = '';
  const list = sorted();
  $('#empty').hidden = games.length > 0;
  for (const g of list) {
    const card = document.createElement('div');
    card.className = 'card' + (g.missing ? ' missing' : '');
    card.tabIndex = 0;
    const th = document.createElement('div'); th.className = 'thumb'; paintThumb(th, g);
    const quick = document.createElement('button'); quick.className = 'quick'; quick.textContent = '▶'; quick.title = 'Play now';
    quick.onclick = e => { e.stopPropagation(); play(g.id); };
    th.append(quick);
    if (running.has(g.id)) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'RUNNING'; card.append(b); }
    if (g.favorite) { const f = document.createElement('span'); f.className = 'fav'; f.textContent = '★'; card.append(f); }
    const meta = document.createElement('div'); meta.className = 'meta';
    const h = document.createElement('h3'); h.textContent = g.title;
    const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = g.missing ? 'Folder missing' : ago(g.lastPlayed);
    meta.append(h, sub);
    card.append(th, meta);
    card.onclick = () => showDetail(g.id);
    card.onkeydown = e => { if (e.key === 'Enter') showDetail(g.id); };
    grid.append(card);
  }
}

function renderDetail(g) {
  document.title = g.title + ' — Game Library';
  paintThumb($('#d-thumb'), g);
  $('#d-bg').style.backgroundImage = $('#d-thumb').style.backgroundImage;
  $('#d-title').textContent = g.title;
  $('#d-desc').textContent = g.desc || '';
  $('#d-stats').textContent = '';
  for (const s of [ago(g.lastPlayed), `${g.plays || 0} launch${g.plays === 1 ? '' : 'es'}`, `Added ${new Date(g.added).toLocaleDateString()}`]) {
    const span = document.createElement('span'); span.textContent = s; $('#d-stats').append(span);
  }
  const isRun = running.has(g.id);
  $('#d-play').textContent = isRun ? '● Running — switch to it' : '▶ Play';
  $('#d-play').classList.toggle('running', isRun);
  $('#d-play').disabled = !!g.missing;
  $('#d-fav').textContent = g.favorite ? '★' : '☆';
  $('#d-fav').classList.toggle('on', !!g.favorite);
  $('#d-path').textContent = g.dir + (g.missing ? '   (missing — no index.html here any more)' : '');
}

function showDetail(id) {
  current = id;
  renderDetail(games.find(g => g.id === id));
  $('#grid-view').hidden = true; $('#detail-view').hidden = false;
  window.scrollTo(0, 0);
}
function showGrid() {
  current = null; document.title = 'Game Library';
  $('#detail-view').hidden = true; $('#grid-view').hidden = false;
  renderGrid();
}

async function play(id) {
  const r = await lib.launch(id);
  if (!r.ok) toast(r.error);
  refresh();
}

$('#back').onclick = showGrid;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && current) showGrid();
  if (e.key === '/' && document.activeElement !== $('#search')) { e.preventDefault(); $('#search').focus(); }
});
document.addEventListener('mouseup', e => { if (e.button === 3 && current) showGrid(); }); // mouse back button
$('#search').oninput = renderGrid;
$('#sort').onchange = () => { try { localStorage.sort = $('#sort').value; } catch {} renderGrid(); };
try { if (localStorage.sort) $('#sort').value = localStorage.sort; } catch {}

$('#addBtn').onclick = async () => {
  const r = await lib.addFolder();
  toast(r.added ? `Added ${r.added} game${r.added > 1 ? 's' : ''}` : (r.msg || 'Nothing added'));
  refresh();
};
$('#rescanBtn').onclick = async () => {
  const n = await lib.rescan();
  toast(n ? `Found ${n} new game${n > 1 ? 's' : ''}` : 'No new games found');
  refresh();
};

$('#d-play').onclick = () => play(current);
$('#d-fav').onclick = async () => { const g = games.find(x => x.id === current); await lib.edit(current, { favorite: !g.favorite }); refresh(); };
$('#d-snap').onclick = async () => { const r = await lib.snapThumb(current); toast(r.ok ? 'Thumbnail updated' : r.error); refresh(); };
$('#d-pick').onclick = async () => { if (await lib.setThumb(current)) { toast('Thumbnail updated'); refresh(); } };
$('#d-folder').onclick = () => lib.openFolder(current);
$('#d-rename').onclick = () => {
  const h = $('#d-title');
  h.contentEditable = 'true'; h.focus();
  document.getSelection().selectAllChildren(h);
  const done = async save => {
    h.contentEditable = 'false'; h.onblur = h.onkeydown = null;
    if (save) await lib.edit(current, { title: h.textContent });
    refresh();
  };
  h.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
  h.onblur = () => done(true);
};
$('#d-remove').onclick = async () => {
  const g = games.find(x => x.id === current);
  if (!confirm(`Remove "${g.title}" from the library?\n\nThis only removes it from the list — your game files are not touched.`)) return;
  await lib.remove(current); showGrid(); refresh();
};

lib.onChange(refresh);
lib.onRunning(ids => { running = new Set(ids); renderGrid(); if (current) renderDetail(games.find(g => g.id === current)); });
refresh();
