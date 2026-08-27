import * as THREE from 'three'
import { makeNoise } from './noise'
import { ROOM, SPOTS } from '../sim/world'

function woodTexture(size = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const { fbm } = makeNoise(7)
  g.fillStyle = '#8a6440'
  g.fillRect(0, 0, size, size)
  const plank = size / 8
  for (let i = 0; i < 8; i++) {
    const shade = 0.86 + ((i * 37) % 11) / 40
    const img = g.getImageData(0, i * plank, size, plank)
    const d = img.data
    for (let y = 0; y < plank; y++) {
      for (let x = 0; x < size; x++) {
        const k = (y * size + x) * 4
        // Veios: ruído muito esticado no sentido da tábua.
        const grain = fbm(x * 0.006, (i * plank + y) * 0.09, 5)
        const knot = fbm(x * 0.02, (i * plank + y) * 0.02, 3)
        const v = (0.62 + grain * 0.5) * shade * (knot > 0.72 ? 0.72 : 1)
        d[k] = Math.min(255, 150 * v + 40)
        d[k + 1] = Math.min(255, 108 * v + 26)
        d[k + 2] = Math.min(255, 70 * v + 16)
        d[k + 3] = 255
      }
    }
    g.putImageData(img, 0, i * plank)
    g.fillStyle = 'rgba(40,24,14,0.55)'
    g.fillRect(0, i * plank, size, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2.5, 2.2)
  t.anisotropy = 8
  return t
}

function wallTexture(size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const { fbm } = makeNoise(21)
  const img = g.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = (y * size + x) * 4
      const n = fbm(x * 0.05, y * 0.05, 4) * 0.12 + 0.88
      d[k] = 226 * n
      d[k + 1] = 219 * n
      d[k + 2] = 206 * n
      d[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 2)
  return t
}

export interface RoomRefs {
  group: THREE.Group
  sunPatch: THREE.Mesh
  foodBowl: THREE.Mesh
  foodPile: THREE.Mesh
  waterSurface: THREE.Mesh
  litterSurface: THREE.Mesh
  sun: THREE.DirectionalLight
  toy: THREE.Group
  dispose(): void
}

/** Um cômodo simples, mas com escala e materiais corretos para dar referência de tamanho. */
export function buildRoom(): RoomRefs {
  const group = new THREE.Group()
  const wood = woodTexture()
  const wall = wallTexture()

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.halfW * 2 + 1, ROOM.halfD * 2 + 1),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  const wallMat = new THREE.MeshStandardMaterial({ map: wall, roughness: 0.95 })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfW * 2 + 1, 2.6), wallMat)
  back.position.set(0, 1.3, -ROOM.halfD - 0.5)
  back.receiveShadow = true
  group.add(back)

  const left = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfD * 2 + 1, 2.6), wallMat)
  left.rotation.y = Math.PI / 2
  left.position.set(-ROOM.halfW - 0.5, 1.3, 0)
  left.receiveShadow = true
  group.add(left)

  // --- Janela: fonte principal de luz e ponto favorito do gato ---
  const winW = 1.1
  const winH = 1.25
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.55 })
  const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.09, winH + 0.09, 0.06), frameMat)
  frame.position.set(SPOTS.window[0], 1.05, -ROOM.halfD - 0.47)
  group.add(frame)
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshBasicMaterial({ color: 0xcfe3f0 }),
  )
  glass.position.set(SPOTS.window[0], 1.05, -ROOM.halfD - 0.43)
  group.add(glass)
  // Peitoril, onde ele senta para olhar a rua.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.2, 0.05, 0.16), frameMat)
  sill.position.set(SPOTS.window[0], 0.42, -ROOM.halfD - 0.42)
  sill.castShadow = true
  group.add(sill)

  // --- Potes ---
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xe7e2d8, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15,
  })
  const foodBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.038, 28, 1, true), ceramic)
  foodBowl.position.set(SPOTS.bowl[0], 0.019, SPOTS.bowl[1])
  foodBowl.castShadow = true
  foodBowl.receiveShadow = true
  group.add(foodBowl)
  const foodBase = new THREE.Mesh(new THREE.CircleGeometry(0.058, 24), ceramic)
  foodBase.rotation.x = -Math.PI / 2
  foodBase.position.set(SPOTS.bowl[0], 0.002, SPOTS.bowl[1])
  group.add(foodBase)

  const foodPile = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x74492a, roughness: 1 }),
  )
  foodPile.position.set(SPOTS.bowl[0], 0.006, SPOTS.bowl[1])
  foodPile.scale.set(1, 0.35, 1)
  group.add(foodPile)

  const waterBowl = foodBowl.clone()
  waterBowl.position.set(SPOTS.water[0], 0.019, SPOTS.water[1])
  group.add(waterBowl)
  const waterBase = foodBase.clone()
  waterBase.position.set(SPOTS.water[0], 0.002, SPOTS.water[1])
  group.add(waterBase)
  const waterSurface = new THREE.Mesh(
    new THREE.CircleGeometry(0.062, 28),
    new THREE.MeshPhysicalMaterial({
      color: 0x9fc4d8, roughness: 0.04, metalness: 0, transmission: 0.65,
      transparent: true, opacity: 0.85, thickness: 0.02,
    }),
  )
  waterSurface.rotation.x = -Math.PI / 2
  waterSurface.position.set(SPOTS.water[0], 0.026, SPOTS.water[1])
  group.add(waterSurface)

  // --- Caixa de areia ---
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x5d6b78, roughness: 0.8 })
  const litterBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.32), boxMat)
  litterBox.position.set(SPOTS.litter[0], 0.065, SPOTS.litter[1])
  litterBox.castShadow = true
  litterBox.receiveShadow = true
  group.add(litterBox)
  const litterSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1 }),
  )
  litterSurface.rotation.x = -Math.PI / 2
  litterSurface.position.set(SPOTS.litter[0], 0.115, SPOTS.litter[1])
  litterSurface.receiveShadow = true
  group.add(litterSurface)

  // --- Caminha ---
  const bed = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.055, 12, 28),
    new THREE.MeshPhysicalMaterial({
      color: 0x9a7f6d, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xd8c0ae),
    }),
  )
  bed.rotation.x = -Math.PI / 2
  bed.position.set(SPOTS.bed[0], 0.05, SPOTS.bed[1])
  bed.castShadow = true
  bed.receiveShadow = true
  group.add(bed)
  const bedInner = new THREE.Mesh(
    new THREE.CircleGeometry(0.175, 28),
    new THREE.MeshStandardMaterial({ color: 0x8a6f5e, roughness: 1 }),
  )
  bedInner.rotation.x = -Math.PI / 2
  bedInner.position.set(SPOTS.bed[0], 0.026, SPOTS.bed[1])
  bedInner.receiveShadow = true
  group.add(bedInner)

  // --- Arranhador ---
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.42, 20),
    new THREE.MeshStandardMaterial({ color: 0xbfa477, roughness: 1 }),
  )
  post.position.set(SPOTS.scratcher[0], 0.23, SPOTS.scratcher[1])
  post.castShadow = true
  group.add(post)
  const postBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: 0x6d5b48, roughness: 0.9 }),
  )
  postBase.position.set(SPOTS.scratcher[0], 0.015, SPOTS.scratcher[1])
  postBase.receiveShadow = true
  group.add(postBase)

  // --- Tapete, para o chão não ficar vazio ---
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x7d8a86, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xa9b5b1),
    }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(-0.2, 0.002, 0.25)
  rug.receiveShadow = true
  group.add(rug)

  // --- Rodapé: dá escala e assenta a parede no chão ---
  const skirt = new THREE.MeshStandardMaterial({ color: 0xf0ece3, roughness: 0.5 })
  const skirtBack = new THREE.Mesh(new THREE.BoxGeometry(ROOM.halfW * 2 + 1, 0.09, 0.02), skirt)
  skirtBack.position.set(0, 0.045, -ROOM.halfD - 0.49)
  group.add(skirtBack)
  const skirtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, ROOM.halfD * 2 + 1), skirt)
  skirtLeft.position.set(-ROOM.halfW - 0.49, 0.045, 0)
  group.add(skirtLeft)

  // --- Cortina: quebra a luz dura da janela e dá tecido à cena ---
  const curtainMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8dccb, roughness: 1, sheen: 1,
    sheenColor: new THREE.Color(0xfff2e0), side: THREE.DoubleSide,
  })
  for (const side of [-1, 1]) {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      // Pregas: o raio oscila para o pano não ficar um cilindro liso.
      pts.push(new THREE.Vector2(0.055 + Math.sin(t * Math.PI * 5) * 0.012, t * 1.5))
    }
    const curtain = new THREE.Mesh(new THREE.LatheGeometry(pts, 16, 0, Math.PI), curtainMat)
    curtain.scale.set(1, 1, 0.42)
    curtain.position.set(SPOTS.window[0] + side * 0.68, 0.32, -ROOM.halfD - 0.4)
    curtain.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
    curtain.castShadow = true
    group.add(curtain)
  }
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.7, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a4638, roughness: 0.5, metalness: 0.3 }),
  )
  rod.rotation.z = Math.PI / 2
  rod.position.set(SPOTS.window[0], 1.82, -ROOM.halfD - 0.4)
  group.add(rod)

  // --- Planta: o único verde da sala ---
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.085, 0.18, 20),
    new THREE.MeshStandardMaterial({ color: 0xb2704a, roughness: 0.75 }),
  )
  pot.position.set(-ROOM.halfW + 0.36, 0.09, -ROOM.halfD + 0.34)
  pot.castShadow = true
  pot.receiveShadow = true
  group.add(pot)
  const leafMat = new THREE.MeshPhysicalMaterial({
    color: 0x4e7a45, roughness: 0.6, sheen: 0.5, side: THREE.DoubleSide,
  })
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2
    const lean = 0.35 + (i % 3) * 0.18
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), leafMat)
    leaf.scale.set(0.28, 1, 0.7)
    leaf.position.set(
      pot.position.x + Math.sin(a) * 0.09 * lean,
      pot.position.y + 0.16 + (i % 4) * 0.055,
      pot.position.z + Math.cos(a) * 0.09 * lean,
    )
    leaf.rotation.set(Math.cos(a) * lean, a, -Math.sin(a) * lean)
    leaf.castShadow = true
    group.add(leaf)
  }

  // --- Caixa de papelão: o móvel favorito de qualquer gato ---
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xc2a179, roughness: 0.95 })
  const boxW = 0.34
  const boxH = 0.2
  const boxD = 0.28
  const boxGroup = new THREE.Group()
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.012, boxD), cardboard)
  bottom.position.y = 0.006
  boxGroup.add(bottom)
  for (const [w, d, x, z] of [
    [boxW, 0.012, 0, -boxD / 2], [boxW, 0.012, 0, boxD / 2],
    [0.012, boxD, -boxW / 2, 0], [0.012, boxD, boxW / 2, 0],
  ] as Array<[number, number, number, number]>) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, boxH, d), cardboard)
    wall.position.set(x, boxH / 2, z)
    wall.castShadow = true
    wall.receiveShadow = true
    boxGroup.add(wall)
  }
  boxGroup.position.set(ROOM.halfW - 0.55, 0, -ROOM.halfD + 0.5)
  boxGroup.rotation.y = -0.35
  group.add(boxGroup)

  // --- Almofada, para o chão não ser só madeira ---
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.09, 0.36),
    new THREE.MeshPhysicalMaterial({
      color: 0x8d6f7d, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xc4a7b4),
    }),
  )
  cushion.position.set(-1.55, 0.045, -0.55)
  cushion.rotation.y = 0.4
  cushion.castShadow = true
  cushion.receiveShadow = true
  group.add(cushion)

  // --- Retângulo de sol no chão: é o que o gato procura de manhã ---
  const sunPatch = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.5),
    new THREE.MeshBasicMaterial({
      color: 0xfff0cf, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  )
  sunPatch.rotation.x = -Math.PI / 2
  sunPatch.position.set(SPOTS.window[0] - 0.15, 0.004, -ROOM.halfD + 1.05)
  group.add(sunPatch)

  // --- Brinquedo (varinha), aparece só quando o jogador usa ---
  const toy = new THREE.Group()
  const feather = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: 0.8 }),
  )
  feather.scale.set(1, 0.6, 1.4)
  toy.add(feather)
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0015, 0.0015, 0.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xdddddd }),
  )
  string.position.y = 0.25
  toy.add(string)
  toy.visible = false
  group.add(toy)

  // --- Luz ---
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2)
  sun.position.set(0.6, 2.4, -2.6)
  sun.target.position.set(0, 0, 0.3)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 3
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 8
  sun.shadow.camera.left = -2.4
  sun.shadow.camera.right = 2.4
  sun.shadow.camera.top = 2.4
  sun.shadow.camera.bottom = -2.4
  sun.shadow.bias = -0.0012
  sun.shadow.normalBias = 0.012
  group.add(sun, sun.target)

  const hemi = new THREE.HemisphereLight(0xdce9f5, 0x8a7560, 1.5)
  group.add(hemi)
  // Luz de recorte por trás: separa o contorno peludo do fundo.
  const rim = new THREE.DirectionalLight(0xbcd4e8, 1.1)
  rim.position.set(-1.8, 1.2, 1.9)
  group.add(rim)
  const fill = new THREE.PointLight(0xffe0b8, 6, 6, 2)
  fill.position.set(1.4, 1.6, 1.2)
  group.add(fill)

  return {
    group,
    sunPatch,
    foodBowl,
    foodPile,
    waterSurface,
    litterSurface,
    sun,
    toy,
    dispose() {
      wood.dispose()
      wall.dispose()
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    },
  }
}
