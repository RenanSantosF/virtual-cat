import type { LifeStage } from './types'

export const MS_DAY = 86_400_000
export const MS_WEEK = 7 * MS_DAY
export const MS_MONTH = 30.4375 * MS_DAY
export const MS_YEAR = 365.25 * MS_DAY

/** Idade com que o gato chega até você — a mesma em que um filhote real é desmamado. */
export const ADOPTION_AGE = 8 * MS_WEEK

/**
 * Curva de peso de um gato doméstico de porte médio, em kg por mês de vida.
 * Valores de referência veterinária: ~100 g ao nascer, ~450 g/mês no primeiro
 * semestre, estabilizando por volta dos 12 meses.
 */
const WEIGHT_CURVE: Array<[months: number, kg: number]> = [
  [0, 0.1],
  [0.5, 0.25],
  [1, 0.45],
  [2, 0.9],
  [3, 1.4],
  [4, 1.9],
  [5, 2.35],
  [6, 2.7],
  [8, 3.2],
  [10, 3.7],
  [12, 4.0],
  [18, 4.35],
  [24, 4.5],
  [96, 4.6],
  [180, 4.2],
]

function interp(curve: Array<[number, number]>, x: number): number {
  if (x <= curve[0][0]) return curve[0][1]
  const last = curve[curve.length - 1]
  if (x >= last[0]) return last[1]
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i]
    const [x1, y1] = curve[i + 1]
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0)
      // Suavização cúbica para não haver "degraus" visíveis no crescimento.
      const s = t * t * (3 - 2 * t)
      return y0 + (y1 - y0) * s
    }
  }
  return last[1]
}

export function ageMs(birth: number, now: number): number {
  return Math.max(0, now - birth)
}

export function ageMonths(birth: number, now: number): number {
  return ageMs(birth, now) / MS_MONTH
}

/** Peso corporal em kg, derivado da idade real em tempo de calendário. */
export function weightKg(birth: number, now: number): number {
  return interp(WEIGHT_CURVE, ageMonths(birth, now))
}

/**
 * Escala visual do modelo, relativa ao gato adulto (1.0).
 * Massa cresce com o cubo do comprimento, então a escala linear é a raiz cúbica
 * da razão de peso — é assim que um filhote parece proporcionalmente correto.
 */
export function bodyScale(birth: number, now: number): number {
  const adult = 4.5
  return Math.cbrt(weightKg(birth, now) / adult)
}

/**
 * Filhotes não são adultos em miniatura: a cabeça é proporcionalmente enorme,
 * as patas são curtas e os olhos ocupam mais espaço no rosto. Este fator
 * multiplica a cabeça e decresce até 1.0 na idade adulta.
 */
export function neotenyFactor(birth: number, now: number): number {
  const m = ageMonths(birth, now)
  if (m >= 12) return 1
  return 1 + 0.42 * Math.pow(1 - m / 12, 1.6)
}

export function lifeStage(birth: number, now: number): LifeStage {
  const m = ageMonths(birth, now)
  if (m < 6) return 'kitten'
  if (m < 12) return 'junior'
  if (m < 84) return 'adult'
  if (m < 132) return 'mature'
  return 'senior'
}

export const STAGE_LABEL: Record<LifeStage, string> = {
  kitten: 'Filhote',
  junior: 'Jovem',
  adult: 'Adulto',
  mature: 'Maduro',
  senior: 'Idoso',
}

/** Idade escrita como um veterinário escreveria. */
export function ageLabel(birth: number, now: number): string {
  const ms = ageMs(birth, now)
  const days = ms / MS_DAY
  if (days < 14) {
    const d = Math.floor(days)
    return `${d} ${d === 1 ? 'dia' : 'dias'}`
  }
  if (days < 90) {
    const w = Math.floor(days / 7)
    return `${w} semanas`
  }
  const months = ms / MS_MONTH
  if (months < 24) {
    const mo = Math.floor(months)
    return `${mo} ${mo === 1 ? 'mês' : 'meses'}`
  }
  const years = Math.floor(ms / MS_YEAR)
  const rem = Math.floor((ms % MS_YEAR) / MS_MONTH)
  return rem > 0 ? `${years}a ${rem}m` : `${years} anos`
}

/**
 * Multiplicador metabólico. Filhotes queimam energia muito mais rápido:
 * comem de 4 a 6 vezes por dia e dormem até 20 h.
 */
export function metabolism(birth: number, now: number): number {
  const m = ageMonths(birth, now)
  if (m < 2) return 1.85
  if (m < 6) return 1.0 + (1.85 - 1.0) * (1 - (m - 2) / 4)
  if (m < 12) return 1.0
  if (m < 120) return 0.95
  return 0.85
}
