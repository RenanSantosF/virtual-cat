import * as THREE from 'three'
import { GlbCatModel, defaultPose } from '../render/glbcat'
import { animate } from '../render/poses'
import type { BehaviorId } from '../sim/types'
import '../types/devtools'

const r = new THREE.WebGLRenderer({ antialias: true })
r.setSize(560, 560)
r.outputColorSpace = THREE.SRGBColorSpace
r.toneMapping = THREE.ACESFilmicToneMapping
r.shadowMap.enabled = true
document.body.appendChild(r.domElement)

const sc = new THREE.Scene()
sc.background = new THREE.Color(0x262320)
const cam = new THREE.PerspectiveCamera(38, 1, 0.01, 60)
sc.add(new THREE.HemisphereLight(0xdce9f5, 0x8a7560, 1.6))
const key = new THREE.DirectionalLight(0xfff0dc, 2.4)
key.position.set(1.5, 2.4, 1.6)
key.castShadow = true
sc.add(key)
const rim = new THREE.DirectionalLight(0xbcd4e8, 1.2)
rim.position.set(-1.6, 1.2, -1.8)
sc.add(rim)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.9 }),
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
sc.add(floor)

GlbCatModel.load('./models/cat.glb').then((cat) => {
  sc.add(cat.group)
  window.__info = { withers: +cat.withersHeight.toFixed(3) }

  const ctr = new THREE.Vector3()
  window.__pose = (b, t, stride) => {
    const anim = animate(b as BehaviorId, {
      t, speed: 0.6, contentment: 0.7, stress: 0.15, energy: 0.7,
      stridePhase: stride, blink: 1, kitten: 0,
    })
    // Alguns quadros para a cauda assentar na pose.
    for (let i = 0; i < 30; i++) cat.update(anim.pose, 1 / 60, 1)
    // A escala só entra na matriz do mundo depois de atualizada; sem isto o
    // alvo da câmera fica no dobro da distância.
    cat.group.updateMatrixWorld(true)
    cat.bodyCenter(ctr)
    cat.group.localToWorld(ctr)
  }
  window.__render = (yaw, pitch, dist = 0.8) => {
    cam.position.set(
      ctr.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      ctr.y + Math.sin(pitch) * dist,
      ctr.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    )
    cam.lookAt(ctr)
    r.render(sc, cam)
  }
  // Alterna materiais para isolar de onde vem o preto: normais, textura ou luz.
  ;(window as unknown as { __mat?: (m: string) => void }).__mat = (mode: string) => {
    cat.group.traverse((n) => {
      const sk = n as THREE.SkinnedMesh
      if (!sk.isSkinnedMesh) return
      const cur = sk.material as THREE.MeshPhysicalMaterial
      if (mode === 'normal') sk.material = new THREE.MeshNormalMaterial()
      else if (mode === 'flat') sk.material = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.9 })
      else if (mode === 'basic') sk.material = new THREE.MeshBasicMaterial({ map: cur.map ?? null, color: cur.map ? 0xffffff : 0xff00ff })
    })
  }
  // Compara a mesma geometria com e sem skinning, para saber de qual lado
  // vem o problema de iluminação.
  ;(window as unknown as { __static?: () => void }).__static = () => {
    let src: THREE.SkinnedMesh | null = null
    cat.group.traverse((n) => {
      const sk = n as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) src = sk
    })
    if (!src) return
    const sk = src as THREE.SkinnedMesh
    sk.visible = false
    const st = new THREE.Mesh(sk.geometry, new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.9 }))
    st.scale.copy(cat.group.scale)
    sc.add(st)
  }
  ;(window as unknown as { __normstats?: () => unknown }).__normstats = () => {
    let out: unknown = null
    cat.group.traverse((n) => {
      const sk = n as THREE.SkinnedMesh
      if (!sk.isSkinnedMesh) return
      const nr = sk.geometry.attributes.normal as THREE.BufferAttribute
      const sw = sk.geometry.attributes.skinWeight as THREE.BufferAttribute
      const idx = sk.geometry.index!
      let zero = 0, bad = 0, wzero = 0, sample: number[] = []
      const seen = new Set<number>()
      for (let i = 0; i < idx.count && seen.size < 4000; i++) seen.add(idx.getX(i))
      for (const v of seen) {
        const L = Math.hypot(nr.getX(v), nr.getY(v), nr.getZ(v))
        if (L < 1e-6) zero++
        else if (Math.abs(L - 1) > 0.05) bad++
        const w = sw.getX(v) + sw.getY(v) + sw.getZ(v) + sw.getW(v)
        if (w < 0.9) wzero++
        if (sample.length < 9) sample.push(+nr.getX(v).toFixed(2), +nr.getY(v).toFixed(2), +nr.getZ(v).toFixed(2))
      }
      out = { checked: seen.size, zeroNormals: zero, badLength: bad, badWeights: wzero, sample,
              boneCount: sk.skeleton.bones.length, bindMode: sk.bindMode }
    })
    return out
  }
  ;(window as unknown as { __texinfo?: () => unknown }).__texinfo = () => {
    let out: unknown = null
    cat.group.traverse((n) => {
      const sk = n as THREE.SkinnedMesh
      if (!sk.isSkinnedMesh) return
      const m = sk.material as THREE.MeshPhysicalMaterial
      const g = sk.geometry
      out = {
        hasMap: !!m.map, mapCS: m.map?.colorSpace, mapImg: m.map?.image ? `${m.map.image.width}x${m.map.image.height}` : null,
        hasNormal: !!m.normalMap, hasRough: !!m.roughnessMap, hasAo: !!m.aoMap,
        attrs: Object.keys(g.attributes), indexed: !!g.index,
      }
    })
    return out
  }
  ;(window as unknown as { __drift?: () => unknown }).__drift = () => {
    const neutral = cat.bindDrift(defaultPose())
    return { maxDrift: +neutral.max.toFixed(4), worstBone: neutral.worst, bodyLength: +neutral.scale.toFixed(3) }
  }
  ;(window as unknown as { __feet?: (b: string) => unknown }).__feet = (b: string) => {
    const anim = animate(b as BehaviorId, {
      t: 0, speed: 0.6, contentment: 0.7, stress: 0.15, energy: 0.7,
      stridePhase: 0, blink: 1, kitten: 0,
    })
    return { pose: { height: anim.pose.height, pitch: anim.pose.pitch, tuckB: anim.pose.tuckBack, tuckF: anim.pose.tuckFront },
             probe: cat.probeFeet(anim.pose) }
  }
  ;(window as unknown as { __poseRaw?: (o: Record<string, number>) => void }).__poseRaw = (o) => {
    const base = defaultPose()
    Object.assign(base, o)
    for (let i = 0; i < 40; i++) cat.update(base, 1 / 60, 1)
    cat.group.updateMatrixWorld(true)
    cat.bodyCenter(ctr)
    cat.group.localToWorld(ctr)
  }
  window.__pose('idle', 0, 0)
  window.__ready = true
})
