/** PRNG determinístico (mulberry32) — a mesma semente produz sempre o mesmo gato. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Sorteio com tendência ao centro — temperamentos extremos são raros. */
export function bell(r: () => number): number {
  return (r() + r() + r()) / 3
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length]
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (t: number) => t * t * (3 - 2 * t)
