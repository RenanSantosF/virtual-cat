// Amarra tudo: canvas, câmera, laço de simulação e o toque na tela.
import { clamp, lerp, approach, rand } from './util.js';
import { load, save, saveNow, catchUp, stepSim, FOOD, urgentNeed } from './state.js';
import { ROOM, SPOTS, daylight, drawRoom, drawBedFront } from './world.js';
import { Cat } from './cat.js';
import { Brain } from './behavior.js';
import { UI } from './ui.js';
import * as A from './audio.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });

const s = load();
const cat = new Cat();
cat.x = SPOTS.bed - 40;
cat.y = ROOM.ground;
cat.facing = -1;
const brain = new Brain(cat, s);

let view = { scale: 1, w: 0, h: 0, camX: 0 };
let playMode = false;
let toy = null;
let feather = { x: 0, y: 0, vx: 0, vy: 0 };
let petting = false;
let lastT = performance.now();

const ui = new UI(s, {
  action: onAction,
  feed: onFeed,
  introDone: () => { s.introDone = true; saveNow(s); },
});

/* ------------------------------------------------------------ canvas */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Em retrato mostramos ~640 unidades de largura (gato ocupa ~1/3 da tela);
  // em telas largas abrimos até o cômodo inteiro.
  const aspect = w / h;
  const viewW = lerp(430, 1060, clamp((aspect - 0.45) / 0.95));
  view.scale = w / viewW;
  view.w = viewW;
  view.h = h / view.scale;
  view.offY = h * 0.78 / view.scale - ROOM.ground;   // chão a 78% da altura
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

const toWorld = (px, py) => ({
  x: px / view.scale + view.camX,
  y: py / view.scale - view.offY,
});

/* -------------------------------------------------------------- input */
function pointerZone(e) {
  const r = canvas.getBoundingClientRect();
  return toWorld(e.clientX - r.left, e.clientY - r.top);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  A.ready();
  const p = pointerZone(e);
  if (playMode) { toy = p; brain.setToy(p); return; }
  const zone = cat.hitTest(p.x, p.y);
  if (zone) {
    petting = true;
    brain.request('petStart', { zone });
  } else {
    brain.look = { x: p.x, y: p.y };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!e.buttons && e.pointerType === 'mouse') return;
  const p = pointerZone(e);
  if (playMode && toy) { toy = p; brain.setToy(p); return; }
  if (petting) {
    const zone = cat.hitTest(p.x, p.y);
    if (!zone) { petting = false; brain.request('petEnd'); }
  }
});

function endPointer() {
  if (petting) { petting = false; brain.request('petEnd'); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

/* ------------------------------------------------------------ ações */
function onAction(kind) {
  A.ready();
  switch (kind) {
    case 'food': ui.openFood(); break;
    case 'water':
      s.water.amount = 1; s.water.filledAt = Date.now();
      brain.request('water');
      ui.toast('Água trocada.');
      save(s);
      break;
    case 'play':
      playMode = !playMode;
      document.body.classList.toggle('playing', playMode);
      ui.playMode(playMode, playMode ? 'Arraste a varinha. Movimento errático caça melhor — e deixe ele pegar às vezes.' : '');
      if (playMode) { brain.request('playStart'); }
      else { toy = null; brain.request('playEnd'); }
      break;
    case 'brush': brain.request('brush'); save(s); break;
    case 'litter':
      s.litter.soil = 0;
      brain.request('litterClean');
      save(s);
      break;
    case 'call': brain.request('call'); break;
    case 'blink': brain.slowBlinkFromYou(); break;
  }
}

function onFeed(type) {
  const f = FOOD[type];
  const now = Date.now();
  s.bowl = { type, amount: type === 'treat' ? 0.35 : 1, filledAt: now };
  brain.request('fed', { type });
  save(s);
}

/* ----------------------------------------------------- volta ao app */
function resume() {
  const rep = catchUp(s);
  const msg = ui.awayReport(rep, s);
  if (msg) ui.toast(msg);
  if (rep && rep.hours > 8) {
    // Sumir por muito tempo tem preço: ele se fecha um pouco.
    brain.start(s.bond > 45 ? 'greet' : 'idle');
  }
  saveNow(s);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveNow(s); A.purr(false); }
  else { lastT = performance.now(); resume(); }
});
window.addEventListener('pagehide', () => saveNow(s));

if (!s.introDone) ui.open('intro'); else resume();

/* -------------------------------------------------------------- laço */
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  const env = daylight();

  // simulação em tempo real: dt em horas
  stepSim(s, dt / 3600, { playing: playMode && brain.act === 'play' });

  brain.update(dt, { now: Date.now(), light: env.light });
  cat.update(dt, { speed: brain.speed });
  cat.y = ROOM.ground;

  // câmera acompanha o gato sem colar nele
  const maxCam = Math.max(0, ROOM.w - view.w);
  const want = clamp(cat.x - view.w / 2, 0, maxCam);
  view.camX = approach(view.camX, want, 2.2, dt);

  // varinha: a pena atrasa em relação à sua mão, como pena de verdade
  if (toy) {
    feather.vx += (toy.x - feather.x) * 24 * dt;
    feather.vy += (toy.y - feather.y) * 24 * dt;
    feather.vx *= Math.exp(-6 * dt); feather.vy *= Math.exp(-6 * dt);
    feather.x += feather.vx * dt; feather.y += feather.vy * dt;
    brain.setToy({ x: feather.x, y: feather.y });
  }

  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.camX, view.offY);
  ctx.fillStyle = '#120e14';
  ctx.fillRect(view.camX - 20, -view.offY - 20, view.w + 40, view.h + 40);

  drawRoom(ctx, env, s, now / 1000);
  cat.draw(ctx, { light: 0.5 + env.light * 0.52 });
  if (Math.abs(cat.x - SPOTS.bed) < 96) drawBedFront(ctx, env);

  const vg = ctx.createRadialGradient(
    view.camX + view.w / 2, ROOM.ground - 160, view.w * 0.3,
    view.camX + view.w / 2, ROOM.ground - 160, view.w * 1.15);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(6,4,8,${0.5 - env.light * 0.12})`);
  ctx.fillStyle = vg;
  ctx.fillRect(view.camX - 20, -view.offY - 20, view.w + 40, view.h + 40);
  if (toy) drawWand(ctx, env);
  ctx.restore();

  const msg = brain.popMsg();
  if (msg) ui.toast(msg);
  ui.setRead(brain.read);
  ui.tick(dt);
  if (Math.random() < dt * 0.15) save(s);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function drawWand(ctx, env) {
  const L = env.light;
  const ax = view.camX + view.w + 40, ay = -view.offY - 20;
  ctx.save();
  ctx.strokeStyle = `rgba(210,196,170,${0.55 + L * 0.35})`;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + feather.x) / 2, (ay + feather.y) / 2 - 40, feather.x, feather.y);
  ctx.stroke();

  const ang = Math.atan2(feather.vy, feather.vx) || 0;
  ctx.translate(feather.x, feather.y);
  ctx.rotate(ang + Math.PI);
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    ctx.strokeStyle = `rgba(${240 - i * 6},${180 - i * 5},${90 + i * 6},${0.85 - u * 0.4})`;
    ctx.lineWidth = 2.2 - u;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(u * 1.6 - 0.8) * 26, Math.sin(u * 1.6 - 0.8) * 26);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- PWA */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
