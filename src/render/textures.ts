import * as THREE from 'three'
import { makeNoise } from './noise'

/**
 * Texturas do cômodo, geradas por código.
 *
 * A versão anterior espalhava manchas escuras redondas pelo piso e repetia o
 * mesmo padrão a cada dois metros — de longe lia-se na hora como textura de
 * protótipo. Aqui a variação vem de onde vem na madeira real: cada tábua tem
 * seu próprio tom, os veios correm no sentido do comprimento e os nós são
 * raros e alongados, não bolhas.
 */

export function woodFloorTexture(size = 2048): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const { fbm, rand } = makeNoise(1337)

  const PLANKS = 7
  const plankH = size / PLANKS
  const img = g.createImageData(size, size)
  const d = img.data

  // Cada tábua recebe tom, saturação e deslocamento de veio próprios.
  const planks = Array.from({ length: PLANKS }, () => ({
    tone: 0.86 + rand() * 0.28,
    warm: 0.94 + rand() * 0.12,
    offset: rand() * 500,
    grain: 0.7 + rand() * 0.6,
  }))

  for (let y = 0; y < size; y++) {
    const pi = Math.min(PLANKS - 1, Math.floor(y / plankH))
    const pk = planks[pi]
    const inPlank = (y % plankH) / plankH
    // Escurece junto às juntas, onde a madeira encosta.
    const seam = Math.min(inPlank, 1 - inPlank)
    const seamDark = seam < 0.02 ? 0.55 + seam * 20 : 1

    for (let x = 0; x < size; x++) {
      // Veio: ruído muito esticado no comprimento da tábua.
      const grain = fbm((x + pk.offset) * 0.0022, y * 0.09, 5) * pk.grain
      const fine = fbm((x + pk.offset) * 0.02, y * 0.4, 3) * 0.25
      // Nós: raros, alongados, e só de vez em quando.
      const knot = fbm((x + pk.offset) * 0.004, y * 0.012, 3)
      const knotMask = knot > 0.79 ? (knot - 0.79) / 0.21 : 0

      const v = (0.72 + grain * 0.42 + fine) * pk.tone * seamDark * (1 - knotMask * 0.45)
      const i = (y * size + x) * 4
      d[i] = Math.min(255, 163 * v * pk.warm)
      d[i + 1] = Math.min(255, 133 * v)
      d[i + 2] = Math.min(255, 105 * v * (2 - pk.warm))
      d[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  // Mapa de rugosidade: o verniz brilha mais no meio da tábua e menos nos veios.
  const rc = document.createElement('canvas')
  rc.width = rc.height = size / 2
  const rg = rc.getContext('2d')!
  const rimg = rg.createImageData(rc.width, rc.height)
  for (let y = 0; y < rc.height; y++) {
    for (let x = 0; x < rc.width; x++) {
      const n = fbm(x * 0.004, y * 0.18, 4)
      const v = 110 + n * 90
      const i = (y * rc.width + x) * 4
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = v
      rimg.data[i + 3] = 255
    }
  }
  rg.putImageData(rimg, 0, 0)

  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(1.6, 1.6)
  map.anisotropy = 16
  const rough = new THREE.CanvasTexture(rc)
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping
  rough.repeat.set(1.6, 1.6)
  return { map, rough }
}

/** Parede pintada: variação suave e sujeira acumulada na base. */
export function wallTexture(size = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const { fbm } = makeNoise(4242)
  const img = g.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    // A parede escurece de leve perto do chão, como qualquer parede vivida.
    const floorDirt = 1 - Math.pow(y / size, 3) * 0.14
    for (let x = 0; x < size; x++) {
      const broad = fbm(x * 0.0016, y * 0.0016, 4)
      const fine = fbm(x * 0.03, y * 0.03, 3)
      const v = (0.93 + broad * 0.12 + fine * 0.035) * floorDirt
      const i = (y * size + x) * 4
      d[i] = 231 * v
      d[i + 1] = 224 * v
      d[i + 2] = 211 * v
      d[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Tapete de fibra: cor sarapintada e rugosidade alta, para não virar disco. */
export function rugTexture(size = 512): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const { fbm, rand } = makeNoise(909)
  const img = g.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Trama: dois ruídos cruzados, um por sentido do tecido.
      const warp = fbm(x * 0.4, y * 0.05, 2)
      const weft = fbm(x * 0.05, y * 0.4, 2)
      const blotch = fbm(x * 0.008, y * 0.008, 4)
      const v = 0.72 + warp * 0.2 + weft * 0.2 + blotch * 0.24 + (rand() - 0.5) * 0.06
      const i = (y * size + x) * 4
      d[i] = 150 * v
      d[i + 1] = 138 * v
      d[i + 2] = 120 * v
      d[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  const bc = document.createElement('canvas')
  bc.width = bc.height = size
  const bg = bc.getContext('2d')!
  const bimg = bg.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 128 + (fbm(x * 0.42, y * 0.42, 2) - 0.5) * 210
      const i = (y * size + x) * 4
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v
      bimg.data[i + 3] = 255
    }
  }
  bg.putImageData(bimg, 0, 0)

  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(3, 3)
  const bump = new THREE.CanvasTexture(bc)
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.repeat.set(3, 3)
  return { map, bump }
}

/**
 * Mancha de contato: um disco radial escuro que vai sob cada objeto.
 * A sombra projetada resolve a direção da luz; esta resolve o encosto, que é
 * o que faz o móvel parecer apoiado no chão em vez de colado por cima dele.
 */
export function contactShadowTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.28)')
  grad.addColorStop(0.75, 'rgba(0,0,0,0.08)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  return t
}
