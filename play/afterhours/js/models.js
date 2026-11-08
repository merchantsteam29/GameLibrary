// Procedural animal models: a calm patient version and a "turned" monster version of each.
// Every model faces +z with its origin on the floor. Monsters expose userData.head and userData.eyes.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
const basic = (color) => new THREE.MeshBasicMaterial({ color });
const TOOTH = std(0xe9e0c4, { roughness: 0.4 });
const MOUTH = basic(0x220405);
const BANDAGE = std(0xd8d2c0);
const BLACK = std(0x111111, { roughness: 0.3 });

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function sph(r, mat, x, y, z, p, sx = 1, sy = 1, sz = 1) {
  const m = mesh(new THREE.SphereGeometry(r, 18, 14), mat, x, y, z, p);
  m.scale.set(sx, sy, sz);
  return m;
}
function box(w, h, d, mat, x, y, z, p) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p); }
// capsule stretched between two points
function limb(p, mat, a, b, r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = Math.max(0.01, A.distanceTo(B));
  const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat, 0, 0, 0, p);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
function teeth(p, n, w, y, z, size, down = true, x0 = 0) {
  for (let i = 0; i < n; i++) {
    const t = mesh(new THREE.ConeGeometry(size * 0.32, size, 5), TOOTH, x0 - w / 2 + (i * w) / Math.max(1, n - 1), y, z, p);
    if (down) t.rotation.x = Math.PI;
    t.rotation.z = (Math.random() - 0.5) * 0.4;
  }
}
function eye(p, color, x, y, z, r = 0.03) {
  const e = sph(r, basic(color), x, y, z, p);
  return e;
}
function bandageRing(p, r, x, y, z, rx = 0, rz = 0) {
  const b = mesh(new THREE.CylinderGeometry(r, r, 0.06, 14, 1, true), BANDAGE, x, y, z, p);
  b.material = BANDAGE;
  b.rotation.set(rx, 0, rz);
  return b;
}
function claws(p, pos, dir = -1) {
  for (let i = -1; i <= 1; i++) {
    const c = mesh(new THREE.ConeGeometry(0.015, 0.09, 4), TOOTH, pos[0] + i * 0.03, pos[1] + dir * 0.05, pos[2] + 0.02, p);
    if (dir < 0) c.rotation.x = Math.PI;
  }
}

// ---------------------------------------------------------------- calm patients
function calmDog() {
  const g = new THREE.Group();
  const fur = std(0xc8923a);
  const b = mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 12), fur, 0, 0.2, 0, g);
  b.rotation.x = Math.PI / 2;
  const head = new THREE.Group(); head.position.set(0, 0.28, 0.42); g.add(head);
  sph(0.16, fur, 0, 0, 0, head);
  box(0.11, 0.09, 0.16, fur, 0, -0.04, 0.16, head);
  sph(0.03, BLACK, 0, -0.01, 0.25, head);
  sph(0.07, std(0xa8742a), -0.14, -0.03, 0, head, 0.4, 1.2, 0.8);
  sph(0.07, std(0xa8742a), 0.14, -0.03, 0, head, 0.4, 1.2, 0.8);
  box(0.05, 0.008, 0.01, BLACK, -0.06, 0.03, 0.15, head);
  box(0.05, 0.008, 0.01, BLACK, 0.06, 0.03, 0.15, head);
  const cone = mesh(new THREE.CylinderGeometry(0.32, 0.14, 0.24, 18, 1, true), std(0xffffff, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }), 0, 0.28, 0.33, g);
  cone.rotation.x = -Math.PI / 2;
  limb(g, fur, [-0.1, 0.06, 0.25], [-0.1, 0.06, 0.55], 0.05);
  limb(g, fur, [0.1, 0.06, 0.25], [0.1, 0.06, 0.55], 0.05);
  limb(g, fur, [0, 0.22, -0.38], [0.15, 0.12, -0.65], 0.04);
  bandageRing(g, 0.07, 0.1, 0.06, 0.42, Math.PI / 2);
  g.userData.breathe = b;
  return g;
}
function calmCat() {
  const g = new THREE.Group();
  const fur = std(0x1c1b20);
  const b = sph(0.2, fur, 0, 0.13, 0, g, 1.3, 0.65, 1);
  const head = sph(0.11, fur, 0.17, 0.18, 0.14, g);
  mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur, 0.12, 0.29, 0.14, g);
  mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur, 0.22, 0.29, 0.14, g);
  box(0.035, 0.006, 0.01, basic(0x446633), 0.13, 0.2, 0.245, g);
  box(0.035, 0.006, 0.01, basic(0x446633), 0.21, 0.2, 0.245, g);
  const tail = mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 20, Math.PI * 1.1), fur, 0, 0.06, 0, g);
  tail.rotation.x = Math.PI / 2;
  bandageRing(g, 0.115, 0.17, 0.12, 0.14);
  g.userData.breathe = b; head.name = 'head';
  return g;
}
function calmRabbit() {
  const g = new THREE.Group();
  const fur = std(0xe8e4dc);
  const b = sph(0.2, fur, 0, 0.18, 0, g, 1, 0.9, 1.25);
  const head = new THREE.Group(); head.position.set(0, 0.34, 0.17); g.add(head);
  sph(0.12, fur, 0, 0, 0, head);
  sph(0.02, std(0xe89aa8), 0, -0.01, 0.12, head);
  eye(head, 0x220000, -0.07, 0.03, 0.08, 0.018);
  eye(head, 0x220000, 0.07, 0.03, 0.08, 0.018);
  limb(head, fur, [-0.05, 0.08, -0.02], [-0.07, 0.3, -0.08], 0.03);
  limb(head, fur, [0.05, 0.08, -0.02], [0.1, 0.27, -0.1], 0.03);
  sph(0.05, std(0xffffff), 0, 0.15, -0.25, g);
  // bandaged jaw
  bandageRing(head, 0.1, 0, -0.04, 0.04, Math.PI / 2.2);
  g.userData.breathe = b;
  return g;
}
function calmParrot() {
  const g = new THREE.Group();
  const grey = std(0x8d9096);
  const b = sph(0.1, grey, 0, 0.17, 0, g, 1, 1.6, 1);
  sph(0.075, grey, 0, 0.36, 0.03, g);
  const beak = mesh(new THREE.ConeGeometry(0.025, 0.07, 6), BLACK, 0, 0.34, 0.11, g);
  beak.rotation.x = Math.PI / 2 + 0.6;
  eye(g, 0xf2f2e0, -0.045, 0.38, 0.07, 0.014);
  eye(g, 0xf2f2e0, 0.045, 0.38, 0.07, 0.014);
  const tail = box(0.08, 0.16, 0.03, std(0xb32020), 0, 0.02, -0.08, g);
  tail.rotation.x = 0.4;
  // patchy plucked chest
  sph(0.05, std(0xc9a6a0), 0, 0.17, 0.07, g, 1, 1.4, 0.5);
  g.userData.breathe = b;
  return g;
}

// ---------------------------------------------------------------- monsters
function hunchedBody(g, fur, skin, h = 1) {
  // digitigrade legs
  for (const s of [-1, 1]) {
    limb(g, fur, [s * 0.15, 1.0 * h, -0.05], [s * 0.19, 0.55 * h, 0.2], 0.08);
    limb(g, fur, [s * 0.19, 0.55 * h, 0.2], [s * 0.18, 0.14 * h, -0.12], 0.06);
    limb(g, skin, [s * 0.18, 0.14 * h, -0.12], [s * 0.18, 0.03, 0.12], 0.045);
    claws(g, [s * 0.18, 0.06, 0.14], -1);
  }
  const torso = mesh(new THREE.CapsuleGeometry(0.24, 0.7 * h, 4, 12), fur, 0, 1.38 * h, 0.12, g);
  torso.rotation.x = 0.4;
  // ribs
  for (let i = 0; i < 4; i++) {
    const r = mesh(new THREE.TorusGeometry(0.235, 0.014, 4, 16, Math.PI), skin, 0, (1.25 + i * 0.1) * h, 0.12 + i * 0.04, g);
    r.rotation.set(0.4, 0, 0);
  }
  // long arms
  for (const s of [-1, 1]) {
    limb(g, fur, [s * 0.3, 1.72 * h, 0.3], [s * 0.42, 1.15 * h, 0.42], 0.06);
    limb(g, skin, [s * 0.42, 1.15 * h, 0.42], [s * 0.38, 0.55 * h, 0.5], 0.045);
    claws(g, [s * 0.38, 0.5 * h, 0.5], -1);
  }
  return torso;
}

function monsterDog() {
  const g = new THREE.Group();
  const fur = std(0x8a6428), skin = std(0x9a5a50);
  const torso = hunchedBody(g, fur, skin);
  bandageRing(g, 0.26, 0, 1.3, 0.1, 0.4);
  bandageRing(g, 0.26, 0, 1.5, 0.18, 0.5, 0.2);
  const head = new THREE.Group(); head.position.set(0, 1.92, 0.5); g.add(head);
  sph(0.2, fur, 0, 0, 0, head, 1, 0.95, 1.05);
  box(0.16, 0.1, 0.36, fur, 0, 0.02, 0.28, head); // upper jaw
  sph(0.035, BLACK, 0, 0.07, 0.46, head);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.04, 0.1); jaw.rotation.x = 0.55; head.add(jaw);
  box(0.14, 0.05, 0.34, skin, 0, -0.03, 0.16, jaw);
  box(0.13, 0.04, 0.3, MOUTH, 0, 0.0, 0.15, jaw);
  teeth(head, 6, 0.12, -0.05, 0.4, 0.06, true);
  teeth(jaw, 5, 0.11, 0.0, 0.3, 0.05, false);
  for (const s of [-1, 1]) {
    sph(0.09, std(0x6a4a1e), s * 0.19, -0.05, -0.02, head, 0.35, 1.6, 0.8);
  }
  const eyes = [eye(head, 0xfff1a0, -0.1, 0.08, 0.15, 0.032), eye(head, 0xfff1a0, 0.1, 0.08, 0.15, 0.032)];
  // torn cone collar
  const cone = mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.3, 18, 1, true, 0.4, 4.2), std(0xdedede, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }), 0, 1.86, 0.36, g);
  cone.rotation.x = -Math.PI / 2 + 0.3;
  g.userData = { head, eyes, torso, kind: 'dog' };
  return g;
}

function monsterCat() {
  // long spidery crawler
  const g = new THREE.Group();
  const fur = std(0x141318), skin = std(0x3a2a30);
  const torso = mesh(new THREE.CapsuleGeometry(0.16, 1.3, 4, 12), fur, 0, 0.5, 0, g);
  torso.rotation.x = Math.PI / 2;
  for (const z of [0.55, -0.55]) {
    for (const s of [-1, 1]) {
      limb(g, fur, [s * 0.12, 0.5, z], [s * 0.42, 0.82, z + 0.12], 0.04);
      limb(g, skin, [s * 0.42, 0.82, z + 0.12], [s * 0.5, 0.02, z + 0.25], 0.03);
      claws(g, [s * 0.5, 0.04, z + 0.25], -1);
    }
  }
  for (let i = 0; i < 8; i++) sph(0.035 - i * 0.002, fur, Math.sin(i * 0.8) * 0.12, 0.55 + i * 0.07, -0.85 - i * 0.06, g);
  const head = new THREE.Group(); head.position.set(0, 0.55, 1.0); g.add(head);
  sph(0.16, fur, 0, 0, 0, head, 1.15, 1, 1);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.24, 4), fur, s * 0.11, 0.2, -0.02, head);
    ear.rotation.z = -s * 0.25;
  }
  // grin wider than the head
  box(0.36, 0.06, 0.02, MOUTH, 0, -0.06, 0.15, head);
  teeth(head, 10, 0.34, -0.04, 0.16, 0.045, true);
  teeth(head, 9, 0.3, -0.09, 0.16, 0.04, false);
  const eyes = [];
  for (const [x, y, r] of [[-0.07, 0.05, 0.03], [0.07, 0.05, 0.03], [-0.12, 0.1, 0.018], [0.12, 0.1, 0.018]]) eyes.push(eye(head, 0x9dff6a, x, y, 0.135, r));
  bandageRing(g, 0.17, 0, 0.5, 0.3, Math.PI / 2);
  g.userData = { head, eyes, torso, kind: 'cat' };
  return g;
}

function monsterRabbit() {
  const g = new THREE.Group();
  const fur = std(0xbdb6a8), skin = std(0xc08a8a);
  for (const s of [-1, 1]) {
    sph(0.16, fur, s * 0.17, 0.75, -0.05, g, 0.9, 1.3, 1.2);
    limb(g, fur, [s * 0.17, 0.62, -0.05], [s * 0.18, 0.18, -0.3], 0.06);
    box(0.1, 0.06, 0.42, fur, s * 0.18, 0.04, -0.12, g);
    claws(g, [s * 0.18, 0.06, 0.09], -1);
  }
  const torso = mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 12), fur, 0, 1.2, 0, g);
  torso.rotation.x = 0.15;
  bandageRing(g, 0.23, 0, 1.05, 0.0, 0.15);
  for (const s of [-1, 1]) {
    limb(g, fur, [s * 0.22, 1.42, 0.08], [s * 0.26, 1.05, 0.25], 0.04);
    limb(g, skin, [s * 0.26, 1.05, 0.25], [s * 0.2, 0.85, 0.32], 0.03);
    claws(g, [s * 0.2, 0.82, 0.33], -1);
  }
  const head = new THREE.Group(); head.position.set(0, 1.76, 0.08); g.add(head);
  sph(0.18, fur, 0, 0, 0, head, 1, 1.1, 1.1);
  limb(head, fur, [-0.08, 0.15, -0.03], [-0.14, 0.8, -0.12], 0.045);
  limb(head, fur, [0.08, 0.15, -0.03], [0.18, 0.55, -0.1], 0.045);
  limb(head, fur, [0.18, 0.55, -0.1], [0.42, 0.62, -0.05], 0.04); // broken ear
  box(0.14, 0.09, 0.03, MOUTH, 0, -0.09, 0.18, head);
  box(0.045, 0.13, 0.025, TOOTH, -0.025, -0.12, 0.19, head);
  box(0.045, 0.13, 0.025, TOOTH, 0.025, -0.12, 0.19, head);
  teeth(head, 5, 0.1, -0.13, 0.17, 0.035, false);
  const eyes = [eye(head, 0xff2222, -0.09, 0.05, 0.15, 0.035), eye(head, 0xff2222, 0.09, 0.05, 0.15, 0.035)];
  g.userData = { head, eyes, torso, kind: 'rabbit' };
  return g;
}

function monsterParrot() {
  const g = new THREE.Group();
  const grey = std(0x6d7076), skin = std(0xc9a6a0), red = std(0x9a1515);
  for (const s of [-1, 1]) {
    limb(g, skin, [s * 0.1, 0.4, 0], [s * 0.12, 0.05, 0.05], 0.025);
    claws(g, [s * 0.12, 0.06, 0.08], -1);
  }
  const torso = sph(0.3, grey, 0, 0.75, 0, g, 1, 1.4, 0.9);
  sph(0.18, skin, 0, 0.72, 0.18, g, 1, 1.6, 0.5);
  for (let i = 0; i < 5; i++) {
    const t = box(0.07, 0.6, 0.02, red, (i - 2) * 0.06, 0.25, -0.3, g);
    t.rotation.x = 0.5; t.rotation.z = (i - 2) * 0.12;
  }
  // ragged wings spread wide
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const f = box(0.09, 0.6 - i * 0.04, 0.02, i % 3 === 1 ? skin : grey, s * (0.32 + i * 0.12), 1.0 - i * 0.03, -0.05, g);
      f.rotation.z = s * (0.9 + i * 0.12);
    }
  }
  const head = new THREE.Group(); head.position.set(0, 1.28, 0.1); g.add(head);
  sph(0.18, grey, 0, 0, 0, head);
  const up = mesh(new THREE.ConeGeometry(0.09, 0.26, 8), BLACK, 0, 0.02, 0.22, head);
  up.rotation.x = Math.PI / 2 + 0.5;
  const lo = mesh(new THREE.ConeGeometry(0.07, 0.16, 8), BLACK, 0, -0.12, 0.18, head);
  lo.rotation.x = Math.PI / 2 - 0.5;
  box(0.1, 0.1, 0.05, MOUTH, 0, -0.05, 0.16, head);
  const eyes = [eye(head, 0xffa020, -0.11, 0.06, 0.12, 0.035), eye(head, 0xffa020, 0.11, 0.06, 0.12, 0.035), eye(head, 0xffa020, 0, 0.14, 0.14, 0.02)];
  g.userData = { head, eyes, torso, kind: 'parrot' };
  return g;
}

function monsterStray() {
  // tall, emaciated, faceless. No eyes means you only see it with a light on.
  const g = new THREE.Group();
  const fur = std(0x3a3430), skin = std(0x75655a);
  const torso = hunchedBody(g, fur, skin, 1.18);
  for (let i = 0; i < 3; i++) {
    const strip = box(0.05, 0.5, 0.01, BANDAGE, -0.15 + i * 0.15, 1.2 - i * 0.1, 0.38, g);
    strip.rotation.z = 0.2 - i * 0.2;
  }
  const head = new THREE.Group(); head.position.set(0, 2.26, 0.55); g.add(head);
  sph(0.17, skin, 0, 0, 0.05, head, 0.9, 1.1, 1.8);
  // vertical mouth splitting the face
  box(0.04, 0.3, 0.05, MOUTH, 0, -0.02, 0.33, head);
  for (let i = 0; i < 6; i++) {
    const y = -0.14 + i * 0.055;
    for (const s of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(0.012, 0.05, 4), TOOTH, s * 0.03, y, 0.34, head);
      t.rotation.z = s * Math.PI / 2;
    }
  }
  g.userData = { head, eyes: [], torso, kind: 'stray' };
  return g;
}

export const buildCalm = { biscuit: calmDog, mittens: calmCat, hoppy: calmRabbit, pepper: calmParrot };
export const buildMonster = { biscuit: monsterDog, mittens: monsterCat, hoppy: monsterRabbit, pepper: monsterParrot, stray: monsterStray };
