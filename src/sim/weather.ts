import { applyWeather } from './climate'
import type { CatState } from './types'

interface ForecastPayload {
  current?: { temperature_2m?: number; relative_humidity_2m?: number }
}

/**
 * Adaptador opcional de clima real. Falhas de permissão/rede são silenciosas:
 * o modelo sazonal continua válido e o core nunca depende de conectividade.
 */
export async function syncLocalWeather(cat: CatState): Promise<boolean> {
  if (!navigator.geolocation || Date.now() - cat.environment.measuredAt < 30 * 60_000) return false
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000, maximumAge: 30 * 60_000 }),
    )
    const { latitude, longitude } = position.coords
    const query = new URLSearchParams({
      latitude: String(latitude), longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m', timezone: 'auto',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`)
    if (!response.ok) return false
    const data = await response.json() as ForecastPayload
    const temperature = data.current?.temperature_2m
    const humidity = data.current?.relative_humidity_2m
    if (typeof temperature !== 'number' || typeof humidity !== 'number') return false
    applyWeather(cat, temperature, humidity, Date.now())
    return true
  } catch {
    return false
  }
}
