// Kindlekin scenes — 2.5D backdrops drawn with Canvas 2D.
//
//   drawGarden(ctx, w, h, t)             warm, cosy hub
//   drawDungeon(ctx, w, h, t, floor)     grim torch-lit corridor, floor = 1 | 2 | 3
//   groundToScreen(u, v, w, h, view)     ground-plane -> screen
//       u: 0..1 across (left -> right), v: 0..1 depth (0 = nearest the camera, 1 = far)
//       view: 'garden' | 'dungeon'
//       returns { x, y, scale, depth }   scale is ready to pass to drawCreature
//                                         (already includes canvas-size + perspective)
//   Draw order for sprites: sort by v descending (far first), i.e. by screen y ascending.
//   GARDEN_SPOTS / DUNGEON_SPOTS hold suggested standing places that avoid props.

import { pal } from './sprites.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (i) => { const x = Math.sin(i * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x); };
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k, al = 1) => {
  const A = rgb(a), Bc = rgb(b);
  return `rgba(${Math.round(lerp(A[0], Bc[0], k))},${Math.round(lerp(A[1], Bc[1], k))},${Math.round(lerp(A[2], Bc[2], k))},${al})`;
};

export const VIEWS = {
  garden: { horizon: 0.44, zFar: 2.6, spread: 1.3, near: 0.93, unit: 330 },
  dungeon: { horizon: 0.43, zFar: 2.3, spread: 0.9, near: 0.95, unit: 430 },
};
export function groundToScreen(u, v, w, h, view = 'garden') {
  const V = typeof view === 'string' ? VIEWS[view] || VIEWS.garden : view;
  const hy = h * V.horizon;
  const z = 1 + Math.max(v, -0.3) * (V.zFar - 1);
  const s = 1 / z;
  const base = Math.min(h, w * 0.8) / V.unit;
  return { x: w / 2 + (u - 0.5) * w * V.spread * s, y: hy + (h - hy) * V.near * s, scale: s * base, depth: s };
}
/** Good places to stand (u, v) that are clear of the pond, tree and hut. */
export const GARDEN_SPOTS = [
  { u: 0.3, v: 0.12 }, { u: 0.52, v: 0.36 }, { u: 0.14, v: 0.42 }, { u: 0.4, v: 0.7 }, { u: 0.62, v: 0.9 }, { u: 0.78, v: 0.04 },
];
export const DUNGEON_SPOTS = {
  party: [{ u: 0.33, v: 0.1 }, { u: 0.2, v: 0.38 }, { u: 0.36, v: 0.7 }],
  enemies: [{ u: 0.68, v: 0.1 }, { u: 0.8, v: 0.4 }, { u: 0.66, v: 0.72 }],
  boss: { u: 0.76, v: 0.45 },
};

function blobCluster(c, circles, P, d, lw) {
  const path = (ox = 0, oy = 0) => { c.beginPath(); for (const [x, y, r] of circles) { c.moveTo(x + ox + r, y + oy); c.arc(x + ox, y + oy, r, 0, TAU); } };
  path(); c.strokeStyle = P.ol; c.lineWidth = lw * 2; c.lineJoin = 'round'; c.stroke();
  c.save(); path(); c.fillStyle = P.s2; c.fill(); c.clip();
  path(-d * 0.45, -d); c.fillStyle = P.s1; c.fill();
  path(-d * 0.9, -d * 2); c.fillStyle = P.b; c.fill();
  c.restore();
}
function softGlow(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}

// =====================================================================
//  GARDEN
// =====================================================================
const GP = {
  leaf: pal('#6fc85a'), leafHi: pal('#9be06a'), trunk: pal('#9a6a44'), fruit: pal('#ff8f6b'),
  stone: pal('#d9cdb8'), straw: pal('#f0c878'), wood: pal('#b58256'), bush: pal('#58b058'), roof: pal('#e9785a'),
};
const POND = { u: 0.74, v: 0.42, ru: 0.19, rv: 0.27 };

export function drawGarden(ctx, w, h, t = 0) {
  const c = ctx, V = VIEWS.garden, hy = h * V.horizon;
  const G = (u, v) => groundToScreen(u, v, w, h, 'garden');
  c.save();
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.lineJoin = 'round'; c.lineCap = 'round';

  // ---- sky
  let g = c.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, '#6fc1ee'); g.addColorStop(0.55, '#bfe6f3'); g.addColorStop(1, '#ffeccb');
  c.fillStyle = g; c.fillRect(0, 0, w, hy + 2);
  const sunX = w * 0.16, sunY = hy * 0.3, sr = Math.min(w, h) * 0.07;
  softGlow(c, sunX, sunY, sr * 6, '#fff2b0', 0.75);
  c.fillStyle = '#fffbe6'; c.beginPath(); c.arc(sunX, sunY, sr, 0, TAU); c.fill();
  // clouds
  const cs = Math.min(w, h * 1.4) / 900;
  for (let i = 0; i < 5; i++) {
    const span = w + 400 * cs;
    const cx = ((rnd(i) * span + t * (6 + i * 2) * cs) % span) - 200 * cs, cy = hy * (0.14 + rnd(i + 9) * 0.5), k = cs * (0.7 + rnd(i + 4) * 0.7);
    const puffs = [[0, 0, 34], [-38, 8, 24], [36, 8, 26], [-12, -16, 26], [18, -18, 24], [62, 14, 16], [-62, 14, 14]];
    c.save(); c.beginPath(); c.rect(cx - 120 * k, cy - 80 * k, 240 * k, 104 * k); c.clip();   // flat cloud base
    c.fillStyle = '#f4c9b0'; c.globalAlpha = 0.75;
    c.beginPath(); for (const [x, y, r] of puffs) { c.moveTo(cx + x * k + r * k, cy + y * k + 5 * k); c.arc(cx + x * k, cy + y * k + 5 * k, r * k, 0, TAU); } c.fill();
    c.fillStyle = '#ffffff'; c.globalAlpha = 0.95;
    c.beginPath(); for (const [x, y, r] of puffs) { c.moveTo(cx + x * k + r * k, cy + y * k); c.arc(cx + x * k, cy + y * k, r * k * 0.94, 0, TAU); } c.fill();
    c.globalAlpha = 1; c.restore();
  }
  // far hills
  const hill = (base, amp, f, ph, col) => {
    c.beginPath(); c.moveTo(0, hy + 4);
    for (let x = 0; x <= w; x += 8) c.lineTo(x, hy - base * h - (Math.sin(x / w * f + ph) * 0.5 + 0.5) * amp * h - Math.sin(x / w * f * 2.7 + ph * 2) * amp * h * 0.18);
    c.lineTo(w, hy + 4); c.closePath(); c.fillStyle = col; c.fill();
  };
  hill(0.03, 0.11, 5.2, 0.6, '#a9d8c8');
  hill(0.012, 0.075, 7.5, 2.4, '#8fcf9a');
  hill(0.0, 0.04, 11, 4.2, '#84c876');

  // ---- ground
  g = c.createLinearGradient(0, hy, 0, h);
  g.addColorStop(0, '#c3e67c'); g.addColorStop(0.35, '#8fd35e'); g.addColorStop(1, '#58b450');
  c.fillStyle = g; c.fillRect(0, hy, w, h - hy);
  // mown stripes in perspective
  for (let i = 0; i < 26; i += 2) {
    const z0 = 0.86 + i * 0.22, z1 = z0 + 0.22;
    const y0 = hy + (h - hy) * V.near / z0, y1 = hy + (h - hy) * V.near / z1;
    c.fillStyle = `rgba(255,255,190,${0.13 * Math.min(1, 2.4 / z0)})`;
    c.fillRect(0, y1, w, y0 - y1);
  }
  softGlow(c, w * 0.3, hy + (h - hy) * 0.45, w * 0.5, '#fff6a8', 0.22);

  // ---- back fence + bushes
  const fv = 1.5;
  for (let i = 0; i < 16; i++) {
    const p = G(-1.1 + i * 0.22 + rnd(i) * 0.05, fv + 0.25), r = (34 + rnd(i + 3) * 26) * p.scale;
    c.save(); c.translate(p.x, p.y);
    blobCluster(c, [[0, -r * 0.6, r], [-r * 0.9, -r * 0.3, r * 0.7], [r * 0.9, -r * 0.35, r * 0.75]], GP.bush, r * 0.18, 1.6 * p.scale + 0.6);
    c.restore();
  }
  for (let i = 0; i < 30; i++) {
    const p = G(-1.2 + i * 0.115, fv), s = p.scale, ph = 44 * s;
    c.fillStyle = GP.wood.ol; c.fillRect(p.x - 5 * s - 1, p.y - ph - 1, 10 * s + 2, ph + 2);
    c.fillStyle = GP.wood.b; c.fillRect(p.x - 5 * s, p.y - ph, 10 * s, ph);
    c.fillStyle = GP.wood.s1; c.fillRect(p.x + 1 * s, p.y - ph, 4 * s, ph);
    if (i < 29) {
      const q = G(-1.2 + (i + 1) * 0.115, fv);
      for (const ry of [0.72, 0.36]) {
        c.fillStyle = GP.wood.ol; c.fillRect(p.x, p.y - ph * ry - 3 * s - 1, q.x - p.x, 6 * s + 2);
        c.fillStyle = GP.wood.hi; c.fillRect(p.x, p.y - ph * ry - 3 * s, q.x - p.x, 6 * s);
        c.fillStyle = GP.wood.b; c.fillRect(p.x, p.y - ph * ry, q.x - p.x, 3 * s);
      }
    }
  }

  // ---- nest hut (back right)
  {
    const p = G(0.93, 1.08), s = p.scale;
    c.save(); c.translate(p.x, p.y); c.scale(s, s);
    c.fillStyle = 'rgba(30,60,40,0.25)'; c.beginPath(); c.ellipse(10, 0, 120, 20, 0, 0, TAU); c.fill();
    const dome = (ox, oy) => { c.beginPath(); c.moveTo(-95 + ox, 0 + oy); c.bezierCurveTo(-95 + ox, -150 + oy, 95 + ox, -150 + oy, 95 + ox, 0 + oy); c.closePath(); };
    dome(0, 0); c.strokeStyle = GP.straw.ol; c.lineWidth = 6; c.stroke();
    c.save(); dome(0, 0); c.fillStyle = GP.straw.s2; c.fill(); c.clip();
    dome(-6, -10); c.fillStyle = GP.straw.s1; c.fill(); dome(-14, -22); c.fillStyle = GP.straw.b; c.fill();
    c.strokeStyle = 'rgba(160,110,50,0.5)'; c.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, 0, 95 - i * 3, 28 + i * 28, 0, Math.PI, TAU); c.stroke(); }
    c.restore();
    // roof cap
    c.beginPath(); c.moveTo(-62, -92); c.quadraticCurveTo(0, -168, 62, -92); c.quadraticCurveTo(0, -112, -62, -92); c.closePath();
    c.fillStyle = GP.roof.b; c.fill(); c.strokeStyle = GP.roof.ol; c.lineWidth = 4; c.stroke();
    c.beginPath(); c.moveTo(-30, -112); c.quadraticCurveTo(-4, -146, 20, -136); c.strokeStyle = GP.roof.hi; c.lineWidth = 3; c.stroke();
    // door with warm light
    c.beginPath(); c.moveTo(-28, 0); c.lineTo(-28, -40); c.quadraticCurveTo(0, -78, 28, -40); c.lineTo(28, 0); c.closePath();
    const dg = c.createLinearGradient(0, -70, 0, 0); dg.addColorStop(0, '#ffe08a'); dg.addColorStop(1, '#ff9d4a');
    c.fillStyle = dg; c.fill(); c.strokeStyle = GP.wood.ol; c.lineWidth = 5; c.stroke();
    softGlow(c, 0, -30, 80, '#ffd27a', 0.45 + 0.08 * Math.sin(t * 2.2));
    // flag
    c.strokeStyle = GP.wood.ol; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -128); c.lineTo(0, -176); c.stroke();
    c.beginPath(); c.moveTo(0, -176); c.quadraticCurveTo(16, -180 + Math.sin(t * 3) * 3, 30, -168); c.quadraticCurveTo(16, -164, 0, -160); c.closePath();
    c.fillStyle = '#ffd45a'; c.fill(); c.lineWidth = 2.5; c.stroke();
    c.restore();
  }

  // ---- fruit tree (back left)
  {
    const p = G(0.13, 0.98), s = p.scale * 1.25;
    c.save(); c.translate(p.x, p.y); c.scale(s, s);
    c.fillStyle = 'rgba(20,70,40,0.28)'; c.beginPath(); c.ellipse(20, 2, 150, 26, 0, 0, TAU); c.fill();
    const sway = Math.sin(t * 0.9) * 0.012;
    c.rotate(sway);
    // trunk
    const trunk = (ox = 0) => { c.beginPath(); c.moveTo(-30 + ox, 0); c.quadraticCurveTo(-14 + ox, -50, -18 + ox, -130); c.lineTo(-52 + ox, -178); c.lineTo(-36 + ox, -186); c.lineTo(-4 + ox, -150); c.lineTo(22 + ox, -192); c.lineTo(38 + ox, -182); c.lineTo(18 + ox, -128); c.quadraticCurveTo(16 + ox, -50, 34 + ox, 0); c.closePath(); };
    trunk(); c.strokeStyle = GP.trunk.ol; c.lineWidth = 7; c.stroke();
    c.save(); trunk(); c.fillStyle = GP.trunk.s2; c.fill(); c.clip();
    trunk(-8); c.fillStyle = GP.trunk.s1; c.fill(); trunk(-18); c.fillStyle = GP.trunk.b; c.fill();
    c.restore();
    // canopy
    const can = [[0, -262, 82], [-84, -222, 62], [86, -226, 66], [-40, -312, 58], [46, -316, 60], [-120, -180, 40], [126, -184, 42], [0, -200, 60]];
    blobCluster(c, can, GP.leaf, 13, 3.5);
    c.fillStyle = GP.leafHi.b; c.globalAlpha = 0.9;
    for (const [x, y, r] of [[-56, -330, 24], [20, -340, 30], [-104, -246, 22], [70, -262, 26], [-20, -280, 26]]) {
      c.beginPath(); c.ellipse(x, y, r, r * 0.6, -0.3, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    // glowing fruit
    const fr = [[-92, -196, 0], [-36, -236, 1], [34, -214, 2], [96, -200, 3], [62, -286, 4], [-64, -290, 5], [4, -322, 6]];
    for (const [x, y, i] of fr) {
      const sw = Math.sin(t * 1.6 + i * 1.3) * 2.5;
      softGlow(c, x + sw, y + 10, 30, '#ffc27a', 0.5);
      c.strokeStyle = GP.trunk.ol; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + sw, y + 2); c.stroke();
      c.beginPath(); c.arc(x + sw, y + 12, 12.5, 0, TAU); c.fillStyle = GP.fruit.s1; c.fill();
      c.beginPath(); c.arc(x + sw - 1.6, y + 10.4, 10.6, 0, TAU); c.fillStyle = GP.fruit.b; c.fill();
      c.beginPath(); c.arc(x + sw, y + 12, 12.5, 0, TAU); c.strokeStyle = GP.fruit.ol; c.lineWidth = 2.6; c.stroke();
      c.fillStyle = '#fff'; c.globalAlpha = 0.85; c.beginPath(); c.ellipse(x + sw - 4.5, y + 7, 3.4, 2.2, -0.6, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
    c.restore();
  }

  // ---- pond
  {
    const ring = (k, dv = 0) => { c.beginPath(); for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU, p = G(POND.u + Math.cos(a) * POND.ru * k, POND.v + dv + Math.sin(a) * POND.rv * k); c[i ? 'lineTo' : 'moveTo'](p.x, p.y); } c.closePath(); };
    const pc = G(POND.u, POND.v), pn = G(POND.u, POND.v - POND.rv), pf = G(POND.u, POND.v + POND.rv);
    ring(1.16); c.fillStyle = '#4c9f48'; c.fill();
    ring(1.09); c.fillStyle = '#e8d6a0'; c.fill();
    ring(1.0, 0.012); c.fillStyle = '#b89a66'; c.fill();
    ring(1.0);
    g = c.createLinearGradient(0, pf.y, 0, pn.y);
    g.addColorStop(0, '#bff0f4'); g.addColorStop(0.4, '#6fd0ea'); g.addColorStop(1, '#3f9fdc');
    c.fillStyle = g; c.fill();
    c.save(); ring(1.0); c.clip();
    // sky reflection streaks + ripples
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 5; i++) {
      const p = G(POND.u - 0.1 + rnd(i + 20) * 0.2 + Math.sin(t * 0.5 + i) * 0.01, POND.v - 0.18 + i * 0.09);
      c.beginPath(); c.ellipse(p.x, p.y, (30 + rnd(i) * 40) * p.scale, 2.6 * p.scale, 0, 0, TAU); c.fill();
    }
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.22 + i / 3) % 1, p = G(POND.u - 0.04 + i * 0.05, POND.v - 0.05 + i * 0.07);
      c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; c.lineWidth = 2 * p.scale;
      c.beginPath(); c.ellipse(p.x, p.y, (10 + k * 60) * p.scale, (10 + k * 60) * p.scale * 0.3, 0, 0, TAU); c.stroke();
    }
    c.restore();
    ring(1.0); c.strokeStyle = '#2b6a9a'; c.lineWidth = 2.5 * pc.scale; c.stroke();
    // lily pads + lotus
    const pads = [[-0.09, 0.12, 20], [0.06, 0.14, 15], [0.1, -0.08, 17], [-0.04, -0.14, 13]];
    pads.forEach(([du, dv, r], i) => {
      const p = G(POND.u + du + Math.sin(t * 0.6 + i) * 0.004, POND.v + dv), rr = r * p.scale;
      c.beginPath(); c.moveTo(p.x, p.y); c.ellipse(p.x, p.y, rr, rr * 0.36, 0, 0.5 + i, 0.5 + i + TAU * 0.9); c.closePath();
      c.fillStyle = '#5fbf5a'; c.fill(); c.strokeStyle = '#2f7a44'; c.lineWidth = 1.6 * p.scale; c.stroke();
      if (i === 0) {
        for (let k = -2; k <= 2; k++) {
          c.beginPath(); c.ellipse(p.x + k * rr * 0.22, p.y - rr * 0.34, rr * 0.2, rr * 0.5, k * 0.35, 0, TAU);
          c.fillStyle = k % 2 ? '#ffd0e2' : '#ff9cc2'; c.fill(); c.strokeStyle = '#b84a80'; c.lineWidth = 1.2 * p.scale; c.stroke();
        }
      }
    });
    // stones on the bank
    for (let i = 0; i < 9; i++) {
      const a = 0.3 + i * 0.72 + rnd(i) * 0.2, p = G(POND.u + Math.cos(a) * POND.ru * 1.1, POND.v + Math.sin(a) * POND.rv * 1.1), r = (9 + rnd(i + 5) * 8) * p.scale;
      c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.62, 0, 0, TAU); c.fillStyle = GP.stone.s1; c.fill();
      c.beginPath(); c.ellipse(p.x - r * 0.12, p.y - r * 0.14, r * 0.82, r * 0.44, 0, 0, TAU); c.fillStyle = GP.stone.b; c.fill();
      c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.62, 0, 0, TAU); c.strokeStyle = GP.stone.ol; c.lineWidth = 1.8 * p.scale; c.stroke();
    }
    // reeds at the far bank
    for (let i = 0; i < 6; i++) {
      const p = G(POND.u + 0.1 + i * 0.022, POND.v + POND.rv * (0.92 - Math.abs(i - 2) * 0.05)), s = p.scale, sw = Math.sin(t * 1.4 + i) * 4 * s, hh = (46 + rnd(i) * 26) * s;
      c.strokeStyle = '#2f7a44'; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x, p.y - hh * 0.6, p.x + sw, p.y - hh); c.stroke();
      if (i % 2 === 0) { c.fillStyle = '#8a5a3a'; c.beginPath(); c.ellipse(p.x + sw, p.y - hh, 3.4 * s, 9 * s, 0, 0, TAU); c.fill(); }
    }
  }

  // ---- stepping stones
  const steps = [[0.5, -0.06], [0.44, 0.1], [0.47, 0.28], [0.42, 0.46], [0.36, 0.66], [0.28, 0.86]];
  steps.forEach(([u, v], i) => {
    const p = G(u, v), r = (30 + rnd(i) * 8) * p.scale;
    c.beginPath(); c.ellipse(p.x, p.y + r * 0.1, r, r * 0.36, 0, 0, TAU); c.fillStyle = GP.stone.s2; c.fill();
    c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.34, 0, 0, TAU); c.fillStyle = GP.stone.b; c.fill(); c.strokeStyle = GP.stone.ol; c.lineWidth = 1.8 * p.scale; c.stroke();
    c.beginPath(); c.ellipse(p.x - r * 0.2, p.y - r * 0.08, r * 0.5, r * 0.12, 0, 0, TAU); c.fillStyle = GP.stone.hi; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
  });

  // ---- grass tufts + flowers (far to near)
  const items = [];
  for (let i = 0; i < 90; i++) {
    const u = -0.25 + rnd(i * 3) * 1.5, v = -0.1 + rnd(i * 3 + 1) * 1.45;
    const du = (u - POND.u) / (POND.ru * 1.2), dv = (v - POND.v) / (POND.rv * 1.2);
    if (du * du + dv * dv < 1) continue;
    items.push({ u, v, i, flower: i % 3 === 0 });
  }
  items.sort((a, b) => b.v - a.v);
  const fcol = ['#fff6f0', '#ffd45a', '#ff9cc2', '#c9a8ff'];
  for (const it of items) {
    const p = G(it.u, it.v), s = p.scale, sw = Math.sin(t * 1.7 + it.i) * 2.5 * s;
    c.strokeStyle = it.i % 2 ? '#3f9a48' : '#4aa84e'; c.lineWidth = 2.6 * s;
    for (let k = -1; k <= 1; k++) {
      c.beginPath(); c.moveTo(p.x + k * 3 * s, p.y); c.quadraticCurveTo(p.x + k * 5 * s, p.y - 8 * s, p.x + k * 9 * s + sw, p.y - (14 - Math.abs(k) * 4) * s); c.stroke();
    }
    if (it.flower) {
      const fx = p.x + 12 * s + sw * 0.6, fy = p.y - 13 * s;
      c.strokeStyle = '#3f9a48'; c.lineWidth = 1.8 * s; c.beginPath(); c.moveTo(p.x + 11 * s, p.y); c.lineTo(fx, fy); c.stroke();
      c.fillStyle = fcol[it.i % 4];
      for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(fx + Math.cos(k * 1.257) * 3.6 * s, fy + Math.sin(k * 1.257) * 3.6 * s, 2.9 * s, 0, TAU); c.fill(); }
      c.fillStyle = it.i % 4 === 1 ? '#ff8f3d' : '#ffd45a'; c.beginPath(); c.arc(fx, fy, 2.2 * s, 0, TAU); c.fill();
    }
  }

  // ---- drifting petals + sparkles
  for (let i = 0; i < 16; i++) {
    const k = (t * (0.035 + rnd(i) * 0.03) + rnd(i + 7)) % 1;
    const x = (rnd(i + 2) * 1.3 - 0.1 + k * 0.25) * w + Math.sin(t * 1.3 + i) * 12, y = k * h * 1.05 - 10, r = (3 + rnd(i) * 3) * Math.min(w, h) / 500;
    c.save(); c.translate(x, y); c.rotate(t * (0.8 + rnd(i)) + i);
    c.fillStyle = i % 3 ? '#ffc4dc' : '#fff1f6'; c.globalAlpha = 0.85;
    c.beginPath(); c.ellipse(0, 0, r * 1.5, r * 0.8, 0, 0, TAU); c.fill(); c.restore();
  }
  for (let i = 0; i < 8; i++) {
    const p = G(POND.u - 0.2 + rnd(i + 30) * 0.4, POND.v - 0.2 + rnd(i + 40) * 0.5);
    const a = Math.max(0, Math.sin(t * 1.4 + i * 2.1));
    softGlow(c, p.x + Math.sin(t * 0.7 + i) * 14, p.y - (30 + rnd(i) * 70) * p.scale + Math.cos(t * 0.9 + i) * 8, 9 * p.scale, '#fff8b0', a * 0.9);
  }
  // warm light wash + soft vignette
  g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,224,140,0.20)'); g.addColorStop(0.5, 'rgba(255,224,140,0)'); g.addColorStop(1, 'rgba(60,40,110,0.16)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.restore();
}

// =====================================================================
//  DUNGEON
// =====================================================================
const FLOORS = {
  1: { name: 'Mossed Catacomb', bg: '#07090d', stoneN: '#5b6672', stoneF: '#141a22', floorN: '#6b7078', floorF: '#11161d', pillar: '#7a8590', fire: ['#ff6a2a', '#ffb53a', '#fff2a8'], light: '#ffa850', accent: '#6f9a4e', end: '#1b3140', fog: '#20303a' },
  2: { name: 'Drowned Cloister', bg: '#06061a', stoneN: '#575088', stoneF: '#100e28', floorN: '#5f5a92', floorF: '#0d0c22', pillar: '#766fb0', fire: ['#1fb890', '#6ff2c6', '#eafff6'], light: '#5cf2c0', accent: '#3f8fc0', end: '#143050', fog: '#1a2450' },
  3: { name: 'Hollow Core', bg: '#0c0308', stoneN: '#6e3a4c', stoneF: '#1a070e', floorN: '#71404e', floorF: '#16060c', pillar: '#8c5062', fire: ['#8a4aff', '#d49bff', '#fbeaff'], light: '#c58bff', accent: '#ff4a3a', end: '#3a0f24', fog: '#38101e' },
};
export const DUNGEON_FLOORS = FLOORS;

export function drawDungeon(ctx, w, h, t = 0, floor = 1) {
  const c = ctx, F = FLOORS[clamp(Math.round(floor) || 1, 1, 3)], V = VIEWS.dungeon;
  const hy = h * V.horizon, fh = (h - hy) * V.near, Wc = w * 1.04, Hc = 1.95, zEnd = 4.8, zN = 0.7;
  const P = (X, Y, z) => [w / 2 + (X * Wc) / z, hy + (fh * (1 - Y)) / z];
  const fogK = (z) => clamp((z - 1) / (zEnd - 1), 0, 1) ** 0.8;
  const quad = (pts, col) => { c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.closePath(); c.fillStyle = col; c.fill(); };
  const seg = (a, b, col, lw) => { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
  c.save();
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.fillStyle = F.bg; c.fillRect(0, 0, w, h);

  // ---- end wall with a barred arch
  {
    const a = P(-0.5, Hc, zEnd), b = P(0.5, 0, zEnd);
    quad([a, [b[0], a[1]], b, [a[0], b[1]]], mix(F.stoneN, F.stoneF, 0.86));
    const dl = P(-0.24, 0, zEnd), dr = P(0.24, 0, zEnd), top = P(0, 1.5, zEnd), sh = P(-0.24, 1.0, zEnd);
    c.beginPath(); c.moveTo(dl[0], dl[1]); c.lineTo(dl[0], sh[1]); c.quadraticCurveTo(dl[0], top[1], top[0], top[1]); c.quadraticCurveTo(dr[0], top[1], dr[0], sh[1]); c.lineTo(dr[0], dr[1]); c.closePath();
    const g = c.createLinearGradient(0, top[1], 0, dl[1]); g.addColorStop(0, F.bg); g.addColorStop(1, F.end);
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    softGlow(c, w / 2, dl[1], (dr[0] - dl[0]) * 0.9, F.light, 0.28 + 0.06 * Math.sin(t * 1.3));
    for (let i = 1; i < 6; i++) { const x = lerp(dl[0], dr[0], i / 6); seg([x, top[1]], [x, dl[1]], F.bg, Math.max(1.2, w * 0.003)); }
    seg([dl[0], sh[1]], [dr[0], sh[1]], F.bg, Math.max(1.2, w * 0.003));
    c.restore();
    c.strokeStyle = mix(F.pillar, F.stoneF, 0.6); c.lineWidth = Math.max(1.5, w * 0.004); c.stroke();
  }

  // ---- floor tiles
  const cols = 6, dz = 0.3;
  for (let zi = zEnd - dz; zi >= zN - 0.01; zi -= dz) {
    const row = Math.round(zi / dz);
    for (let k = 0; k < cols; k++) {
      const x0 = -0.5 + k / cols, x1 = x0 + 1 / cols, z0 = Math.max(zi, zN), z1 = zi + dz;
      const tone = 0.82 + rnd(row * 13 + k * 7) * 0.3 - ((row + k) % 2) * 0.1;
      const f = fogK(zi + dz / 2);
      quad([P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)], mix(F.floorF, F.floorN, clamp((1 - f) * tone, 0, 1)));
    }
  }
  for (let zi = zN; zi <= zEnd; zi += dz) seg(P(-0.5, 0, zi), P(0.5, 0, zi), mix(F.bg, F.floorF, 0.3, 0.7), Math.max(0.8, 2.2 / zi));
  for (let k = 0; k <= cols; k++) seg(P(-0.5 + k / cols, 0, zN), P(-0.5 + k / cols, 0, zEnd), mix(F.bg, F.floorF, 0.3, 0.7), 1.2);
  // floor dressing per level
  const floorFx = Math.round(floor) || 1;
  for (let i = 0; i < 12; i++) {
    const X = (rnd(i + floorFx * 50) - 0.5) * 0.9, z = 0.95 + rnd(i * 2 + floorFx * 9) * 3, p = P(X, 0, z), s = fh / z / 300;
    if (floorFx === 1) {
      c.fillStyle = mix(F.accent, F.bg, fogK(z) * 0.8, 0.55);
      for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(p[0] + (rnd(i * 5 + k) - 0.5) * 60 * s, p[1] + (rnd(i * 7 + k) - 0.5) * 10 * s, (16 + rnd(k + i) * 20) * s, (4 + rnd(k) * 4) * s, 0, 0, TAU); c.fill(); }
    } else if (floorFx === 2) {
      const rx = (40 + rnd(i) * 50) * s, ry = rx * 0.2;
      c.beginPath(); c.ellipse(p[0], p[1], rx, ry, 0, 0, TAU); c.fillStyle = mix(F.accent, F.bg, 0.55 + fogK(z) * 0.4, 0.75); c.fill();
      c.strokeStyle = mix(F.light, F.bg, 0.3 + fogK(z) * 0.6, 0.6); c.lineWidth = 1.2;
      const k = (t * 0.4 + rnd(i)) % 1;
      c.beginPath(); c.ellipse(p[0], p[1], rx * (0.2 + k * 0.7), ry * (0.2 + k * 0.7), 0, 0, TAU); c.globalAlpha = 1 - k; c.stroke(); c.globalAlpha = 1;
    } else {
      c.save(); c.shadowColor = F.accent; c.shadowBlur = 12 * s + 4;
      c.strokeStyle = mix(F.accent, F.bg, fogK(z) * 0.6, 0.6 + 0.3 * Math.sin(t * 2 + i)); c.lineWidth = Math.max(1, 3 * s);
      c.beginPath(); c.moveTo(p[0] - 50 * s, p[1]);
      for (let k = 1; k <= 5; k++) c.lineTo(p[0] - 50 * s + k * 20 * s, p[1] + (rnd(i * 9 + k) - 0.5) * 12 * s);
      c.stroke(); c.restore();
    }
  }

  // ---- ceiling
  quad([P(-0.5, Hc, zN), P(0.5, Hc, zN), P(0.5, Hc, zEnd), P(-0.5, Hc, zEnd)], mix(F.stoneF, F.bg, 0.5));

  // ---- walls (near -> far gradient, brick courses)
  for (const sd of [-1, 1]) {
    const X = sd * 0.5, a = P(X, 0, zN), b = P(X, Hc, zN), d = P(X, Hc, zEnd), e = P(X, 0, zEnd);
    const g = c.createLinearGradient(P(X, 0, 1)[0], 0, e[0], 0);
    g.addColorStop(0, mix(F.stoneN, F.stoneF, 0.25)); g.addColorStop(0.5, mix(F.stoneN, F.stoneF, 0.72)); g.addColorStop(1, mix(F.stoneN, F.stoneF, 0.96));
    quad([a, b, d, e], g);
    const course = 0.24;
    for (let Y = course; Y < Hc; Y += course) seg(P(X, Y, zN), P(X, Y, zEnd), mix(F.bg, F.stoneF, 0.2, 0.55), 1.3);
    for (let z = zN; z < zEnd; z += 0.16) {
      const r = Math.round(z / 0.16);
      for (let Y = 0, j = 0; Y < Hc; Y += course, j++) {
        if ((r + j) % 2) continue;
        seg(P(X, Y, z), P(X, Y + course, z), mix(F.bg, F.stoneF, 0.2, 0.5), Math.max(0.7, 1.6 / z));
      }
    }
    // a few lighter / darker bricks
    for (let i = 0; i < 26; i++) {
      const z = 0.8 + Math.floor(rnd(i * 3 + sd) * 24) * 0.16, Y = Math.floor(rnd(i * 5 + sd * 2) * 7) * course;
      quad([P(X, Y, z), P(X, Y + course, z), P(X, Y + course, z + 0.32), P(X, Y, z + 0.32)], i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.16)');
    }
    // wall base shadow
    quad([P(X, 0, zN), P(X, 0.16, zN), P(X, 0.16, zEnd), P(X, 0, zEnd)], 'rgba(0,0,0,0.3)');
    if (floorFx === 1) {
      for (let i = 0; i < 9; i++) {
        const z = 0.9 + rnd(i + sd * 3 + 80) * 3, len = 0.3 + rnd(i * 2 + 5) * 0.5, p0 = P(X, Hc, z), p1 = P(X - sd * 0.01, Hc - len, z);
        c.strokeStyle = mix(F.accent, F.bg, fogK(z) * 0.8, 0.9); c.lineWidth = Math.max(1, 4 / z);
        c.beginPath(); c.moveTo(p0[0], p0[1]); c.quadraticCurveTo(p0[0] - sd * 8 / z + Math.sin(t + i) * 3, (p0[1] + p1[1]) / 2, p1[0] + Math.sin(t * 0.8 + i) * 5 / z, p1[1]); c.stroke();
      }
    }
  }

  // ---- arches + pillars + torches, far to near
  const pz = [4.05, 3.2, 2.35, 1.5];
  for (const z of pz) {
    const f = fogK(z), col = mix(F.pillar, F.stoneF, f * 0.9 + 0.1), colD = mix(F.pillar, F.stoneF, Math.min(1, f * 0.9 + 0.45));
    const z0 = z - 0.09, z1 = z + 0.09, xin = 0.42;
    // vault rib across the ceiling
    const l = P(-xin, 1.45, z0), r = P(xin, 1.45, z0), top = P(0, Hc + 0.25, z0);
    c.beginPath(); c.moveTo(l[0], l[1]); c.quadraticCurveTo(l[0], top[1], top[0], top[1]); c.quadraticCurveTo(r[0], top[1], r[0], r[1]);
    c.strokeStyle = mix(F.bg, F.stoneF, 0.3); c.lineWidth = (fh * 0.2) / z; c.stroke();
    c.strokeStyle = colD; c.lineWidth = (fh * 0.14) / z; c.stroke();
    for (const sd of [-1, 1]) {
      quad([P(sd * xin, 0, z0), P(sd * xin, Hc, z0), P(sd * xin, Hc, z1), P(sd * xin, 0, z1)], colD);            // inner face
      quad([P(sd * 0.5, 0, z0), P(sd * 0.5, Hc, z0), P(sd * xin, Hc, z0), P(sd * xin, 0, z0)], col);              // front face
      quad([P(sd * 0.51, 0, z0 - 0.02), P(sd * 0.51, 0.2, z0 - 0.02), P(sd * (xin - 0.015), 0.2, z0 - 0.02), P(sd * (xin - 0.015), 0, z0 - 0.02)], mix(F.pillar, F.stoneF, f * 0.9));  // plinth
      quad([P(sd * 0.51, 1.38, z0 - 0.02), P(sd * 0.51, 1.5, z0 - 0.02), P(sd * (xin - 0.015), 1.5, z0 - 0.02), P(sd * (xin - 0.015), 1.38, z0 - 0.02)], mix(F.pillar, F.stoneF, f * 0.9));
      seg(P(sd * xin, 0.2, z0), P(sd * xin, 1.38, z0), 'rgba(0,0,0,0.35)', Math.max(1, 2.5 / z));
      // torch
      const tp = P(sd * (xin + 0.04), 0.98, z0 - 0.03), s = fh / z / 300;
      const flick = 0.85 + 0.15 * Math.sin(t * 11 + z * 5 + sd) * Math.sin(t * 7.3 + z);
      softGlow(c, tp[0], tp[1] - 20 * s, 300 * s * flick, F.light, 0.5 * (1 - f * 0.5));
      softGlow(c, tp[0], tp[1] - 20 * s, 110 * s * flick, F.fire[1], 0.55);
      // bracket
      c.strokeStyle = '#0b0b10'; c.lineWidth = 6 * s; c.beginPath(); c.moveTo(tp[0] + sd * 14 * s, tp[1] + 34 * s); c.lineTo(tp[0], tp[1] + 16 * s); c.lineTo(tp[0], tp[1] - 2 * s); c.stroke();
      c.fillStyle = '#17141c'; c.beginPath(); c.moveTo(tp[0] - 11 * s, tp[1] - 6 * s); c.lineTo(tp[0] + 11 * s, tp[1] - 6 * s); c.lineTo(tp[0] + 6 * s, tp[1] + 10 * s); c.lineTo(tp[0] - 6 * s, tp[1] + 10 * s); c.closePath(); c.fill();
      // flame
      for (let k = 0; k < 3; k++) {
        const kk = [1, 0.66, 0.36][k], fw = 22 * s * kk, fhh = 52 * s * kk * (0.9 + 0.2 * Math.sin(t * 9 + k * 2 + z * 3 + sd)), tip = tp[0] + Math.sin(t * 6 + k + z * 2) * 5 * s;
        c.beginPath(); c.moveTo(tp[0], tp[1] - 4 * s);
        c.bezierCurveTo(tp[0] - fw, tp[1] - 6 * s, tp[0] - fw * 0.6, tp[1] - fhh * 0.6, tip, tp[1] - fhh);
        c.bezierCurveTo(tp[0] + fw * 0.6, tp[1] - fhh * 0.6, tp[0] + fw, tp[1] - 6 * s, tp[0], tp[1] - 4 * s);
        c.fillStyle = F.fire[k]; c.fill();
      }
      // light pool on the floor
      const fp = P(sd * 0.3, 0, z);
      c.save(); c.translate(fp[0], fp[1]); c.scale(1, 0.24); softGlow(c, 0, 0, 260 * s * flick, F.light, 0.3 * (1 - f * 0.6)); c.restore();
    }
  }

  // ---- hanging chains
  for (let i = 0; i < 5; i++) {
    const z = 1.2 + i * 0.66, X = (rnd(i + 60 + floorFx) - 0.5) * 0.6, len = 0.45 + rnd(i + 70) * 0.5, s = fh / z / 300;
    const a = P(X, Hc, z), sway = Math.sin(t * 0.9 + i * 2) * 10 * s, n = Math.round(len * 14);
    c.strokeStyle = mix('#8a8fa0', F.bg, 0.45 + fogK(z) * 0.5); c.lineWidth = Math.max(1, 3 * s);
    for (let k = 0; k < n; k++) {
      const kk = k / n, x = a[0] + sway * kk * kk, y = a[1] + ((fh * len) / z) * kk;
      if (y < -10) continue;
      c.beginPath(); c.ellipse(x, y, (k % 2 ? 2.5 : 4.5) * s, 7 * s, 0, 0, TAU); c.stroke();
    }
    const ex = a[0] + sway, ey = a[1] + (fh * len) / z;
    c.beginPath(); c.arc(ex, ey + 12 * s, 10 * s, 0.3, Math.PI * 1.3); c.stroke();   // hook
  }
  // ---- rubble at the wall bases
  for (let i = 0; i < 14; i++) {
    const sd = i % 2 ? 1 : -1, z = 0.95 + rnd(i + 90) * 3.2, p = P(sd * (0.47 - rnd(i + 95) * 0.06), 0, z), s = fh / z / 300, f = fogK(z);
    for (let k = 0; k < 3; k++) {
      const r = (10 + rnd(i * 4 + k) * 14) * s, x = p[0] + (k - 1) * 16 * s;
      c.beginPath(); c.moveTo(x - r, p[1]); c.lineTo(x - r * 0.5, p[1] - r * 0.9); c.lineTo(x + r * 0.6, p[1] - r * 0.7); c.lineTo(x + r, p[1]); c.closePath();
      c.fillStyle = mix(F.pillar, F.stoneF, 0.35 + f * 0.6); c.fill();
      c.strokeStyle = mix(F.bg, F.stoneF, 0.2); c.lineWidth = Math.max(0.8, 2 * s); c.stroke();
    }
  }

  // ---- depth fog, motes, vignette
  let g = c.createRadialGradient(w / 2, hy, 0, w / 2, hy, Math.max(w, h) * 0.45);
  g.addColorStop(0, mix(F.fog, F.bg, 0.2, 0.75)); g.addColorStop(0.35, mix(F.fog, F.bg, 0.4, 0.3)); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    const y = hy + (h - hy) * (0.2 + i * 0.22), x = ((t * (9 + i * 5) + i * 300) % (w + 600)) - 300;
    g = c.createRadialGradient(x, y, 0, x, y, w * 0.3);
    g.addColorStop(0, mix(F.fog, F.light, 0.25, 0.16)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.translate(0, y); c.scale(1, 0.25); c.translate(0, -y); c.fillStyle = g; c.fillRect(x - w * 0.3, y - w * 0.3, w * 0.6, w * 0.6); c.restore();
  }
  const ms = Math.min(w, h) / 500;
  for (let i = 0; i < 36; i++) {
    const k = (t * (0.02 + rnd(i) * 0.03) + rnd(i + 3)) % 1, up = floorFx === 3;
    const x = rnd(i + 11) * w + Math.sin(t * 0.6 + i) * 16, y = (up ? 1 - k : k) * h;
    softGlow(c, x, y, (2.5 + rnd(i + 5) * 4) * ms, up ? F.accent : F.light, 0.5 * Math.sin(k * Math.PI));
  }
  g = c.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.3, w / 2, h * 0.52, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  g = c.createLinearGradient(0, 0, 0, h * 0.3);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h * 0.3);
  c.restore();
}
