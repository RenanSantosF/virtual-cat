import { bell, rng } from './random'
import type { Personality } from './types'

export function makePersonality(seed: number): Personality {
  const r = rng(seed ^ 0x9e3779b9)
  return {
    sociability: bell(r),
    energy: bell(r),
    timidity: bell(r),
    gluttony: bell(r),
    curiosity: bell(r),
    vocality: bell(r),
    independence: bell(r),
  }
}

/** Descrições que o jogador vê depois de conviver com o gato tempo suficiente. */
export function describe(p: Personality): string[] {
  const out: string[] = []
  if (p.sociability > 0.66) out.push('Grudento — te segue pela casa')
  else if (p.sociability < 0.33) out.push('Reservado — chega quando quer')
  if (p.energy > 0.66) out.push('Elétrico — tem surtos de correria')
  else if (p.energy < 0.33) out.push('Preguiçoso — dorme o dia inteiro')
  if (p.timidity > 0.66) out.push('Medroso — se esconde com barulho')
  else if (p.timidity < 0.3) out.push('Corajoso — não se assusta com nada')
  if (p.gluttony > 0.7) out.push('Guloso — sempre acha que não comeu')
  if (p.curiosity > 0.7) out.push('Curioso — investiga tudo que é novo')
  if (p.vocality > 0.7) out.push('Falante — mia para conversar')
  else if (p.vocality < 0.25) out.push('Silencioso — quase não mia')
  if (p.independence > 0.7) out.push('Independente — não gosta de colo demais')
  return out
}
