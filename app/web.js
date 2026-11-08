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
