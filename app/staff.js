// Staff tools (website only): the owner and moderators.
// Moderators: ban and unban players from every game's leaderboards (also a 🛡 button on each leaderboard row).
// Owner only: everything moderators can, plus the site announcement, adding / removing moderators, and
// gifting coins or shop items to a gamertag. All of it is signed (see sync.js), so nobody can fake it.
(() => {
  if (!document.body.classList.contains('web') || !window.GameSync?.staff) return;
  const S = GameSync.staff, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };
  const when = (t) => t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  let role = null;

  // ---------- the announcement bar (everyone) ----------
  async function showNews() {
    let n = null; try { n = await S.news(); } catch { return; }
    $('#newsbar')?.remove();
    if (!n || read('gamelib.newsSeen', 0) >= n.t) return;
    const b = document.createElement('div'); b.id = 'newsbar'; b.className = 'newsbar';
    b.innerHTML = `<span>📣 ${esc(n.text)}</span><button title="Hide">✕</button>`;
    b.querySelector('button').onclick = () => { write('gamelib.newsSeen', n.t); b.remove(); };
    $('header.top').after(b);
  }

  // ---------- gifts to you, and whether you're staff ----------
  async function check() {
    const tag = window.Acct?.tag?.();
    if (tag) {
      try {
        const list = await S.gifts(tag), have = read('gamelib.gifts', {}) || {};
        let fresh = 0; for (const g of list) if (!have[g.id]) { have[g.id] = g; fresh++; }
        if (fresh) { write('gamelib.gifts', have); GameSync.syncNow(); toast(`🎁 You got ${fresh === 1 ? 'a gift' : fresh + ' gifts'} from the owner: ${list.slice(-fresh).map((g) => [g.coins ? '🪙 ' + g.coins : '', g.item ? (window.Acct.items().find((i) => i.id === g.item)?.name || 'an item') : '', g.note ? '“' + g.note + '”' : ''].filter(Boolean).join(' ')).join(' · ')}`); }
      } catch { /* offline */ }
    }
    try { const m = await S.me(); role = m && (!tag || m.tag.toLowerCase() === tag.toLowerCase()) ? m.role : null; } catch { role = null; }
    window.Acct?.setStaff(role); window.Acct?.refresh();
  }
  function toast(t) { const el = $('#toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 7000); }

  // ---------- pasting a staff key ----------
  function keyModal() {
    document.querySelector('.acct-modal')?.remove();
    const w = document.createElement('div'); w.className = 'acct-modal';
    w.innerHTML = `<div class="acct-box"><h2>🔑 Staff key</h2>
      <p class="dim">For the owner and moderators. Paste your owner key or moderator invite. You only do this once: it syncs to your other devices through your account.</p>
      <label>Key<input id="s-key" autocomplete="off" spellcheck="false" placeholder="OWNER-… or MOD-…"></label>
      <p class="msg"></p><div class="row"><button class="ghost primary" data-a="go">Use key</button><button class="ghost" data-a="x">Cancel</button></div></div>`;
    w.onclick = async (e) => {
      if (e.target === w || e.target.closest('[data-a=x]')) { w.remove(); return; }
      if (!e.target.closest('[data-a=go]')) return;
      const msg = w.querySelector('.msg'); msg.className = 'msg'; msg.textContent = 'Checking…';
      const err = await S.setKey(w.querySelector('#s-key').value).catch(() => 'Couldn’t reach the relays. Try again.');
      if (err) { msg.className = 'msg err'; msg.textContent = err; return; }
      w.remove(); await check(); toast(role === 'owner' ? '🛡 Owner tools unlocked.' : '🛡 Moderator tools unlocked.');
    };
    document.body.append(w); w.querySelector('input').focus();
  }

  // ---------- the staff page ----------
  function ensureView() {
    if ($('#staff-view')) return;
    const m = document.createElement('main'); m.id = 'staff-view'; m.hidden = true;
    m.innerHTML = `<div class="feed-head"><button id="staffBack" class="back">← Profile</button><h2>🛡 Staff</h2><p id="staffWho"></p></div><section id="staffBody" class="feed"></section>`;
    $('#shop-view').after(m);
    $('#staffBack').onclick = () => { m.hidden = true; window.Profile?.show(); };
  }
  async function show() {
    ensureView();
    for (const id of ['#grid-view', '#detail-view', '#updates-view', '#profile-view', '#shop-view']) { const el = $(id); if (el) el.hidden = true; }
    $('#staff-view').hidden = false; document.title = 'Staff — Game Library'; window.scrollTo(0, 0);
    await paint();
  }
  async function paint(note) {
    const box = $('#staffBody'); box.innerHTML = `<p class="dim">${esc(note || 'Loading…')}</p>`;
    const [me, list, bans, news] = await Promise.all([S.me(), S.list(true), S.bans(true).catch(() => new Map()), S.news().catch(() => null)]);
    if (!me) { box.innerHTML = '<p>You aren’t on the staff list on this browser.</p>'; return; }
    const owner = me.role === 'owner';
    $('#staffWho').textContent = `Signed in as ${me.tag} · ${owner ? 'Owner' : 'Moderator'}`;
    const active = [...bans.entries()].filter(([, b]) => b.ban).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    const mods = list.filter((p) => p.role === 'mod');
    const items = window.Acct?.items() || [];
    box.innerHTML = `${note ? `<p class="staff-note">${esc(note)}</p>` : ''}
      <div class="spanel"><h3>Leaderboard bans</h3>
        <p class="dim small">Banned players disappear from every game's daily leaderboards. You can also ban straight from a leaderboard with the Ban button next to a name.</p>
        <div class="srow"><input id="b-name" placeholder="Gamertag or leaderboard name" maxlength="24"><input id="b-why" placeholder="Reason (staff only see this)" maxlength="120"><button class="ghost primary" data-a="ban">Ban</button></div>
        ${active.length ? `<table class="stable"><tr><th>Player</th><th>Reason</th><th>By</th><th>When</th><th></th></tr>${active.map(([t, b]) => `<tr><td>${esc(b.name || t.replace(/^name:/, ''))}${t.startsWith('pid:') ? ' <span class="dim small">(device)</span>' : ''}</td><td>${esc(b.reason || '')}</td><td>${esc(b.by)}</td><td class="dim small">${when(b.t)}</td><td><button class="ghost" data-unban="${esc(t)}" data-n="${esc(b.name || '')}">Unban</button></td></tr>`).join('')}</table>` : '<p class="dim">Nobody is banned.</p>'}
      </div>
      ${owner ? `<div class="spanel"><h3>Announcement <span class="sbadge owner">OWNER</span></h3>
        <p class="dim small">Shown at the top of the library for everyone until they close it.</p>
        <textarea id="n-text" maxlength="400" rows="2" placeholder="New game out! …">${esc(news?.text || '')}</textarea>
        <div class="srow"><button class="ghost primary" data-a="news">Post</button>${news ? '<button class="ghost" data-a="unnews">Take down</button>' : ''}${news ? `<span class="dim small">Live since ${when(news.t)}</span>` : ''}</div></div>
      <div class="spanel"><h3>Moderators <span class="sbadge owner">OWNER</span></h3>
        <p class="dim small">Add someone by their gamertag. You get an invite key to send them privately: they sign in as that gamertag, open Profile, click 🔑 Staff key and paste it.</p>
        <div class="srow"><input id="m-tag" placeholder="Name#1234" maxlength="16"><button class="ghost primary" data-a="mod">Add moderator</button></div>
        <div id="m-invite"></div>
        ${mods.length ? `<table class="stable">${mods.map((p) => `<tr><td>${esc(p.tag)} <span class="sbadge">MOD</span></td><td><button class="ghost" data-unmod="${esc(p.tag)}">Remove</button></td></tr>`).join('')}</table>` : '<p class="dim">No moderators yet.</p>'}</div>
      <div class="spanel"><h3>Gifts <span class="sbadge owner">OWNER</span></h3>
        <p class="dim small">Give coins (or take them, with a minus number) and shop items to a gamertag. They get it next time they open the library.</p>
        <div class="srow"><input id="g-tag" placeholder="Name#1234" maxlength="16"><input id="g-coins" type="number" placeholder="Coins" step="50"><select id="g-item"><option value="">No item</option>${items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)} (${i.type === 'pfp' ? 'picture' : 'banner'})</option>`).join('')}</select></div>
        <div class="srow"><input id="g-note" placeholder="Note (they see it)" maxlength="80"><button class="ghost primary" data-a="gift">Give</button></div></div>` : ''}
      <div class="spanel"><h3>This browser</h3><div class="srow"><button class="ghost danger" data-a="forget">Remove my staff key</button></div>
        <p class="dim small">Your key syncs to your signed-in devices; removing it removes it from all of them.${owner ? ' Keep GameLibrary-OWNER-KEY.txt safe: it is how you get the owner tools back.' : ''}</p></div>`;
    box.onclick = (e) => act(e, owner);
  }
  const tagOk = (t) => /^[A-Za-z0-9_]{3,11}#\d{4}$/.test(t);
  async function act(e, owner) {
    const b = e.target.closest('button'); if (!b) return;
    const v = (id) => ($(id)?.value || '').trim(), run = async (fn, ok) => { b.disabled = true; try { await fn(); await paint(ok); } catch (err) { b.disabled = false; alert('That didn’t work: ' + (err.message || err)); } };
    if (b.dataset.a === 'forget') { if (confirm('Remove your staff key? It is removed from all your signed-in devices too.')) { S.clearKey(); GameSync.syncNow(); await check(); window.Profile?.show(); } return; }
    if (b.dataset.a === 'ban') { const n = v('#b-name'); if (!n) return; await run(() => S.setBan('name:' + n.toLowerCase(), true, v('#b-why'), n), 'Banned ' + n + '.'); }
    else if (b.dataset.unban) await run(() => S.setBan(b.dataset.unban, false, '', b.dataset.n), 'Unbanned ' + (b.dataset.n || '') + '.');
    else if (!owner) return;
    else if (b.dataset.a === 'news') { const t = v('#n-text'); if (t) await run(() => S.postNews(t), 'Announcement posted.'); showNews(); }
    else if (b.dataset.a === 'unnews') { await run(() => S.postNews(''), 'Announcement taken down.'); $('#newsbar')?.remove(); }
    else if (b.dataset.a === 'mod') {
      const t = v('#m-tag'); if (!tagOk(t)) { alert('Type the whole gamertag: Name#1234'); return; }
      if (t.toLowerCase() === S.OWNER.tag.toLowerCase()) return;
      b.disabled = true;
      try {
        const code = await S.addMod(t); await paint('Added ' + t + ' as a moderator.');
        $('#m-invite').innerHTML = `<div class="invite"><b>Invite key for ${esc(t)}</b> (send it privately; anyone with it can moderate as them):<code>${esc(code)}</code><button class="ghost" data-copy>Copy</button></div>`;
        $('#m-invite [data-copy]').onclick = async (ev) => { try { await navigator.clipboard.writeText(code); ev.target.textContent = 'Copied'; } catch { prompt('Copy the invite:', code); } };
      } catch (err) { b.disabled = false; alert('That didn’t work: ' + (err.message || err)); }
    } else if (b.dataset.unmod) { if (confirm('Remove ' + b.dataset.unmod + ' as a moderator? Their key stops working everywhere.')) await run(() => S.removeMod(b.dataset.unmod), 'Removed ' + b.dataset.unmod + '.'); }
    else if (b.dataset.a === 'gift') {
      const t = v('#g-tag'), c = Math.round(Number(v('#g-coins')) || 0), item = v('#g-item');
      if (!tagOk(t)) { alert('Type the whole gamertag: Name#1234'); return; }
      if (!c && !item) { alert('Give some coins, an item, or both.'); return; }
      await run(() => S.giveGift(t, { coins: c, item, note: v('#g-note') }), `Sent ${t} ${[c ? c + ' coins' : '', item ? 'an item' : ''].filter(Boolean).join(' and ')}.`);
    }
  }

  window.Staff = { show, keyModal, check };
  let chk = 0; GameSync.onStatus?.(() => { clearTimeout(chk); chk = setTimeout(check, 1500); });
  showNews(); setTimeout(check, 300);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); showNews(); } });
})();
