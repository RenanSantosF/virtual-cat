// Sons sintetizados na hora — nenhum arquivo de áudio no projeto.
// Miado de gato é basicamente uma vogal com formantes que deslizam; ronronar
// é ruído grave modulado em ~26 Hz.
import { rand, clamp } from './util.js';

let ac = null, master = null, purrNode = null;

export function ready() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  ac = new C();
  master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);
  return ac;
}

export function setVolume(v) { if (master) master.gain.value = clamp(v, 0, 1); }

// tipo: 'meow' | 'chirp' | 'trill' | 'yowl' | 'hiss' | 'chatter'
export function meow(kind = 'meow', mood = 0.5) {
  if (!ready()) return;
  const t0 = ac.currentTime;
  const dur = kind === 'yowl' ? rand(0.9, 1.3) : kind === 'chirp' ? 0.14 : kind === 'trill' ? 0.5 : rand(0.4, 0.75);

  if (kind === 'hiss') {
    const n = noiseSource(dur * 1.6);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.32, t0 + 0.05);
    g.gain.setValueAtTime(0.3, t0 + dur);
    g.gain.linearRampToValueAtTime(0, t0 + dur * 1.5);
    n.connect(hp).connect(bp).connect(g).connect(master);
    return;
  }

  const base = kind === 'yowl' ? rand(300, 360) : kind === 'chirp' ? rand(760, 900) : rand(420, 530);
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  const p = osc.frequency;
  p.setValueAtTime(base * 0.72, t0);
  if (kind === 'trill') {
    for (let i = 0; i < 7; i++) p.setValueAtTime(base * (i % 2 ? 1.22 : 0.95), t0 + i * dur / 7);
  } else if (kind === 'chirp') {
    p.exponentialRampToValueAtTime(base * 1.6, t0 + dur * 0.6);
    p.exponentialRampToValueAtTime(base * 1.1, t0 + dur);
  } else {
    p.exponentialRampToValueAtTime(base * (1 + mood * 0.25), t0 + dur * 0.28);
    p.setValueAtTime(base * (1 + mood * 0.25), t0 + dur * 0.5);
    p.exponentialRampToValueAtTime(base * 0.62, t0 + dur);
  }
  // vibrato: sem ele o miado soa sintetizador
  const lfo = ac.createOscillator(); lfo.frequency.value = rand(16, 24);
  const lfoG = ac.createGain(); lfoG.gain.value = base * 0.035;
  lfo.connect(lfoG).connect(p); lfo.start(t0); lfo.stop(t0 + dur + 0.1);

  // dois formantes deslizando de "mi" para "au"
  const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
  f1.frequency.setValueAtTime(720, t0);
  f1.frequency.linearRampToValueAtTime(520, t0 + dur);
  const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
  f2.frequency.setValueAtTime(2100, t0);
  f2.frequency.linearRampToValueAtTime(980, t0 + dur);

  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(kind === 'chirp' ? 0.16 : 0.24, t0 + 0.05);
  g.gain.setValueAtTime(kind === 'chirp' ? 0.16 : 0.22, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur + 0.12);

  osc.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.15);
}

export function purr(on, intensity = 1) {
  if (!ready()) return;
  if (on && !purrNode) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 1.4;
    const g = ac.createGain(); g.gain.value = 0;
    // o "motor": modulação de amplitude em ~26 Hz é o que faz soar ronronado
    const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 26;
    const lg = ac.createGain(); lg.gain.value = 0.5;
    const dc = ac.createConstantSource(); dc.offset.value = 0.5;
    lfo.connect(lg); lg.connect(g.gain); dc.connect(g.gain);
    const out = ac.createGain(); out.gain.value = 0.0;
    src.connect(lp).connect(g).connect(out).connect(master);
    src.start(); lfo.start(); dc.start();
    out.gain.linearRampToValueAtTime(0.16 * intensity, ac.currentTime + 0.6);
    purrNode = { src, lfo, dc, out };
  } else if (!on && purrNode) {
    const n = purrNode; purrNode = null;
    n.out.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
    setTimeout(() => { try { n.src.stop(); n.lfo.stop(); n.dc.stop(); } catch {} }, 700);
  } else if (on && purrNode) {
    purrNode.out.gain.linearRampToValueAtTime(0.16 * intensity, ac.currentTime + 0.4);
  }
}

export function crunch() {
  if (!ready()) return;
  for (let i = 0; i < 4; i++) {
    const t = ac.currentTime + i * rand(0.09, 0.16);
    const n = noiseSource(0.05, t);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = rand(1400, 3000); bp.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp).connect(g).connect(master);
  }
}

export function lap() {
  if (!ready()) return;
  for (let i = 0; i < 5; i++) {
    const t = ac.currentTime + i * 0.17;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(rand(500, 700), t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.09);
  }
}

export function thud(vol = 0.2) {
  if (!ready()) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
}

let nb = null;
function noiseBuffer(sec) {
  if (nb && nb.duration >= sec) return nb;
  const len = Math.floor(ac.sampleRate * sec);
  nb = ac.createBuffer(1, len, ac.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return nb;
}
function noiseSource(sec, when) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(Math.max(sec, 0.4));
  const t = when ?? ac.currentTime;
  src.start(t); src.stop(t + sec);
  return src;
}
