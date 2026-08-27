import type { CatState, IllnessKind } from './types'
import { litterFilth } from './engine'

/**
 * O que um gato doente mostra, e o que ele esconde.
 *
 * Gato é presa: esconder fraqueza é instinto de sobrevivência. Por isso o jogo
 * nunca nomeia a doença — ele descreve o que dá para ver de fora. Nomear o
 * quadro é trabalho do veterinário, e é por isso que a consulta importa.
 */

/** Sinais que o dono percebe observando o gato de perto. */
export const SIGNS: Record<IllnessKind, string[]> = {
  dehydration: [
    'A pele da nuca demora a voltar ao lugar quando você levanta',
    'A gengiva está pegajosa, não úmida',
    'Passou o dia inteiro no mesmo canto',
  ],
  hairball: [
    'Engasgos secos, de peito, sem sair nada',
    'Cheirou a ração e foi embora',
    'Está se lambendo mais que o normal',
  ],
  worms: [
    'A barriga está redonda demais para o quanto ele come',
    'O pelo perdeu o brilho e está áspero',
    'Você reparou nele mais magro nas costelas',
  ],
  uti: [
    'Entra na caixa toda hora e sai sem fazer nada',
    'Miou dentro da caixa',
    'Está se lambendo insistentemente na barriga',
  ],
  cold: [
    'Espirrou várias vezes seguidas',
    'Os olhos estão lacrimejando',
    'A respiração está ruidosa',
  ],
  indigestion: [
    'Vomitou num canto',
    'Não encostou na comida desde ontem',
    'Está encolhido, com as patas dobradas sob o peito',
  ],
}

/** Sinais gerais de que algo não vai bem, sem apontar o quê. */
export const GENERAL_SIGNS = [
  'O pelo está embaraçado — faz dias que ele não se lambe',
  'Se esconde quando você chega perto',
  'Não veio comer nem quando você serviu',
  'Os olhos estão semicerrados o tempo todo',
  'Está mais quieto do que o normal',
]

/**
 * O que o dono vê ao examinar o gato agora.
 * A lista cresce conforme a doença avança: no começo quase não há o que notar,
 * que é exatamente o que torna a observação difícil e o cuidado real.
 */
export function examine(cat: CatState, now: number): string[] {
  const out: string[] = []
  for (const ill of cat.illnesses) {
    const signs = SIGNS[ill.kind]
    // Quanto mais grave, mais sinais aparecem.
    const n = ill.severity < 0.25 ? 1 : ill.severity < 0.6 ? 2 : 3
    for (let i = 0; i < Math.min(n, signs.length); i++) out.push(signs[i])
  }
  if (cat.needs.hygiene < 40) out.push(GENERAL_SIGNS[0])
  if (cat.stress > 70) out.push(GENERAL_SIGNS[1])
  if (cat.needs.hunger < 30 && cat.bowl.food > 5) out.push(GENERAL_SIGNS[2])
  if (cat.health < 60) out.push(GENERAL_SIGNS[3])
  if (cat.health < 45) out.push(GENERAL_SIGNS[4])
  if (litterFilth(cat, now) > 0.7) out.push('A caixa está suja o bastante para ele evitar usá-la')

  // Sem repetições e em ordem estável.
  return [...new Set(out)]
}

/** Quão doente ele está, 0..1 — usado para a postura e o comportamento. */
export function sickness(cat: CatState): number {
  const fromIllness = cat.illnesses.reduce((a, i) => a + i.severity, 0)
  const fromHealth = Math.max(0, (70 - cat.health) / 70)
  return Math.min(1, fromIllness * 0.8 + fromHealth)
}

/** Doenças que dão sinal visível de imediato, para o gato "atuar" o sintoma. */
export function activeSymptomBehavior(cat: CatState): 'retch' | 'sneeze' | null {
  for (const ill of cat.illnesses) {
    if (ill.kind === 'hairball' || ill.kind === 'indigestion') return 'retch'
    if (ill.kind === 'cold') return 'sneeze'
  }
  return null
}
