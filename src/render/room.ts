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

/**
 * Caixa de cantos arredondados.
 *
 * Nenhum móvel estofado tem aresta viva, e é exatamente a aresta viva que
 * denuncia geometria feita às pressas: o realce de luz corre reto na quina e o
 * objeto parece papelão. Arredondar custa alguns polígonos e resolve.
 */
function roundedBox(w: number, h: number, d: number, r = 0.05): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  const shape = new THREE.Shape()
  const x = w / 2 - rr
  const y = h / 2 - rr
  shape.moveTo(-x, -y - rr)
  shape.lineTo(x, -y - rr)
  shape.quadraticCurveTo(x + rr, -y - rr, x + rr, -y)
  shape.lineTo(x + rr, y)
  shape.quadraticCurveTo(x + rr, y + rr, x, y + rr)
  shape.lineTo(-x, y + rr)
  shape.quadraticCurveTo(-x - rr, y + rr, -x - rr, y)
  shape.lineTo(-x - rr, -y)
  shape.quadraticCurveTo(-x - rr, -y - rr, -x, -y - rr)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - rr * 2, bevelEnabled: true, bevelThickness: rr, bevelSize: rr,
    bevelSegments: 3, curveSegments: 6,
  })
  g.translate(0, 0, -(d - rr * 2) / 2)
  g.computeVertexNormals()
  return g
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
  const rugMat = new THREE.MeshStandardMaterial({
    map: rug.map, bumpMap: rug.bump, bumpScale: 0.5, roughness: 1, metalness: 0,
    color: 0xd8ccb4,
  })
  const rugMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.88, 0.014, 56), rugMat)
  rugMesh.position.set(-0.15, 0.007, 0.34)
  rugMesh.receiveShadow = true
  rugMesh.castShadow = true
  group.add(rugMesh)

  // Barra mais escura na borda. Um tapete de uma cor só é uma mancha no chão;
  // a barra é o que faz o olho ler "peça de decoração" e não "textura".
  const rugBand = new THREE.Mesh(
    new THREE.RingGeometry(0.815, 0.872, 56),
    new THREE.MeshStandardMaterial({
      map: rug.map, bumpMap: rug.bump, bumpScale: 0.5, roughness: 1,
      color: 0xb0977a, side: THREE.DoubleSide,
    }),
  )
  rugBand.rotation.x = -Math.PI / 2
  rugBand.position.set(-0.15, 0.0152, 0.34)
  group.add(rugBand)

  // --- Sofá ---
  // Uma sala sem um móvel grande é uma caixa com objetos soltos dentro. É ele
  // que dá escala ao gato e faz o cômodo parecer habitado.
  const sofa = new THREE.Group()
  const fabric = new THREE.MeshStandardMaterial({ color: 0x8d938c, roughness: 0.94, metalness: 0 })
  const fabricLight = new THREE.MeshStandardMaterial({ color: 0x9aa199, roughness: 0.92, metalness: 0 })
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2b, roughness: 0.5 })
  const SL = 1.7   // comprimento, ao longo de z
  const SD = 0.72  // profundidade, ao longo de x
  const base = new THREE.Mesh(roundedBox(SD, 0.26, SL, 0.05), fabric)
  base.position.set(0, 0.30, 0)
  sofa.add(base)
  // Duas almofadas de assento, com uma fresta entre elas.
  for (const z of [-SL / 4 - 0.01, SL / 4 + 0.01]) {
    const cush = new THREE.Mesh(roundedBox(SD - 0.06, 0.16, SL / 2 - 0.04, 0.06), fabricLight)
    cush.position.set(0.02, 0.50, z)
    cush.castShadow = true
    sofa.add(cush)
  }
  const backRest = new THREE.Mesh(roundedBox(0.20, 0.62, SL, 0.07), fabric)
  backRest.position.set(-SD / 2 + 0.10, 0.66, 0)
  backRest.castShadow = true
  sofa.add(backRest)
  for (const z of [-SL / 2 + 0.09, SL / 2 - 0.09]) {
    const arm = new THREE.Mesh(roundedBox(SD, 0.34, 0.18, 0.08), fabric)
    arm.position.set(0, 0.60, z)
    arm.castShadow = true
    sofa.add(arm)
  }
  for (const [lx, lz] of [[-0.22, -SL / 2 + 0.12], [0.22, -SL / 2 + 0.12], [-0.22, SL / 2 - 0.12], [0.22, SL / 2 - 0.12]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.17, 8), legMat)
    leg.position.set(lx, 0.085, lz)
    sofa.add(leg)
  }
  base.castShadow = true
  base.receiveShadow = true
  sofa.position.set(-ROOM.halfW + 0.02, 0, 0.1)
  group.add(sofa)
  contact(group, contactTex, sofa.position.x, sofa.position.z + 0.1, 1.1, 0.85)

  // Manta jogada sobre o braço do sofá — o detalhe que diz que alguém mora
  // aqui. Cai dos dois lados do braço, senão vira uma barra flutuando.
  const throwMat = new THREE.MeshStandardMaterial({ color: 0xb8705d, roughness: 0.99 })
  const armZ = 0.1 + SL / 2 - 0.09
  const throwTop = new THREE.Mesh(roundedBox(SD + 0.06, 0.035, 0.30, 0.015), throwMat)
  throwTop.position.set(-ROOM.halfW + 0.02, 0.782, armZ)
  throwTop.castShadow = true
  group.add(throwTop)
  for (const [dz, rot] of [[0.155, 0.22], [-0.155, -0.22]] as Array<[number, number]>) {
    const fall = new THREE.Mesh(roundedBox(SD + 0.05, 0.26, 0.035, 0.015), throwMat)
    fall.position.set(-ROOM.halfW + 0.02, 0.66, armZ + dz)
    fall.rotation.x = rot
    fall.castShadow = true
    group.add(fall)
  }

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
  const litterBox = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.22, 0.02),
    new THREE.Vector2(0.245, 0.15), new THREE.Vector2(0.25, 0.17),
    new THREE.Vector2(0.235, 0.17), new THREE.Vector2(0.215, 0.03), new THREE.Vector2(0, 0.02),
  ], 6), boxMat)
  litterBox.rotation.y = Math.PI / 6
  litterBox.scale.set(1, 1, 0.78)
  litterBox.position.set(SPOTS.litter[0], 0, SPOTS.litter[1])
  litterBox.castShadow = true
  litterBox.receiveShadow = true
  group.add(litterBox)
  const litterSurface = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 6),
    new THREE.MeshStandardMaterial({ color: 0xd9d3c5, roughness: 1 }),
  )
  litterSurface.rotation.x = -Math.PI / 2
  litterSurface.rotation.z = Math.PI / 6
  litterSurface.position.set(SPOTS.litter[0], 0.075, SPOTS.litter[1])
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
  boxGroup.position.set(ROOM.halfW - 0.75, 0, -ROOM.halfD + 0.6)
  boxGroup.rotation.y = -0.5
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

  // --- Planta: folhas curvadas, não bolhas empilhadas ---
  const potMat = new THREE.MeshStandardMaterial({ color: 0xa8674a, roughness: 0.72 })
  const potX = -ROOM.halfW + 0.38
  const potZ = -ROOM.halfD + 0.42
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.085, 0), new THREE.Vector2(0.095, 0.02),
      new THREE.Vector2(0.108, 0.16), new THREE.Vector2(0.115, 0.19), new THREE.Vector2(0.105, 0.19),
      new THREE.Vector2(0.098, 0.17), new THREE.Vector2(0, 0.15),
    ], 24), potMat)
  pot.position.set(potX, 0, potZ)
  pot.castShadow = true
  pot.receiveShadow = true
  group.add(pot)
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.098, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a2b20, roughness: 1 }),
  )
  soil.rotation.x = -Math.PI / 2
  soil.position.set(potX, 0.17, potZ)
  group.add(soil)

  const leafMat = new THREE.MeshPhysicalMaterial({
    color: 0x4f7a41, roughness: 0.45, sheen: 0.6,
    sheenColor: new THREE.Color(0x9fd08a), side: THREE.DoubleSide,
    clearcoat: 0.3, clearcoatRoughness: 0.5,
  })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4
    const lean = 0.5 + (i % 3) * 0.22
    const h = 0.24 + (i % 4) * 0.07
    // Cada folha é um plano curvado, não uma esfera achatada.
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.075, h, 3, 8), leafMat)
    const posAttr = leaf.geometry.attributes.position as THREE.BufferAttribute
    for (let v = 0; v < posAttr.count; v++) {
      const y = posAttr.getY(v) / h + 0.5
      const x = posAttr.getX(v)
      // Afina para a ponta e dobra pelo próprio peso.
      posAttr.setX(v, x * (1 - y * 0.72))
      posAttr.setZ(v, -Math.pow(y, 2) * h * 0.55)
    }
    posAttr.needsUpdate = true
    leaf.geometry.computeVertexNormals()
    leaf.position.set(potX, 0.18 + h * 0.45, potZ)
    leaf.rotation.set(-lean * 0.55, a, Math.sin(a) * 0.2)
    leaf.castShadow = true
    group.add(leaf)
  }
  contact(group, contactTex, potX, potZ, 0.22, 0.9)

  // --- Quadro na parede: quebra o vazio e dá altura à sala ---
  const frameOuter = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.54, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x2f2823, roughness: 0.5 }),
  )
  frameOuter.position.set(-1.35, 1.45, -D + 0.05)
  frameOuter.castShadow = true
  group.add(frameOuter)
  const canvasArt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.48),
    new THREE.MeshStandardMaterial({ color: 0xb9a684, roughness: 0.85 }),
  )
  canvasArt.position.set(-1.35, 1.45, -D + 0.066)
  group.add(canvasArt)

  // --- Almofada de chão: volume de verdade, com pregas ---
  const cushionMat = new THREE.MeshPhysicalMaterial({
    color: 0x9c8f7d, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xd8cbb6),
    bumpMap: rug.bump, bumpScale: 0.35,
  })
  const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), cushionMat)
  // Achatada como almofada usada, com um vinco no meio.
  const cpos = cushion.geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < cpos.count; i++) {
    const y = cpos.getY(i)
    const r = Math.hypot(cpos.getX(i), cpos.getZ(i))
    cpos.setY(i, y * (1 - Math.max(0, 1 - r / 0.2) * 0.25))
  }
  cpos.needsUpdate = true
  cushion.geometry.computeVertexNormals()
  cushion.scale.set(1, 0.34, 0.92)
  cushion.position.set(-1.45, 0.072, 0.15)
  cushion.rotation.y = 0.5
  cushion.castShadow = true
  cushion.receiveShadow = true
  group.add(cushion)
  contact(group, contactTex, -1.45, 0.15, 0.26, 1.25)

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
