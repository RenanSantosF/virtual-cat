import { cure, ILLNESS_LABEL, litterFilth } from './engine'
import { ageMonths, MS_DAY } from './growth'
import { clamp } from './random'
import { SPOTS } from './world'
import type { Runtime } from '../ai/brain'
import type { CatState, FoodKind, ItemId } from './types'

export interface ShopEntry {
  id: ItemId
  name: string
  desc: string
  price: number
  /** Item permanente: comprado uma vez, usado para sempre. */
  durable?: boolean
}

export const SHOP: ShopEntry[] = [
  { id: 'kibble', name: 'Ração seca (200 g)', desc: 'Dura o dia todo no pote sem estragar.', price: 12 },
  { id: 'wet', name: 'Sachê úmido (85 g)', desc: 'Mais nutritivo e hidrata. Estraga em 4 h.', price: 20 },
  { id: 'kittenFormula', name: 'Ração de filhote (200 g)', desc: 'Calórica, para os 6 primeiros meses.', price: 25 },
  { id: 'treat', name: 'Petiscos', desc: 'Ganha confiança rápido. Não substitui refeição.', price: 8 },
  { id: 'litter', name: 'Areia sanitária', desc: 'Necessária para limpar a caixa.', price: 15 },
  { id: 'dewormer', name: 'Vermífugo', desc: 'Trata vermes.', price: 40 },
  { id: 'coldMedicine', name: 'Antigripal felino', desc: 'Trata resfriado.', price: 35 },
  { id: 'hairballPaste', name: 'Pasta anti-bola de pelo', desc: 'Trata bola de pelo e indigestão.', price: 30 },
  { id: 'brush', name: 'Escova', desc: 'Reduz queda de pelo e bolas de pelo.', price: 60, durable: true },
  { id: 'wand', name: 'Varinha com penas', desc: 'O melhor brinquedo para instinto de caça.', price: 45, durable: true },
  { id: 'ball', name: 'Bolinha', desc: 'Ele brinca sozinho com ela.', price: 20, durable: true },
  {
    id: 'fountain', name: 'Fonte de água', price: 180, durable: true,
    desc: 'Guarda 1,2 L e mantém a água em movimento — ele bebe mais e ela não envelhece.',
  },
]

export const VET_PRICE = 150
/** Internação de emergência: cara, dolorosa, e a última chance real. */
export const EMERGENCY_PRICE = 420

const FOOD_GRAMS: Record<FoodKind, number> = {
  kibble: 200,
  wet: 85,
  kittenFormula: 200,
  treat: 15,
}

export function has(cat: CatState, id: ItemId): boolean {
  return (cat.inventory.items[id] ?? 0) > 0
}

function consume(cat: CatState, id: ItemId): boolean {
  const n = cat.inventory.items[id] ?? 0
  if (n <= 0) return false
  const durable = SHOP.find((s) => s.id === id)?.durable
  if (!durable) cat.inventory.items[id] = n - 1
  return true
}

export type ActionResult = { ok: boolean; message: string }

export function buy(cat: CatState, id: ItemId): ActionResult {
  const entry = SHOP.find((s) => s.id === id)
  if (!entry) return { ok: false, message: 'Item inexistente.' }
  if (entry.durable && has(cat, id)) return { ok: false, message: 'Você já tem esse item.' }
  if (cat.inventory.coins < entry.price) return { ok: false, message: 'Moedas insuficientes.' }
  cat.inventory.coins -= entry.price
  cat.inventory.items[id] = (cat.inventory.items[id] ?? 0) + 1
  return { ok: true, message: `${entry.name} comprado.` }
}

export function serveFood(cat: CatState, kind: FoodKind, now: number): ActionResult {
  if (!consume(cat, kind as ItemId)) return { ok: false, message: 'Você não tem esse alimento.' }
  // Servir por cima de comida velha contamina a porção inteira.
  const stale = cat.bowl.food > 0 && cat.bowl.foodKind !== kind
  cat.bowl.food = stale ? FOOD_GRAMS[kind] : cat.bowl.food + FOOD_GRAMS[kind]
  cat.bowl.foodKind = kind
  cat.bowl.servedAt = now
  if (kind === 'treat') {
    cat.bond = clamp(cat.bond + 1.2)
    cat.stress = clamp(cat.stress - 4)
  }
  return { ok: true, message: 'Comida no pote.' }
}

/** Capacidade do bebedouro: o pote comum seca em pouco mais de um dia. */
export function waterCapacity(cat: CatState): number {
  return has(cat, 'fountain') ? 1200 : 320
}

export function fillWater(cat: CatState, now: number): ActionResult {
  const cap = waterCapacity(cat)
  cat.bowl.water = cap
  cat.bowl.waterFilledAt = now
  return {
    ok: true,
    message: has(cat, 'fountain') ? 'Fonte cheia. Dá para uns bons dias.' : 'Água fresca.',
  }
}

export function cleanLitter(cat: CatState, now: number): ActionResult {
  if (litterFilth(cat, now) < 0.05) return { ok: false, message: 'A caixa já está limpa.' }
  if (!consume(cat, 'litter')) return { ok: false, message: 'Sem areia sanitária.' }
  cat.litter.uses = 0
  cat.litter.lastCleaned = now
  cat.stress = clamp(cat.stress - 6)
  return { ok: true, message: 'Caixa limpa.' }
}

export function brush(cat: CatState, now: number): ActionResult {
  if (!has(cat, 'brush')) return { ok: false, message: 'Você não tem escova.' }
  if (cat.behavior === 'sleep') return wakeAnnoyance(cat, now)
  if (cat.stress > 75) return { ok: false, message: `${cat.name} está estressado demais e se esquiva.` }
  cat.needs.hygiene = clamp(cat.needs.hygiene + 30)
  cat.needs.affection = clamp(cat.needs.affection + 12)
  cat.bond = clamp(cat.bond + 0.6)
  cat.stress = clamp(cat.stress - 5)
  // Escovar remove o pelo solto antes de ele virar bola de pelo.
  if (Math.random() < 0.5) cure(cat, 'hairball')
  return { ok: true, message: `${cat.name} relaxa enquanto você escova.` }
}

/**
 * Carinho não é um botão de +afeto. Todo gato tem um limite de tolerância ao
 * toque, e passar dele é a forma mais rápida de perder confiança.
 */
export function petTick(cat: CatState, rt: Runtime, dt: number, now: number) {
  const p = cat.personality
  if (!rt.petting) {
    rt.patience = Math.min(1, rt.patience + dt * 0.08)
    return
  }
  // Acordar um gato dormindo custa caro.
  if (cat.behavior === 'sleep') {
    cat.stress = clamp(cat.stress + dt * 6)
    cat.bond = clamp(cat.bond - dt * 0.5)
    rt.patience = Math.max(0, rt.patience - dt * 0.6)
    return
  }
  const drain = (0.06 + p.independence * 0.14) * (cat.stress > 50 ? 2 : 1)
  rt.patience = Math.max(0, rt.patience - dt * drain)

  if (rt.patience > 0.12) {
    cat.needs.affection = clamp(cat.needs.affection + dt * 7)
    cat.bond = clamp(cat.bond + dt * 0.12)
    cat.stress = clamp(cat.stress - dt * 2.5)
    if (cat.behavior !== 'purr' && cat.needs.affection > 45 && p.sociability > 0.35) {
      cat.behavior = 'purr'
      cat.behaviorSince = now
      cat.target = null
    }
  } else {
    // Agressão por excesso de carinho: ele avisa, e depois sai de perto.
    cat.stress = clamp(cat.stress + dt * 9)
    cat.bond = clamp(cat.bond - dt * 0.35)
    if (cat.behavior !== 'walk') {
      cat.behavior = 'walk'
      cat.behaviorSince = now
      cat.target = SPOTS.bed
    }
  }
}

export function playSession(cat: CatState, now: number): ActionResult {
  if (cat.needs.energy < 15) return { ok: false, message: `${cat.name} está exausto demais para brincar.` }
  cat.needs.stimulation = clamp(cat.needs.stimulation + 26)
  cat.needs.energy = clamp(cat.needs.energy - 9)
  cat.needs.affection = clamp(cat.needs.affection + 8)
  cat.stress = clamp(cat.stress - 7)
  cat.bond = clamp(cat.bond + 0.8)
  cat.stats.plays += 1
  cat.inventory.coins += 2
  cat.behavior = 'pounce'
  cat.behaviorSince = now
  return { ok: true, message: 'Ele deu o bote!' }
}

function wakeAnnoyance(cat: CatState, now: number): ActionResult {
  cat.stress = clamp(cat.stress + 10)
  cat.bond = clamp(cat.bond - 1)
  cat.behaviorSince = now
  return { ok: false, message: `${cat.name} estava dormindo. Ele não gostou.` }
}

export function giveMedicine(cat: CatState, id: ItemId): ActionResult {
  const map: Partial<Record<ItemId, Array<'worms' | 'cold' | 'hairball' | 'indigestion'>>> = {
    dewormer: ['worms'],
    coldMedicine: ['cold'],
    hairballPaste: ['hairball', 'indigestion'],
  }
  const treats = map[id]
  if (!treats) return { ok: false, message: 'Isso não é remédio.' }
  const relevant = cat.illnesses.some((i) => treats.includes(i.kind as never))
  if (!relevant) return { ok: false, message: `${cat.name} não precisa disso agora.` }
  if (!consume(cat, id)) return { ok: false, message: 'Você não tem esse remédio.' }
  for (const k of treats) cure(cat, k)
  // Nenhum gato aceita remédio de bom grado.
  cat.stress = clamp(cat.stress + 14)
  cat.bond = clamp(cat.bond - 0.8)
  return { ok: true, message: 'Remédio administrado. Ele te olhou feio.' }
}

/**
 * A consulta faz duas coisas que o jogo não faz sozinho: nomeia o que ele tem
 * e trata. Antes disso o dono só tem sintomas — que é exatamente a posição de
 * quem cuida de um gato de verdade.
 */
export function vetVisit(cat: CatState, now: number): ActionResult {
  if (cat.inventory.coins < VET_PRICE) return { ok: false, message: 'Moedas insuficientes para a consulta.' }
  cat.inventory.coins -= VET_PRICE
  const found = cat.illnesses.map((i) => ILLNESS_LABEL[i.kind])
  cat.illnesses = []
  cat.health = clamp(cat.health + 45)
  cat.lastVetVisit = now
  cat.stats.vetVisits += 1
  // A ida ao veterinário é traumática, mesmo quando necessária.
  cat.stress = clamp(cat.stress + 35)
  cat.observed = []
  const diag = found.length
    ? `Diagnóstico: ${found.join(' e ')}. Tratado.`
    : 'Exame limpo. Nada encontrado.'
  return { ok: true, message: diag }
}

/**
 * Internação de emergência. Só faz sentido quando o quadro já é grave, custa
 * caro e ainda assim é a diferença entre perder o gato e não perder.
 */
export function emergencyVet(cat: CatState, now: number): ActionResult {
  if (cat.died) return { ok: false, message: 'Não há mais o que fazer.' }
  if (cat.inventory.coins < EMERGENCY_PRICE) {
    return { ok: false, message: `A internação custa ${EMERGENCY_PRICE} moedas. Você não tem.` }
  }
  cat.inventory.coins -= EMERGENCY_PRICE
  cat.illnesses = []
  cat.health = clamp(Math.max(cat.health, 55))
  cat.needs.hunger = clamp(Math.max(cat.needs.hunger, 60))
  cat.needs.thirst = clamp(Math.max(cat.needs.thirst, 70))
  cat.lastVetVisit = now
  cat.stats.vetVisits += 1
  cat.stress = clamp(cat.stress + 45)
  cat.bond = clamp(cat.bond - 4)
  return { ok: true, message: 'Ficou internado e voltou. Vai levar dias para confiar de novo.' }
}

/** Examinar de perto: o dono registra o que conseguiu notar. */
export function examineCat(cat: CatState, signs: string[]): ActionResult {
  cat.observed = signs
  cat.stress = clamp(cat.stress + 3)
  if (signs.length === 0) return { ok: true, message: 'Nada de estranho. Ele parece bem.' }
  return { ok: true, message: `Você notou ${signs.length} ${signs.length === 1 ? 'coisa' : 'coisas'}.` }
}

/** Recompensa diária por manter as necessidades em dia. */
export function dailyBonus(cat: CatState, now: number): ActionResult {
  const today = Math.floor(now / MS_DAY)
  if (cat.stats.lastDailyBonus === today) return { ok: false, message: '' }
  const n = cat.needs
  const good = n.hunger > 50 && n.thirst > 50 && cat.health > 70 && litterFilth(cat, now) < 0.6
  cat.stats.lastDailyBonus = today
  if (!good) return { ok: false, message: '' }
  cat.stats.daysCaredFor += 1
  const reward = 35 + Math.min(40, cat.stats.daysCaredFor)
  cat.inventory.coins += reward
  return { ok: true, message: `+${reward} moedas por um dia bem cuidado.` }
}

/** Ração de filhote deixa de ser adequada depois dos 6 meses. */
export function recommendedFood(cat: CatState, now: number): FoodKind {
  return ageMonths(cat.birth, now) < 6 ? 'kittenFormula' : 'kibble'
}
