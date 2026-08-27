/** Value noise + fbm determinístico, suficiente para pelagem e mapas de pelo. */
export function makeNoise(seed: number) {
  const perm = new Uint8Array(512)
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = base[i]
    base[i] = base[j]
    base[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const grad = (h: number, x: number, y: number) => {
    switch (h & 3) {
      case 0: return x + y
      case 1: return -x + y
      case 2: return x - y
      default: return -x - y
    }
  }

  function noise2(x: number, y: number): number {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = fade(xf)
    const v = fade(yf)
    const aa = perm[perm[xi] + yi]
    const ab = perm[perm[xi] + yi + 1]
    const ba = perm[perm[xi + 1] + yi]
    const bb = perm[perm[xi + 1] + yi + 1]
    const x1 = grad(aa, xf, yf) * (1 - u) + grad(ba, xf - 1, yf) * u
    const x2 = grad(ab, xf, yf - 1) * (1 - u) + grad(bb, xf - 1, yf - 1) * u
    return (x1 * (1 - v) + x2 * v) * 0.5 + 0.5
  }

  function fbm(x: number, y: number, octaves = 4, gain = 0.5, lac = 2): number {
    let sum = 0
    let amp = 1
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += noise2(x, y) * amp
      norm += amp
      amp *= gain
      x *= lac
      y *= lac
    }
    return sum / norm
  }

  return { noise2, fbm, rand }
}
