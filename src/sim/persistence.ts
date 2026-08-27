import { STATE_VERSION } from './engine'
import type { CatState } from './types'

const KEY = 'virtual-cat:save:v1'

export function save(cat: CatState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cat))
  } catch {
    // Armazenamento cheio ou bloqueado: o jogo segue, só não persiste.
  }
}

export function load(): CatState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CatState
    if (typeof parsed?.birth !== 'number' || parsed.version !== STATE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function wipe() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignorado */
  }
}
