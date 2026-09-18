// Estado persistente e simulação em tempo real.
// Tudo aqui corre no relógio de verdade: fechar o app não pausa o gato.
import { clamp, lerp, chance, rand } from './util.js';

const KEY = 'virtual-cat/v1';
const HOUR = 3600000;

// Taxas por hora, na escala 0..100.
const RATE = {
  hunger: 11,      // estômago vazio em ~9h
  thirst: 7,       // sede relevante em ~14h
  bladder: 9,      // bexiga cheia em ~11h
  stim: 6.5,       // tédio/instinto de caça acumulando
  social: 3.5,
  energyAwake: 10, // ~8h de vigília gastam a carga
  energySleep: 5,  // ~16h de sono recarregam
  litterSoil: 0.9, // usos até a caixa ficar intolerável ≈ 1/0.09
};

export function freshState(name = 'Misha') {
  const now = Date.now();
  return {
    v: 1, name, born: now, lastSeen: now, lastOpen: now, introDone: false,
    needs: { hunger: 40, thirst: 30, bladder: 20, energy: 70, stim: 45, social: 35 },
    stress: 12, bond: 8, health: 100,
    bowl: { type: null, amount: 0, filledAt: 0 },
    water: { amount: 0.9, filledAt: now },
    litter: { soil: 0.15 },
    coat: { mats: 0.1, hairball: 0.15 },
    treats: { count: 0, dayKey: dayKey(now) },
    asleep: false, sleepSince: 0,
    log: { meals: 0, plays: 0, catches: 0, bites: 0, pets: 0, blinks: 0, accidents: 0, hairballs: 0 },
    seen: { pet: 0, play: 0, feed: 0, call: 0, callStreak: 0, bite: 0, wake: 0 },
    away: 0, // horas do último período de ausência
  };
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !s.needs) return freshState();
    return Object.assign(freshState(s.name), s);
  } catch { return freshState(); }
}

let saveTimer = 0;
export function save(s) {
  s.lastSeen = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  }, 400);
}
export function saveNow(s) {
  s.lastSeen = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

/* ---------------------------------------------------------------- ritmo
   Gato é crepuscular: acorda de madrugada, caça ao amanhecer, apaga no
   meio do dia, liga de novo no fim da tarde e tem zoomies de madrugada. */
export function activityDrive(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const peak = (c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  const dawn = peak(6.2, 1.5);
  const dusk = peak(19.0, 1.9);
  const night = peak(3.4, 0.8) * 0.75; // janela dos zoomies
  return clamp(0.14 + dawn * 0.85 + dusk * 0.9 + night, 0, 1);
}

export function isNight(date = new Date()) {
  const h = date.getHours();
  return h < 6 || h >= 20;
}

/* ---------------------------------------------------------- comida/água */
export const FOOD = {
  dry:   { appeal: 0.55, fills: 34, spoilH: 999, portions: 3 },
  wet:   { appeal: 0.98, fills: 46, spoilH: 2.5, portions: 2 },
  treat: { appeal: 1.0,  fills: 8,  spoilH: 6,   portions: 1 },
};

export function foodFreshness(s, now = Date.now()) {
  if (!s.bowl.type || s.bowl.amount <= 0) return 0;
  const age = (now - s.bowl.filledAt) / HOUR;
  const f = FOOD[s.bowl.type];
  return clamp(1 - age / f.spoilH);
}

// Quão atraente está a tigela agora (0 = ele não encosta).
export function foodAppeal(s, now = Date.now()) {
  if (!s.bowl.type || s.bowl.amount <= 0) return 0;
  const fresh = foodFreshness(s, now);
  if (fresh <= 0) return 0;                       // estragado: ele recusa, ponto
  const base = FOOD[s.bowl.type].appeal;
  return base * lerp(0.35, 1, fresh);
}

export function waterQuality(s, now = Date.now()) {
  if (s.water.amount <= 0.02) return 0;
  const age = (now - s.water.filledAt) / HOUR;
  return clamp(1 - age / 20) * clamp(s.water.amount * 2);
}

/* ------------------------------------------------------------- consumo */
export function eatFromBowl(s, now = Date.now()) {
  const appeal = foodAppeal(s, now);
  if (appeal <= 0) return 0;
  const f = FOOD[s.bowl.type];
  const portion = 1 / f.portions;
  const take = Math.min(s.bowl.amount, portion);
  s.bowl.amount -= take;
  const fed = f.fills * (take / portion);
  s.needs.hunger = clamp(s.needs.hunger - fed, 0, 100);
  s.needs.social = clamp(s.needs.social - 4, 0, 100);
  s.stress = clamp(s.stress - 3 * appeal, 0, 100);
  if (s.bowl.amount <= 0.01) { s.bowl.amount = 0; s.bowl.type = null; }
  s.log.meals++;
  return fed;
}

export function drinkWater(s, now = Date.now()) {
  const q = waterQuality(s, now);
  if (q < 0.15) return 0;                          // água velha: ele dá as costas
  s.water.amount = clamp(s.water.amount - 0.12, 0, 1);
  const gain = 34 * lerp(0.5, 1, q);
  s.needs.thirst = clamp(s.needs.thirst - gain, 0, 100);
  return gain;
}

export function useLitter(s) {
  if (s.litter.soil > 0.88) return false;          // caixa suja: ele segura
  s.needs.bladder = clamp(s.needs.bladder - 85, 0, 100);
  s.litter.soil = clamp(s.litter.soil + 0.09, 0, 1);
  s.stress = clamp(s.stress - 2, 0, 100);
  return true;
}

// Quando segura demais porque a caixa está imunda: faz fora, e fica mal por isso.
export function accident(s) {
  s.needs.bladder = clamp(s.needs.bladder - 80, 0, 100);
  s.stress = clamp(s.stress + 16, 0, 100);
  s.log.accidents++;
}

/* ---------------------------------------------------------------- passo
   Um passo de simulação de `dtH` horas. Serve tanto para o loop ao vivo
   (dtH minúsculo) quanto para recuperar dias de ausência. */
export function stepSim(s, dtH, opts = {}) {
  const n = s.needs;
  const playing = !!opts.playing;
  const drive = opts.drive ?? activityDrive();

  n.hunger = clamp(n.hunger + RATE.hunger * dtH, 0, 100);
  n.thirst = clamp(n.thirst + RATE.thirst * dtH * (1 + (s.bowl.type === 'dry' ? 0.25 : 0)), 0, 100);
  n.bladder = clamp(n.bladder + RATE.bladder * dtH, 0, 100);

  if (s.asleep) {
    n.energy = clamp(n.energy + RATE.energySleep * dtH, 0, 100);
    n.stim = clamp(n.stim + RATE.stim * 0.25 * dtH, 0, 100);
    n.social = clamp(n.social + RATE.social * 0.3 * dtH, 0, 100);
    s.stress = clamp(s.stress - 5 * dtH, 0, 100);
  } else {
    const spend = playing ? 26 : RATE.energyAwake * lerp(0.55, 1.25, drive);
    n.energy = clamp(n.energy - spend * dtH, 0, 100);
    n.stim = clamp(n.stim + RATE.stim * lerp(0.5, 1.35, drive) * dtH, 0, 100);
    n.social = clamp(n.social + RATE.social * dtH * lerp(0.4, 1.2, s.bond / 100), 0, 100);
  }

  // Pelo: nós se formam sem escovação, e engolir pelo vira bola de pelo.
  s.coat.mats = clamp(s.coat.mats + 0.012 * dtH, 0, 1);
  s.coat.hairball = clamp(s.coat.hairball + (0.008 + s.coat.mats * 0.012) * dtH, 0, 1);

  // A caixa não se limpa sozinha, e o cheiro incomoda ele antes de incomodar você.
  if (s.litter.soil > 0.6) s.stress = clamp(s.stress + (s.litter.soil - 0.6) * 12 * dtH, 0, 100);

  // Água evapora / cai poeira.
  s.water.amount = clamp(s.water.amount - 0.006 * dtH, 0, 1);

  // Estresse: fome, sede e tédio pressionam; sossego alivia.
  const pressure =
    Math.max(0, n.hunger - 70) * 0.06 +
    Math.max(0, n.thirst - 75) * 0.05 +
    Math.max(0, n.bladder - 85) * 0.05 +
    Math.max(0, n.stim - 80) * 0.03;
  s.stress = clamp(s.stress + (pressure - 3.5) * dtH, 0, 100);

  // Saúde: só cede sob descuido prolongado, e volta devagar.
  const harm =
    (n.hunger > 88 ? (n.hunger - 88) * 0.35 : 0) +
    (n.thirst > 90 ? (n.thirst - 90) * 0.55 : 0) +
    (s.stress > 82 ? (s.stress - 82) * 0.12 : 0) +
    (s.coat.hairball > 0.95 ? 2 : 0);
  s.health = clamp(s.health + (harm > 0 ? -harm : 1.1) * dtH, 0, 100);

  // Vínculo: cresce em semanas de rotina boa, cai em dias de abandono.
  const cared = n.hunger < 55 && n.thirst < 60 && s.litter.soil < 0.7 && s.stress < 45;
  s.bond = clamp(s.bond + (cared ? 0.16 : -0.5) * dtH, 0, 100);
}

/* ------------------------------------------------- recuperar a ausência
   Roda a simulação desde a última vez que o app foi aberto, deixando o
   gato agir sozinho: ele come do que sobrou, bebe, usa a caixa e dorme. */
export function catchUp(s) {
  const now = Date.now();
  const elapsed = clamp(now - (s.lastSeen || now), 0, 30 * 24 * HOUR);
  s.away = elapsed / HOUR;
  if (elapsed < 60000) { s.lastSeen = now; return null; }

  const stepH = 5 / 60;
  const steps = Math.min(Math.ceil(elapsed / HOUR / stepH), 9000);
  let t = now - elapsed;
  const rep = { ate: 0, drank: 0, litter: 0, accidents: 0, slept: 0, hairballs: 0 };

  for (let i = 0; i < steps; i++) {
    t += stepH * HOUR;
    const d = new Date(t);
    const drive = activityDrive(d);

    // Dorme quando o corpo pede e o relógio permite; acorda com fome ou energia.
    const sleepy = s.needs.energy < lerp(78, 26, drive);
    const urgent = s.needs.hunger > 82 || s.needs.bladder > 88;
    if (s.asleep && (!sleepy || urgent)) s.asleep = false;
    else if (!s.asleep && sleepy && !urgent) s.asleep = true;

    stepSim(s, stepH, { drive });
    if (s.asleep) rep.slept += stepH;

    if (!s.asleep) {
      if (s.needs.hunger > 42 && foodAppeal(s, t) > 0.25 && eatFromBowl(s, t) > 0) rep.ate++;
      if (s.needs.thirst > 45 && waterQuality(s, t) > 0.15 && drinkWater(s, t) > 0) rep.drank++;
      if (s.needs.bladder > 72) {
        if (useLitter(s)) rep.litter++;
        else if (s.needs.bladder > 96) { accident(s); rep.accidents++; }
      }
      if (s.coat.hairball > 0.9 && chance(0.02)) {
        s.coat.hairball = rand(0.05, 0.2); s.log.hairballs++; rep.hairballs++;
        s.stress = clamp(s.stress + 4, 0, 100);
      }
    }
  }

  s.lastSeen = now;
  s.lastOpen = now;
  if (dayKey(now) !== s.treats.dayKey) { s.treats.dayKey = dayKey(now); s.treats.count = 0; }
  rep.hours = elapsed / HOUR;
  return rep;
}

/* -------------------------------------------------------------- leitura */
export const ageDays = (s) => (Date.now() - s.born) / (24 * HOUR);

export function urgentNeed(s) {
  const n = s.needs;
  const list = [
    ['fome', n.hunger, 74],
    ['sede', n.thirst, 78],
    ['caixa', s.litter.soil * 100, 82],
    ['banheiro', n.bladder, 90],
    ['tédio', n.stim, 86],
    ['saúde', 100 - s.health, 40],
  ].filter(([, v, th]) => v >= th).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
  return list.length ? list[0][0] : null;
}
