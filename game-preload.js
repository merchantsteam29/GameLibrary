// Runs in every game window of the PC app before the game's own scripts.
// Each game has its own address here (its own saves), so the library's account is handed to it: the game's
// sync.js then syncs to your account like on the website. 'gamesync.join' makes the account's saves win
// over whatever this window had; 'gamesync.fromlib' marks it so signing out of the library signs the games out too.
const { contextBridge, ipcRenderer } = require('electron');
try {
  const a = ipcRenderer.sendSync('account-get'), ls = window.localStorage;
  let cur = null; try { cur = JSON.parse(ls.getItem('gamesync.account') || 'null'); } catch { /* junk */ }
  if (a && a.code && a.tag) {
    if (!cur || cur.code !== a.code) {
      ls.setItem('gamesync.account', JSON.stringify({ code: a.code, since: Date.now(), tag: a.tag }));
      ls.setItem('gamesync.join', '1'); ls.setItem('gamesync.fromlib', '1');
    }
    ls.setItem('gamesync.name', a.tag.slice(0, 16));
    if (a.staffkey) ls.setItem('gamelib.staffkey', a.staffkey); else ls.removeItem('gamelib.staffkey');
    ls.setItem('gamelib.friends', JSON.stringify(a.friends || []));
  } else if (cur && ls.getItem('gamesync.fromlib')) {
    ls.removeItem('gamesync.account'); ls.removeItem('gamesync.fromlib'); ls.removeItem('gamelib.staffkey');
  }
} catch { /* storage blocked: the game just runs without the account */ }
// friends added from a game's leaderboard go back to the library
contextBridge.exposeInMainWorld('gameLib', { setFriends: (list) => ipcRenderer.send('friends-set', Array.isArray(list) ? list.map(String) : []) });
