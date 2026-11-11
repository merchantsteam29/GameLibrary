// The shop's item list. Drop a picture in shop/banners/ or shop/pfps/ and run `npm run shop` (npm run web
// does it too): new files are added to shop/items.json with a name from the file name and a default price.
// Edit items.json afterwards to change a name or price (price 0 = free for everyone). Removed files drop out.
//   Banners: wide, 1200 x 300 looks best (shown cropped to fit).  Profile pictures: square, 256 x 256 or bigger.
const fs = require('fs');
const path = require('path');

const SHOP = path.join(__dirname, '..', 'shop');
const KINDS = { banners: { type: 'banner', price: 600 }, pfps: { type: 'pfp', price: 300 } };
const PICS = /\.(png|jpe?g|webp|gif|svg)$/i;

function nameFrom(file) {
  return path.basename(file, path.extname(file)).replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Untitled';
}

function buildShop() {
  const listFile = path.join(SHOP, 'items.json');
  let old = [], per = 100;
  try { const j = JSON.parse(fs.readFileSync(listFile, 'utf8')); old = j.items || []; per = Number(j.coinsPerAchievement) || 100; } catch { /* first run */ }
  const items = [];
  for (const [dir, def] of Object.entries(KINDS)) {
    const full = path.join(SHOP, dir);
    fs.mkdirSync(full, { recursive: true });
    for (const f of fs.readdirSync(full).filter((x) => PICS.test(x)).sort()) {
      const file = `shop/${dir}/${f}`;
      const was = old.find((o) => o.file === file);
      const id = was?.id || `${def.type}-${path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      items.push({ id, type: def.type, name: was?.name || nameFrom(f), price: was ? Number(was.price) || 0 : def.price, file, ...(was?.game ? { game: was.game } : {}) });
    }
  }
  const added = items.filter((i) => !old.some((o) => o.file === i.file)), gone = old.filter((o) => !items.some((i) => i.file === o.file));
  fs.writeFileSync(listFile, JSON.stringify({ coinsPerAchievement: per, items }, null, 2) + '\n');
  console.log(`shop: ${items.length} items` + (added.length ? `, new: ${added.map((i) => i.name).join(', ')}` : '') + (gone.length ? `, removed: ${gone.map((i) => i.name).join(', ')}` : ''));
}

module.exports = { buildShop };
if (require.main === module) buildShop();
