import { crepuscularDrive, foodSpoilage, litterFilth } from '../sim/engine'
import { activeSymptomBehavior, sickness } from '../sim/symptoms'
import { ageMonths } from '../sim/growth'
import { clampToRoom, dist, ROOM, SPOTS } from '../sim/world'
import type { BehaviorId, CatState } from '../sim/types'

/** Estado efêmero — não é salvo, existe só enquanto o app está aberto. */
export interface Runtime {
  /** Onde o brinquedo/dedo está no chão, se o jogador estiver provocando. */
  lure: [number, number] | null
  lureMovedAt: number
  /** O jogador está fazendo carinho agora. */
  petting: boolean
  /** Quanto o gato aguenta de manuseio antes de se irritar, 0..1. */
  patience: number
  /** Susto recente (barulho, movimento brusco). */
  spookUntil: number
  /** Última fala/balão exibido. */
  say: string | null
  sayUntil: number
  /** Fase interna das animações procedurais. */
  phase: number
}

export function newRuntime(): Runtime {
  return {
    lure: null,
    lureMovedAt: 0,
    petting: false,
    patience: 1,
    spookUntil: 0,
    say: null,
    sayUntil: 0,
    phase: 0,
  }
}

/** Quanto tempo, no mínimo, o gato mantém cada comportamento (ms). */
const MIN_DURATION: Partial<Record<BehaviorId, number>> = {
  retch: 6_000,
  sneeze: 3_500,
  limp: 12_000,
  sleep: 25 * 60_000,
  doze: 6 * 60_000,
  groom: 40_000,
  eat: 30_000,
  drink: 12_000,
  litter: 20_000,
  stretch: 4_000,
  knead: 18_000,
  watch: 60_000,
  sit: 15_000,
  hide: 90_000,
  run: 6_000,
  play: 20_000,
  walk: 5_000,
}

interface Candidate {
  id: BehaviorId
  score: number
  target?: [number, number] | null
}

/**
 * Pontua cada comportamento possível e devolve o mais urgente. Não é uma
 * máquina de estados rígida: é uma disputa contínua entre impulsos, e é por
 * isso que o gato às vezes escolhe a soneca em vez de vir até você.
 */
export function chooseBehavior(cat: CatState, rt: Runtime, now: number): Candidate {
  const n = cat.needs
  const p = cat.personality
  const drive = crepuscularDrive(now)
  const months = ageMonths(cat.birth, now)
  const kitten = months < 6
  const c: Candidate[] = []

  const need = (v: number) => Math.max(0, 100 - v)

  // Medo domina tudo o mais.
  if (now < rt.spookUntil) {
    c.push({ id: 'hide', score: 400 * (0.4 + p.timidity), target: SPOTS.bed })
  }
  if (cat.stress > 82) {
    c.push({ id: 'hide', score: (cat.stress - 82) * 9 * (0.5 + p.timidity), target: SPOTS.bed })
  }

  // Necessidades fisiológicas, por urgência.
  if (n.bladder < 35) {
    // Caixa suja faz o gato adiar a ida — e adiar é exatamente como surge a
    // infecção urinária e o xixi fora do lugar.
    const reluctance = 1 - litterFilth(cat, now) * 0.55
    c.push({ id: 'litter', score: need(n.bladder) * 3.2 * reluctance, target: SPOTS.litter })
  }

  const foodOk = cat.bowl.food > 1 && foodSpoilage(cat, now) < 0.95
  if (foodOk) {
    const appetite = need(n.hunger) * (1 + p.gluttony * 0.5) * (kitten ? 1.4 : 1)
    c.push({ id: 'eat', score: appetite * 2.4, target: SPOTS.bowl })
  }
  if (cat.bowl.water > 1) {
    c.push({ id: 'drink', score: need(n.thirst) * 2.0, target: SPOTS.water })
  }

  // Fome sem comida no pote: ele vem cobrar de você.
  if (!foodOk && n.hunger < 45) {
    c.push({ id: 'meow', score: need(n.hunger) * 1.9 * (0.4 + p.vocality) })
  }

  // Sono. O impulso de dormir é enorme e é atenuado pelo pico crepuscular.
  const sleepiness = need(n.energy) * (kitten ? 1.5 : 1.15) * (1.3 - drive * 0.55)
  c.push({ id: 'sleep', score: sleepiness * 1.5, target: SPOTS.bed })
  c.push({ id: 'doze', score: sleepiness * 0.85 })

  // Brincar. Só acontece com energia sobrando.
  const energyAvail = Math.max(0, n.energy - 25) / 75
  const playDrive = need(n.stimulation) * energyAvail * (0.5 + p.energy) * (kitten ? 1.6 : 1)
  if (rt.lure) {
    // Um brinquedo em movimento é quase irresistível — mas exige energia.
    const fresh = now - rt.lureMovedAt < 2500 ? 1 : 0.35
    const interest = (0.4 + p.curiosity + p.energy) * energyAvail * fresh
    c.push({ id: 'stalk', score: 190 * interest, target: rt.lure })
  }
  c.push({ id: 'play', score: playDrive * 1.25, target: randomSpot(cat, now) })
  // Zoomies: surto súbito, típico do fim da tarde.
  if (n.energy > 72 && n.stimulation < 45 && drive > 0.55) {
    c.push({ id: 'run', score: 120 * p.energy * drive })
  }

  // Higiene: sempre se lambe depois de comer.
  const justAte = cat.behavior === 'eat' && now - cat.behaviorSince > 20_000
  c.push({ id: 'groom', score: need(n.hygiene) * 1.15 + (justAte ? 150 : 0) })

  // Social. Depende de vínculo e sociabilidade — um gato arisco simplesmente não vem.
  const social = need(n.affection) * (0.15 + p.sociability) * (cat.bond / 100) * 1.6
  c.push({ id: 'rub', score: social })
  if (cat.bond > 55 && cat.stress < 35) {
    c.push({ id: 'knead', score: 45 * (cat.bond / 100) * (1 - p.independence * 0.6), target: SPOTS.bed })
  }

  // Observar a janela — o passatempo favorito de qualquer gato.
  c.push({ id: 'watch', score: 40 * (0.3 + p.curiosity) * drive, target: SPOTS.window })

  // Ócio de base, para nunca ficar sem opção.
  c.push({ id: 'sit', score: 22 })
  c.push({ id: 'walk', score: 26 * (0.4 + p.curiosity) * drive, target: randomSpot(cat, now) })

  // --- Doença ---
  // O gato não avisa que está doente: ele muda de comportamento, e cabe ao dono
  // reparar. Fica apático, se esconde, para de se lamber e, de vez em quando,
  // deixa escapar o sintoma — um engasgo, um espirro.
  const sick = sickness(cat)
  if (sick > 0.05) {
    c.push({ id: 'doze', score: 120 * sick, target: SPOTS.bed })
    // Doente, ele procura canto quieto em vez de companhia.
    c.push({ id: 'hide', score: 70 * sick * (0.4 + p.timidity), target: SPOTS.bed })
    const symptom = activeSymptomBehavior(cat)
    if (symptom) {
      // O sintoma aparece em surtos curtos: a maior parte do tempo ele parece
      // apenas "meio quieto", que é o que engana o dono desatento.
      const bucket = Math.floor(now / 40_000)
      const r = Math.abs(Math.sin(bucket * 41.7 + cat.seed))
      if (r < 0.18 + sick * 0.3) c.push({ id: symptom, score: 500 })
    }
    if (sick > 0.5) c.push({ id: 'limp', score: 60 * sick, target: randomSpot(cat, now) })
  }

  // Histerese: o comportamento atual leva vantagem, então ele não fica trocando
  // de ideia a cada frame como um robô.
  const elapsed = now - cat.behaviorSince
  const minDur = MIN_DURATION[cat.behavior] ?? 3_000
  for (const cand of c) {
    if (cand.id === cat.behavior) cand.score *= elapsed < minDur ? 3.0 : 1.25
  }
  if (elapsed < minDur) {
    const current = c.find((x) => x.id === cat.behavior)
    if (current) current.score += 250
  }

  c.sort((a, b) => b.score - a.score)
  return c[0]
}

function randomSpot(cat: CatState, now: number): [number, number] {
  // Determinístico dentro de uma mesma janela de tempo, para não tremer.
  const bucket = Math.floor(now / 4000)
  const r1 = Math.sin(bucket * 12.9898 + cat.seed) * 43758.5453
  const r2 = Math.sin(bucket * 78.233 + cat.seed) * 43758.5453
  const fx = r1 - Math.floor(r1)
  const fy = r2 - Math.floor(r2)
  return clampToRoom([(fx * 2 - 1) * ROOM.halfW, (fy * 2 - 1) * ROOM.halfD])
}

/** Velocidade de deslocamento, em m/s, para o comportamento atual. */
export function moveSpeed(cat: CatState): number {
  switch (cat.behavior) {
    case 'run':
      return 3.4
    case 'stalk':
      return 0.42
    case 'pounce':
      return 4.2
    case 'play':
      return 1.5
    case 'walk':
      return 0.62
    case 'hide':
      return 1.8
    case 'limp':
      return 0.28
    default:
      return 0.55
  }
}

/** Move o gato em direção ao alvo. Chamado a cada frame com dt em segundos. */
export function locomote(cat: CatState, dt: number) {
  if (!cat.target) return
  const d = dist(cat.pos, cat.target)
  if (d < 0.06) {
    cat.target = null
    return
  }
  const speed = moveSpeed(cat)
  const dx = cat.target[0] - cat.pos[0]
  const dy = cat.target[1] - cat.pos[1]
  const want = Math.atan2(dx, dy)

  // Gira antes de andar — gatos não deslizam de lado.
  let diff = want - cat.facing
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  const turnRate = 4.5
  const turn = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff))
  cat.facing += turn

  // Só avança de fato quando já está mais ou menos apontado para o alvo.
  const alignment = Math.max(0, Math.cos(diff))
  const step = Math.min(d, speed * alignment * dt)
  cat.pos[0] += Math.sin(cat.facing) * step
  cat.pos[1] += Math.cos(cat.facing) * step
}

/** Comportamentos que exigem estar num lugar específico. */
export function isStationary(b: BehaviorId): boolean {
  return (
    b === 'sleep' || b === 'doze' || b === 'sit' || b === 'groom' || b === 'knead' ||
    b === 'watch' || b === 'eat' || b === 'drink' || b === 'litter' || b === 'meow' ||
    b === 'purr' || b === 'stretch' || b === 'hide' || b === 'retch' || b === 'sneeze'
  )
}

export const BEHAVIOR_LABEL: Record<BehaviorId, string> = {
  sleep: 'Dormindo',
  doze: 'Cochilando',
  idle: 'Parado',
  sit: 'Sentado',
  walk: 'Andando',
  run: 'Correndo pela casa',
  stretch: 'Se espreguiçando',
  groom: 'Se lambendo',
  eat: 'Comendo',
  drink: 'Bebendo água',
  litter: 'Na caixa de areia',
  play: 'Brincando',
  stalk: 'Espreitando',
  pounce: 'Dando o bote',
  knead: 'Amassando pãozinho',
  rub: 'Se esfregando em você',
  watch: 'Olhando a janela',
  meow: 'Miando pra você',
  hide: 'Escondido',
  purr: 'Ronronando',
  retch: 'Engasgando',
  sneeze: 'Espirrando',
  limp: 'Andando devagar',
}

/** Frases curtas para o balão — sempre observacionais, nunca "falando". */
export function flavor(cat: CatState, b: BehaviorId): string | null {
  const p = cat.personality
  switch (b) {
    case 'meow':
      return p.vocality > 0.6 ? 'Miaaaaau!' : 'Miau.'
    case 'purr':
      return 'rrrrrrr...'
    case 'knead':
      return 'rrrrrrr...'
    case 'run':
      return null
    case 'hide':
      return cat.stress > 80 ? '...' : null
    case 'retch':
      return 'hhhk... hhhk...'
    case 'sneeze':
      return 'atchim!'
    default:
      return null
  }
}
