// Game Library — Electron main process.
// Each game gets its own tiny static server on a fixed port, so ES modules,
// service workers and localStorage saves all work and persist between launches.
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
  while (lib.games.some(g => g.id === id)) id = makeId(dir) + '-' + n++;
  return { id, dir, title: meta.title, desc: meta.desc, port, added: Date.now(), lastPlayed: 0, plays: 0 };
}

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
    if (lib.games.some(g => path.resolve(g.dir) === path.resolve(dir))) continue;
    const entry = makeEntry(dir, lib);
    if (entry) { lib.games.push(entry); added++; }
  }
  return added;
}

function defaultRoot() {
  // Running from source: the folder next to GameLibrary. Packaged: ~/source/repos.
  if (!app.isPackaged) return path.dirname(__dirname);
  return path.join(os.homedir(), 'source', 'repos');
}

let lib = loadLib();
function initLib() {
  if (lib) return;
  lib = { root: defaultRoot(), games: [] };
  scanFolder(lib.root, lib);
  saveLib(lib);
}

function refreshMeta() {
  for (const g of lib.games) {
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
  libWin.loadFile(path.join(__dirname, 'app', 'index.html'));
}

async function launch(id) {
  const g = lib.games.find(x => x.id === id);
  if (!g) return { ok: false, error: 'Game not found' };
  if (gameWins.has(id)) { const w = gameWins.get(id); if (w.isMinimized()) w.restore(); w.focus(); return { ok: true }; }
  try { await ensureServer(g); }
  catch (e) { return { ok: false, error: `Port ${g.port} is busy (${e.code}). Close whatever is using it and try again.` }; }

  g.lastPlayed = Date.now(); g.plays = (g.plays || 0) + 1; saveLib(lib);
  const win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#000', title: g.title, icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  gameWins.set(id, win);
  win.loadURL(`http://127.0.0.1:${g.port}/`);
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // Links to other sites open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${g.port}`)) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });

  // Auto-thumbnail: if the game has no cover image, grab a screenshot after it's loaded.
  const shot = path.join(THUMBS, g.id + '.png');
  if (!findCover(g.dir) && !g.customThumb && !fs.existsSync(shot)) {
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

// ---------- IPC ----------
ipcMain.handle('list', () => { refreshMeta(); return { root: lib.root, games: lib.games.map(publicGame), running: [...gameWins.keys()] }; });
ipcMain.handle('launch', (_e, id) => launch(id));
ipcMain.handle('rescan', () => { const n = scanFolder(lib.root, lib); saveLib(lib); return n; });

ipcMain.handle('add-folder', async () => {
  const r = await dialog.showOpenDialog(libWin, { title: 'Pick a game folder (with index.html) or a folder of games', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { added: 0 };
  const dir = r.filePaths[0];
  if (fs.existsSync(path.join(dir, 'index.html'))) {
    if (lib.games.some(g => path.resolve(g.dir) === path.resolve(dir))) return { added: 0, msg: 'Already in your library' };
    const e = makeEntry(dir, lib);
    if (e) { lib.games.push(e); saveLib(lib); return { added: 1 }; }
  }
  const n = scanFolder(dir, lib); saveLib(lib);
  return { added: n, msg: n ? '' : 'No games found there (a game folder needs an index.html)' };
});

ipcMain.handle('remove', (_e, id) => {
  lib.games = lib.games.filter(g => g.id !== id); saveLib(lib); return true;
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
  const g = lib.games.find(x => x.id === id); if (g) shell.openPath(g.dir);
});

// ---------- app ----------
app.whenReady().then(() => {
  initLib();
  // Games need the mic (Mimic), gamepads, pointer lock, fullscreen, notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);
  createLibraryWindow();
});
app.on('window-all-closed', () => app.quit());
