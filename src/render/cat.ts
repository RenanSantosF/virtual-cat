import * as THREE from 'three'
import { A, bodyRadius, tailRadius } from './anatomy'
import type { Coat } from './coat'
import { makeFur, type FurSet, type Quality } from './fur'
import type { Rig } from './rig'
import type { FacePose } from './poses'
import { Tube, resample } from './tube'

/** Um mesh sólido acompanhado das cascas de pelo que compartilham a geometria. */
function furMesh(geo: THREE.BufferGeometry, fur: FurSet, order = 0): THREE.Group {
  const g = new THREE.Group()
  const solid = new THREE.Mesh(geo, fur.skin)
  solid.castShadow = true
  solid.receiveShadow = true
  g.add(solid)
  fur.shells.forEach((m, i) => {
    const shell = new THREE.Mesh(geo, m)
    shell.renderOrder = order + i + 1
    shell.castShadow = false
    g.add(shell)
  })
  return g
}

function fillRadii(n: number, fn: (t: number) => [number, number]): [Float32Array, Float32Array] {
  const rx = new Float32Array(n)
  const ry = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const [a, b] = fn(i / (n - 1))
    rx[i] = a
    ry[i] = b
  }
  return [rx, ry]
}

export class CatModel {
  readonly group = new THREE.Group()
  private fur: FurSet
  private coat: Coat

  private body: Tube
  private bodyRx: Float32Array
  private bodyRy: Float32Array

  private tail: Tube
  private tailPts: THREE.Vector3[] = []
  private tailRx: Float32Array
  private tailRy: Float32Array

  private legs: Tube[] = []
  private legPts: THREE.Vector3[][] = []
  private legRx: Float32Array
  private legRy: Float32Array
  private legScratch: THREE.Vector3[] = []

  private headGroup = new THREE.Group()
  private earL = new THREE.Group()
  private earR = new THREE.Group()
  private eyeL!: EyeRig
  private eyeR!: EyeRig
  private jaw = new THREE.Group()
  private whiskers!: THREE.LineSegments
  private whiskerBase: Float32Array
  private paws: THREE.Mesh[] = []

  constructor(coat: Coat, seed: number, quality: Quality) {
    this.coat = coat
    this.fur = makeFur(coat, seed, quality, 0.009)

    // --- Tronco ---
    const N = A.spineSegments
    this.body = new Tube(N, quality === 'low' ? 12 : 18)
    const [brx, bry] = fillRadii(N, (t) => bodyRadius(t))
    this.bodyRx = brx
    this.bodyRy = bry
    this.group.add(furMesh(this.body.geometry, this.fur, 0))

    // --- Cauda ---
    const T = A.tailSegments
    this.tail = new Tube(T, quality === 'low' ? 6 : 10, false, true, [0.62, 1.0], [0.0, 0.5])
    const [trx, tryy] = fillRadii(T, (t) => [tailRadius(t), tailRadius(t)])
    this.tailRx = trx
    this.tailRy = tryy
    for (let i = 0; i < T; i++) this.tailPts.push(new THREE.Vector3())
    this.group.add(furMesh(this.tail.geometry, this.fur, 40))

    // --- Pernas ---
    const LP = 12
    const [lrx, lry] = fillRadii(LP, (t) => {
      // Grossa junto ao corpo, afinando até o tornozelo, e o pé alarga de novo.
      const r = A.legRadius * (2.0 - t * 1.35)
      return [r, r]
    })
    this.legRx = lrx
    this.legRy = lry
    for (let k = 0; k < 4; k++) {
      const tube = new Tube(LP, quality === 'low' ? 6 : 8, false, true, [0.62, 0.98], [0.12, 0.40])
      this.legs.push(tube)
      this.legPts.push(Array.from({ length: LP }, () => new THREE.Vector3()))
      this.group.add(furMesh(tube.geometry, this.fur, 60 + k * 20))

      const paw = new THREE.Mesh(
        new THREE.SphereGeometry(A.pawRadius, 12, 10),
        this.fur.skin,
      )
      // A pata é curta, achatada e um pouco mais longa que larga.
      paw.scale.set(0.9, 0.6, 1.25)
      paw.castShadow = true
      this.paws.push(paw)
      this.group.add(paw)
    }
    for (let i = 0; i < 4; i++) this.legScratch.push(new THREE.Vector3())

    this.whiskerBase = new Float32Array(0)
    this.buildHead(quality)
    this.group.add(this.headGroup)
  }

  private buildHead(quality: Quality) {
    // O crânio é um tubo curto, do occipital à ponta do nariz. Vale a pena
    // gerar assim: as UVs continuam as do corpo, então a pelagem casa.
    const HP = 18
    const head = new Tube(HP, quality === 'low' ? 12 : 20, true, true, [0.0, 0.16], [0, 1])
    const L = A.headLength
    // [t, largura, altura] — bochechas largas, focinho curto e afilado.
    const profile: Array<[number, number, number]> = [
      [0.0, 0.029, 0.030],
      [0.10, 0.034, 0.035],
      [0.26, 0.038, 0.037],
      [0.44, 0.040, 0.037], // maçãs do rosto, o ponto mais largo
      [0.60, 0.038, 0.034],
      [0.74, 0.032, 0.029], // o focinho começa tarde e continua cheio
      [0.85, 0.024, 0.022],
      [0.93, 0.018, 0.017],
      [0.98, 0.013, 0.012],
      [1.0, 0.008, 0.008],
    ]
    const interp = (t: number): [number, number] => {
      for (let i = 0; i < profile.length - 1; i++) {
        if (t >= profile[i][0] && t <= profile[i + 1][0]) {
          const s = (t - profile[i][0]) / (profile[i + 1][0] - profile[i][0])
          const e = s * s * (3 - 2 * s)
          return [
            profile[i][1] + (profile[i + 1][1] - profile[i][1]) * e,
            profile[i][2] + (profile[i + 1][2] - profile[i][2]) * e,
          ]
        }
      }
      return [profile[profile.length - 1][1], profile[profile.length - 1][2]]
    }
    const [hrx, hry] = fillRadii(HP, interp)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < HP; i++) {
      const t = i / (HP - 1)
      // O eixo do focinho desce um pouco: o nariz de gato aponta para baixo.
      pts.push(new THREE.Vector3(0, -Math.pow(t, 2.4) * 0.011, -0.028 + t * L * 1.05))
    }
    head.update(pts, hrx, hry, new THREE.Vector3(0, 1, 0))
    this.headGroup.add(furMesh(head.geometry, this.fur, 100))
    const noseZ = -0.028 + L * 1.05

    const skinTone = new THREE.Color(this.coat.nose)

    // --- Orelhas: triângulos finos, inclinados para fora, com interior rosado ---
    for (const [side, grp] of [[-1, this.earL], [1, this.earR]] as const) {
      const outer = new THREE.Mesh(
        new THREE.ConeGeometry(A.earWidth * 0.5, A.earHeight, 14, 1),
        this.fur.skin,
      )
      outer.scale.set(1, 1, 0.52)
      outer.position.y = A.earHeight * 0.5
      outer.castShadow = true
      grp.add(outer)
      const inner = new THREE.Mesh(
        new THREE.ConeGeometry(A.earWidth * 0.32, A.earHeight * 0.74, 12, 1),
        new THREE.MeshPhysicalMaterial({
          color: skinTone,
          roughness: 0.8,
          sheen: 0.9,
          sheenColor: new THREE.Color(0xffd8cc),
          side: THREE.DoubleSide,
        }),
      )
      inner.scale.set(1, 1, 0.32)
      inner.position.set(0, A.earHeight * 0.42, 0.007)
      grp.add(inner)
      // Encaixadas no alto do crânio, abertas para fora e levemente para a frente.
      grp.position.set(side * 0.0235, 0.030, 0.004)
      grp.rotation.set(-0.22, side * -0.30, side * 0.34)
      this.headGroup.add(grp)
    }

    // --- Olhos ---
    // Assentados sobre a superfície do crânio, calculada a partir do próprio
    // perfil: com coordenadas fixas eles ficavam enterrados sob a pelagem.
    const eyeT = 0.66
    const [erx, ery] = interp(eyeT)
    const eyeZ = -0.028 + eyeT * L * 1.05
    // Ângulo a partir do topo da cabeça: a órbita do gato é frontal e alta.
    const orbit = 1.02
    const sink = 1 - 0.62 * (A.eyeRadius / erx)
    const eyeX = Math.sin(orbit) * erx * sink
    const eyeY = Math.cos(orbit) * ery * sink
    this.eyeL = makeEye(this.coat, -1, eyeX, eyeY, eyeZ)
    this.eyeR = makeEye(this.coat, 1, eyeX, eyeY, eyeZ)
    this.headGroup.add(this.eyeL.group, this.eyeR.group)

    // --- Nariz ---
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.0052, 12, 8),
      new THREE.MeshPhysicalMaterial({
        color: skinTone, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3,
      }),
    )
    nose.scale.set(1.3, 0.85, 0.75)
    nose.position.set(0, -0.010, noseZ - 0.006)
    this.headGroup.add(nose)

    // --- Mandíbula: só o queixo se move, o resto do focinho é parte do crânio ---
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), this.fur.skin)
    chin.scale.set(1.15, 0.72, 1.15)
    chin.position.set(0, -0.017, noseZ - 0.020)
    this.jaw.add(chin)
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.0075, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x2b1414 }),
    )
    mouth.scale.set(1.1, 0.42, 0.55)
    mouth.position.set(0, -0.014, noseZ - 0.012)
    this.jaw.add(mouth)
    // A mandíbula gira em torno da articulação, atrás e acima do queixo.
    this.jaw.position.set(0, -0.004, noseZ - 0.042)
    for (const c of this.jaw.children) c.position.z -= noseZ - 0.042
    this.headGroup.add(this.jaw)

    // --- Bigodes ---
    const rows = 4
    const perRow = 3
    const verts: number[] = []
    for (const side of [-1, 1]) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < perRow; c++) {
          const yy = -0.001 - r * 0.0042
          const zz = noseZ - 0.020 + c * 0.0018
          const spread = 0.5 + c * 0.24
          const len = A.whiskerLength * (0.58 + c * 0.21) * (1 - r * 0.11)
          verts.push(side * 0.011, yy, zz)
          verts.push(side * (0.011 + len * spread), yy + len * 0.3 - r * 0.005, zz + len * 0.26)
        }
      }
    }
    // Sobrancelhas: os pelos longos acima dos olhos, que quase ninguém nota.
    for (const side of [-1, 1]) {
      for (let c = 0; c < 2; c++) {
        const len = A.whiskerLength * 0.42
        verts.push(side * 0.014, 0.017, noseZ - 0.050 + c * 0.003)
        verts.push(side * (0.014 + len * 0.5), 0.017 + len * 0.55, noseZ - 0.050 - len * 0.2)
      }
    }
    this.whiskerBase = new Float32Array(verts)
    const wg = new THREE.BufferGeometry()
    wg.setAttribute('position', new THREE.BufferAttribute(this.whiskerBase.slice(), 3))
    this.whiskers = new THREE.LineSegments(
      wg,
      new THREE.LineBasicMaterial({ color: 0xf6f0e6, transparent: true, opacity: 0.62 }),
    )
    this.headGroup.add(this.whiskers)
  }

  /** Reconstrói toda a malha a partir do esqueleto atual. */
  update(rig: Rig, face: FacePose, scale: number) {
    this.body.update(rig.spine, this.bodyRx, this.bodyRy)

    // Pernas: a polilinha de 4 juntas vira uma curva suave de 12 pontos.
    for (let k = 0; k < 4; k++) {
      const leg = rig.legs[k]
      this.legScratch[0].copy(leg.hip)
      // Empurra a boca do tubo para dentro do corpo, na direção da coluna.
      const idx = k < 2 ? Math.round(A.shoulderT * (rig.spine.length - 1))
                        : Math.round(A.hipT * (rig.spine.length - 1))
      this.legScratch[0].lerp(rig.spine[idx], 0.55)
      this.legScratch[1].copy(leg.knee)
      this.legScratch[2].copy(leg.ankle)
      this.legScratch[3].copy(leg.toe)
      resample(this.legScratch, this.legPts[k].length, this.legPts[k])
      this.legs[k].update(this.legPts[k], this.legRx, this.legRy)

      const paw = this.paws[k]
      paw.position.copy(leg.toe)
      paw.position.y += A.pawRadius * 0.35
      // A pata aponta na direção em que a perna desce.
      const dir = this.legScratch[0].subVectors(leg.toe, leg.ankle)
      paw.rotation.y = Math.atan2(dir.x, dir.z)
    }

    this.tail.update(this.tailPts, this.tailRx, this.tailRy)

    this.headGroup.position.copy(rig.headPos)
    this.headGroup.quaternion.copy(rig.headQuat)
    this.headGroup.scale.setScalar(rig.headScale)

    // --- Rosto ---
    const back = face.earBack
    this.earL.rotation.set(-0.18 + back * 1.15, back * 0.5, -0.34 - back * 0.55 + face.earTwitch * 0.05)
    this.earR.rotation.set(-0.18 + back * 1.15, -back * 0.5, 0.34 + back * 0.55 - face.earTwitch * 0.05)

    this.eyeL.set(face.eyeOpen, face.pupil)
    this.eyeR.set(face.eyeOpen, face.pupil)

    this.jaw.rotation.x = face.jaw * 0.5
    this.jaw.position.y = -face.jaw * 0.006

    // Bigodes se abrem quando ele está alerta e caem quando relaxado.
    const wp = this.whiskers.geometry.attributes.position as THREE.BufferAttribute
    const arr = wp.array as Float32Array
    const spread = 0.72 + face.whisker * 0.5
    for (let i = 0; i < arr.length; i += 6) {
      arr[i] = this.whiskerBase[i]
      arr[i + 1] = this.whiskerBase[i + 1]
      arr[i + 2] = this.whiskerBase[i + 2]
      const bx = this.whiskerBase[i + 3]
      const by = this.whiskerBase[i + 4]
      arr[i + 3] = bx * spread
      arr[i + 4] = by * (0.6 + face.whisker * 0.7) + (1 - face.whisker) * -0.004
      arr[i + 5] = this.whiskerBase[i + 5]
    }
    wp.needsUpdate = true

    this.group.scale.setScalar(scale)
  }

  /** Ponto de fixação e direção inicial da cauda, em espaço local. */
  tailRoot(rig: Rig, outDir: THREE.Vector3): THREE.Vector3 {
    const last = rig.spine[rig.spine.length - 1]
    outDir.copy(rig.tangents[rig.spine.length - 1]).normalize()
    return last
  }

  setTailPoints(pts: THREE.Vector3[]) {
    const n = this.tailPts.length
    // Média móvel de três pontos: a cadeia de Verlet é angulosa por natureza,
    // e sem isto a cauda aparece facetada.
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[i]
      const c = pts[Math.min(n - 1, i + 1)]
      if (i === 0 || i === n - 1) this.tailPts[i].copy(b)
      else this.tailPts[i].set(
        (a.x + b.x * 2 + c.x) / 4,
        (a.y + b.y * 2 + c.y) / 4,
        (a.z + b.z * 2 + c.z) / 4,
      )
    }
  }

  dispose() {
    this.fur.dispose()
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}

interface EyeRig {
  group: THREE.Group
  set(open: number, dilation: number): void
}

/**
 * O olho felino: íris enorme, pupila em fenda vertical que abre até virar um
 * círculo quando ele está excitado ou no escuro, e pálpebras que fecham de
 * verdade em vez de esconder o globo.
 */
function makeEye(coat: Coat, side: number, x: number, y: number, z: number): EyeRig {
  const g = new THREE.Group()
  const r = A.eyeRadius

  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(r, 22, 18),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(coat.eye),
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      emissive: new THREE.Color(coat.eye),
      emissiveIntensity: 0.45,
    }),
  )
  g.add(iris)

  // Calota preta colada ao globo; achatada em X, vira a fenda vertical.
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.015, 22, 18, 0, Math.PI * 2, 0, 0.50),
    new THREE.MeshBasicMaterial({ color: 0x070609 }),
  )
  pupil.rotation.x = Math.PI / 2
  g.add(pupil)

  // Anel escuro no contorno da íris: é o que dá profundidade ao olho de gato.
  const limbus = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.02, 22, 18, 0, Math.PI * 2, 1.15, 0.42),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(coat.eye).multiplyScalar(0.25) }),
  )
  limbus.rotation.x = Math.PI / 2
  g.add(limbus)

  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  )
  glint.position.set(side * r * 0.32, r * 0.4, r * 0.86)
  g.add(glint)

  const lidMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(coat.base).multiplyScalar(0.75),
    roughness: 0.92,
    sheen: 0.7,
    sheenColor: new THREE.Color(coat.base),
  })
  const upper = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.1, 20, 12, 0, Math.PI * 2, 0, 1.05),
    lidMat,
  )
  const lower = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.1, 20, 12, 0, Math.PI * 2, Math.PI - 1.05, 1.05),
    lidMat,
  )
  g.add(upper, lower)

  g.position.set(side * x, y, z)
  // Voltados para a frente e para fora, com a inclinação amendoada típica.
  g.rotation.set(-0.10, side * 0.52, side * -0.16)

  return {
    group: g,
    set(open: number, dilation: number) {
      // Em repouso a pálpebra superior já cobre um pouco do globo — gato de
      // olho totalmente arregalado é gato assustado.
      const closeAmt = 1 - Math.max(0, Math.min(1, open))
      // Girar a calota em X leva seu polo para a frente do globo: aberta, ela
      // fica no alto e deixa a fenda amendoada; fechada, cobre tudo.
      upper.rotation.x = 0.34 + closeAmt * 0.95
      lower.rotation.x = -0.30 - closeAmt * 0.78
      const d = Math.max(0, Math.min(1, dilation))
      pupil.scale.x = 0.055 + d * 0.945
      pupil.scale.z = 0.72 + d * 0.28
      glint.visible = open > 0.3
    },
  }
}
