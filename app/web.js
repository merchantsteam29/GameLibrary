// Browser version of the library. When there's no Electron bridge (window.lib),
// fake one backed by games.json + localStorage, and open games on GitHub Pages.
if (!window.lib) {
  document.body.classList.add('web');
  const KEY = 'gamelib-web';
  const load = () => { try { return JSON.parse(localStorage[KEY]) || {}; } catch { return {}; } };
  const save = s => { try { localStorage[KEY] = JSON.stringify(s); } catch {} };
  let data = null;
  const get = async () => data || (data = await (await fetch('games.json', { cache: 'no-cache' })).json());

  window.lib = {
    async list() {
      const games = await get(), st = load();
      return {
        running: [],
        games: games.map(g => ({
          ...g,
          lastPlayed: st[g.id]?.lastPlayed || 0,
          plays: st[g.id]?.plays || 0,
          favorite: !!st[g.id]?.favorite,
          missing: !g.url,
          missingText: 'Not online yet',
        })),
      };
    },
    // Not async: window.open has to run inside the click or it gets popup-blocked.
    launch(id) {
      const g = data?.find(x => x.id === id);
      if (!g?.url) return Promise.resolve({ ok: false, error: 'This one isn’t online yet.' });
      window.open(g.url, '_blank', 'noopener');
      const st = load(); st[id] = { ...st[id], lastPlayed: Date.now(), plays: (st[id]?.plays || 0) + 1 }; save(st);
      return Promise.resolve({ ok: true });
    },
    async edit(id, patch) {
      if ('favorite' in patch) { const st = load(); st[id] = { ...st[id], favorite: !!patch.favorite }; save(st); }
      return true;
    },
    onChange() {}, onRunning() {},
    rescan: async () => 0, addFolder: async () => ({ added: 0 }), remove: async () => false,
    setThumb: async () => false, snapThumb: async () => ({ ok: false }), openFolder() {},
  };
  // Coming back to the tab after playing: refresh the "played X ago" labels.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.dispatchEvent(new Event('lib-refresh')); });
}

// ---------- "Download for PC": install the website as an app ----------
// No .exe (browsers block unsigned ones), so it's the browser's own install: its own window and
// icon, works offline. The games' Download for PC buttons open this page with ?install.
(() => {
  const box = document.getElementById('getApp'); if (!box) return;
  let prompt = null;
  const $ = (id) => document.getElementById(id);
  const standalone = matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  const chromium = /Chrome|Edg\//.test(ua) && !/OPR|SamsungBrowser/.test(ua);
  const edge = /Edg\//.test(ua);
  // what to do when the browser hasn't offered its install prompt (yet)
  const manual = () => ios ? 'On iPhone or iPad: tap Share (□↑) in Safari, then "Add to Home Screen".'
    : edge ? 'In Edge: click the "App available" icon at the right end of the address bar, or open the ⋯ menu → Apps → "Install this site as an app".'
    : chromium ? 'In Chrome: click the install icon at the right end of the address bar, or open the ⋮ menu → "Cast, save and share" → "Install page as app".'
    : 'Open this page in Edge or Chrome to install it.';
  function help(clicked) {
    const h = $('installHelp');
    if (standalone) { h.textContent = 'You already have it: this is the Game Library app.'; $('installLib').hidden = true; return; }
    h.classList.toggle('strong', !!clicked && !prompt);
    h.textContent = prompt ? 'Your browser will ask "Install Game Library?". Click Install.' : clicked ? manual() : 'No download and no warnings: your browser installs it like an app.';
  }
  const open = () => { help(); box.hidden = false; };
  const close = () => { box.hidden = true; };
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; if (!box.hidden) help(); });
  addEventListener('appinstalled', () => { prompt = null; $('installHelp').textContent = 'Installed! Open Game Library from your desktop or Start menu.'; $('installLib').hidden = true; });
  $('installLib').onclick = async () => {
    if (!prompt) return help(true);
    const p = prompt; prompt = null;
    p.prompt(); await p.userChoice.catch(() => null); help();
  };
  $('getAppBtn').onclick = open;
  $('getAppClose').onclick = close;
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
  if (standalone) $('getAppBtn').style.display = 'none'; // (.web-only sets display, so [hidden] would not win)
  if (/[?&]install\b/.test(location.search) && !standalone) open();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
