import * as THREE from 'three'

/**
 * Máquina de animação.
 *
 * O sistema antigo calculava cada osso a cada quadro a partir de números, e o
 * gato saltava de uma postura para outra sem passar pelo meio. Aqui os clipes
 * vêm prontos do arquivo, e o trabalho é outro: decidir qual toca e como se
 * chega até ele.
 *
 * A parte que importa é a segunda. Um gato em pé não vira um gato dormindo:
 * ele senta, deita, e só então enrosca. Cada uma dessas passagens é um clipe
 * próprio, e o que liga tudo é um grafo de posturas — pedir "dormindo" com o
 * gato em pé enfileira as três. É isso que faz uma animação continuar na
 * outra em vez de trocar de estado no meio do ar.
 */

const MISTURA = 0.26

/** Posturas que o corpo pode ocupar, e o clipe que fica em laço em cada uma. */
type Postura = 'parado' | 'sentado' | 'deitado' | 'dormindo' | 'agachado'

/** Passagens entre posturas: de -> para -> clipe. */
const PASSAGENS: Record<Postura, Partial<Record<Postura, string>>> = {
  parado: { sentado: 'sentar', agachado: 'agachar' },
  sentado: { parado: 'levantar', deitado: 'deitar' },
  deitado: { parado: 'erguer', dormindo: 'adormecer' },
  dormindo: { deitado: 'acordar' },
  agachado: { parado: 'levantar' },
}

/** Cada atividade acontece a partir de uma postura, e repete ou não. */
interface Atividade {
  postura: Postura
  clipe: string
  laco: boolean
}

const ATIVIDADES: Record<string, Atividade> = {
  parado: { postura: 'parado', clipe: 'parado', laco: true },
  andar: { postura: 'parado', clipe: 'andar', laco: true },
  trotar: { postura: 'parado', clipe: 'trotar', laco: true },
  correr: { postura: 'parado', clipe: 'correr', laco: true },
  sentado: { postura: 'sentado', clipe: 'sentado', laco: true },
  deitado: { postura: 'deitado', clipe: 'deitado', laco: true },
  dormindo: { postura: 'dormindo', clipe: 'dormindo', laco: true },
  lamber: { postura: 'sentado', clipe: 'lamber', laco: true },
  beber: { postura: 'parado', clipe: 'beber', laco: true },
  comer: { postura: 'parado', clipe: 'comer', laco: true },
  na_caixa: { postura: 'agachado', clipe: 'na_caixa', laco: true },
  espreguicar: { postura: 'parado', clipe: 'espreguicar', laco: false },
  pular: { postura: 'parado', clipe: 'pular', laco: false },
}

/** Velocidade de referência de cada marcha, em m/s. */
const VELOCIDADE: Record<string, number> = { andar: 0.55, trotar: 1.35, correr: 3.2 }

/** Busca em largura: o caminho mais curto de uma postura até outra. */
function caminho(de: Postura, para: Postura): string[] {
  if (de === para) return []
  const fila: Array<[Postura, string[]]> = [[de, []]]
  const visto = new Set<Postura>([de])
  while (fila.length) {
    const [atual, rota] = fila.shift()!
    for (const [prox, clipe] of Object.entries(PASSAGENS[atual] ?? {})) {
      const p = prox as Postura
      if (visto.has(p)) continue
      const nova = [...rota, clipe as string]
      if (p === para) return nova
      visto.add(p)
      fila.push([p, nova])
    }
  }
  return []
}

export class Animator {
  readonly mixer: THREE.AnimationMixer
  private acoes = new Map<string, THREE.AnimationAction>()
  private postura: Postura = 'parado'
  private atividade = 'parado'
  private tocando = ''
  /** Clipes de passagem ainda por tocar, mais a atividade no fim. */
  private fila: string[] = []
  private restante = 0
  private esperando = false

  constructor(raiz: THREE.Object3D, clipes: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(raiz)
    for (const c of clipes) this.acoes.set(c.name, this.mixer.clipAction(c))
    const p = this.acoes.get('parado')
    if (p) {
      p.play()
      this.tocando = 'parado'
    }
  }

  get clipes(): string[] {
    return [...this.acoes.keys()]
  }

  get atual(): string {
    return this.tocando
  }

  get emTransicao(): boolean {
    return this.esperando
  }

  tem(nome: string): boolean {
    return this.acoes.has(nome)
  }

  /**
   * Pede uma atividade. Seguro chamar todo quadro: repetir o pedido atual não
   * interrompe nada, e uma troca no meio de uma passagem espera ela terminar
   * em vez de cortar o gato no meio do movimento.
   */
  pedir(atividade: string) {
    if (atividade === this.atividade) return
    const alvo = ATIVIDADES[atividade]
    if (!alvo) return
    this.atividade = atividade
    const rota = caminho(this.postura, alvo.postura).filter((c) => this.tem(c))
    this.postura = alvo.postura
    this.fila = [...rota, alvo.clipe]
    if (!this.esperando) this.proximo()
  }

  private proximo() {
    const nome = this.fila.shift()
    if (!nome) {
      this.esperando = false
      return
    }
    const a = this.acoes.get(nome)
    if (!a) {
      this.proximo()
      return
    }
    const ultimo = this.fila.length === 0
    const emLaco = ultimo && (ATIVIDADES[this.atividade]?.laco ?? true)
    a.reset()
    a.setLoop(emLaco ? THREE.LoopRepeat : THREE.LoopOnce, emLaco ? Infinity : 1)
    a.clampWhenFinished = !emLaco
    a.setEffectiveWeight(1)
    a.setEffectiveTimeScale(1)
    a.enabled = true
    a.play()
    const velha = this.acoes.get(this.tocando)
    if (velha && velha !== a) a.crossFadeFrom(velha, MISTURA, false)
    this.tocando = nome
    if (emLaco) {
      this.esperando = false
    } else {
      this.esperando = true
      // Desconta metade da mistura: encadear no fim exato do clipe deixa um
      // quadro de pose congelada entre uma animação e a seguinte.
      this.restante = Math.max(0.06, a.getClip().duration - MISTURA * 0.5)
    }
  }

  update(dt: number) {
    if (this.esperando) {
      this.restante -= dt
      if (this.restante <= 0) this.proximo()
    }
    this.mixer.update(dt)
  }

  /**
   * Marcha em função da velocidade, com histerese.
   *
   * Sem a histerese, uma velocidade parada em cima do limiar faz o gato
   * alternar entre duas marchas a cada quadro.
   */
  locomocao(velocidade: number): string | null {
    const a = this.atividade
    if (velocidade > (a === 'correr' ? 1.7 : 2.1)) return 'correr'
    if (velocidade > (a === 'trotar' ? 0.72 : 0.92)) return 'trotar'
    if (velocidade > (a === 'andar' ? 0.06 : 0.12)) return 'andar'
    return null
  }

  /**
   * Casa a passada com o chão.
   *
   * O clipe foi animado para uma velocidade só. Tocado sempre no mesmo ritmo,
   * as patas escorregam quando o gato anda mais depressa — o defeito que faz
   * um personagem parecer patinar em vez de caminhar.
   */
  ritmo(nome: string, velocidade: number) {
    const base = VELOCIDADE[nome]
    const a = this.acoes.get(nome)
    if (base && a) a.setEffectiveTimeScale(Math.max(0.5, Math.min(2.2, velocidade / base)))
  }
}
