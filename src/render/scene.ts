import * as THREE from 'three'
import { CatModel } from './cat'
import { GlbCatModel } from './glbcat'
import { makeCoat, type Coat } from './coat'
import { autoQuality, type Quality } from './fur'
import { buildRoom, type RoomRefs } from './room'
import { animate, type AnimContext } from './poses'
import { buildRig, defaultPose, TailSim, type Rig } from './rig'
import { bodyScale, neotenyFactor, ageMonths } from '../sim/growth'
import { advance, litterFilth } from '../sim/engine'
import { chooseBehavior, flavor, isStationary, locomote, type Runtime } from '../ai/brain'
import { petTick } from '../sim/actions'
import { ROOM } from '../sim/world'
import type { CatState } from '../sim/types'

export interface SceneHooks {
  getCat: () => CatState | null
  getRuntime: () => Runtime
  /** Chamado quando o gato troca de comportamento, para a UI reagir. */
  onBehaviorChange?: (id: string) => void
  /** Progresso do carregamento do modelo, 0..1. */
  onLoad?: (stage: string, pct: number) => void
}

export class CatScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private room: RoomRefs
  private model?: CatModel
  private glb?: GlbCatModel
  private coat!: Coat
  private rig: Rig
  private tailSim = new TailSim()
  private hooks: SceneHooks
  private quality: Quality

  private raf = 0
  private last = performance.now()
  private clock = 0
  private stridePhase = 0
  private brainTimer = 0
  private blinkTimer = 3
  private blinkProgress = 1
  private slowBlink = false
  private prevPos = new THREE.Vector3()
  private bodyCenter = new THREE.Vector3()
  private firstFrame = true
  private speed = 0

  // Câmera orbital
  private camYaw = 0.55
  private camPitch = 0.42
  private camDist = 1.75
  private camTarget = new THREE.Vector3(0, 0.16, 0)

  private pointers = new Map<number, { x: number; y: number }>()
  private dragging: 'camera' | 'pet' | 'lure' | null = null
  private pinchStart = 0
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  /** Enquanto verdadeiro, arrastar move o brinquedo em vez de girar a câmera. */
  toyMode = false
  /** Trava comportamento e posição — usado apenas nos testes visuais. */
  private frozen: string | null = null

  constructor(canvas: HTMLCanvasElement, hooks: SceneHooks, seed: number) {
    this.hooks = hooks
    this.quality = autoQuality()

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene.background = new THREE.Color(0x1b1815)
    this.scene.fog = new THREE.Fog(0x2a2520, 5, 12)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40)
    this.room = buildRoom()
    this.scene.add(this.room.group)

    this.rebuildCat(seed)

    this.rig = buildRig(defaultPose(), 1)
    this.attachInput(canvas)
    this.resize()
    ;(window as unknown as { __catScene?: unknown }).__catScene = this
  }

  rebuildCat(seed: number) {
    if (this.model) {
      this.scene.remove(this.model.group)
      this.model.dispose()
      this.model = undefined
    }
    this.coat = makeCoat(seed)
    this.model = new CatModel(this.coat, seed, this.quality)
    this.scene.add(this.model.group)
  }

  /**
   * Troca o gato procedural pelo modelo esculpido. O procedural continua
   * servindo de reserva: se o arquivo faltar ou o aparelho não der conta, o
   * jogo segue com ele em vez de ficar sem gato nenhum.
   */
  async loadModel(url: string) {
    try {
      const glb = await GlbCatModel.load(url, (stage, pct) => this.hooks.onLoad?.(stage, pct))
      if (this.model) {
        this.scene.remove(this.model.group)
        this.model.dispose()
        this.model = undefined
      }
      this.glb = glb
      this.scene.add(glb.group)
      this.hooks.onLoad?.('pronto', 1)
    } catch (err) {
      console.warn('Modelo esculpido indisponível; seguindo com o procedural.', err)
      this.hooks.onLoad?.('pronto', 1)
    }
  }

  /** Congela o gato num comportamento e no centro da sala, para inspeção. */
  freeze(behavior: string | null) {
    this.frozen = behavior
  }

  /** Usado nos testes visuais para fixar o enquadramento entre execuções. */
  setCamera(yaw: number, pitch: number, dist: number) {
    this.camYaw = yaw
    this.camPitch = pitch
    this.camDist = dist
  }

  /** Estado vivo do gato, para inspeção durante o desenvolvimento. */
  get cat() {
    return this.hooks.getCat()
  }

  get coatLabel() {
    return this.coat.label
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.update(dt)
      this.renderer.render(this.scene, this.camera)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.raf)
  }

  resize() {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.stop()
    this.model?.dispose()
    this.glb?.dispose()
    this.room.dispose()
    this.renderer.dispose()
  }

  // ---------------------------------------------------------------- entrada

  private attachInput(canvas: HTMLCanvasElement) {
    const toNdc = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect()
      this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    }

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y)
        this.dragging = 'camera'
        return
      }
      if (this.toyMode) {
        this.dragging = 'lure'
        this.moveLure(e.clientX, e.clientY, toNdc)
        return
      }
      toNdc(e.clientX, e.clientY)
      this.raycaster.setFromCamera(this.ndc, this.camera)
      const target = this.glb?.group ?? this.model?.group
      const hit = target ? this.raycaster.intersectObject(target, true) : []
      if (hit.length > 0) {
        this.dragging = 'pet'
        this.hooks.getRuntime().petting = true
      } else {
        this.dragging = 'camera'
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId)
      if (!prev) return
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        this.camDist = Math.max(0.5, Math.min(3.2, this.camDist * (this.pinchStart / (d || 1))))
        this.pinchStart = d
        return
      }
      if (this.dragging === 'camera') {
        this.camYaw -= dx * 0.006
        this.camPitch = Math.max(0.03, Math.min(1.15, this.camPitch + dy * 0.005))
      } else if (this.dragging === 'lure') {
        this.moveLure(e.clientX, e.clientY, toNdc)
      }
      // Durante o carinho, o movimento do dedo mantém o toque "vivo".
    })

    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      if (this.pointers.size === 0) {
        if (this.dragging === 'pet') this.hooks.getRuntime().petting = false
        this.dragging = null
      }
    }
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('pointercancel', end)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private moveLure(cx: number, cy: number, toNdc: (x: number, y: number) => void) {
    toNdc(cx, cy)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const p = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return
    const rt = this.hooks.getRuntime()
    const x = Math.max(-ROOM.halfW + 0.2, Math.min(ROOM.halfW - 0.2, p.x))
    const z = Math.max(-ROOM.halfD + 0.2, Math.min(ROOM.halfD - 0.2, p.z))
    rt.lure = [x, z]
    rt.lureMovedAt = Date.now()
    this.room.toy.visible = true
    this.room.toy.position.set(x, 0.04, z)
  }

  clearLure() {
    this.hooks.getRuntime().lure = null
    this.room.toy.visible = false
  }

  // ------------------------------------------------------------------ loop

  private update(dt: number) {
    const cat = this.hooks.getCat()
    if (!cat) return
    const rt = this.hooks.getRuntime()
    const now = Date.now()
    this.clock += dt

    advance(cat, now)
    petTick(cat, rt, dt, now)

    if (this.frozen) {
      cat.behavior = this.frozen as typeof cat.behavior
      cat.pos[0] = 0
      cat.pos[1] = 0
      cat.target = null
    }

    // --- Decisão: reavaliada 3 vezes por segundo, não a cada frame. ---
    this.brainTimer -= dt
    if (!this.frozen && this.brainTimer <= 0) {
      this.brainTimer = 0.33
      const choice = chooseBehavior(cat, rt, now)
      if (choice.id !== cat.behavior) {
        cat.behavior = choice.id
        cat.behaviorSince = now
        this.hooks.onBehaviorChange?.(choice.id)
        const line = flavor(cat, choice.id)
        if (line) {
          rt.say = line
          rt.sayUntil = now + 2200
        }
      }
      if (choice.target && !isStationary(choice.id)) cat.target = [...choice.target]
      else if (choice.target && isStationary(choice.id)) {
        // Comportamentos parados ainda exigem chegar ao lugar certo primeiro.
        const dx = choice.target[0] - cat.pos[0]
        const dz = choice.target[1] - cat.pos[1]
        if (Math.hypot(dx, dz) > 0.18) cat.target = [...choice.target]
      }
      if (rt.lure && cat.behavior === 'stalk') cat.target = [...rt.lure]
    }

    if (!this.frozen) locomote(cat, dt)

    // --- Escala por idade ---
    const scale = bodyScale(cat.birth, now)
    const neoteny = neotenyFactor(cat.birth, now)
    const months = ageMonths(cat.birth, now)

    // --- Velocidade real, medida a partir do deslocamento ---
    const worldPos = new THREE.Vector3(cat.pos[0], 0, cat.pos[1])
    const inst = this.prevPos.distanceTo(worldPos) / Math.max(dt, 1e-4)
    this.speed += (inst - this.speed) * Math.min(1, dt * 8)
    this.prevPos.copy(worldPos)

    // A frequência da passada vem da velocidade: o pé nunca patina no chão.
    const strideDistance = 0.3 * scale
    this.stridePhase = (this.stridePhase + (this.speed / strideDistance) * dt) % 1

    // --- Piscar ---
    this.blinkTimer -= dt
    if (this.blinkTimer <= 0) {
      // Piscar lento é o "eu confio em você" dos gatos: só acontece relaxado.
      this.slowBlink = rt.petting || (cat.stress < 25 && cat.bond > 50 && Math.random() < 0.35)
      this.blinkTimer = this.slowBlink ? 5 + Math.random() * 6 : 3 + Math.random() * 9
      this.blinkProgress = 0
    }
    const blinkSpeed = this.slowBlink ? 1.1 : 6.5
    this.blinkProgress = Math.min(1, this.blinkProgress + dt * blinkSpeed)
    const b = this.blinkProgress
    const eyeOpen = b >= 1 ? 1 : 1 - Math.sin(b * Math.PI)

    // --- Pose ---
    const ctx: AnimContext = {
      t: this.clock,
      speed: this.speed,
      contentment: Math.max(0, Math.min(1, (cat.bond / 100) * 0.5 + (1 - cat.stress / 100) * 0.5)),
      stress: cat.stress / 100,
      energy: cat.needs.energy / 100,
      stridePhase: this.stridePhase,
      blink: eyeOpen,
      kitten: months < 6 ? 1 - months / 6 : 0,
    }
    const anim = animate(cat.behavior, ctx)

    // O gato olha na direção do brinquedo ou de quem o toca.
    if (rt.lure && (cat.behavior === 'stalk' || cat.behavior === 'watch' || cat.behavior === 'sit')) {
      const dx = rt.lure[0] - cat.pos[0]
      const dz = rt.lure[1] - cat.pos[1]
      let rel = Math.atan2(dx, dz) - cat.facing
      while (rel > Math.PI) rel -= Math.PI * 2
      while (rel < -Math.PI) rel += Math.PI * 2
      anim.pose.headYaw += Math.max(-0.9, Math.min(0.9, rel)) * 0.8
    }

    const active = this.glb ?? this.model
    if (this.glb) {
      this.glb.update(anim.pose, dt, scale)
    } else if (this.model) {
      this.rig = buildRig(anim.pose, neoteny, this.rig)
      const dir = new THREE.Vector3()
      const root = this.model.tailRoot(this.rig, dir)
      this.tailSim.step(root, dir, anim.pose, dt)
      this.model.setTailPoints(this.tailSim.points)
      this.model.update(this.rig, anim.face, scale)
    }
    if (!active) return
    active.group.position.set(cat.pos[0], 0, cat.pos[1])
    active.group.rotation.y = cat.facing

    // A câmera mira o centro real do corpo, não a posição dos pés: quando o
    // gato se deita, o tronco sai de cima do ponto de apoio.
    if (this.glb) {
      this.glb.bodyCenter(this.bodyCenter)
    } else {
      const N = this.rig.spine.length
      this.bodyCenter.set(0, 0, 0)
      for (let i = 0; i < N; i++) this.bodyCenter.add(this.rig.spine[i])
      this.bodyCenter.divideScalar(N)
    }
    active.group.updateMatrixWorld(true)
    active.group.localToWorld(this.bodyCenter)

    this.updateProps(cat, now)
    this.updateCamera(dt, scale)
  }

  private updateProps(cat: CatState, now: number) {
    // Comida no pote: a pilha encolhe conforme ele come.
    const grams = cat.bowl.food
    const fill = Math.min(1, grams / 120)
    this.room.foodPile.visible = grams > 0.5
    this.room.foodPile.scale.set(0.5 + fill * 0.62, 0.12 + fill * 0.34, 0.5 + fill * 0.62)
    const spoil = Math.min(1, (now - cat.bowl.servedAt) / (cat.bowl.foodKind === 'wet' ? 4 : 30) / 3600_000)
    const mat = this.room.foodPile.material as THREE.MeshStandardMaterial
    mat.color.setHex(cat.bowl.foodKind === 'wet' ? 0x9a5a44 : 0x74492a).multiplyScalar(1 - spoil * 0.45)

    const water = Math.min(1, cat.bowl.water / 320)
    this.room.waterSurface.visible = water > 0.02
    this.room.waterSurface.position.y = 0.008 + water * 0.02
    this.room.waterSurface.scale.setScalar(0.75 + water * 0.25)

    // A areia escurece conforme suja — é o aviso visual antes da reclamação.
    const filth = litterFilth(cat, now)
    const lm = this.room.litterSurface.material as THREE.MeshStandardMaterial
    lm.color.setRGB(0.85 - filth * 0.42, 0.82 - filth * 0.45, 0.77 - filth * 0.44)
  }

  private updateCamera(dt: number, scale: number) {
    // Acompanha com atraso, como alguém seguindo o gato com o olhar — mas no
    // primeiro quadro salta direto, senão o app abre com a câmera dentro do chão.
    const follow = this.firstFrame ? 1 : Math.min(1, dt * 2.2)
    this.camTarget.lerp(this.bodyCenter, follow)
    const d = this.camDist * (0.5 + scale * 0.62)
    const x = this.camTarget.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * d
    const y = this.camTarget.y + Math.sin(this.camPitch) * d
    const z = this.camTarget.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * d
    this.camera.position.lerp(new THREE.Vector3(x, y, z), this.firstFrame ? 1 : Math.min(1, dt * 6))
    this.camera.lookAt(this.camTarget)
    this.firstFrame = false
  }
}
