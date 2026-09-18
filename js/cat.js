// O gato: rig esquelético, IK das patas, cauda com física e pelo procedural.
// Nada de sprites — tudo é desenhado, então nenhum quadro é igual ao anterior.
import { clamp, lerp, approach, approachAng, noise1, fbm, rand, chance, strokeSpline } from './util.js';
import { POSES, LEG, GAIT_PHASE } from './rig.js';

const COAT = {
  base:   '#9a7c5c',
  belly:  '#dcc7a7',
  white:  '#f5f0e8',
  stripe: '#5c462e',
  dark:   '#3b2c1d',
  nose:   '#dd9a94',
  inner:  '#c98c86',
};
const IRIS = { core: '#d3b95a', rim: '#84913f', deep: '#4c5822' };

const IS_HIND = (k) => k[0] === 'h';
const TAU = Math.PI * 2;

export class Cat {
  constructor() {
    this.x = 0; this.y = 0; this.facing = 1; this.scale = 1;
    this.vx = 0;

    this.w = { stand: 1 };
    this.wTarget = { stand: 1 };

    this.p = {
      headX: 0, headY: 0, headTilt: 0, headTurn: 0,
      earRot: 0, earTwitch: 0,
      eyeOpen: 1, pupil: 0.42, squint: 0,
      mouthOpen: 0, purr: 0,
      tailA: 0.5, tailDroop: 0.45, tailFlick: 0, tailPuff: 0, tailCurl: 0.7,
      breath: 0.55, arousal: 0.3, lean: 0,
    };
    this.pt = { ...this.p, tailA: 0 };  // tailA no alvo é um offset sobre a pose

    this.t = rand(0, 40);
    this.gait = 0; this.speed = 0;
    this.blink = 0; this.blinkAt = rand(1, 5); this.slowBlink = 0;
    this.tail = null;
    this.skel = this._blend();
  }

  /* ------------------------------------------------------------ poses */
  setPose(name, extra) {
    this.wTarget = extra ? { ...extra } : {};
    this.wTarget[name] = (this.wTarget[name] ?? 0) + 1;
  }

  _blend() {
    let sum = 0;
    for (const k in this.w) sum += this.w[k];
    if (sum <= 0) { this.w = { stand: 1 }; sum = 1; }

    const out = {
      spine: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
      radii: [0, 0, 0, 0, 0, 0], head: [0, 0], headA: 0,
      feet: { hl: [0, 0], hr: [0, 0], fl: [0, 0], fr: [0, 0] },
      tailA: 0, tailDroop: 0, hock: 0,
    };
    for (const k in this.w) {
      const wgt = this.w[k] / sum, P = POSES[k];
      if (!P || wgt <= 0.0005) continue;
      for (let i = 0; i < 6; i++) {
        out.spine[i][0] += P.spine[i][0] * wgt;
        out.spine[i][1] += P.spine[i][1] * wgt;
        out.radii[i] += P.radii[i] * wgt;
      }
      out.head[0] += P.head[0] * wgt; out.head[1] += P.head[1] * wgt;
      out.headA += P.headA * wgt;
      for (const f in out.feet) { out.feet[f][0] += P.feet[f][0] * wgt; out.feet[f][1] += P.feet[f][1] * wgt; }
      out.tailA += P.tailA * wgt; out.tailDroop += P.tailDroop * wgt;
      out.hock += (P.hock ?? 0.15) * wgt;
    }
    return out;
  }

  /* ---------------------------------------------------------- update */
  update(dt, env = {}) {
    this.t += dt;
    const p = this.p, pt = this.pt;

    const keys = new Set([...Object.keys(this.w), ...Object.keys(this.wTarget)]);
    const rate = env.snap ? 20 : 4.2;
    for (const k of keys) {
      const v = approach(this.w[k] ?? 0, this.wTarget[k] ?? 0, rate, dt);
      if (v < 0.002 && !this.wTarget[k]) delete this.w[k]; else this.w[k] = v;
    }
    this.skel = this._blend();

    p.headX = approach(p.headX, pt.headX, 6, dt);
    p.headY = approach(p.headY, pt.headY, 6, dt);
    p.headTilt = approachAng(p.headTilt, pt.headTilt, 5, dt);
    p.headTurn = approach(p.headTurn, pt.headTurn, 4, dt);
    p.earRot = approach(p.earRot, pt.earRot, 8, dt);
    p.pupil = approach(p.pupil, pt.pupil, 3.5, dt);
    p.squint = approach(p.squint, pt.squint, 4, dt);
    p.mouthOpen = approach(p.mouthOpen, pt.mouthOpen, 9, dt);
    p.purr = approach(p.purr, pt.purr, 3, dt);
    p.tailA = approachAng(p.tailA, this.skel.tailA + pt.tailA, 3.2, dt);
    p.tailDroop = approach(p.tailDroop, this.skel.tailDroop * (1 - clamp(pt.tailA / 3)), 3, dt);
    p.tailFlick = approach(p.tailFlick, pt.tailFlick, 4, dt);
    p.tailPuff = approach(p.tailPuff, pt.tailPuff, 5, dt);
    p.tailCurl = approach(p.tailCurl, pt.tailCurl, 2.5, dt);
    p.arousal = approach(p.arousal, pt.arousal, 2, dt);
    p.lean = approach(p.lean, pt.lean, 5, dt);
    p.breath = approach(p.breath, pt.breath, 2, dt);

    // piscar involuntário; o lento é intencional e vem de fora
    this.blinkAt -= dt;
    if (this.slowBlink > 0) {
      this.slowBlink -= dt;
      const k = clamp(this.slowBlink / 1.2);
      p.eyeOpen = clamp(Math.abs(k - 0.5) * 2.3, 0.02, 1) * pt.eyeOpen;
    } else if (this.blink > 0) {
      this.blink -= dt;
      p.eyeOpen = lerp(pt.eyeOpen, 0.03, Math.sin(clamp(this.blink / 0.16) * Math.PI));
    } else {
      if (this.blinkAt <= 0) { this.blink = 0.16; this.blinkAt = rand(2.4, 8); }
      p.eyeOpen = approach(p.eyeOpen, pt.eyeOpen, 10, dt);
    }

    if (chance(dt * 0.5)) p.earTwitch = 1;
    p.earTwitch = approach(p.earTwitch, 0, 7, dt);

    this.speed = approach(this.speed, env.speed ?? 0, 6, dt);
    this.vx = this.speed * this.facing;
    this.x += this.vx * dt;
    const hz = lerp(1.1, 3.6, clamp(this.speed / 260));
    this.gait = (this.gait + dt * hz * clamp(this.speed / 20, 0, 1)) % 1;

    this._tailStep(dt);
  }

  doSlowBlink() { this.slowBlink = 1.2; }

  /* --------------------------------------------------------- cauda */
  _tailBase() {
    const s = this.skel.spine[0], r = this.skel.radii[0];
    return { x: s[0] - r * 0.55, y: s[1] - r * 0.25 };
  }

  _tailStep(dt) {
    const N = 18, seg = 7.6;
    const base = this._tailBase();
    if (!this.tail) {
      this.tail = [];
      for (let i = 0; i < N; i++) {
        const q = { x: base.x - i * seg, y: base.y };
        this.tail.push({ ...q, px: q.x, py: q.y });
      }
    }
    const T = this.tail;
    const droop = this.p.tailDroop, flick = this.p.tailFlick;
    const steps = 2, h = dt / steps;

    for (let s = 0; s < steps; s++) {
      for (let i = 2; i < N; i++) {
        const q = T[i];
        const nx = q.x + (q.x - q.px) * 0.9;
        let ny = q.y + (q.y - q.py) * 0.9 + 1000 * droop * h * h * (0.3 + i / N);
        ny += fbm(this.t * (1.2 + flick * 3.5) + i * 0.42, 2) * (1 + flick * 14) * h * 55 * (i / N);
        q.px = q.x; q.py = q.y; q.x = nx; q.y = ny;
      }
      // âncora: base fixa no quadril, segunda vértebra define a postura
      const a = this.p.tailA;
      T[0].x = base.x; T[0].y = base.y;
      T[1].x = base.x - Math.cos(a) * seg;
      T[1].y = base.y - Math.sin(a) * seg;

      for (let it = 0; it < 3; it++) {
        for (let i = 2; i < N; i++) {
          const a0 = T[i - 1], b = T[i];
          const dx = b.x - a0.x, dy = b.y - a0.y;
          const d = Math.hypot(dx, dy) || 1e-4;
          const f = (d - seg) / d;
          b.x -= dx * f; b.y -= dy * f;
        }
        for (let i = 2; i < N; i++) {
          const stiff = 0.3 * (1 - i / N) + 0.07;
          // a continuação reta ganha uma leve rotação: cauda de gato descansa
          // em curva, nunca como um cabo esticado
          const curl = this.p.tailCurl * (0.055 + 0.075 * (i / N));
          let vx = T[i - 1].x - T[i - 2].x, vy = T[i - 1].y - T[i - 2].y;
          const cs = Math.cos(curl), sn = Math.sin(curl);
          const rx = vx * cs - vy * sn, ry = vx * sn + vy * cs;
          T[i].x += (T[i - 1].x + rx - T[i].x) * stiff;
          T[i].y += (T[i - 1].y + ry - T[i].y) * stiff;
        }
      }
      // a cauda não atravessa o chão
      for (let i = 5; i < N; i++) if (T[i].y > -5) T[i].y = -5;
    }
  }

  /* ------------------------------------------------------------ IK */
  _legPose(key) {
    const sk = this.skel;
    const hind = IS_HIND(key);
    const root = hind
      ? { x: sk.spine[1][0] - 2, y: sk.spine[1][1] + sk.radii[1] * 0.45 }
      : { x: sk.spine[4][0] + 2, y: sk.spine[4][1] + sk.radii[4] * 0.42 };
    const L = hind ? LEG.hind : LEG.front;
    const base = sk.feet[key];

    let fx = base[0], fy = base[1];
    if (this.speed > 6) {
      const sp = clamp(this.speed / 260);
      const stride = lerp(24, 70, sp);
      const duty = lerp(0.66, 0.42, sp);
      const ph = (this.gait + GAIT_PHASE[key]) % 1;
      if (ph < duty) {
        fx = base[0] + stride * (0.5 - ph / duty);
      } else {
        const u = (ph - duty) / (1 - duty);
        fx = base[0] + stride * (u - 0.5);
        fy = base[1] - Math.sin(u * Math.PI) * lerp(13, 32, sp);
      }
    }
    fx += (key[1] === 'r' ? -3 : 3);

    // o jarrete deita no chão quando o gato senta ou se deita
    const hock = (this.skel.hock ?? 0.15) * (hind ? 1 : 0.75);
    const ha = hock * 1.45;
    const ankle = {
      x: fx - Math.sin(ha) * L.l3 - L.kneeDir * 4 * (1 - hock),
      y: fy - Math.cos(ha) * L.l3,
    };
    const knee = ik2(root, ankle, L.l1, L.l2, L.kneeDir);
    return { root, knee, ankle, foot: { x: fx, y: fy }, hind };
  }

  /* -------------------------------------------------------- contorno */
  // A coluna de 6 pontos é reamostrada em uma curva suave; o contorno é o
  // offset dessa curva pelo raio, o que dá cintura, caixa torácica e garupa.
  _outline() {
    const S = this.skel.spine, R = this.skel.radii;
    const N = 18;
    const breath = 1 + Math.sin(this.t * this.p.breath * TAU) * (0.02 + this.p.purr * 0.01)
                     + (this.p.purr > 0.05 ? Math.sin(this.t * 26) * 0.005 * this.p.purr : 0);
    const mid = [], top = [], bot = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) * 5;
      const j = Math.min(4, Math.floor(u)), f = u - j;
      const c = catmull(S, j, f);
      const r = catmullS(R, j, f) * lerp(1, breath, Math.sin((i / (N - 1)) * Math.PI));
      const t = catmullTan(S, j, f);
      mid.push({ x: c.x, y: c.y, r });
      top.push({ x: c.x + t.y * r, y: c.y - t.x * r });
      bot.push({ x: c.x - t.y * r, y: c.y + t.x * r });
    }
    const t0 = catmullTan(S, 0, 0), t5 = catmullTan(S, 4, 1);
    const rump = { x: S[0][0] - t0.x * R[0] * 1.2, y: S[0][1] - t0.y * R[0] * 1.2 };
    const chest = { x: S[5][0] + t5.x * R[5] * 1.1, y: S[5][1] + t5.y * R[5] * 1.1 };
    return { mid, top, bot, rump, chest };
  }

  _bodyPath(ctx, o) {
    ctx.beginPath();
    strokeSpline(ctx, [o.rump, ...o.top, o.chest, ...o.bot.slice().reverse(), o.rump]);
    ctx.closePath();
  }

  /* --------------------------------------------------------- desenho */
  draw(ctx, env = {}) {
    const light = env.light ?? 1;
    this._W = 0.4 + light * 0.62;   // brancos seguem a luz do cômodo
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing * this.scale, this.scale);
    ctx.rotate(this.p.lean * 0.07);

    this._shadow(ctx, light);
    this._drawTail(ctx, light);
    this._drawLeg(ctx, 'hr', true, light);
    this._drawLeg(ctx, 'fr', true, light);
    this._drawBody(ctx, light);
    this._drawLeg(ctx, 'hl', false, light);
    this._drawLeg(ctx, 'fl', false, light);
    this._drawHead(ctx, light);

    ctx.restore();
  }

  _shadow(ctx, light) {
    const sk = this.skel;
    const cx = (sk.spine[0][0] + sk.spine[5][0]) / 2;
    const w = 95;
    ctx.save();
    ctx.translate(cx, 1); ctx.scale(1, 0.16);
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, w);
    g.addColorStop(0, `rgba(0,0,0,${0.42 * light})`);
    g.addColorStop(0.6, `rgba(0,0,0,${0.16 * light})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, w, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawLeg(ctx, key, far, light) {
    const L = this._legPose(key);
    const k = far ? 0.8 : 1;
    const W = L.hind ? [27, 17, 12] : [22, 15, 11];
    const dir = Math.atan2(L.foot.y - L.ankle.y, L.foot.x - L.ankle.x);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // massa da coxa/ombro, que se funde ao corpo
    if (L.hind) {
      ctx.fillStyle = tint(COAT.base, k * light * 0.97);
      const ha = Math.atan2(L.knee.y - L.root.y, L.knee.x - L.root.x);
      ctx.beginPath();
      ctx.ellipse(lerp(L.root.x, L.knee.x, 0.34), lerp(L.root.y, L.knee.y, 0.34),
        W[0] * 1.05, W[0] * 0.78, ha, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = tint(COAT.base, k * light);
    ctx.lineWidth = W[0];
    ctx.beginPath(); ctx.moveTo(L.root.x, L.root.y); ctx.lineTo(L.knee.x, L.knee.y); ctx.stroke();
    ctx.lineWidth = W[1];
    ctx.beginPath(); ctx.moveTo(L.knee.x, L.knee.y); ctx.lineTo(L.ankle.x, L.ankle.y); ctx.stroke();
    ctx.lineWidth = W[2];
    ctx.beginPath(); ctx.moveTo(L.ankle.x, L.ankle.y); ctx.lineTo(L.foot.x, L.foot.y - 4); ctx.stroke();

    // listras da perna, antes da meia branca
    ctx.strokeStyle = tint(COAT.stripe, k * light);
    ctx.globalAlpha = 0.26; ctx.lineWidth = 3.2;
    for (let i = 0; i < 3; i++) {
      const u = 0.28 + i * 0.19;
      const ax = lerp(L.root.x, L.knee.x, u), ay = lerp(L.root.y, L.knee.y, u);
      ctx.beginPath();
      ctx.moveTo(ax - W[0] * 0.48, ay + 2); ctx.lineTo(ax + W[0] * 0.4, ay - 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // meia branca do jarrete para baixo
    const sockX = lerp(L.ankle.x, L.foot.x, 0.25), sockY = lerp(L.ankle.y, L.foot.y - 4, 0.25);
    ctx.strokeStyle = tint(COAT.white, k * light);
    ctx.lineWidth = W[2] * 0.96;
    ctx.beginPath(); ctx.moveTo(sockX, sockY); ctx.lineTo(L.foot.x, L.foot.y - 4); ctx.stroke();

    // pata alinhada à direção da perna
    ctx.save();
    ctx.translate(L.foot.x, L.foot.y - 4);
    ctx.rotate(dir - Math.PI / 2);
    ctx.fillStyle = tint(COAT.white, k * light);
    ctx.beginPath(); ctx.ellipse(0, 2, W[2] * 0.62, W[2] * 0.86, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1.5, 5.5, W[2] * 0.72, W[2] * 0.44, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(120,98,74,${0.3 * k * light})`; ctx.lineWidth = 0.9;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 3.4, 3); ctx.lineTo(i * 4.2, 8); ctx.stroke();
    }
    ctx.restore();

    // franja de pelo atrás da coxa
    ctx.strokeStyle = `rgba(58,44,28,${0.3 * k * light})`; ctx.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const u = 0.15 + i * 0.11;
      const ax = lerp(L.root.x, L.knee.x, u) - W[0] * 0.62;
      const ay = lerp(L.root.y, L.knee.y, u);
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 4 - Math.abs(noise1(i * 3.3 + (far ? 9 : 0))) * 5, ay + 2.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawBody(ctx, light) {
    const o = this._outline();
    this._bodyPath(ctx, o);

    // A barriga é clara e o dorso escuro em relação à COLUNA, não à tela:
    // sentado ou enroscado, um gradiente vertical pinta a garupa de branco.
    let nx = 0, ny = 0, cx = 0, cy = 0, maxR = 0, wsum = 0;
    for (let i = 0; i < o.mid.length; i++) {
      const m = o.mid[i];
      const b = o.bot[i], t = o.top[i];
      const dx = b.x - t.x, dy = b.y - t.y, d = Math.hypot(dx, dy) || 1;
      nx += dx / d; ny += dy / d;
      cx += m.x * m.r; cy += m.y * m.r; wsum += m.r;
      if (m.r > maxR) maxR = m.r;
    }
    const nlen = Math.hypot(nx, ny) / o.mid.length;
    if (nlen < 0.4) { nx = 0; ny = 1; } else { const l = Math.hypot(nx, ny); nx /= l; ny /= l; }
    cx /= wsum; cy /= wsum;
    const g = ctx.createLinearGradient(cx - nx * maxR * 1.15, cy - ny * maxR * 1.15,
                                       cx + nx * maxR * 1.15, cy + ny * maxR * 1.15);
    g.addColorStop(0, tint(COAT.dark, light));
    g.addColorStop(0.2, tint(COAT.base, light * 0.93));
    g.addColorStop(0.52, tint(COAT.base, light * 1.05));
    g.addColorStop(0.8, tint(COAT.belly, light));
    g.addColorStop(1, tint(COAT.white, light * 0.98));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // rajado malhado: listras perpendiculares à coluna, curvas e irregulares
    ctx.lineCap = 'round';
    ctx.strokeStyle = tint(COAT.stripe, light);
    for (let i = 1; i < o.mid.length - 1; i += 1) {
      const m = o.mid[i];
      const t = { x: o.mid[i + 1].x - o.mid[i - 1].x, y: o.mid[i + 1].y - o.mid[i - 1].y };
      const d = Math.hypot(t.x, t.y) || 1;
      const nx = t.y / d, ny = -t.x / d;
      const n = noise1(i * 1.9);
      if (n < -0.1) continue;
      ctx.globalAlpha = 0.34 + n * 0.16;
      ctx.lineWidth = 5 + n * 3;
      const len = m.r * (1.15 + n * 0.25);
      const bend = noise1(i * 4.4) * 9;
      ctx.beginPath();
      ctx.moveTo(m.x + nx * len, m.y + ny * len);
      ctx.quadraticCurveTo(m.x + bend * 0.5, m.y + bend * 0.2, m.x - nx * m.r * 0.42 + bend, m.y - ny * m.r * 0.42);
      ctx.stroke();
    }
    // faixa dorsal escura
    ctx.globalAlpha = 0.3; ctx.lineWidth = 11;
    ctx.beginPath(); strokeSpline(ctx, o.top.map(q => ({ x: q.x, y: q.y + 6 }))); ctx.stroke();
    // pelo por dentro: sem isso o corpo continua parecendo vetor liso
    ctx.globalAlpha = 1; ctx.lineWidth = 0.85; ctx.lineCap = 'round';
    for (let i = 1; i < o.mid.length; i++) {
      const a = o.mid[i - 1], m = o.mid[i];
      const t = { x: m.x - a.x, y: m.y - a.y };
      const d = Math.hypot(t.x, t.y) || 1;
      const tx = t.x / d, ty = t.y / d;
      const nx = ty, ny = -tx;
      for (let k = 0; k < 22; k++) {
        const j1 = noise1(i * 9.7 + k * 1.31);
        const j2 = noise1(i * 4.3 + k * 2.77 + 50);
        const f = j2 * 1.05;                       // posição através do corpo
        const u = (k + j1 * 0.5) / 22;             // posição ao longo do corpo
        const x = lerp(a.x, m.x, u) + nx * m.r * f;
        const y = lerp(a.y, m.y, u) + ny * m.r * f;
        ctx.strokeStyle = f < 0.15
          ? `rgba(${250*this._W|0},${245*this._W|0},${234*this._W|0},${0.09 + Math.abs(j1) * 0.14})`
          : `rgba(44,32,20,${0.08 + Math.abs(j1) * 0.16})`;
        const l = 3 + Math.abs(j1) * 4;
        const ax2 = -tx * 0.92 + nx * j2 * 0.3, ay2 = -ty * 0.92 + ny * j2 * 0.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + ax2 * l * 0.5 + nx, y + ay2 * l * 0.5 + ny, x + ax2 * l, y + ay2 * l);
        ctx.stroke();
      }
    }

    ctx.restore();

    this._fur(ctx, o, light);
  }

  // Pelo: fios curtos, densos, deitados para trás. É o que tira o aspecto de vetor.
  _fur(ctx, o, light) {
    const ring = [...o.top, o.chest, ...o.bot.slice().reverse()];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.15;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(2, Math.round(segLen / 3.2));
      const up = i < o.top.length;
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const x = lerp(a.x, b.x, u), y = lerp(a.y, b.y, u);
        let tx = b.x - a.x, ty = b.y - a.y;
        const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
        let nx = ty, ny = -tx;
        if (!up) { nx = -nx; ny = -ny; }
        const seed = i * 17.3 + k * 3.7;
        const jit = noise1(seed);
        // o fio deita para trás (−x) e só um pouco para fora
        const len = (up ? 6.5 : 4) * (0.7 + Math.abs(jit) * 0.9) * (1 + this.p.tailPuff * 1.5);
        const swayN = 1.0 + jit * 0.25 + this.p.tailPuff * 0.6;
        const swayT = -0.5 + noise1(seed + this.t * 0.6) * 0.3;
        const ex = x + (nx * swayN + tx * swayT) * len;
        const ey = y + (ny * swayN + ty * swayT) * len;
        ctx.strokeStyle = up
          ? `rgba(58,44,28,${(0.42 + Math.abs(jit) * 0.3) * light})`
          : `rgba(${246*this._W|0},${240*this._W|0},${228*this._W|0},${(0.38 + Math.abs(jit) * 0.28) * light})`;
        ctx.beginPath();
        ctx.moveTo(x - nx * 2.5, y - ny * 2.5);
        ctx.quadraticCurveTo(x + nx * len * 0.5, y + ny * len * 0.5, ex, ey);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawTail(ctx, light) {
    const T = this.tail; if (!T) return;
    const N = T.length;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const puff = 1 + this.p.tailPuff * 0.85;

    const pts = T.map(q => ({ x: q.x, y: q.y }));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N - 1; i++) {
        const u = i / (N - 1);
        const w = lerp(20, 8.5, u) * puff;
        if (pass === 0) {
          ctx.strokeStyle = tint(COAT.base, light);
          ctx.lineWidth = w;
        } else {
          const band = 0.5 + 0.5 * Math.sin(u * 26);
          if (band < 0.45) continue;
          ctx.strokeStyle = tint(COAT.stripe, light);
          ctx.globalAlpha = (band - 0.45) * 0.85;
          ctx.lineWidth = w * 0.96;
        }
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = tint(COAT.dark, light); ctx.lineWidth = 9 * puff;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(T[N - 3].x, T[N - 3].y);
    ctx.lineTo(T[N - 2].x, T[N - 2].y); ctx.lineTo(T[N - 1].x, T[N - 1].y); ctx.stroke();
    ctx.globalAlpha = 1;

    // pelagem da cauda
    ctx.lineWidth = 1.15;
    for (let i = 2; i < N; i++) {
      const u = i / N;
      const w = lerp(11, 5, u) * (1 + this.p.tailPuff * 1.7);
      const dx = T[i].x - T[i - 1].x, dy = T[i].y - T[i - 1].y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      ctx.strokeStyle = `rgba(48,36,24,${0.32 * light})`;
      for (const s of [1, -1]) {
        for (let j = 0; j < 2; j++) {
          const l = w + Math.abs(noise1(i * 5.1 + s * 3 + j)) * 5;
          const bx = lerp(T[i - 1].x, T[i].x, j * 0.5), by = lerp(T[i - 1].y, T[i].y, j * 0.5);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + nx * s * l - dx / d * 3, by + ny * s * l - dy / d * 3);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------- cabeça */
  _headTransform() {
    const sk = this.skel;
    return {
      x: sk.head[0] + this.p.headX,
      y: sk.head[1] + this.p.headY,
      a: sk.headA + this.p.headTilt,
    };
  }

  _drawHead(ctx, light) {
    const H = this._headTransform();
    const p = this.p;
    const sk = this.skel;

    // pescoço: liga a base do crânio ao peito para não aparecer emenda
    ctx.save();
    ctx.fillStyle = tint(COAT.base, light * 0.94);
    const nx0 = sk.spine[5][0], ny0 = sk.spine[5][1];
    const na = Math.atan2(H.y - ny0, H.x - nx0);
    ctx.beginPath();
    ctx.ellipse((nx0 + H.x) / 2, (ny0 + H.y) / 2,
      Math.hypot(H.x - nx0, H.y - ny0) / 2 + 12, sk.radii[5] * 1.05, na, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(H.a);
    ctx.scale(1.28, 1.28);
    const turn = clamp(p.headTurn, -1, 1);
    const wide = lerp(1, 1.2, Math.abs(turn));

    this._ear(ctx, -20 * wide, -22, -0.62, 0.84, light, true);

    // crânio + bochechas
    ctx.beginPath();
    strokeSpline(ctx, [
      { x: -30 * wide, y: -3 }, { x: -26 * wide, y: -21 }, { x: -8 * wide, y: -31 },
      { x: 13 * wide, y: -27 }, { x: 26, y: -14 }, { x: 34, y: -2 },
      { x: 35, y: 7 }, { x: 28, y: 14 }, { x: 17, y: 19 },
      { x: 2 * wide, y: 23 }, { x: -17 * wide, y: 20 }, { x: -31 * wide, y: 7 },
    ], true);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, -32, 0, 24);
    hg.addColorStop(0, tint(COAT.dark, light));
    hg.addColorStop(0.26, tint(COAT.base, light * 0.96));
    hg.addColorStop(0.66, tint(COAT.belly, light));
    hg.addColorStop(1, tint(COAT.white, light));
    ctx.fillStyle = hg; ctx.fill();

    ctx.save(); ctx.clip();
    // o "M" da testa e as listras das bochechas
    ctx.strokeStyle = tint(COAT.stripe, light); ctx.lineCap = 'round';
    ctx.globalAlpha = 0.5; ctx.lineWidth = 3.6;
    for (let i = 0; i < 4; i++) {
      const x = (-19 + i * 9) * wide;
      ctx.beginPath(); ctx.moveTo(x, -32); ctx.quadraticCurveTo(x + 5, -21, x + 1, -13); ctx.stroke();
    }
    ctx.globalAlpha = 0.34; ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-32 * wide, 1 + i * 9);
      ctx.quadraticCurveTo(-16 * wide, 5 + i * 9, -4 * wide, 3 + i * 10);
      ctx.stroke();
    }
    // pelagem do rosto
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const a = noise1(i * 2.1) * Math.PI;
      const rr = 12 + Math.abs(noise1(i * 3.7)) * 20;
      const x = Math.cos(a * 2) * rr * wide, y = Math.sin(a * 3.1) * 20 - 4;
      ctx.strokeStyle = y < -6 ? `rgba(50,38,25,${0.2 * light})` : `rgba(${248*this._W|0},${242*this._W|0},${230*this._W|0},0.17)`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4.5, y + 1.4); ctx.stroke();
    }
    ctx.restore();

    // focinho
    ctx.fillStyle = tint(COAT.white, light);
    ctx.beginPath(); ctx.ellipse(24, 8, 12.5, 8.5, 0.14, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(19, 15.5, 9.5, 6, 0.08, 0, TAU); ctx.fill();
    if (Math.abs(turn) > 0.25) { ctx.beginPath(); ctx.ellipse(11, 12, 9.5, 7.5, 0.1, 0, TAU); ctx.fill(); }
    // poros dos bigodes
    ctx.fillStyle = `rgba(120,96,74,${0.35 * light})`;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(19 + (i % 3) * 4.5, 4 + Math.floor(i / 3) * 4.5, 0.9, 0, TAU); ctx.fill();
    }

    ctx.fillStyle = tint(COAT.nose, light);
    ctx.beginPath();
    ctx.moveTo(27.5, -1.5); ctx.quadraticCurveTo(35.5, 0, 34, 4);
    ctx.quadraticCurveTo(32, 8, 30, 7.5); ctx.quadraticCurveTo(27, 4, 27.5, -1.5);
    ctx.fill();
    ctx.strokeStyle = `rgba(90,56,50,${0.45 * light})`; ctx.lineWidth = 0.9; ctx.stroke();

    ctx.strokeStyle = `rgba(74,54,40,${0.6 * light})`; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    const mo = p.mouthOpen;
    ctx.beginPath();
    ctx.moveTo(30.5, 7.5); ctx.lineTo(29.5, 10.5 + mo * 3);
    ctx.moveTo(29.5, 10.5 + mo * 3); ctx.quadraticCurveTo(24.5, 13.5 + mo * 5, 20, 10.5 + mo * 2);
    ctx.stroke();
    if (mo > 0.12) {
      ctx.fillStyle = `rgba(158,74,84,${0.9 * mo})`;
      ctx.beginPath(); ctx.ellipse(26, 13 + mo * 2.5, 5.5 * mo, 3.6 * mo, 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * mo})`;
      ctx.beginPath(); ctx.moveTo(29, 11); ctx.lineTo(30.5, 14.5); ctx.lineTo(27.5, 11.8); ctx.fill();
    }

    this._eye(ctx, 12.5, -6, 1, light);
    if (Math.abs(turn) > 0.08) this._eye(ctx, -13 - turn * 2, -8.5, 0.84, light);

    this._ear(ctx, -1 * wide, -27, 0.14, 1, light, false);
    this._whiskers(ctx, light);
    ctx.restore();
  }

  _ear(ctx, x, y, baseA, s, light, far) {
    const p = this.p;
    const flat = p.earRot;
    const tw = p.earTwitch * (far ? -0.16 : 0.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(baseA + flat * (far ? -1.2 : 1.3) + tw);
    ctx.scale(s * (far ? 0.92 : 1), s * lerp(1, 0.6, flat));
    const k = far ? 0.7 : 1;

    ctx.beginPath();
    ctx.moveTo(-14, 7);
    ctx.quadraticCurveTo(-13, -22, 2, -30);
    ctx.quadraticCurveTo(13, -20, 14, 6);
    ctx.quadraticCurveTo(0, 11, -14, 7);
    ctx.closePath();
    ctx.fillStyle = tint(COAT.base, k * light); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-7.5, 5);
    ctx.quadraticCurveTo(-6.5, -14, 1.5, -21);
    ctx.quadraticCurveTo(8, -13, 9, 4);
    ctx.closePath();
    ctx.fillStyle = tint(COAT.inner, k * light * 0.94); ctx.fill();

    ctx.strokeStyle = `rgba(${246*this._W|0},${240*this._W|0},${228*this._W|0},${0.3 * k})`; ctx.lineWidth = 0.85; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const bx = -6 + i * 3.4, by = 4 - i * 0.7;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - 2, by - 8, bx - 5 - Math.abs(noise1(i * 5.3)) * 4, by - 12 - i);
      ctx.stroke();
    }
    // pelo da borda externa
    ctx.strokeStyle = `rgba(52,40,26,${0.4 * k * light})`; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const bx = lerp(-13, 2, u), by = lerp(5, -29, u * u * 0.9 + u * 0.1);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 4, by - 3); ctx.stroke();
    }
    ctx.restore();
  }

  _eye(ctx, x, y, s, light) {
    const p = this.p;
    const open = clamp(p.eyeOpen * (1 - p.squint * 0.6), 0, 1);
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    const w = 10.2, h = 7.7 * open;

    if (open < 0.06) {
      ctx.strokeStyle = `rgba(58,42,30,${0.9 * light})`; ctx.lineWidth = 1.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-w, -0.5); ctx.quadraticCurveTo(0, 3.4, w, -1.5); ctx.stroke();
      ctx.restore(); return;
    }

    ctx.beginPath(); ctx.ellipse(0, 0, w, Math.max(h, 0.6), -0.07, 0, TAU);
    ctx.save(); ctx.clip();
    const ig = ctx.createRadialGradient(-2.5, -1.5, 1, 0, 0, w * 1.2);
    ig.addColorStop(0, tint(IRIS.core, light * 1.15));
    ig.addColorStop(0.55, tint(IRIS.rim, light));
    ig.addColorStop(1, tint(IRIS.deep, light));
    ctx.fillStyle = ig; ctx.fillRect(-w - 2, -h - 3, w * 2 + 4, h * 2 + 6);
    // fibras da íris
    ctx.strokeStyle = `rgba(255,240,190,${0.09 * light})`; ctx.lineWidth = 0.6;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 3.5, Math.sin(a) * 3.5);
      ctx.lineTo(Math.cos(a) * w, Math.sin(a) * h);
      ctx.stroke();
    }
    // pupila: fenda no claro e calmo, redonda no escuro ou na adrenalina
    const d = clamp(p.pupil);
    const pw = lerp(1.6, 9.6, d * d), ph = lerp(9, 10, d) * clamp(open + 0.12, 0, 1);
    ctx.fillStyle = 'rgba(10,9,9,0.97)';
    ctx.beginPath(); ctx.ellipse(1, 0, pw, ph, 0, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.3 * light})`;
    ctx.beginPath(); ctx.ellipse(-3.6, -3 * open, 2.7, 2 * open, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.3 * light})`;
    ctx.beginPath(); ctx.ellipse(4.5, 2.6 * open, 1.5, 1.1 * open, 0.4, 0, TAU); ctx.fill();

    ctx.strokeStyle = `rgba(46,33,22,${0.62 * light})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, w, Math.max(h, 0.6), -0.07, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  _whiskers(ctx, light) {
    const spread = lerp(0.5, 1.1, 1 - this.p.earRot * 0.55);
    ctx.save();
    ctx.lineCap = 'round';
    for (const side of [1, -1]) {
      const nn = side > 0 ? 5 : 3;
      for (let i = 0; i < nn; i++) {
        const a = (-0.5 + i * 0.22) * spread * side + noise1(this.t * 0.5 + i * 3.1 + side * 7) * 0.055;
        const len = (side > 0 ? 36 : 24) + i * 3 - Math.abs(i - 2) * 4;
        const ox = 21, oy = 5 + side * 2.5 + i * 0.7;
        ctx.strokeStyle = `rgba(${255*this._W|0},${252*this._W|0},${244*this._W|0},${side > 0 ? 0.62 : 0.24})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.quadraticCurveTo(ox + len * 0.6, oy + Math.sin(a) * len * 0.4,
                             ox + len * 0.95, oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = `rgba(${255*this._W|0},${252*this._W|0},${244*this._W|0},0.34)`;
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(11 - i * 3, -21);
      ctx.quadraticCurveTo(22, -29 - i * 3.5, 31, -31 - i * 4.5); ctx.stroke();
    }
    ctx.restore();
  }

  /* --------------------------------------------------- pontos úteis */
  toWorld(lx, ly) {
    return { x: this.x + lx * this.facing * this.scale, y: this.y + ly * this.scale };
  }
  headWorld() { const H = this._headTransform(); return this.toWorld(H.x, H.y); }
  noseWorld() { const H = this._headTransform(); return this.toWorld(H.x + 34, H.y + 2); }
  bodyWorld() { const s = this.skel.spine[3]; return this.toWorld(s[0], s[1]); }

  hitTest(px, py) {
    const dx = (px - this.x) / this.scale * this.facing, dy = (py - this.y) / this.scale;
    const H = this._headTransform();
    if (Math.hypot(dx - H.x, dy - H.y) < 42) return 'head';
    const sk = this.skel;
    for (let i = 0; i < 6; i++) {
      if (Math.hypot(dx - sk.spine[i][0], dy - sk.spine[i][1]) < sk.radii[i] + 10) {
        return i <= 1 ? 'rump' : i >= 4 ? 'shoulder' : 'back';
      }
    }
    const T = this.tail;
    if (T) for (let i = 4; i < T.length; i += 3) {
      if (Math.hypot(dx - T[i].x, dy - T[i].y) < 16) return 'tail';
    }
    return null;
  }
}

/* ------------------------------------------------------------ helpers */
function catmull(P, j, f) {
  const p0 = P[Math.max(0, j - 1)], p1 = P[j], p2 = P[Math.min(5, j + 1)], p3 = P[Math.min(5, j + 2)];
  const f2 = f * f, f3 = f2 * f;
  return {
    x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * f + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * f2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * f3),
    y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * f + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * f2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * f3),
  };
}
function catmullS(A, j, f) {
  const p0 = A[Math.max(0, j - 1)], p1 = A[j], p2 = A[Math.min(5, j + 1)], p3 = A[Math.min(5, j + 2)];
  const f2 = f * f, f3 = f2 * f;
  return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
}
function catmullTan(P, j, f) {
  const a = catmull(P, j, Math.max(0, f - 0.02));
  const b = catmull(P, j, Math.min(1, f + 0.02));
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

// Desenha uma cadeia de pontos como um sólido que afina — perna, pescoço, rabo.
function tapered(ctx, pts, widths, fill) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = widths[i] / 2;
    left.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w });
    right.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
  }
  ctx.beginPath();
  strokeSpline(ctx, [...left, ...right.reverse()], true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ik2(root, target, l1, l2, prefX) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const raw = Math.hypot(dx, dy) || 1e-4;
  const d = clamp(raw, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.995);
  const ux = dx / raw, uy = dy / raw;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = root.x + ux * a, my = root.y + uy * a;
  // duas soluções; fica a que joga o joelho para o lado certo do corpo
  const s1 = { x: mx - uy * h, y: my + ux * h };
  const s2 = { x: mx + uy * h, y: my - ux * h };
  return (s1.x - root.x) * prefX > (s2.x - root.x) * prefX ? s1 : s2;
}

const tintCache = new Map();
function tint(hex, k) {
  const key = hex + '|' + (Math.round(k * 20) / 20);
  const hit = tintCache.get(key); if (hit) return hit;
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  let out = hex;
  if (m) {
    const n = parseInt(m[1], 16);
    const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0;
    const g = clamp(((n >> 8) & 255) * k, 0, 255) | 0;
    const b = clamp((n & 255) * k, 0, 255) | 0;
    out = `rgb(${r},${g},${b})`;
  }
  tintCache.set(key, out);
  return out;
}
