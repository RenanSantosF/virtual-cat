// Pequenos utilitários de matemática e ruído usados pelo rig e pela simulação.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// Aproxima `cur` de `target` de forma independente do framerate.
// `rate` ~ fração recuperada por segundo (0.9 = rápido, 0.05 = lento).
export const approach = (cur, target, rate, dt) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Ângulo mais curto entre dois ângulos.
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const approachAng = (cur, target, rate, dt) =>
  cur + angDiff(cur, target) * (1 - Math.exp(-rate * dt));

// Ruído 1D suave e determinístico — usado para tremores, respiração irregular,
// micro-movimentos que fazem o bicho parecer vivo em vez de interpolado.
const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 1337;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

export function noise1(x) {
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u = smooth(xf);
  const a = (PERM[xi] / 255) * 2 - 1;
  const b = (PERM[xi + 1] / 255) * 2 - 1;
  return lerp(a * xf, b * (xf - 1), u) * 2;
}

// Ruído fractal — mais orgânico para movimento de cauda e balanço do corpo.
export function fbm(x, oct = 3) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise1(x * f) * amp; amp *= 0.5; f *= 2.03; }
  return v;
}

// Curva Catmull-Rom desenhada como bézier — usada para lombo, cauda e bigodes.
export function strokeSpline(ctx, pts, close = false) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i], p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y
    );
  }
  if (close) ctx.closePath();
}

// Formata uma duração curta em português.
export function humanDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d} dia${d > 1 ? 's' : ''}`;
}
