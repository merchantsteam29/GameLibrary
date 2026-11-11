// Profile: your progress in every game, in one place. The games and this site share the same web address
// (merchantsteam29.github.io), so their saves are right here in this browser's storage. Nothing is uploaded.
// Achievements are what each game's sync.js recorded under 'gamesach.<game>'; the list below is the full
// catalog, so locked ones show too (keep it in step with the games' GameSync.init rules).
(() => {
  const read = (k) => { try { const v = localStorage.getItem(k); if (v == null) return null; try { return JSON.parse(v); } catch { return v; } } catch { return null; } };
  const keys = () => { try { return Object.keys(localStorage); } catch { return []; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = (n) => Math.floor(Number(n) || 0).toLocaleString();

  // library id -> { the id the game uses for achievements, its achievements, and a few lines of stats }
  const GAMES = {
    wardnine: { ach: 'wardnine', list: [['dawn', 'Day shift'], ['nightmare', 'Nightmare shift'], ['basement', 'Down below'], ['sister', 'Lights out, Sister'], ['stoker', 'Furnace out'], ['endless6', 'Night that never ends'], ['daily', 'Daily rounds']],
      stats: () => { const best = Math.max(0, ...keys().filter((k) => k.startsWith('ward9-best')).map((k) => Number(read(k)) || 0)), d = read('ward9-daily') || {};
        return [best && ['Best score', num(best)], d.best && ['Daily best', num(d.best) + (d.streak > 1 ? ' · ' + d.streak + ' day streak' : '')]]; } },
    afterhours: { ach: 'afterhours', list: [['n1', 'First shift'], ['beat', 'Paycheck'], ['ot', 'Overtime'], ['three', 'Model employee'], ['challenge', 'Challenger'], ['all20', 'Absolute legend'], ['doses', 'Steady hands']],
      stats: () => { const s = read('willowmere_after_hours_v1') || {}; const stars = Object.values(s.nightStars || {}).reduce((a, b) => a + b, 0);
        return [(s.night || s.beat) && ['Progress', s.overtime ? 'Overtime survived' : s.beat ? 'All 5 nights' : 'Night ' + s.night], stars && ['Night stars', stars + ' ★']]; } },
    rubblemaker: { ach: 'rubblemaker', list: [['pit10', 'Pit regular'], ['pit25', 'Pit legend'], ['daily', 'Daily grind'], ['streak3', 'Three in a row']],
      stats: () => { const top = (read('rubblemaker-pit-scores') || [])[0], d = read('rubblemaker-daily') || {};
        return [top && ['Pit best', num(top.score) + ' · wave ' + top.wave], d.best && ['Daily Pit', num(d.best) + (d.streak > 1 ? ' · ' + d.streak + ' day streak' : '')]]; } },
    breachzero: { ach: 'breachzero', list: [['escape', 'Breach contained'], ['nightmare', 'Nightmare survivor'], ['boss', 'Big game'], ['surv10', 'Holding the line'], ['kills500', 'Exterminator'], ['burn', 'Scorched']],
      stats: () => { const r = read('bz_records') || {}; return [r.runs && ['Runs', num(r.runs) + ' · ' + num(r.escapes) + ' escaped'], r.kills && ['Kills', num(r.kills)], r.survWave && ['Survival', 'wave ' + r.survWave]]; } },
    hollowbadge: { ach: 'hollowbadge', list: [['c1', 'Case 01 closed'], ['c2', 'Case 02 closed'], ['c3', 'Case 03 closed'], ['c4', 'Case 04 closed'], ['hard', 'By the book'], ['lilies', 'White lilies']],
      stats: () => { const r = read('hb_results') || {}; const n = ['cmary', 'wing', 'harrow', 'ash'].filter((k) => r[k] === 'solved').length; return [Object.keys(r).length && ['Cases solved', n + ' / 4']]; } },
    happymeadow: { ach: 'meadow', list: [['garden', 'Into the garden'], ['escape', 'Out of the meadow']], stats: () => [] },
    bonkbowl: { ach: 'bonkbowl', list: [['champ', 'Champion'], ['bonk10', 'Bonk-off'], ['bonk100', 'Bowling ball'], ['online', 'Long distance'], ['regular', 'Regular']],
      stats: () => { const s = read('bonkbowl.stats') || {}; return [s.matches && ['Matches', num(s.matches) + ' · ' + num(s.wins) + ' won'], s.bonkoffs && ['Bonk-offs', num(s.bonkoffs)]]; } },
    'lifewillend': { ach: 'lifewillend', list: [['ch1', 'Last delivery'], ['ch3', 'Under the Ring'], ['ch5', "Don't look down"], ['end', 'Life did not end'], ['flawless', 'Untouched'], ['srank', 'Courier of the year'], ['deflect10', 'Return to sender'], ['blade50', 'Edge of the world']],
      stats: () => { const p = read('lwe.progress') || {}, b = p.best || {}, st = read('lwe.stats') || {}; const done = Object.keys(b).length;
        return [done && ['Chapters cleared', done + ' / 6'], Object.values(b).some((x) => x.rank === 'S') && ['S ranks', Object.values(b).filter((x) => x.rank === 'S').length], st.kills && ['Wardens down', num(st.kills)]]; } },
    mimic: { ach: null, list: [], // no achievements in Mimic, on purpose: nothing to unlock or grind there
      stats: () => { const s = read('mimic.stats') || {}, n = read('mimic.nights'), d = read('mimic.depth');
        return [s.runs && ['Runs', num(s.runs) + ' · ' + num(s.escapes) + ' got out'], s.voices && ['Voices it stole', num(s.voices)], n && ['Night Shift best', 'night ' + n], d && ['Deepest floor', '-' + d]]; } },
    'gun-game-fun': { ach: null, list: [],
      stats: () => { const xp = read('whffa.xp'), st = read('whffa.stats') || {};
        return [xp && ['XP', num(xp)], st.kills && ['Kills', num(st.kills)], st.wins && ['Wins', num(st.wins)]]; } },
  };

  function render() {
    const box = $('#profile'); box.textContent = '';
    const name = read('gamesync.name'), synced = !!read('gamesync.account');
    let got = 0, all = 0;
    const cards = [];
    for (const g of games) {
      const def = GAMES[g.id]; if (!def) continue;
      const have = def.ach ? (read('gamesach.' + def.ach) || {}) : {};
      const stats = (def.stats() || []).filter(Boolean);
      got += def.list.filter(([id]) => have[id]).length; all += def.list.length;
      const card = document.createElement('div'); card.className = 'pcard';
      const th = document.createElement('div'); th.className = 'post-thumb'; paintThumb(th, g); th.onclick = () => showDetail(g.id);
      const body = document.createElement('div'); body.className = 'pbody';
      const n = def.list.filter(([id]) => have[id]).length;
      body.innerHTML = `<h3>${esc(g.title)}${def.list.length ? ` <span class="pcount">${n} / ${def.list.length} 🏆</span>` : ''}</h3>
        ${stats.length ? `<dl class="pstats">${stats.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<p class="pnone">Not played on this browser yet.</p>'}
        ${def.list.length ? `<div class="pach">${def.list.map(([id, nm]) => `<span class="${have[id] ? 'on' : ''}" title="${esc(have[id] ? (have[id].d || nm) + ' · ' + new Date(have[id].t).toLocaleDateString() : 'Locked')}">${have[id] ? '🏆' : '🔒'} ${esc(nm)}</span>`).join('')}</div>` : ''}`;
      card.append(th, body); cards.push([stats.length + n, card]);
    }
    const head = document.createElement('div'); head.className = 'phead';
    head.innerHTML = `<div class="pbig">${esc(name || 'You')}</div>
      <div class="psub">${got} of ${all} achievements · ${synced ? '☁ progress syncs between your devices' : 'turn on ☁ Sync in any game to keep this on all your devices'}</div>`;
    box.append(head);
    for (const [, c] of cards.sort((a, b) => b[0] - a[0])) box.append(c);
    if (!document.body.classList.contains('web')) {
      const p = document.createElement('p'); p.className = 'pnone';
      p.textContent = 'In the PC app each game keeps its own saves, so this page only shows what you played on the website.';
      box.prepend(p);
    }
  }
  function showProfile() {
    current = null; document.title = 'Profile — Game Library';
    $('#grid-view').hidden = true; $('#detail-view').hidden = true; $('#updates-view').hidden = true; $('#profile-view').hidden = false;
    render(); window.scrollTo(0, 0);
  }
  $('#profileBtn').onclick = showProfile;
  $('#profileBack').onclick = () => { $('#profile-view').hidden = true; showGrid(); };
})();
