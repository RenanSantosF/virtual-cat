import * as THREE from 'three'
import { ROOM, SPOTS } from '../sim/world'
import { contactShadowTexture, rugTexture, wallTexture, woodFloorTexture } from './textures'

export interface RoomRefs {
  group: THREE.Group
  lamp: THREE.PointLight
  lampShade: THREE.Mesh
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  rim: THREE.DirectionalLight
  sky: THREE.Mesh
  foodBowl: THREE.Mesh
  foodPile: THREE.Mesh
  waterSurface: THREE.Mesh
  litterSurface: THREE.Mesh
  toy: THREE.Group
  dispose(): void
}

const WALL_H = 2.5

/** Mancha de contato sob um objeto, para ele parecer apoiado e não flutuando. */
function contact(group: THREE.Group, tex: THREE.Texture, x: number, z: number, r: number, strength = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.75 * strength,
      depthWrite: false, blending: THREE.NormalBlending,
    }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.set(x, 0.0015, z)
  m.renderOrder = 1
  group.add(m)
  return m
}

export function buildRoom(): RoomRefs {
  const group = new THREE.Group()
  const wood = woodFloorTexture()
  const wallTex = wallTexture()
  const rug = rugTexture()
  const contactTex = contactShadowTexture()
  const disposables: Array<{ dispose(): void }> = [
    wood.map, wood.rough, wallTex, rug.map, rug.bump, contactTex,
  ]

  // --- Piso ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.halfW * 2 + 1.2, ROOM.halfD * 2 + 1.2),
    new THREE.MeshStandardMaterial({
      map: wood.map, roughnessMap: wood.rough, roughness: 0.55, metalness: 0,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // --- Paredes ---
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 })
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.45 })
  const W = ROOM.halfW + 0.6
  const D = ROOM.halfD + 0.6

  // A parede do fundo é feita de quatro painéis em volta da janela, e não de um
  // plano furado por textura: assim o sol atravessa a abertura de verdade e o
  // retângulo de luz no chão é sombra projetada, não um decalque desenhado.
  const winW = 1.15
  const winH = 1.3
  const winY = 1.12
  const winX = SPOTS.window[0]
  const panels: Array<[w: number, h: number, x: number, y: number]> = [
    [W * 2, WALL_H - (winY + winH / 2), 0, winY + winH / 2 + (WALL_H - (winY + winH / 2)) / 2],
    [W * 2, winY - winH / 2, 0, (winY - winH / 2) / 2],
    [W - winX - winW / 2, winH, (winX + winW / 2 + W) / 2, winY],
    [W + winX - winW / 2, winH, (winX - winW / 2 - W) / 2, winY],
  ]
  for (const [w, h, x, y] of panels) {
    if (w <= 0.001 || h <= 0.001) continue
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), wallMat)
    panel.position.set(x, y, -D)
    panel.castShadow = true
    panel.receiveShadow = true
    group.add(panel)
  }

  for (const [rot, px, pz, len] of [
    [Math.PI / 2, -W, 0, D * 2],
    [-Math.PI / 2, W, 0, D * 2],
  ] as Array<[number, number, number, number]>) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, 0.08), wallMat)
    wall.rotation.y = rot
    wall.position.set(px, WALL_H / 2, pz)
    wall.receiveShadow = true
    wall.castShadow = true
    group.add(wall)
  }

  // Rodapé nas três paredes: é o que assenta a parede no chão.
  for (const [w, x, z, ry] of [
    [W * 2, 0, -D + 0.05, 0],
    [D * 2, -W + 0.05, 0, Math.PI / 2],
    [D * 2, W - 0.05, 0, Math.PI / 2],
  ] as Array<[number, number, number, number]>) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.10, 0.022), skirtMat)
    sk.rotation.y = ry
    sk.position.set(x, 0.05, z)
    sk.receiveShadow = true
    group.add(sk)
  }

  // --- Janela ---
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.4 })
  const frameT = 0.05
  for (const [w, h, dx, dy] of [
    [winW + frameT * 2, frameT, 0, winH / 2 + frameT / 2],
    [winW + frameT * 2, frameT, 0, -winH / 2 - frameT / 2],
    [frameT, winH, -winW / 2 - frameT / 2, 0],
    [frameT, winH, winW / 2 + frameT / 2, 0],
    [0.028, winH, 0, 0],
    [winW, 0.028, 0, 0],
  ] as Array<[number, number, number, number]>) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat)
    bar.position.set(winX + dx, winY + dy, -D + 0.01)
    bar.castShadow = true
    group.add(bar)
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.26, 0.045, 0.20), frameMat)
  sill.position.set(winX, winY - winH / 2 - 0.05, -D + 0.08)
  sill.castShadow = true
  sill.receiveShadow = true
  group.add(sill)

  // Céu atrás da janela: um gradiente, para a abertura dar em algum lugar.
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 3.4),
    new THREE.MeshBasicMaterial({ color: 0xa8c8e0, toneMapped: false }),
  )
  sky.position.set(winX, winY + 0.2, -D - 1.4)
  group.add(sky)

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.05, metalness: 0,
      transmission: 0.95, thickness: 0.01, transparent: true, opacity: 0.25,
    }),
  )
  glass.position.set(winX, winY, -D + 0.045)
  group.add(glass)

  // --- Cortinas ---
  const curtainMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6dac9, roughness: 1, sheen: 1,
    sheenColor: new THREE.Color(0xfff4e4), side: THREE.DoubleSide,
  })
  for (const side of [-1, 1]) {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 14; i++) {
      const t = i / 14
      // As pregas afinam em cima, onde o pano está preso.
      pts.push(new THREE.Vector2(
        (0.05 + Math.sin(t * Math.PI * 6) * 0.014) * (0.72 + t * 0.28),
        t * 1.72,
      ))
    }
    const curtain = new THREE.Mesh(new THREE.LatheGeometry(pts, 18, 0, Math.PI), curtainMat)
    curtain.scale.set(1, 1, 0.5)
    curtain.position.set(winX + side * 0.72, 0.16, -D + 0.14)
    curtain.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
    curtain.castShadow = true
    group.add(curtain)
  }
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.013, 1.85, 12),
    new THREE.MeshStandardMaterial({ color: 0x4d4038, roughness: 0.4, metalness: 0.55 }),
  )
  rod.rotation.z = Math.PI / 2
  rod.position.set(winX, 1.92, -D + 0.14)
  group.add(rod)

  // --- Tapete: cilindro achatado com trama, não um disco pintado no chão ---
  const rugMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.94, 0.016, 56),
    new THREE.MeshStandardMaterial({
      map: rug.map, bumpMap: rug.bump, bumpScale: 0.4, roughness: 1, metalness: 0,
      color: 0x9aa79f,
    }),
  )
  rugMesh.position.set(-0.15, 0.008, 0.3)
  rugMesh.receiveShadow = true
  rugMesh.castShadow = true
  group.add(rugMesh)

  // --- Potes ---
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xe9e4d9, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.12,
  })
  const makeBowl = (x: number, z: number) => {
    const b = new THREE.Mesh(new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0, 0),
        new THREE.Vector2(0.052, 0.002),
        new THREE.Vector2(0.062, 0.014),
        new THREE.Vector2(0.072, 0.036),
        new THREE.Vector2(0.078, 0.042),
        new THREE.Vector2(0.070, 0.040),
        new THREE.Vector2(0.055, 0.016),
        new THREE.Vector2(0.0, 0.010),
      ], 32), ceramic)
    b.position.set(x, 0, z)
    b.castShadow = true
    b.receiveShadow = true
    group.add(b)
    contact(group, contactTex, x, z, 0.11, 0.8)
    return b
  }
  const foodBowl = makeBowl(SPOTS.bowl[0], SPOTS.bowl[1])
  makeBowl(SPOTS.water[0], SPOTS.water[1])

  const foodPile = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x7a4d2c, roughness: 1 }),
  )
  foodPile.position.set(SPOTS.bowl[0], 0.012, SPOTS.bowl[1])
  foodPile.scale.set(1, 0.3, 1)
  foodPile.receiveShadow = true
  group.add(foodPile)

  const waterSurface = new THREE.Mesh(
    new THREE.CircleGeometry(0.062, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0xbcd8e6, roughness: 0.03, metalness: 0, transmission: 0.85,
      transparent: true, opacity: 0.9, thickness: 0.03,
    }),
  )
  waterSurface.rotation.x = -Math.PI / 2
  waterSurface.position.set(SPOTS.water[0], 0.028, SPOTS.water[1])
  group.add(waterSurface)

  // --- Caixa de areia ---
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x5c6772, roughness: 0.65 })
  const litterBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.35), boxMat)
  litterBox.position.set(SPOTS.litter[0], 0.07, SPOTS.litter[1])
  litterBox.castShadow = true
  litterBox.receiveShadow = true
  group.add(litterBox)
  const litterSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.31),
    new THREE.MeshStandardMaterial({ color: 0xd9d3c5, roughness: 1 }),
  )
  litterSurface.rotation.x = -Math.PI / 2
  litterSurface.position.set(SPOTS.litter[0], 0.125, SPOTS.litter[1])
  litterSurface.receiveShadow = true
  group.add(litterSurface)
  contact(group, contactTex, SPOTS.litter[0], SPOTS.litter[1], 0.34, 0.9)

  // --- Caminha ---
  const bedFabric = new THREE.MeshPhysicalMaterial({
    color: 0x9c8272, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xd6bda9),
  })
  const bed = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.062, 16, 36), bedFabric)
  bed.rotation.x = -Math.PI / 2
  bed.position.set(SPOTS.bed[0], 0.055, SPOTS.bed[1])
  bed.castShadow = true
  bed.receiveShadow = true
  group.add(bed)
  const bedInner = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x8b7365, roughness: 1, sheen: 0.8, sheenColor: new THREE.Color(0xc6ab98),
    }),
  )
  bedInner.rotation.x = -Math.PI / 2
  bedInner.position.set(SPOTS.bed[0], 0.022, SPOTS.bed[1])
  bedInner.receiveShadow = true
  group.add(bedInner)
  contact(group, contactTex, SPOTS.bed[0], SPOTS.bed[1], 0.3, 0.9)

  // --- Arranhador ---
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 0.46, 24),
    new THREE.MeshStandardMaterial({ color: 0xc3a878, roughness: 1 }),
  )
  post.position.set(SPOTS.scratcher[0], 0.26, SPOTS.scratcher[1])
  post.castShadow = true
  post.receiveShadow = true
  group.add(post)
  const postBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.028, 28),
    new THREE.MeshStandardMaterial({ color: 0x6b5949, roughness: 0.85 }),
  )
  postBase.position.set(SPOTS.scratcher[0], 0.014, SPOTS.scratcher[1])
  postBase.castShadow = true
  postBase.receiveShadow = true
  group.add(postBase)
  contact(group, contactTex, SPOTS.scratcher[0], SPOTS.scratcher[1], 0.26, 0.9)

  // --- Caixa de papelão: o móvel favorito de qualquer gato ---
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xbb9a72, roughness: 1 })
  const boxGroup = new THREE.Group()
  const bw = 0.34, bh = 0.19, bd = 0.28
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.012, bd), cardboard)
  bottom.position.y = 0.006
  bottom.receiveShadow = true
  boxGroup.add(bottom)
  for (const [w, d, x, z] of [
    [bw, 0.012, 0, -bd / 2], [bw, 0.012, 0, bd / 2],
    [0.012, bd, -bw / 2, 0], [0.012, bd, bw / 2, 0],
  ] as Array<[number, number, number, number]>) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), cardboard)
    wall.position.set(x, bh / 2, z)
    wall.castShadow = true
    wall.receiveShadow = true
    boxGroup.add(wall)
  }
  boxGroup.position.set(-ROOM.halfW + 0.42, 0, -ROOM.halfD + 0.55)
  boxGroup.rotation.y = 0.42
  group.add(boxGroup)
  contact(group, contactTex, boxGroup.position.x, boxGroup.position.z, 0.3, 1)

  // --- Luminária de canto: a luz da casa quando o sol vai embora ---
  const lampX = ROOM.halfW - 0.38
  const lampZ = ROOM.halfD - 0.5
  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.13, 0.028, 24),
    new THREE.MeshStandardMaterial({ color: 0x3b342f, roughness: 0.5, metalness: 0.5 }),
  )
  lampBase.position.set(lampX, 0.014, lampZ)
  lampBase.castShadow = true
  lampBase.receiveShadow = true
  group.add(lampBase)
  const lampPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: 0x463e37, roughness: 0.4, metalness: 0.6 }),
  )
  lampPole.position.set(lampX, 0.62, lampZ)
  lampPole.castShadow = true
  group.add(lampPole)
  const shadeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5e6c8, roughness: 0.9, side: THREE.DoubleSide,
    emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0,
  })
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.26, 28, 1, true), shadeMat)
  lampShade.position.set(lampX, 1.28, lampZ)
  lampShade.rotation.x = Math.PI
  group.add(lampShade)
  contact(group, contactTex, lampX, lampZ, 0.2, 0.8)

  // --- Brinquedo (varinha), aparece só quando o jogador usa ---
  const toy = new THREE.Group()
  const feather = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xcf4a4a, roughness: 0.75 }),
  )
  feather.scale.set(1, 0.6, 1.5)
  feather.castShadow = true
  toy.add(feather)
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0016, 0.0016, 0.55, 5),
    new THREE.MeshBasicMaterial({ color: 0xdddddd }),
  )
  string.position.y = 0.28
  toy.add(string)
  toy.visible = false
  group.add(toy)

  // --- Luz ---
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.4)
  sun.position.set(0.9, 2.8, -3.6)
  sun.target.position.set(winX, 0, 0.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 10
  sun.shadow.camera.left = -3.2
  sun.shadow.camera.right = 3.2
  sun.shadow.camera.top = 3.2
  sun.shadow.camera.bottom = -3.2
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 3
  group.add(sun, sun.target)

  const lamp = new THREE.PointLight(0xffc27a, 0, 5.5, 2)
  lamp.position.set(lampX, 1.18, lampZ)
  lamp.castShadow = true
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.camera.near = 0.05
  lamp.shadow.camera.far = 5
  lamp.shadow.bias = -0.004
  lamp.shadow.normalBias = 0.02
  group.add(lamp)

  const hemi = new THREE.HemisphereLight(0xdce9f5, 0x8a7560, 1.0)
  group.add(hemi)
  const rim = new THREE.DirectionalLight(0xbcd4e8, 0.9)
  rim.position.set(-1.9, 1.5, 2.2)
  group.add(rim)

  return {
    group, lamp, lampShade, sun, hemi, rim, sky,
    foodBowl, foodPile, waterSurface, litterSurface, toy,
    dispose() {
      disposables.forEach((d) => d.dispose())
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
