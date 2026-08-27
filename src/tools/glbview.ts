import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { largestComponent, toFloat32, usedPositions } from '../render/meshclean'
import { skeletonize } from '../render/skeletonize'
import '../types/devtools'

const r = new THREE.WebGLRenderer({ antialias: true })
r.setSize(560, 560)
r.outputColorSpace = THREE.SRGBColorSpace
r.toneMapping = THREE.ACESFilmicToneMapping
document.body.appendChild(r.domElement)

const sc = new THREE.Scene()
sc.background = new THREE.Color(0x22201d)
const cam = new THREE.PerspectiveCamera(40, 1, 0.001, 200)
sc.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.2))
const d = new THREE.DirectionalLight(0xffffff, 2.4)
d.position.set(2, 3, 2)
sc.add(d)
const d2 = new THREE.DirectionalLight(0xaaccff, 1.1)
d2.position.set(-2, 1, -2)
sc.add(d2)

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('./models/cat.glb', (g) => {
  let src: THREE.Mesh | null = null
  g.scene.traverse((n) => {
    const m = n as THREE.Mesh
    if (m.isMesh) src = m
  })
  const mesh = src as unknown as THREE.Mesh
  mesh.updateWorldMatrix(true, true)

  // Assa a transformação do nó e leva para a convenção do projeto: +Z é a
  // frente, Y é cima, chão em y = 0.
  const geo = largestComponent(mesh.geometry.clone())
  toFloat32(geo)
  geo.applyMatrix4(mesh.matrixWorld)
  geo.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)))
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  geo.translate(0, -bb.min.y, 0)
  geo.computeBoundingBox()
  geo.normalizeNormals()

  const P = usedPositions(geo)
  const skel = skeletonize(P)

  const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
  mat.transparent = true
  mat.opacity = 1
  const shown = new THREE.Mesh(geo, mat)
  sc.add(shown)

  // Desenha o esqueleto extraído sobre a malha.
  const bones = new THREE.Group()
  const line = (pts: THREE.Vector3[], color: number) => {
    const gg = new THREE.BufferGeometry().setFromPoints(pts)
    const l = new THREE.Line(gg, new THREE.LineBasicMaterial({ color, depthTest: false }))
    l.renderOrder = 999
    bones.add(l)
  }
  const dot = (p: THREE.Vector3, color: number, s = 0.012) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(s, 10, 8),
      new THREE.MeshBasicMaterial({ color, depthTest: false }),
    )
    m.position.copy(p)
    m.renderOrder = 1000
    bones.add(m)
  }
  line(skel.spine, 0x44ff88)
  skel.spine.forEach((p) => dot(p, 0x44ff88, 0.009))
  line(skel.tail, 0xffcc33)
  skel.tail.forEach((p) => dot(p, 0xffcc33, 0.007))
  const legColors = [0xff5544, 0xff9944, 0x4488ff, 0x44ccff]
  skel.legs.forEach((L, i) => {
    line(L, legColors[i])
    L.forEach((p) => dot(p, legColors[i], 0.008))
  })
  dot(skel.head, 0xffffff, 0.016)
  dot(skel.muzzle, 0xff44ff, 0.010)
  sc.add(bones)

  const box = geo.boundingBox!
  const size = box.getSize(new THREE.Vector3())
  const ctr = box.getCenter(new THREE.Vector3())
  const R = Math.max(size.x, size.y, size.z)
  window.__info = {
    size: size.toArray().map((n) => +n.toFixed(3)),
    metrics: Object.fromEntries(Object.entries(skel.metrics).map(([k, v]) => [k, +v.toFixed(3)])),
    spineN: skel.spine.length,
    tailN: skel.tail.length,
    spineZ: [+skel.spine[0].z.toFixed(3), +skel.spine[skel.spine.length - 1].z.toFixed(3)],
    tailTip: skel.tail[skel.tail.length - 1].toArray().map((n) => +n.toFixed(3)),
    paws: skel.legs.map((L) => L[3].toArray().map((n) => +n.toFixed(3))),
    roots: skel.legs.map((L) => L[0].toArray().map((n) => +n.toFixed(3))),
    head: skel.head.toArray().map((n) => +n.toFixed(3)),
    muzzle: skel.muzzle.toArray().map((n) => +n.toFixed(3)),
    verts: P.length / 3,
  }
  window.__setOpacity = (v: number) => {
    mat.opacity = v
    // Clarear junto: a malha escurecida pela transparência escondia o esqueleto.
    mat.emissive = new THREE.Color(0xffffff)
    mat.emissiveIntensity = v < 0.9 ? 0.35 : 0
    mat.needsUpdate = true
  }
  window.__render = (yaw, pitch) => {
    cam.position.set(
      ctr.x + Math.sin(yaw) * Math.cos(pitch) * R * 1.7,
      ctr.y + Math.sin(pitch) * R * 1.7,
      ctr.z + Math.cos(yaw) * Math.cos(pitch) * R * 1.7,
    )
    cam.lookAt(ctr)
    r.render(sc, cam)
  }
  window.__ready = true
})
