# Game Library

**[⬇ Download GameLibrary.exe](https://github.com/merchantsteam29/GameLibrary/releases/latest/download/GameLibrary.exe)**

A desktop launcher for my browser games. Shows every game as a card with a title and thumbnail; click one for its page, then hit Play.

- **Run from source:** `npm start`
- **Build the download:** `npm run dist` → `dist/GameLibrary.exe` (one portable file, no install)

On first launch it scans `~/source/repos` for folders with an `index.html`. Use **＋ Add game** for anything elsewhere, ⟳ to rescan.

Thumbnails: uses `cover.png`, `og.png` or `icons/icon-512.png` from the game folder. If there's none, it takes a screenshot 6 s after you first launch the game. You can also snap the current game screen or pick an image from the game's page.

Each game runs on its own local port (47100+), so saves (localStorage) stick between launches. In game: F11 fullscreen, F5 reload, F12 dev tools.

Library data lives in `%APPDATA%\Game Library`.
