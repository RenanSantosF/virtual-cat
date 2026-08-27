import { foodSpoilage, litterFilth } from './engine'
import type { CatState } from './types'

/**
 * Avisos do ambiente — e só do ambiente.
 *
 * O pote vazio, a água velha e a caixa suja são coisas que qualquer um vê ao
 * entrar no cômodo. A saúde dele nunca entra aqui: descobrir que o gato está
 * doente continua sendo trabalho do dono, que é o ponto do jogo.
 *
 * Limitação honesta: sem servidor de push, o navegador só dispara estes avisos
 * enquanto a aba do app continua viva em segundo plano. Fechada de vez, o
 * aviso não chega — para isso seria preciso um servidor de push, ou o app
 * nativo em React Native.
 */

const KEY = 'virtual-cat:notified:v1'
const COOLDOWN = 3 * 3600_000

type Kind = 'food' | 'water' | 'litter'

interface Pending {
  kind: Kind
  title: string
  body: string
}

export function notificationsAllowed(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

export function canAskNotifications(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'default'
}

export async function askNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

function readLog(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeLog(log: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
  } catch {
    /* ignorado */
  }
}

function pending(cat: CatState, now: number): Pending[] {
  const out: Pending[] = []
  if (cat.bowl.food <= 1 && cat.needs.hunger < 55) {
    out.push({
      kind: 'food',
      title: `O pote de ${cat.name} está vazio`,
      body: 'Ele já procurou duas vezes.',
    })
  } else if (foodSpoilage(cat, now) > 0.95 && cat.bowl.food > 5) {
    out.push({
      kind: 'food',
      title: `A comida de ${cat.name} estragou`,
      body: 'Melhor trocar antes que ele coma assim mesmo.',
    })
  }
  if (cat.bowl.water <= 1) {
    out.push({
      kind: 'water',
      title: `${cat.name} está sem água`,
      body: 'Gato bebe pouco. Sem pote cheio, bebe menos ainda.',
    })
  } else if (now - cat.bowl.waterFilledAt > 2.5 * 86_400_000) {
    out.push({
      kind: 'water',
      title: 'A água está parada há dias',
      body: `${cat.name} vai recusar assim.`,
    })
  }
  if (litterFilth(cat, now) > 0.8) {
    out.push({
      kind: 'litter',
      title: 'A caixa de areia precisa de você',
      body: 'Passou do ponto em que ele aceita usar.',
    })
  }
  return out
}

/** Dispara o que estiver pendente, respeitando um intervalo entre avisos iguais. */
export function checkNotifications(cat: CatState, now: number) {
  if (!notificationsAllowed() || cat.died) return
  const log = readLog()
  let changed = false
  for (const p of pending(cat, now)) {
    if (now - (log[p.kind] ?? 0) < COOLDOWN) continue
    try {
      new Notification(p.title, { body: p.body, tag: `cat-${p.kind}`, icon: './icon-192.png' })
      log[p.kind] = now
      changed = true
    } catch {
      /* o navegador pode recusar fora de um gesto do usuário */
    }
  }
  if (changed) writeLog(log)
}
