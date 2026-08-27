import { metabolism, ADOPTION_AGE, MS_DAY, ageMonths } from './growth'
import { makePersonality } from './personality'
import { clamp } from './random'
import { dist, SPOTS } from './world'
import type { CatState, Illness, IllnessKind, NeedKey } from './types'

export const STATE_VERSION = 1

/** Passo fixo da simulação, em segundos reais. */
const STEP = 60
/** Teto de recuperação offline: 60 dias. Além disso o gato é "cuidado por um vizinho". */
const MAX_CATCHUP_MS = 60 * MS_DAY

/**
 * Queda por hora de cada necessidade, para um gato adulto saudável.
 * Calibrado a partir do comportamento real: um gato come de 8 a 12 vezes por
 * dia, bebe menos do que deveria, e dorme de 12 a 16 h.
 */
const DECAY_PER_HOUR: Record<NeedKey, number> = {
  hunger: 9,
  thirst: 6.2,
  energy: 13,
  bladder: 10.5,
  hygiene: 1.05,
  affection: 1.7,
  stimulation: 12,
}

/**
 * Gatos são crepusculares, não noturnos: a atividade dispara ao amanhecer e ao
 * anoitecer. Retorna 0..1 para a hora local.
 */
export function crepuscularDrive(now: number): number {
  const h = new Date(now).getHours() + new Date(now).getMinutes() / 60
  const peak = (center: number, width: number) =>
    Math.exp(-((h - center) ** 2) / (2 * width * width))
  const dawn = peak(6.5, 1.6)
  const dusk = peak(19.5, 2.0)
  const base = h >= 1 && h <= 4 ? 0.05 : 0.18
  return Math.min(1, base + dawn + dusk)
}

export function newCat(name: string, now: number, seed = Math.floor(Math.random() * 2 ** 31)): CatState {
  return {
    version: STATE_VERSION,
    name,
    seed,
    // Chega com 8 semanas, como um filhote real recém-desmamado.
    birth: now - ADOPTION_AGE,
    lastTick: now,
    personality: makePersonality(seed),
    needs: {
      hunger: 62,
      thirst: 70,
      energy: 55,
      bladder: 80,
      hygiene: 88,
      affection: 40,
      stimulation: 65,
    },
    health: 96,
    // Chegar em casa nova é estressante para qualquer gato.
    stress: 55,
    bond: 8,
    illnesses: [],
    lastVetVisit: now,
    died: null,
    causeOfDeath: null,
    observed: [],
    bowl: { food: 0, foodKind: 'kibble', servedAt: now, water: 0, waterFilledAt: now },
    litter: { uses: 0, lastCleaned: now },
    inventory: {
      coins: 120,
      items: { kibble: 6, wet: 2, litter: 3, wand: 1 },
    },
    behavior: 'hide',
    behaviorSince: now,
    pos: [-1.1, -0.6],
    target: null,
    facing: 0.6,
    stats: {
      meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 0,
      // Já marcado como pago hoje: o bônus é pelo dia seguinte bem cuidado.
      lastDailyBonus: Math.floor(now / MS_DAY),
    },
  }
}

function addIllness(cat: CatState, kind: IllnessKind, now: number, severity = 0.2) {
  const existing = cat.illnesses.find((i) => i.kind === kind)
  if (existing) {
    existing.severity = Math.min(1, existing.severity + severity * 0.25)
    return
  }
  cat.illnesses.push({ kind, since: now, severity })
}

/** Quão suja está a caixa de areia, 0..1. */
export function litterFilth(cat: CatState, now: number): number {
  const byUse = cat.litter.uses / 8
  const byTime = (now - cat.litter.lastCleaned) / (3.5 * MS_DAY)
  return Math.min(1, Math.max(byUse, byTime))
}

/** Ração úmida estraga; a seca dura o dia todo. */
export function foodSpoilage(cat: CatState, now: number): number {
  if (cat.bowl.food <= 0) return 0
  const age = now - cat.bowl.servedAt
  const shelfLife = cat.bowl.foodKind === 'wet' ? 4 * 3600_000 : 72 * 3600_000
  return Math.min(1, age / shelfLife)
}

/**
 * Calibragem alimentar. Um gato adulto de 4,5 kg consome cerca de 60 g de ração
 * seca por dia; a saciedade cai 9 pontos por hora, ou 216 por dia. Daí saem os
 * 3,6 pontos por grama — comer o dia inteiro dá exatamente a manutenção.
 */
const POINTS_PER_GRAM = 3.6
/** Um gato bebe cerca de 200 ml por dia quando só come ração seca. */
const POINTS_PER_ML = 0.75

/**
 * Avança a simulação até `now`, em passos fixos. Roda igual no primeiro frame
 * depois de o app ficar dias fechado — é o mesmo código, então o gato vive de
 * verdade enquanto você não está olhando.
 */
export function advance(cat: CatState, now: number): CatState {
  if (cat.died) {
    cat.lastTick = now
    return cat
  }
  let elapsed = now - cat.lastTick
  if (elapsed <= 0) {
    cat.lastTick = now
    return cat
  }
  if (elapsed > MAX_CATCHUP_MS) {
    cat.lastTick = now - MAX_CATCHUP_MS
    elapsed = MAX_CATCHUP_MS
  }

  const steps = Math.min(Math.floor(elapsed / (STEP * 1000)), 90_000)
  let t = cat.lastTick
  // Numa recuperação de tempo perdido não há posição para conferir: o gato
  // andou por toda a casa nesse intervalo. Ao vivo é diferente — comer exige
  // estar junto do pote, senão ele se alimenta de longe, sem sair do lugar.
  const catchup = steps > 1

  for (let s = 0; s < steps; s++) {
    t += STEP * 1000
    stepOnce(cat, t, STEP / 3600, catchup)
  }
  cat.lastTick = t
  return cat
}

function stepOnce(cat: CatState, now: number, hours: number, catchup: boolean) {
  const n = cat.needs
  const meta = metabolism(cat.birth, now)
  const months = ageMonths(cat.birth, now)
  const asleep = cat.behavior === 'sleep' || cat.behavior === 'doze'

  // --- Decaimento das necessidades ---
  n.hunger = clamp(n.hunger - DECAY_PER_HOUR.hunger * meta * hours)
  n.thirst = clamp(n.thirst - DECAY_PER_HOUR.thirst * meta * hours)
  n.bladder = clamp(n.bladder - DECAY_PER_HOUR.bladder * meta * hours)
  n.hygiene = clamp(n.hygiene - DECAY_PER_HOUR.hygiene * hours)
  n.affection = clamp(n.affection - DECAY_PER_HOUR.affection * hours)

  if (asleep) {
    // Dormir repõe energia em cerca de 4 h de sono profundo.
    n.energy = clamp(n.energy + 25 * hours)
    n.stimulation = clamp(n.stimulation - DECAY_PER_HOUR.stimulation * 0.25 * hours)
  } else {
    const drive = 0.7 + 0.6 * crepuscularDrive(now)
    n.energy = clamp(n.energy - DECAY_PER_HOUR.energy * meta * drive * hours)
    const boredom = DECAY_PER_HOUR.stimulation * (months < 8 ? 1.5 : 1) * hours
    n.stimulation = clamp(n.stimulation - boredom)
  }

  // Gatos passam cerca de 30 % do tempo acordado se lambendo.
  if (cat.behavior === 'groom') n.hygiene = clamp(n.hygiene + 40 * hours)

  sleepCycle(cat, now)
  autonomy(cat, now, hours, catchup)
  healthStep(cat, now, hours)
}

/**
 * O ciclo de sono roda dentro da própria simulação, e não só na IA de
 * comportamento. Sem isto o gato ficaria acordado durante todo o tempo em que
 * o app está fechado e voltaria com a energia zerada — quando na verdade ele
 * passou a tarde inteira dormindo.
 */
function sleepCycle(cat: CatState, now: number) {
  const n = cat.needs
  const asleep = cat.behavior === 'sleep' || cat.behavior === 'doze'
  const drive = crepuscularDrive(now)
  if (asleep) {
    // Acorda descansado, ou porque a fome ou a bexiga apertaram.
    if (n.energy > 92 || n.hunger < 25 || n.bladder < 15 || (drive > 0.8 && n.energy > 60)) {
      cat.behavior = 'sit'
      cat.behaviorSince = now
    }
    return
  }
  // Um gato dorme de 12 a 16 h por dia, em blocos, e evita os picos de atividade.
  const sleepiness = (100 - n.energy) / 100
  if (sleepiness > 0.62 + drive * 0.3) {
    cat.behavior = 'sleep'
    cat.behaviorSince = now
    cat.target = null
  }
}

/**
 * O que o gato faz sozinho, sem você. Roda também durante o catch-up offline:
 * é por isso que você pode deixar ração e água e voltar horas depois.
 */
/** Está perto o bastante de um lugar para usá-lo? */
function atSpot(cat: CatState, spot: [number, number]): boolean {
  return dist(cat.pos, spot) < 0.42
}

function autonomy(cat: CatState, now: number, hours: number, catchup: boolean) {
  const n = cat.needs
  const p = cat.personality

  // --- Comer ---
  const appetiteThreshold = 55 + p.gluttony * 25
  const canEat = catchup || (cat.behavior === 'eat' && atSpot(cat, SPOTS.bowl))
  if (canEat && n.hunger < appetiteThreshold && cat.bowl.food > 0 && cat.stress < 85) {
    const spoil = foodSpoilage(cat, now)
    const nutrition = cat.bowl.foodKind === 'wet' ? 1.3 : cat.bowl.foodKind === 'treat' ? 0.7 : 1
    const perGram = POINTS_PER_GRAM * nutrition * (1 - spoil * 0.7)
    // Ele come até se satisfazer, não até esvaziar o pote — um gato saciado
    // simplesmente vira as costas para a ração que sobrou.
    const wanted = Math.max(0, (92 - n.hunger) / Math.max(perGram, 0.1))
    const rate = Math.min(30 * metabolism(cat.birth, now), wanted / 0.3)
    const eaten = Math.min(cat.bowl.food, wanted, rate * hours)
    if (eaten > 0) {
      cat.bowl.food -= eaten
      n.hunger = clamp(n.hunger + eaten * perGram)
      // Comida úmida é cerca de 78 % água: hidrata de verdade.
      if (cat.bowl.foodKind === 'wet') n.thirst = clamp(n.thirst + eaten * 0.5)
      if (spoil > 0.85 && Math.random() < 0.015 * hours * 60) {
        addIllness(cat, 'indigestion', now, 0.25)
      }
      cat.stats.meals += eaten / 15
    }
  }

  // --- Beber ---
  const canDrink = catchup || (cat.behavior === 'drink' && atSpot(cat, SPOTS.water))
  if (canDrink && n.thirst < 62 && cat.bowl.water > 0) {
    // A fonte mantém a água circulando: ela não envelhece, e é exatamente por
    // isso que donos de gato compram uma.
    const circulating = (cat.inventory.items.fountain ?? 0) > 0
    const staleness = circulating ? 0 : (now - cat.bowl.waterFilledAt) / (2 * MS_DAY)
    if (staleness < 1.2) {
      const wanted = Math.max(0, (90 - n.thirst) / POINTS_PER_ML)
      const ml = Math.min(cat.bowl.water, wanted, 90 * hours)
      cat.bowl.water -= ml
      n.thirst = clamp(n.thirst + ml * POINTS_PER_ML)
    }
  }

  // --- Caixa de areia ---
  const canRelieve = catchup || (cat.behavior === 'litter' && atSpot(cat, SPOTS.litter))
  if (canRelieve && n.bladder < 18) {
    const filth = litterFilth(cat, now)
    if (filth < 0.85) {
      n.bladder = 100
      cat.litter.uses += 1
    } else {
      // Caixa imunda: o gato faz fora dela. Sujeira, estresse e risco de infecção.
      n.bladder = 100
      n.hygiene = clamp(n.hygiene - 18)
      cat.stress = clamp(cat.stress + 12)
      if (Math.random() < 0.05) addIllness(cat, 'uti', now, 0.3)
    }
  }

  // --- Auto-higiene ---
  if (!isBusy(cat) && n.hygiene < 70 && Math.random() < 0.15 * hours * 60) {
    n.hygiene = clamp(n.hygiene + 6)
    // Lamber demais sem escovação acumula bolas de pelo.
    if (n.hygiene < 45 && Math.random() < 0.03) addIllness(cat, 'hairball', now, 0.2)
  }
}

function isBusy(cat: CatState) {
  return cat.behavior === 'sleep' || cat.behavior === 'eat' || cat.behavior === 'drink'
}

function healthStep(cat: CatState, now: number, hours: number) {
  const n = cat.needs
  let damage = 0

  // Calibrado para que a negligência total leve cerca de cinco a seis dias até
  // a perda — que é o tempo que um gato realmente resiste sem água, e a janela
  // mínima para o dono perceber os sinais, notar a mudança e agir. Mais rápido
  // que isso vira punição por viajar, não consequência de descuido.
  if (n.hunger < 12) damage += (12 - n.hunger) * 0.022
  if (n.thirst < 10) damage += (10 - n.thirst) * 0.038
  if (n.hygiene < 20) damage += 0.06
  if (litterFilth(cat, now) > 0.9) damage += 0.08
  if (cat.stress > 80) damage += (cat.stress - 80) * 0.012

  // Doenças não tratadas pioram sozinhas.
  for (const ill of cat.illnesses) {
    ill.severity = Math.min(1, ill.severity + 0.012 * hours)
    damage += ill.severity * 0.22
  }

  // Condições crônicas geram doença.
  if (n.thirst < 8 && Math.random() < 0.02 * hours * 60) addIllness(cat, 'dehydration', now, 0.3)
  if (now - cat.lastVetVisit > 180 * MS_DAY && Math.random() < 0.004 * hours * 60) {
    addIllness(cat, 'worms', now, 0.2)
  }

  if (damage > 0) {
    cat.health = clamp(cat.health - damage * hours)
  } else {
    cat.health = clamp(cat.health + 1.6 * hours)
  }

  // --- Estresse ---
  let stressPush = -1.8 // decai sozinho num ambiente estável
  if (n.hunger < 25) stressPush += 2.2
  if (n.bladder < 12) stressPush += 2.5
  if (litterFilth(cat, now) > 0.7) stressPush += 1.8
  if (cat.illnesses.length > 0) stressPush += 2.0
  if (cat.health < 50) stressPush += 1.5
  cat.stress = clamp(cat.stress + stressPush * hours)

  // --- Vínculo ---
  // A confiança sobe apenas quando as necessidades básicas estão em dia.
  const wellCared = n.hunger > 55 && n.thirst > 55 && cat.health > 75 && cat.stress < 45
  cat.bond = clamp(cat.bond + (wellCared ? 0.32 : -0.5) * hours)

  if (cat.health <= 0 && !cat.died) {
    cat.died = now
    cat.causeOfDeath = deathCause(cat)
  }
}

/**
 * A causa registrada no memorial. Não é para culpar ninguém: é para o dono
 * entender o que aconteceu, que é a única forma de aprender com a perda.
 */
function deathCause(cat: CatState): string {
  const n = cat.needs
  if (n.thirst < 10) return 'Desidratação'
  if (n.hunger < 10) return 'Inanição'
  const worst = [...cat.illnesses].sort((a, b) => b.severity - a.severity)[0]
  if (worst) return `${ILLNESS_LABEL[worst.kind]} sem tratamento`
  return 'Saúde debilitada por tempo demais'
}

/** Está vivo? Um gato morto não simula mais nada. */
export function isAlive(cat: CatState): boolean {
  return cat.died === null
}

/**
 * Faixa crítica: a saúde já caiu o bastante para a perda ser questão de dias.
 * O jogo não avisa o dono disso — mas usa para liberar a emergência.
 */
export function isCritical(cat: CatState): boolean {
  return cat.health < 38
}

export const ILLNESS_LABEL: Record<IllnessKind, string> = {
  dehydration: 'Desidratação',
  hairball: 'Bola de pelo',
  worms: 'Vermes',
  uti: 'Infecção urinária',
  cold: 'Resfriado',
  indigestion: 'Indigestão',
}

export const ILLNESS_SIGN: Record<IllnessKind, string> = {
  dehydration: 'Letárgico, pele sem elasticidade',
  hairball: 'Engasgos secos e recusa de comida',
  worms: 'Emagrecendo mesmo comendo',
  uti: 'Vai à caixa toda hora e mia de dor',
  cold: 'Espirros e olhos lacrimejando',
  indigestion: 'Vomitou e está sem apetite',
}

export function isTreatableAtHome(kind: IllnessKind): boolean {
  return kind === 'hairball' || kind === 'worms' || kind === 'cold' || kind === 'indigestion'
}

export function cure(cat: CatState, kind: IllnessKind) {
  cat.illnesses = cat.illnesses.filter((i) => i.kind !== kind)
}

export type { Illness }
