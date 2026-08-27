import * as THREE from 'three'

/**
 * Solda vértices coincidentes e mantém apenas o maior componente conexo.
 * O modelo vem do gerador com um fragmento solto flutuando atrás do gato;
 * sem isto ele aparece na cena e ainda estraga a extração do esqueleto.
 */
export function largestComponent(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = geo.index ? geo : toIndexed(geo)
  const pos = src.attributes.position as THREE.BufferAttribute
  const idx = src.index as THREE.BufferAttribute
  const n = pos.count

  // União-busca sobre os vértices soldados.
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  // Solda por posição: a malha não é indexada de forma conexa.
  const map = new Map<string, number>()
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`
  for (let i = 0; i < n; i++) {
    const k = key(i)
    const prev = map.get(k)
    if (prev === undefined) map.set(k, i)
    else union(prev, i)
  }
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i)
    const b = idx.getX(i + 1)
    const c = idx.getX(i + 2)
    union(a, b)
    union(b, c)
  }

  const size = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    size.set(r, (size.get(r) ?? 0) + 1)
  }
  let best = -1
  let bestN = -1
  for (const [r, c] of size) if (c > bestN) { bestN = c; best = r }
  if (bestN === n) return src

  const keep: number[] = []
  for (let i = 0; i < idx.count; i += 3) {
    if (find(idx.getX(i)) === best) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2))
  }
  const out = src.clone()
  out.setIndex(keep)
  return out
}

function toIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = (geo.attributes.position as THREE.BufferAttribute).count
  const idx = new Uint32Array(count)
  for (let i = 0; i < count; i++) idx[i] = i
  const out = geo.clone()
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}

/**
 * Converte atributos quantizados para Float32.
 *
 * O modelo vem comprimido com meshopt, então posição, normal e UV chegam como
 * inteiros normalizados. Qualquer operação que ESCREVA nesses buffers — uma
 * matriz aplicada à geometria, ou `computeVertexNormals` — grava floats num
 * array de inteiros e eles são truncados para zero: as normais somem e o
 * modelo renderiza completamente preto sob qualquer luz.
 */
export function toFloat32(geo: THREE.BufferGeometry, names = ['position', 'normal', 'uv']) {
  for (const name of names) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute | undefined
    if (!a) continue
    if (!a.normalized && a.array instanceof Float32Array) continue
    const out = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k)
    }
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
  }
}

/** Posições dos vértices efetivamente usados pelos triângulos restantes. */
export function usedPositions(geo: THREE.BufferGeometry): Float32Array {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const idx = geo.index
  if (!idx) return pos.array as Float32Array
  const seen = new Uint8Array(pos.count)
  for (let i = 0; i < idx.count; i++) seen[idx.getX(i)] = 1
  let m = 0
  for (let i = 0; i < seen.length; i++) if (seen[i]) m++
  const out = new Float32Array(m * 3)
  let k = 0
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue
    out[k++] = pos.getX(i)
    out[k++] = pos.getY(i)
    out[k++] = pos.getZ(i)
  }
  return out
}
