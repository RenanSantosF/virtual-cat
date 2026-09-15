import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { Animator } from './animator'
import { makeModelFur, type ModelFur, type Quality } from './fur'
import type { Coat } from './coat'
import type { TouchRegion } from '../sim/touch'

/**
 * O gato.
 *
 * Carrega a malha já rigada e os clipes prontos, e não calcula pose nenhuma.
 * A diferença em relação ao que havia antes não é de qualidade de código: é de
 * natureza. Antes o runtime inventava a anatomia a cada quadro; agora ele só
 * escolhe qual animação toca.
 */

/** Comprimento do gato adulto, em metros, para casar com a escala do cômodo. */
const COMPRIMENTO_ADULTO = 0.46

/**
 * De osso para região do corpo.
 *
 * O toque é resolvido pelo osso mais próximo do ponto tocado, e não por uma
 * caixa desenhada à mão em volta de cada parte: o esqueleto acompanha a pose,
 * as caixas não. Cutucar a barriga do gato deitado tem de acertar a barriga.
 */
const REGIAO: Array<[RegExp, TouchRegion]> = [
  [/^orelha/, 'head'],
  [/^cabeca/, 'head'],
  [/^pescoco/, 'chin'],
  [/_pata$|_punho$/, 'paw'],
  [/^cauda0|^cauda1/, 'tailbase'],
  [/^cauda/, 'tail'],
  [/^coluna0|^coluna1/, 'back'],
  [/^coluna/, 'back'],
]

export class Gato {
  readonly group = new THREE.Group()
  animator!: Animator
  private malha!: THREE.SkinnedMesh
  private ossos = new Map<string, THREE.Object3D>()
  private escalaBase = 1
  private caixa = new THREE.Box3()
  private fur!: ModelFur
  private shells: THREE.SkinnedMesh[] = []
  private clock = 0

  static async carregar(
    url: string,
    coat: Coat,
    seed: number,
    quality: Quality,
    onProgress?: (m: string, f: number) => void,
  ): Promise<Gato> {
    const g = new Gato()
    onProgress?.('Carregando o gato', 0.1)
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.total) onProgress?.('Carregando o gato', 0.1 + (e.loaded / e.total) * 0.6)
    })
    onProgress?.('Montando', 0.8)

    const raiz = gltf.scene
    raiz.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) g.malha = o as THREE.SkinnedMesh
      if ((o as THREE.Bone).isBone) g.ossos.set(o.name, o)
      o.frustumCulled = false
      if ((o as THREE.Mesh).isMesh) {
        ;(o as THREE.Mesh).castShadow = true
        ;(o as THREE.Mesh).receiveShadow = true
      }
    })

    // O modelo foi esculpido olhando para +X; o jogo trata rumo 0 como +Z.
    const orienta = new THREE.Group()
    orienta.rotation.y = -Math.PI / 2
    orienta.add(raiz)

    // Escala e assentamento: medidos da malha, não escritos à mão, para que
    // trocar o modelo não exija mexer em número nenhum aqui.
    const caixa = new THREE.Box3().setFromObject(raiz)
    const tam = caixa.getSize(new THREE.Vector3())
    g.escalaBase = COMPRIMENTO_ADULTO / Math.max(tam.x, tam.z)
    orienta.scale.setScalar(g.escalaBase)
    orienta.position.y = -caixa.min.y * g.escalaBase
    g.group.add(orienta)

    g.aprimorarMaterial(coat, seed, quality)
    g.animator = new Animator(raiz, gltf.animations)
    onProgress?.('Pronto', 1)
    return g
  }

  /**
   * O material do .glb é o mínimo do exportador. O pelo precisa de brilho de
   * fio — a luz que corre na ponta do pelo e não na pele — e disso quem cuida
   * é o `sheen`, não o brilho especular comum.
   */
  private aprimorarMaterial(coat: Coat, seed: number, quality: Quality) {
    const antigo = this.malha.material as THREE.MeshStandardMaterial
    this.fur = makeModelFur(antigo.map, seed, quality)
    // Uma tintura sutil mantém olhos/nariz do atlas e faz a identidade genética
    // aparecer sem destruir detalhes pintados na textura original.
    this.fur.surface.color.copy(new THREE.Color(coat.base)).lerp(new THREE.Color(0xffffff), 0.72)
    this.malha.material = this.fur.surface
    for (const material of this.fur.shells) {
      material.color.copy(this.fur.surface.color)
      const shell = new THREE.SkinnedMesh(this.malha.geometry, material)
      shell.bind(this.malha.skeleton, this.malha.bindMatrix)
      shell.bindMode = this.malha.bindMode
      shell.position.copy(this.malha.position)
      shell.quaternion.copy(this.malha.quaternion)
      shell.scale.copy(this.malha.scale)
      shell.frustumCulled = false
      shell.castShadow = false
      shell.renderOrder = 1
      this.malha.parent?.add(shell)
      this.shells.push(shell)
    }
    antigo.dispose()
  }

  /**
   * Que parte do corpo está sob um ponto do mundo.
   *
   * A barriga não tem osso próprio: é reconhecida por posição, quando o ponto
   * tocado está claramente abaixo da linha da coluna mais próxima.
   */
  regiaoEm(ponto: THREE.Vector3): TouchRegion {
    let melhor: string | null = null
    let dist = Infinity
    const p = _v.copy(ponto)
    for (const [nome, osso] of this.ossos) {
      if (nome === 'raiz') continue
      const d = osso.getWorldPosition(_w).distanceToSquared(p)
      if (d < dist) {
        dist = d
        melhor = nome
      }
    }
    if (!melhor) return 'back'
    if (/^coluna/.test(melhor)) {
      const y = this.ossos.get(melhor)!.getWorldPosition(_w).y
      if (ponto.y < y - 0.012) return 'belly'
    }
    for (const [re, regiao] of REGIAO) if (re.test(melhor)) return regiao
    return 'back'
  }

  osso(nome: string): THREE.Object3D | undefined {
    return this.ossos.get(nome)
  }

  /** Centro real do corpo, para a câmera mirar o bicho e não os pés. */
  centro(out: THREE.Vector3): THREE.Vector3 {
    const espinha = this.ossos.get('coluna2') ?? this.ossos.get('coluna1')
    if (espinha) return espinha.getWorldPosition(out)
    this.caixa.setFromObject(this.group)
    return this.caixa.getCenter(out)
  }

  /** Escala por idade: o filhote é o mesmo modelo, menor e mais atarracado. */
  crescer(fator: number, neotenia: number) {
    this.group.scale.setScalar(fator)
    const cabeca = this.ossos.get('cabeca')
    if (cabeca) {
      // Filhote tem cabeça grande em relação ao corpo — é o que faz o olho ler
      // "filhote" e não "gato pequeno".
      // `neotenia` já vale 1 no adulto. Usá-lo diretamente acrescentava 22%
      // até ao crânio adulto e fazia o corpo parecer um boneco cabeçudo.
      const s = 1 + (neotenia - 1) * 0.72
      cabeca.scale.setScalar(s)
    }
  }

  update(dt: number, speed = 0, turnRate = 0, stress = 0) {
    this.clock += dt
    this.animator.update(dt)
    this.secondaryMotion(speed, turnRate, stress)
  }

  /** Movimento aditivo de baixa amplitude: quebra a rigidez dos clipes sem competir com eles. */
  private secondaryMotion(speed: number, turnRate: number, stress: number) {
    const moving = Math.min(1, speed / 1.4)
    const breath = Math.sin(this.clock * (moving > 0.1 ? 4.2 : 1.7)) * (0.006 + stress * 0.000025)
    const spine = this.ossos.get('coluna2')
    if (spine) {
      spine.rotation.z += Math.sin(this.clock * 5.1) * moving * 0.012
      spine.rotation.y += THREE.MathUtils.clamp(-turnRate * 0.018, -0.055, 0.055)
      spine.rotation.x += breath
    }
    const head = this.ossos.get('cabeca')
    if (head) {
      // Cabeça compensa o balanço do tronco; é a estabilidade visual felina.
      head.rotation.z -= Math.sin(this.clock * 5.1) * moving * 0.018
      head.rotation.y += THREE.MathUtils.clamp(turnRate * 0.035, -0.09, 0.09)
    }
    const alert = 0.018 + stress * 0.00022
    for (const [index, name] of ['orelhaE', 'orelhaD'].entries()) {
      const ear = this.ossos.get(name)
      if (ear) ear.rotation.y += Math.sin(this.clock * 2.3 + index * 2.1) * alert
    }
    // A cauda fica atrasada nas curvas e nunca acompanha o corpo como uma haste.
    for (let i = 0; i < 5; i++) {
      const tail = this.ossos.get(`cauda${i}`)
      if (tail) tail.rotation.z += -turnRate * 0.025 * ((i + 1) / 5) + Math.sin(this.clock * 1.4 - i * 0.45) * 0.006
    }
  }

  dispose() {
    this.malha.geometry.dispose()
    this.shells.forEach((shell) => shell.removeFromParent())
    this.fur.dispose()
  }
}

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
