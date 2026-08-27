import { defaultPose, type PoseParams } from './rig'
import type { FacePose } from './poses'

/**
 * Transição entre poses.
 *
 * Sem isto o gato trocava de pose no mesmo quadro em que trocava de ideia —
 * sentado num instante, andando no seguinte. Nada num corpo real muda de
 * posição instantaneamente, e é o que fazia tudo parecer um boneco articulado
 * mudando de estado em vez de um bicho se mexendo.
 */

/** Convergência independente da taxa de quadros. */
function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export function blendPose(a: PoseParams, b: PoseParams, t: number, out?: PoseParams): PoseParams {
  const o = out ?? defaultPose()
  const l = (x: number, y: number) => x + (y - x) * t
  o.arch = l(a.arch, b.arch)
  o.bend = l(a.bend, b.bend)
  o.height = l(a.height, b.height)
  o.pitch = l(a.pitch, b.pitch)
  o.curl = l(a.curl, b.curl)
  o.headYaw = l(a.headYaw, b.headYaw)
  o.headPitch = l(a.headPitch, b.headPitch)
  o.headRoll = l(a.headRoll, b.headRoll)
  o.neck = l(a.neck, b.neck)
  o.tuckFront = l(a.tuckFront, b.tuckFront)
  o.tuckBack = l(a.tuckBack, b.tuckBack)
  o.tailLift = l(a.tailLift, b.tailLift)
  o.tailCurl = l(a.tailCurl, b.tailCurl)
  o.tailSway = l(a.tailSway, b.tailSway)
  o.tailFlick = l(a.tailFlick, b.tailFlick)
  for (let i = 0; i < 4; i++) {
    o.legLift[i] = l(a.legLift[i], b.legLift[i])
    o.legReach[i] = l(a.legReach[i], b.legReach[i])
  }
  return o
}

/**
 * Velocidade com que cada parte do corpo alcança a pose desejada.
 *
 * Não é um número só: a cabeça reage antes do tronco, e a cauda é a última a
 * saber de tudo. É essa defasagem que dá a impressão de massa — o corpo
 * inteiro chegando junto seria robótico de outro jeito.
 */
const RATE = {
  head: 7.5,
  spine: 3.4,
  height: 4.0,
  legs: 9.0,
  tail: 2.6,
}

export class PoseSmoother {
  private cur: PoseParams = defaultPose()
  private started = false

  /** Salta direto para a pose, sem transição. Usado no primeiro quadro. */
  snap(target: PoseParams) {
    blendPose(target, target, 0, this.cur)
    this.started = true
  }

  /**
   * @param strideAuthority 0..1 — o quanto a passada manda nas pernas. Durante
   * a caminhada ela precisa passar sem suavização, senão o passo vira mingau;
   * parado, as pernas voltam a ser suavizadas como o resto.
   */
  update(target: PoseParams, dt: number, strideAuthority = 0): PoseParams {
    if (!this.started) {
      this.snap(target)
      return this.cur
    }
    const c = this.cur
    const h = Math.min(dt, 1 / 20)

    c.headYaw = approach(c.headYaw, target.headYaw, RATE.head, h)
    c.headPitch = approach(c.headPitch, target.headPitch, RATE.head, h)
    c.headRoll = approach(c.headRoll, target.headRoll, RATE.head, h)
    c.neck = approach(c.neck, target.neck, RATE.head * 0.7, h)

    c.arch = approach(c.arch, target.arch, RATE.spine, h)
    c.bend = approach(c.bend, target.bend, RATE.spine, h)
    c.pitch = approach(c.pitch, target.pitch, RATE.spine, h)
    c.curl = approach(c.curl, target.curl, RATE.spine, h)
    c.height = approach(c.height, target.height, RATE.height, h)
    c.tuckFront = approach(c.tuckFront, target.tuckFront, RATE.spine, h)
    c.tuckBack = approach(c.tuckBack, target.tuckBack, RATE.spine, h)

    c.tailLift = approach(c.tailLift, target.tailLift, RATE.tail, h)
    c.tailCurl = approach(c.tailCurl, target.tailCurl, RATE.tail, h)
    c.tailFlick = approach(c.tailFlick, target.tailFlick, RATE.tail, h)
    c.tailSway = target.tailSway

    for (let i = 0; i < 4; i++) {
      if (strideAuthority > 0.99) {
        c.legLift[i] = target.legLift[i]
        c.legReach[i] = target.legReach[i]
      } else {
        const rate = RATE.legs * (0.4 + strideAuthority * 2)
        c.legLift[i] = approach(c.legLift[i], target.legLift[i], rate, h)
        c.legReach[i] = approach(c.legReach[i], target.legReach[i], rate, h)
      }
    }
    return c
  }
}

/** O rosto também não muda de expressão num quadro. */
export class FaceSmoother {
  private cur: FacePose = { eyeOpen: 1, pupil: 0.35, jaw: 0, earBack: 0, earTwitch: 0, whisker: 0.4 }
  private started = false

  update(target: FacePose, dt: number): FacePose {
    const h = Math.min(dt, 1 / 20)
    const c = this.cur
    if (!this.started) {
      Object.assign(c, target)
      this.started = true
      return c
    }
    // Piscar é rápido de propósito: suavizar a pálpebra apagaria a piscada.
    c.eyeOpen = target.eyeOpen
    c.jaw = approach(c.jaw, target.jaw, 14, h)
    c.pupil = approach(c.pupil, target.pupil, 3.2, h)
    c.earBack = approach(c.earBack, target.earBack, 6, h)
    c.earTwitch = target.earTwitch
    c.whisker = approach(c.whisker, target.whisker, 4, h)
    return c
  }
}
