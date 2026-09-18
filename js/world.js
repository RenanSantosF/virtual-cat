// O cômodo. Espaço de projeto: 1000 x 620, chão em y=470.
// A luz vem do relógio real — a janela é o que amarra o jogo ao seu dia.
import { clamp, lerp, noise1, fbm } from './util.js';

export const ROOM = { w: 1000, h: 620, ground: 470 };

export const SPOTS = {
  litter: 92,
  water: 352,
  bowl: 436,
  window: 200,
  box: 630,
  bed: 800,
  post: 916,
  door: 980,
};

// Cor do céu e intensidade da luz por hora do dia.
export function daylight(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const keys = [
    [0,  '#101a30', '#070c18', 0.40],
    [5,  '#212d48', '#0d1324', 0.45],
    [6.5,'#7a5f6d', '#2a1d2a', 0.62],
    [8,  '#a9c6dd', '#6d7f92', 0.95],
    [13, '#bcd8ea', '#8aa0b0', 1.0],
    [17, '#d8b98a', '#9a7f68', 0.92],
    [18.8,'#c9744f', '#6b3d33', 0.7],
    [20, '#3a2c40', '#181423', 0.52],
    [22, '#16203a', '#090e1c', 0.42],
    [24, '#101a30', '#070c18', 0.40],
  ];
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (h >= keys[i][0] && h <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
  }
  const t = clamp((h - a[0]) / ((b[0] - a[0]) || 1));
  return { sky: mix(a[1], b[1], t), far: mix(a[2], b[2], t), light: lerp(a[3], b[3], t), hour: h };
}

function mix(c1, c2, t) {
  const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
}

export function drawRoom(ctx, env, s, t) {
  const L = env.light;
  const g = ctx.createLinearGradient(0, 0, 0, ROOM.ground);
  g.addColorStop(0, shade('#6a5461', L));
  g.addColorStop(1, shade('#57444f', L));
  ctx.fillStyle = g;
  ctx.fillRect(-400, -900, ROOM.w + 800, ROOM.ground + 900);

  // barra de parede: quebra o vazio de uma tela alta e dá escala ao cômodo
  ctx.fillStyle = shade('#7d6572', L);
  ctx.fillRect(-400, ROOM.ground - 250, ROOM.w + 800, 250);
  ctx.fillStyle = shade('#9a8290', L);
  ctx.fillRect(-400, ROOM.ground - 256, ROOM.w + 800, 8);
  ctx.strokeStyle = `rgba(0,0,0,0.16)`; ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = -300 + i * 60;
    ctx.beginPath(); ctx.moveTo(x, ROOM.ground - 246); ctx.lineTo(x, ROOM.ground - 26); ctx.stroke();
  }
  drawWindow(ctx, env, t);
  drawWallStuff(ctx, env);

  // rodapé e chão de tábuas
  ctx.fillStyle = shade('#4a3b44', L);
  ctx.fillRect(-400, ROOM.ground - 26, ROOM.w + 800, 26);
  const fg = ctx.createLinearGradient(0, ROOM.ground, 0, ROOM.h + 80);
  fg.addColorStop(0, shade('#7d5c3f', L));
  fg.addColorStop(1, shade('#4b3624', L));
  ctx.fillStyle = fg;
  ctx.fillRect(-400, ROOM.ground, ROOM.w + 800, ROOM.h + 900);
  ctx.strokeStyle = `rgba(0,0,0,${0.22})`;
  ctx.lineWidth = 1.5;
  for (let i = -4; i < 26; i++) {
    const y = ROOM.ground + 10 + i * i * 1.6 + i * 6;
    if (y > ROOM.ground + 1000) break;
    ctx.beginPath(); ctx.moveTo(-400, y); ctx.lineTo(ROOM.w + 400, y); ctx.stroke();
  }

  drawRug(ctx, env);
  drawSunbeam(ctx, env, t);
  drawBox(ctx, env);
  drawLitter(ctx, s, L);
  drawBowls(ctx, s, L, t);
  drawBed(ctx, L);
  drawPost(ctx, L);
}

function drawWindow(ctx, env, t) {
  const L = env.light;
  const w = 250, h = 360;
  const x = SPOTS.window - w / 2, y = ROOM.ground - 660;
  ctx.save();
  ctx.fillStyle = shade('#191319', L);
  ctx.fillRect(x - 14, y - 14, w + 28, h + 28);
  ctx.fillStyle = env.sky;
  ctx.fillRect(x, y, w, h);

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // prédios lá fora
  ctx.fillStyle = env.far;
  for (let i = 0; i < 6; i++) {
    const bw = 36 + noise1(i * 3.3) * 30;
    const bx = x - 10 + i * 46;
    const bh = 90 + Math.abs(noise1(i * 7.1)) * 130;
    ctx.fillRect(bx, y + h - bh, bw, bh);
  }
  if (L < 0.5) {
    for (let i = 0; i < 40; i++) {
      if (noise1(i * 9.7) < 0) continue;
      ctx.fillStyle = `rgba(255,214,140,${0.45 + noise1(i * 2.2) * 0.35})`;
      ctx.fillRect(x + 12 + (i % 6) * 46 + (i % 3) * 10, y + h - 130 + Math.floor(i / 6) * 18, 6, 8);
    }
    ctx.fillStyle = 'rgba(240,238,225,0.9)';
    ctx.beginPath(); ctx.arc(x + w - 58, y + 62, 18, 0, 7); ctx.fill();
    for (let i = 0; i < 14; i++) {
      const sx = x + 14 + ((i * 71) % (w - 28)), sy = y + 16 + ((i * 43) % 130);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.abs(noise1(i * 4 + t * 0.4)) * 0.5})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
  } else {
    const sunY = y + h * clamp(1 - (env.hour - 6) / 13, 0.08, 0.85);
    const sg = ctx.createRadialGradient(x + w - 70, sunY, 6, x + w - 70, sunY, 90);
    sg.addColorStop(0, 'rgba(255,246,214,0.95)');
    sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(x + w - 70, sunY, 90, 0, 7); ctx.fill();
  }
  // um pássaro cruza de vez em quando — é o que faz o gato chilrear
  const bt = (t * 0.045) % 1;
  if (bt < 0.2) {
    const bx = x - 24 + bt / 0.2 * (w + 48);
    const by = y + 70 + Math.sin(bt * 26) * 20;
    ctx.strokeStyle = 'rgba(28,22,18,0.85)'; ctx.lineWidth = 2.4;
    const flap = Math.sin(t * 13) * 7;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by + flap); ctx.lineTo(bx, by); ctx.lineTo(bx + 8, by + flap);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = shade('#120e12', L); ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h * 0.42); ctx.lineTo(x + w, y + h * 0.42);
  ctx.stroke();
  ctx.strokeRect(x, y, w, h);
  // peitoril
  ctx.fillStyle = shade('#2c2229', L);
  ctx.fillRect(x - 26, y + h + 12, w + 52, 16);
  ctx.restore();
}

function drawWallStuff(ctx, env) {
  const L = env.light;
  // prateleira com planta
  const sx = SPOTS.bed, sy = ROOM.ground - 430;
  ctx.save();
  ctx.fillStyle = shade('#5b4535', L);
  ctx.fillRect(sx - 90, sy, 180, 12);
  ctx.fillStyle = shade('#3d5340', L);
  for (let i = 0; i < 9; i++) {
    const a = -1.9 + i * 0.42;
    ctx.beginPath();
    ctx.moveTo(sx + 30, sy);
    ctx.quadraticCurveTo(sx + 30 + Math.cos(a) * 40, sy + Math.sin(a) * 46,
                         sx + 30 + Math.cos(a) * 62, sy + Math.sin(a) * 30 + 14);
    ctx.quadraticCurveTo(sx + 32 + Math.cos(a) * 34, sy + Math.sin(a) * 30, sx + 30, sy);
    ctx.fill();
  }
  ctx.fillStyle = shade('#8a5a44', L);
  ctx.fillRect(sx + 14, sy - 34, 32, 34);

  // quadro
  const px = SPOTS.litter + 40, py = ROOM.ground - 440;
  ctx.fillStyle = shade('#6b563f', L);
  ctx.fillRect(px - 52, py, 104, 82);
  ctx.fillStyle = shade('#98867a', L);
  ctx.fillRect(px - 44, py + 8, 88, 66);
  ctx.fillStyle = shade('#5f6d78', L);
  ctx.beginPath();
  ctx.moveTo(px - 44, py + 60); ctx.lineTo(px - 12, py + 26);
  ctx.lineTo(px + 12, py + 52); ctx.lineTo(px + 44, py + 22);
  ctx.lineTo(px + 44, py + 74); ctx.lineTo(px - 44, py + 74);
  ctx.fill();
  // relógio de parede: o jogo roda no seu horário, e isso fica visível
  const cx = SPOTS.box - 40, cy = ROOM.ground - 400, r = 34;
  ctx.fillStyle = shade('#e8e2d6', L);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = shade('#3a2f33', L); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  const now = new Date();
  const hA = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const mA = now.getMinutes() / 60 * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = shade('#2a2226', L); ctx.lineCap = 'round';
  ctx.lineWidth = 4; ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(hA) * r * 0.5, cy + Math.sin(hA) * r * 0.5); ctx.stroke();
  ctx.lineWidth = 2.6; ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(mA) * r * 0.78, cy + Math.sin(mA) * r * 0.78); ctx.stroke();
  ctx.restore();
}

function drawRug(ctx, env) {
  const L = env.light;
  ctx.save();
  ctx.fillStyle = shade('#6d4a4f', L);
  ctx.beginPath();
  ctx.ellipse(SPOTS.window + 120, ROOM.ground + 46, 250, 42, 0, 0, 7);
  ctx.fill();
  ctx.strokeStyle = shade('#8a6167', L); ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(SPOTS.window + 120, ROOM.ground + 46, 210, 32, 0, 0, 7);
  ctx.stroke();
  ctx.restore();
}

function drawBox(ctx, env) {
  const L = env.light;
  const x = SPOTS.box, y = ROOM.ground;
  ctx.save();
  ctx.fillStyle = shade('#a67f4f', L);
  ctx.beginPath();
  ctx.moveTo(x - 78, y); ctx.lineTo(x - 70, y - 86);
  ctx.lineTo(x + 70, y - 86); ctx.lineTo(x + 78, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade('#7d5c36', L);
  ctx.beginPath();
  ctx.moveTo(x - 70, y - 86); ctx.lineTo(x - 60, y - 96);
  ctx.lineTo(x + 60, y - 96); ctx.lineTo(x + 70, y - 86);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(80,58,32,0.45)`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 86); ctx.lineTo(x, y); ctx.stroke();
  ctx.restore();
}

function drawSunbeam(ctx, env, t) {
  if (env.light < 0.55) return;
  const a = (env.light - 0.55) * 0.5;
  const cx = SPOTS.window + 60;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(SPOTS.window, ROOM.ground - 640, cx + 80, ROOM.ground + 40);
  g.addColorStop(0, `rgba(255,236,190,${a * 0.5})`);
  g.addColorStop(1, `rgba(255,226,170,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(SPOTS.window - 120, ROOM.ground - 650); ctx.lineTo(SPOTS.window + 120, ROOM.ground - 650);
  ctx.lineTo(cx + 210, ROOM.ground + 60); ctx.lineTo(cx - 40, ROOM.ground + 60);
  ctx.closePath(); ctx.fill();
  // poeira no facho
  for (let i = 0; i < 26; i++) {
    const p = (i * 0.137 + t * 0.012) % 1;
    const px = lerp(SPOTS.window - 70, cx + 150, p) + fbm(i * 3 + t * 0.2) * 30;
    const py = lerp(ROOM.ground - 620, ROOM.ground + 30, p) + fbm(i * 7 + t * 0.15) * 24;
    ctx.fillStyle = `rgba(255,244,214,${a * (0.5 + noise1(i * 5) * 0.4)})`;
    ctx.beginPath(); ctx.arc(px, py, 1.4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

export function drawLitter(ctx, s, L) {
  const x = SPOTS.litter, y = ROOM.ground;
  ctx.save();
  ctx.fillStyle = shade('#4b4a52', L);
  ctx.beginPath();
  ctx.moveTo(x - 66, y); ctx.lineTo(x - 58, y - 52);
  ctx.lineTo(x + 58, y - 52); ctx.lineTo(x + 66, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade('#c9bda6', L);
  ctx.fillRect(x - 55, y - 42, 110, 30);
  // grãos e sujeira acumulada
  const soil = s.litter.soil;
  for (let i = 0; i < 60; i++) {
    const gx = x - 52 + (i * 37 % 104);
    const gy = y - 40 + (i * 17 % 26);
    ctx.fillStyle = `rgba(${lerp(190, 120, soil) | 0},${lerp(180, 105, soil) | 0},${lerp(158, 88, soil) | 0},0.9)`;
    ctx.fillRect(gx, gy, 3, 3);
  }
  for (let i = 0; i < Math.round(soil * 9); i++) {
    ctx.fillStyle = `rgba(90,70,48,0.95)`;
    ctx.beginPath();
    ctx.ellipse(x - 44 + (i * 29 % 92), y - 34 + (i * 13 % 20), 7, 4.5, i, 0, 7);
    ctx.fill();
  }
  ctx.strokeStyle = shade('#3a3941', L); ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 66, y); ctx.lineTo(x - 58, y - 52);
  ctx.lineTo(x + 58, y - 52); ctx.lineTo(x + 66, y);
  ctx.stroke();
  if (soil > 0.75) {
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(150,180,120,${0.25 - i * 0.06})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 20 + i * 12, y - 72 - i * 16, 8 + i * 5, 0.6, 2.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBowls(ctx, s, L, t) {
  bowl(ctx, SPOTS.water, L, '#8fa6b8');
  const q = clamp(s.water.amount);
  if (q > 0.04) {
    const age = clamp((Date.now() - s.water.filledAt) / 3600000 / 20);
    ctx.fillStyle = `rgba(${lerp(150,150,age)|0},${lerp(200,190,age)|0},${lerp(225,175,age)|0},${0.8 - age * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(SPOTS.water, ROOM.ground - 13 + (1 - q) * 5, 27 * q + 6, (7 * q + 2) + Math.sin(t * 1.4) * 0.4, 0, 0, 7);
    ctx.fill();
  }
  bowl(ctx, SPOTS.bowl, L, '#c08a6a');
  if (s.bowl.type && s.bowl.amount > 0) {
    const spoiled = (Date.now() - s.bowl.filledAt) / 3600000 > (s.bowl.type === 'wet' ? 2.5 : 999);
    const col = s.bowl.type === 'dry' ? '#6b4a2c' : s.bowl.type === 'wet' ? '#a5643f' : '#d1926a';
    ctx.fillStyle = spoiled ? '#6e6244' : col;
    const n = Math.round(s.bowl.amount * 16) + 3;
    for (let i = 0; i < n; i++) {
      const a = i * 2.399;
      const r = Math.sqrt(i / n) * 24 * clamp(s.bowl.amount + 0.35);
      ctx.beginPath();
      ctx.arc(SPOTS.bowl + Math.cos(a) * r, ROOM.ground - 15 + Math.sin(a) * r * 0.3, 4.2, 0, 7);
      ctx.fill();
    }
    if (spoiled) {
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = `rgba(150,170,110,${0.3 - i * 0.1})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(SPOTS.bowl + 8 + i * 10, ROOM.ground - 40 - i * 14, 7 + i * 4, 0.6, 2.6); ctx.stroke();
      }
    }
  }
}

function bowl(ctx, x, L, col) {
  const y = ROOM.ground;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,0.3)`;
  ctx.beginPath(); ctx.ellipse(x, y - 1, 42, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = shade(col, L * 0.8);
  ctx.beginPath();
  ctx.moveTo(x - 38, y - 26); ctx.quadraticCurveTo(x, y + 4, x + 38, y - 26);
  ctx.quadraticCurveTo(x, y - 40, x - 38, y - 26);
  ctx.fill();
  ctx.fillStyle = shade(col, L * 0.55);
  ctx.beginPath(); ctx.ellipse(x, y - 26, 33, 8.5, 0, 0, 7); ctx.fill();
  ctx.restore();
}

// A caminha é desenhada em duas partes: o fundo antes do gato e a borda
// depois, para ele ficar DENTRO dela e não em cima.
function drawBed(ctx, L) {
  const x = SPOTS.bed, y = ROOM.ground;
  ctx.save();
  ctx.fillStyle = shade('#7d5a63', L);
  ctx.beginPath(); ctx.ellipse(x, y - 22, 92, 30, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = shade('#5a4048', L);
  ctx.beginPath(); ctx.ellipse(x, y - 18, 72, 20, 0, 0, 7); ctx.fill();
  ctx.restore();
}

export function drawBedFront(ctx, env) {
  const L = env.light, x = SPOTS.bed, y = ROOM.ground;
  ctx.save();
  ctx.fillStyle = shade('#8f6a73', L);
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 92, 26, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = shade('#6d4e57', L);
  ctx.beginPath();
  ctx.ellipse(x, y - 16, 72, 15, 0, 0, Math.PI); ctx.fill();
  ctx.restore();
}

function drawPost(ctx, L) {
  const x = SPOTS.post, y = ROOM.ground;
  ctx.save();
  ctx.fillStyle = shade('#5a4a3c', L);
  ctx.fillRect(x - 34, y - 12, 68, 12);
  ctx.fillStyle = shade('#b79b74', L);
  ctx.fillRect(x - 15, y - 150, 30, 138);
  ctx.strokeStyle = `rgba(90,70,45,0.35)`; ctx.lineWidth = 1.4;
  for (let i = 0; i < 34; i++) {
    ctx.beginPath(); ctx.moveTo(x - 15, y - 148 + i * 4); ctx.lineTo(x + 15, y - 146 + i * 4); ctx.stroke();
  }
  ctx.fillStyle = shade('#5a4a3c', L);
  ctx.fillRect(x - 26, y - 162, 52, 14);
  ctx.restore();
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * (0.35 + k * 0.72), 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * (0.35 + k * 0.7), 0, 255) | 0;
  const b = clamp((n & 255) * (0.4 + k * 0.68), 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
