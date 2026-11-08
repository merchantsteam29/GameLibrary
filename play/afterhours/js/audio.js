// All sound is synthesized with WebAudio, so there are no asset files.
let ctx = null, master = null, noiseBuf = null;
const loops = {};
let volume = 0.8;

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildLoops();
}

const now = () => ctx.currentTime;
function out(pan = 0, gain = 1) {
  const g = ctx.createGain(); g.gain.value = gain;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p); p.connect(master);
  return g;
}
function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function noise(dur, { type = 'lowpass', freq = 1000, q = 1, gain = 0.5, pan = 0, attack = 0.005, delay = 0, freqTo } = {}) {
  if (!ctx) return;
  const t0 = now() + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, attack, gain, dur);
  s.connect(f); f.connect(g); g.connect(out(pan));
  s.start(t0, Math.random()); s.stop(t0 + attack + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.3, pan = 0, attack = 0.005, delay = 0, slideTo, lp } = {}) {
  if (!ctx) return;
  const t0 = now() + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + attack + dur);
  const g = ctx.createGain();
  env(g, t0, attack, gain, dur);
  let node = o;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  node.connect(g); g.connect(out(pan));
  o.start(t0); o.stop(t0 + attack + dur + 0.05);
}

// ---------------------------------------------------------------- loops
function loopNoise(type, freq, q, pan = 0) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const mod = ctx.createGain(); mod.gain.value = 1;
  const g = ctx.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(mod); mod.connect(g); g.connect(out(pan));
  s.start();
  return { g, mod, f };
}
function lfo(param, rate, depth, base) {
  const o = ctx.createOscillator(); o.frequency.value = rate;
  const d = ctx.createGain(); d.gain.value = depth;
  param.value = base;
  o.connect(d); d.connect(param); o.start();
  return o;
}
function buildLoops() {
  // electrical hum of the building
  const hum = ctx.createGain(); hum.gain.value = 0; hum.connect(out(0));
  for (const [f, a] of [[60, 0.5], [120, 0.25], [180, 0.08]]) {
    const o = ctx.createOscillator(); o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(hum); o.start();
  }
  const room = loopNoise('lowpass', 260, 0.5); lfo(room.mod.gain, 0.07, 0.3, 0.7);
  loops.hum = { set: (v) => { hum.gain.setTargetAtTime(v * 0.05, now(), 0.3); room.g.gain.setTargetAtTime(v * 0.18, now(), 0.3); } };
  const fan = loopNoise('bandpass', 700, 0.6, 0.35); lfo(fan.mod.gain, 4, 0.2, 0.8);
  loops.fan = { set: (v) => fan.g.gain.setTargetAtTime(v * 0.06, now(), 0.2) };
  const breath = loopNoise('bandpass', 520, 1.2, -0.9); lfo(breath.mod.gain, 0.45, 0.9, 0.1);
  loops.breathL = { set: (v) => breath.g.gain.setTargetAtTime(v * 0.5, now(), 0.4) };
  const breathR = loopNoise('bandpass', 620, 1.2, 0.9); lfo(breathR.mod.gain, 0.6, 0.9, 0.1);
  loops.breathR = { set: (v) => breathR.g.gain.setTargetAtTime(v * 0.45, now(), 0.4) };
  const purr = loopNoise('lowpass', 180, 2, 0.25); lfo(purr.mod.gain, 24, 0.8, 0.4);
  loops.purr = { set: (v) => purr.g.gain.setTargetAtTime(v * 1.2, now(), 0.4) };
  const stat = loopNoise('highpass', 2500, 0.3);
  loops.static = { set: (v) => stat.g.gain.setTargetAtTime(v * 0.08, now(), 0.05) };
  const buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 118;
  const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 500;
  const bg = ctx.createGain(); bg.gain.value = 0; buzz.connect(bf); bf.connect(bg); bg.connect(master); buzz.start();
  loops.buzz = { set: (v) => bg.gain.setTargetAtTime(v * 0.025, now(), 0.05) };
  const flat = ctx.createOscillator(); flat.frequency.value = 988;
  const fg = ctx.createGain(); fg.gain.value = 0; flat.connect(fg); fg.connect(master); flat.start();
  loops.flatline = { set: (v) => fg.gain.setTargetAtTime(v * 0.06, now(), 0.05) };
}
export function loop(name, v) { if (loops[name]) loops[name].set(v); }
export function allLoopsOff() { for (const k in loops) loops[k].set(0); }

// ---------------------------------------------------------------- one-shots
export const sfx = {
  click() { tone(1800, 0.03, { gain: 0.15, type: 'square', lp: 3000 }); },
  door(pan) {
    noise(0.35, { freq: 500, gain: 0.7, pan });
    tone(70, 0.3, { gain: 0.6, pan, slideTo: 45 });
    tone(183, 0.5, { gain: 0.08, type: 'square', pan, lp: 900, delay: 0.02 });
  },
  light() { tone(2400, 0.02, { gain: 0.12, type: 'square' }); noise(0.05, { type: 'highpass', freq: 4000, gain: 0.1 }); },
  camUp() { noise(0.25, { type: 'bandpass', freq: 600, freqTo: 3000, gain: 0.25 }); tone(880, 0.06, { gain: 0.06, delay: 0.2 }); },
  camDown() { noise(0.2, { type: 'bandpass', freq: 3000, freqTo: 500, gain: 0.2 }); },
  camSwitch() { noise(0.15, { type: 'highpass', freq: 3000, gain: 0.22 }); tone(1320, 0.04, { gain: 0.05, type: 'square' }); },
  ring() {
    for (const d of [0, 0.5]) {
      tone(440, 0.38, { gain: 0.12, delay: d, attack: 0.01 });
      tone(480, 0.38, { gain: 0.12, delay: d, attack: 0.01 });
    }
  },
  pickup() { noise(0.1, { freq: 1500, gain: 0.3 }); tone(300, 0.05, { gain: 0.1, type: 'square', lp: 800 }); },
  hangup() { noise(0.12, { freq: 800, gain: 0.4 }); tone(120, 0.1, { gain: 0.3 }); },
  step(pan = 0, v = 0.5) { noise(0.09, { freq: 260, gain: v, pan }); tone(85, 0.08, { gain: v * 0.6, pan, slideTo: 55 }); },
  bang(pan) {
    for (const d of [0, 0.45, 0.8]) {
      noise(0.3, { freq: 380, gain: 0.9, pan, delay: d });
      tone(60, 0.25, { gain: 0.8, pan, delay: d, slideTo: 38 });
      tone(240, 0.4, { gain: 0.07, pan, delay: d, type: 'square', lp: 700 });
    }
  },
  thumps(pan) { for (let i = 0; i < 9; i++) sfx.step(pan * (0.4 + i * 0.07), 0.25 + i * 0.06); for (let i = 0; i < 9; i++) noise(0.08, { freq: 300, gain: 0.3 + i * 0.07, pan: pan * (0.4 + i * 0.07), delay: i * 0.2 }); },
  clang(pan = 0) {
    for (const f of [223, 341, 517, 803, 1210]) tone(f, 1.6, { gain: 0.05, pan, lp: 1400, delay: 0.02 });
    noise(0.4, { freq: 900, gain: 0.25, pan });
  },
  growl(kind, pan = 0) {
    if (kind === 'dog') { for (let i = 0; i < 3; i++) tone(70 + i * 9, 1.1, { type: 'sawtooth', gain: 0.12, pan, lp: 380, delay: i * 0.03, attack: 0.1 }); }
    else if (kind === 'cat') noise(1.0, { type: 'highpass', freq: 3200, gain: 0.25, pan, attack: 0.1 });
    else if (kind === 'rabbit') tone(900, 0.7, { type: 'sawtooth', gain: 0.1, pan, slideTo: 1500, lp: 2500 });
    else if (kind === 'parrot') { tone(1300, 0.18, { type: 'square', gain: 0.07, pan, slideTo: 1900 }); tone(1500, 0.2, { type: 'square', gain: 0.07, pan, slideTo: 900, delay: 0.25 }); }
  },
  screech() {
    for (let i = 0; i < 4; i++) tone(1700 + i * 330, 1.3, { type: 'sawtooth', gain: 0.18, slideTo: 2900 - i * 200, attack: 0.02 });
    noise(1.3, { type: 'bandpass', freq: 3000, q: 0.7, gain: 0.8 });
  },
  scream() {
    for (let i = 0; i < 5; i++) tone(260 + Math.random() * 200, 1.4, { type: 'sawtooth', gain: 0.3, slideTo: 700 + Math.random() * 500, attack: 0.01 });
    noise(1.4, { type: 'bandpass', freq: 1800, q: 0.6, gain: 1.2, freqTo: 600 });
    tone(55, 1.2, { gain: 1, slideTo: 30 });
  },
  sting() { tone(110, 2.5, { type: 'sawtooth', gain: 0.08, lp: 600, attack: 0.4 }); tone(116.5, 2.5, { type: 'sawtooth', gain: 0.08, lp: 600, attack: 0.4 }); },
  kibble() { for (let i = 0; i < 8; i++) noise(0.03, { type: 'highpass', freq: 3000 + Math.random() * 2000, gain: 0.25, delay: i * 0.05 + Math.random() * 0.03 }); },
  lullaby() {
    const notes = [659, 587, 523, 587, 659, 659, 659, 587, 587, 587, 659, 784, 784];
    notes.forEach((f, i) => tone(f * (1 - i * 0.003), 0.4, { type: 'triangle', gain: 0.06, delay: i * 0.28 }));
  },
  dose() { noise(0.25, { type: 'highpass', freq: 5000, gain: 0.25, freqTo: 1500 }); tone(600, 0.05, { gain: 0.08, delay: 0.25 }); },
  vial(i) { tone(2200 + i * 300, 0.12, { gain: 0.08 }); tone(3100 + i * 300, 0.1, { gain: 0.04 }); },
  wrong() { tone(220, 0.25, { type: 'square', gain: 0.1, lp: 1200 }); tone(160, 0.3, { type: 'square', gain: 0.1, lp: 1200, delay: 0.2 }); },
  good() { tone(880, 0.12, { gain: 0.08 }); tone(1320, 0.18, { gain: 0.08, delay: 0.1 }); },
  powerDown() { tone(420, 2.2, { gain: 0.25, slideTo: 30, type: 'sawtooth', lp: 900 }); noise(0.6, { freq: 300, gain: 0.5 }); },
  chime() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { tone(f, 1.6, { gain: 0.12, delay: i * 0.45 }); tone(f * 2.01, 1.2, { gain: 0.03, delay: i * 0.45 }); });
  },
  whisper() { noise(1.4, { type: 'bandpass', freq: 2200, q: 3, gain: 0.12, attack: 0.3, pan: (Math.random() - 0.5) * 2 }); },
};
