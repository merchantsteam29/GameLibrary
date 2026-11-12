// Friends: gamertags you add, with their picture, what they're playing right now and when they were last on.
// The list is 'gamelib.friends' (synced through your account). Profiles and "online" pings are public and
// signed by each account (see sync.js), so what you see here is what that player's own devices posted.
(() => {
  const GS = () => window.GameSync;
  if (!GS()?.people) return;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const lower = (t) => String(t || '').toLowerCase();
  const tagHTML = (t) => { const i = t.lastIndexOf('#'); return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<span class="tagnum">${esc(t.slice(i))}</span>`; };
  const item = (id) => (window.Acct?.items() || []).find((i) => i.id === id);
  let timer = 0, msg = '', err = false;

  function ensureView() {
    if ($('#friends-view')) return;
    const m = document.createElement('main'); m.id = 'friends-view'; m.hidden = true;
    m.innerHTML = `<div class="feed-head"><button id="friendsBack" class="back">← Library</button><h2>👥 Friends</h2><p>See what your friends are playing, their profiles and achievements.</p></div><section id="friendsBody" class="feed"></section>`;
    $('#profile-view').after(m);
    $('#friendsBack').onclick = () => showGrid();
    m.addEventListener('click', act); m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'f-tag') add(); });
  }
  function show() {
    ensureView();
    document.querySelectorAll('main[id$="-view"]').forEach((v) => { v.hidden = true; });
    $('#friends-view').hidden = false; document.title = 'Friends — Game Library'; window.scrollTo(0, 0);
    msg = ''; paint();
  }

  const addHTML = () => `<div class="spanel"><h3>Add a friend</h3><div class="srow"><input id="f-tag" placeholder="Their gamertag: Name#1234" maxlength="16" autocomplete="off"><button class="ghost primary" data-a="add">Add</button></div>
    ${msg ? `<p class="msg ${err ? 'err' : 'ok'}">${esc(msg)}</p>` : ''}<p class="dim small">Your gamertag is <b>${tagHTML(window.Acct.tag())}</b>. You can also add someone from any leaderboard: click their name.</p></div>`;
  async function paint(quiet) {
    const box = $('#friendsBody'); if (!box) return;
    if (!window.Acct?.tag?.()) {
      box.innerHTML = `<div class="spanel"><p>Make an account (or sign in) to add friends and see what they're playing.</p><div class="srow"><button class="ghost primary" data-a="new">Create account</button><button class="ghost" data-a="in">Sign in</button></div></div>`;
      return;
    }
    const list = GS().friends();
    if (!quiet) box.innerHTML = addHTML() + (list.length ? '<p class="dim">Loading your friends…</p>' : '<p class="dim">No friends yet. Add someone by their gamertag.</p>');
    if (!list.length) { badge(0); return; }
    const info = await GS().people(list, true).catch(() => new Map());
    const rows = list.map((t) => ({ t, i: info.get(lower(t)) })).map((r) => ({ ...r, st: GS().statusOf(r.i), seen: Math.max(r.i?.on?.t || 0, r.i?.profile?.t || 0) }))
      .sort((a, b) => (b.st.live - a.st.live) || (b.seen - a.seen));
    const focus = document.activeElement?.id === 'f-tag' ? $('#f-tag').value : null;
    box.innerHTML = addHTML() + `<div class="fgrid">${rows.map(({ t, i, st }) => {
      const p = i?.profile || {}, b = item(p.banner), pf = item(p.pfp), name = i?.tag || t;
      return `<div class="fcard ${st.live ? 'live' : ''}" data-who="${esc(name)}" tabindex="0" title="See ${esc(name)}'s profile">
        <div class="fban"${b ? ` style="background-image:url('${esc(b.file)}')"` : ''}></div>
        <div class="frow">${pf ? `<img class="pfp" src="${esc(pf.file)}" alt="">` : `<span class="pfp pfp-letter">${esc(name[0].toUpperCase())}</span>`}
          <div class="fwho"><b>${tagHTML(name)}</b><span class="fst">${i?.claimed === false ? 'No account with this gamertag any more' : `<i class="fdot"></i>${esc(st.text)}`}</span></div>
          <button class="ghost frm" data-rm="${esc(t)}" title="Remove friend">✕</button></div>
        ${p.ach != null ? `<div class="fach">🏆 ${Number(p.ach) || 0} achievements</div>` : ''}</div>`;
    }).join('')}</div>`;
    if (focus != null) { $('#f-tag').value = focus; $('#f-tag').focus(); }
    badge(rows.filter((r) => r.st.live).length);
  }
  // the header button says how many friends are on
  function badge(n) { const b = $('#friendsBtn'); if (b) b.innerHTML = '👥 Friends' + (n ? ` <span class="fon">${n} on</span>` : ''); }
  async function poll() {
    if (!window.Acct?.tag?.() || document.hidden) return;
    const list = GS().friends(); if (!list.length) return badge(0);
    const info = await GS().people(list).catch(() => null); if (!info) return;
    badge(list.filter((t) => GS().statusOf(info.get(lower(t))).live).length);
  }

  async function add() {
    const inp = $('#f-tag'), t = (inp?.value || '').trim().replace(/\s*#\s*/, '#');
    err = true;
    if (!/^[A-Za-z0-9_]{3,11}#\d{4}$/.test(t)) { msg = 'Type the whole gamertag, with its number: Name#1234.'; return paint(); }
    if (lower(t) === lower(window.Acct.tag())) { msg = 'That’s you.'; return paint(); }
    if (GS().friends().some((f) => lower(f) === lower(t))) { msg = t + ' is already your friend.'; return paint(); }
    msg = 'Looking for ' + t + '…'; err = false; paint();
    const i = (await GS().people([t], true).catch(() => new Map())).get(lower(t));
    if (!i?.claimed) { msg = 'There’s no account called ' + t + '. Check the number after the #.'; err = true; return paint(); }
    GS().setFriends([...GS().friends(), i.tag]); GS().syncNow(); window.dispatchEvent(new Event('gs-friends'));
    msg = 'Added ' + i.tag + '.'; err = false; paint();
  }
  function act(e) {
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.stopPropagation(); if (confirm('Remove ' + rm.dataset.rm + ' from your friends?')) { GS().setFriends(GS().friends().filter((f) => lower(f) !== lower(rm.dataset.rm))); GS().syncNow(); window.dispatchEvent(new Event('gs-friends')); msg = ''; paint(); } return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'add') return add();
    if (a === 'new' || a === 'in') return window.Acct?.modal(a);
    const c = e.target.closest('[data-who]'); if (c) GS().showPerson(c.dataset.who);
  }

  $('#friendsBtn').onclick = show;
  window.addEventListener('gs-friends', () => { if (!$('#friends-view')?.hidden) paint(true); });
  GS().onStatus(() => { if ($('#friends-view') && !$('#friends-view').hidden) paint(true); });
  timer = setInterval(() => { if ($('#friends-view') && !$('#friends-view').hidden) paint(true); else poll(); }, 90000);
  setTimeout(poll, 4000);
  window.Friends = { show, paint };
})();
