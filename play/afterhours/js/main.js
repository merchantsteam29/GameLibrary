import * as THREE from 'three';
import { buildOffice, buildCams, CAM_LIST, CAM_NAMES } from './world.js';
import { buildMonster } from './models.js';
import { initAudio, sfx, loop, allLoopsOff, setVolume } from './audio.js';
import { CREATURES, PATIENTS, ALL, NIGHT_LEVELS, VIALS, CALLS, FAKE_LINES, ENDING } from './data.js';

const $ = (id) => document.getElementById(id);
const TEST = new URLSearchParams(location.search).has('test');
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ save
const SAVE_KEY = 'willowmere_after_hours_v1';
let save = { night: 1, beat: false, stars: 0, volume: 0.8, custom: { biscuit: 10, mittens: 10, hoppy: 10, pepper: 10, stray: 10 } };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { /* fresh save */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage blocked */ } };
setVolume(save.volume);

// ------------------------------------------------------------------ renderer & scenes
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const office = buildOffice();
const W = buildCams();
const monsters = {};
for (const id of ALL) { monsters[id] = buildMonster[id](); monsters[id].visible = false; }
const jumpLight = new THREE.PointLight(0xff9a80, 0, 4, 1); office.scene.add(jumpLight);

const rt = new THREE.WebGLRenderTarget(960, 540);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, time: { value: 0 }, stat: { value: 0 }, lost: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, stat, lost; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float row = floor(uv.y * 220.0);
      uv.x += (rnd(vec2(row, floor(time * 24.0))) - 0.5) * 0.004 * (1.0 + stat * 8.0);
      vec3 c;
      c.r = texture2D(tDiffuse, uv + vec2(0.0018, 0.0)).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - vec2(0.0018, 0.0)).b;
      float l = dot(c, vec3(0.3, 0.59, 0.11));
      c = mix(c, vec3(l), 0.5) * vec3(0.86, 1.04, 0.9);
      c = pow(max(c, 0.0), vec3(0.75)) * 1.35;
      float n = rnd(uv * vec2(700.0, 400.0) + fract(time) * 37.0);
      c += (n - 0.5) * (0.09 + stat * 0.6);
      c = mix(c, vec3(n * 0.8), clamp(stat * 0.7, 0.0, 0.85));
      c *= 0.9 + 0.1 * sin(vUv.y * 800.0 + time * 6.0);
      float band = smoothstep(0.0, 0.02, abs(fract(vUv.y - time * 0.15) - 0.5)); c *= 0.94 + 0.06 * band;
      vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 1.4;
      c = mix(c, vec3(n * 0.55), lost);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  office.camera.aspect = w / h; office.camera.updateProjectionMatrix();
  for (const id of CAM_LIST) { const c = W.sets[id].camera; c.aspect = w / h; c.updateProjectionMatrix(); }
  rt.setSize(Math.round(w * 0.7), Math.round(h * 0.7));
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ game state
const HOUR = TEST ? 50 : 50; // seconds per in-game hour
let G = null;
let mode = 'menu'; // menu | intro | play | dying | over | won | ending
let paused = false;
let yaw = 0, mouseX = 0;
let clockT = 0;
let aiFrozen = false; // test hook only

function newCreature(id, level) {
  const def = CREATURES[id];
  return {
    id, def, level, base: level,
    state: level <= 0 ? 'absent' : def.notPatient ? 'stray' : 'patient',
    stress: G.night === 1 ? rand(30, 45) : rand(15, 40),
    loc: def.room, pathIdx: 0, path: def.path || def.paths?.[0],
    moveT: rand(0, 3), atDoorT: 0, feedCD: 0, sootheCD: 0, stage: 0, perchT: 0, turnedT: 0, stareT: 0, runT: 0, fakeT: 6,
  };
}

function startNight(night, levels) {
  const lv = levels || NIGHT_LEVELS[night];
  G = {
    night, t: 0, power: 100, doors: { L: false, R: false, V: false }, lights: { L: false, R: false },
    camsUp: false, cam: '1A', camStatic: 0, camLost: 0, medOpen: false, syringe: null,
    med: { tab: null, fill: [], busy: 0, pending: null },
    recipes: {}, cr: {}, hour: 0, powerOut: false, outT: 0, outKiller: null,
    phone: { state: 'idle', call: null, ringT: 0, line: 0, lineT: 0, spoken: false, est: 3 },
    calls: (CALLS[night] || []).map((c) => ({ ...c, done: false })), fakeQueued: false,
    flicker: 0, flickerT: rand(5, 15), toasts: {}, jump: null, killer: null, levels: lv,
    lastHour: 0, seen2B: 0,
  };
  for (const id of ALL) G.cr[id] = newCreature(id, lv[id] || 0);
  for (const id of PATIENTS) G.recipes[id] = [pick('ABG'), pick('ABG'), pick('ABG')].sort();
  G.med.tab = PATIENTS.find((id) => G.cr[id].level > 0) || 'biscuit';
  yaw = 0;
  hideAll(); $('hud').classList.remove('hidden');
  buildMedTabs();
  showIntro();
}

function showIntro() {
  mode = 'intro';
  $('intro').innerHTML = `<div class="introTime">12:00 AM</div><div class="introNight">${G.night === 6 ? 'CUSTOM NIGHT' : 'NIGHT ' + G.night}</div>`;
  $('intro').classList.remove('hidden');
  setTimeout(() => { if (mode === 'intro') { $('intro').classList.add('hidden'); mode = 'play'; } }, TEST ? 200 : 3200);
}

// ------------------------------------------------------------------ helpers
const active = (id) => G.cr[id].level > 0;
const p = (c) => 0.25 + c.level * 0.035;
const isOffice = (loc) => loc === 'LD' || loc === 'RD' || loc === 'VENT';
const viewing = (loc) => G.camsUp && G.camLost <= 0 && G.cam === loc;
const doorPan = { LD: -1, RD: 1, VENT: 0.3, '5A': -0.6, '5B': 0.6, '6': 0.25, '4': 0, '1A': -0.5, '1B': -0.4, '2A': 0.5, '2B': 0.5, '3': 0 };

let toastTimer = 0;
function toast(msg, cls = '') {
  const t = $('toast'); t.textContent = msg; t.className = 'show ' + cls; toastTimer = 3.2;
}
function onceToast(key, msg, cls) { if (G.toasts[key]) return; G.toasts[key] = 1; toast(msg, cls); }

function moved(c, from, to) {
  if (viewing(from) || viewing(to)) { G.camStatic = 1.2; sfx.camSwitch(); }
  const pan = doorPan[to] ?? 0;
  if (to === '5A' || to === '5B') { sfx.step(pan, 0.25); setTimeout(() => sfx.step(pan, 0.3), 380); }
  if (to === 'LD' || to === 'RD') { if (c.id !== 'stray') for (let i = 0; i < 3; i++) setTimeout(() => sfx.step(pan, 0.55), i * 330); }
  if (to === '6') sfx.step(0.25, 0.15);
  if (to === 'VENT') sfx.clang(0.3);
}

function turn(c) {
  c.stress = 100;
  const pan = doorPan[c.def.room] ?? 0;
  sfx.clang(pan); sfx.growl(c.def.kind, pan); sfx.sting();
  if (c.id === 'hoppy') { c.state = 'hoppy'; c.stage = 0; c.moveT = 0; c.loc = '2B'; }
  else if (c.id === 'pepper') { c.state = 'perch'; c.turnedT = 0; c.perchT = 0; c.stareT = 0; c.fakeT = 4; c.loc = pick(perchCams()); }
  else { c.state = 'hunt'; c.pathIdx = 0; c.loc = c.path[0]; c.moveT = 0; }
  if (viewing(c.def.room)) G.camStatic = 1.2;
  onceToast('turn', 'You hear a cage door crash open somewhere...', 'warn');
}
function perchCams() { return ['1A', '1B', '2A', '2B', '3', '4', '5A', '5B'].filter((x) => x !== G.cr.pepper.loc); }

function retreat(c) {
  if (c.id === 'stray') { c.loc = '3'; c.pathIdx = 0; c.path = pick(c.def.paths); c.moveT = 0; return; }
  c.state = 'patient'; c.loc = c.def.room; c.stress = 45; c.pathIdx = 0; c.stage = 0;
}

function resolveDoor(c) {
  const door = c.loc === 'LD' ? 'L' : c.loc === 'RD' ? 'R' : 'V';
  if (G.doors[door] && !G.powerOut) {
    sfx.bang(doorPan[c.loc]);
    if (c.id === 'hoppy') G.power = Math.max(0, G.power - 2);
    retreat(c);
  } else kill(c);
}

// ------------------------------------------------------------------ AI
function updateCreature(c, dt) {
  if (c.state === 'absent') return;
  // patient care
  if (c.state === 'patient') {
    c.feedCD = Math.max(0, c.feedCD - dt); c.sootheCD = Math.max(0, c.sootheCD - dt);
    let rate = 0.15 + c.level * 0.04;
    if (c.id === 'pepper' && viewing('2A')) rate = -2.2;
    c.stress = clamp(c.stress + rate * dt, 0, 100);
    if (c.stress >= 100) turn(c);
    return;
  }
  c.feedCD = Math.max(0, c.feedCD - dt); c.sootheCD = Math.max(0, c.sootheCD - dt);
  const interval = Math.max(3, 5 - c.level * 0.1);

  if (c.state === 'hunt' || c.state === 'stray') {
    if (isOffice(c.loc)) {
      c.atDoorT -= dt;
      if (c.atDoorT <= 0) resolveDoor(c);
      return;
    }
    const stray = c.state === 'stray';
    if (stray && G.t < 25) return; // grace period at the start of the night
    c.moveT += dt;
    if (c.moveT < (stray ? Math.max(5, 9 - c.level * 0.2) : interval)) return;
    c.moveT = 0;
    if (stray && viewing(c.loc)) return; // frozen while watched
    if (Math.random() > (stray ? 0.15 + c.level * 0.025 : p(c))) return;
    const from = c.loc;
    c.pathIdx = Math.min(c.path.length - 1, c.pathIdx + 1);
    c.loc = c.path[c.pathIdx];
    if (isOffice(c.loc)) c.atDoorT = Math.max(3.5, 8 - c.level * 0.25);
    moved(c, from, c.loc);
    return;
  }

  if (c.state === 'hoppy') {
    if (c.loc === '2B') {
      if (viewing('2B')) { c.moveT = 0; return; }
      c.moveT += dt;
      if (c.moveT < Math.max(2.8, 4.5 - c.level * 0.1)) return;
      c.moveT = 0;
      if (Math.random() > p(c)) return;
      c.stage++;
      if (viewing('2B')) G.camStatic = 1;
      if (c.stage >= 3) { c.loc = '5B'; c.runT = 2.0; sfx.thumps(0.8); if (viewing('5B')) G.camStatic = 0.6; }
    } else if (c.loc === '5B') {
      c.runT -= dt;
      if (c.runT <= 0) { c.loc = 'RD'; c.atDoorT = 0.9; }
    } else if (c.loc === 'RD') {
      c.atDoorT -= dt;
      if (c.atDoorT <= 0) resolveDoor(c);
    }
    return;
  }

  if (c.state === 'perch') {
    c.turnedT += dt; c.perchT += dt; c.fakeT -= dt;
    if (c.fakeT <= 0) { G.fakeQueued = true; c.fakeT = rand(16, 24); }
    if (viewing(c.loc)) {
      c.stareT += dt;
      if (c.stareT > 1.4) { screech(c); return; }
    } else c.stareT = Math.max(0, c.stareT - dt * 2);
    if (c.perchT > 9) { const from = c.loc; c.loc = pick(perchCams()); c.perchT = 0; if (viewing(from) || viewing(c.loc)) G.camStatic = 1; }
    if (c.turnedT > 55) { c.state = 'patient'; c.loc = c.def.room; c.stress = 60; }
  }
}

function screech(c) {
  sfx.screech();
  G.camLost = 8; G.power = Math.max(0, G.power - 3);
  for (const id of PATIENTS) { const o = G.cr[id]; if (o !== c && o.state === 'patient') o.stress = clamp(o.stress + 10, 0, 100); }
  c.state = 'patient'; c.loc = c.def.room; c.stress = 55;
  $('flash').className = 'white'; setTimeout(() => ($('flash').className = ''), 120);
  shake = 0.5;
  setTimeout(() => { if (G.camsUp) lowerCams(); }, 300);
  toast('Pepper screamed — cameras offline!', 'warn');
}

// ------------------------------------------------------------------ player actions
function canAct() { return mode === 'play' && !paused && !G.powerOut; }
function toggleDoor(k) {
  if (!canAct()) return;
  if (G.camsUp || G.medOpen) { onceToast('lowerFirst', 'Lower the monitor first'); return; }
  G.doors[k] = !G.doors[k];
  sfx.door(k === 'L' ? -0.9 : k === 'R' ? 0.9 : 0.3);
}
function toggleLight(k) {
  if (!canAct()) return;
  if (G.camsUp || G.medOpen) return;
  G.lights[k] = !G.lights[k];
  sfx.light();
}
function raiseCams() {
  if (!canAct() || G.camsUp) return;
  if (G.camLost > 0) { toast(`Cameras rebooting... ${Math.ceil(G.camLost)}s`); return; }
  closeMeds();
  G.camsUp = true; G.camStatic = 0.8; G.lights.L = G.lights.R = false;
  sfx.camUp();
  $('camUI').classList.remove('hidden');
  updateCamUI(true);
}
function lowerCams() {
  if (!G || !G.camsUp) return;
  G.camsUp = false; sfx.camDown();
  $('camUI').classList.add('hidden');
}
function selectCam(id) {
  if (!G.camsUp || G.cam === id) return;
  G.cam = id; G.camStatic = 0.7; sfx.camSwitch();
  updateCamUI(true);
}
function openMeds() {
  if (!canAct() || G.medOpen) return;
  lowerCams(); G.lights.L = G.lights.R = false;
  G.medOpen = true; $('medUI').classList.remove('hidden'); renderMed();
}
function closeMeds() { if (!G || !G.medOpen) return; G.medOpen = false; $('medUI').classList.add('hidden'); }

function camPatient() { return PATIENTS.map((id) => G.cr[id]).find((c) => c.def.room === G.cam && c.level > 0); }
function feed() {
  const c = camPatient(); if (!c || c.state !== 'patient' || c.feedCD > 0 || G.camLost > 0) return;
  c.stress = clamp(c.stress - (c.id === 'hoppy' ? 45 : 25), 0, 100); c.feedCD = 35; sfx.kibble();
  updateCamUI(true);
}
function soothe() {
  const c = camPatient(); if (!c || c.state !== 'patient' || c.sootheCD > 0 || G.camLost > 0) return;
  c.sootheCD = 20; G.power = Math.max(0, G.power - 1); sfx.lullaby();
  if (c.id === 'mittens') { c.stress = clamp(c.stress + 14, 0, 100); toast('Mittens HATES the music!', 'warn'); sfx.growl('cat', -0.3); }
  else c.stress = clamp(c.stress - (c.id === 'biscuit' ? 32 : 15), 0, 100);
  updateCamUI(true);
}
function dose() {
  const c = camPatient(); if (!c || c.state !== 'patient' || G.camLost > 0) return;
  if (!G.syringe) { toast('No syringe loaded — mix one at the med tray [M]'); return; }
  if (G.syringe.patient !== c.id) { toast(`That syringe is labelled for ${CREATURES[G.syringe.patient].name}`); return; }
  const ok = G.syringe.fill.slice().sort().join('') === G.recipes[c.id].join('');
  G.syringe = null; sfx.dose();
  if (ok) { c.stress = clamp(c.stress - 55, 0, 100); sfx.good(); toast(`${c.def.name} received the correct dose`, 'good'); }
  else { c.stress = clamp(c.stress + 20, 0, 100); sfx.wrong(); toast(`Wrong dose! ${c.def.name} is agitated`, 'warn'); }
  updateCamUI(true);
}

// ------------------------------------------------------------------ phone
let voices = [];
const loadVoices = () => { voices = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en/i.test(v.lang)); };
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function phoneRing(call) {
  G.phone = { state: 'ringing', call, ringT: 0, line: 0, lineT: 0, spoken: false, est: 3, nextRing: 0 };
}
function answerPhone() {
  if (!G || mode !== 'play') return;
  const ph = G.phone;
  if (ph.state === 'talk') { hangUp(); return; }
  if (ph.state !== 'ringing') return;
  ph.state = 'talk'; sfx.pickup();
  if (ph.call.fake) {
    for (const id of PATIENTS) { const o = G.cr[id]; if (o.state === 'patient') o.stress = clamp(o.stress + 12, 0, 100); }
    toast('That wasn\'t a person...', 'warn');
  }
  sayLine();
}
function sayLine() {
  const ph = G.phone; const line = ph.call.lines[ph.line];
  ph.lineT = 0; ph.spoken = false; ph.est = Math.max(2.2, line.split(' ').length * 0.42);
  $('subs').textContent = line; $('subs').className = 'show' + (ph.call.fake ? ' fake' : '');
  if (window.speechSynthesis && !TEST) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    const v = voices[ph.call.voiceIdx ?? 0] || voices[0]; if (v) u.voice = v;
    u.pitch = ph.call.pitch ?? 1; u.rate = ph.call.rate ?? 1; u.volume = save.volume;
    u.onend = () => { if (G && G.phone === ph) ph.spoken = true; };
    speechSynthesis.speak(u);
  } else ph.spoken = false;
}
function hangUp() {
  if (!G) return;
  if (G.phone.call) G.phone.call.done = true;
  if (G.phone.state === 'talk') sfx.hangup();
  G.phone = { state: 'idle', call: null };
  window.speechSynthesis?.cancel();
  $('subs').className = '';
}
function updatePhone(dt) {
  const ph = G.phone;
  if (ph.state === 'idle') {
    const due = G.calls.find((c) => !c.done && G.t >= c.at);
    if (due) { due.voiceIdx = due.from.startsWith('Dr.') ? 0 : 1; phoneRing(due); }
    else if (G.fakeQueued) { G.fakeQueued = false; phoneRing({ from: 'UNKNOWN', fake: true, pitch: 1.9, rate: 0.75, lines: pick(FAKE_LINES), voiceIdx: 2 }); }
  } else if (ph.state === 'ringing') {
    ph.ringT += dt; ph.nextRing -= dt;
    if (ph.nextRing <= 0) { sfx.ring(); ph.nextRing = 3; }
    if (ph.ringT > 13) { hangUp(); }
  } else if (ph.state === 'talk') {
    ph.lineT += dt;
    if (ph.spoken || ph.lineT > (window.speechSynthesis && !TEST ? ph.est * 2.5 : ph.est)) {
      ph.line++;
      if (ph.line >= ph.call.lines.length) hangUp(); else sayLine();
    }
  }
}

// ------------------------------------------------------------------ death / win
let shake = 0;
function kill(c) {
  if (mode !== 'play') return;
  mode = 'dying'; G.killer = c.id;
  lowerCams(); closeMeds(); hangUp(); allLoopsOff();
  const m = monsters[c.id];
  office.scene.add(m); m.visible = true; m.scale.setScalar(1);
  G.jump = { t: 0, m };
  if (c.id === 'mittens') yaw = -0.3;
  sfx.scream(); shake = 1.4;
  $('hud').classList.add('hidden');
}
function updateJump(dt) {
  const J = G.jump; J.t += dt;
  const cam = office.camera;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const k = Math.min(1, J.t / 0.2); const e = 1 - Math.pow(1 - k, 3);
  const near = { dog: 0.95, cat: 0.62, rabbit: 0.62, parrot: 0.7, stray: 0.78 }[J.m.userData.kind] || 0.75;
  const dist = 2.2 - e * (2.2 - near);
  const m = J.m;
  m.position.set(0, 0, 0); m.rotation.set(0, yaw, 0);
  m.updateMatrixWorld(true);
  const hp = new THREE.Vector3(); m.userData.head.getWorldPosition(hp);
  const target = cam.position.clone().addScaledVector(fwd, dist); target.y -= 0.08;
  m.position.copy(target.sub(hp));
  m.userData.head.rotation.z = Math.sin(J.t * 40) * 0.12;
  m.userData.head.rotation.x = -0.35 + Math.sin(J.t * 33) * 0.08; // chin up so the open jaw fills the view
  jumpLight.intensity = Math.random() < 0.25 ? 0.3 : 2 + Math.random() * 2.5;
  jumpLight.position.copy(cam.position).addScaledVector(fwd, 0.25); jumpLight.position.y += 0.4;
  office.lamp.intensity = Math.random() < 0.5 ? 0 : 4;
  if (J.t > 1.4) {
    jumpLight.intensity = 0; m.visible = false;
    showGameOver();
  }
}
function showGameOver() {
  mode = 'over';
  const c = CREATURES[G.killer];
  $('over').innerHTML = `<div class="static"></div><div class="overBox"><h1>YOU DIDN'T MAKE IT</h1><p class="overLine">${c.death}</p>
    <p class="overSub">${G.night === 6 ? 'Custom Night' : 'Night ' + G.night} · ${hourLabel()}</p>
    <div class="btnRow"><button data-act="retry">TRY AGAIN</button><button data-act="menu">MAIN MENU</button></div></div>`;
  $('over').classList.remove('hidden');
}
function hourLabel() { return G.hour === 0 ? '12 AM' : G.hour + ' AM'; }

function win() {
  mode = 'won'; lowerCams(); closeMeds(); hangUp(); allLoopsOff();
  sfx.chime();
  $('hud').classList.add('hidden');
  let extra = '';
  if (G.night < 5) { save.night = Math.max(save.night, G.night + 1); }
  else if (G.night === 5) { save.beat = true; save.night = 5; }
  else if (G.night === 6) {
    const lv = G.levels; const all20 = ALL.every((id) => lv[id] >= 20);
    save.stars = Math.max(save.stars, all20 ? 3 : 2);
    if (all20) extra = '<p class="overSub">20/20/20/20/20 — you absolute legend.</p>';
  }
  persist();
  $('win').innerHTML = `<div class="winClock"><span class="roll"><span>5</span><span>6</span></span>:00 AM</div>${extra}
    <div class="btnRow delayed"><button data-act="${G.night === 5 ? 'ending' : G.night === 6 ? 'menu' : 'next'}">${G.night === 5 ? 'CONTINUE' : G.night === 6 ? 'MAIN MENU' : 'NEXT NIGHT'}</button>${G.night < 5 ? '<button data-act="menu">MAIN MENU</button>' : ''}</div>`;
  $('win').classList.remove('hidden');
}
function showEnding() {
  mode = 'ending'; hideAll();
  $('ending').innerHTML = `<div class="endText">${ENDING.map((l, i) => `<p style="animation-delay:${i * 2.2}s">${l}</p>`).join('')}
    <p class="endPay" style="animation-delay:${ENDING.length * 2.2}s">PAYCHECK: $211.40<br><span>CUSTOM NIGHT UNLOCKED</span></p></div>
    <div class="btnRow delayedLong"><button data-act="menu">MAIN MENU</button></div>`;
  $('ending').classList.remove('hidden');
}

// ------------------------------------------------------------------ main update
function updatePlay(dt) {
  G.t += dt;
  G.hour = Math.min(6, Math.floor(G.t / HOUR));
  if (G.hour !== G.lastHour) {
    G.lastHour = G.hour;
    if (G.hour === 2 || G.hour === 4) for (const id of ALL) { const c = G.cr[id]; if (c.level > 0 && G.night !== 6) c.level += 1; }
  }
  if (G.t >= HOUR * 6) { win(); return; }

  // power
  if (!G.powerOut) {
    const use = usage();
    G.power -= (0.075 + (use - 1) * 0.16) * dt;
    if (G.power <= 0) powerOut();
  } else {
    G.outT -= dt;
    if (G.outT <= 0) { kill(G.cr[G.outKiller]); return; }
  }

  G.camLost = Math.max(0, G.camLost - dt);
  G.camStatic = Math.max(0, G.camStatic - dt * 1.6);

  if (!aiFrozen) for (const id of ALL) { updateCreature(G.cr[id], dt); if (mode !== 'play') return; }
  updatePhone(dt);

  // med mixing
  if (G.med.busy > 0) {
    G.med.busy -= dt;
    if (G.med.busy <= 0 && G.med.pending) { G.med.fill.push(G.med.pending); G.med.pending = null; if (G.medOpen) renderMed(); }
  }

  // office flicker
  G.flickerT -= dt;
  if (G.flickerT <= 0) { G.flicker = rand(0.15, 0.6); G.flickerT = rand(6, 18) * (G.power < 15 ? 0.3 : 1); }
  G.flicker = Math.max(0, G.flicker - dt);

  // ambient audio
  const b = G.cr.biscuit, m = G.cr.mittens;
  loop('hum', G.powerOut ? 0 : 1);
  loop('fan', G.powerOut ? 0 : 1);
  loop('static', G.camsUp ? 0.5 + G.camStatic + (G.camLost > 0 ? 1 : 0) : 0);
  loop('buzz', (G.lights.L ? 1 : 0) + (G.lights.R ? 1 : 0));
  loop('breathL', b.loc === 'LD' && b.state === 'hunt' ? 1 : 0);
  loop('breathR', G.cr.hoppy.loc === 'RD' ? 1 : 0);
  loop('purr', m.state === 'hunt' ? (m.loc === 'VENT' ? 1 : m.loc === '6' ? 0.25 : 0) : 0);
  loop('flatline', G.powerOut && G.outT < 4 ? 1 : 0);
  if (Math.random() < dt * 0.02) sfx.whisper();
}

function usage() {
  if (G.powerOut) return 0;
  return 1 + (G.doors.L ? 1 : 0) + (G.doors.R ? 1 : 0) + (G.doors.V ? 1 : 0) + (G.lights.L ? 0.7 : 0) + (G.lights.R ? 0.7 : 0) + (G.camsUp ? 0.5 : 0);
}

function powerOut() {
  G.power = 0; G.powerOut = true;
  lowerCams(); closeMeds();
  G.doors.L = G.doors.R = G.doors.V = false; G.lights.L = G.lights.R = false;
  sfx.powerDown(); sfx.door(-0.9); sfx.door(0.9);
  const order = ['stray', 'biscuit', 'hoppy', 'mittens'].filter((id) => G.cr[id].level > 0);
  G.outKiller = order[0] || 'biscuit';
  G.outT = rand(7, 14);
  toast('POWER FAILURE', 'warn');
}

// ------------------------------------------------------------------ visuals
const tmpV = new THREE.Vector3();
function spotFor(c) {
  const loc = c.loc;
  if (loc === 'LD' || loc === 'RD') return office.spots[loc + '_' + c.id] || office.spots[loc];
  if (loc === 'VENT') return office.spots.VENT;
  const set = W.sets[loc]; if (!set) return null;
  if (c.id === 'hoppy' && loc === '2B') return set.spots['hop' + Math.min(2, c.stage)];
  return set.spots[c.id];
}
function sceneFor(loc) { return isOffice(loc) ? office.scene : W.sets[loc]?.scene; }

function place(m, scene, spot, set) {
  if (m.parent !== scene) scene.add(m);
  m.visible = true;
  m.position.set(...spot.p);
  m.scale.setScalar(spot.s || 1);
  if (spot.r !== undefined) m.rotation.y = spot.r;
  else if (set) { const cp = set.camera.position; m.rotation.y = Math.atan2(cp.x - spot.p[0], cp.z - spot.p[2]); }
}

function syncCreatures(time) {
  for (const id of ALL) {
    const c = G.cr[id], m = monsters[id], calm = W.calm[id];
    if (calm) calm.visible = c.level > 0 && c.state === 'patient';
    const door = W.cages[id];
    if (door && door.isGroup && door.children.length && id !== 'hoppy') {
      const target = c.level > 0 && c.state !== 'patient' ? -1.7 : 0;
      door.rotation.y += (target - door.rotation.y) * 0.2;
    }
    if (id === 'mittens' && W.cages.mittensVent) W.cages.mittensVent.visible = c.state === 'patient' || c.level <= 0;
    let show = c.level > 0 && c.state !== 'patient' && c.state !== 'absent';
    if (mode === 'dying' && G.killer === id) continue;
    if (G.powerOut && G.outKiller === id && G.outT < 6) {
      const loc = id === 'mittens' ? 'VENT' : id === 'hoppy' ? 'RD' : 'LD';
      place(m, office.scene, office.spots[loc], null);
      continue;
    }
    if (show) {
      const sp = spotFor(c), sc = sceneFor(c.loc);
      if (sp && sc) place(m, sc, sp, W.sets[c.loc]); else show = false;
    }
    if (!show) m.visible = false;
    if (m.visible) {
      const h = m.userData.head;
      h.rotation.z = Math.sin(time * 0.7 + id.length) * 0.08 + (Math.random() < 0.01 ? (Math.random() - 0.5) * 0.6 : 0);
      h.rotation.x = id === 'stray' && c.loc === '3' ? -0.3 : 0;
    }
  }
  for (const id of PATIENTS) {
    const calm = W.calm[id]; if (!calm || !calm.visible) continue;
    const b = calm.userData.breathe; b.userData.base ??= b.scale.y;
    b.scale.y = b.userData.base * (1 + Math.sin(time * 2.2 + id.length) * 0.05 * (1 + G.cr[id].stress / 50));
  }
}

function updateOffice(dt, time) {
  const o = office;
  for (const k of ['L', 'R', 'V']) {
    const d = o.doors[k];
    const target = G && G.doors[k] ? d.shut : d.open;
    d.y += (target - d.y) * Math.min(1, dt * 14);
    d.obj.position.y = d.y;
  }
  const out = G && G.powerOut;
  for (const k of ['L', 'R']) {
    const on = G && G.lights[k] && !out;
    const hl = o.hallLights[k];
    hl.light.intensity = on ? (14 + Math.random() * 2) : 0;
    hl.bulb.material.color.setHex(on ? 0xfff6d0 : 0x222218);
    o.buttons[k].door.material.color.setHex(G && G.doors[k] ? 0xff2a1a : 0x4a0a0a);
    o.buttons[k].light.material.color.setHex(on ? 0xffffff : 0x3a3a3a);
  }
  o.ventBtn.material.color.setHex(G && G.doors.V ? 0xffdd22 : 0x554400);
  const flick = G ? G.flicker > 0 && Math.random() < 0.5 : Math.random() < 0.01;
  let lamp = out ? 0 : flick ? 0.4 : 3.2;
  if (G && G.power < 10 && !out) lamp *= 0.6 + Math.random() * 0.4;
  o.lamp.intensity = lamp; o.lamp2.intensity = out ? 0 : lamp * 0.25;
  o.lampPanel.material.color.setHex(lamp > 1 ? 0xdfe8d6 : lamp > 0 ? 0x666a60 : 0x111111);
  o.monLight.intensity = out ? 0 : 0.5 + Math.random() * 0.1;
  o.screenMat.color.setHex(out ? 0x050505 : (Math.random() < 0.05 ? 0x284a36 : 0x1c3326));
  o.amb.intensity = out ? 0.015 : 0.06;
  o.blades.rotation.z += dt * (out ? 0 : 18);
  const ringing = G && G.phone.state === 'ringing';
  o.phoneLight.material.color.setHex(ringing && Math.sin(time * 12) > 0 ? 0xff2020 : G && G.phone.state === 'talk' ? 0x20ff40 : 0x330000);
}

function updateCamRooms(time) {
  CAM_LIST.forEach((id, i) => {
    const set = W.sets[id];
    const cam = set.camera; const t = cam.userData.target;
    const a = Math.sin(time * 0.22 + i * 1.7) * 0.18;
    tmpV.copy(t).sub(cam.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(cam.position);
    cam.lookAt(tmpV);
    if (set.lamps) set.lamps.forEach((l, j) => { const f = Math.random() < (j ? 0.08 : 0.02); l.light.intensity = f ? 0.05 : l.base; l.panel.material.color.setHex(f ? 0x222222 : 0xe0e8d0); });
    if (set.red) set.red.intensity = 1.6 + Math.sin(time * 3) * 0.5;
  });
}

// ------------------------------------------------------------------ HUD / UI
function updateHUD() {
  $('nightLbl').textContent = G.night === 6 ? 'CUSTOM NIGHT' : 'NIGHT ' + G.night;
  $('timeLbl').textContent = hourLabel();
  $('powerPct').textContent = Math.max(0, Math.ceil(G.power));
  const u = Math.round(usage());
  $('usage').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < u ? (i >= 3 ? 'hot' : 'on') : ''}"></i>`).join('');
  $('power').classList.toggle('low', G.power < 20);
  const sy = $('syringe');
  if (G.syringe) { sy.classList.remove('hidden'); sy.innerHTML = `💉 Syringe: <b>${CREATURES[G.syringe.patient].name}</b> ${G.syringe.fill.map((k) => `<i style="background:${VIALS[k].color}"></i>`).join('')}`; }
  else sy.classList.add('hidden');
  const ph = G.phone, pb = $('phoneBox');
  if (ph.state === 'ringing') { pb.className = 'ring'; pb.innerHTML = `☎ INCOMING CALL<br><b>${ph.call.from}</b><br><span>[P] answer</span>`; }
  else if (ph.state === 'talk') { pb.className = 'talk'; pb.innerHTML = `☎ ${ph.call.from}<br><span>[P] hang up</span>`; }
  else pb.className = 'hidden';
  $('stateL').className = 'st' + (G.doors.L ? ' on' : '') + (G.lights.L ? ' lit' : '');
  $('stateR').className = 'st' + (G.doors.R ? ' on' : '') + (G.lights.R ? ' lit' : '');
  $('stateV').className = 'st' + (G.doors.V ? ' on' : '');
  $('hud').classList.toggle('cams', G.camsUp);
  $('camBar').classList.toggle('hidden', G.camsUp || G.powerOut);
  $('medBar').classList.toggle('hidden', G.camsUp || G.powerOut);
}

const MAP_POS = { '1A': [4, 6], '1B': [4, 32], '3': [39, 4], '4': [39, 30], '2A': [74, 6], '2B': [74, 32], '5A': [20, 58], '5B': [58, 58], '6': [3, 80] };
function buildMap() {
  const map = $('map');
  map.innerHTML = '<div class="you">YOU</div><div class="hall h1"></div><div class="hall h2"></div><div class="hall h3"></div>' +
    CAM_LIST.map((id) => `<button class="camBtn" data-cam="${id}" style="left:${MAP_POS[id][0]}%;top:${MAP_POS[id][1]}%"><b>CAM ${id}</b><span>${CAM_NAMES[id]}</span></button>`).join('');
}
buildMap();

let camUITimer = 0;
function updateCamUI(force) {
  if (!G || !G.camsUp) return;
  camUITimer -= 1 / 60;
  if (!force && camUITimer > 0) return;
  camUITimer = 0.1;
  $('camName').textContent = `CAM ${G.cam} — ${CAM_NAMES[G.cam]}`;
  $('camLost').classList.toggle('hidden', G.camLost <= 0);
  $('camLost').textContent = G.camLost > 0 ? `SIGNAL LOST — REBOOTING ${Math.ceil(G.camLost)}` : '';
  document.querySelectorAll('.camBtn').forEach((b) => b.classList.toggle('sel', b.dataset.cam === G.cam));
  $('camTime').textContent = `${hourLabel()} · PWR ${Math.ceil(G.power)}%`;
  const panel = $('patient');
  const c = camPatient();
  if (G.cam === '3' && G.cr.stray.level > 0) {
    const here = G.cr.stray.loc === '3';
    setPanel(`<h3>ISOLATION</h3><p class="sp">No chart · no owner · no name</p><p class="${here ? 'warn' : 'crit'}">${here ? 'It is standing in the corner.' : '⚠ THE CELL IS EMPTY'}</p><p class="tip">It only moves when nobody is watching.</p>`);
    panel.className = '';
    return;
  }
  if (!c) { panel.className = 'hidden'; return; }
  panel.className = '';
  if (c.state !== 'patient') {
    const msg = c.id === 'hoppy' && c.loc === '2B' ? '⚠ OUT OF PEN — KEEP WATCHING' : '⚠ PATIENT MISSING';
    setPanel(`<h3>${c.def.name}</h3><p class="sp">${c.def.species}</p><p class="crit">${msg}</p>`);
    return;
  }
  const s = Math.round(c.stress);
  const mood = s < 35 ? 'Calm' : s < 60 ? 'Uneasy' : s < 82 ? 'Agitated' : 'CRITICAL';
  const col = s < 35 ? '#5f5' : s < 60 ? '#dd4' : s < 82 ? '#f93' : '#f33';
  const hasDose = G.syringe && G.syringe.patient === c.id;
  const cd = (v) => (v > 0 ? ` (${Math.ceil(v)})` : '');
  setPanel(`<h3>${c.def.name}</h3><p class="sp">${c.def.species}</p>
    <div class="vit"><span>STRESS</span><div class="bar"><i style="width:${s}%;background:${col}"></i></div><b style="color:${col}">${s}</b></div>
    <p class="hr">♥ ${Math.round(68 + s * 1.3)} bpm · <span style="color:${col}">${mood}</span></p>
    <p class="tip">${c.def.likes}</p>
    <div class="acts">
      <button data-care="feed" ${c.feedCD > 0 ? 'disabled' : ''}>FEED [F]${cd(c.feedCD)}</button>
      <button data-care="soothe" ${c.sootheCD > 0 ? 'disabled' : ''}>MUSIC [R]${cd(c.sootheCD)}</button>
      <button data-care="dose" class="${hasDose ? 'ready' : ''}">DOSE [T]${hasDose ? ' ✓' : ''}</button>
    </div>`);
}
let lastPanel = '';
function setPanel(html) { if (html !== lastPanel) { lastPanel = html; $('patient').innerHTML = html; } }

// medication station
function buildMedTabs() {
  $('medTabs').innerHTML = PATIENTS.filter((id) => G.cr[id].level > 0).map((id) => `<button data-tab="${id}">${CREATURES[id].name}</button>`).join('');
}
function rxText(r) {
  const counts = {}; r.forEach((k) => (counts[k] = (counts[k] || 0) + 1));
  return Object.entries(counts).map(([k, n]) => `<span style="color:${VIALS[k].color}">${VIALS[k].name} ×${n}</span>`).join(' + ');
}
function renderMed() {
  const id = G.med.tab, c = G.cr[id], d = CREATURES[id];
  document.querySelectorAll('#medTabs button').forEach((b) => b.classList.toggle('sel', b.dataset.tab === id));
  $('medChart').innerHTML = `<h3>${d.name} <small>${d.species}</small></h3><p>${d.chart}</p><p class="likes">${d.likes}</p>
    <p class="rx">Rx: ${rxText(G.recipes[id])}</p>`;
  const segs = [0, 1, 2].map((i) => { const k = G.med.fill[i]; return `<i style="background:${k ? VIALS[k].color : 'transparent'}"></i>`; }).join('');
  $('syrView').innerHTML = `<div class="syr">${segs}${G.med.busy > 0 ? '<em>filling…</em>' : ''}</div>`;
  $('medLoad').disabled = G.med.fill.length < 3;
  $('medLoad').textContent = `LOAD FOR ${d.name.toUpperCase()}`;
  $('medHave').textContent = G.syringe ? `Loaded: ${CREATURES[G.syringe.patient].name}'s syringe (loading another replaces it)` : 'No syringe loaded.';
}
$('vials').innerHTML = Object.entries(VIALS).map(([k, v], i) => `<button data-vial="${k}" style="--c:${v.color}"><i></i>${v.name}<small>[${i + 1}]</small></button>`).join('');

function addVial(k) {
  if (!G.medOpen || G.med.busy > 0 || G.med.fill.length >= 3) return;
  G.med.busy = 0.45; G.med.pending = k; sfx.vial('ABG'.indexOf(k)); renderMed();
}
function loadSyringe() {
  if (G.med.fill.length < 3) return;
  G.syringe = { patient: G.med.tab, fill: G.med.fill.slice() }; G.med.fill = [];
  sfx.good(); toast(`Syringe loaded for ${CREATURES[G.syringe.patient].name} — give it on camera`, 'good');
  renderMed();
}

// ------------------------------------------------------------------ screens
function hideAll() { for (const id of ['menu', 'intro', 'over', 'win', 'ending', 'custom', 'howto', 'settings', 'pause', 'camUI', 'medUI']) $(id).classList.add('hidden'); }
function showMenu() {
  mode = 'menu'; paused = false;
  if (G) { hangUp(); }
  G = null; allLoopsOff();
  hideAll(); $('hud').classList.add('hidden'); $('subs').className = '';
  for (const id of ALL) monsters[id].visible = false;
  $('contBtn').textContent = `CONTINUE — NIGHT ${save.night}`;
  $('contBtn').classList.toggle('hidden', save.night <= 1 && !save.beat);
  $('customBtn').disabled = !save.beat;
  $('customBtn').textContent = save.beat ? 'CUSTOM NIGHT' : 'CUSTOM NIGHT 🔒';
  $('stars').textContent = '★'.repeat((save.beat ? 1 : 0) + Math.max(0, save.stars - 1));
  $('menu').classList.remove('hidden');
}
function showCustom() {
  hideAll();
  $('customList').innerHTML = ALL.map((id) => `<div class="cRow"><div class="cName">${CREATURES[id].name === '???' ? 'The Stray' : CREATURES[id].name}</div>
    <button data-cadj="${id}" data-d="-1">−</button><b id="cv_${id}">${save.custom[id]}</b><button data-cadj="${id}" data-d="1">+</button></div>`).join('');
  $('custom').classList.remove('hidden');
}
function pause(on) {
  if (mode !== 'play') return;
  paused = on;
  $('pause').classList.toggle('hidden', !on);
  if (on) { window.speechSynthesis?.pause(); allLoopsOff(); } else window.speechSynthesis?.resume();
}

document.addEventListener('click', (e) => {
  initAudio();
  const t = e.target.closest('button'); if (!t) return;
  sfx.click();
  const act = t.dataset.act;
  if (act === 'new') { save.night = 1; persist(); startNight(1); }
  else if (act === 'continue') startNight(save.night);
  else if (act === 'custom') showCustom();
  else if (act === 'startCustom') startNight(6, { ...save.custom });
  else if (act === 'howto') { hideAll(); $('howto').classList.remove('hidden'); }
  else if (act === 'settings') { hideAll(); $('vol').value = save.volume; $('settings').classList.remove('hidden'); }
  else if (act === 'menu') showMenu();
  else if (act === 'retry') startNight(G.night, G.night === 6 ? G.levels : null);
  else if (act === 'next') startNight(Math.min(5, G.night + 1));
  else if (act === 'ending') showEnding();
  else if (act === 'resume') pause(false);
  else if (act === 'quit') showMenu();
  else if (act === 'reset') { if (confirm('Erase all progress?')) { save.night = 1; save.beat = false; save.stars = 0; persist(); showMenu(); } }
  else if (t.dataset.cadj) { const id = t.dataset.cadj; save.custom[id] = clamp(save.custom[id] + Number(t.dataset.d), 0, 20); $('cv_' + id).textContent = save.custom[id]; persist(); }
  else if (t.dataset.preset) { const v = Number(t.dataset.preset); for (const id of ALL) { save.custom[id] = v; const el = $('cv_' + id); if (el) el.textContent = v; } persist(); }
  else if (t.dataset.cam) selectCam(t.dataset.cam);
  else if (t.dataset.tab) { G.med.tab = t.dataset.tab; renderMed(); }
  else if (t.dataset.vial) addVial(t.dataset.vial);
  else if (t.id === 'medEmpty') { G.med.fill = []; renderMed(); }
  else if (t.id === 'medLoad') loadSyringe();
  else if (t.id === 'medClose') closeMeds();
});
$('vol').addEventListener('input', (e) => { save.volume = Number(e.target.value); setVolume(save.volume); persist(); });
// care buttons act on pointerdown: the panel refreshes often and a click could land on a replaced button
$('patient').addEventListener('pointerdown', (e) => {
  const t = e.target.closest('button[data-care]'); if (!t || t.disabled) return;
  sfx.click(); ({ feed, soothe, dose })[t.dataset.care]();
});
// hover-to-flip bar: must leave the bar before it will flip again
let barArmed = true;
for (const id of ['camBar', 'camClose']) $(id).addEventListener('mouseleave', () => (barArmed = true));
$('camBar').addEventListener('mouseenter', () => { if (barArmed && mode === 'play' && !G.camsUp && !G.medOpen) { barArmed = false; raiseCams(); } });
$('camBar').addEventListener('click', () => { barArmed = false; raiseCams(); });
$('camClose').addEventListener('mouseenter', () => { if (barArmed && G && G.camsUp) { barArmed = false; lowerCams(); } });
$('camClose').addEventListener('click', () => { barArmed = false; lowerCams(); });
$('medBar').addEventListener('click', () => openMeds());

// ------------------------------------------------------------------ input
addEventListener('mousemove', (e) => { mouseX = (e.clientX / innerWidth) * 2 - 1; hoverPick(e); });
addEventListener('contextmenu', (e) => e.preventDefault());
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, office.camera);
  const hit = ray.intersectObjects(office.clickables, false)[0];
  return hit && hit.distance < 6 ? hit.object.userData.action : null;
}
let hoverT = 0;
function hoverPick(e) {
  if (performance.now() - hoverT < 50) return; hoverT = performance.now();
  canvas.style.cursor = mode === 'play' && G && !G.camsUp && !G.medOpen && pickAt(e) ? 'pointer' : 'default';
}
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (mode !== 'play' || paused || G.camsUp || G.medOpen) return;
  const a = pickAt(e); if (!a) return;
  if (a === 'cams') raiseCams();
  else if (a === 'meds') openMeds();
  else if (a === 'phone') answerPhone();
  else if (a === 'vent') toggleDoor('V');
  else if (a.startsWith('door')) toggleDoor(a.slice(4));
  else if (a.startsWith('light')) toggleLight(a.slice(5));
});
const keys = {};
addEventListener('keydown', (e) => {
  initAudio();
  keys[e.code] = true;
  if (e.repeat) return;
  if (mode !== 'play') { if (e.code === 'Escape' && !['menu', 'intro', 'dying'].includes(mode)) showMenu(); return; }
  if (e.code === 'Escape') { if (G.medOpen) closeMeds(); else if (G.camsUp) lowerCams(); else pause(!paused); return; }
  if (paused) return;
  const k = e.code;
  if (G.medOpen) {
    if (k === 'KeyM') closeMeds();
    else if (k === 'Digit1') addVial('A'); else if (k === 'Digit2') addVial('B'); else if (k === 'Digit3') addVial('G');
    else if (k === 'Enter' || k === 'KeyL') loadSyringe();
    else if (k === 'Backspace') { G.med.fill = []; renderMed(); }
    else if (k === 'KeyP') answerPhone();
    return;
  }
  if (k === 'Space' || k === 'KeyS') { e.preventDefault(); G.camsUp ? lowerCams() : raiseCams(); }
  else if (G.camsUp) {
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].indexOf(k);
    if (idx >= 0) selectCam(CAM_LIST[idx]);
    else if (k === 'KeyF') feed(); else if (k === 'KeyR') soothe(); else if (k === 'KeyT') dose();
    else if (k === 'KeyP') answerPhone();
    else if (['KeyQ', 'KeyE', 'KeyA', 'KeyD', 'KeyW'].includes(k)) onceToast('lowerFirst', 'Lower the monitor first');
    return;
  }
  if (k === 'KeyQ') toggleDoor('L'); else if (k === 'KeyE') toggleDoor('R'); else if (k === 'KeyW') toggleDoor('V');
  else if (k === 'KeyA') toggleLight('L'); else if (k === 'KeyD') toggleLight('R');
  else if (k === 'KeyM') openMeds(); else if (k === 'KeyP') answerPhone();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !paused) pause(true); });

// ------------------------------------------------------------------ loop
let last = performance.now();
let menuScare = 8;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  clockT += dt;
  const time = clockT;
  postMat.uniforms.time.value = time;
  toastTimer -= dt; if (toastTimer <= 0) $('toast').className = '';

  if (mode === 'play' && !paused) {
    updatePlay(dt);
    if (G && G.medOpen === false && !G.camsUp) {
      let dir = 0;
      if (Math.abs(mouseX) > 0.42) dir = Math.sign(mouseX) * (Math.abs(mouseX) - 0.42) / 0.58;
      if (keys.ArrowLeft) dir = -1; if (keys.ArrowRight) dir = 1;
      yaw = clamp(yaw - dir * 2.4 * dt, -1.12, 1.12);
    }
  } else if (mode === 'menu') {
    yaw = Math.sin(time * 0.15) * 0.75;
    menuScare -= dt;
    const m = monsters.biscuit;
    if (menuScare < 0.5 && menuScare > 0) { place(m, office.scene, office.spots.LD, null); office.hallLights.L.light.intensity = 14; }
    else if (menuScare <= 0) { m.visible = false; menuScare = rand(9, 16); }
  } else if (mode === 'dying' && G?.jump) updateJump(dt);

  if (G) syncCreatures(time);
  updateOffice(dt, time);
  if (mode === 'menu' && menuScare < 0.5 && menuScare > 0) office.hallLights.L.light.intensity = 14;

  const cam = office.camera;
  cam.rotation.set(0, yaw, 0, 'YXZ');
  cam.position.set(0, 1.42, 1.7);
  if (shake > 0) { shake = Math.max(0, shake - dt); cam.rotation.x += (Math.random() - 0.5) * shake * 0.12; cam.rotation.z += (Math.random() - 0.5) * shake * 0.12; cam.position.x += (Math.random() - 0.5) * shake * 0.08; }

  if (G && G.camsUp && mode === 'play') {
    updateCamRooms(time);
    updateCamUI(false);
    const set = W.sets[G.cam];
    let stat = 0.04 + G.camStatic;
    if (G.cr.stray.level > 0 && G.cr.stray.loc === G.cam) stat += 0.12;
    const pep = G.cr.pepper;
    if (pep.state === 'perch' && pep.loc === G.cam) stat += pep.stareT * 0.35;
    postMat.uniforms.stat.value = stat;
    postMat.uniforms.lost.value = G.camLost > 0 ? 1 : 0;
    renderer.setRenderTarget(rt); renderer.render(set.scene, set.camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  } else {
    renderer.render(office.scene, cam);
  }
  if (G && mode === 'play') updateHUD();
}

showMenu();
requestAnimationFrame(frame);

// ------------------------------------------------------------------ test hook
if (TEST) {
  window.__wah = {
    get G() { return G; }, get mode() { return mode; }, monsters, W, office,
    start: (n, lv) => startNight(n, lv), setYaw: (v) => (yaw = v), freeze: (v) => (aiFrozen = v),
    raiseCams, lowerCams, selectCam, toggleDoor, toggleLight, openMeds, closeMeds, feed, soothe, dose, addVial, loadSyringe, answerPhone, kill: (id) => kill(G.cr[id]), turn: (id) => turn(G.cr[id]),
    step: (sec) => { for (let i = 0; i < sec * 30; i++) { if (mode === 'play') updatePlay(1 / 30); } },
  };
}
