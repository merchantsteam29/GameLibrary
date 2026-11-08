// Builds the website's games.json + thumbs/ from the game folders next to this repo.
// Run: npm run web   (uses Electron so it can screenshot games that have no cover image)
// Online URL = the folder's GitHub remote → https://<owner>.github.io/<repo>/
const { app, BrowserWindow } = require('electron');
const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HERE = path.resolve(__dirname, '..');
const ROOT = process.argv.find(a => a.startsWith('--root='))?.slice(7) || path.dirname(HERE);
const THUMBS = path.join(HERE, 'thumbs');
const RESNAP = process.argv.includes('--resnap');
const COVERS = ['cover.png', 'cover.jpg', 'thumbnail.png', 'og.png', 'og.jpg', 'icons/icon-512.png', 'icon-512.png'];

function meta(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const title = (html.match(/<title>([^<]*)/i) || [])[1]?.trim() || path.basename(dir);
  let desc = (html.match(/name=["']description["']\s+content=["']([^"']*)/i) || [])[1] || '';
  if (!desc) {
    try {
      desc = fs.readFileSync(path.join(dir, 'README.md'), 'utf8').split(/\r?\n\r?\n/).map(p => p.trim())
        .find(p => p && !/^[#!<]/.test(p)) || '';
      desc = desc.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ');
    } catch {}
  }
  if (desc.length > 320) desc = desc.slice(0, 317).trimEnd() + '…';
  return { title, desc };
}

function pagesUrl(dir) {
  try {
    const r = execSync('git remote get-url origin', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = r.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    return m ? `https://${m[1].toLowerCase()}.github.io/${m[2]}/` : null;
  } catch { return null; }
}

function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(dir)) return rsp.writeHead(403), rsp.end();
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      fs.readFile(f, (e, d) => {
        if (e) return rsp.writeHead(404), rsp.end();
        const ext = path.extname(f);
        rsp.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || '' });
        rsp.end(d);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

async function snap(dir, out) {
  const srv = await serve(dir);
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  await win.loadURL(`http://127.0.0.1:${srv.address().port}/`).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.resize({ width: 960 }).toJPEG(85));
  win.destroy(); srv.close();
}

process.on('unhandledRejection', e => console.log('unhandled', e));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  fs.mkdirSync(THUMBS, { recursive: true });
  const old = (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, 'games.json'), 'utf8')); } catch { return []; } })();
  const games = [];
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const dir = path.join(ROOT, e.name);
    if (!e.isDirectory() || dir === HERE || /redirect|^\.|node_modules/i.test(e.name)) continue;
    if (!fs.existsSync(path.join(dir, 'index.html'))) continue;
    const id = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { title, desc } = meta(dir);
    const cover = COVERS.map(c => path.join(dir, c)).find(fs.existsSync);
    let thumb;
    if (cover) {
      thumb = `thumbs/${id}${path.extname(cover)}`;
      fs.copyFileSync(cover, path.join(HERE, thumb));
    } else {
      thumb = `thumbs/${id}.jpg`;
      if (RESNAP || !fs.existsSync(path.join(HERE, thumb))) { console.log('snapping', title); try { await snap(dir, path.join(HERE, thumb)); } catch (err) { console.log('  snap failed:', err.message); } }
    }
    const added = old.find(o => o.id === id)?.added || Math.floor(fs.statSync(path.join(dir, "index.html")).birthtimeMs);
    games.push({ id, title, desc, url: pagesUrl(dir), thumb, added });
    console.log(`${title.padEnd(20)} ${pagesUrl(dir) || '(not online)'}`);
  }
  fs.writeFileSync(path.join(HERE, 'games.json'), JSON.stringify(games, null, 2) + '\n');
  app.exit(0);
});
