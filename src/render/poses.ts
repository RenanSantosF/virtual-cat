import { A } from './anatomy'
import { defaultPose, type PoseParams } from './rig'
import type { BehaviorId } from '../sim/types'

export interface FacePose {
  eyeOpen: number
  /** Dilatação da pupila: 0 = fenda fina, 1 = redonda e enorme. */
  pupil: number
  jaw: number
  /** 0 = orelhas erguidas para a frente, 1 = achatadas para trás. */
  earBack: number
  earTwitch: number
  whisker: number
}

export interface Anim {
  pose: PoseParams
  face: FacePose
}

export interface AnimContext {
  t: number
  speed: number
  contentment: number
  stress: number
  energy: number
  stridePhase: number
  blink: number
  kitten: number
  /** 0..1 — quanto o corpo denuncia que algo não vai bem. */
  sick: number
}

type Gait = { phases: [number, number, number, number]; duty: number; stride: number; lift: number }

/** Sequência lateral: traseira, dianteira do mesmo lado, depois o outro lado. */
const WALK: Gait = { phases: [0.25, 0.75, 0.0, 0.5], duty: 0.62, stride: 0.072, lift: 0.024 }
const TROT: Gait = { phases: [0.0, 0.5, 0.5, 0.0], duty: 0.46, stride: 0.10, lift: 0.038 }
/** Galope saltado: as duas traseiras impulsionam quase juntas. */
const BOUND: Gait = { phases: [0.0, 0.1, 0.52, 0.6], duty: 0.34, stride: 0.15, lift: 0.07 }
const STALK: Gait = { phases: [0.0, 0.5, 0.25, 0.75], duty: 0.74, stride: 0.046, lift: 0.016 }

function applyGait(pose: PoseParams, g: Gait, phase: number, bounce: { y: number }) {
  let support = 0
  for (let i = 0; i < 4; i++) {
    const p = (phase + g.phases[i]) % 1
    if (p < g.duty) {
      // Apoio: o pé fica parado no chão e o corpo passa por cima dele.
      const s = p / g.duty
      pose.legReach[i] = (0.5 - s) * g.stride
      pose.legLift[i] = 0
      support++
    } else {
      // Balanço: arco para a frente.
      const s = (p - g.duty) / (1 - g.duty)
      pose.legReach[i] = (s - 0.5) * g.stride
      pose.legLift[i] = Math.sin(s * Math.PI) * g.lift
    }
  }
  bounce.y = support < 2 ? -0.014 : 0.003
}

export function animate(behavior: BehaviorId, ctx: AnimContext): Anim {
  const pose = defaultPose()
  const face: FacePose = { eyeOpen: 1, pupil: 0.35, jaw: 0, earBack: 0, earTwitch: 0, whisker: 0.4 }
  const t = ctx.t
  const bounce = { y: 0 }

  // Respiração: sempre presente, mais lenta e profunda no sono.
  const rate = behavior === 'sleep' ? 0.4 : behavior === 'run' ? 2.3 : 0.72
  const breath = Math.sin(t * Math.PI * 2 * rate)

  face.eyeOpen = ctx.blink
  face.pupil = 0.28 + ctx.stress * 0.5
  face.earBack = Math.min(1, ctx.stress * 1.05)
  face.earTwitch = Math.sin(t * 3.1) * 0.5 + Math.sin(t * 7.7) * 0.3

  // Cauda: alta e curvada quando contente, baixa e presa quando com medo.
  pose.tailLift = 0.05 + ctx.contentment * 0.5 - ctx.stress * 0.45
  pose.tailCurl = 0.3 + ctx.contentment * 0.45
  pose.tailSway = t * 1.3
  pose.tailFlick = 0.18 + ctx.stress * 0.3

  switch (behavior) {
    case 'sleep': {
      // Enrolado em bola, focinho junto à barriga.
      // "Pão de forma": corpo compacto no chão, patas escondidas embaixo,
      // cabeça baixa e virada para o flanco. É a postura mais comum de um gato
      // dormindo e, ao contrário do novelo fechado, não faz o corpo atravessar
      // a si mesmo quando a malha é deformada por ossos.
      pose.height = 0.30
      pose.pitch = 0.04
      pose.curl = 0.18
      pose.bend = 0.55
      pose.tuckFront = 1
      pose.tuckBack = 1
      pose.neck = 0.35
      pose.headPitch = 0.30
      pose.headYaw = 0.55
      pose.headRoll = 0.35
      face.eyeOpen = 0
      face.earBack = 0.3
      face.earTwitch *= 0.12
      pose.tailLift = -0.5
      pose.tailCurl = 1.5
      pose.tailFlick = 0.02
      break
    }
    case 'doze': {
      // "Pão de forma": patas escondidas sob o corpo, olhos semicerrados.
      pose.height = 0.34
      pose.pitch = 0.05
      pose.bend = 0.3
      pose.tuckFront = 1
      pose.tuckBack = 1
      pose.neck = 0.6
      pose.headPitch = 0.14 + Math.sin(t * 0.3) * 0.07
      face.eyeOpen = Math.min(face.eyeOpen, 0.2 + Math.sin(t * 0.4) * 0.1)
      face.earBack = Math.max(face.earBack, 0.12)
      pose.tailLift = -0.35
      pose.tailCurl = 0.9
      pose.tailFlick = 0.04
      break
    }
    case 'sit': {
      // Sentado: traseiro no chão, dianteiras retas, peito erguido.
      pose.height = 1.0
      pose.pitch = 0.35
      pose.tuckBack = 0.9
      pose.tuckFront = 0
      pose.neck = 1.15
      pose.headYaw = Math.sin(t * 0.23) * 0.32
      pose.headPitch = Math.sin(t * 0.17) * 0.09
      pose.tailLift = -0.25
      pose.tailCurl = 0.75
      pose.tailFlick = 0.12
      break
    }
    case 'watch': {
      pose.height = 1.0
      pose.pitch = 0.35
      pose.tuckBack = 0.9
      pose.neck = 1.25
      pose.headPitch = -0.2
      // Micro-sacadas: ele está mesmo seguindo alguma coisa lá fora.
      pose.headYaw = Math.sin(t * 0.9) * 0.16 + Math.sin(t * 2.7) * 0.045
      face.pupil = Math.min(1, face.pupil + 0.22)
      face.whisker = 0.75
      face.earBack = Math.max(0, face.earBack - 0.2)
      pose.tailLift = -0.2
      pose.tailFlick = 0.55
      pose.tailSway = t * 2.2
      break
    }
    case 'stretch': {
      // Peito no chão, quadril no alto, dianteiras esticadas à frente.
      const s = Math.min(1, (t % 5) / 1.3)
      const e = Math.sin(s * Math.PI)
      pose.height = 1.0 - e * 0.5
      pose.pitch = -0.55 * e
      pose.arch = -0.4 * e
      pose.legReach[0] = 0.075 * e
      pose.legReach[1] = 0.075 * e
      pose.neck = 1 - e * 0.4
      pose.headPitch = 0.25 * e
      face.jaw = e * 0.55
      face.eyeOpen = Math.min(face.eyeOpen, 1 - e * 0.9)
      pose.tailLift = 0.95 * e
      pose.tailCurl = 0.15
      break
    }
    case 'groom': {
      // Lambendo o flanco: sentado, coluna torcida, cabeça no próprio corpo.
      pose.height = 0.95
      pose.pitch = 0.32
      pose.tuckBack = 0.88
      pose.bend = 0.5
      pose.neck = 0.7
      pose.headYaw = 0.95 + Math.sin(t * 6.2) * 0.14
      pose.headPitch = 0.62 + Math.sin(t * 6.2) * 0.2
      pose.headRoll = 0.3
      face.jaw = Math.max(0, Math.sin(t * 6.2)) * 0.22
      face.eyeOpen = Math.min(face.eyeOpen, 0.35)
      pose.tailLift = -0.3
      pose.tailFlick = 0.05
      break
    }
    case 'eat': {
      // Em pé, pescoço abaixado até o pote.
      pose.height = 0.92
      pose.pitch = -0.1
      pose.neck = -0.5
      pose.headPitch = 0.5
      face.jaw = (Math.sin(t * 8.5) * 0.5 + 0.5) * 0.28
      face.eyeOpen = Math.min(face.eyeOpen, 0.55)
      face.earBack = Math.max(face.earBack, 0.12)
      pose.tailLift = 0.05
      pose.tailFlick = 0.1
      break
    }
    case 'drink': {
      pose.height = 0.9
      pose.pitch = -0.08
      pose.neck = -0.62
      pose.headPitch = 0.6
      // A língua bate rápido, mas a mandíbula quase não abre.
      face.jaw = (Math.sin(t * 6) * 0.5 + 0.5) * 0.1
      face.eyeOpen = Math.min(face.eyeOpen, 0.5)
      pose.tailLift = 0.05
      break
    }
    case 'litter': {
      // Agachado, com as costas arqueadas e o olhar longe.
      pose.height = 0.56
      pose.pitch = 0.35
      pose.tuckBack = 0.55
      pose.tuckFront = 0.2
      pose.arch = 0.3
      pose.neck = 0.9
      pose.headYaw = Math.sin(t * 0.8) * 0.4
      pose.tailLift = 0.35
      pose.tailFlick = 0.02
      break
    }
    case 'knead': {
      // Esfinge, patas dianteiras alternando, cara de completa satisfação.
      pose.height = 0.5
      pose.pitch = 0.3
      pose.tuckBack = 1
      pose.tuckFront = 0.25
      pose.neck = 0.85
      const k = t * 2.1
      pose.legLift[0] = (Math.sin(k) * 0.5 + 0.5) * 0.028
      pose.legLift[1] = (Math.sin(k + Math.PI) * 0.5 + 0.5) * 0.028
      face.eyeOpen = Math.min(face.eyeOpen, 0.26)
      face.earBack = 0.12
      pose.tailLift = 0.1
      pose.tailFlick = 0.08
      break
    }
    case 'purr': {
      pose.height = 0.52
      pose.pitch = 0.28
      pose.tuckBack = 1
      pose.tuckFront = 0.5
      pose.neck = 0.9
      face.eyeOpen = Math.min(face.eyeOpen, 0.22)
      face.earBack = 0.08
      // A vibração do ronronar, ~25 Hz, apenas insinuada.
      pose.arch += Math.sin(t * 50) * 0.005
      pose.headPitch = 0.08
      pose.tailLift = 0.15
      pose.tailFlick = 0.05
      break
    }
    case 'rub': {
      // Esfregando o corpo: dobra em arco e rola a cabeça.
      pose.height = 1.0
      pose.bend = Math.sin(t * 1.5) * 0.9
      pose.headRoll = Math.sin(t * 1.5) * 0.5
      pose.headYaw = Math.sin(t * 1.5) * 0.35
      pose.neck = 1.1
      // Cauda em ponto de interrogação: o cumprimento amigável do gato.
      pose.tailLift = 1.15
      pose.tailCurl = 0.95
      pose.tailFlick = 0.08
      face.eyeOpen = Math.min(face.eyeOpen, 0.5)
      break
    }
    case 'meow': {
      pose.height = 1.0
      pose.pitch = 0.35
      pose.tuckBack = 0.9
      pose.neck = 1.2
      const m = (t * 0.75) % 1
      face.jaw = m < 0.45 ? Math.sin((m / 0.45) * Math.PI) * 0.7 : 0
      pose.headPitch = -0.28
      face.whisker = 0.85
      pose.tailFlick = 0.5
      pose.tailSway = t * 2
      break
    }
    case 'hide': {
      // Encolhido, orelhas coladas, pupilas totalmente abertas.
      pose.height = 0.42
      pose.pitch = 0.12
      pose.tuckFront = 0.7
      pose.tuckBack = 0.7
      pose.arch = 0.2
      pose.neck = 0.45
      pose.headPitch = 0.2
      face.earBack = 1
      face.pupil = 1
      face.whisker = 0
      pose.tailLift = -0.6
      pose.tailCurl = 1.3
      pose.tailFlick = 0.02
      break
    }
    case 'stalk': {
      // Rastejando: barriga quase raspando o chão, quadril balançando.
      pose.height = 0.55
      pose.pitch = 0.05
      pose.arch = 0.1
      pose.neck = 0.5
      pose.headPitch = -0.05
      face.pupil = 1
      face.whisker = 1
      face.earBack = 0
      applyGait(pose, STALK, ctx.stridePhase, bounce)
      pose.bend = Math.sin(t * 4.5) * 0.1
      pose.tailLift = -0.45
      pose.tailCurl = 0.1
      pose.tailFlick = 0.9
      pose.tailSway = t * 5
      break
    }
    case 'pounce': {
      const s = Math.min(1, (t % 1.2) / 0.45)
      const e = Math.sin(s * Math.PI)
      pose.height = 1.0 + e * 0.55
      pose.arch = -0.45 * e
      pose.pitch = -0.3 * e
      pose.legReach[0] = 0.085 * e
      pose.legReach[1] = 0.085 * e
      pose.legLift[0] = 0.055 * e
      pose.legLift[1] = 0.055 * e
      face.pupil = 1
      face.whisker = 1
      pose.headPitch = -0.15
      pose.tailLift = 0.5
      break
    }
    case 'play': {
      applyGait(pose, TROT, ctx.stridePhase, bounce)
      pose.height = 1.0
      pose.bend = Math.sin(t * 3) * 0.18
      face.pupil = 0.85
      face.whisker = 0.9
      pose.tailLift = 0.6
      pose.tailFlick = 0.8
      pose.tailSway = t * 4
      break
    }
    case 'run': {
      applyGait(pose, BOUND, ctx.stridePhase, bounce)
      // No galope a coluna é uma mola: flexiona e estende a cada salto.
      pose.arch = Math.sin(ctx.stridePhase * Math.PI * 2) * 0.38
      pose.height = 1.0
      pose.headPitch = -0.12
      pose.neck = 0.85
      face.earBack = 0.45
      face.pupil = 0.9
      pose.tailLift = 0.45
      pose.tailCurl = 0.15
      break
    }
    case 'walk': {
      applyGait(pose, ctx.speed > 1.1 ? TROT : WALK, ctx.stridePhase, bounce)
      pose.height = 1.0
      pose.bend = Math.sin(ctx.stridePhase * Math.PI * 2) * 0.06
      pose.headYaw = Math.sin(ctx.stridePhase * Math.PI * 2) * 0.04
      break
    }
    case 'retch': {
      // Engasgo seco: pescoço esticado para a frente e para baixo, corpo
      // contraído em espasmos. É o sinal mais visível de bola de pelo.
      const cycle = (t * 1.1) % 1
      const spasm = Math.max(0, Math.sin(cycle * Math.PI * 3))
      pose.height = 0.62
      pose.pitch = 0.1
      pose.tuckFront = 0.35
      pose.tuckBack = 0.5
      pose.neck = -0.7 - spasm * 0.4
      pose.headPitch = 0.45 + spasm * 0.3
      pose.arch = 0.15 + spasm * 0.25
      face.jaw = spasm * 0.55
      face.eyeOpen = Math.min(face.eyeOpen, 0.35)
      face.earBack = 0.5
      pose.tailLift = -0.4
      pose.tailFlick = 0.02
      break
    }
    case 'sneeze': {
      const c2 = (t * 1.6) % 1
      const burst = c2 < 0.2 ? Math.sin((c2 / 0.2) * Math.PI) : 0
      pose.height = 0.95
      pose.pitch = 0.3
      pose.tuckBack = 0.85
      pose.neck = 1.0 - burst * 0.5
      pose.headPitch = -0.15 + burst * 0.65
      face.jaw = burst * 0.35
      face.eyeOpen = Math.min(face.eyeOpen, 1 - burst)
      face.earBack = 0.3 + burst * 0.4
      pose.tailFlick = 0.1
      break
    }
    case 'limp': {
      // Mancando: passada curta, cabeça baixa, dorso levemente arqueado.
      applyGait(pose, WALK, ctx.stridePhase, bounce)
      for (let i = 0; i < 4; i++) {
        pose.legReach[i] *= 0.55
        pose.legLift[i] *= 0.5
      }
      pose.height = 0.88
      pose.arch = 0.16
      pose.neck = 0.6
      pose.headPitch = 0.16
      face.earBack = Math.max(face.earBack, 0.35)
      face.eyeOpen = Math.min(face.eyeOpen, 0.6)
      pose.tailLift = -0.5
      pose.tailFlick = 0.03
      break
    }
    case 'idle':
    default: {
      pose.height = 1.0
      pose.headYaw = Math.sin(t * 0.31) * 0.28
      pose.headPitch = Math.sin(t * 0.22) * 0.08
      pose.tailSway = t * 0.9
      break
    }
  }

  // A respiração entra depois da pose, para valer em qualquer posição.
  pose.arch += breath * (behavior === 'sleep' ? 0.05 : 0.018)

  // Doença encurva a postura, baixa a cabeça e derruba a cauda, seja qual for
  // o comportamento. É o sinal de fundo que o dono aprende a reconhecer.
  if (ctx.sick > 0.05) {
    pose.arch += ctx.sick * 0.18
    pose.neck -= ctx.sick * 0.35
    pose.headPitch += ctx.sick * 0.2
    pose.height -= ctx.sick * 0.08
    pose.tailLift -= ctx.sick * 0.5
    pose.tailFlick *= 1 - ctx.sick * 0.8
    face.eyeOpen = Math.min(face.eyeOpen, 1 - ctx.sick * 0.45)
    face.earBack = Math.max(face.earBack, ctx.sick * 0.5)
    face.whisker *= 1 - ctx.sick * 0.5
  }

  // Filhote: mais rápido, mais brusco, um pouco desengonçado.
  if (ctx.kitten > 0) {
    pose.headYaw += Math.sin(t * 5.3) * 0.05 * ctx.kitten
    pose.bend += Math.sin(t * 4.1) * 0.04 * ctx.kitten
    face.pupil = Math.min(1, face.pupil + 0.25 * ctx.kitten)
  }

  pose.height += bounce.y / A.standHeight
  // Teto de curvatura: além disto a malha começa a atravessar a si mesma.
  pose.bend = Math.max(-1.1, Math.min(1.1, pose.bend))
  pose.curl = Math.max(-0.8, Math.min(0.8, pose.curl))
  return { pose, face }
}
