import { clamp } from './random'
import type { CatState, EnvironmentState } from './types'

/** Limites de conforto aproximados; filhotes perdem calor mais depressa. */
export function comfortRange(ageMonths: number): readonly [number, number] {
  if (ageMonths < 3) return [24, 29]
  if (ageMonths < 6) return [22, 28]
  return [19, 27]
}

/** Fallback determinístico e offline: estação + ciclo diário da região do relógio. */
export function seasonalClimate(now: number): EnvironmentState {
  const d = new Date(now)
  const yearPhase = ((d.getUTCMonth() + d.getUTCDate() / 30) / 12) * Math.PI * 2
  const dayPhase = ((d.getHours() - 15) / 24) * Math.PI * 2
  const outdoorC = 18 - Math.cos(yearPhase) * 7 + Math.cos(dayPhase) * 4
  return { outdoorC, roomC: 22, humidity: 55, source: 'seasonal', measuredAt: now }
}

/** Aplica uma leitura de um adaptador meteorológico sem acoplar o core a uma API. */
export function applyWeather(cat: CatState, outdoorC: number, humidity: number, now: number) {
  cat.environment.outdoorC = clamp(outdoorC, -40, 55)
  cat.environment.humidity = clamp(humidity)
  cat.environment.source = 'weather'
  cat.environment.measuredAt = now
}

/** Modelo RC simples: paredes e móveis impedem saltos instantâneos de temperatura. */
export function thermalStep(env: EnvironmentState, hours: number) {
  const heating = env.outdoorC < 17 ? 2.2 : env.outdoorC > 29 ? -1.8 : 0
  const equilibrium = clamp(env.outdoorC + heating, 8, 34)
  env.roomC += (equilibrium - env.roomC) * (1 - Math.exp(-hours / 5))
}
