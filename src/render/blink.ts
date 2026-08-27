import * as THREE from 'three'

/**
 * Piscar pintado na textura.
 *
 * A tentativa anterior punha calotas geométricas sobre os olhos, mas acertar a
 * posição delas na superfície de um crânio que não é meu exigia calibração
 * milimétrica — e a pálpebra acabava enterrada, com só um canto de fora.
 *
 * Aqui o problema é resolvido onde ele é fácil: no espaço da textura. A íris é
 * a única região saturada do rosto, então dá para encontrá-la varrendo pixels;
 * e pintar por cima dela a cor da pelagem ao redor produz um olho fechado
 * perfeito, sem geometria nenhuma. As variações são geradas uma vez no
 * carregamento e depois é só trocar o mapa do material: custo zero por quadro.
 */

interface EyeRegion {
  x: number
  y: number
  w: number
  h: number
}

/** Retângulos da textura que contêm íris. */
function findEyeRegions(data: Uint8ClampedArray, S: number): EyeRegion[] {
  const mask = new Uint8Array(S * S)
  for (let i = 0; i < S * S; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max <= 0 ? 0 : (max - min) / max
    // Íris: saturada e puxada para verde ou amarelo. A pelagem, mesmo
    // alaranjada, não tem o verde acima do vermelho.
    if (sat > 0.36 && g >= r * 0.92 && g > b * 1.15 && max > 0.16) mask[i] = 1
  }

  // Componentes conexos, para separar um olho do outro.
  const seen = new Uint8Array(S * S)
  const regions: EyeRegion[] = []
  const stack: number[] = []
  for (let start = 0; start < S * S; start++) {
    if (!mask[start] || seen[start]) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    let minX = S, maxX = 0, minY = S, maxY = 0, n = 0
    while (stack.length) {
      const i = stack.pop()!
      const x = i % S
      const y = (i / S) | 0
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue
        const j = ny * S + nx
        if (mask[j] && !seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    // Descarta respingos e manchas grandes demais para ser um olho.
    if (n < S * S * 0.00012 || n > S * S * 0.02) continue
    regions.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
  regions.sort((a, b) => b.w * b.h - a.w * a.h)
  return regions.slice(0, 2)
}

export interface BlinkTextures {
  open: THREE.Texture
  half: THREE.Texture
  shut: THREE.Texture
  regions: number
  dispose(): void
}

/**
 * Gera as variações de pálpebra a partir da textura original do modelo.
 * Devolve null quando não há íris identificável — aí o gato simplesmente não
 * pisca, em vez de ganhar manchas no rosto.
 */
export function buildBlinkTextures(source: THREE.Texture): BlinkTextures | null {
  const img = source.image as CanvasImageSource | undefined
  if (!img) return null
  const S = 1024

  let base: CanvasRenderingContext2D
  let data: Uint8ClampedArray
  try {
    const c = document.createElement('canvas')
    c.width = c.height = S
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g) return null
    g.drawImage(img, 0, 0, S, S)
    base = g
    data = g.getImageData(0, 0, S, S).data
  } catch {
    return null
  }

  const regions = findEyeRegions(data, S)
  if (regions.length === 0) return null

  const make = (amount: number): THREE.CanvasTexture => {
    const c = document.createElement('canvas')
    c.width = c.height = S
    const g = c.getContext('2d')!
    g.drawImage(base.canvas, 0, 0)

    for (const r of regions) {
      // Cor da pelagem logo acima do olho: é a pálpebra que vai descer.
      const lid = sampleAround(data, S, r)
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const rw = r.w * 0.62
      const rh = r.h * 0.62

      g.save()
      g.beginPath()
      // Um pouco maior que a íris, para cobrir o contorno junto.
      g.ellipse(cx, cy, rw * 1.28, rh * 1.35, 0, 0, Math.PI * 2)
      g.clip()

      // A pálpebra desce de cima; `amount` é o quanto ela já cobriu.
      const top = r.y - rh * 0.5
      const h = (r.h + rh) * amount
      g.fillStyle = `rgb(${lid[0]},${lid[1]},${lid[2]})`
      g.fillRect(r.x - rw, top, r.w + rw * 2, h)

      // Linha escura na borda da pálpebra: sem ela o olho fechado vira um
      // borrão de pelo, e é essa linha que o olho humano lê como pálpebra.
      if (amount > 0.15) {
        g.strokeStyle = `rgba(${lid[0] * 0.45 | 0},${lid[1] * 0.42 | 0},${lid[2] * 0.4 | 0},0.9)`
        g.lineWidth = Math.max(1.2, r.h * 0.1)
        g.beginPath()
        g.moveTo(r.x - rw * 0.8, top + h)
        g.quadraticCurveTo(cx, top + h + rh * 0.32, r.x + r.w + rw * 0.8, top + h)
        g.stroke()
      }
      g.restore()
    }

    const t = new THREE.CanvasTexture(c)
    t.colorSpace = source.colorSpace
    t.flipY = source.flipY
    t.wrapS = source.wrapS
    t.wrapT = source.wrapT
    t.anisotropy = 8
    return t
  }

  const half = make(0.55)
  const shut = make(1.05)
  return {
    open: source,
    half,
    shut,
    regions: regions.length,
    dispose() {
      half.dispose()
      shut.dispose()
    },
  }
}

/** Cor média da pelagem em volta do olho, que é a cor da pálpebra. */
function sampleAround(data: Uint8ClampedArray, S: number, r: EyeRegion): [number, number, number] {
  let sr = 0, sg = 0, sb = 0, n = 0
  const pad = Math.max(2, Math.round(r.h * 0.7))
  for (let y = r.y - pad; y < r.y; y++) {
    if (y < 0) continue
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x < 0 || x >= S) continue
      const i = (y * S + x) * 4
      sr += data[i]
      sg += data[i + 1]
      sb += data[i + 2]
      n++
    }
  }
  if (!n) return [120, 100, 80]
  return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)]
}
