import type { PoseParams } from './rig'
import type { FacePose } from './poses'
import { SPOTS } from '../sim/world'
import type { CatState } from '../sim/types'

/**
 * A camada que separa "boneco parado" de "bicho parado".
 *
 * Nenhum animal fica imóvel. Mesmo dormindo o tórax sobe e desce; acordado e
 * sem fazer nada, o peso passa de uma pata para outra, a cabeça se reajusta, o
 * olhar corre pela sala e a ponta da cauda se mexe sozinha. São movimentos
 * pequenos demais para alguém apontar — e é a ausência deles que faz o modelo
 * parecer uma estátua com poses trocadas.
 */

export interface Attention {
  /** Para onde ele está olhando, em coordenadas do chão. */
  target: [number, number] | null
  /** Quando escolhe outro ponto. */
  until: number
  /** Está olhando para quem segura o telefone? */
  atCamera: boolean
}

export function newAttention(): Attention {
  return { target: null, until: 0, atCamera: false }
}

/**
 * Escolhe para onde olhar.
 *
 * Um gato ocioso não fica de olhar vago: ele varre a sala e para em coisas
 * específicas — a janela, o pote, a porta, você. Trocar de alvo de tempos em
 * tempos é o que dá a impressão de que existe alguém decidindo lá dentro.
 */
export function updateAttention(
  att: Attention,
  cat: CatState,
  now: number,
  lure: [number, number] | null,
): Attention {
  // O brinquedo em movimento ganha de qualquer outro interesse.
  if (lure) {
    att.target = lure
    att.atCamera = false
    att.until = now + 900
    return att
  }
  if (now < att.until) return att

  const p = cat.personality
  const r = Math.random()
  att.atCamera = false
  // Quanto mais confia, mais olha para você.
  const wantsYou = 0.14 + (cat.bond / 100) * 0.3 * (0.3 + p.sociability)

  if (r < wantsYou) {
    att.atCamera = true
    att.target = null
    att.until = now + 1200 + Math.random() * 2600
  } else if (r < wantsYou + 0.22 * (0.3 + p.curiosity)) {
    att.target = [SPOTS.window[0], SPOTS.window[1]]
    att.until = now + 2000 + Math.random() * 4000
  } else if (r < wantsYou + 0.38 && cat.needs.hunger < 65) {
    att.target = [SPOTS.bowl[0], SPOTS.bowl[1]]
    att.until = now + 900 + Math.random() * 1800
  } else if (r < wantsYou + 0.52) {
    att.target = [SPOTS.scratcher[0], SPOTS.scratcher[1]]
    att.until = now + 1200 + Math.random() * 2400
  } else {
    // Um ponto qualquer — barulho na parede, sombra que passou.
    att.target = [
      cat.pos[0] + (Math.random() * 2 - 1) * 1.8,
      cat.pos[1] + (Math.random() * 2 - 1) * 1.8,
    ]
    att.until = now + 700 + Math.random() * 1900
  }
  return att
}

export interface LifeContext {
  t: number
  /** 0 parado, 1 em movimento pleno. */
  moving: number
  /** 0..1 — quão adormecido está. */
  asleep: number
  /** 0..1 — energia disponível. */
  energy: number
  /** 0..1 — estresse. */
  stress: number
  /** 0..1 — desconforto por doença. */
  sick: number
  /** 0..1 — filhote. */
  kitten: number
}

/**
 * Aplica a vida de fundo sobre uma pose já pronta.
 *
 * Roda depois de tudo, inclusive da suavização, porque estes movimentos são de
 * amplitude pequena e frequência própria: passar pelo suavizador os apagaria.
 */
export function applyIdleLife(pose: PoseParams, face: FacePose, ctx: LifeContext) {
  const t = ctx.t
  const still = 1 - ctx.moving

  // --- Respiração ---
  // Gato em repouso respira de 20 a 30 vezes por minuto; dormindo, mais devagar
  // e mais fundo. Correndo, ofega.
  const rate = ctx.asleep > 0.5 ? 0.42 : 0.55 + ctx.moving * 1.9 + ctx.sick * 0.5
  const depth = (ctx.asleep > 0.5 ? 1.6 : 1) * (1 + ctx.sick * 0.5)
  const breath = Math.sin(t * Math.PI * 2 * rate)
  pose.arch += breath * 0.022 * depth
  // O tórax também empurra o corpo para cima, de leve.
  pose.height += breath * 0.008 * depth
  // Ao inspirar fundo, a cabeça sobe um fio.
  pose.headPitch -= breath * 0.014 * depth

  if (ctx.asleep > 0.35) {
    // Dormindo, o resto do corpo se aquieta: sobra a respiração e um espasmo
    // ocasional de pata, que todo gato tem em sono profundo.
    const twitch = Math.max(0, Math.sin(t * 0.37) - 0.985) * 60
    pose.legLift[0] += twitch * 0.004
    pose.headRoll += twitch * 0.02
    return
  }

  // --- Deslocamento de peso ---
  // Parado, o gato troca o apoio de um lado para o outro, bem devagar. É o
  // movimento que mais falta quando um modelo "congela em pé".
  const sway = Math.sin(t * 0.31) * 0.5 + Math.sin(t * 0.17 + 1.3) * 0.5
  pose.bend += sway * 0.035 * still
  pose.height += Math.sin(t * 0.23) * 0.012 * still
  pose.legLift[0] += Math.max(0, Math.sin(t * 0.31)) * 0.002 * still
  pose.legLift[3] += Math.max(0, -Math.sin(t * 0.31)) * 0.002 * still

  // --- Micro-ajustes da cabeça ---
  // Três frequências que não fecham ciclo entre si: o movimento nunca se
  // repete igual, que é o que impede o olho de perceber um laço.
  pose.headYaw += (Math.sin(t * 0.43) * 0.6 + Math.sin(t * 1.17 + 2.1) * 0.25) * 0.035 * still
  pose.headPitch += Math.sin(t * 0.61 + 0.7) * 0.02 * still
  pose.headRoll += Math.sin(t * 0.29 + 1.9) * 0.025 * still

  // Filhote se mexe mais e com menos firmeza.
  if (ctx.kitten > 0) {
    pose.headYaw += Math.sin(t * 2.7) * 0.03 * ctx.kitten * still
    pose.bend += Math.sin(t * 3.3 + 0.6) * 0.02 * ctx.kitten
  }

  // --- Cauda com vida própria ---
  // A ponta se mexe sozinha mesmo com o gato imóvel, em surtos curtos.
  const flickPhase = (t * 0.21) % 1
  const flick = flickPhase < 0.13 ? Math.sin((flickPhase / 0.13) * Math.PI) : 0
  pose.tailFlick += flick * 0.55 * still
  pose.tailSway += flick * 1.2
  // Estresse mantém a cauda em atividade contínua.
  pose.tailFlick += ctx.stress * 0.35

  // --- Bigodes e pupila ---
  face.whisker += Math.sin(t * 0.53) * 0.05
  // A pupila responde à luz e ao susto, com um tremor mínimo sempre presente.
  face.pupil += Math.sin(t * 0.19) * 0.03
}
