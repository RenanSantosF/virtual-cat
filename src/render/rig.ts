import * as THREE from 'three'
import { A } from './anatomy'

export interface LegRig {
  hip: THREE.Vector3
  knee: THREE.Vector3
  ankle: THREE.Vector3
  toe: THREE.Vector3
}

export interface Rig {
  /** Pontos da coluna, da nuca (0) à base da cauda (N-1), em espaço local. */
  spine: THREE.Vector3[]
  tangents: THREE.Vector3[]
  normals: THREE.Vector3[]
  binormals: THREE.Vector3[]
  headPos: THREE.Vector3
  headQuat: THREE.Quaternion
  /** ordem: dianteira-esq, dianteira-dir, traseira-esq, traseira-dir */
  legs: LegRig[]
  headScale: number
}

export interface PoseParams {
  /** Arqueamento da coluna: positivo eleva o dorso (gato assustado). */
  arch: number
  /** Curvatura lateral acumulada, em radianos. */
  bend: number
  /** Altura do eixo da coluna, em fração de standHeight. */
  height: number
  /** Inclinação do tronco: positivo abaixa a traseira em relação ao peito. */
  pitch: number
  /** Enrolamento para dormir, 0..1. */
  curl: number
  headYaw: number
  headPitch: number
  headRoll: number
  /** Quanto a cabeça sobe acima da linha do dorso, multiplicador de neckRise. */
  neck: number
  legLift: [number, number, number, number]
  legReach: [number, number, number, number]
  /** Dobrar as dianteiras (deitar de peito). */
  tuckFront: number
  /** Dobrar as traseiras (sentar). */
  tuckBack: number
  tailLift: number
  tailCurl: number
  tailSway: number
  /** Amplitude do movimento lateral da cauda. */
  tailFlick: number
}

export function defaultPose(): PoseParams {
  return {
    arch: 0,
    bend: 0,
    height: 1,
    pitch: 0,
    curl: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    neck: 1,
    legLift: [0, 0, 0, 0],
    legReach: [0, 0, 0, 0],
    tuckFront: 0,
    tuckBack: 0,
    tailLift: 0.35,
    tailCurl: 0.35,
    tailSway: 0,
    tailFlick: 0.25,
  }
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

/** IK analítico de dois ossos; devolve a junta intermediária em `out`. */
function solveIK2(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  out: THREE.Vector3,
): void {
  const dir = _v1.subVectors(target, root)
  let d = dir.length()
  const max = (l1 + l2) * 0.998
  const min = Math.abs(l1 - l2) * 1.02 + 1e-4
  if (d > max) d = max
  if (d < min) d = min
  dir.normalize()

  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const hSq = l1 * l1 - a * a
  const h = hSq > 0 ? Math.sqrt(hSq) : 0

  const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (perp.lengthSq() < 1e-9) {
    perp.set(0, 1, 0).addScaledVector(dir, -dir.y)
    if (perp.lengthSq() < 1e-9) perp.set(1, 0, 0)
  }
  perp.normalize()

  out.copy(root).addScaledVector(dir, a).addScaledVector(perp, h)
}

export function buildRig(pose: PoseParams, headScale: number, out?: Rig): Rig {
  const N = A.spineSegments
  const rig: Rig = out ?? {
    spine: Array.from({ length: N }, () => new THREE.Vector3()),
    tangents: Array.from({ length: N }, () => new THREE.Vector3()),
    normals: Array.from({ length: N }, () => new THREE.Vector3()),
    binormals: Array.from({ length: N }, () => new THREE.Vector3()),
    headPos: new THREE.Vector3(),
    headQuat: new THREE.Quaternion(),
    legs: Array.from({ length: 4 }, () => ({
      hip: new THREE.Vector3(),
      knee: new THREE.Vector3(),
      ankle: new THREE.Vector3(),
      toe: new THREE.Vector3(),
    })),
    headScale: 1,
  }
  rig.headScale = headScale

  const seg = A.spineLength / (N - 1)
  const bodyY = A.standHeight * pose.height

  // --- Coluna ---
  // Constrói-se da nuca para a base da cauda. O ângulo acumula a cada segmento,
  // então arquear ou enrolar deforma o corpo inteiro de forma contínua.
  rig.spine[0].set(0, bodyY + A.neckRise * 0.16 * pose.neck, A.spineLength * 0.46)
  let yaw = 0
  // O pescoço começa apontando para baixo-e-para-trás: é a curva em S felina.
  let pitch = pose.pitch + A.neckRise * pose.neck * 0.9

  for (let i = 1; i < N; i++) {
    const t = i / (N - 1)
    // O pescoço endireita rápido; depois o dorso segue quase reto.
    const neckRelax = t < 0.16 ? -A.neckRise * pose.neck * 0.9 * (1 / (0.16 * (N - 1))) : 0
    // Perfil natural: leve depressão atrás dos ombros, leve elevação no quadril.
    const natural = (Math.sin(t * Math.PI * 1.1) * 0.05 - 0.03) / (N - 1) * 3
    const arch = (-pose.arch * Math.sin(t * Math.PI) * 1.5) / (N - 1) * 3
    const curl = (pose.curl * (0.6 + t * 1.9)) / (N - 1) * 3.2
    pitch += neckRelax + natural + arch + curl
    yaw += (pose.bend * Math.sin(t * Math.PI)) / (N - 1) * 3.0

    const dir = _v1.set(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    )
    rig.spine[i].copy(rig.spine[i - 1]).addScaledVector(dir, seg)
  }

  // O corpo não pode afundar no chão: sobe tudo se algum ponto passar abaixo.
  let lowest = Infinity
  for (let i = 0; i < N; i++) {
    const r = bodyRadiusY(i / (N - 1))
    lowest = Math.min(lowest, rig.spine[i].y - r)
  }
  if (lowest < 0.004) {
    const fix = 0.004 - lowest
    for (let i = 0; i < N; i++) rig.spine[i].y += fix
  }

  // Referenciais ao longo da coluna.
  for (let i = 0; i < N; i++) {
    const a = rig.spine[Math.max(0, i - 1)]
    const b = rig.spine[Math.min(N - 1, i + 1)]
    rig.tangents[i].subVectors(b, a).normalize()
    rig.binormals[i].crossVectors(rig.tangents[i], _up).normalize()
    if (rig.binormals[i].lengthSq() < 1e-6) rig.binormals[i].set(1, 0, 0)
    rig.normals[i].crossVectors(rig.binormals[i], rig.tangents[i]).normalize()
  }

  // --- Cabeça: continua a direção do pescoço, e então gira por conta própria. ---
  const headDir = _v1.copy(rig.tangents[0]).negate().normalize()
  rig.headPos.copy(rig.spine[0]).addScaledVector(headDir, A.headLength * 0.46 * headScale)

  // A cabeça não herda a inclinação do pescoço. Por mais que a curva em S suba,
  // o gato mantém o crânio nivelado e olhando para a frente — só a pose decide
  // para onde ele vira. Deixar a tangente mandar aqui fazia a cabeça mergulhar.
  rig.headQuat.setFromEuler(
    new THREE.Euler(pose.headPitch, pose.headYaw, pose.headRoll, 'YXZ'),
  )

  // --- Pernas ---
  const shoulderIdx = Math.round(A.shoulderT * (N - 1))
  const hipIdx = Math.round(A.hipT * (N - 1))
  const limbs: Array<[idx: number, side: number, fore: boolean]> = [
    [shoulderIdx, -1, true],
    [shoulderIdx, 1, true],
    [hipIdx, -1, false],
    [hipIdx, 1, false],
  ]

  for (let k = 0; k < 4; k++) {
    const [idx, side, fore] = limbs[k]
    const leg = rig.legs[k]
    const width = fore ? A.shoulderWidth : A.hipWidth
    const [l1, l2, l3] = fore ? A.foreLimb : A.hindLimb
    const tuck = fore ? pose.tuckFront : pose.tuckBack

    leg.hip
      .copy(rig.spine[idx])
      .addScaledVector(rig.binormals[idx], side * width)
      .addScaledVector(rig.normals[idx], -0.004)

    // Recolher a perna tem dois modos. Até a metade, o pé continua no chão e
    // apenas avança para debaixo do corpo — é o jarrete do gato que se senta.
    // Além disso, a perna some sob o tronco: aí o pé sobe junto ao peito e os
    // ossos encurtam, porque uma perna dobrada em Z ocupa muito menos espaço do
    // que a soma dos seus segmentos.
    const reach = pose.legReach[k]
    const groundY = Math.max(0, pose.legLift[k]) + A.pawRadius * 0.5
    const fold = Math.max(0, (tuck - 0.5) * 2)
    const slide = Math.min(1, tuck * 2)

    const foot = _v3.set(
      leg.hip.x + side * 0.002,
      groundY + fold * (leg.hip.y - groundY) * 0.55,
      leg.hip.z + reach + (fore ? 0.012 : -0.016) + slide * (fore ? 0.030 : 0.085) - fold * (fore ? 0.010 : 0.055),
    )

    // Ossos efetivamente mais curtos quando a perna está dobrada sob o corpo.
    const shrink = 1 - fold * 0.42
    const b1 = l1 * shrink
    const b2 = l2 * shrink
    const b3 = l3 * (1 - fold * 0.5)

    const reachable = (b1 + b2 + b3) * 0.985
    const toHip = foot.distanceTo(leg.hip)
    if (toHip > reachable) {
      foot.sub(leg.hip).multiplyScalar(reachable / toHip).add(leg.hip)
    }

    leg.toe.copy(foot)
    const stand = 1 - slide * 0.72
    leg.ankle.set(
      foot.x,
      foot.y + b3 * (fore ? 0.95 : 0.85) * stand,
      foot.z - b3 * (fore ? 0.12 : 0.45) - slide * 0.03,
    )

    // Cotovelo aponta para trás; joelho traseiro aponta para a frente.
    const pole = _v2.set(0, -0.15, fore ? -1 : 1).normalize()
    solveIK2(leg.hip, leg.ankle, b1, b2, pole, leg.knee)
  }

  return rig
}

function bodyRadiusY(t: number): number {
  const p = A.bodyProfile
  for (let i = 0; i < p.length - 1; i++) {
    if (t >= p[i][0] && t <= p[i + 1][0]) {
      const s = (t - p[i][0]) / (p[i + 1][0] - p[i][0])
      return p[i][2] + (p[i + 1][2] - p[i][2]) * s
    }
  }
  return p[p.length - 1][2]
}

/**
 * Cauda dinâmica. Em vez de forças soltas, a musculatura define uma curva-alvo
 * e o Verlet a persegue: o resultado tem o atraso, o peso e o repique de uma
 * cauda de verdade, sem nunca sair de controle.
 */
export class TailSim {
  points: THREE.Vector3[]
  private prev: THREE.Vector3[]
  private target: THREE.Vector3[]
  private segLen: number

  constructor() {
    const n = A.tailSegments
    this.segLen = A.tailLength / (n - 1)
    this.points = Array.from({ length: n }, (_, i) => new THREE.Vector3(0, 0.15, 0.1 + i * this.segLen))
    this.prev = this.points.map((p) => p.clone())
    this.target = this.points.map((p) => p.clone())
  }

  step(root: THREE.Vector3, rootDir: THREE.Vector3, pose: PoseParams, dt: number) {
    const n = this.points.length
    const seg = this.segLen
    const h = Math.min(dt, 1 / 30)

    // --- Curva que a musculatura quer manter ---
    const baseYaw = Math.atan2(rootDir.x, rootDir.z)
    let elev = pose.tailLift * 1.5
    let yaw = baseYaw
    this.target[0].copy(root)
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1)
      // A curvatura se concentra na metade final: é lá que a cauda "dobra".
      elev += (pose.tailCurl * Math.sin(t * Math.PI * 0.85) * 2.4 - pose.tailLift * 0.55) / (n - 1)
      yaw += (Math.sin(pose.tailSway - t * 2.6) * pose.tailFlick * 1.4) / (n - 1)
      const d = _v1.set(
        Math.sin(yaw) * Math.cos(elev),
        Math.sin(elev),
        Math.cos(yaw) * Math.cos(elev),
      )
      this.target[i].copy(this.target[i - 1]).addScaledVector(d, seg)
    }

    // --- Integração ---
    for (let i = 1; i < n; i++) {
      const p = this.points[i]
      const pr = this.prev[i]
      const vx = (p.x - pr.x) * 0.88
      const vy = (p.y - pr.y) * 0.88
      const vz = (p.z - pr.z) * 0.88
      pr.copy(p)
      p.x += vx
      p.y += vy - 1.8 * h * h * 60
      p.z += vz
      // Mola até a curva-alvo: mais forte na base, mais frouxa na ponta.
      const stiff = Math.min(1, (0.9 - (i / n) * 0.45) * h * 34)
      p.lerp(this.target[i], stiff)
    }

    // --- Restrições de comprimento ---
    // Propagadas da raiz para a ponta: uma única passada já resolve a cadeia
    // inteira sem sobrar folga, então a cauda nunca se parte em segmentos.
    this.points[0].copy(root)
    for (let i = 1; i < n; i++) {
      const a = this.points[i - 1]
      const b = this.points[i]
      const d = _v1.subVectors(b, a)
      const len = d.length()
      if (len < 1e-6) {
        b.copy(a).addScaledVector(rootDir, seg)
      } else {
        b.copy(a).addScaledVector(d, seg / len)
      }
      if (b.y < 0.012) b.y = 0.012
    }
  }
}
