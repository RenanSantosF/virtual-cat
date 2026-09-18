// Esqueletos-base. O gato nunca está exatamente em um deles: o rig mistura
// vários com pesos, e é essa mistura que dá o movimento contínuo de bicho.
//
// Espaço local: origem no chão, +x é a frente do gato, -y é para cima.
// A coluna é uma cadeia de 6 pontos (garupa → base do pescoço) com um raio
// em cada ponto; o contorno do corpo é o offset dessa curva.
// Proporções seguem gato adulto: altura de cernelha ~100, tronco ~116,
// cabeça ~70 de comprimento, cauda ~135.
//
// tailA: 0 = cauda reta para trás, positivo = levantando.

export const POSES = {
  stand: {
    spine: [[-53.4, -92], [-33.1, -97], [-7.4, -98], [18.4, -100], [40.5, -101], [53.4, -99]],
    radii: [26, 31, 26, 31, 30, 19],
    head: [79.1, -112], headA: -0.03,
    feet: { hl: [-42.3, 0], hr: [-53.4, 0], fl: [36.8, 0], fr: [47.8, 0] },
    hock: 0.15, tailA: 0.5, tailDroop: 0.45,
  },
  sit: {
    spine: [[-42.3, -26], [-29.4, -40], [-14.7, -62], [1.8, -82], [18.4, -98], [29.4, -107]],
    radii: [30, 34, 29, 29, 27, 18],
    head: [41, -129], headA: -0.1,
    feet: { hl: [-7.4, -2], hr: [-18.4, -2], fl: [23.9, 0], fr: [33.1, 0] },
    hock: 0.95, tailA: -0.15, tailDroop: 1,
  },
  loaf: {
    spine: [[-47.8, -24], [-31.3, -31], [-11.0, -35], [9.2, -37], [29.4, -38], [42.3, -37]],
    radii: [24, 31, 30, 31, 28, 18],
    head: [66.2, -54], headA: -0.04,
    feet: { hl: [-22.1, -3], hr: [-31.3, -3], fl: [31.3, -3], fr: [40.5, -3] },
    hock: 0.9, tailA: -0.15, tailDroop: 1,
  },
  side: {
    spine: [[-58.9, -20], [-38.6, -24], [-16.6, -26], [5.5, -27], [27.6, -25], [40.5, -23]],
    radii: [22, 28, 28, 29, 26, 17],
    head: [64.4, -24], headA: 0.2,
    feet: { hl: [-60.7, -9], hr: [-49.7, -16], fl: [62.6, -11], fr: [51.5, -17] },
    hock: 0.75, tailA: -0.1, tailDroop: 1,
  },
  curl: {
    spine: [[-20.2, -24], [-36.8, -46], [-23.9, -70], [3.7, -78], [27.6, -64], [36.8, -44]],
    radii: [22, 29, 31, 30, 27, 17],
    head: [30, -28], headA: 2.35,
    feet: { hl: [-5.5, -12], hr: [3.7, -16], fl: [20.2, -12], fr: [11.0, -18] },
    hock: 0.85, tailA: 0.3, tailDroop: 1,
  },
  crouch: {
    spine: [[-53.4, -52], [-35.0, -55], [-11.0, -53], [12.9, -50], [35.0, -49], [47.8, -49]],
    radii: [25, 31, 27, 30, 28, 18],
    head: [71.8, -50], headA: 0.04,
    feet: { hl: [-36.8, 0], hr: [-47.8, 0], fl: [35.0, 0], fr: [44.2, 0] },
    hock: 0.4, tailA: -0.35, tailDroop: 0.95,
  },
  stretch: {
    spine: [[-53.4, -98], [-35.0, -102], [-12.9, -94], [11.0, -80], [35.0, -64], [49.7, -56]],
    radii: [25, 31, 27, 30, 28, 18],
    head: [71.8, -46], headA: 0.3,
    feet: { hl: [-42.3, 0], hr: [-53.4, 0], fl: [64.4, 0], fr: [53.4, 0] },
    hock: 0.1, tailA: 1.5, tailDroop: 0.15,
  },
  arch: {
    spine: [[-51.5, -88], [-33.1, -104], [-9.2, -116], [14.7, -115], [36.8, -102], [49.7, -92]],
    radii: [24, 29, 27, 29, 27, 18],
    head: [66.2, -98], headA: -0.18,
    feet: { hl: [-38.6, 0], hr: [-49.7, 0], fl: [33.1, 0], fr: [42.3, 0] },
    hock: 0.2, tailA: 2.3, tailDroop: 0,
  },
};

// Membro digitígrado: fêmur/úmero, tíbia/antebraço e o metatarso quase
// vertical que faz o gato andar na ponta dos dedos.
export const LEG = {
  hind:  { l1: 40, l2: 38, l3: 26, kneeDir: 1 },
  front: { l1: 38, l2: 36, l3: 20, kneeDir: -1 },
};

// Ordem de apoio do passo do gato (marcha lateral): PE, DE, PD, DD.
export const GAIT_PHASE = { hl: 0, fl: 0.28, hr: 0.5, fr: 0.78 };
