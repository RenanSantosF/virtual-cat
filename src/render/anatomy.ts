/**
 * Medidas de um gato doméstico adulto de ~4,5 kg, em metros.
 * Referências: 46 cm de focinho à base da cauda, 25 cm de cernelha, cauda de
 * 28 cm. O modelo é construído nesta escala e depois multiplicado pela escala
 * de crescimento, então um filhote é o mesmo corpo, menor.
 */
export const A = {
  /** Base do crânio até a base da cauda — inclui o pescoço. */
  spineLength: 0.365,
  spineSegments: 30,

  /**
   * Perfil do tronco: [t, semi-eixo horizontal, semi-eixo vertical].
   * t = 0 é a nuca; t = 1 é a base da cauda. O tórax do gato é claramente mais
   * alto do que largo, e a cintura é bem mais fina que o quadril.
   */
  bodyProfile: [
    [0.0, 0.028, 0.030],
    [0.05, 0.033, 0.037],
    [0.10, 0.040, 0.048],
    [0.17, 0.050, 0.062], // ombros
    [0.30, 0.057, 0.073], // tórax, ponto mais profundo
    [0.44, 0.054, 0.068],
    [0.57, 0.047, 0.055], // cintura
    [0.72, 0.052, 0.058],
    [0.85, 0.056, 0.062], // quadril
    [0.94, 0.044, 0.047],
    [1.0, 0.028, 0.030],
  ] as Array<[number, number, number]>,

  /** Onde as pernas se prendem à coluna, em t. */
  shoulderT: 0.19,
  hipT: 0.85,
  shoulderWidth: 0.031,
  hipWidth: 0.038,

  /** Dianteiras: úmero, rádio, metacarpo. */
  foreLimb: [0.078, 0.074, 0.036] as [number, number, number],
  /** Traseiras: fêmur, tíbia, metatarso — o metatarso longo é o "salto" felino. */
  hindLimb: [0.086, 0.082, 0.058] as [number, number, number],
  legRadius: 0.0145,
  pawRadius: 0.016,

  /** Altura do eixo da coluna em pé, relaxado. O dorso fica ~7 cm acima disso. */
  standHeight: 0.152,

  headLength: 0.082,
  muzzleLength: 0.026,
  /** Curvatura em S do pescoço, que ergue a cabeça acima da linha do dorso. */
  neckRise: 0.52,

  earHeight: 0.040,
  earWidth: 0.036,

  eyeRadius: 0.0108,
  eyeSpacing: 0.0235,

  tailLength: 0.27,
  tailSegments: 18,
  tailBaseRadius: 0.018,
  tailTipRadius: 0.009,

  whiskerLength: 0.068,
}

export function bodyRadius(t: number): [number, number] {
  const p = A.bodyProfile
  if (t <= p[0][0]) return [p[0][1], p[0][2]]
  const last = p[p.length - 1]
  if (t >= last[0]) return [last[1], last[2]]
  for (let i = 0; i < p.length - 1; i++) {
    if (t >= p[i][0] && t <= p[i + 1][0]) {
      const s = (t - p[i][0]) / (p[i + 1][0] - p[i][0])
      const e = s * s * (3 - 2 * s)
      return [
        p[i][1] + (p[i + 1][1] - p[i][1]) * e,
        p[i][2] + (p[i + 1][2] - p[i][2]) * e,
      ]
    }
  }
  return [last[1], last[2]]
}

export function tailRadius(t: number): number {
  return A.tailBaseRadius * (1 - t) + A.tailTipRadius * t + Math.sin(t * Math.PI) * 0.0012
}
