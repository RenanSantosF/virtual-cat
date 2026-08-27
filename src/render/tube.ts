import * as THREE from 'three'

/**
 * Tubo de seção elíptica ao longo de uma polilinha, recalculado a cada frame.
 * Usa transporte paralelo do referencial para não torcer nas curvas fechadas —
 * um Frenet puro daria uma pirueta no meio da coluna quando o gato se enrola.
 */
export class Tube {
  readonly geometry: THREE.BufferGeometry
  readonly rings: number
  readonly sides: number
  private pos: Float32Array
  private nrm: Float32Array
  private frameX: THREE.Vector3[] = []
  private frameY: THREE.Vector3[] = []
  private tangent: THREE.Vector3[] = []
  /** Achatamento lateral por anel — o tórax do gato é mais alto que largo. */
  private tmp = new THREE.Vector3()

  constructor(
    rings: number,
    sides: number,
    capStart = true,
    capEnd = true,
    /** Faixa da textura usada ao longo do corpo (u) e ao redor dele (v). */
    uRange: [number, number] = [0, 1],
    vRange: [number, number] = [0, 1],
  ) {
    this.rings = rings
    this.sides = sides
    const count = rings * (sides + 1)
    this.pos = new Float32Array(count * 3)
    this.nrm = new Float32Array(count * 3)
    const uv = new Float32Array(count * 2)

    for (let i = 0; i < rings; i++) {
      for (let j = 0; j <= sides; j++) {
        const k = i * (sides + 1) + j
        const u = i / (rings - 1)
        const v = j / sides
        uv[k * 2] = uRange[0] + u * (uRange[1] - uRange[0])
        uv[k * 2 + 1] = vRange[0] + v * (vRange[1] - vRange[0])
      }
    }

    const idx: number[] = []
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j
        const b = a + sides + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    // Tampas simples em leque, para o tubo não ficar oco nas pontas.
    if (capStart) {
      for (let j = 1; j < sides - 1; j++) idx.push(0, j + 1, j)
    }
    if (capEnd) {
      const base = (rings - 1) * (sides + 1)
      for (let j = 1; j < sides - 1; j++) idx.push(base, base + j, base + j + 1)
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3))
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    this.geometry.setIndex(idx)

    for (let i = 0; i < rings; i++) {
      this.frameX.push(new THREE.Vector3(1, 0, 0))
      this.frameY.push(new THREE.Vector3(0, 1, 0))
      this.tangent.push(new THREE.Vector3(0, 0, 1))
    }
  }

  /**
   * @param points  centro de cada anel (comprimento = rings)
   * @param rx      semi-eixo horizontal por anel
   * @param ry      semi-eixo vertical por anel
   * @param up      referência inicial de "para cima"
   */
  update(points: THREE.Vector3[], rx: Float32Array, ry: Float32Array, up = new THREE.Vector3(0, 1, 0)) {
    const R = this.rings
    const S = this.sides

    for (let i = 0; i < R; i++) {
      const a = points[Math.max(0, i - 1)]
      const b = points[Math.min(R - 1, i + 1)]
      this.tangent[i].subVectors(b, a)
      if (this.tangent[i].lengthSq() < 1e-10) this.tangent[i].set(0, 0, 1)
      this.tangent[i].normalize()
    }

    // Transporte paralelo: o referencial do anel i herda o do anel i-1.
    this.frameX[0].crossVectors(up, this.tangent[0])
    if (this.frameX[0].lengthSq() < 1e-8) this.frameX[0].set(1, 0, 0)
    this.frameX[0].normalize()
    this.frameY[0].crossVectors(this.tangent[0], this.frameX[0]).normalize()

    for (let i = 1; i < R; i++) {
      const prevT = this.tangent[i - 1]
      const t = this.tangent[i]
      const axis = this.tmp.crossVectors(prevT, t)
      const sin = axis.length()
      this.frameX[i].copy(this.frameX[i - 1])
      if (sin > 1e-7) {
        axis.divideScalar(sin)
        const angle = Math.atan2(sin, prevT.dot(t))
        this.frameX[i].applyAxisAngle(axis, angle)
      }
      this.frameX[i].addScaledVector(t, -this.frameX[i].dot(t)).normalize()
      this.frameY[i].crossVectors(t, this.frameX[i]).normalize()
    }

    const pos = this.pos
    const nrm = this.nrm
    for (let i = 0; i < R; i++) {
      const c = points[i]
      const ex = this.frameX[i]
      const ey = this.frameY[i]
      const a = rx[i]
      const b = ry[i]
      for (let j = 0; j <= S; j++) {
        // Ângulo 0 aponta para cima (dorso), para casar com a textura de pelagem.
        const ang = (j / S) * Math.PI * 2
        const cs = Math.cos(ang)
        const sn = Math.sin(ang)
        const k = (i * (S + 1) + j) * 3
        pos[k] = c.x + ex.x * sn * a + ey.x * cs * b
        pos[k + 1] = c.y + ex.y * sn * a + ey.y * cs * b
        pos[k + 2] = c.z + ex.z * sn * a + ey.z * cs * b
        // Normal de uma elipse: componentes escaladas pelo inverso dos semi-eixos.
        let nx = (ex.x * sn) / a + (ey.x * cs) / b
        let ny = (ex.y * sn) / a + (ey.y * cs) / b
        let nz = (ex.z * sn) / a + (ey.z * cs) / b
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len
        ny /= len
        nz /= len
        nrm[k] = nx
        nrm[k + 1] = ny
        nrm[k + 2] = nz
      }
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.normal.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }
}

/** Reamostra uma polilinha curta em N pontos suaves (Catmull-Rom). */
export function resample(src: THREE.Vector3[], n: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(src, false, 'catmullrom', 0.5)
  for (let i = 0; i < n; i++) {
    curve.getPoint(i / (n - 1), out[i])
  }
  return out
}
