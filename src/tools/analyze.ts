import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import '../types/devtools'

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('./models/cat.glb', (g) => {
  let mesh: THREE.Mesh | null = null
  g.scene.traverse((n) => {
    const m = n as THREE.Mesh
    if (m.isMesh) mesh = m
  })
  const src = mesh as unknown as THREE.Mesh
  src.updateWorldMatrix(true, true)
  const pos = src.geometry.attributes.position as THREE.BufferAttribute

  // Converte para a convenção do projeto: +Z é a frente, Y é cima, chão em y=0.
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0))
  const v = new THREE.Vector3()
  const P: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(src.matrixWorld).applyQuaternion(q)
    P.push(v.clone())
  }
  let minY = Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of P) { if (p.y < minY) minY = p.y; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z }
  for (const p of P) p.y -= minY

  const depth = maxZ - minZ
  const SL = 48
  // Fatias ao longo do eixo focinho-cauda.
  const slices = Array.from({ length: SL }, () => ({
    n: 0, sx: 0, sy: 0, minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity,
    lowN: 0,
  }))
  let maxYall = 0
  for (const p of P) if (p.y > maxYall) maxYall = p.y

  for (const p of P) {
    const t = (p.z - minZ) / depth
    const i = Math.min(SL - 1, Math.floor(t * SL))
    const s = slices[i]
    s.n++
    s.sx += p.x; s.sy += p.y
    if (p.y < s.minY) s.minY = p.y
    if (p.y > s.maxY) s.maxY = p.y
    if (p.x < s.minX) s.minX = p.x
    if (p.x > s.maxX) s.maxX = p.x
    if (p.y < maxYall * 0.30) s.lowN++
  }

  const table = slices.map((s, i) => ({
    i,
    z: +(minZ + ((i + 0.5) / SL) * depth).toFixed(3),
    n: s.n,
    w: s.n ? +(s.maxX - s.minX).toFixed(3) : 0,
    h: s.n ? +(s.maxY - s.minY).toFixed(3) : 0,
    top: s.n ? +s.maxY.toFixed(3) : 0,
    bot: s.n ? +s.minY.toFixed(3) : 0,
    cy: s.n ? +(s.sy / s.n).toFixed(3) : 0,
    low: s.lowN,
  }))

  // Patas: agrupa os vértices baixos por quadrante (frente/trás × esquerda/direita).
  const midZ = (minZ + maxZ) / 2
  const feet = [
    { name: 'FL', x: 0, z: 0, n: 0 }, { name: 'FR', x: 0, z: 0, n: 0 },
    { name: 'BL', x: 0, z: 0, n: 0 }, { name: 'BR', x: 0, z: 0, n: 0 },
  ]
  for (const p of P) {
    if (p.y > maxYall * 0.10) continue
    const front = p.z > midZ
    const left = p.x < 0
    const f = feet[(front ? 0 : 2) + (left ? 0 : 1)]
    f.x += p.x; f.z += p.z; f.n++
  }
  for (const f of feet) { if (f.n) { f.x = +(f.x / f.n).toFixed(3); f.z = +(f.z / f.n).toFixed(3) } }

  window.__an = {
    depth: +depth.toFixed(3), height: +maxYall.toFixed(3),
    minZ: +minZ.toFixed(3), maxZ: +maxZ.toFixed(3),
    verts: P.length, table, feet,
  }
  window.__ready = true
})
