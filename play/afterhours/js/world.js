// The night station (office) and the camera rooms. Each camera room is its own small scene.
import * as THREE from 'three';
import { buildCalm } from './models.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function tileTex(a = '#8b8f86', b = '#6f736b', n = 8) {
  const t = canvasTex(256, 256, (g, w) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s);
      g.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.12 + ')'; g.fillRect(i * s, j * s, s, s);
    }
    for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(40,30,20,' + Math.random() * 0.25 + ')'; g.beginPath(); g.arc(Math.random() * w, Math.random() * w, Math.random() * 10, 0, 7); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const FLOOR = tileTex();
function floorMat(rx, ry, tint = 0xffffff) { const t = FLOOR.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return std(tint, { map: t }); }

function wallTex(base = '#6f7f6a') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, h * 0.6, w, 6);
    for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(30,25,15,' + Math.random() * 0.15 + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 20, 2 + Math.random() * 60); }
  });
}

export function signMesh(lines, w, h, { bg = '#d8d8cc', fg = '#1b1b1b', size = 64, emissive = false } = {}) {
  const tex = canvasTex(512, Math.round(512 * h / w), (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const L = Array.isArray(lines) ? lines : [lines];
    L.forEach((ln, i) => {
      const s = ln.startsWith('#') ? size * 0.55 : size;
      g.font = `bold ${s}px Arial`;
      g.fillText(ln.replace(/^#/, ''), cw / 2, ch * (i + 0.5) / L.length);
    });
  });
  const mat = emissive ? new THREE.MeshBasicMaterial({ map: tex }) : std(0xffffff, { map: tex });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function roomBox(scene, w, d, h, { wall = '#6f7f6a', ceil = 0x3a3d38, floorTint = 0xffffff } = {}) {
  const wt = wallTex(wall); wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(Math.max(1, Math.round(w / 3)), 1);
  const wm = std(0xffffff, { map: wt, side: THREE.BackSide });
  const wt2 = wt.clone(); wt2.needsUpdate = true; wt2.repeat.set(Math.max(1, Math.round(d / 3)), 1);
  const wm2 = std(0xffffff, { map: wt2, side: THREE.BackSide });
  const fm = floorMat(w / 1.5, d / 1.5, floorTint); fm.side = THREE.BackSide;
  const cm = std(ceil, { side: THREE.BackSide });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wm2, wm2, cm, fm, wm, wm]);
  m.position.y = h / 2;
  scene.add(m);
  return m;
}

// wall plane in local XY (facing +z) with a rectangular hole
function wallWithHole(W, H, hole, mat) {
  const g = new THREE.Group();
  const add = (x0, x1, y0, y1) => {
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); g.add(m);
  };
  if (!hole) { add(-W / 2, W / 2, 0, H); return g; }
  add(-W / 2, hole.x0, 0, H); add(hole.x1, W / 2, 0, H);
  add(hole.x0, hole.x1, 0, hole.y0); add(hole.x0, hole.x1, hole.y1, H);
  return g;
}

function cage(w, h, d, { bars = 9, color = 0x9aa0a4 } = {}) {
  const g = new THREE.Group();
  const metal = std(color, { metalness: 0.6, roughness: 0.4 });
  const panel = std(0x7d8286, { metalness: 0.4, roughness: 0.6 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), panel); back.position.set(0, h / 2, -d / 2); g.add(back);
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, d), panel); side.position.set(s * w / 2, h / 2, 0); g.add(side); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), panel); top.position.set(0, h, 0); g.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), panel); bot.position.set(0, 0.015, 0); g.add(bot);
  const door = new THREE.Group(); door.position.set(-w / 2, 0, d / 2); g.add(door);
  for (let i = 0; i <= bars; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 5), metal);
    b.position.set((i / bars) * w, h / 2, 0); door.add(b);
  }
  for (const y of [0.03, h - 0.03, h / 2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.025), metal); r.position.set(w / 2, y, 0); door.add(r); }
  return { group: g, door };
}

function ceilingLamp(scene, x, y, z, color = 0xdde8d4, intensity = 2.5, distance = 9) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.4), new THREE.MeshBasicMaterial({ color }));
  panel.position.set(x, y, z); scene.add(panel);
  const l = new THREE.PointLight(color, intensity, distance, 1.2); l.position.set(x, y - 0.2, z); scene.add(l);
  return { panel, light: l, base: intensity };
}

// ================================================================== OFFICE
export function buildOffice() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.06);
  const amb = new THREE.AmbientLight(0x8890a0, 0.06); scene.add(amb);

  const wt = wallTex('#5f6e5c'); wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(2, 1);
  const wallMat = std(0xffffff, { map: wt });
  const H = 3;
  // floor & ceiling
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), floorMat(5, 4.5)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -0.5); scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), std(0x3c3f3a)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -0.5); scene.add(ceil);
  const front = wallWithHole(8, H, { x0: 1.3, x1: 2.3, y0: 1.55, y1: 2.25 }, wallMat); front.position.set(0, 0, -4); scene.add(front);
  const back = wallWithHole(8, H, null, wallMat); back.position.set(0, 0, 3); back.rotation.y = Math.PI; scene.add(back);
  const left = wallWithHole(7, H, { x0: -0.7, x1: 0.7, y0: 0, y1: 2.3 }, wallMat); left.position.set(-4, 0, -0.5); left.rotation.y = Math.PI / 2; scene.add(left);
  const right = wallWithHole(7, H, { x0: -0.7, x1: 0.7, y0: 0, y1: 2.3 }, wallMat); right.position.set(4, 0, -0.5); right.rotation.y = -Math.PI / 2; scene.add(right);

  // hallways outside each door (inside-out boxes: you see their interior through the doorway)
  const hallMat = (side) => [std(0x2b302a, { side }), std(0x2b302a, { side }), std(0x1a1c1a, { side }), floorMat(3, 1, 0x777777), std(0x2b302a, { side }), std(0x2b302a, { side })];
  for (const s of [-1, 1]) {
    const mats = hallMat(THREE.BackSide); mats[3].side = THREE.BackSide;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 1.6), mats);
    hall.position.set(s * 7, 1.25, -0.5); scene.add(hall);
    const sign = signMesh(['EXIT →'], 0.5, 0.18, { bg: '#300', fg: '#f33', size: 90, emissive: true });
    sign.position.set(s * 9.95, 2.1, -0.5); sign.rotation.y = -s * Math.PI / 2; scene.add(sign);
    // door frame
    const fr = std(0x3d4444, { metalness: 0.5 });
    for (const z of [-1.22, 0.22]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.35, 0.08), fr); p.position.set(s * 3.98, 1.17, z); scene.add(p); }
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.52), fr); t.position.set(s * 3.98, 2.33, -0.5); scene.add(t);
  }
  // vent duct behind the grate
  const ventMats = Array.from({ length: 6 }, () => std(0x4a4e52, { metalness: 0.6, roughness: 0.5, side: THREE.BackSide }));
  const duct = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 3.4), ventMats); duct.position.set(1.8, 1.9, -5.7); scene.add(duct);
  const grate = new THREE.Group(); grate.position.set(1.8, 1.9, -3.99); scene.add(grate);
  const gm = std(0x8a8f93, { metalness: 0.7, roughness: 0.4 });
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.03), gm); s.position.set(0, -0.3 + i * 0.12, 0); s.rotation.x = 0.6; grate.add(s); }
  for (const x of [-0.52, 0.52]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.76, 0.05), gm); f.position.set(x, 0, 0); grate.add(f); }
  for (const y of [-0.37, 0.37]) { const f = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), gm); f.position.set(0, y, 0); grate.add(f); }

  // shutters (stored open; animate y)
  const shutMat = std(0x50565a, { metalness: 0.7, roughness: 0.45 });
  const mkShutter = (w, h, d) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shutMat); g.add(m);
    const stripes = Math.floor(h / 0.18);
    for (let i = 0; i < stripes; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.02, d + 0.02), std(0x30353a, { metalness: 0.6 })); r.position.y = -h / 2 + i * 0.18 + 0.09; g.add(r); }
    const hz = new THREE.Mesh(new THREE.BoxGeometry(w + 0.025, 0.12, d + 0.025), std(0xb59a1e)); hz.position.y = -h / 2 + 0.06; g.add(hz);
    return g;
  };
  const doorL = mkShutter(0.06, 2.35, 1.42); doorL.position.set(-4.06, 2.3 + 1.18, -0.5);
  scene.add(doorL);
  const doorR = doorL.clone(); doorR.position.set(4.06, 2.3 + 1.18, -0.5); scene.add(doorR);
  const vent = mkShutter(1.02, 0.72, 0.04); vent.position.set(1.8, 1.9 + 0.75, -4.06); scene.add(vent);
  const doors = {
    L: { obj: doorL, open: 2.3 + 1.18, shut: 1.17, y: 2.3 + 1.18 },
    R: { obj: doorR, open: 2.3 + 1.18, shut: 1.17, y: 2.3 + 1.18 },
    V: { obj: vent, open: 1.9 + 0.75, shut: 1.9, y: 1.9 + 0.75 },
  };

  // hall lights
  const hallLights = {};
  for (const [k, s] of [['L', -1], ['R', 1]]) {
    const sp = new THREE.SpotLight(0xfff0cf, 0, 9, 0.75, 0.5, 1.2);
    sp.position.set(s * 4.3, 2.35, -0.5);
    sp.target.position.set(s * 8, 0.3, -0.5);
    scene.add(sp); scene.add(sp.target);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x333322 }));
    bulb.position.set(s * 4.3, 2.4, -0.5); scene.add(bulb);
    hallLights[k] = { light: sp, bulb };
  }

  // main lamp over the desk: short reach so it doesn't light the halls
  const lampPanel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xdfe8d6 }));
  lampPanel.position.set(0, H - 0.03, -0.6); scene.add(lampPanel);
  const lamp = new THREE.PointLight(0xe4ecd8, 3.2, 4.5, 1); lamp.position.set(0, 2.75, -0.6); scene.add(lamp);
  const lamp2 = new THREE.PointLight(0xe4ecd8, 0.8, 4.0, 1); lamp2.position.set(0, 2.2, 2.2); scene.add(lamp2);

  // desk
  const wood = std(0x5b4632), metal = std(0x5a6064, { metalness: 0.5, roughness: 0.5 });
  const desk = new THREE.Group(); desk.position.set(0, 0, -0.3); scene.add(desk);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 1.0), wood); top.position.y = 0.8; desk.add(top);
  for (const x of [-1.3, 1.3]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.9), metal); leg.position.set(x, 0.4, 0); desk.add(leg); }
  const modesty = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.04), metal); modesty.position.set(0, 0.45, -0.45); desk.add(modesty);

  const clickables = [];
  // CRT CCTV monitor
  const mon = new THREE.Group(); mon.position.set(0, 0.84, -0.55); scene.add(mon);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.55), std(0x2c2e2c)); shell.position.y = 0.28; mon.add(shell);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x1c3326 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), screenMat); screen.position.set(0, 0.29, 0.28); mon.add(screen);
  const monLabel = signMesh(['CCTV'], 0.12, 0.04, { bg: '#222', fg: '#9c9', size: 120 }); monLabel.position.set(-0.25, 0.04, 0.281); mon.add(monLabel);
  shell.userData.action = 'cams'; screen.userData.action = 'cams'; clickables.push(shell, screen);
  const monLight = new THREE.PointLight(0x58ff9a, 0.6, 2.2, 1); monLight.position.set(0, 1.15, -0.1); scene.add(monLight);

  // phone
  const phone = new THREE.Group(); phone.position.set(0.95, 0.835, -0.25); phone.rotation.y = -0.3; scene.add(phone);
  const pb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.2), std(0x7a1d1d)); phone.add(pb);
  const handset = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), std(0x6a1818)); handset.rotation.z = Math.PI / 2; handset.position.set(0, 0.07, 0); phone.add(handset);
  const phoneLight = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: 0x330000 })); phoneLight.position.set(0.09, 0.04, 0.1); phone.add(phoneLight);
  pb.userData.action = 'phone'; handset.userData.action = 'phone'; clickables.push(pb, handset);

  // med tray
  const tray = new THREE.Group(); tray.position.set(-0.95, 0.835, -0.25); tray.rotation.y = 0.3; scene.add(tray);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.26), std(0xb8bcc0, { metalness: 0.6, roughness: 0.3 })); tray.add(tb);
  [0xd6902a, 0x2a6fd6, 0x3fae4a].forEach((c, i) => {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), std(c, { emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 }));
    v.position.set(-0.12 + i * 0.08, 0.065, -0.05); tray.add(v); v.userData.action = 'meds'; clickables.push(v);
  });
  const syr = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), std(0xeeeeee, { transparent: true, opacity: 0.7 })); syr.rotation.z = Math.PI / 2; syr.position.set(0.05, 0.03, 0.07); tray.add(syr);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.3), std(0x8a6a40)); clip.position.set(0.25, 0.01, 0.0); tray.add(clip);
  const paper = signMesh(['CHARTS', '#Rx / doses', '#[M]'], 0.19, 0.26, { bg: '#eee', size: 70 }); paper.rotation.x = -Math.PI / 2; paper.position.set(0.25, 0.017, 0); tray.add(paper);
  tb.userData.action = 'meds'; clip.userData.action = 'meds'; paper.userData.action = 'meds'; clickables.push(tb, clip, paper);

  // vent button on the desk
  const ventBtnBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), metal); ventBtnBase.position.set(0.48, 0.835, 0.0); scene.add(ventBtnBase);
  const ventBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), new THREE.MeshBasicMaterial({ color: 0x665500 })); ventBtn.position.set(0.48, 0.86, 0.0); scene.add(ventBtn);
  const ventLbl = signMesh(['VENT [W]'], 0.14, 0.035, { bg: '#222', fg: '#dc4', size: 110 }); ventLbl.rotation.x = -Math.PI / 2; ventLbl.position.set(0.48, 0.852, 0.07); scene.add(ventLbl);
  ventBtn.userData.action = 'vent'; ventBtnBase.userData.action = 'vent'; clickables.push(ventBtn, ventBtnBase);

  // mug, papers, fan
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), std(0xe0ddd0)); mug.position.set(0.55, 0.885, -0.45); scene.add(mug);
  const fan = new THREE.Group(); fan.position.set(-0.55, 0.84, -0.55); scene.add(fan);
  const fstand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 0.25, 8), metal); fstand.position.y = 0.12; fan.add(fstand);
  const blades = new THREE.Group(); blades.position.set(0, 0.3, 0.06); fan.add(blades);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.005), std(0x333333)); b.position.y = 0.07; const p = new THREE.Group(); p.rotation.z = i * 2.094; p.add(b); blades.add(p); }
  const cagef = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 4, 20), metal); cagef.position.set(0, 0.3, 0.07); fan.add(cagef);

  // wall buttons beside each door
  const buttons = {};
  for (const [k, s] of [['L', -1], ['R', 1]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.32), metal); panel.position.set(s * 3.96, 1.2, 0.65); scene.add(panel);
    const db = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16), new THREE.MeshBasicMaterial({ color: 0x550000 }));
    db.rotation.z = Math.PI / 2; db.position.set(s * 3.92, 1.4, 0.65); scene.add(db);
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16), new THREE.MeshBasicMaterial({ color: 0x444444 }));
    lb.rotation.z = Math.PI / 2; lb.position.set(s * 3.92, 1.0, 0.65); scene.add(lb);
    const dl = signMesh([`DOOR [${k === 'L' ? 'Q' : 'E'}]`], 0.3, 0.07, { bg: '#222', fg: '#e55', size: 90 });
    dl.position.set(s * 3.93, 1.53, 0.65); dl.rotation.y = -s * Math.PI / 2; scene.add(dl);
    const ll = signMesh([`LIGHT [${k === 'L' ? 'A' : 'D'}]`], 0.3, 0.07, { bg: '#222', fg: '#eee', size: 90 });
    ll.position.set(s * 3.93, 0.87, 0.65); ll.rotation.y = -s * Math.PI / 2; scene.add(ll);
    db.userData.action = 'door' + k; lb.userData.action = 'light' + k; clickables.push(db, lb);
    buttons[k] = { door: db, light: lb };
  }

  // posters
  const p1 = signMesh(['WILLOWMERE', 'ANIMAL HOSPITAL', '#"We treat them like family."'], 1.3, 0.85, { bg: '#c9d8c0', fg: '#264226', size: 62 });
  p1.position.set(-1.9, 2.0, -3.98); scene.add(p1);
  const p2 = signMesh(['NIGHT STAFF RULES', '#1. No patient goes hungry.', '#2. Keep the doors ready.', '#3. Never stare at Pepper.', '#4. Don\'t answer UNKNOWN.'], 1.0, 0.9, { bg: '#e8e2cf', fg: '#3a1010', size: 68 });
  p2.position.set(-3.98, 1.8, 2.0); p2.rotation.y = Math.PI / 2; scene.add(p2);
  const p3 = signMesh(['STAFF OF THE MONTH', '#Dr. R. Hale', '#(again)'], 0.7, 0.55, { bg: '#ddd', fg: '#222', size: 60 });
  p3.position.set(3.98, 1.9, 2.0); p3.rotation.y = -Math.PI / 2; scene.add(p3);
  // scratch marks near the left door
  const scratch = canvasTex(256, 256, (g) => { g.strokeStyle = 'rgba(20,10,5,0.8)'; g.lineWidth = 4; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(60 + i * 30, 20); g.bezierCurveTo(70 + i * 30, 90, 50 + i * 30, 150, 70 + i * 32, 240); g.stroke(); } });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), new THREE.MeshStandardMaterial({ map: scratch, transparent: true }));
  sm.position.set(-3.97, 0.6, -1.6); sm.rotation.y = Math.PI / 2; scene.add(sm);

  // spots for creatures standing at the doors / in the vent (+z faces into the office)
  const spots = {
    LD: { p: [-5.1, 0, -0.5], r: Math.PI / 2 },
    LD_stray: { p: [-5.4, 0, -0.45], r: Math.PI / 2 },
    RD: { p: [5.1, 0, -0.5], r: -Math.PI / 2 },
    RD_stray: { p: [5.4, 0, -0.45], r: -Math.PI / 2 },
    VENT: { p: [1.8, 1.32, -5.35], r: 0 },
  };

  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 60);
  camera.position.set(0, 1.42, 1.7);
  return { scene, camera, doors, hallLights, lamp, lamp2, lampPanel, amb, monLight, screenMat, phoneLight, blades, buttons, ventBtn, clickables, spots };
}

// ================================================================== CAMERA ROOMS
export const CAM_LIST = ['1A', '1B', '2A', '2B', '3', '4', '5A', '5B', '6'];
export const CAM_NAMES = {
  '1A': 'DOG WARD', '1B': 'CATTERY', '2A': 'AVIARY', '2B': 'EXAM ROOM 3', '3': 'ISOLATION',
  '4': 'LOBBY', '5A': 'WEST HALL', '5B': 'EAST HALL', '6': 'VENT DUCT',
};

function makeCam(scene, pos, target, fov = 62) {
  const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 60);
  c.position.set(...pos);
  c.userData.target = new THREE.Vector3(...target);
  c.lookAt(c.userData.target);
  return c;
}
function newRoomScene() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x000000);
  s.add(new THREE.AmbientLight(0x9aa6a0, 0.12));
  return s;
}
function perch(scene, x, y, z) { return { p: [x, y, z] }; }

export function buildCams() {
  const sets = {};
  const calm = {};
  const cages = {};

  // ---- 1A Dog ward
  {
    const s = newRoomScene(); roomBox(s, 8, 6, 3, { wall: '#71806c' });
    ceilingLamp(s, 0, 2.95, 0, 0xe8e4c8, 2.2);
    const names = ['BUSTER', 'BISCUIT', 'MAPLE'];
    [-2.4, 0, 2.4].forEach((x, i) => {
      const c = cage(1.8, 1.25, 1.3); c.group.position.set(x, 0, -2.3); s.add(c.group);
      const tag = signMesh([names[i]], 0.6, 0.16, { bg: i === 1 ? '#ffe9a8' : '#bbb', size: 80 }); tag.position.set(x, 1.4, -1.64); s.add(tag);
      if (i !== 1) c.door.rotation.y = -1.6 - Math.random() * 0.3; else cages.biscuit = c.door;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.06, 12), std(0x8899aa, { metalness: 0.6 })); bowl.position.set(x + 0.55, 0.05, -2.0); s.add(bowl);
    });
    const empt = signMesh(['DISCHARGED'], 0.5, 0.12, { bg: '#ccc', size: 60 }); empt.position.set(-2.4, 1.25, -1.62); s.add(empt);
    // blood-ish drag mark
    const drag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x2a0808, transparent: true, opacity: 0.6 }));
    drag.rotation.x = -Math.PI / 2; drag.position.set(2.4, 0.01, -0.6); s.add(drag);
    calm.biscuit = buildCalm.biscuit(); calm.biscuit.position.set(0.1, 0.03, -2.4); calm.biscuit.rotation.y = 0.4; s.add(calm.biscuit);
    sets['1A'] = { scene: s, camera: makeCam(s, [2.6, 2.3, 1.2], [-0.6, 0.5, -2.2], 58), spots: { biscuit: { p: [0.6, 0, -0.6] }, pepper: perch(s, -2.4, 1.27, -2.3) } };
  }
  // ---- 1B Cattery
  {
    const s = newRoomScene(); roomBox(s, 6, 5, 2.8, { wall: '#7a7266' });
    ceilingLamp(s, 0.5, 2.75, 0, 0xf0e0c0, 1.8, 7);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const cg = cage(0.8, 0.6, 0.7, { bars: 6 }); cg.group.position.set(-0.9 + c * 0.9, r * 0.7, -2.1); s.add(cg.group);
      if (r === 0 && c === 1) cages.mittens = cg.door;
    }
    const tag = signMesh(['MITTENS'], 0.5, 0.12, { bg: '#d8c8ff', size: 80 }); tag.position.set(0, 0.62, -1.74); s.add(tag);
    const tree = new THREE.Group(); tree.position.set(2.0, 0, -1.2); s.add(tree);
    const carpet = std(0x7a5a8a);
    [[0, 0.5, 0.12, 1.0], [0, 1.1, 0.5, 0.06], [0.2, 0.6, 0.45, 0.06]].forEach(([x, y, w, h]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), carpet); m.position.set(x, y, 0); tree.add(m); });
    // vent on the left wall where Mittens escapes
    const vf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.7), std(0x222428)); vf.position.set(-2.98, 0.45, -0.5); s.add(vf);
    const vg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.7), std(0x9a9fa3, { metalness: 0.6 })); vg.position.set(-2.9, 0.45, -0.5); s.add(vg);
    cages.mittensVent = vg;
    calm.mittens = buildCalm.mittens(); calm.mittens.position.set(-0.05, 0.03, -2.15); s.add(calm.mittens);
    sets['1B'] = { scene: s, camera: makeCam(s, [2.6, 2.4, 2.1], [-0.6, 0.4, -1.2]), spots: { mittens: { p: [-1.2, 0, -0.2], r: -2.2 }, pepper: perch(s, 2.0, 1.15, -1.2) } };
  }
  // ---- 2A Aviary
  {
    const s = newRoomScene(); roomBox(s, 6, 5, 3, { wall: '#6c7a7e' });
    ceilingLamp(s, 0, 2.95, -0.5, 0xd0e4f0, 1.8, 7);
    const c = cage(2.2, 2.0, 1.6, { bars: 18, color: 0xc0c4c0 }); c.group.position.set(0, 0, -1.6); s.add(c.group); cages.pepper = c.door;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), std(0x6a4a2a)); pole.rotation.z = Math.PI / 2; pole.position.set(0, 1.1, -1.6); s.add(pole);
    const pole2 = pole.clone(); pole2.position.set(0, 0.6, -1.9); pole2.scale.set(1, 0.7, 1); s.add(pole2);
    const tag = signMesh(['PEPPER', '#"Talks a lot!"'], 0.6, 0.25, { bg: '#ffd0d0', size: 70 }); tag.position.set(1.4, 1.5, -0.79); s.add(tag);
    // feathers on the floor
    for (let i = 0; i < 14; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.14), std(i % 4 ? 0x8d9096 : 0xa01818, { side: THREE.DoubleSide })); f.rotation.set(-Math.PI / 2, 0, Math.random() * 6); f.position.set((Math.random() - 0.5) * 3, 0.01, -0.4 + Math.random()); s.add(f); }
    calm.pepper = buildCalm.pepper(); calm.pepper.position.set(0.1, 1.12, -1.6); s.add(calm.pepper);
    sets['2A'] = { scene: s, camera: makeCam(s, [2.4, 2.6, 2.0], [0, 1.0, -1.4]), spots: { pepper: perch(s, -0.6, 2.03, -1.6) } };
  }
  // ---- 2B Exam room 3
  {
    const s = newRoomScene(); roomBox(s, 6, 5, 2.8, { wall: '#7e8479' });
    const lamp = ceilingLamp(s, 0.4, 2.75, 0.2, 0xffffff, 1.6, 7);
    const steel = std(0xa8aeb2, { metalness: 0.7, roughness: 0.3 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), steel); table.position.set(2.3, 0.9, -0.4); table.rotation.y = Math.PI / 2; s.add(table);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.88, 10), steel); ped.position.set(2.3, 0.45, -0.4); s.add(ped);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.5), std(0xd8d8d0)); cab.position.set(1.8, 0.9, -2.2); s.add(cab);
    // privacy curtain on the left; Hoppy lurks behind it
    const cm = std(0x8fb6c8, { side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.2), cm); st.position.set(-2.9 + i * 0.19, 1.25, -0.6 + (i % 2) * 0.05); s.add(st); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.03), steel); rail.position.set(-2.0, 2.38, -0.6); s.add(rail);
    // pen
    const pen = new THREE.Group(); pen.position.set(-0.4, 0, -1.9); s.add(pen);
    for (const [x, z, w, d] of [[0, -0.4, 0.9, 0.03], [0, 0.4, 0.9, 0.03], [-0.45, 0, 0.03, 0.8], [0.45, 0, 0.03, 0.8]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), std(0xb8b8b0)); m.position.set(x, 0.2, z); pen.add(m); }
    const tag = signMesh(['HOPPY'], 0.4, 0.12, { bg: '#d0ffd0', size: 80 }); tag.position.set(-0.4, 0.3, -1.48); s.add(tag);
    cages.hoppy = pen;
    calm.hoppy = buildCalm.hoppy(); calm.hoppy.position.set(-0.4, 0, -1.95); calm.hoppy.rotation.y = 0.6; calm.hoppy.scale.setScalar(1.4); s.add(calm.hoppy);
    sets['2B'] = {
      scene: s, camera: makeCam(s, [2.6, 2.45, 2.2], [-0.2, 0.7, -1.3]), lamp,
      spots: { hop0: { p: [-1.75, 0, -1.3] }, hop1: { p: [-1.0, 0, -1.1] }, hop2: { p: [-0.1, 0, 0.3], s: 0.92 }, pepper: perch(s, 1.8, 1.81, -2.2) },
    };
  }
  // ---- 3 Isolation
  {
    const s = newRoomScene(); roomBox(s, 5, 5, 2.8, { wall: '#5b5f5a', floorTint: 0x777777 });
    const red = new THREE.PointLight(0xff2a1a, 2.0, 7, 1.2); red.position.set(0, 2.6, -1); s.add(red);
    const rb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); rb.position.set(0, 2.75, -1); s.add(rb);
    const c = cage(3.0, 2.5, 2.0, { bars: 16, color: 0x6a6e72 }); c.group.position.set(0, 0, -1.4); s.add(c.group);
    c.door.rotation.y = -0.9; // it's always open...
    const bio = signMesh(['⚠ ISOLATION', '#NO CHART · NO OWNER', '#DO NOT ENTER'], 0.9, 0.5, { bg: '#e3c31a', fg: '#111', size: 70 }); bio.position.set(-1.9, 1.9, -2.48); s.add(bio);
    // plastic strip curtain between camera and cell
    const pm = new THREE.MeshStandardMaterial({ color: 0xcfe0e0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, roughness: 0.2 });
    for (let i = 0; i < 16; i++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 2.6), pm); st.position.set(-2.3 + i * 0.3, 1.35, 0.3); st.rotation.y = (Math.random() - 0.5) * 0.2; s.add(st); }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.06, 12), std(0x8899aa, { metalness: 0.6 })); bowl.position.set(0.8, 0.04, -0.5); s.add(bowl);
    sets['3'] = { scene: s, camera: makeCam(s, [1.8, 2.5, 2.2], [-0.2, 1.0, -1.5]), red, spots: { stray: { p: [-0.6, 0, -2.0], r: Math.PI }, stray_watch: { p: [0.2, 0, -0.9] }, pepper: perch(s, 1.1, 2.53, -1.4) } };
  }
  // ---- 4 Lobby
  {
    const s = newRoomScene(); roomBox(s, 10, 8, 3.2, { wall: '#7a8a70' });
    ceilingLamp(s, -2, 3.15, 0, 0xe8ecd8, 2.6, 10);
    ceilingLamp(s, 2, 3.15, 1, 0xe8ecd8, 1.4, 8);
    const fishL = new THREE.PointLight(0x3a8aff, 1.6, 5, 1.2); fishL.position.set(3.2, 1.3, -3.3); s.add(fishL);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a5a9a, emissive: 0x0a2a5a, transparent: true, opacity: 0.7 })); tank.position.set(3.2, 1.2, -3.6); s.add(tank);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.5), std(0x3a2a1a)); stand.position.set(3.2, 0.4, -3.6); s.add(stand);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 0.8), std(0x6a5440)); counter.position.set(-2.2, 0.55, -2.4); s.add(counter);
    const sign = signMesh(['WILLOWMERE ANIMAL HOSPITAL'], 3.2, 0.4, { bg: '#2e4a2e', fg: '#e8f0d8', size: 52 }); sign.position.set(-2.2, 2.5, -3.98); s.add(sign);
    for (let i = 0; i < 5; i++) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), std(0x2a4a6a)); ch.position.set(-4.4, 0.23, 1.6 - i * 0.7); s.add(ch); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.5), std(0x2a4a6a)); bk.position.set(-4.68, 0.6, 1.6 - i * 0.7); s.add(bk); }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.9 })); glass.position.set(4.98, 1.2, 1.0); glass.rotation.y = -Math.PI / 2; s.add(glass);
    const hours = signMesh(['CLOSED', '#Open 8am - 6pm', '#Emergencies: knock'], 0.6, 0.4, { bg: '#eee', fg: '#a00', size: 60 }); hours.position.set(4.96, 1.4, 1.0); hours.rotation.y = -Math.PI / 2; s.add(hours);
    const lostPet = signMesh(['LOST DOG', '#brown · thin · no collar', '#"he doesn\'t look right"'], 0.6, 0.5, { bg: '#f2eedc', size: 70 }); lostPet.position.set(0.3, 1.6, -3.98); s.add(lostPet);
    sets['4'] = { scene: s, camera: makeCam(s, [-4.4, 2.9, 3.6], [1.0, 0.8, -1.5], 66), spots: { biscuit: { p: [0.4, 0, -0.6] }, stray: { p: [1.6, 0, 0.6] }, pepper: perch(s, -2.6, 1.1, -2.4) } };
  }
  // ---- 5A / 5B halls (camera at the office end looking back down the corridor)
  for (const id of ['5A', '5B']) {
    const s = newRoomScene(); roomBox(s, 2.6, 14, 2.8, { wall: id === '5A' ? '#66735f' : '#6a6f66' });
    const lamps = [ceilingLamp(s, 0, 2.75, -5, 0xe0e8d0, 1.3, 6), ceilingLamp(s, 0, 2.75, 1, 0xe0e8d0, 0.6, 5)];
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.05), std(0x44504a)); door.position.set(0, 1.1, 6.95); s.add(door);
    const staff = signMesh(['STAFF ONLY'], 0.6, 0.15, { bg: '#eee', fg: '#a00', size: 80 }); staff.position.set(0, 2.35, 6.9); staff.rotation.y = Math.PI; s.add(staff);
    const arrow = signMesh([id === '5A' ? '← KENNELS · LOBBY' : 'EXAM · AVIARY →'], 1.2, 0.18, { bg: '#2e4a2e', fg: '#e8f0d8', size: 60 }); arrow.position.set(-1.28, 2.1, -2); arrow.rotation.y = Math.PI / 2; s.add(arrow);
    if (id === '5B') {
      const gurney = new THREE.Group(); gurney.position.set(0.7, 0, -2.5); gurney.rotation.y = 0.15; s.add(gurney);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 1.9), std(0xb0b6b8, { metalness: 0.6 })); top.position.y = 0.85; gurney.add(top);
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 1.7), std(0xd8d8d0)); sheet.position.y = 0.92; gurney.add(sheet);
    } else {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.7, 12), std(0x803030)); bin.position.set(-0.9, 0.35, -1); s.add(bin);
    }
    sets[id] = {
      scene: s, camera: makeCam(s, [0.9, 2.5, 6.6], [-0.2, 0.9, -3], 60), lamps,
      spots: id === '5A'
        ? { biscuit: { p: [-0.2, 0, -0.5] }, stray: { p: [0.3, 0, 1.6] }, pepper: perch(s, -0.9, 0.72, -1) }
        : { hoppy: { p: [0.0, 0, 2.5] }, stray: { p: [-0.3, 0, 0.8] }, pepper: perch(s, 0.7, 0.98, -2.5) },
    };
  }
  // ---- 6 Vent duct
  {
    const s = newRoomScene();
    const mats = Array.from({ length: 6 }, () => std(0x6a7074, { metalness: 0.7, roughness: 0.45, side: THREE.BackSide }));
    const duct = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 9), mats); duct.position.set(0, 0.45, 0); s.add(duct);
    const seamMat = std(0x34383c, { metalness: 0.6 });
    for (let z = -4; z <= 3; z += 1) {
      for (const [w, h, x, y] of [[1.1, 0.03, 0, 0.885], [1.1, 0.03, 0, 0.015], [0.03, 0.9, -0.535, 0.45], [0.03, 0.9, 0.535, 0.45]]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), seamMat); seam.position.set(x, y, z); s.add(seam);
      }
    }
    const l = new THREE.PointLight(0x9ab0ff, 2.2, 12, 1); l.position.set(0, 0.8, 3.2); s.add(l);
    const l2 = new THREE.PointLight(0x9ab0ff, 0.8, 6, 1); l2.position.set(0, 0.8, -3); s.add(l2);
    sets['6'] = { scene: s, camera: makeCam(s, [0, 0.75, 4.3], [0, 0.35, -2], 70), spots: { mittens: { p: [0, 0, -0.5], s: 0.75 } } };
  }

  return { sets, calm, cages };
}
