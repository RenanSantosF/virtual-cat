import { ageLabel, weightKg } from './growth'
import { describe } from './personality'
import type { CatState } from './types'

/**
 * O registro dos gatos que se foram.
 *
 * A personalidade é sorteada de sete traços contínuos a partir da semente, e a
 * semente nunca se repete: nenhum gato seguinte terá o mesmo temperamento que
 * este teve. É por isso que a perda pesa — e é por isso que o memorial guarda
 * quem ele era, não só quanto tempo durou.
 */
export interface MemorialEntry {
  name: string
  seed: number
  birth: number
  died: number
  cause: string
  weight: number
  traits: string[]
  daysCaredFor: number
  meals: number
  plays: number
  pets: number
  vetVisits: number
  bond: number
}

const KEY = 'virtual-cat:memorials:v1'

export function readMemorials(): MemorialEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function toMemorial(cat: CatState): MemorialEntry {
  const died = cat.died ?? Date.now()
  return {
    name: cat.name,
    seed: cat.seed,
    birth: cat.birth,
    died,
    cause: cat.causeOfDeath ?? 'Causa não registrada',
    weight: weightKg(cat.birth, died),
    traits: describe(cat.personality),
    daysCaredFor: cat.stats.daysCaredFor,
    meals: Math.round(cat.stats.meals),
    plays: cat.stats.plays,
    pets: cat.stats.pets,
    vetVisits: cat.stats.vetVisits,
    bond: Math.round(cat.bond),
  }
}

export function saveMemorial(cat: CatState) {
  try {
    const list = readMemorials()
    if (list.some((m) => m.seed === cat.seed && m.birth === cat.birth)) return
    list.unshift(toMemorial(cat))
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40)))
  } catch {
    /* armazenamento indisponível */
  }
}

/** Quanto tempo ele viveu, escrito como se conta a vida de um gato. */
export function lifespan(m: MemorialEntry): string {
  return ageLabel(m.birth, m.died)
}
