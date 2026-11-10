# Game Library

**▶ Play in your browser: https://merchantsteam29.github.io/GameLibrary/**

A desktop launcher for my browser games. Shows every game as a card with a title and thumbnail; click one for its page, then hit Play.

- **Run from source:** `npm start`
- **Build the download:** `npm run dist` → `dist/GameLibrary.exe` (one portable file, no install)

On first launch it scans `~/source/repos` for folders with an `index.html`. Use **＋ Add game** for anything elsewhere, ⟳ to rescan.

Thumbnails: uses `cover.png`, `og.png` or `icons/icon-512.png` from the game folder. If there's none, it takes a screenshot 6 s after you first launch the game. You can also snap the current game screen or pick an image from the game's page.

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
