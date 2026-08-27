import { ageMonths } from '../sim/growth'
import { clampToRoom, dist, ROOM } from '../sim/world'
import type { CatState } from '../sim/types'

/**
 * Locomoção como sistema próprio, separado do comportamento.
 *
 * Antes, decidir "comer" trocava a pose para "comendo" na mesma hora — e o gato
 * ainda estava a um metro do pote, então deslizava até lá com as patas paradas.
 * Aqui a intenção e o deslocamento são coisas distintas: enquanto houver
 * distância até o destino, o corpo está ANDANDO, e o comportamento só começa
 * quando ele chega e para.
 */

export type Gait = 'still' | 'creep' | 'walk' | 'trot' | 'run'

export interface Motion {
  gait: Gait
  /** Velocidade atual em m/s, com aceleração e frenagem reais. */
  speed: number
  /** Fase da passada, contínua entre quadros. */
  stridePhase: number
  /** Direção que o corpo encara, em radianos. */
  facing: number
  /** Velocidade angular atual, para a curva ter inércia. */
  turnRate: number
  /** Oscilação lateral do filhote que ainda não firmou as pernas. */
  wobble: number
  /** Tempo restante de uma parada não planejada. */
  pauseFor: number
  /** 0..1 — tropeço em andamento. */
  stumble: number
  /** Marcha do quadro anterior, para saber quando houve troca. */
  prevGait: Gait
}

export function newMotion(facing = 0): Motion {
  return {
    gait: 'still', speed: 0, stridePhase: 0, facing, turnRate: 0,
    wobble: 0, pauseFor: 0, stumble: 0, prevGait: 'still',
  }
}

/** Velocidade máxima de cada marcha, em m/s, para um gato adulto. */
const GAIT_SPEED: Record<Gait, number> = {
  still: 0,
  creep: 0.22,
  walk: 0.55,
  trot: 1.35,
  run: 3.2,
}

/** Distância percorrida por ciclo completo de passada, em metros. */
const STRIDE_LENGTH: Record<Gait, number> = {
  still: 1,
  creep: 0.14,
  walk: 0.30,
  trot: 0.52,
  run: 1.05,
}

/**
 * Coordenação motora por idade, 0..1.
 *
 * Um filhote de oito semanas anda como quem acabou de aprender: passo curto,
 * corpo bambo, para no meio do caminho e às vezes senta o traseiro no chão sem
 * querer. Isso se firma por volta dos quatro meses.
 */
export function coordination(cat: CatState, now: number): number {
  const m = ageMonths(cat.birth, now)
  if (m >= 4) return 1
  if (m <= 1.5) return 0.25
  return 0.25 + 0.75 * ((m - 1.5) / 2.5)
}

/** Fração da velocidade adulta que ele consegue atingir nesta idade. */
export function speedFactor(cat: CatState, now: number): number {
  const m = ageMonths(cat.birth, now)
  if (m >= 8) return 1
  if (m <= 2) return 0.42
  return 0.42 + 0.58 * ((m - 2) / 6)
}

/** Qual marcha usar para cobrir esta distância com esta urgência. */
function chooseGait(distance: number, urgency: number, allowRun: boolean): Gait {
  if (distance < 0.09) return 'still'
  if (urgency > 0.85 && allowRun && distance > 1.1) return 'run'
  if (urgency > 0.5 && distance > 0.55) return 'trot'
  return 'walk'
}

export interface MotionInput {
  /** Destino no chão, ou null para ficar onde está. */
  target: [number, number] | null
  /** 0..1 — o quanto ele quer chegar rápido. */
  urgency: number
  /** Rastejar em vez de andar (espreitando uma presa). */
  creeping: boolean
  /** Energia disponível, 0..1: exausto não corre. */
  energy: number
  /** Coordenação motora, 0..1. */
  coord: number
  /** Multiplicador de velocidade por idade. */
  speedScale: number
}

const ACCEL = 2.6
const BRAKE = 4.2

/**
 * Avança a locomoção. Devolve true quando o gato chegou e parou — é esse o
 * momento em que o comportamento pode começar.
 */
export function stepMotion(cat: CatState, m: Motion, input: MotionInput, dt: number): boolean {
  m.prevGait = m.gait

  // Filhote para no meio do caminho sem motivo, como quem se distrai.
  if (m.pauseFor > 0) {
    m.pauseFor -= dt
    input = { ...input, target: null }
  } else if (input.target && input.coord < 0.9 && Math.random() < dt * (1 - input.coord) * 0.5) {
    m.pauseFor = 0.4 + Math.random() * 1.1
  }

  const d = input.target ? dist(cat.pos, input.target) : 0
  const arrived = !input.target || d < 0.09

  // --- Marcha desejada ---
  const allowRun = input.energy > 0.3 && input.coord > 0.6
  let want: Gait = input.creeping && !arrived ? 'creep' : chooseGait(d, input.urgency, allowRun)

  // Freia ao se aproximar: a distância necessária sai da própria velocidade.
  const braking = (m.speed * m.speed) / (2 * BRAKE) + 0.05
  if (!arrived && d < braking) want = m.speed > GAIT_SPEED.walk ? 'walk' : want

  const targetSpeed = GAIT_SPEED[arrived ? 'still' : want] * input.speedScale *
    (0.55 + 0.45 * input.coord)

  // --- Aceleração e frenagem ---
  const rate = targetSpeed > m.speed ? ACCEL : BRAKE
  const delta = targetSpeed - m.speed
  m.speed += Math.max(-rate * dt, Math.min(rate * dt, delta))
  if (m.speed < 0.02) m.speed = 0

  m.gait = m.speed < 0.03 ? 'still'
    : m.speed < GAIT_SPEED.creep * 1.4 && input.creeping ? 'creep'
    : m.speed < GAIT_SPEED.walk * 1.35 ? 'walk'
    : m.speed < GAIT_SPEED.trot * 1.25 ? 'trot'
    : 'run'

  // --- Direção, com inércia ---
  if (input.target && !arrived) {
    const dx = input.target[0] - cat.pos[0]
    const dz = input.target[1] - cat.pos[1]
    const want2 = Math.atan2(dx, dz)
    let diff = want2 - m.facing
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2

    // Gira mais devagar quanto mais rápido corre, como qualquer corpo com massa.
    const maxTurn = (5.2 - Math.min(3.6, m.speed * 1.1)) * (0.5 + input.coord * 0.5)
    const desired = Math.max(-maxTurn, Math.min(maxTurn, diff * 4))
    m.turnRate += (desired - m.turnRate) * Math.min(1, dt * 9)
    m.facing += m.turnRate * dt
  } else {
    m.turnRate += (0 - m.turnRate) * Math.min(1, dt * 6)
    m.facing += m.turnRate * dt
  }

  // --- Deslocamento ---
  // Só anda de fato quando já está mais ou menos apontado para o destino: gato
  // não desliza de lado.
  if (m.speed > 0) {
    let align = 1
    if (input.target && !arrived) {
      const want2 = Math.atan2(input.target[0] - cat.pos[0], input.target[1] - cat.pos[1])
      align = Math.max(0, Math.cos(want2 - m.facing))
    }
    const step = m.speed * align * dt
    cat.pos[0] += Math.sin(m.facing) * step
    cat.pos[1] += Math.cos(m.facing) * step
    const [cx, cz] = clampToRoom([cat.pos[0], cat.pos[1]])
    cat.pos[0] = cx
    cat.pos[1] = cz
  }

  // --- Passada ---
  // A fase vem da distância percorrida, não do relógio: assim a pata acompanha
  // o chão em qualquer velocidade e nunca patina.
  const strideLen = STRIDE_LENGTH[m.gait === 'still' ? 'walk' : m.gait] * input.speedScale
  m.stridePhase = (m.stridePhase + (m.speed / Math.max(0.05, strideLen)) * dt) % 1

  // --- Desengonço do filhote ---
  const clumsy = 1 - input.coord
  if (clumsy > 0.01 && m.speed > 0.05) {
    m.wobble = Math.sin(m.stridePhase * Math.PI * 2) * clumsy * 0.5 +
      Math.sin(m.stridePhase * Math.PI * 6.3 + 1.1) * clumsy * 0.22
    // Tropeço ocasional: o corpo cede por um instante e ele se recompõe.
    if (m.stumble <= 0 && Math.random() < dt * clumsy * 0.35) m.stumble = 1
  } else {
    m.wobble *= Math.max(0, 1 - dt * 4)
  }
  if (m.stumble > 0) m.stumble = Math.max(0, m.stumble - dt * 1.6)

  cat.facing = m.facing
  return arrived && m.speed === 0
}

/** Um ponto aleatório do cômodo, estável por alguns segundos. */
export function wanderTarget(cat: CatState, now: number): [number, number] {
  const bucket = Math.floor(now / 5000)
  const r1 = Math.sin(bucket * 12.9898 + cat.seed) * 43758.5453
  const r2 = Math.sin(bucket * 78.233 + cat.seed) * 43758.5453
  return clampToRoom([
    ((r1 - Math.floor(r1)) * 2 - 1) * ROOM.halfW * 0.85,
    ((r2 - Math.floor(r2)) * 2 - 1) * ROOM.halfD * 0.85,
  ])
}
