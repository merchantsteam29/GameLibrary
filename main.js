// Game Library — Electron main process.
// Local games (folders with an index.html) each get their own tiny static server on a fixed
// port, so ES modules, service workers and localStorage saves all work and persist.
// Online games come from the library website's catalog (games.json) and play straight from
// their own site, so the app works on any PC; a game you have locally always wins.
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Games run on the fast graphics card. Laptops with two GPUs otherwise often give Electron the slow built-in one,
// which is the most common reason a game lags in the app but not on a desktop.
app.commandLine.appendSwitch('force_high_performance_gpu');

// --data-dir=<folder> keeps the library somewhere else (a portable copy, or a clean test profile)
const dataArg = process.argv.find(x => x.startsWith('--data-dir='));
if (dataArg) app.setPath('userData', dataArg.slice('--data-dir='.length));
const DATA = app.getPath('userData');
const LIB_FILE = path.join(DATA, 'library.json');
const THUMBS = path.join(DATA, 'thumbs');
fs.mkdirSync(THUMBS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};

// ---------- library storage ----------
function loadLib() {
  try { return JSON.parse(fs.readFileSync(LIB_FILE, 'utf8')); } catch { return null; }
}
function saveLib(lib) { fs.writeFileSync(LIB_FILE, JSON.stringify(lib, null, 2)); }

function readMeta(dir) {
  let html = '';
  try { html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'); } catch { return null; }
  const title = (html.match(/<title>([^<]*)/i) || [])[1]?.trim() || path.basename(dir);
  let desc = (html.match(/name=["']description["']\s+content=["']([^"']*)/i) || [])[1] || '';
  if (!desc) {
    try {
      const md = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
      desc = md.split(/\r?\n\r?\n/).map(p => p.trim())
        .find(p => p && !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('<')) || '';
      desc = desc.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ');
    } catch {}
  }
  if (desc.length > 320) desc = desc.slice(0, 317).trimEnd() + '…';
  return { title, desc };
}

// a real cover image; app icons are square, so they are only a last resort (after a screenshot)
function findCover(dir) {
  for (const f of ['cover.png', 'cover.jpg', 'thumbnail.png', 'og.png', 'og.jpg']) {
    if (fs.existsSync(path.join(dir, f))) return path.join(dir, f);
  }
  return null;
}
function findIcon(dir) {
  for (const f of ['icons/icon-512.png', 'icon-512.png', 'icons/icon-192.png']) {
    if (fs.existsSync(path.join(dir, f))) return path.join(dir, f);
  }
  return null;
}

function makeId(dir) { return path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

function makeEntry(dir, lib) {
  const meta = readMeta(dir);
  if (!meta) return null;
  const used = new Set(lib.games.map(g => g.port));
  let port = 47100;
  while (used.has(port)) port++;
  let id = makeId(dir), n = 2;
  while (lib.games.some(g => !g.online && g.id === id)) id = makeId(dir) + '-' + n++;
  return { id, dir, title: meta.title, desc: meta.desc, port, added: Date.now(), lastPlayed: 0, plays: 0 };
}

// Game folders left out of the library on purpose (hidden.json, shared with the website build),
// plus any you removed yourself (lib.hidden), so a rescan does not bring them back.
const HIDDEN = new Set((() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'hidden.json'), 'utf8')); } catch { return []; } })().map(n => n.toLowerCase()));
const isHidden = (dir, lib) => HIDDEN.has(path.basename(dir).toLowerCase()) || (lib.hidden || []).includes(path.resolve(dir));

// Folders that look like games: has index.html, not this app, not a redirect stub.
function scanFolder(root, lib) {
  let added = 0;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
    const dir = path.join(root, e.name);
    if (dir === __dirname || path.basename(dir) === 'GameLibrary') continue;
    if (/redirect/i.test(e.name)) continue;
    if (!fs.existsSync(path.join(dir, 'index.html'))) continue;
    if (lib.games.some(g => !g.online && path.resolve(g.dir) === path.resolve(dir))) continue;
    if (isHidden(dir, lib)) continue;
    const entry = makeEntry(dir, lib);
    if (entry) { lib.games.push(entry); added++; }
  }
  return added;
}

function defaultRoot() {
  // --library-root=<folder> picks another games folder (also used to test a PC with no games).
  const arg = process.argv.find(x => x.startsWith('--library-root='));
  if (arg) return arg.slice('--library-root='.length);
  // Running from source: the folder next to GameLibrary. Packaged: ~/source/repos.
  if (!app.isPackaged) return path.dirname(__dirname);
  return path.join(os.homedir(), 'source', 'repos');
}

let lib = loadLib();
if (lib) lib.games = lib.games.filter(g => g.online || !HIDDEN.has(path.basename(g.dir).toLowerCase()));
function initLib() {
  if (lib) return;
  lib = { root: defaultRoot(), games: [] };
  scanFolder(lib.root, lib);
  saveLib(lib);
}

// ---------- online catalog ----------
const SITE = 'https://merchantsteam29.github.io/GameLibrary/';
const CATALOG_FILE = path.join(DATA, 'catalog.json');
const readCatalog = () => { try { return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')); } catch { return []; } };

// Add the catalog's games you don't have locally (and drop ones the catalog no longer lists).
function mergeCatalog(cat) {
  const localIds = new Set(lib.games.filter(g => !g.online).map(g => g.id));
  lib.games = lib.games.filter(g => !g.online || !localIds.has(g.id));
  const hiddenIds = new Set(lib.hiddenIds || []);
  const keep = new Set();
  for (const c of cat) {
    if (!c || !c.id || !c.url || localIds.has(c.id) || hiddenIds.has(c.id) || HIDDEN.has(c.id)) continue;
    keep.add(c.id);
    let g = lib.games.find(x => x.online && x.id === c.id);
    if (!g) { g = { id: c.id, online: true, added: Date.now(), lastPlayed: 0, plays: 0 }; lib.games.push(g); }
    g.url = c.url; g.remoteThumb = c.thumb ? new URL(c.thumb, SITE).href : null; g.updates = c.updates || [];
    if (!g.customTitle) g.title = c.title;
    if (!g.customDesc) g.desc = c.desc || '';
  }
  lib.games = lib.games.filter(g => !g.online || keep.has(g.id));
}

// Fetch the latest catalog (and its thumbnails, for offline use); fall back to the cached copy.
async function syncCatalog() {
  try {
    const res = await fetch(SITE + 'games.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const cat = await res.json();
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(cat));
    mergeCatalog(cat); saveLib(lib);
    for (const g of lib.games.filter(x => x.online && x.remoteThumb)) {
      const file = path.join(THUMBS, 'online-' + g.id + path.extname(new URL(g.remoteThumb).pathname));
      try { const r = await fetch(g.remoteThumb); if (r.ok) fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); } catch {}
    }
    libWin?.webContents.send('library-changed');
  } catch {} // offline: the cached catalog was merged at startup
}

function refreshMeta() {
  for (const g of lib.games) {
    if (g.online) { g.missing = false; continue; }
    const meta = readMeta(g.dir);
    g.missing = !meta;
    if (meta && !g.customTitle) g.title = meta.title;
    if (meta && !g.customDesc) g.desc = meta.desc;
  }
}

// a game's update history: optional updates.json in its folder, newest first
function readUpdates(dir) {
  try {
    const u = JSON.parse(fs.readFileSync(path.join(dir, 'updates.json'), 'utf8'));
    return (Array.isArray(u) ? u : []).filter(x => x && x.date && (x.title || x.version))
      .map(x => ({ version: String(x.version || ''), date: x.date, title: String(x.title || ''), notes: (x.notes || []).map(String) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}

function toFileUrl(p) { return require('url').pathToFileURL(p).href; }

function publicGame(g) {
  if (g.online) {
    const custom = g.customThumb && fs.existsSync(g.customThumb) ? toFileUrl(g.customThumb) : null;
    const cached = g.remoteThumb && path.join(THUMBS, 'online-' + g.id + path.extname(new URL(g.remoteThumb).pathname));
    return { ...g, dir: g.url, thumb: custom || (cached && fs.existsSync(cached) ? toFileUrl(cached) : g.remoteThumb) };
  }
  const shot = path.join(THUMBS, g.id + '.png');
  const custom = g.customThumb && fs.existsSync(g.customThumb) ? g.customThumb : null;
  const cover = custom || findCover(g.dir) || (fs.existsSync(shot) ? shot : null) || findIcon(g.dir);
  const v = cover ? fs.statSync(cover).mtimeMs | 0 : 0;
  return { ...g, thumb: cover ? toFileUrl(cover) + '?v=' + v : null, updates: readUpdates(g.dir) };
}

// ---------- per-game static servers ----------
const servers = new Map();
function ensureServer(g) {
  return new Promise((resolve, reject) => {
    if (servers.has(g.id)) return resolve();
    const root = path.resolve(g.dir);
    const srv = http.createServer((req, res) => {
      let urlPath;
      try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
      let file = path.normalize(path.join(root, urlPath));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.stat(file, (err, st) => {
        if (!err && st.isDirectory()) file = path.join(file, 'index.html');
        fs.readFile(file, (err2, data) => {
          if (err2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
          });
          res.end(data);
        });
      });
    });
    srv.once('error', reject);
    srv.listen(g.port, '127.0.0.1', () => { servers.set(g.id, srv); resolve(); });
  });
}

// ---------- windows ----------
let libWin;
const gameWins = new Map();

function createLibraryWindow() {
  libWin = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 500,
    backgroundColor: '#0d0f14', title: 'Game Library', icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  libWin.loadFile(path.join(__dirname, 'index.html')); // the same page as the website
}

async function launch(id) {
  const g = lib.games.find(x => x.id === id);
  if (!g) return { ok: false, error: 'Game not found' };
  if (gameWins.has(id)) { const w = gameWins.get(id); if (w.isMinimized()) w.restore(); w.focus(); return { ok: true }; }
  if (!g.online) {
    try { await ensureServer(g); }
    catch (e) { return { ok: false, error: `Port ${g.port} is busy (${e.code}). Close whatever is using it and try again.` }; }
  }
  const home = g.online ? g.url : `http://127.0.0.1:${g.port}/`;

  g.lastPlayed = Date.now(); g.plays = (g.plays || 0) + 1; saveLib(lib);
  const win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#000', title: g.title, icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    // game-preload.js signs the game in to your library account before it starts
    webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'game-preload.js') },
  });
  gameWins.set(id, win);
  win.loadURL(home);
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // Links to other sites open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(home)) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });

  // Auto-thumbnail: if the game has no cover image, grab a screenshot after it's loaded.
  const shot = path.join(THUMBS, g.id + '.png');
  if (!g.online && !findCover(g.dir) && !g.customThumb && !fs.existsSync(shot)) {
    setTimeout(async () => {
      if (win.isDestroyed()) return;
      try {
        const img = await win.webContents.capturePage();
        if (!img.isEmpty()) {
          fs.writeFileSync(shot, img.resize({ width: 960 }).toPNG());
          libWin?.webContents.send('library-changed');
        }
      } catch {}
    }, 6000);
  }

  win.on('closed', () => {
    gameWins.delete(id);
    libWin?.webContents.send('running', [...gameWins.keys()]);
  });
  libWin?.webContents.send('running', [...gameWins.keys()]);
  return { ok: true };
}

// ---------- your account ----------
// The library page tells us who's signed in; game windows ask for it before they start (game-preload.js).
// Kept next to the library list so games are signed in even before the library window has loaded.
ipcMain.on('account-set', (_e, a) => { lib.account = a && a.code && a.tag ? { code: String(a.code), tag: String(a.tag), staffkey: String(a.staffkey || ''), friends: Array.isArray(a.friends) ? a.friends.map(String).slice(0, 200) : [] } : null; saveLib(lib); });
ipcMain.on('account-get', (e) => { e.returnValue = lib.account || null; });
// a game window added a friend from a leaderboard: the library keeps the list
ipcMain.on('friends-set', (_e, list) => { if (lib.account && Array.isArray(list)) { lib.account.friends = list.map(String).slice(0, 200); saveLib(lib); } libWin?.webContents.send('friends-set', lib.account?.friends || []); });

// ---------- IPC ----------
ipcMain.handle('list', () => { refreshMeta(); return { root: lib.root, games: lib.games.map(publicGame), running: [...gameWins.keys()] }; });
ipcMain.handle('launch', (_e, id) => launch(id));
ipcMain.handle('rescan', async () => { const n = scanFolder(lib.root, lib); mergeCatalog(readCatalog()); saveLib(lib); syncCatalog(); return n; });

ipcMain.handle('add-folder', async () => {
  const r = await dialog.showOpenDialog(libWin, { title: 'Pick a game folder (with index.html) or a folder of games', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { added: 0 };
  const dir = r.filePaths[0];
  // picking a folder by hand brings back one you removed before
  lib.hidden = (lib.hidden || []).filter(d => d !== path.resolve(dir));
  if (fs.existsSync(path.join(dir, 'index.html'))) {
    if (lib.games.some(g => !g.online && path.resolve(g.dir) === path.resolve(dir))) return { added: 0, msg: 'Already in your library' };
    const e = makeEntry(dir, lib);
    if (e) { lib.games.push(e); mergeCatalog(readCatalog()); saveLib(lib); return { added: 1 }; }
  }
  const n = scanFolder(dir, lib); mergeCatalog(readCatalog()); saveLib(lib);
  return { added: n, msg: n ? '' : 'No games found there (a game folder needs an index.html)' };
});

ipcMain.handle('remove', (_e, id) => {
  const g = lib.games.find(x => x.id === id);
  if (g && g.online) lib.hiddenIds = [...new Set([...(lib.hiddenIds || []), g.id])];
  else if (g) lib.hidden = [...new Set([...(lib.hidden || []), path.resolve(g.dir)])];
  lib.games = lib.games.filter(x => x.id !== id); saveLib(lib); return true;
});

ipcMain.handle('edit', (_e, id, patch) => {
  const g = lib.games.find(x => x.id === id); if (!g) return false;
  if (typeof patch.title === 'string') { g.title = patch.title.trim() || g.title; g.customTitle = true; }
  if (typeof patch.desc === 'string') { g.desc = patch.desc.trim(); g.customDesc = true; }
  if ('favorite' in patch) g.favorite = !!patch.favorite;
  saveLib(lib); return true;
});

ipcMain.handle('set-thumb', async (_e, id) => {
  const g = lib.games.find(x => x.id === id); if (!g) return false;
  const r = await dialog.showOpenDialog(libWin, { title: 'Pick a thumbnail image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
  if (r.canceled || !r.filePaths[0]) return false;
  const dest = path.join(THUMBS, g.id + '-custom' + path.extname(r.filePaths[0]).toLowerCase());
  fs.copyFileSync(r.filePaths[0], dest);
  g.customThumb = dest; saveLib(lib); return true;
});

ipcMain.handle('snap-thumb', async (_e, id) => {
  const g = lib.games.find(x => x.id === id);
  const win = gameWins.get(id);
  if (!g || !win) return { ok: false, error: 'Start the game first, get to a cool moment, then hit this.' };
  const img = await win.webContents.capturePage();
  const dest = path.join(THUMBS, g.id + '-custom.png');
  fs.writeFileSync(dest, img.resize({ width: 960 }).toPNG());
  g.customThumb = dest; saveLib(lib); return { ok: true };
});

ipcMain.handle('open-folder', (_e, id) => {
  const g = lib.games.find(x => x.id === id); if (!g) return;
  if (g.online) shell.openExternal(g.url); else shell.openPath(g.dir);
});

// ---------- app ----------
app.whenReady().then(() => {
  initLib();
  // pick up games made since last time (removed / hidden ones stay out)
  scanFolder(lib.root, lib);
  // online games: the cached catalog right away, then the latest one in the background
  mergeCatalog(readCatalog()); saveLib(lib);
  syncCatalog();
  // Games need the mic (Mimic), gamepads, pointer lock, fullscreen, notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);
  createLibraryWindow();
});
app.on('window-all-closed', () => app.quit());
