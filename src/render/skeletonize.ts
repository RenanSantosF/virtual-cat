import * as THREE from 'three'

export interface ExtractedSkeleton {
  /** Eixo da coluna, da base da cauda (0) até a base do crânio (último). */
  spine: THREE.Vector3[]
  /** Centro do crânio e ponta do focinho. */
  head: THREE.Vector3
  muzzle: THREE.Vector3
  /** Cadeia da cauda, da base à ponta. */
  tail: THREE.Vector3[]
  /** [ombro/quadril, cotovelo/joelho, tornozelo, pata] × 4, na ordem FL, FR, BL, BR. */
  legs: THREE.Vector3[][]
  /** Base e ponta de cada orelha, na ordem esquerda, direita. */
  ears: Array<{ base: THREE.Vector3; tip: THREE.Vector3 }>
  /** Centro de cada olho, sobre a superfície do crânio. */
  eyes: THREE.Vector3[]
  /** Medidas úteis para calibrar a simulação contra o modelo. */
  metrics: {
    bodyLength: number
    withersHeight: number
    tailLength: number
    hipZ: number
    shoulderZ: number
    neckZ: number
  }
}

interface Slice {
  n: number
  minY: number
  maxY: number
  minX: number
  maxX: number
  coreMinY: number
  coreMaxY: number
  coreN: number
}

/**
 * Deriva um esqueleto a partir da nuvem de vértices de uma malha estática.
 *
 * A ideia é simples: fatiar o corpo ao longo do eixo focinho-cauda e ler a
 * anatomia dos cortes. O tronco é a região larga que toca o chão pelas pernas;
 * a cauda é o apêndice fino atrás do quadril; a cabeça é a massa da frente que
 * não toca o chão. Nada disto depende de o modelo ter vindo com rig.
 *
 * Espera as posições já na convenção do projeto: +Z é a frente, Y é cima e o
 * chão está em y = 0.
 */
export function skeletonize(P: Float32Array): ExtractedSkeleton {
  const N = P.length / 3
  let minZ = Infinity, maxZ = -Infinity, maxY = 0, maxAbsX = 0
  for (let i = 0; i < N; i++) {
    const z = P[i * 3 + 2]
    const y = P[i * 3 + 1]
    const ax = Math.abs(P[i * 3])
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
    if (y > maxY) maxY = y
    if (ax > maxAbsX) maxAbsX = ax
  }
  const depth = maxZ - minZ
  const SL = 96
  const coreX = maxAbsX * 0.34

  const slices: Slice[] = Array.from({ length: SL }, () => ({
    n: 0, minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity,
    coreMinY: Infinity, coreMaxY: -Infinity, coreN: 0,
  }))
  const sliceOf = (z: number) => Math.min(SL - 1, Math.max(0, Math.floor(((z - minZ) / depth) * SL)))

  for (let i = 0; i < N; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
    const s = slices[sliceOf(z)]
    s.n++
    if (y < s.minY) s.minY = y
    if (y > s.maxY) s.maxY = y
    if (x < s.minX) s.minX = x
    if (x > s.maxX) s.maxX = x
    if (Math.abs(x) < coreX) {
      s.coreN++
      if (y < s.coreMinY) s.coreMinY = y
      if (y > s.coreMaxY) s.coreMaxY = y
    }
  }

  const width = (s: Slice) => (s.n ? s.maxX - s.minX : 0)
  let maxWidth = 0
  for (const s of slices) maxWidth = Math.max(maxWidth, width(s))

  // --- Base da cauda: vindo de trás, o primeiro corte que volta a ser largo. ---
  let tailEnd = 0
  for (let i = 0; i < SL; i++) {
    if (width(slices[i]) > maxWidth * 0.55 && slices[i].minY < maxY * 0.25) { tailEnd = i; break }
  }
  const hipIdx = tailEnd

  // --- Pescoço ---
  // O critério confiável não é a largura, e sim o chão: o pescoço fica logo à
  // frente do último corte em que as patas dianteiras ainda tocam o solo.
  // Procurar "o corte mais estreito" levava o algoritmo para a barriga, no meio
  // do tronco, que é estreita e também não tem pernas por baixo.
  let neckIdx = SL - 1
  for (let i = SL - 1; i >= 0; i--) {
    if (slices[i].n && slices[i].minY < maxY * 0.12) { neckIdx = i; break }
  }

  const zAt = (i: number) => minZ + ((i + 0.5) / SL) * depth

  // --- Eixo da coluna ---
  // O eixo passa bem acima do centro geométrico: num gato ele corre logo abaixo
  // da linha do dorso, com a caixa torácica pendurada.
  const spine: THREE.Vector3[] = []
  for (let i = hipIdx; i <= neckIdx; i++) {
    const s = slices[i]
    if (!s.coreN) continue
    const top = s.coreMaxY
    const bot = Math.max(s.coreMinY, 0)
    spine.push(new THREE.Vector3(0, top - (top - bot) * 0.30, zAt(i)))
  }
  smoothChain(spine, 2)
  const spineRes = resampleChain(spine, 11)

  // --- Cabeça ---
  // A região à frente do pescoço ainda contém a ponta dos dedos da pata
  // dianteira mais avançada. Tomar o mínimo de Y dali puxava o centro do crânio
  // para a altura do peito, então o quartil inferior é descartado.
  const neckZv = zAt(neckIdx)
  const headYs: number[] = []
  for (let i = 0; i < N; i++) if (P[i * 3 + 2] > neckZv) headYs.push(P[i * 3 + 1])
  headYs.sort((a, b) => a - b)
  const cut = headYs.length ? headYs[Math.floor(headYs.length * 0.25)] : 0

  const hc = { y: 0, z: 0, n: 0 }
  let noseZ = neckZv
  let hTop = 0
  for (let i = 0; i < N; i++) {
    const z = P[i * 3 + 2]
    const y = P[i * 3 + 1]
    if (z <= neckZv || y < cut) continue
    hc.y += y; hc.z += z; hc.n++
    if (z > noseZ) noseZ = z
    if (y > hTop) hTop = y
  }
  const head = hc.n
    ? new THREE.Vector3(0, hc.y / hc.n, hc.z / hc.n)
    : new THREE.Vector3(0, maxY * 0.75, neckZv)
  // O focinho fica à frente e um pouco abaixo do centro do crânio.
  const muzzle = new THREE.Vector3(0, head.y - (hTop - head.y) * 0.55, noseZ - (noseZ - head.z) * 0.18)

  // --- Cauda: percorrida com uma esfera móvel, porque ela sobe e curva e um
  // corte em Z deixaria de descrevê-la assim que ficasse vertical. ---
  const tailPts = traceTail(P, N, zAt(hipIdx), maxY, depth)

  // --- Pernas ---
  const legs = extractLegs(P, N, maxY, zAt(hipIdx), zAt(neckIdx), spineRes)

  // --- Orelhas ---
  // São as duas pontas que sobem acima da linha do crânio, uma de cada lado do
  // plano sagital. Achá-las dá dois ossos que valem muito: orelha achatada é o
  // sinal de humor mais legível que um gato tem.
  const ears = extractEars(P, N, neckZv, head, hTop)

  // --- Olhos ---
  // A malha não diz onde eles estão, mas a anatomia diz: no terço da frente do
  // crânio, acima do eixo e afastados do plano sagital. A posição é projetada
  // sobre a superfície para as pálpebras assentarem na cara, não dentro dela.
  const eyes = estimateEyes(P, N, head, muzzle)

  const withers = Math.max(...spineRes.map((p) => p.y))
  return {
    spine: spineRes,
    head,
    muzzle,
    ears,
    eyes,
    tail: tailPts,
    legs,
    metrics: {
      bodyLength: spineRes[spineRes.length - 1].z - spineRes[0].z,
      withersHeight: withers,
      tailLength: chainLength(tailPts),
      hipZ: zAt(hipIdx),
      shoulderZ: spineRes[spineRes.length - 1].z,
      neckZ: zAt(neckIdx),
    },
  }
}

/** As duas pontas mais altas da cabeça, uma de cada lado do plano sagital. */
function extractEars(
  P: Float32Array, N: number, neckZ: number, head: THREE.Vector3, hTop: number,
): Array<{ base: THREE.Vector3; tip: THREE.Vector3 }> {
  const out: Array<{ base: THREE.Vector3; tip: THREE.Vector3 }> = []
  const cut = head.y + (hTop - head.y) * 0.42
  for (const side of [-1, 1]) {
    const acc = { x: 0, y: 0, z: 0, n: 0 }
    let tip: THREE.Vector3 | null = null
    let best = -Infinity
    for (let i = 0; i < N; i++) {
      const x = P[i * 3]
      const y = P[i * 3 + 1]
      const z = P[i * 3 + 2]
      if (z <= neckZ || y < cut) continue
      if (Math.sign(x) !== side || Math.abs(x) < 0.004) continue
      acc.x += x
      acc.y += y
      acc.z += z
      acc.n++
      if (y > best) {
        best = y
        tip = new THREE.Vector3(x, y, z)
      }
    }
    if (acc.n < 12 || !tip) {
      // Sem orelha detectável, um par plausível mantém o rig válido.
      const b = new THREE.Vector3(side * 0.03, head.y + 0.02, head.z - 0.01)
      out.push({ base: b, tip: b.clone().add(new THREE.Vector3(side * 0.01, 0.04, 0)) })
      continue
    }
    out.push({ base: new THREE.Vector3(acc.x / acc.n, cut, acc.z / acc.n), tip })
  }
  return out
}

/** Posição estimada dos olhos, assentada sobre a superfície do crânio. */
function estimateEyes(
  P: Float32Array, N: number, head: THREE.Vector3, muzzle: THREE.Vector3,
): THREE.Vector3[] {
  const fwd = muzzle.clone().sub(head)
  const len = fwd.length() || 0.01
  fwd.normalize()
  const seed = head.clone().addScaledVector(fwd, len * 0.45)
  seed.y += len * 0.30

  // Meia-largura do crânio nessa fatia, medida na própria malha.
  let halfW = 0
  let n = 0
  for (let i = 0; i < N; i++) {
    if (Math.abs(P[i * 3 + 2] - seed.z) > len * 0.22) continue
    if (Math.abs(P[i * 3 + 1] - seed.y) > len * 0.35) continue
    halfW += Math.abs(P[i * 3])
    n++
  }
  halfW = n > 20 ? (halfW / n) * 1.55 : len * 0.5

  return [-1, 1].map((side) => new THREE.Vector3(side * halfW, seed.y, seed.z))
}

/**
 * Reconstrói a cauda por anéis de distância a partir da base.
 *
 * Uma primeira versão caminhava com uma esfera móvel, mas a esfera era maior
 * que o passo e o centroide caía atrás dela: o traçado oscilava e devolvia uma
 * cauda mais longa que o gato inteiro. Como a cauda é um arco de menos de 90°,
 * a distância euclidiana à base cresce monotonicamente ao longo dela, e ordenar
 * por essa distância descreve a curva sem risco de voltar sobre si mesma.
 */
function traceTail(P: Float32Array, N: number, hipZ: number, maxY: number, depth: number): THREE.Vector3[] {
  const cand: number[] = []
  for (let i = 0; i < N; i++) {
    const y = P[i * 3 + 1]
    const z = P[i * 3 + 2]
    if (z < hipZ && y > maxY * 0.3) cand.push(i)
  }
  const fallback = () => [new THREE.Vector3(0, maxY * 0.5, hipZ)]
  if (cand.length < 40) return fallback()

  // Base: centroide da fatia colada ao quadril.
  const base = new THREE.Vector3()
  let bn = 0
  for (const i of cand) {
    if (P[i * 3 + 2] > hipZ - depth * 0.05) {
      base.x += P[i * 3]; base.y += P[i * 3 + 1]; base.z += P[i * 3 + 2]; bn++
    }
  }
  if (bn < 8) return fallback()
  base.divideScalar(bn)

  let far = 0
  const dist = new Float32Array(cand.length)
  for (let k = 0; k < cand.length; k++) {
    const i = cand[k]
    const d = Math.hypot(P[i * 3] - base.x, P[i * 3 + 1] - base.y, P[i * 3 + 2] - base.z)
    dist[k] = d
    if (d > far) far = d
  }

  const RINGS = 14
  const sum = Array.from({ length: RINGS }, () => ({ x: 0, y: 0, z: 0, n: 0 }))
  for (let k = 0; k < cand.length; k++) {
    const r = Math.min(RINGS - 1, Math.floor((dist[k] / far) * RINGS))
    const i = cand[k]
    sum[r].x += P[i * 3]; sum[r].y += P[i * 3 + 1]; sum[r].z += P[i * 3 + 2]; sum[r].n++
  }

  const pts: THREE.Vector3[] = [base]
  for (const s of sum) {
    if (s.n < 6) continue
    pts.push(new THREE.Vector3(s.x / s.n, s.y / s.n, s.z / s.n))
  }
  if (pts.length < 3) return fallback()
  smoothChain(pts, 1)
  return resampleChain(pts, 9)
}

/** Cada perna vira uma linha do encaixe no tronco até a pata. */
function extractLegs(
  P: Float32Array, N: number, maxY: number, hipZ: number, neckZ: number, spine: THREE.Vector3[],
): THREE.Vector3[][] {
  const midZ = (hipZ + neckZ) / 2
  const acc = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, n: 0 }))
  for (let i = 0; i < N; i++) {
    const y = P[i * 3 + 1]
    if (y > maxY * 0.09) continue
    const x = P[i * 3]
    const z = P[i * 3 + 2]
    const k = (z > midZ ? 0 : 2) + (x < 0 ? 0 : 1)
    acc[k].x += x; acc[k].y += y; acc[k].z += z; acc[k].n++
  }

  const legs: THREE.Vector3[][] = []
  for (let k = 0; k < 4; k++) {
    const a = acc[k]
    const paw = a.n
      ? new THREE.Vector3(a.x / a.n, a.y / a.n, a.z / a.n)
      : new THREE.Vector3(k % 2 ? 0.05 : -0.05, 0, k < 2 ? neckZ * 0.6 : hipZ * 0.6)

    // Encaixe: o ponto da coluna verticalmente mais próximo da pata, puxado
    // para o lado do corpo.
    let best = spine[0]
    let bestD = Infinity
    for (const s of spine) {
      const d = Math.abs(s.z - paw.z)
      if (d < bestD) { bestD = d; best = s }
    }
    const side = Math.sign(paw.x) || 1
    const root = new THREE.Vector3(side * Math.abs(paw.x) * 0.55, best.y - maxY * 0.04, best.z)

    // Duas juntas ao longo do caminho: dá deformação suave sem exigir que a
    // anatomia real da bind pose seja reconstruída osso a osso.
    const j1 = root.clone().lerp(paw, 0.42)
    const j2 = root.clone().lerp(paw, 0.76)
    j1.x = root.x + (paw.x - root.x) * 0.42
    legs.push([root, j1, j2, paw])
  }
  return legs
}

function smoothChain(pts: THREE.Vector3[], passes: number) {
  for (let p = 0; p < passes; p++) {
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i].lerp(pts[i - 1].clone().add(pts[i + 1]).multiplyScalar(0.5), 0.5)
    }
  }
}

function chainLength(pts: THREE.Vector3[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1])
  return L
}

function resampleChain(pts: THREE.Vector3[], n: number): THREE.Vector3[] {
  if (pts.length < 2) return Array.from({ length: n }, () => (pts[0] ?? new THREE.Vector3()).clone())
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  return Array.from({ length: n }, (_, i) => curve.getPoint(i / (n - 1)))
}
