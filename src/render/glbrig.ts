import * as THREE from 'three'
import type { ExtractedSkeleton } from './skeletonize'

/**
 * Ossos derivados do esqueleto extraído, na ordem em que entram no
 * `skinIndex` da malha.
 */
export interface BoneChain {
  /** Índices dos ossos, da raiz para a ponta. */
  idx: number[]
  /** Posições no bind, em espaço do modelo. */
  bind: THREE.Vector3[]
}

export interface RiggedSkeleton {
  bones: THREE.Bone[]
  root: THREE.Bone
  skeleton: THREE.Skeleton
  spine: BoneChain
  tail: BoneChain
  legs: BoneChain[]
  head: number
  /** Posições do bind de todos os ossos, em espaço do modelo. */
  bindPos: THREE.Vector3[]
  /** Direção do bind de cada osso em relação ao pai. */
  bindDir: THREE.Vector3[]
  parent: number[]
  /** Filho que define a orientação de cada osso (o seguinte na mesma cadeia). */
  primaryChild: number[]
}

const SPINE_BONES = 10
const NECK_BONES = 2
const TAIL_BONES = 8

/**
 * Monta a hierarquia de ossos sobre o esqueleto extraído.
 *
 * A coluna corre do quadril ao pescoço; a cauda e as quatro pernas penduram-se
 * nos ossos de coluna mais próximos. Cada osso nasce com rotação identidade e
 * apenas um deslocamento em relação ao pai, o que torna a pose atual da malha o
 * bind pose — ou seja, o modelo importado já está "em repouso" por definição.
 */
export function buildBones(skel: ExtractedSkeleton): RiggedSkeleton {
  const bones: THREE.Bone[] = []
  const bindPos: THREE.Vector3[] = []
  const parent: number[] = []

  const add = (p: THREE.Vector3, par: number): number => {
    const b = new THREE.Bone()
    const i = bones.length
    bones.push(b)
    bindPos.push(p.clone())
    parent.push(par)
    if (par >= 0) {
      bones[par].add(b)
      b.position.copy(p).sub(bindPos[par])
    } else {
      b.position.copy(p)
    }
    return i
  }

  // --- Coluna: do quadril (raiz) ao pescoço ---
  const spinePts = resample(skel.spine, SPINE_BONES)
  const spineIdx: number[] = []
  for (let i = 0; i < spinePts.length; i++) {
    spineIdx.push(add(spinePts[i], i === 0 ? -1 : spineIdx[i - 1]))
  }

  // --- Pescoço e cabeça ---
  const neckStart = spinePts[spinePts.length - 1]
  const neckIdx: number[] = []
  for (let i = 1; i <= NECK_BONES; i++) {
    const t = i / (NECK_BONES + 1)
    const p = neckStart.clone().lerp(skel.head, t)
    neckIdx.push(add(p, i === 1 ? spineIdx[spineIdx.length - 1] : neckIdx[i - 2]))
  }
  const headIdx = add(skel.head, neckIdx[neckIdx.length - 1])
  const muzzleIdx = add(skel.muzzle, headIdx)

  // --- Cauda: pendurada na base da coluna ---
  const tailPts = resample(skel.tail, TAIL_BONES + 1)
  const tailIdx: number[] = []
  for (let i = 1; i < tailPts.length; i++) {
    tailIdx.push(add(tailPts[i], i === 1 ? spineIdx[0] : tailIdx[i - 2]))
  }

  // --- Pernas: cada uma no osso de coluna mais próximo em Z ---
  const legs: BoneChain[] = []
  for (const L of skel.legs) {
    let anchor = spineIdx[0]
    let bestD = Infinity
    for (let i = 0; i < spineIdx.length; i++) {
      const d = Math.abs(bindPos[spineIdx[i]].z - L[0].z)
      if (d < bestD) { bestD = d; anchor = spineIdx[i] }
    }
    const chain: number[] = []
    for (let i = 0; i < L.length; i++) {
      chain.push(add(L[i], i === 0 ? anchor : chain[i - 1]))
    }
    legs.push({ idx: chain, bind: chain.map((k) => bindPos[k].clone()) })
  }

  const root = bones[0]
  root.updateMatrixWorld(true)

  // Direção do bind de cada osso em relação ao pai — a referência que a pose
  // vai reorientar.
  const bindDir = bindPos.map((p, i) => {
    const par = parent[i]
    if (par < 0) return new THREE.Vector3(0, 0, 1)
    const d = p.clone().sub(bindPos[par])
    return d.lengthSq() > 1e-12 ? d.normalize() : new THREE.Vector3(0, 0, 1)
  })

  // Quem orienta um osso é o filho que continua a sua cadeia. Um osso de coluna
  // que também carrega uma perna continua sendo orientado pela vértebra
  // seguinte, não pela perna.
  const primaryChild = new Array<number>(bones.length).fill(-1)
  const link = (chain: number[]) => {
    for (let i = 0; i < chain.length - 1; i++) primaryChild[chain[i]] = chain[i + 1]
  }
  link(spineIdx.concat(neckIdx, [headIdx, muzzleIdx]))
  link(tailIdx)
  for (const leg of legs) link(leg.idx)

  const skeleton = new THREE.Skeleton(bones)

  return {
    bones,
    root,
    skeleton,
    spine: { idx: spineIdx.concat(neckIdx, [headIdx, muzzleIdx]), bind: [] },
    tail: { idx: tailIdx, bind: tailIdx.map((k) => bindPos[k].clone()) },
    legs,
    head: headIdx,
    bindPos,
    bindDir,
    parent,
    primaryChild,
  }
}

function resample(pts: THREE.Vector3[], n: number): THREE.Vector3[] {
  if (pts.length < 2) return Array.from({ length: n }, () => (pts[0] ?? new THREE.Vector3()).clone())
  const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  return Array.from({ length: n }, (_, i) => c.getPoint(i / (n - 1)))
}

/**
 * Pesos de deformação por proximidade aos segmentos ósseos.
 *
 * O falloff é agressivo de propósito: com um decaimento suave, o osso da perna
 * esquerda ainda puxaria a carne da direita, e o gato derreteria ao andar.
 */
export function computeSkinning(
  positions: THREE.BufferAttribute,
  rig: RiggedSkeleton,
  /** Ossos que não devem receber peso (pontas puramente direcionais). */
  skip: Set<number> = new Set(),
): { skinIndex: THREE.BufferAttribute; skinWeight: THREE.BufferAttribute } {
  const n = positions.count
  const B = rig.bones.length
  const si = new Uint16Array(n * 4)
  const sw = new Float32Array(n * 4)

  // Segmento de influência de cada osso: do pai até ele.
  const segA: THREE.Vector3[] = []
  const segB: THREE.Vector3[] = []
  for (let b = 0; b < B; b++) {
    const par = rig.parent[b]
    segB.push(rig.bindPos[b])
    segA.push(par >= 0 ? rig.bindPos[par] : rig.bindPos[b])
  }

  const v = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const av = new THREE.Vector3()
  const best: Array<{ b: number; w: number }> = []

  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(positions, i)
    best.length = 0
    for (let b = 0; b < B; b++) {
      if (skip.has(b)) continue
      const a = segA[b]
      const c = segB[b]
      ab.subVectors(c, a)
      const len2 = ab.lengthSq()
      let d: number
      if (len2 < 1e-12) {
        d = v.distanceTo(c)
      } else {
        av.subVectors(v, a)
        const t = Math.max(0, Math.min(1, av.dot(ab) / len2))
        d = Math.hypot(
          v.x - (a.x + ab.x * t),
          v.y - (a.y + ab.y * t),
          v.z - (a.z + ab.z * t),
        )
      }
      const d2 = d * d
      const w = 1 / (d2 * d2 * d2 + 1e-12)
      best.push({ b, w })
    }
    best.sort((p, q) => q.w - p.w)
    // Descarta influências residuais: sem este corte o osso de uma perna ainda
    // puxa a carne do lado oposto, e o tronco derrete ao andar.
    const top = best[0]?.w ?? 0
    let sum = 0
    for (let k = 0; k < 4; k++) {
      const e = best[k]
      if (e && e.w < top * 0.04) e.w = 0
      sum += e?.w ?? 0
    }
    for (let k = 0; k < 4; k++) {
      const e = best[k]
      si[i * 4 + k] = e ? e.b : 0
      sw[i * 4 + k] = e && sum > 0 ? e.w / sum : 0
    }
  }

  return {
    skinIndex: new THREE.BufferAttribute(si, 4),
    skinWeight: new THREE.BufferAttribute(sw, 4),
  }
}

/**
 * Orienta os ossos para que suas pontas caiam sobre `target`.
 *
 * Percorre a hierarquia da raiz para as folhas: para cada osso, a rotação em
 * espaço do mundo é aquela que leva a direção do bind até a direção desejada, e
 * a rotação local sai descontando a do pai.
 */
export function applyTargets(
  rig: RiggedSkeleton,
  target: (THREE.Vector3 | null)[],
  worldQuat: THREE.Quaternion[],
) {
  const B = rig.bones.length
  const dir = new THREE.Vector3()
  const inv = new THREE.Quaternion()

  // Percorrida da raiz para as folhas. A rotação de um osso é a que leva a
  // direção-do-bind até o seu filho para a direção desejada até o mesmo filho:
  // é o osso PAI que aponta, não o filho. Orientar cada osso pela direção que
  // vem do pai deixava toda a cadeia deslocada, e a pata errava o chão por
  // vários centímetros.
  for (let b = 0; b < B; b++) {
    const par = rig.parent[b]
    const parentQ = par >= 0 ? worldQuat[par] : IDENTITY
    const child = rig.primaryChild[b]
    const t = target[b]
    const tc = child >= 0 ? target[child] : null

    if (child < 0 || !t || !tc) {
      worldQuat[b].copy(parentQ)
    } else {
      dir.subVectors(tc, t)
      if (dir.lengthSq() < 1e-12) {
        worldQuat[b].copy(parentQ)
      } else {
        dir.normalize()
        worldQuat[b].setFromUnitVectors(rig.bindDir[child], dir)
      }
    }
    inv.copy(parentQ).invert()
    rig.bones[b].quaternion.copy(inv).multiply(worldQuat[b])
  }
  rig.root.updateMatrixWorld(true)
}

const IDENTITY = new THREE.Quaternion()
