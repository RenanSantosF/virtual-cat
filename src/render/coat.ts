import * as THREE from 'three'
import { makeNoise } from './noise'
import { rng, pick } from '../sim/random'

export type CoatPattern = 'mackerel' | 'classic' | 'solid' | 'tuxedo' | 'tortie' | 'point'

export interface Coat {
  pattern: CoatPattern
  base: string
  marking: string
  belly: string
  nose: string
  eye: string
  label: string
}

const PALETTES: Array<Omit<Coat, 'pattern' | 'label'> & { name: string }> = [
  { name: 'Rajado marrom', base: '#8a6a45', marking: '#3d2c1c', belly: '#c9ae86', nose: '#c98b7f', eye: '#9ba63c' },
  { name: 'Rajado cinza', base: '#7d7d7a', marking: '#3a3a38', belly: '#c2c2bd', nose: '#b98b86', eye: '#7fa05e' },
  { name: 'Laranja', base: '#c87a3a', marking: '#8f4e18', belly: '#ecd2ac', nose: '#e0a08e', eye: '#c9a13a' },
  { name: 'Preto', base: '#232122', marking: '#141313', belly: '#2e2b2b', nose: '#3c3435', eye: '#c9a13a' },
  { name: 'Branco', base: '#e8e4dc', marking: '#cfc7ba', belly: '#f5f2ec', nose: '#e3a99e', eye: '#5f93b8' },
  { name: 'Cinza azulado', base: '#8e959c', marking: '#666d75', belly: '#c3c8cd', nose: '#b08d8c', eye: '#c08a3a' },
  { name: 'Creme', base: '#d9c7a9', marking: '#a8814f', belly: '#efe4cf', nose: '#d69f92', eye: '#5aa3cf' },
]

export function makeCoat(seed: number): Coat {
  const r = rng(seed ^ 0x51ed270b)
  const pal = PALETTES[Math.floor(r() * PALETTES.length) % PALETTES.length]
  let pattern = pick<CoatPattern>(r, ['mackerel', 'mackerel', 'mackerel', 'mackerel', 'classic', 'solid', 'solid', 'tuxedo', 'tortie'])
  if ((pal.name === 'Preto' || pal.name === 'Branco') && (pattern === 'mackerel' || pattern === 'classic')) {
    pattern = r() < 0.5 ? 'solid' : 'tuxedo'
  }
  const labels: Record<CoatPattern, string> = {
    mackerel: 'rajado',
    classic: 'marmorizado',
    solid: 'sólido',
    tuxedo: 'bicolor',
    tortie: 'escaminha',
    point: 'point',
  }
  return {
    pattern,
    base: pal.base,
    marking: pal.marking,
    belly: pal.belly,
    nose: pal.nose,
    eye: pal.eye,
    label: `${pal.name} ${labels[pattern]}`,
  }
}

/**
 * Mapa de cor da pelagem.
 *
 * X = comprimento do corpo (nuca → cauda). Y = volta do corpo, e aqui está o
 * detalhe que importa: Y = 0 e Y = 1 são o MESMO ponto do dorso, com a barriga
 * no meio. Por isso tudo é desenhado simétrico em torno de Y = 0,5 — do
 * contrário aparece uma costura reta descendo pelas costas do gato.
 */
export function coatTexture(coat: Coat, seed: number, size = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size / 2
  const g = c.getContext('2d')!
  const { fbm } = makeNoise(seed)
  const W = c.width
  const H = c.height

  g.fillStyle = coat.base
  g.fillRect(0, 0, W, H)

  // Barriga e peito claros, espelhados em torno do centro da imagem.
  const belly = g.createLinearGradient(0, 0, 0, H)
  belly.addColorStop(0.0, hexA(coat.belly, 0))
  belly.addColorStop(0.22, hexA(coat.belly, 0))
  belly.addColorStop(0.38, hexA(coat.belly, 0.55))
  belly.addColorStop(0.5, hexA(coat.belly, 0.92))
  belly.addColorStop(0.62, hexA(coat.belly, 0.55))
  belly.addColorStop(0.78, hexA(coat.belly, 0))
  belly.addColorStop(1.0, hexA(coat.belly, 0))
  g.fillStyle = belly
  g.fillRect(0, 0, W, H)

  // Intensidade das marcas: máxima no dorso (Y = 0 e Y = 1), nula na barriga.
  const dorsal = (y: number) => Math.pow(Math.cos((y / H) * Math.PI * 2) * 0.5 + 0.5, 0.85)

  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const mark = hexToRgb(coat.marking)

  if (coat.pattern === 'mackerel' || coat.pattern === 'classic') {
    for (let y = 0; y < H; y++) {
      const fade = dorsal(y)
      for (let x = 0; x < W; x++) {
        let m = 0
        if (coat.pattern === 'mackerel') {
          // Listras que dão a volta no corpo: onda em X, ondulada por ruído.
          const wobble = (fbm(x * 0.008, y * 0.02, 3) - 0.5) * 34
          const stripe = Math.sin(((x + wobble) / W) * Math.PI * 2 * 22)
          m = Math.max(0, (stripe - 0.35) / 0.65)
          // Faixa dorsal contínua, que todo tabby tem.
          m = Math.max(m, Math.pow(fade, 6) * 0.85)
        } else {
          // Marmorizado: ruído deformado por outro ruído, formando volutas.
          const wx = fbm(x * 0.004, y * 0.008, 3) * 2.4
          const wy = fbm(x * 0.005 + 5.2, y * 0.009 + 1.7, 3) * 2.4
          const v = fbm(x * 0.010 + wx, y * 0.018 + wy, 4)
          m = Math.max(0, (v - 0.5) / 0.22)
          m = Math.min(1, m)
        }
        m *= fade
        if (m <= 0.001) continue
        const i = (y * W + x) * 4
        const a = Math.min(1, m) * 0.88
        d[i] = d[i] * (1 - a) + mark[0] * a
        d[i + 1] = d[i + 1] * (1 - a) + mark[1] * a
        d[i + 2] = d[i + 2] * (1 - a) + mark[2] * a
      }
    }
  }
  g.putImageData(img, 0, 0)

  if (coat.pattern === 'tuxedo') {
    g.fillStyle = '#f2efe8'
    // Peito, queixo e patas brancos — a barriga fica no meio da imagem.
    ellipse(g, W * 0.16, H * 0.5, W * 0.1, H * 0.2)
    ellipse(g, W * 0.42, H * 0.5, W * 0.16, H * 0.16)
    ellipse(g, W * 0.9, H * 0.5, W * 0.09, H * 0.13)
  } else if (coat.pattern === 'tortie') {
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const rr = 16 + Math.random() * 46
      g.globalAlpha = (0.45 + Math.random() * 0.4) * dorsal(y)
      g.fillStyle = Math.random() < 0.5 ? coat.marking : '#c8752f'
      ellipse(g, x, y, rr, rr * (0.5 + Math.random()))
      // Espelha em Y para a mancha não cortar na costura do dorso.
      if (y < H * 0.12 || y > H * 0.88) ellipse(g, x, y < H / 2 ? y + H : y - H, rr, rr)
    }
    g.globalAlpha = 1
  }

  // Grão de pelo: é o que tira o aspecto de plástico liso.
  const img2 = g.getImageData(0, 0, W, H)
  const d2 = img2.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const n = fbm(x * 0.35, y * 0.9, 3) - 0.5
      const sN = fbm(x * 0.02, y * 0.02, 4) - 0.5
      const shift = n * 24 + sN * 16
      d2[i] = clamp8(d2[i] + shift)
      d2[i + 1] = clamp8(d2[i + 1] + shift * 0.96)
      d2[i + 2] = clamp8(d2[i + 2] + shift * 0.9)
    }
  }
  g.putImageData(img2, 0, 0)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Normal map com fios de pelo orientados no sentido do corpo. */
export function furNormalTexture(seed: number, size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size / 2
  const g = c.getContext('2d')!
  const { fbm } = makeNoise(seed ^ 999)
  const W = c.width
  const H = c.height
  const img = g.createImageData(W, H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      // Fios longos em x, finos em y: derivadas dão a inclinação da normal.
      const h = (u: number, v: number) => fbm(u * 0.6, v * 5.5, 3)
      const dx = h(x + 1, y) - h(x - 1, y)
      const dy = h(x, y + 1) - h(x, y - 1)
      const nx = -dx * 3.2
      const ny = -dy * 3.2
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      d[i] = ((nx / len) * 0.5 + 0.5) * 255
      d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      d[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 2)
  return tex
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.beginPath()
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  g.fill()
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function clamp8(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
