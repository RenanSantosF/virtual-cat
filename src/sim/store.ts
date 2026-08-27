import { create } from 'zustand'
import { newRuntime, type Runtime } from '../ai/brain'
import { advance, newCat } from './engine'
import { saveMemorial } from './memorial'
import { load, save, wipe } from './persistence'
import type { CatState } from './types'

interface Game {
  cat: CatState | null
  rt: Runtime
  /** Incrementado para acordar a UI; o render 3D lê `cat` direto, sem passar por aqui. */
  uiTick: number
  toast: string | null
  adopt: (name: string) => void
  refresh: () => void
  notify: (msg: string) => void
  reset: () => void
}

const boot = load()
if (boot) {
  advance(boot, Date.now())
  if (boot.died) saveMemorial(boot)
}

export const useGame = create<Game>((set, get) => ({
  cat: boot,
  rt: newRuntime(),
  uiTick: 0,
  toast: null,
  adopt: (name) => {
    const cat = newCat(name.trim() || 'Gato', Date.now())
    save(cat)
    set({ cat, rt: newRuntime(), uiTick: get().uiTick + 1 })
  },
  refresh: () =>
    set((s) => {
      // O memorial é gravado no instante em que a morte é detectada, e não na
      // hora de recomeçar: se o jogador fechar o app antes, o registro fica.
      if (s.cat?.died) saveMemorial(s.cat)
      return { uiTick: s.uiTick + 1 }
    }),
  notify: (msg) => {
    set({ toast: msg })
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null })
    }, 2600)
  },
  reset: () => {
    wipe()
    set({ cat: null, rt: newRuntime(), uiTick: get().uiTick + 1 })
  },
}))

/** Salva periodicamente e sempre que o app sai de vista. */
export function installPersistence() {
  const flush = () => {
    const cat = useGame.getState().cat
    if (cat) save(cat)
  }
  window.setInterval(flush, 5000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}
