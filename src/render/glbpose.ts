import * as THREE from 'three'
import type { PoseParams } from './rig'
import type { RiggedSkeleton } from './glbrig'

/**
 * Traduz os parâmetros de pose — os mesmos que animam o gato procedural — para
 * posições-alvo dos ossos extraídos do modelo importado.
 *
 * As medidas vêm todas do próprio modelo: comprimento de cada vértebra, dos
 * ossos das pernas e da cauda. Assim a mesma pose serve para qualquer malha que
 * passe pelo rigger, sem números fixos escondidos aqui.
 */
export class GlbPoser {
  private rig: RiggedSkeleton
  /** Comprimento de cada segmento no bind. */
  private spineSeg: number[] = []
  private spineIdx: number[]
  private neckIdx: number[]
  private headIdx: number
  private muzzleIdx: number
  private tailSeg: number[] = []
  private legLen: Array<[number, number, number]> = []
  private legOffset: THREE.Vector3[] = []
  private legAnchor: number[] = []
  private baseY: number
  private groundY: number
  /** Converte metros das poses para as unidades do modelo. */
  private unit = 1

  /** Alvos por osso, reutilizados a cada quadro. */
  readonly target: (THREE.Vector3 | null)[]
  private worldQuat: THREE.Quaternion[]

  constructor(rig: RiggedSkeleton, spineCount: number, neckCount: number) {
    this.rig = rig
    const all = rig.spine.idx
    this.spineIdx = all.slice(0, spineCount)
    this.neckIdx = all.slice(spineCount, spineCount + neckCount)
    this.headIdx = all[spineCount + neckCount]
    this.muzzleIdx = all[spineCount + neckCount + 1]

    for (let i = 1; i < this.spineIdx.length; i++) {
      this.spineSeg.push(rig.bindPos[this.spineIdx[i]].distanceTo(rig.bindPos[this.spineIdx[i - 1]]))
    }
    for (let i = 0; i < rig.tail.idx.length; i++) {
      const prev = i === 0 ? rig.bindPos[this.spineIdx[0]] : rig.bindPos[rig.tail.idx[i - 1]]
      this.tailSeg.push(rig.bindPos[rig.tail.idx[i]].distanceTo(prev))
    }

    for (const leg of rig.legs) {
      const p = leg.idx.map((k) => rig.bindPos[k])
      this.legLen.push([p[0].distanceTo(p[1]), p[1].distanceTo(p[2]), p[2].distanceTo(p[3])])
      // Onde a perna se prende à coluna, em relação ao ponto de coluna mais próximo.
      let anchor = 0
      let bestD = Infinity
      for (let i = 0; i < this.spineIdx.length; i++) {
        const d = Math.abs(rig.bindPos[this.spineIdx[i]].z - p[0].z)
        if (d < bestD) { bestD = d; anchor = i }
      }
      this.legAnchor.push(anchor)
      this.legOffset.push(p[0].clone().sub(rig.bindPos[this.spineIdx[anchor]]))
    }

    this.baseY = rig.bindPos[this.spineIdx[0]].y
    let lowest = Infinity
    for (const leg of rig.legs) lowest = Math.min(lowest, rig.bindPos[leg.idx[3]].y)
    this.groundY = lowest

    // `poses.ts` trabalha em metros, sobre um gato adulto de 30 cm de tronco.
    // O modelo importado tem a sua própria escala, então toda distância vinda
    // da pose precisa ser convertida — sem isto a passada fica curta demais e
    // as patas escorregam no chão.
    this.unit = this.bodyLengthRaw / 0.30

    this.target = rig.bones.map(() => new THREE.Vector3())
    this.worldQuat = rig.bones.map(() => new THREE.Quaternion())
  }

  get worldQuaternions() {
    return this.worldQuat
  }

  private get bodyLengthRaw() {
    const a = this.rig.bindPos[this.spineIdx[0]]
    const b = this.rig.bindPos[this.spineIdx[this.spineIdx.length - 1]]
    return a.distanceTo(b)
  }

  /** Comprimento do tronco no bind — usado para calibrar a escala do modelo. */
  get bodyLength() {
    const a = this.rig.bindPos[this.spineIdx[0]]
    const b = this.rig.bindPos[this.spineIdx[this.spineIdx.length - 1]]
    return a.distanceTo(b)
  }

  get withersHeight() {
    return Math.max(...this.spineIdx.map((i) => this.rig.bindPos[i].y)) - this.groundY
  }

  build(pose: PoseParams, tail: THREE.Vector3[] | null, yOffset = 0, roots?: THREE.Vector3[]) {
    this.buildSpine(pose, yOffset)
    this.buildLegs(pose, roots)

    if (tail) {
      for (let i = 0; i < this.rig.tail.idx.length; i++) {
        this.target[this.rig.tail.idx[i]]!.copy(tail[Math.min(i + 1, tail.length - 1)])
      }
    }
  }

  buildSpine(pose: PoseParams, yOffset: number) {
    const T = this.target as THREE.Vector3[]
    const S = this.spineIdx
    const n = S.length

    // --- Coluna ---
    // Construída do pescoço para o quadril, na mesma convenção de `poses.ts`:
    // ali `height` é a altura da frente do corpo e `pitch` positivo abaixa a
    // traseira. Fazer o contrário deixava o gato esparramado ao "sentar".
    //
    // As direções não são geradas do zero: partem do próprio bind e recebem a
    // rotação da pose. Assim a curvatura natural do dorso, que o escultor pôs
    // na malha, sobrevive a qualquer pose em vez de virar uma linha reta.
    const bindNeck = this.rig.bindPos[S[n - 1]]
    T[S[n - 1]].set(
      bindNeck.x,
      this.groundY + (bindNeck.y - this.groundY) * pose.height + yOffset,
      bindNeck.z,
    )

    const q = new THREE.Quaternion()
    const step = new THREE.Quaternion()
    const eul = new THREE.Euler()
    // `pitch` inclina o tronco inteiro de uma vez; só arch, curl e bend
    // acumulam ao longo das vértebras. Acumular o pitch dobrava o gato ao meio.
    // Os sinais são invertidos porque aqui as direções apontam do pescoço para
    // a cauda, ao contrário da convenção em que `poses.ts` foi escrito.
    q.setFromEuler(new THREE.Euler(-pose.pitch, 0, 0, 'YXZ'))

    for (let i = n - 2; i >= 0; i--) {
      const t = (n - 2 - i) / (n - 2)
      const arch = (pose.arch * Math.sin(t * Math.PI) * 1.5) / (n - 1) * 3
      const curl = -(pose.curl * (0.6 + t * 1.9)) / (n - 1) * 3.2
      const yaw = -(pose.bend * Math.sin(t * Math.PI)) / (n - 1) * 3.0
      eul.set(arch + curl, yaw, 0, 'YXZ')
      step.setFromEuler(eul)
      q.multiply(step)

      const dir = new THREE.Vector3()
        .subVectors(this.rig.bindPos[S[i]], this.rig.bindPos[S[i + 1]])
        .normalize()
        .applyQuaternion(q)
      T[S[i]].copy(T[S[i + 1]]).addScaledVector(dir, this.spineSeg[i])
    }

    // O corpo não afunda no chão.
    let lowest = Infinity
    for (const i of S) lowest = Math.min(lowest, T[i].y)
    // O mesmo patamar que o assentamento usa como referência do tronco
    // deitado. Com dois números diferentes, um empurrava para cima o que o
    // outro puxava para baixo, e o ajuste de altura nunca fechava.
    const floor = this.restTrunkY
    if (lowest < floor) {
      const fix = floor - lowest
      for (const i of S) T[i].y += fix
    }

    // --- Pescoço e cabeça ---
    // A direção é derivada do próprio bind e só então girada pela pose. Montar
    // uma direção absoluta aqui empurrava a cabeça para fora da posição em que
    // a malha foi esculpida e abria um vinco no pescoço.
    const neckBase = T[S[n - 1]]
    const bindNeckV = this.rig.bindPos[this.headIdx].clone().sub(this.rig.bindPos[S[n - 1]])
    const neckLen = bindNeckV.length()
    const bindDir = bindNeckV.clone().normalize()

    // Torção acumulada do tronco no ponto do pescoço.
    const bindSpineDir = new THREE.Vector3()
      .subVectors(this.rig.bindPos[S[n - 1]], this.rig.bindPos[S[n - 2]]).normalize()
    const nowSpineDir = new THREE.Vector3().subVectors(T[S[n - 1]], T[S[n - 2]]).normalize()
    const twist = new THREE.Quaternion().setFromUnitVectors(bindSpineDir, nowSpineDir)

    const headDir = bindDir.clone()
      .applyEuler(new THREE.Euler(pose.headPitch, pose.headYaw, pose.headRoll, 'YXZ'))
      .applyQuaternion(twist)
      .normalize()
    // `neck` estica ou encolhe o pescoço: encolhido, a cabeça recua para o
    // peito, como num gato dormindo.
    const reachLen = neckLen * (0.55 + 0.45 * Math.max(0, Math.min(1.6, pose.neck)))

    for (let i = 0; i < this.neckIdx.length; i++) {
      const t = (i + 1) / (this.neckIdx.length + 1)
      T[this.neckIdx[i]].copy(neckBase).addScaledVector(headDir, reachLen * t)
    }
    T[this.headIdx].copy(neckBase).addScaledVector(headDir, reachLen)

    const bindMuzzle = this.rig.bindPos[this.muzzleIdx].clone().sub(this.rig.bindPos[this.headIdx])
    const muzzleLen = bindMuzzle.length()
    const muzzleDir = bindMuzzle.normalize()
      .applyEuler(new THREE.Euler(pose.headPitch, pose.headYaw, pose.headRoll, 'YXZ'))
      .applyQuaternion(twist)
      .normalize()
    T[this.muzzleIdx].copy(T[this.headIdx]).addScaledVector(muzzleDir, muzzleLen)

    // Guarda a rotação da cabeça: orelhas e olhos penduram-se nela.
    this.headQuat.setFromUnitVectors(bindDir, headDir)

  }

  buildLegs(pose: PoseParams, rootOverride?: THREE.Vector3[]) {
    const T = this.target as THREE.Vector3[]
    const S = this.spineIdx
    const n = S.length
    for (let k = 0; k < this.rig.legs.length; k++) {
      const chain = this.rig.legs[k].idx
      const [l1, l2, l3] = this.legLen[k]
      const anchor = this.legAnchor[k]
      const fore = k < 2
      const tuck = fore ? pose.tuckFront : pose.tuckBack

      // O encaixe acompanha a torção da coluna naquele ponto.
      const segDirBind = new THREE.Vector3()
        .subVectors(
          this.rig.bindPos[S[Math.min(anchor + 1, n - 1)]],
          this.rig.bindPos[S[Math.max(anchor - 1, 0)]],
        ).normalize()
      const segDirNow = new THREE.Vector3()
        .subVectors(T[S[Math.min(anchor + 1, n - 1)]], T[S[Math.max(anchor - 1, 0)]])
        .normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(segDirBind, segDirNow)
      const root = T[chain[0]]
      if (rootOverride && rootOverride[k]) {
        // Posição real do encaixe, lida do esqueleto já orientado. O cálculo
        // analítico só aproxima: quem decide onde a raiz da perna para é a
        // rotação do osso de coluna que a carrega.
        root.copy(rootOverride[k])
      } else {
        root.copy(this.legOffset[k]).applyQuaternion(q).add(T[S[anchor]])
      }

      const reach = pose.legReach[k] * this.unit
      const lift = Math.max(0, pose.legLift[k]) * this.unit
      // Recolher a perna desliza o pé para debaixo do corpo; levantá-lo do chão
      // só acontece quando o gato já está deitado, e disso o próprio alcance da
      // perna se encarrega. Antes o pé subia ao sentar e o gato flutuava.
      const slide = Math.min(1, tuck * 1.2)
      const fold = Math.max(0, (tuck - 0.85) / 0.15)

      const foot = new THREE.Vector3(
        root.x,
        this.groundY + lift + fold * (root.y - this.groundY) * 0.45,
        root.z + reach + slide * (fore ? 0.03 : 0.085) * this.unit,
      )

      // Os comprimentos aqui têm de ser exatamente os do bind: a cinemática
      // direta que orienta os ossos depois não sabe encurtá-los, e qualquer
      // discrepância joga a pata para longe do alvo — era o que fazia o gato
      // pairar alguns centímetros acima do chão ao sentar.
      const reachable = (l1 + l2 + l3) * 0.99
      const d = foot.distanceTo(root)
      if (d > reachable) foot.sub(root).multiplyScalar(reachable / d).add(root)

      T[chain[3]].copy(foot)

      // O tornozelo fica a exatamente l3 do pé, na inclinação do metatarso.
      const ankleDir = new THREE.Vector3(
        0,
        (fore ? 0.94 : 0.86) * (1 - slide * 0.5),
        -(fore ? 0.12 : 0.42),
      ).normalize()
      const ankle = T[chain[2]]
      ankle.copy(foot).addScaledVector(ankleDir, l3)

      // Cotovelo dobra para trás, joelho traseiro para a frente.
      solveIK2(root, ankle, l1, l2, new THREE.Vector3(0, -0.15, fore ? -1 : 1).normalize(), T[chain[1]])
    }

  }

  /**
   * Orienta as orelhas. Erguidas e viradas para a frente quando ele está
   * atento; achatadas contra o crânio quando está com medo ou irritado — que é
   * a informação de humor mais direta que um gato dá.
   */
  poseEars(earBack: number, twitch: number) {
    const T = this.target as THREE.Vector3[]
    this.rig.ears.forEach((base, i) => {
      const tip = base + 1
      const side = i === 0 ? -1 : 1
      const bindDir = this.rig.bindPos[tip].clone().sub(this.rig.bindPos[base])
      const len = bindDir.length()
      bindDir.normalize()

      // A cabeça pode ter girado: a orelha acompanha.
      const headQ = this.headQuat
      const dir = bindDir.clone()
        // Achatar a orelha é girar cerca de 45°, não 70: além disso a malha
        // estica, porque a deformação linear não preserva volume em rotações
        // grandes, e a orelha vira uma aba de couro.
        .applyEuler(new THREE.Euler(
          earBack * 0.78,
          side * (earBack * 0.34 - twitch * 0.04),
          side * -earBack * 0.30,
          'YXZ',
        ))
        .applyQuaternion(headQ)
        .normalize()

      T[base].copy(T[this.headIdx]).addScaledVector(
        this.rig.bindPos[base].clone().sub(this.rig.bindPos[this.headIdx]).applyQuaternion(headQ).normalize(),
        this.rig.bindPos[base].distanceTo(this.rig.bindPos[this.headIdx]),
      )
      T[tip].copy(T[base]).addScaledVector(dir, len)
    })
  }

  /** Rotação atual da cabeça, para pendurar orelhas e olhos nela. */
  private headQuat = new THREE.Quaternion()

  /** Ponto de fixação e direção inicial da cauda, já na pose atual. */
  tailRoot(out: THREE.Vector3, outDir: THREE.Vector3) {
    const T = this.target as THREE.Vector3[]
    const S = this.spineIdx
    out.copy(T[S[0]])
    outDir.subVectors(T[S[0]], T[S[1]]).normalize()
  }

  /**
   * Patas que devem estar apoiadas nesta pose. Vazio quer dizer que o gato
   * está deitado: o peso passou das patas para o próprio tronco, e é o tronco
   * que precisa encostar no chão.
   */
  supportFeet(pose: PoseParams): number[] {
    const out: number[] = []
    for (let k = 0; k < this.rig.legs.length; k++) {
      const tuck = k < 2 ? pose.tuckFront : pose.tuckBack
      if (pose.legLift[k] > 0.001) continue
      if (tuck > 0.85) continue
      out.push(k)
    }
    return out
  }

  /** Ossos do tronco, para medir onde a barriga está. */
  get trunkBones(): number[] {
    return this.spineIdx
  }

  /**
   * Altura em que o tronco repousa quando o gato está deitado. Sai do próprio
   * bind: é a fração da altura do quadril que corresponde à barriga tocando o
   * chão, com o corpo achatado sobre as patas dobradas.
   */
  get restTrunkY(): number {
    return this.groundY + (this.baseY - this.groundY) * 0.34
  }

  get ground() {
    return this.groundY
  }

  get tailSegments() {
    return this.tailSeg
  }
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

function solveIK2(
  root: THREE.Vector3, target: THREE.Vector3,
  l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3,
) {
  const dir = _v1.subVectors(target, root)
  let d = dir.length()
  const max = (l1 + l2) * 0.998
  const min = Math.abs(l1 - l2) * 1.02 + 1e-5
  if (d > max) d = max
  if (d < min) d = min
  dir.normalize()
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (perp.lengthSq() < 1e-9) perp.set(0, 1, 0).addScaledVector(dir, -dir.y)
  perp.normalize()
  out.copy(root).addScaledVector(dir, a).addScaledVector(perp, h)
}
