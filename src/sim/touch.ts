import { clamp } from './random'
import type { Runtime } from '../ai/brain'
import type { CatState } from './types'

/** Onde o dedo encostou. */
export type TouchRegion = 'head' | 'chin' | 'back' | 'tailbase' | 'belly' | 'paw' | 'tail'

export const REGION_LABEL: Record<TouchRegion, string> = {
  head: 'cabeça',
  chin: 'queixo',
  back: 'dorso',
  tailbase: 'base da cauda',
  belly: 'barriga',
  paw: 'pata',
  tail: 'cauda',
}

/**
 * Quanto cada parte do corpo é bem-vinda ao toque, de -1 a 1.
 *
 * Não é arbitrário: gato gosta de contato onde ele próprio se esfrega em você
 * — bochecha, queixo, base da cauda, onde ficam as glândulas de cheiro. E
 * detesta onde é vulnerável: barriga, patas e a cauda. A barriga exposta é
 * confiança, não convite; quem cai nessa leva mordida.
 */
const WELCOME: Record<TouchRegion, number> = {
  head: 0.8,
  chin: 1.0,
  back: 0.55,
  tailbase: 0.9,
  belly: -0.9,
  paw: -0.5,
  tail: -0.7,
}

export interface TouchResult {
  /** Reação imediata, se houver. */
  behavior?: CatState['behavior']
  /** Frase curta para o balão. */
  say?: string | null
  /** Se o gato saiu de perto. */
  retreat: boolean
}

/**
 * Um toque. O resultado depende da região, do vínculo, do estresse e de onde o
 * gato estava com a cabeça — acordar um gato dormindo nunca é bem recebido.
 */
export function touch(
  cat: CatState,
  rt: Runtime,
  region: TouchRegion,
  now: number,
): TouchResult {
  const p = cat.personality
  const welcome = WELCOME[region]
  const trust = cat.bond / 100
  const calm = 1 - cat.stress / 100

  // Acordar custa caro, seja onde for.
  if (cat.behavior === 'sleep') {
    cat.stress = clamp(cat.stress + 9)
    cat.bond = clamp(cat.bond - 0.8)
    cat.behavior = 'doze'
    cat.behaviorSince = now
    return { retreat: false, say: null }
  }

  // Um gato arisco não deixa encostar em lugar nenhum, e a barriga só é
  // tolerada por um gato que confia muito e está muito relaxado.
  const tolerance = welcome + trust * 0.6 + calm * 0.4 - p.independence * 0.5
  cat.stats.pets += 1

  if (tolerance > 0.75) {
    cat.needs.affection = clamp(cat.needs.affection + 12)
    cat.bond = clamp(cat.bond + 0.5)
    cat.stress = clamp(cat.stress - 6)
    rt.patience = Math.min(1, rt.patience + 0.1)
    // Ele empurra a cabeça de volta contra a sua mão.
    cat.behavior = region === 'chin' || region === 'head' ? 'purr' : 'rub'
    cat.behaviorSince = now
    return { retreat: false, say: 'rrrrrrr...' }
  }

  if (tolerance > 0.25) {
    cat.needs.affection = clamp(cat.needs.affection + 6)
    cat.bond = clamp(cat.bond + 0.15)
    cat.stress = clamp(cat.stress - 2)
    rt.patience = Math.max(0, rt.patience - 0.08)
    if (cat.behavior !== 'purr' && cat.needs.affection > 55 && p.sociability > 0.4) {
      cat.behavior = 'purr'
      cat.behaviorSince = now
    }
    return { retreat: false, say: null }
  }

  if (tolerance > -0.25) {
    // Aceita a contragosto: a cauda começa a bater.
    cat.stress = clamp(cat.stress + 4)
    rt.patience = Math.max(0, rt.patience - 0.25)
    return { retreat: false, say: null }
  }

  // Passou do limite. Ele avisa e sai — ou agarra a mão.
  cat.stress = clamp(cat.stress + 14)
  cat.bond = clamp(cat.bond - 1.2)
  rt.patience = 0
  const bites = region === 'belly' && cat.stress > 40
  cat.behavior = bites ? 'pounce' : 'walk'
  cat.behaviorSince = now
  cat.target = null
  return {
    retreat: true,
    say: bites ? 'MRRAU!' : null,
  }
}

/** Mensagem que a interface mostra depois de uma reação ruim. */
export function touchHint(region: TouchRegion, res: TouchResult): string | null {
  if (!res.retreat) return null
  if (region === 'belly') return 'A barriga é armadilha. Ele mostra, mas não é convite.'
  if (region === 'paw') return 'Ele puxou a pata. Gato não gosta que mexam nelas.'
  if (region === 'tail') return 'Ele tirou a cauda do alcance.'
  return 'Ele saiu de perto. Não estava a fim.'
}
