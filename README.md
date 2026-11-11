# Game Library

**▶ Play in your browser: https://merchantsteam29.github.io/GameLibrary/**

**⬇ Download for PC: [GameLibrary.zip](https://github.com/merchantsteam29/GameLibrary/releases/latest/download/GameLibrary.zip)** (Windows; unzip it and run GameLibrary.exe, no install). It lists every game and plays them in their own window, straight from the internet, so it works on any PC.

A desktop launcher for my browser games. Shows every game as a card with a title and thumbnail; click one for its page, then hit Play.

- **Run from source:** `npm start`
- **Build the download:** `npm run dist` → `dist/GameLibrary.exe` (one portable file, no install). Releases also attach it zipped as `GameLibrary.zip`, because Edge SmartScreen blocks a bare unsigned .exe download

On every launch it scans `~/source/repos` for folders with an `index.html` (your own copies, played from disk), then loads the website's `games.json` and adds the games you don't have locally as online games (cached, so the list also shows offline). A local copy always wins over the online one. Use **＋ Add game** for anything elsewhere, ⟳ to rescan.

Options: `--library-root=<folder>` uses another games folder, `--data-dir=<folder>` keeps the library data somewhere else (also handy for testing a clean PC).

Thumbnails: uses `cover.png` or `og.png` from the game folder. If there's none, it takes a screenshot (and only then falls back to `icons/icon-512.png`) 6 s after you first launch the game. You can also snap the current game screen or pick an image from the game's page.

Each game runs on its own local port (47100+), so saves (localStorage) stick between launches. In game: F11 fullscreen, F5 reload, F12 dev tools.

Library data lives in `%APPDATA%\Game Library`.

## Website

`index.html` at the repo root is the same library as a web page (GitHub Pages). Play opens each game's own GitHub Pages site. After adding or changing a game, run `npm run web` to rebuild `games.json` and `thumbs/`, then commit and push.

## Game updates (patch notes)

Put an `updates.json` in a game's folder to post updates. The library shows them in the **📰 Updates** feed, on the game's page, and as an **UPDATED** badge on its card (for three weeks, or until you open it):

```json
[
  { "version": "2.0", "date": "2026-11-09", "title": "Five floors down", "notes": ["Two new floors…", "A new boss…"] }
]
```

The desktop app reads it straight from the folder. For the website, run `npm run web` (or copy the entries into that game's `updates` field in `games.json`), then commit and push.

Where each game's notes come from: Hollow Badge writes its `updates.json` from `changelog.js` (`node tools/changelog.mjs`), Trigger Happy from `js/changelog.js` (`node tools/updates-json.mjs`, run by its `release.mjs`), . The other games' `updates.json` files are written by hand: add a new entry at the top for each update.

Thumbnails: `npm run web` keeps a game's existing thumbnail if it has no cover image; `npm run web -- --resnap` retakes the screenshots.

## Accounts and the shop (website)

- **Accounts are optional.** Create one on the Profile page: a gamertag (you get `Name#1234`) and a password. They make your sync code, so every game on the site syncs to your account on any device you sign in on. There is no password reset.
- **Coins:** every achievement in any game is worth `coinsPerAchievement` coins (in `shop/items.json`, 100 by default). Coins buy banners and profile pictures. No real money.
- **Adding your own art:** put a picture in `shop/banners/` (wide, 1200 x 300 looks best) or `shop/pfps/` (square, 256 x 256 or bigger). PNG, JPG, WEBP, GIF or SVG. Then run `npm run shop` (or `npm run web`), which adds it to `shop/items.json` with a name from the file name and a default price (banners 600, pictures 300). Edit `items.json` to change a name or price; `0` makes it free for everyone. Commit and push to put it live.
