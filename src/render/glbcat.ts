import * as THREE from 'three'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { largestComponent, toFloat32, usedPositions } from './meshclean'
import { skeletonize, type ExtractedSkeleton } from './skeletonize'
import { buildBlinkTextures, type BlinkTextures } from './blink'
import { applyTargets, buildBones, computeSkinning, type RiggedSkeleton } from './glbrig'
import { GlbPoser } from './glbpose'
import { defaultPose, type PoseParams } from './rig'
import type { TouchRegion } from '../sim/touch'
import type { FacePose } from './poses'
export { defaultPose }

/** Comprimento do tronco de um gato adulto, do quadril ao pescoço, em metros. */
const ADULT_BODY_LENGTH = 0.30

const SPINE_BONES = 10
const NECK_BONES = 2

/** Cauda dinâmica com os comprimentos de segmento vindos do próprio modelo. */
class TailChain {
  points: THREE.Vector3[]
  private prev: THREE.Vector3[]
  private target: THREE.Vector3[]
  private seg: number[]

  constructor(seg: number[], start: THREE.Vector3) {
    this.seg = seg
    this.points = [start.clone()]
    for (let i = 0; i < seg.length; i++) {
      this.points.push(this.points[i].clone().add(new THREE.Vector3(0, seg[i] * 0.3, -seg[i])))
    }
    this.prev = this.points.map((p) => p.clone())
    this.target = this.points.map((p) => p.clone())
  }

  step(root: THREE.Vector3, rootDir: THREE.Vector3, pose: PoseParams, dt: number) {
    const n = this.points.length
    const h = Math.min(dt, 1 / 30)

    // Curva que a musculatura quer manter.
    const baseYaw = Math.atan2(rootDir.x, rootDir.z)
    let elev = pose.tailLift * 1.5
    let yaw = baseYaw
    this.target[0].copy(root)
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1)
      elev += (pose.tailCurl * Math.sin(t * Math.PI * 0.85) * 2.4 - pose.tailLift * 0.55) / (n - 1)
      yaw += (Math.sin(pose.tailSway - t * 2.6) * pose.tailFlick * 1.4) / (n - 1)
      const d = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(elev),
        Math.sin(elev),
        Math.cos(yaw) * Math.cos(elev),
      )
      this.target[i].copy(this.target[i - 1]).addScaledVector(d, this.seg[i - 1])
    }

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
      const stiff = Math.min(1, (0.9 - (i / n) * 0.45) * h * 34)
      p.lerp(this.target[i], stiff)
    }

    // Restrições propagadas da raiz para a ponta.
    this.points[0].copy(root)
    for (let i = 1; i < n; i++) {
      const a = this.points[i - 1]
      const b = this.points[i]
      const d = new THREE.Vector3().subVectors(b, a)
      const len = d.length()
      if (len < 1e-6) b.copy(a).addScaledVector(rootDir, this.seg[i - 1])
      else b.copy(a).addScaledVector(d, this.seg[i - 1] / len)
    }
  }
}

export interface LoadProgress {
  (stage: string, pct: number): void
}

/**
 * O gato importado, com esqueleto e pesos gerados na hora.
 *
 * O modelo chega como uma casca única de quase noventa mil vértices, sem ossos
 * e sem animação — é uma escultura. Aqui ela ganha um esqueleto derivado da
 * própria geometria e passa a responder ao mesmo sistema de poses do gato
 * procedural.
 */
export class GlbCatModel {
  readonly group = new THREE.Group()
  private mesh!: THREE.SkinnedMesh
  private rig!: RiggedSkeleton
  private poser!: GlbPoser
  private tail!: TailChain
  private modelScale = 1
  skeletonInfo!: ExtractedSkeleton

  static async load(url: string, onProgress?: LoadProgress): Promise<GlbCatModel> {
    const m = new GlbCatModel()
    onProgress?.('Carregando o modelo', 0.05)
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(url)

    let src: THREE.Mesh | null = null
    gltf.scene.traverse((n) => {
      const mm = n as THREE.Mesh
      if (mm.isMesh) src = mm
    })
    if (!src) throw new Error('O arquivo não contém malha.')
    const mesh = src as THREE.Mesh
    mesh.updateWorldMatrix(true, true)

    onProgress?.('Limpando a malha', 0.2)
    // O arquivo traz um fragmento solto flutuando atrás do gato.
    const geo = largestComponent(mesh.geometry.clone())
    // Antes de qualquer transformação: os buffers vêm quantizados e escrever
    // floats neles zeraria as normais.
    toFloat32(geo)
    geo.applyMatrix4(mesh.matrixWorld)
    // Convenção do projeto: +Z é a frente, Y é cima, chão em y = 0.
    geo.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)))
    geo.computeBoundingBox()
    geo.translate(0, -geo.boundingBox!.min.y, 0)
    // As normais originais do modelo são melhores que qualquer recálculo: elas
    // trazem a suavização com que a malha foi autorada.
    geo.normalizeNormals()

    onProgress?.('Descobrindo o esqueleto', 0.4)
    const skel = skeletonize(usedPositions(geo))
    m.skeletonInfo = skel
    m.rig = buildBones(skel)

    onProgress?.('Calculando a deformação', 0.6)
    // Ossos que não carregam carne.
    //
    // O focinho existe só para orientar a cabeça. As orelhas saíram junto: dar
    // movimento a elas exigia detectá-las na malha com precisão, e qualquer
    // erro de alguns milímetros na base fazia a orelha esticar como uma aba de
    // couro e amassar a cara. O ganho — orelha achatando com o medo — não paga
    // o risco de deformar o gato inteiro. A cabeça fica íntegra.
    const directional = new Set<number>([
      m.rig.spine.idx[m.rig.spine.idx.length - 1],
      ...m.rig.ears,
      ...m.rig.ears.map((b) => b + 1),
    ])
    const skin = computeSkinning(
      geo.attributes.position as THREE.BufferAttribute, m.rig, directional,
    )
    geo.setAttribute('skinIndex', skin.skinIndex)
    geo.setAttribute('skinWeight', skin.skinWeight)

    const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
    mat.side = THREE.FrontSide
    mat.roughness = Math.min(1, mat.roughness ?? 1)
    // A textura do modelo já traz o pelo; um leve brilho de veludo assenta a
    // superfície sob a luz do cômodo sem competir com ela.
    const phys = new THREE.MeshPhysicalMaterial({
      map: mat.map,
      normalMap: mat.normalMap,
      roughnessMap: mat.roughnessMap,
      aoMap: mat.aoMap,
      roughness: 0.95,
      metalness: 0,
      sheen: 0.6,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xffeedd),
    })

    const sk = new THREE.SkinnedMesh(geo, phys)
    sk.castShadow = true
    sk.receiveShadow = true
    sk.add(m.rig.root)
    sk.bind(m.rig.skeleton)
    // Sem isto o esqueleto herda a escala do grupo duas vezes.
    sk.frustumCulled = false
    m.mesh = sk

    m.poser = new GlbPoser(m.rig, SPINE_BONES, NECK_BONES)
    m.modelScale = ADULT_BODY_LENGTH / m.poser.bodyLength

    // As pálpebras usam a cor da própria pelagem: amostrada da textura do
    // modelo, na região do rosto, para não destoarem seja qual for o gato.
    m.rig.root.updateMatrixWorld(true)
    onProgress?.('Preparando o olhar', 0.85)
    if (phys.map) m.blinkTex = buildBlinkTextures(phys.map)

    const rootPos = new THREE.Vector3()
    const rootDir = new THREE.Vector3()
    m.poser.tailRoot(rootPos, rootDir)
    m.tail = new TailChain(m.poser.tailSegments, m.rig.bindPos[m.rig.tail.idx[0]])

    const inner = new THREE.Group()
    inner.add(sk)
    m.group.add(inner)
    m.inner = inner

    // Mede a altura de repouso das patas com o esqueleto montado.
    m.poser.build(defaultPose(), null)
    applyTargets(m.rig, m.poser.target, m.poser.worldQuaternions)
    m.rig.root.updateMatrixWorld(true)
    let sum = 0
    for (const leg of m.rig.legs) {
      m.rig.bones[leg.idx[3]].getWorldPosition(_v3)
      sk.worldToLocal(_v3)
      sum += _v3.y
    }
    m.restFootY = sum / m.rig.legs.length

    onProgress?.('Pronto', 1)
    return m
  }

  /** Altura da cernelha do modelo, em metros, na escala adulta. */
  get withersHeight() {
    return this.poser.withersHeight * this.modelScale
  }

  update(pose: PoseParams, dt: number, scale: number, face?: FacePose) {
    const rootPos = _v1
    const rootDir = _v2
    this.poser.tailRoot(rootPos, rootDir)
    this.tail.step(rootPos, rootDir, pose, dt)

    const support = this.poser.supportFeet(pose)
    let offset = this.settle

    // Assentamento iterativo. Cada passada constrói a pose, orienta os ossos e
    // mede onde a pata mais alta realmente parou; a diferença vira a altura do
    // corpo na passada seguinte. Duas ou três voltas bastam, e isto resolve de
    // uma vez qualquer pose em que a perna simplesmente não alcança o chão a
    // partir da altura pedida — como o peito erguido do gato sentado.
    for (let iter = 0; iter < 3; iter++) {
      this.poser.build(pose, this.tail.points, offset, iter === 0 ? undefined : this.realRoots)
      applyTargets(this.rig, this.poser.target, this.poser.worldQuaternions)
      this.rig.root.updateMatrixWorld(true)

      for (let k = 0; k < this.rig.legs.length; k++) {
        this.rig.bones[this.rig.legs[k].idx[0]].getWorldPosition(this.realRoots[k])
        this.mesh.worldToLocal(this.realRoots[k])
      }

      let worst = -Infinity
      if (support.length > 0) {
        for (const k of support) {
          this.rig.bones[this.rig.legs[k].idx[3]].getWorldPosition(_v3)
          this.mesh.worldToLocal(_v3)
          worst = Math.max(worst, _v3.y - this.restFootY)
        }
      } else {
        // Deitado: o peso está no tronco. A referência passa a ser a barriga,
        // não a pata — sem isto o assentamento tentava manter quatro patas
        // apoiadas e o gato "dormia" de pé.
        let lowestTrunk = Infinity
        for (const b of this.poser.trunkBones) {
          this.rig.bones[b].getWorldPosition(_v3)
          this.mesh.worldToLocal(_v3)
          lowestTrunk = Math.min(lowestTrunk, _v3.y)
        }
        worst = lowestTrunk - this.poser.restTrunkY
      }
      if (!isFinite(worst) || Math.abs(worst) < 0.004) break
      offset = Math.max(-0.35, Math.min(0.35, offset - worst * 0.9))
    }
    // Guardado entre quadros: a pose seguinte começa perto da solução.
    this.settle = offset

    // Ancoragem final: seja qual for a pose, o ponto mais baixo do corpo
    // encosta no chão. O assentamento cuida da postura — de quanto a perna
    // dobra —, e esta correção cuida do contato, que é o que o olho percebe.
    let lowest = Infinity
    for (const leg of this.rig.legs) {
      this.rig.bones[leg.idx[3]].getWorldPosition(_v3)
      this.mesh.worldToLocal(_v3)
      lowest = Math.min(lowest, _v3.y - this.restFootY)
    }
    if (support.length === 0) {
      for (const b of this.poser.trunkBones) {
        this.rig.bones[b].getWorldPosition(_v3)
        this.mesh.worldToLocal(_v3)
        lowest = Math.min(lowest, _v3.y - this.poser.restTrunkY)
      }
    }
    if (isFinite(lowest)) this.inner.position.y = -lowest

    if (face) this.setBlink(face.eyeOpen)
    this.group.scale.setScalar(this.modelScale * scale)
  }

  private inner!: THREE.Group
  private settle = 0
  /**
   * Altura em que as patas repousam na pose neutra, medida com o esqueleto já
   * montado. É a referência do assentamento: comparar com o chão teórico
   * embutia no laço o pequeno erro constante da cinemática e o corpo afundava
   * um pouco mais a cada quadro.
   */
  private restFootY = 0

  private realRoots = [
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ]

  /**
   * Compara a pose neutra com o bind. Se o rigger estiver correto, aplicar
   * `defaultPose()` deve devolver a malha exatamente à posição em que ela foi
   * esculpida; qualquer desvio aqui é bug de tradução, não de pose.
   */
  bindDrift(pose: PoseParams): { max: number; worst: string; scale: number } {
    this.poser.build(pose, null)
    let max = 0
    let worst = ''
    const names = this.boneNames()
    for (let i = 0; i < this.rig.bones.length; i++) {
      const t = this.poser.target[i]
      if (!t) continue
      const d = t.distanceTo(this.rig.bindPos[i])
      if (d > max) { max = d; worst = names[i] }
    }
    return { max, worst, scale: this.poser.bodyLength }
  }

  /**
   * Onde as patas realmente param depois da cinemática direta, comparado com
   * o alvo pedido pela pose. Divergência aqui significa que a orientação dos
   * ossos não consegue reproduzir o alvo — normalmente por comprimento.
   */
  probeFeet(pose: PoseParams): unknown {
    this.settle = 0
    this.update(pose, 1 / 60, 1)
    const world = new THREE.Vector3()
    const out: Record<string, unknown> = { ground: +this.groundLevel.toFixed(4) }
    const names = ['FL', 'FR', 'BL', 'BR']
    this.rig.legs.forEach((leg, k) => {
      const paw = leg.idx[3]
      const t = this.poser.target[paw]!
      this.rig.bones[paw].getWorldPosition(world)
      out[names[k]] = {
        alvoY: +t.y.toFixed(4),
        realY: +world.y.toFixed(4),
        erro: +(world.y - t.y).toFixed(4),
      }
    })
    const S = this.rig.spine.idx
    out.quadrilY = +this.poser.target[S[0]]!.y.toFixed(4)
    out.pescocoY = +this.poser.target[S[SPINE_BONES - 1]]!.y.toFixed(4)
    return out
  }

  private get groundLevel(): number {
    let lowest = Infinity
    for (const leg of this.rig.legs) lowest = Math.min(lowest, this.rig.bindPos[leg.idx[3]].y)
    return lowest
  }

  /**
   * Alcance real de cada osso no skinning: quantos vértices ele domina e a que
   * distância chegam. Um osso pequeno com alcance grande é o que amassa o
   * modelo quando gira.
   */
  boneInfluence(): unknown {
    const geo = this.mesh.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute
    const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute
    const names = this.boneNames()
    const stat = new Map<number, { n: number; far: number }>()
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k)
        if (w < 0.25) continue
        const b = si.getComponent(i, k)
        const e = stat.get(b) ?? { n: 0, far: 0 }
        e.n++
        e.far = Math.max(e.far, v.distanceTo(this.rig.bindPos[b]))
        stat.set(b, e)
      }
    }
    const out: Record<string, unknown> = {}
    for (const [b, e] of stat) {
      if (!/ear|head|muzzle|neck/.test(names[b])) continue
      out[names[b] + '#' + b] = { verts: e.n, alcance: +e.far.toFixed(3) }
    }
    return out
  }

  boneNames(): string[] {
    const names = new Array<string>(this.rig.bones.length).fill('?')
    this.rig.spine.idx.forEach((b, i) => {
      names[b] = i < SPINE_BONES ? `spine${i}`
        : i < SPINE_BONES + NECK_BONES ? `neck${i - SPINE_BONES}`
        : i === SPINE_BONES + NECK_BONES ? 'head' : 'muzzle'
    })
    this.rig.tail.idx.forEach((b, i) => { names[b] = `tail${i}` })
    this.rig.ears.forEach((b, i) => {
      names[b] = `ear${i}base`
      names[b + 1] = `ear${i}tip`
    })
    const legNames = ['FL', 'FR', 'BL', 'BR']
    this.rig.legs.forEach((L, k) => {
      L.idx.forEach((b, i) => { names[b] = `${legNames[k]}${['root', 'knee', 'ankle', 'paw'][i]}` })
    })
    return names
  }

  /**
   * Piscar.
   *
   * As variações de pálpebra são pintadas sobre a textura do próprio modelo no
   * carregamento, e piscar é só trocar o mapa do material — sem geometria e
   * sem custo por quadro. A malha traz os olhos pintados e nenhuma peça que se
   * mexa: um bicho que nunca fecha os olhos é lido na hora como boneco, e era
   * boa parte da sensação de coisa morta.
   */
  private blinkTex: BlinkTextures | null = null
  private blinkState: 'open' | 'half' | 'shut' = 'open'

  private setBlink(open: number) {
    if (!this.blinkTex) return
    const want: 'open' | 'half' | 'shut' = open > 0.66 ? 'open' : open > 0.28 ? 'half' : 'shut'
    if (want === this.blinkState) return
    this.blinkState = want
    const mat = this.mesh.material as THREE.MeshPhysicalMaterial
    mat.map = this.blinkTex[want]
    mat.needsUpdate = true
  }

  /** Quantas íris foram encontradas na textura; zero significa que não pisca. */
  get blinkRegions() {
    return this.blinkTex?.regions ?? 0
  }

  /**
   * Que parte do corpo está sob um ponto tocado. Compara o ponto de impacto
   * com a posição atual de cada osso — assim a região acompanha a pose: a
   * barriga de um gato deitado está onde a pose a colocou, não onde estava no
   * bind.
   */
  regionAt(worldPoint: THREE.Vector3): TouchRegion {
    _v3.copy(worldPoint)
    this.mesh.worldToLocal(_v3)

    let best: TouchRegion = 'back'
    let bestD = Infinity
    const consider = (bone: number, region: TouchRegion, bias = 1) => {
      this.rig.bones[bone].getWorldPosition(_v1)
      this.mesh.worldToLocal(_v1)
      const d = _v1.distanceTo(_v3) * bias
      if (d < bestD) { bestD = d; best = region }
    }

    const S = this.rig.spine.idx
    consider(S[SPINE_BONES + NECK_BONES], 'head')
    consider(S[SPINE_BONES + NECK_BONES + 1], 'chin')
    for (let i = 4; i < SPINE_BONES - 1; i++) consider(S[i], 'back')
    consider(S[0], 'tailbase')
    consider(S[1], 'tailbase')
    for (let i = 2; i < this.rig.tail.idx.length; i++) consider(this.rig.tail.idx[i], 'tail')
    for (const leg of this.rig.legs) {
      consider(leg.idx[2], 'paw')
      consider(leg.idx[3], 'paw')
    }

    // A barriga não tem osso próprio: é a face de baixo do tronco. Se o ponto
    // está claramente abaixo do eixo da coluna, é barriga, venha de que osso vier.
    if (best === 'back') {
      let spineY = 0
      let n = 0
      for (let i = 2; i < SPINE_BONES; i++) {
        this.rig.bones[S[i]].getWorldPosition(_v1)
        this.mesh.worldToLocal(_v1)
        spineY += _v1.y
        n++
      }
      if (n && _v3.y < spineY / n - 0.02) best = 'belly'
    }
    return best
  }

  /** Centro do tronco, em espaço local, para a câmera enquadrar. */
  bodyCenter(out: THREE.Vector3): THREE.Vector3 {
    const S = this.rig.spine.idx
    out.set(0, 0, 0)
    let n = 0
    for (let i = 0; i < SPINE_BONES; i++) {
      const t = this.poser.target[S[i]]
      if (t) { out.add(t); n++ }
    }
    if (n) out.divideScalar(n)
    return out
  }

  dispose() {
    this.blinkTex?.dispose()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
