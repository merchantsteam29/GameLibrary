// Accounts and the shop (the website and the PC app).
// An account is a gamertag (Name#1234) and a password. They make the sync code (see sync.js), so every
// game on this site syncs to it on any device, and the library syncs your look, what you own and every
// game's achievements. No account is needed to play: the shop works on this browser without one too.
// Coins: each achievement in any game is worth coins (shop/items.json sets how many); items cost coins.
(() => {
  const WEB = document.body.classList.contains('web');
  const SITE = 'https://merchantsteam29.github.io/GameLibrary/';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };
  const GS = () => window.GameSync;

  // ---------- the shop's items ----------
  let shop = { coinsPerAchievement: 100, items: [] };
  const getJSON = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  let base = '';
  const ready = getJSON('shop/items.json').catch(() => { base = SITE; return getJSON(SITE + 'shop/items.json'); })
    .then((j) => { shop = { ...j, items: (j.items || []).map((i) => ({ ...i, file: base + i.file })) }; GS()?.useItems?.(shop.items, ''); }).catch(() => {});
  const item = (id) => shop.items.find((i) => i.id === id);

  // ---------- your stuff ----------
  const achCount = () => { let n = 0; try { for (const k of Object.keys(localStorage)) if (k.startsWith('gamesach.')) n += Object.keys(read(k, {}) || {}).length; } catch { /* blocked */ } return n; };
  const giftList = () => Object.values(read('gamelib.gifts', {}) || {}).filter((g) => g && typeof g === 'object');
  const owned = () => { const o = new Set(read('gamelib.owned', [])); for (const i of shop.items) if (!i.price) o.add(i.id); for (const g of giftList()) if (g.item) o.add(g.item); return o; };
  const earned = () => achCount() * (shop.coinsPerAchievement || 100) + giftList().reduce((a, g) => a + (Number(g.coins) || 0), 0);
  const spent = () => [...new Set(read('gamelib.owned', []))].reduce((a, id) => a + (item(id)?.price || 0), 0);
  const coins = () => Math.max(0, earned() - spent());
  const look = () => {
    const l = read('gamelib.look', {}), o = owned();
    const firstFree = (t) => shop.items.find((i) => i.type === t && !i.price)?.id;
    return { banner: o.has(l.banner) && item(l.banner) ? l.banner : firstFree('banner'), pfp: o.has(l.pfp) && item(l.pfp) ? l.pfp : null };
  };
  // the gamertag as it was made (capitals and all): kept in the account so a lowercase sign-in still shows it right
  let staffRole = null;
  const tag = () => { const t = GS()?.account?.tag; if (!t) return null; const c = read('gamelib.tag', null); return c && c.toLowerCase() === t.toLowerCase() ? c : t; };

  function pfpHTML(size, cls = '') {
    const p = item(look().pfp), t = tag();
    if (p) return `<img class="pfp ${cls}" style="width:${size}px;height:${size}px" src="${esc(p.file)}" alt="">`;
    return `<span class="pfp pfp-letter ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px">${esc((t || '?')[0].toUpperCase())}</span>`;
  }
  const tagHTML = (t) => { const i = t.lastIndexOf('#'); return `${esc(t.slice(0, i))}<span class="tagnum">${esc(t.slice(i))}</span>`; };

  // the header button: your picture and gamertag once signed in
  function paintButton() {
    const b = $('#profileBtn'); if (!b) return;
    const t = tag();
    b.innerHTML = t ? `${pfpHTML(22, 'mini')} ${tagHTML(t)}` : '👤 Profile';
    b.classList.toggle('signed', !!t);
  }

  // ---------- the top of the Profile page ----------
  function head() {
    const t = tag(), b = item(look().banner), status = GS()?.status;
    const h = document.createElement('div'); h.className = 'phead acct-head';
    if (b) h.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.55)), url("${b.file}")`;
    h.innerHTML = `<div class="acct-row">${pfpHTML(84, 'big')}
        <div class="acct-who"><div class="pbig">${t ? tagHTML(t) : 'Guest'}${staffRole ? ` <span class="sbadge ${staffRole}">${staffRole === 'owner' ? 'OWNER' : 'MOD'}</span>` : ''}</div>
          <div class="psub">${t ? (status === 'on' ? '☁ Signed in · syncing on all your devices' : status === 'connecting' ? '☁ Signed in · connecting…' : '☁ Signed in · offline, catches up later') : 'Not signed in: your progress stays on this browser'}</div></div>
        <div class="coins" title="Coins: ${shop.coinsPerAchievement || 100} for every achievement in any game">🪙 ${coins().toLocaleString()}</div></div>
      <div class="acct-btns">
        <button class="ghost" data-a="shop">🛍 Shop</button>
        ${staffRole ? '<button class="ghost" data-a="staff">🛡 Staff</button>' : t ? '<button class="ghost" data-a="key" title="For the owner and moderators">🔑 Staff key</button>' : ''}
        ${t ? '<button class="ghost" data-a="acct">⚙ Account</button>' : ''}
        ${t ? '<button class="ghost" data-a="out">Sign out</button>' : '<button class="ghost primary" data-a="new">Create account</button><button class="ghost" data-a="in">Sign in</button>'}
      </div>`;
    h.onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'shop') showShop(); else if (a === 'new') modal('new'); else if (a === 'in') modal('in'); else if (a === 'out') signOut(); else if (a === 'staff') window.Staff?.show(); else if (a === 'key') window.Staff?.keyModal(); else if (a === 'acct') settings(); };
    return h;
  }

  // ---------- sign up / sign in ----------
  function modal(view) {
    document.querySelector('.acct-modal')?.remove();
    const w = document.createElement('div'); w.className = 'acct-modal';
    const box = document.createElement('div'); box.className = 'acct-box'; w.append(box);
    const close = () => w.remove();
    w.onclick = (e) => { if (e.target === w) close(); };
    const draw = (msg = '', err = false) => {
      if (view === 'new') box.innerHTML = `<h2>Create account</h2>
        <p class="dim">One account for every game: your progress, achievements, coins, banner and picture sync to any device you sign in on. Playing without one still works.</p>
        <label>Gamertag<input id="a-name" maxlength="11" placeholder="3 to 11 letters or numbers" autocomplete="username"></label>
        <p class="dim small">You get a number after it, like <b>Ghost#4821</b>, so the name can be anything.</p>
        <label>Password<input id="a-pw" type="password" maxlength="64" placeholder="8 characters or more" autocomplete="new-password"></label>
        <label>Password again<input id="a-pw2" type="password" maxlength="64" autocomplete="new-password"></label>
        <p class="warn small">⚠ There is no password reset (nobody stores it, not even a server). Write it down.</p>
        <p class="msg ${err ? 'err' : ''}">${esc(msg)}</p>
        <div class="row"><button class="ghost primary" data-a="go">Create</button><button class="ghost" data-a="swap">I have an account</button><button class="ghost" data-a="x">Cancel</button></div>`;
      else if (view === 'in') box.innerHTML = `<h2>Sign in</h2>
        <p class="dim">This browser's progress is merged into your account.</p>
        <label>Gamertag<input id="a-tag" maxlength="16" placeholder="Name#1234" autocomplete="username"></label>
        <label>Password<input id="a-pw" type="password" maxlength="64" autocomplete="current-password"></label>
        <p class="msg ${err ? 'err' : ''}">${esc(msg)}</p>
        <div class="row"><button class="ghost primary" data-a="go">Sign in</button><button class="ghost" data-a="swap">Create account</button><button class="ghost" data-a="x">Cancel</button></div>`;
      else box.innerHTML = `<h2>You're in</h2><p>Your gamertag is</p><div class="bigtag">${tagHTML(view)}</div>
        <p class="dim">Sign in with it and your password on any device. It's also your name on every game's daily leaderboard.</p>
        <div class="row"><button class="ghost primary" data-a="x">Done</button></div>`;
      box.querySelector('input')?.focus();
      box.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('[data-a=go]')?.click(); }));
    };
    box.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'x') { close(); refresh(); return; }
      if (a === 'swap') { view = view === 'new' ? 'in' : 'new'; draw(); return; }
      if (a !== 'go' || !GS()) return;
      const busy = (t) => { draw(t); box.querySelectorAll('button').forEach((x) => { x.disabled = true; }); };
      try {
        if (view === 'new') {
          const name = $('#a-name').value.trim(), pw = $('#a-pw').value, pw2 = $('#a-pw2').value;
          if (!/^[A-Za-z0-9_]{3,11}$/.test(name)) return draw('Gamertags are 3 to 11 letters, numbers or _ (no spaces).', true);
          if (pw.length < 8) return draw('Use a password of 8 characters or more.', true);
          if (pw !== pw2) return draw('The two passwords are different.', true);
          busy('Finding a free number…');
          let t = null;
          for (let i = 0; i < 6 && !t; i++) { const c = name + '#' + String(1000 + Math.floor(Math.random() * 9000)); if (!(await GS().tagTaken(c))) t = c; }
          if (!t) return draw('Couldn’t reach the sync relays. Check your connection and try again.', true);
          busy('Making your account…');
          const code = await GS().accountCode(t, pw);
          await GS().claimTag(t, code);
          write('gamelib.tag', t); GS().signIn(code, t, 'new');
          view = t; draw(); refresh();
        } else {
          const t = $('#a-tag').value.trim().replace(/\s*#\s*/, '#'), pw = $('#a-pw').value;
          if (!/^[A-Za-z0-9_]{3,11}#\d{4}$/.test(t)) return draw('Type the whole gamertag, with its number: Name#1234.', true);
          if (!pw) return draw('Type your password.', true);
          busy('Checking…');
          const code = await GS().accountCode(t, pw);
          const r = await GS().probe(code, 'library');
          if (r === 'moved') return draw('That password was changed (or the account was deleted). Use your new password.', true);
          if (r !== 'ok') {
            const taken = await GS().tagTaken(t);
            return draw(taken ? 'Wrong password for ' + t + '.' : 'There’s no account called ' + t + '. Check the number after the #.', true);
          }
          // the tag as it was created (capitals), from the account itself
          GS().signIn(code, t, 'join');
          view = t; draw(); refresh();
        }
      } catch { draw('Something went wrong. Check your connection and try again.', true); }
    };
    draw(); document.body.append(w);
  }
  // ---------- account settings ----------
  const accCode = () => { try { return (JSON.parse(localStorage.getItem('gamesync.account')) || {}).code || ''; } catch { return ''; } };
  const sameCode = (a, b) => String(a).replace(/[^A-Z0-9]/gi, '').toUpperCase() === String(b).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  function settings(view = 'menu') {
    document.querySelector('.acct-modal')?.remove();
    const w = document.createElement('div'); w.className = 'acct-modal';
    const box = document.createElement('div'); box.className = 'acct-box'; w.append(box);
    const close = () => { w.remove(); refresh(); };
    w.onclick = (e) => { if (e.target === w) close(); };
    const cur = '<label>Current password<input id="a-cur" type="password" maxlength="64" autocomplete="current-password"></label>';
    const draw = (msg = '', err = false) => {
      const t = tag(), m = `<p class="msg ${err ? 'err' : ''}">${esc(msg)}</p>`;
      if (view === 'menu') box.innerHTML = `<h2>⚙ Account</h2><p class="dim">Signed in as <b>${tagHTML(t)}</b>.</p>
        <div class="acct-menu"><button class="ghost" data-v="pw">🔒 Change password</button><button class="ghost" data-v="tag">✎ Change gamertag</button><button class="ghost danger" data-v="del">🗑 Delete account</button></div>
        <div class="row"><button class="ghost" data-a="x">Close</button></div>`;
      else if (view === 'pw') box.innerHTML = `<h2>Change password</h2>${cur}
        <label>New password<input id="a-pw" type="password" maxlength="64" placeholder="8 characters or more" autocomplete="new-password"></label>
        <label>New password again<input id="a-pw2" type="password" maxlength="64" autocomplete="new-password"></label>
        <p class="dim small">Your other devices sign out and need the new password.</p>${m}
        <div class="row"><button class="ghost primary" data-a="go">Change password</button><button class="ghost" data-v="menu">Back</button></div>`;
      else if (view === 'tag') box.innerHTML = `<h2>Change gamertag</h2>${staffRole ? '<p class="warn small">Staff can’t change their gamertag (the staff list is by gamertag).</p>' : ''}
        <label>New gamertag<input id="a-name" maxlength="11" placeholder="3 to 11 letters or numbers" autocomplete="off"></label>
        <p class="dim small">You get a new number after it. Friends who added your old gamertag need to add the new one. Your progress, coins and items come with you.</p>${cur}${m}
        <div class="row"><button class="ghost primary" data-a="go" ${staffRole ? 'disabled' : ''}>Change gamertag</button><button class="ghost" data-v="menu">Back</button></div>`;
      else if (view === 'del') box.innerHTML = `<h2>Delete account</h2>
        <p>This deletes <b>${tagHTML(t)}</b> from the sync relays: every game's synced progress, your coins, items and profile. Your other devices sign out. The progress saved on this device stays here.</p>
        <p class="warn small">⚠ This can't be undone.</p>
        <label>Type your gamertag to confirm<input id="a-conf" maxlength="16" placeholder="${esc(t)}" autocomplete="off"></label>${cur}${m}
        <div class="row"><button class="ghost danger" data-a="go">Delete forever</button><button class="ghost" data-v="menu">Back</button></div>`;
      else box.innerHTML = `<h2>Done</h2><p>${msg}</p><div class="row"><button class="ghost primary" data-a="x">OK</button></div>`;
      box.querySelector('input')?.focus();
      box.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('[data-a=go]')?.click(); }));
    };
    box.onclick = async (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v; if (v) { view = v; draw(); return; }
      const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'x') { close(); return; }
      if (a !== 'go' || !GS()) return;
      const t = tag(), code = accCode(), pw = $('#a-cur')?.value || '';
      const busy = (x) => { draw(x); box.querySelectorAll('button').forEach((b) => { b.disabled = true; }); };
      try {
        if (view === 'del' && ($('#a-conf').value.trim().toLowerCase() !== t.toLowerCase())) return draw('Type your whole gamertag to confirm.', true);
        const npw = $('#a-pw')?.value, npw2 = $('#a-pw2')?.value, name = $('#a-name')?.value.trim();
        if (view === 'pw' && (!npw || npw.length < 8)) return draw('Use a new password of 8 characters or more.', true);
        if (view === 'pw' && npw !== npw2) return draw('The two new passwords are different.', true);
        if (view === 'tag' && !/^[A-Za-z0-9_]{3,11}$/.test(name || '')) return draw('Gamertags are 3 to 11 letters, numbers or _ (no spaces).', true);
        if (!pw) return draw('Type your current password.', true);
        busy('Checking your password…');
        if (!sameCode(await GS().accountCode(t, pw), code)) return draw('That isn’t your current password.', true);
        if (view === 'pw') {
          busy('Moving your account to the new password…');
          const n = await GS().changeAccount(code, await GS().accountCode(t, npw), t, t);
          sent = ''; view = 'done'; draw(`Password changed. ${n} saves moved. Sign in with the new password on your other devices.`);
        } else if (view === 'tag') {
          busy('Finding a free number…');
          let nt = null;
          for (let i = 0; i < 6 && !nt; i++) { const c = name + '#' + String(1000 + Math.floor(Math.random() * 9000)); if (!(await GS().tagTaken(c))) nt = c; }
          if (!nt) return draw('Couldn’t reach the sync relays. Check your connection and try again.', true);
          busy('Moving your account to ' + nt + '…');
          await GS().changeAccount(code, await GS().accountCode(nt, pw), nt, t);
          write('gamelib.tag', nt); try { localStorage.setItem('gamesync.name', nt); } catch { /* blocked */ } GS().syncNow();
          sent = ''; view = 'done'; draw(`You're now <b>${tagHTML(nt)}</b>. Sign in with it (same password) on your other devices.`);
        } else if (view === 'del') {
          busy('Deleting…');
          await GS().deleteAccount(code, t);
          try { localStorage.removeItem('gamelib.tag'); } catch { /* blocked */ }
          sent = ''; view = 'done'; draw('Your account is deleted. Your progress on this device stays here.');
        }
        refresh();
      } catch (err) { draw(err?.message || 'Something went wrong. Check your connection and try again.', true); }
    };
    draw(); document.body.append(w);
  }

  // ---------- what other players see: your profile ----------
  let sent = '', sendT = 0;
  function publishProfile() {
    clearTimeout(sendT);
    sendT = setTimeout(() => {
      if (!tag() || !GS()?.setProfile) return;
      const l = look(), sum = window.Profile?.summary?.() || { games: [], got: achCount() };
      const p = { pfp: l.pfp || null, banner: l.banner || null, ach: sum.got, games: sum.games };
      const k = JSON.stringify(p) + '|' + tag();
      if (k === sent && Date.now() - (publishProfile.at || 0) < 30 * 60000) return; // unchanged: refresh "last seen" every half hour
      sent = k; publishProfile.at = Date.now(); GS().setProfile(p).catch(() => { sent = ''; });
    }, 2500);
  }
  // every game's achievements (and, in the PC app, its stats) from the account, so this page shows them all
  let pulling = false;
  async function pull() {
    if (pulling || !tag() || !GS()?.pullAll) return; pulling = true;
    try {
      let changed = false;
      for (const d of await GS().pullAll()) {
        if (d.game === 'library') continue;
        for (const [k, r] of Object.entries(d.keys || {})) {
          if (!r || typeof r.v !== 'string') continue;
          if (k.startsWith('gamesach.')) {
            const a = read(k, {}) || {}; let b = {}; try { b = JSON.parse(r.v) || {}; } catch { continue; }
            const m = { ...b, ...a }; if (Object.keys(m).length > Object.keys(a).length) { write(k, m); changed = true; }
          } else if (!WEB && !k.startsWith('gamesync.') && !k.startsWith('gamelib.')) {
            // the PC app keeps each game's saves apart; this is a copy just for the Profile page
            try { if (localStorage.getItem(k) !== r.v) { localStorage.setItem(k, r.v); changed = true; } } catch { /* full */ }
          }
        }
      }
      if (changed) { GS().syncNow(); refresh(); }
    } catch { /* offline */ } finally { pulling = false; }
  }
  // the PC app: games open in their own windows, so tell it who's signed in (it signs the games in too)
  let told = null;
  function tellApp() {
    if (!window.lib?.setAccount) return;
    let a = null; const t = tag(), code = accCode();
    if (t && code) a = { code, tag: t, staffkey: localStorage.getItem('gamelib.staffkey') || '', friends: read('gamelib.friends', []) };
    const k = JSON.stringify(a); if (k !== told) { told = k; window.lib.setAccount(a); }
  }

  function signOut() {
    if (!confirm('Sign out on this browser? Your progress here stays; it just stops syncing until you sign in again.')) return;
    GS()?.signOut(); refresh();
  }

  // ---------- the shop ----------
  let tab = 'banner';
  function shopHTML() {
    const o = owned(), l = look(), c = coins();
    const list = shop.items.filter((i) => i.type === tab).sort((a, b) => (a.price || 0) - (b.price || 0));
    return `<div class="shop-top"><div class="coins big">🪙 ${c.toLocaleString()}</div>
        <p class="dim">Earn <b>${shop.coinsPerAchievement || 100}</b> coins for every achievement in any game. ${tag() ? 'What you buy syncs to your account.' : 'Create an account to keep what you buy on every device.'}</p></div>
      <div class="tabs"><button class="${tab === 'banner' ? 'on' : ''}" data-tab="banner">Banners</button><button class="${tab === 'pfp' ? 'on' : ''}" data-tab="pfp">Profile pictures</button></div>
      <div class="shop-grid ${tab}">${list.map((i) => {
        const have = o.has(i.id), on = l[i.type] === i.id, short = (i.price || 0) - c;
        const btn = on ? '<button class="ghost" disabled>✓ Equipped</button>' : have ? `<button class="ghost primary" data-eq="${esc(i.id)}">Equip</button>`
          : short > 0 ? `<button class="ghost" disabled>Need ${short.toLocaleString()} more</button>` : `<button class="ghost primary" data-buy="${esc(i.id)}">Buy · 🪙 ${i.price.toLocaleString()}</button>`;
        return `<div class="sitem ${on ? 'on' : ''}"><div class="sprev" style="background-image:url('${esc(i.file)}')"></div>
          <div class="sinfo"><b>${esc(i.name)}</b><span class="dim">${have ? 'Owned' : i.price ? '🪙 ' + i.price.toLocaleString() : 'Free'}</span></div>${btn}</div>`;
      }).join('') || '<p class="dim">Nothing here yet.</p>'}</div>`;
  }
  function paintShop() {
    const box = $('#shop'); box.innerHTML = shopHTML();
    box.onclick = (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; paintShop(); return; }
      const b = e.target.closest('[data-buy]'), q = e.target.closest('[data-eq]');
      if (b) { const i = item(b.dataset.buy); if (!i || coins() < i.price) return; const own = new Set(read('gamelib.owned', [])); own.add(i.id); write('gamelib.owned', [...own]); equip(i); }
      else if (q) { const i = item(q.dataset.eq); if (i) equip(i); }
    };
  }
  function equip(i) { const l = read('gamelib.look', {}); l[i.type] = i.id; write('gamelib.look', l); GS()?.syncNow?.(); paintShop(); paintButton(); }
  function showShop() {
    document.title = 'Shop — Game Library';
    for (const id of ['#grid-view', '#detail-view', '#updates-view', '#profile-view', '#staff-view', '#friends-view']) { const el = $(id); if (el) el.hidden = true; }
    $('#shop-view').hidden = false; paintShop(); window.scrollTo(0, 0);
  }
  $('#shopBack').onclick = () => { $('#shop-view').hidden = true; window.Profile?.show(); };

  function refresh() { publishProfile(); tellApp(); const t = tag(); if (t) { try { if (localStorage.getItem('gamesync.name') !== t.slice(0, 16)) localStorage.setItem('gamesync.name', t.slice(0, 16)); } catch { /* blocked */ } } paintButton(); if (!$('#profile-view').hidden) window.Profile?.render(); if (!$('#shop-view').hidden) paintShop(); }

  // ---------- sync for the library itself ----------
  if (GS()) {
    GS().init({ game: 'library', keys: [{ match: 'gamesach.*', mode: 'max' }, { match: 'gamelib.owned', mode: 'max' }, { match: 'gamelib.look' }, { match: 'gamelib.tag' }, { match: 'gamelib.staffkey' }, { match: 'gamelib.gifts', mode: 'max' }, { match: 'gamelib.friends' }], title: 'Game Library', idle: () => !document.querySelector('.acct-modal') });
    GS().onStatus(() => refresh());
    setTimeout(pull, 2500); setInterval(() => { if (!document.hidden) pull(); }, 5 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
    window.lib?.onFriends?.((list) => { GS().setFriends(list); GS().syncNow(); window.dispatchEvent(new Event('gs-friends')); }); // changed in a game window (PC app)
    window.addEventListener('gs-friends', () => { GS().syncNow(); tellApp(); });
  }
  window.Acct = { head, showShop, modal, refresh, coins, tag, settings, pull, items: () => shop.items, setStaff(r) { if (r !== staffRole) { staffRole = r; refresh(); } } };
  ready.then(refresh);
})();
