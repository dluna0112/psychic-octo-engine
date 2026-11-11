// Kindlekin sprites — every creature is drawn procedurally with the Canvas 2D API.
// Style: chibi, cel-shaded (base + 2 shade tones + rim light), dark tinted outlines.
//
//   drawCreature(ctx, id, x, y, { scale, t, facing, mood, anim, animT, element, seed, shadow })
//     (x, y) is the point between the feet. Sprites are authored in "units":
//     a baby is ~100 units tall at scale 1 (see SPRITE_META[id].h / .w).
//     t        seconds, drives idle animation
//     facing   1 = looks right, -1 = looks left (lighting stays top-left either way)
//     mood     'happy' | 'neutral' | 'stressed' | 'hurt'
//     anim     'idle' | 'attack' | 'hit' | 'faint'   (animT = seconds since anim began, optional)
//     element  'fire' | 'water' | 'leaf'  (egg tint; ids 'flarekit_egg' / 'puddlin_egg' / 'sproutle_egg' also work)
//     'dire_gloomlet' (or variant:'dire') draws the red elite Gloomlet
//   drawShadow(ctx, x, y, radius, alpha)   soft contact shadow on the ground plane

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const INK = '#2a1b33';

// ---------- colour ----------
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
const hsl = (h, s, l) => `hsl(${h.toFixed(1)},${clamp(s, 0, 100).toFixed(1)}%,${clamp(l, 0, 100).toFixed(1)}%)`;
const toward = (h, target, amt) => {
  const d = ((target - h + 540) % 360) - 180;
  return (h + clamp(d, -amt, amt) + 360) % 360;
};
/** Build a cel palette (base, shade 1, shade 2, rim highlight, outline) from one colour. */
export function pal(hex, o = {}) {
  const [h, s, l] = hexToHsl(hex);
  const dark = l < 34;
  return {
    b: hex,
    s1: hsl(toward(h, 265, 12), s + 5, l - (dark ? 7 : 10)),
    s2: hsl(toward(h, 265, 26), s + 8, l - (dark ? 13 : 21)),
    hi: hsl(toward(h, 55, 10), s - 4, l + (100 - l) * (o.hi ?? (dark ? 0.42 : 0.55))),
    ol: o.ol || hsl(toward(h, 280, 30), clamp(s * 0.7, 18, 60), clamp(l * 0.26, 8, 19)),
  };
}

// ---------- path helpers ----------
const E = (cx, cy, rx, ry, rot = 0) => (c) => {
  c.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  c.ellipse(cx, cy, rx, ry, rot, 0, TAU);
};
function pathBlob(c, pts, k = 1) {
  const n = pts.length;
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    c.bezierCurveTo(
      p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k,
      p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k,
      p2[0], p2[1]);
  }
  c.closePath();
}
const B = (pts, k) => (c) => pathBlob(c, pts, k);
const POLY = (pts) => (c) => {
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
};
function sample(pts, seg = 8) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let j = 0; j < seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}
/** Tapered limb / tail / ribbon along a spline. */
function pathTaper(c, pts, w0, w1, o = {}) {
  const sp = sample(pts, 8), n = sp.length, L = [], R = [];
  let ang = 0;
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    const k = i / (n - 1);
    let w = lerp(w0, w1, k) / 2;
    if (o.bulge) w *= 1 + o.bulge * Math.sin(k * Math.PI);
    const nx = -ty / len, ny = tx / len;
    L.push([sp[i][0] + nx * w, sp[i][1] + ny * w]);
    R.push([sp[i][0] - nx * w, sp[i][1] - ny * w]);
    ang = Math.atan2(ty, tx);
  }
  c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
  if (w1 > 2.5) c.arc(sp[n - 1][0], sp[n - 1][1], w1 / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath();
}
const T = (pts, w0, w1, o) => (c) => pathTaper(c, pts, w0, w1, o);

// ---------- cel shading ----------
/**
 * Fill a path with base + 2 shade bands + rim light, then outline it.
 * d = shade band width (units). o.inner(ctx) draws clipped detail. o.tones=1 for small parts.
 */
function cel(c, S, P, fn, d = 5, o = {}) {
  const lx = S.lx, lw = S.lw * (o.lw || 1);
  if (o.olFirst) {
    c.beginPath(); fn(c);
    c.strokeStyle = P.ol; c.lineWidth = lw * 2; c.stroke();
  }
  c.save();
  c.beginPath(); fn(c);
  c.fillStyle = o.tones === 1 ? P.s1 : P.s2; c.fill();
  c.clip();
  c.save();
  if (o.tones !== 1) {
    c.translate(-lx * d * 0.45, -d);
    c.beginPath(); fn(c); c.fillStyle = P.s1; c.fill();
  }
  c.translate(-lx * d * 0.45, -d);
  c.beginPath(); fn(c); c.fillStyle = P.b; c.fill();
  c.restore();
  if (o.inner) o.inner(c);
  if (o.rim !== false) {
    const r = o.rimW || Math.max(1.6, d * 0.42);
    c.beginPath(); fn(c);
    c.save(); c.translate(lx * r * 0.7, r); fn(c); c.restore();
    c.globalAlpha = o.rimA ?? 0.8;
    c.fillStyle = P.hi; c.fill('evenodd');
    c.globalAlpha = 1;
  }
  c.restore();
  if (!o.olFirst && o.ol !== false) {
    c.beginPath(); fn(c);
    c.strokeStyle = P.ol; c.lineWidth = lw; c.stroke();
  }
}
const fillPath = (c, fn, col, a = 1) => { c.globalAlpha = a; c.beginPath(); fn(c); c.fillStyle = col; c.fill(); c.globalAlpha = 1; };
const strokePath = (c, fn, col, lw) => { c.beginPath(); fn(c); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
const line = (c, pts, col, lw) => {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.strokeStyle = col; c.lineWidth = lw; c.stroke();
};
const curve = (c, pts, col, lw) => {
  const sp = sample(pts, 6);
  line(c, sp, col, lw);
};
function glow(c, x, y, r, col, a = 0.6) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.save(); c.globalAlpha *= a; c.globalCompositeOperation = 'lighter';
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}
function star4(c, x, y, r, col, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.32 : r, a = (i / 8) * TAU;
    c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath(); c.fillStyle = col; c.fill(); c.restore();
}

// ---------- flames ----------
const FIRE = ['#ff5a26', '#ffb22e', '#fff4a8', '#7a1f1c'];
const SOULFIRE = ['#35d6b8', '#9dffe6', '#f2fffb', '#0f3d48'];
function flame(c, S, x, y, w, h, seed = 0, cols = FIRE) {
  const t = S.t;
  const lay = (k, col, ol) => {
    const ww = w * k, hh = h * (k * 0.9 + 0.1) * (1 + 0.09 * Math.sin(t * 9 + seed * 3 + k * 5));
    const tip = x + Math.sin(t * 6 + seed + k * 2) * w * 0.18;
    c.beginPath(); c.moveTo(x, y);
    c.bezierCurveTo(x - ww * 0.85, y - hh * 0.05, x - ww * 0.55, y - hh * 0.6, tip, y - hh);
    c.bezierCurveTo(x + ww * 0.1, y - hh * 0.62, x + ww * 0.8, y - hh * 0.5, x + ww * 0.5, y - hh * 0.18);
    c.bezierCurveTo(x + ww * 0.42, y - hh * 0.04, x + ww * 0.2, y, x, y);
    c.closePath();
    if (ol) { c.strokeStyle = ol; c.lineWidth = S.lw * 0.9; c.stroke(); }
    c.fillStyle = col; c.fill();
  };
  lay(1, cols[0], cols[3]); lay(0.66, cols[1]); lay(0.36, cols[2]);
}

// ---------- faces ----------
function eye(c, S, x, y, rx, ry, o) {
  const st = S.eyeStyle, side = o.side, ol = o.ol || INK;
  c.save(); c.translate(x, y);
  c.strokeStyle = ol; c.lineWidth = Math.max(1.8, rx * 0.34);
  if (st === 'closed') {
    c.beginPath(); c.moveTo(-rx, -ry * 0.1); c.quadraticCurveTo(0, ry * 0.75, rx, -ry * 0.1); c.stroke();
  } else if (st === 'joy') {
    c.beginPath(); c.moveTo(-rx, ry * 0.35); c.quadraticCurveTo(0, -ry * 0.95, rx, ry * 0.35); c.stroke();
  } else if (st === 'hurt') {
    c.beginPath(); c.moveTo(side * rx, -ry * 0.6); c.lineTo(-side * rx * 0.7, 0); c.lineTo(side * rx, ry * 0.6); c.stroke();
  } else if (st === 'faint') {
    c.beginPath(); c.moveTo(-rx * 0.8, -ry * 0.55); c.lineTo(rx * 0.8, ry * 0.55);
    c.moveTo(rx * 0.8, -ry * 0.55); c.lineTo(-rx * 0.8, ry * 0.55); c.stroke();
  } else {
    const lid = o.lid || 0, half = o.half || 0;
    let yi = -ry * 1.25, yo = -ry * 1.25;                // lid line height at inner / outer corner
    if (lid > 0) yi = -ry + lid * ry * 0.95;
    if (lid < 0) yo = -ry - lid * ry * 0.95;
    yi += half * ry; yo += half * ry;
    const cut = lid !== 0 || half > 0;
    c.save();
    if (cut) {
      c.beginPath();
      c.moveTo(side * rx * 1.4, yo); c.lineTo(-side * rx * 1.4, yi);
      c.lineTo(-side * rx * 1.4, ry * 2); c.lineTo(side * rx * 1.4, ry * 2); c.closePath(); c.clip();
    }
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU);
    c.fillStyle = ol; c.fill(); c.clip();
    const k = o.small ? 0.74 : 1;
    const g = c.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, o.irisDark || ol); g.addColorStop(0.45, o.iris); g.addColorStop(1, o.irisLight || '#ffffff');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, ry * 0.12, rx * 0.84 * k, ry * 0.86 * k, 0, 0, TAU); c.fill();
    c.fillStyle = ol; c.globalAlpha = 0.72;
    c.beginPath(); c.ellipse(0, -ry * 0.08, rx * 0.36 * k, ry * 0.4 * k, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#fff';
    const hs = S.mood === 'happy' ? 1.18 : 1;
    c.beginPath(); c.arc(-S.lx * rx * 0.3, -ry * (0.42 - half * 0.5), rx * 0.4 * hs, 0, TAU); c.fill();
    c.beginPath(); c.arc(S.lx * rx * 0.36, ry * 0.4, rx * 0.19 * hs, 0, TAU); c.fill();
    c.restore();
    c.lineWidth = Math.max(2, rx * 0.36);
    if (cut) {
      const cy = (v) => Math.max(v, -ry * 0.98);
      c.beginPath(); c.moveTo(side * rx * 1.12, cy(yo) - (lid > 0 ? 1.5 : 0)); c.lineTo(-side * rx * 1.05, cy(yi)); c.stroke();
    } else {
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    }
    if (o.lash) {
      c.lineWidth = 1.6;
      const ly = cut ? Math.max(yo, -ry) : -ry * 0.55;
      c.beginPath(); c.moveTo(side * rx * 0.9, ly + 1); c.lineTo(side * rx * 1.6, ly - 3);
      c.moveTo(side * rx * 0.98, ly + 4); c.lineTo(side * rx * 1.65, ly + 2); c.stroke();
    }
  }
  c.restore();
}
function mouth(c, S, x, y, w, o = {}) {
  const ol = o.ol || INK;
  let type = o.mouth || S.mood;
  if (S.anim === 'attack') type = 'roar';
  if (S.eyeStyle === 'hurt') type = 'hurt';
  if (S.eyeStyle === 'faint') type = 'faint';
  c.save(); c.translate(x, y);
  c.strokeStyle = ol; c.lineWidth = o.mlw || 2; c.lineCap = 'round'; c.lineJoin = 'round';
  const fang = (fx, dir = 1, len = w * 0.62) => {
    c.beginPath(); c.moveTo(fx - w * 0.2, 0); c.lineTo(fx, dir * len); c.lineTo(fx + w * 0.2, 0); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.2; c.stroke(); c.lineWidth = o.mlw || 2;
  };
  if (type === 'happy' || type === 'roar') {
    const k = type === 'roar' ? 1.25 : 1;
    c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(0, w * 0.22, w, 0);
    c.quadraticCurveTo(w * 0.95, w * 1.15 * k, 0, w * 1.2 * k); c.quadraticCurveTo(-w * 0.95, w * 1.15 * k, -w, 0); c.closePath();
    c.fillStyle = '#8b2740'; c.fill();
    c.save(); c.clip(); c.fillStyle = '#ff94a6';
    c.beginPath(); c.ellipse(0, w * 1.15 * k, w * 0.62, w * 0.5, 0, 0, TAU); c.fill(); c.restore();
    c.stroke();
    if (o.fang) { fang(-w * 0.55); fang(w * 0.55); }
  } else if (type === 'stressed') {
    c.beginPath(); c.moveTo(-w * 0.9, 1);
    c.bezierCurveTo(-w * 0.5, -3, -w * 0.3, 4, 0, 0.5); c.bezierCurveTo(w * 0.3, -3, w * 0.5, 4, w * 0.9, 0); c.stroke();
    if (o.fang) fang(w * 0.5, 1, w * 0.5);
  } else if (type === 'hurt') {
    c.beginPath(); c.moveTo(-w * 0.7, w * 0.75); c.quadraticCurveTo(0, -w * 0.75, w * 0.7, w * 0.75);
    c.quadraticCurveTo(0, w * 0.35, -w * 0.7, w * 0.75); c.closePath();
    c.fillStyle = '#8b2740'; c.fill(); c.stroke();
  } else if (type === 'faint') {
    c.beginPath(); c.ellipse(0, w * 0.4, w * 0.35, w * 0.45, 0, 0, TAU); c.fillStyle = '#8b2740'; c.fill(); c.stroke();
  } else {
    c.beginPath();
    if (o.cat) {
      c.moveTo(-w * 0.85, -0.5); c.quadraticCurveTo(-w * 0.45, w * 0.6, 0, 0); c.quadraticCurveTo(w * 0.45, w * 0.6, w * 0.85, -0.5);
    } else {
      c.moveTo(-w * 0.7, 0); c.quadraticCurveTo(0, w * 0.6, w * 0.7, 0);
    }
    c.stroke();
    if (o.fang) { fang(-w * 0.6, 1, w * 0.5); fang(w * 0.6, 1, w * 0.5); }
  }
  c.restore();
}
/** Standard two-eyed face with mood dressing. */
function face(c, S, o) {
  const { x, y, dx, rx, ry } = o;
  let lid = o.lid || 0, half = o.half || 0;
  if (S.mood === 'stressed') { lid = -0.5; half = 0; }
  if (S.anim === 'attack') lid = Math.max(lid, 0.45);
  for (const side of [-1, 1]) eye(c, S, x + side * dx, y, rx, ry, { ...o, side, lid, half, small: S.mood === 'stressed' });
  const open = S.eyeStyle === 'open';
  c.lineCap = 'round';
  if (S.mood === 'stressed' && open) {
    for (const side of [-1, 1]) line(c, [[x + side * (dx + rx), y - ry - 2.5], [x + side * (dx - rx * 0.7), y - ry - 6.5]], o.ol || INK, 2);
  }
  if (o.nose) o.nose(c);
  mouth(c, S, o.mx ?? x, o.my, o.mw, o);
  if (S.mood === 'happy' || o.blush) {
    c.fillStyle = o.blushCol || '#ff6f8f';
    for (const side of [-1, 1]) {
      c.globalAlpha = 0.5;
      c.beginPath(); c.ellipse(x + side * (dx + rx * 1.15), y + ry * 1.05, rx * 0.8, ry * 0.36, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  if (S.mood === 'stressed' && S.eyeStyle !== 'faint') {
    // sweat drop + forehead gloom lines
    const sx = x + S.lx * -1 * (dx + rx * 2.1), sy = y - ry * 1.5 + ((S.t * 14) % 9);
    c.beginPath(); c.moveTo(sx, sy - 7); c.quadraticCurveTo(sx + 5, sy + 1, sx, sy + 3.5); c.quadraticCurveTo(sx - 5, sy + 1, sx, sy - 7);
    c.fillStyle = '#bfeaff'; c.fill(); c.strokeStyle = '#3b6da8'; c.lineWidth = 1.2; c.stroke();
    c.globalAlpha = 0.45;
    for (let i = 0; i < 3; i++) line(c, [[x + S.lx * (dx * 0.5 + i * 4.5), y - ry * 1.5 - 5], [x + S.lx * (dx * 0.5 + i * 4.5), y - ry * 1.5 + 2 - i]], '#3b3f7a', 1.5);
    c.globalAlpha = 1;
  }
  if (S.mood === 'hurt' && S.eyeStyle !== 'faint') {
    // tear + scuff marks
    const tx = x - S.lx * (dx + rx * 0.2), ty = y + ry * 0.9 + ((S.t * 10) % 6);
    c.beginPath(); c.ellipse(tx, ty, 2.2, 3.2, 0, 0, TAU); c.fillStyle = '#bfeaff'; c.fill();
    c.strokeStyle = '#3b6da8'; c.lineWidth = 1; c.stroke();
    const bx = x + S.lx * (dx + rx * 0.4), by = y - ry * 1.75;
    line(c, [[bx - 5, by - 3], [bx + 5, by + 3]], '#c2334a', 1.8);
    line(c, [[bx - 5, by + 3], [bx + 5, by - 3]], '#c2334a', 1.8);
  }
}
const noseDot = (x, y, w, h, col = INK) => (c) => {
  c.beginPath(); c.moveTo(x - w, y - h * 0.5); c.quadraticCurveTo(x, y - h, x + w, y - h * 0.5);
  c.quadraticCurveTo(x, y + h * 1.3, x - w, y - h * 0.5); c.fillStyle = col; c.fill();
};
function claws(c, x, y, n, sp, len, col = '#fff3d6', ol = INK) {
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * sp;
    c.beginPath(); c.moveTo(cx - sp * 0.4, y); c.lineTo(cx + 0.5, y + len); c.lineTo(cx + sp * 0.4, y); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = ol; c.lineWidth = 1.2; c.stroke();
  }
}
function thorn(c, S, P, x, y, ang, len, w, tipCol) {
  c.save(); c.translate(x, y); c.rotate(ang);
  cel(c, S, P, POLY([[-w / 2, 0], [0, -len], [w / 2, 0]]), 2, { tones: 1, lw: 0.85 });
  if (tipCol) fillPath(c, POLY([[-w * 0.16, -len * 0.66], [0, -len + 1.2], [w * 0.16, -len * 0.66]]), tipCol);
  c.restore();
}

// ---------- palettes ----------
const C = {
  flare: { fur: pal('#ff8f3d'), cream: pal('#fff1d2'), sock: pal('#a1402f'), ear: '#ffc98a' },
  blaze: { fur: pal('#e84a2d'), dark: pal('#46293d'), cream: pal('#ffe6bd'), mane: pal('#ff8a1f'), paint: '#7c1630' },
  sol: { fur: pal('#fff2cc'), ribbon: pal('#ffd060'), pink: pal('#ff9fb4'), ruff: pal('#fffcf0'), halo: pal('#ffc53d') },
  pud: { body: pal('#5cbdf0'), belly: pal('#e2f7ff'), dark: pal('#2f80ca'), pearl: pal('#ffdcee') },
  tidal: { skin: pal('#4d9be0'), armor: pal('#2d4a94'), trim: pal('#f5c855'), teal: pal('#68d8dc'), belly: pal('#d8f2ff') },
  mist: { body: pal('#dbe1ff'), veil: pal('#9585ec'), teal: pal('#82e2ec'), gem: pal('#ff88ca') },
  spr: { body: pal('#86d662'), belly: pal('#f7f4b8'), leaf: pal('#b6ea50'), dark: pal('#4ba853') },
  thorn: { body: pal('#58a64a'), belly: pal('#eee2a4'), bark: pal('#8a6441'), thorn: pal('#f7e9c1'), red: '#d9473f' },
  bloom: { body: pal('#a0e3b0'), belly: pal('#faf8dc'), robe: pal('#41a475'), petal: pal('#ff88b8'), gold: pal('#ffd45a'), wood: pal('#8a6a4a') },
  gloom: { body: pal('#52407f', { hi: 0.5 }), wing: pal('#7a4596'), bone: pal('#dccfee'), glow: '#e6ff6e' },
  dire: { body: pal('#5e2f58', { hi: 0.5 }), wing: pal('#93344f'), bone: pal('#f0d3c4'), glow: '#ff7a5c' },
  warden: { cloak: pal('#363d62'), iron: pal('#7a87a0'), dark: pal('#4c5674'), bone: pal('#c9d2e2'), glow: '#7dffe0', void: '#0c0a18' },
  egg: {
    fire: { shell: pal('#ffe3c2'), band: '#ff8f3d', spot: '#ffc04a', glow: '#ffb060' },
    water: { shell: pal('#dff1ff'), band: '#5cbdf0', spot: '#9adfff', glow: '#8ad4ff' },
    leaf: { shell: pal('#eef6cf'), band: '#86d662', spot: '#c5ee6a', glow: '#b8f08a' },
    plain: { shell: pal('#f6ecdc'), band: '#c9b79f', spot: '#e3d4bd', glow: '#fff2c9' },
  },
};

// =====================================================================
//  CREATURES   (origin = between feet, -y is up, +x is the facing side)
// =====================================================================

function egg(c, S) {
  const P = C.egg[S.element] || C.egg.plain;
  const st = (S.t + S.ph) % 4.2;
  const shake = st < 0.5 ? Math.sin(st * 38) * 0.11 * (1 - st / 0.5) : 0;
  // little straw nest
  cel(c, S, pal('#d9a860'), E(0, -5, 30, 9), 3, { tones: 1 });
  for (let i = -3; i <= 3; i++) line(c, [[i * 8 - 3, -9], [i * 8 + 3, -2]], '#9a6b2e', 1.4);
  c.save(); c.rotate(Math.sin(S.t * 1.7 + S.ph) * 0.035 + shake);
  const shell = (cc) => {
    cc.moveTo(0, -74);
    cc.bezierCurveTo(22, -74, 30, -40, 30, -28); cc.bezierCurveTo(30, -10, 16, -3, 0, -3);
    cc.bezierCurveTo(-16, -3, -30, -10, -30, -28); cc.bezierCurveTo(-30, -40, -22, -74, 0, -74); cc.closePath();
  };
  cel(c, S, P.shell, shell, 6, {
    inner: (cc) => {
      cc.fillStyle = P.band; cc.globalAlpha = 0.92;
      cc.beginPath(); cc.moveTo(-34, -30);
      if (S.element === 'water') {
        for (let i = 0; i < 4; i++) cc.bezierCurveTo(-34 + i * 17 + 5, -42, -34 + i * 17 + 12, -22, -34 + (i + 1) * 17, -30);
      } else if (S.element === 'leaf') {
        for (let i = 0; i < 4; i++) cc.quadraticCurveTo(-34 + i * 17 + 8.5, -44, -34 + (i + 1) * 17, -30);
      } else {
        for (let i = 0; i < 4; i++) { cc.lineTo(-34 + i * 17 + 7, -43 - (i % 2) * 4); cc.lineTo(-34 + (i + 1) * 17, -30); }
      }
      cc.lineTo(34, -17); cc.lineTo(-34, -17); cc.closePath(); cc.fill();
      cc.fillStyle = P.spot;
      cc.beginPath(); cc.ellipse(-12, -56, 5, 6, -0.3, 0, TAU); cc.ellipse(11, -50, 3.5, 4.5, 0.3, 0, TAU); cc.fill();
      cc.beginPath(); cc.ellipse(2, -10, 4, 3, 0, 0, TAU); cc.ellipse(-16, -11, 3, 2.4, 0, 0, TAU); cc.ellipse(18, -11, 3, 2.4, 0, 0, TAU); cc.fill();
      cc.globalAlpha = 1;
    },
  });
  fillPath(c, E(-S.lx * 11, -58, 5, 9, S.lx * 0.5), '#fff', 0.65);
  glow(c, 0, -38, 44, P.glow, 0.22 + 0.14 * Math.sin(S.t * 2.2 + S.ph));
  c.restore();
}

function flarekit(c, S) {
  const P = C.flare, hb = S.bob * 1.4;
  const tw = Math.sin(S.t * 2.6 + S.ph) * 0.16;
  const twitch = Math.max(0, Math.sin(S.t * 1.3 + S.ph * 2) - 0.9) * 2.4;
  // tail
  c.save(); c.translate(-14, -14); c.rotate(tw);
  cel(c, S, P.fur, B([[4, 6], [-14, 9], [-37, -1], [-50, -24], [-46, -50], [-35, -68], [-28, -48], [-14, -30], [2, -10]]), 5, {
    inner: (cc) => {
      fillPath(cc, POLY([[-64, -34], [-48, -30], [-42, -39], [-34, -31], [-27, -41], [-10, -36], [-10, -92], [-64, -92]]), '#ffd45c');
      fillPath(cc, POLY([[-64, -50], [-44, -50], [-38, -58], [-31, -52], [-10, -56], [-10, -92], [-64, -92]]), '#fff4b0');
    },
  });
  flame(c, S, -37, -62, 15, 22, 1);
  c.restore();
  // haunches, body, paws
  cel(c, S, P.fur, E(-17, -11, 10, 10), 3, { tones: 1 });
  cel(c, S, P.fur, E(19, -11, 10, 10), 3, { tones: 1 });
  cel(c, S, P.fur, E(1, -23, 21, 20), 5, { inner: (cc) => fillPath(cc, E(4, -19, 13, 15), P.cream.b) });
  cel(c, S, P.sock, E(-9, -5, 8.5, 6), 2.5, { tones: 1 });
  cel(c, S, P.sock, E(12, -5, 8.5, 6), 2.5, { tones: 1 });
  // head group
  c.save(); c.translate(0, hb);
  const ear = (side, rot) => {
    c.save(); c.translate(2 + side * 20, -76); c.rotate(rot); c.scale(side, 1);
    cel(c, S, P.fur, (cc) => { cc.moveTo(-12, 4); cc.quadraticCurveTo(-2, -24, 14, -36); cc.quadraticCurveTo(22, -14, 16, 10); cc.closePath(); }, 4, {
      inner: (cc) => {
        fillPath(cc, (k) => { k.moveTo(-3, 4); k.quadraticCurveTo(3, -14, 12, -24); k.quadraticCurveTo(15, -8, 11, 8); k.closePath(); }, P.ear);
        fillPath(cc, POLY([[-4, -22], [4, -19], [9, -25], [22, -22], [22, -44], [-4, -44]]), '#ffd45c');
      },
    });
    c.restore();
  };
  ear(-1, -0.1 - twitch * 0.12); ear(1, 0.1 + twitch * 0.2);
  // cheek fluff
  cel(c, S, P.fur, POLY([[-28, -56], [-45, -47], [-36, -43], [-44, -34], [-24, -36]]), 3, { tones: 1 });
  cel(c, S, P.fur, POLY([[32, -56], [49, -47], [40, -43], [48, -34], [28, -36]]), 3, { tones: 1 });
  cel(c, S, P.fur, E(2, -57, 35, 30), 6, {
    inner: (cc) => {
      fillPath(cc, E(4, -41, 21, 15), P.cream.b);
      fillPath(cc, POLY([[-3, -86], [0, -76], [3, -80], [6, -74], [9, -86]]), '#ffd45c');
    },
  });
  flame(c, S, 3, -84, 13, 17, 2);
  face(c, S, {
    x: 4, y: -57, dx: 15, rx: 7.6, ry: 10.2, iris: '#e8551f', irisLight: '#ffd76a', irisDark: '#5a1a1a',
    my: -43, mw: 5.2, cat: true, nose: noseDot(4, -47, 3, 2.2, '#5a2430'),
  });
  c.restore();
}

function blazefang(c, S) {
  const P = C.blaze, hb = S.bob * 1.6, t = S.t;
  // twin flame tails
  for (let i = 0; i < 2; i++) {
    const w = (k) => Math.sin(t * 3 + S.ph + i * 1.7 + k) * 5;
    const pts = i === 0
      ? [[-12, -46], [-40, -52 + w(0)], [-62 + w(1), -80], [-54 + w(2) * 1.6, -118]]
      : [[-12, -40], [-46, -34 + w(0)], [-74, -50 + w(1)], [-82 + w(2) * 1.6, -86]];
    cel(c, S, P.mane, T(pts, 24, 2, { bulge: 0.9 }), 5);
    fillPath(c, T(pts.map((p, j) => (j === 0 ? [p[0] - 10, p[1]] : p)), 9, 0.5, { bulge: 0.9 }), '#ffe36b');
  }
  // legs
  for (const x of [-14, 14]) {
    cel(c, S, P.fur, E(x, -30, 12.5, 19), 4);
    cel(c, S, P.dark, E(x + 3, -7, 13, 8), 3, { tones: 1 });
    claws(c, x + 9, -5, 3, 4.5, 5);
  }
  // back arm
  cel(c, S, P.fur, T([[-20, -80], [-32, -68], [-34, -54]], 12, 10), 3, { tones: 1 });
  cel(c, S, P.dark, E(-34, -51, 9, 8.5), 3, { tones: 1 });
  claws(c, -34, -44, 3, 4.5, 6);
  // torso
  cel(c, S, P.fur, B([[-23, -86], [23, -86], [27, -60], [18, -37], [-18, -37], [-27, -60]]), 6, {
    inner: (cc) => fillPath(cc, E(4, -58, 14, 22), P.cream.b),
  });
  // front arm (raised claws, swings on attack)
  c.save(); c.translate(22, -80);
  c.rotate(S.anim === 'attack' ? -1.1 * S.atk : Math.sin(t * 2.4 + S.ph) * 0.06);
  cel(c, S, P.fur, T([[0, 0], [13, 10], [16, 24]], 12, 10), 3, { tones: 1 });
  cel(c, S, P.dark, E(16, 28, 10, 9.5), 3, { tones: 1 });
  claws(c, 18, 35, 3, 5, 7.5);
  c.restore();
  cel(c, S, P.cream, POLY([[-17, -88], [-11, -68], [-5, -77], [2, -61], [9, -77], [15, -68], [21, -88]]), 3, { tones: 1 });
  // head group
  c.save(); c.translate(0, hb);
  // flame mane
  const mane = (r1, r2, n) => (cc) => {
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI * 1.22 + (i / (n * 2 - 1)) * Math.PI * 1.44;
      const r = i % 2 ? r2 + Math.sin(t * 7 + i * 1.9 + S.ph) * 4 : r1;
      cc[i ? 'lineTo' : 'moveTo'](2 + Math.cos(a) * r * 1.08, -112 + Math.sin(a) * r);
    }
    cc.closePath();
  };
  cel(c, S, P.mane, mane(38, 58, 7), 5, { tones: 1 });
  fillPath(c, mane(34, 47, 7), '#ffd24a');
  const ear = (side) => {
    c.save(); c.translate(2 + side * 19, -134); c.scale(side, 1); c.rotate(0.08);
    cel(c, S, P.fur, (cc) => { cc.moveTo(-11, 6); cc.quadraticCurveTo(-4, -22, 10, -38); cc.quadraticCurveTo(19, -16, 14, 10); cc.closePath(); }, 4, {
      inner: (cc) => fillPath(cc, POLY([[-8, -16], [20, -10], [20, -44], [-8, -44]]), P.dark.b),
    });
    c.restore();
  };
  ear(-1); ear(1);
  cel(c, S, P.fur, POLY([[-28, -112], [-50, -100], [-38, -97], [-46, -86], [-24, -92]]), 3, { tones: 1 });
  cel(c, S, P.fur, POLY([[32, -112], [54, -100], [42, -97], [50, -86], [28, -92]]), 3, { tones: 1 });
  cel(c, S, P.fur, B([[2, -144], [26, -138], [38, -117], [31, -97], [15, -86], [2, -82], [-11, -86], [-27, -97], [-34, -117], [-22, -138]]), 6, {
    inner: (cc) => {
      fillPath(cc, E(3, -91, 18, 13), P.cream.b);
      for (const s of [-1, 1]) {
        fillPath(cc, POLY([[3 + s * 22, -103], [3 + s * 34, -101], [3 + s * 26, -92]]), P.paint);
        fillPath(cc, POLY([[3 + s * 20, -98], [3 + s * 28, -93], [3 + s * 21, -89]]), P.paint);
      }
    },
  });
  flame(c, S, 3, -138, 17, 28, 3);
  face(c, S, {
    x: 3, y: -116, dx: 14.5, rx: 7.8, ry: 9, iris: '#ff9a1f', irisLight: '#fff07a', irisDark: '#5a1a1a', lid: 0.72,
    my: -93, mw: 6.5, fang: true, nose: noseDot(3, -98, 3.4, 2.4, '#3a1626'),
  });
  c.restore();
}

function solwisp(c, S) {
  const P = C.sol, t = S.t;
  c.translate(0, (-13 + Math.sin(t * 1.8 + S.ph) * 5) * S.fl);
  const mote = (front) => {
    for (let i = 0; i < 3; i++) {
      const a = t * 1.3 + S.ph + (i * TAU) / 3, z = Math.sin(a);
      if ((z > 0) !== front) continue;
      const mx = Math.cos(a) * 50, my = -58 + z * 9 + Math.sin(t * 3 + i) * 2;
      glow(c, mx, my, 12, '#ffd25c', 0.7);
      star4(c, mx, my, 5.5, '#fff7c2', t + i);
    }
  };
  mote(false);
  // sun halo
  c.save(); c.translate(0, -96);
  strokePath(c, E(0, 0, 42, 42), P.halo.ol, 8.5);
  strokePath(c, E(0, 0, 42, 42), P.halo.b, 4.5);
  strokePath(c, E(-S.lx * 0.8, -0.9, 42, 42), P.halo.hi, 1.4);
  for (let i = 0; i < 8; i++) {
    c.save(); c.rotate(t * 0.35 + (i * TAU) / 8); c.translate(0, -53);
    cel(c, S, P.halo, POLY([[0, -7], [4.5, 0], [0, 5], [-4.5, 0]]), 2, { tones: 1, lw: 0.8 });
    c.restore();
  }
  c.restore();
  // ribbon ears
  for (const s of [-1, 1]) {
    const f = Math.sin(t * 2.2 + S.ph + s) * 5;
    const pts = [[s * 22, -108], [s * 42, -114], [s * 54 + f * 0.4, -98], [s * 50 + f, -76], [s * 60 + f * 1.5, -56]];
    cel(c, S, P.ribbon, T(pts, 15, 2, { bulge: 0.6 }), 3, {
      tones: 1,
      inner: (cc) => { const g = cc.createLinearGradient(0, -96, 0, -62); g.addColorStop(0, 'rgba(255,143,170,0)'); g.addColorStop(1, '#ff8faa'); cc.fillStyle = g; cc.fillRect(-90, -100, 180, 60); },
    });
  }
  // wisp tail + body
  const tw = Math.sin(t * 2.4 + S.ph) * 4;
  cel(c, S, P.fur, T([[1, -46], [7, -28], [-1 + tw * 0.4, -13], [-13 + tw, -5], [-22 + tw, -13]], 26, 2, { bulge: 0.2 }), 4, {
    inner: (cc) => { const g = cc.createLinearGradient(0, -30, 0, -2); g.addColorStop(0, 'rgba(255,190,90,0)'); g.addColorStop(1, '#ffb65a'); cc.fillStyle = g; cc.fillRect(-40, -34, 80, 40); },
  });
  cel(c, S, P.fur, E(0, -53, 22, 20), 5, { inner: (cc) => fillPath(cc, E(3, -48, 12, 12), '#fffdf4', 0.9) });
  cel(c, S, P.ruff, (cc) => { E(-11, -65, 9, 8)(cc); E(11, -65, 9, 8)(cc); E(0, -61, 11, 9.5)(cc); }, 3, { tones: 1, olFirst: true });
  // head
  c.save(); c.translate(0, S.bob * 1.1);
  cel(c, S, P.fur, POLY([[-8, -117], [-4, -129], [1, -121], [6, -131], [10, -117]]), 2, { tones: 1 });
  cel(c, S, P.fur, E(1, -94, 31, 27), 6, {
    inner: (cc) => { fillPath(cc, E(3, -81, 18, 11), '#fffdf4', 0.9); },
  });
  cel(c, S, P.halo, POLY([[2, -117], [6.5, -110], [2, -103], [-2.5, -110]]), 2, { tones: 1, lw: 0.8 });
  face(c, S, {
    x: 3, y: -92, dx: 13.5, rx: 7.2, ry: 9.6, iris: '#f0607a', irisLight: '#ffd0a8', irisDark: '#5a2038', half: 0.2, lash: true,
    my: -80, mw: 4.2, blush: true, blushCol: '#ff8a9e', ol: '#4a2638',
  });
  c.restore();
  mote(true);
}

function puddlin(c, S) {
  const P = C.pud, t = S.t;
  const j = Math.sin(t * 2.4 + S.ph) * 0.035;
  // paddle tail
  c.save(); c.translate(-24, -12); c.rotate(-0.25 + Math.sin(t * 3 + S.ph) * 0.22);
  cel(c, S, P.dark, E(-20, 0, 22, 10), 3, { tones: 1 });
  line(c, [[-34, 0], [-10, 0]], P.dark.s2, 1.5);
  c.restore();
  cel(c, S, P.dark, E(-15, -4, 11, 6.5), 2.5, { tones: 1 });
  cel(c, S, P.dark, E(15, -4, 11, 6.5), 2.5, { tones: 1 });
  c.save(); c.scale(1 + j, 1 - j);
  // ears
  cel(c, S, P.body, E(-26, -63, 8.5, 8.5), 3, { tones: 1, inner: (cc) => fillPath(cc, E(-25, -62, 4, 4), P.dark.b) });
  cel(c, S, P.body, E(28, -63, 8.5, 8.5), 3, { tones: 1, inner: (cc) => fillPath(cc, E(27, -62, 4, 4), P.dark.b) });
  // droplet body
  const curl = Math.sin(t * 2 + S.ph) * 3;
  cel(c, S, P.body, B([[-27, -3], [27, -3], [39, -22], [34, -52], [18, -72], [9 + curl, -90], [-7, -74], [-32, -52], [-39, -22]]), 7, {
    inner: (cc) => {
      fillPath(cc, E(3, -18, 22, 19), P.belly.b);
      fillPath(cc, E(3, -40, 15, 10), P.belly.b);
    },
  });
  fillPath(c, E(-S.lx * 17, -60, 4.5, 8, S.lx * 0.6), '#fff', 0.6);
  fillPath(c, E(-S.lx * 25, -46, 2.5, 4, S.lx * 0.4), '#fff', 0.6);
  // paws holding a pearl
  cel(c, S, P.body, E(-10, -21, 7, 5.5, 0.5), 2, { tones: 1 });
  cel(c, S, P.body, E(16, -21, 7, 5.5, -0.5), 2, { tones: 1 });
  cel(c, S, P.pearl, E(3, -22, 8.5, 8.5), 3, { tones: 1 });
  fillPath(c, E(3 - S.lx * 2.8, -25, 2.4, 2.4), '#fff', 0.95);
  face(c, S, {
    x: 3, y: -52, dx: 14, rx: 6.8, ry: 9, iris: '#5d55e8', irisLight: '#a9f0ff', irisDark: '#1d1a52',
    my: -37.5, mw: 4.6, cat: true, ol: '#1f2550',
    nose: (cc) => {
      noseDot(3, -43, 4.6, 2.8, '#27325f')(cc);
      cc.fillStyle = '#2f80ca';
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { cc.beginPath(); cc.arc(3 + s * (9 + i * 4), -38 - i * 1.5, 0.9, 0, TAU); cc.fill(); }
    },
  });
  c.restore();
}

function tidalknight(c, S) {
  const P = C.tidal, t = S.t, hb = S.bob * 1.4;
  // trident (back hand)
  c.save(); c.translate(-36, 0); c.rotate(-0.06 + Math.sin(t * 1.6 + S.ph) * 0.015);
  cel(c, S, P.trim, POLY([[-2.2, -6], [2.2, -6], [2.2, -152], [-2.2, -152]]), 2, { tones: 1 });
  cel(c, S, P.teal, (cc) => {
    cc.moveTo(0, -192); cc.lineTo(5, -170); cc.lineTo(3, -160);
    cc.quadraticCurveTo(13, -160, 13, -184); cc.lineTo(19, -164); cc.quadraticCurveTo(18, -146, 3, -148);
    cc.lineTo(-3, -148); cc.quadraticCurveTo(-18, -146, -19, -164); cc.lineTo(-13, -184);
    cc.quadraticCurveTo(-13, -160, -3, -160); cc.lineTo(-5, -170); cc.closePath();
  }, 3, { tones: 1 });
  c.restore();
  // tail
  c.save(); c.translate(-14, -26); c.rotate(-0.2 + Math.sin(t * 2.6 + S.ph) * 0.14);
  cel(c, S, P.skin, E(-26, 0, 28, 12), 4, { inner: (cc) => line(cc, [[-48, 0], [-12, 0]], P.skin.s2, 1.6) });
  c.restore();
  // legs + boots
  for (const x of [-14, 14]) {
    cel(c, S, P.skin, E(x, -27, 11.5, 15), 4, { tones: 1 });
    cel(c, S, P.armor, E(x + 2, -9, 14, 10), 3, { inner: (cc) => fillPath(cc, POLY([[x - 14, -17], [x + 18, -17], [x + 18, -13], [x - 14, -13]]), P.trim.b) });
  }
  // back arm + gauntlet
  cel(c, S, P.skin, T([[-22, -82], [-33, -72], [-36, -60]], 11, 9), 3, { tones: 1 });
  cel(c, S, P.armor, E(-36, -58, 9, 8.5), 3, { tones: 1 });
  // breastplate
  cel(c, S, P.armor, B([[-24, -88], [24, -88], [29, -62], [20, -37], [-20, -37], [-29, -62]]), 6, {
    inner: (cc) => {
      cc.globalAlpha = 0.55;
      for (let i = -2; i <= 2; i++) line(cc, [[0, -40], [i * 11, -86]], P.teal.b, 1.8);
      cc.globalAlpha = 1;
      fillPath(cc, POLY([[-30, -45], [30, -45], [30, -39], [-30, -39]]), P.trim.b);
      fillPath(cc, E(2, -70, 6, 6), P.teal.hi);
    },
  });
  for (const s of [-1, 1]) {
    cel(c, S, P.armor, E(s * 28, -85, 13.5, 11.5), 4, {
      inner: (cc) => strokePath(cc, E(s * 28, -81, 13.5, 11.5), P.trim.b, 2.2),
    });
  }
  // shell shield on the front arm
  c.save(); c.translate(38, -58); c.rotate(Math.sin(t * 2 + S.ph) * 0.03 + (S.anim === 'attack' ? -0.4 * S.atk : 0));
  cel(c, S, P.teal, B([[0, -29], [20, -21], [26, -2], [17, 17], [0, 27], [-17, 17], [-26, -2], [-20, -21]]), 5, {
    inner: (cc) => {
      cc.globalAlpha = 0.6;
      for (let i = -3; i <= 3; i++) line(cc, [[0, 26], [i * 9, -30]], '#2f8fa6', 1.7);
      cc.globalAlpha = 1;
    },
  });
  cel(c, S, P.trim, E(0, 4, 7, 7), 2, { tones: 1 });
  fillPath(c, E(-S.lx * 2, 2, 2, 2), '#fff', 0.9);
  c.restore();
  // head group
  c.save(); c.translate(0, hb);
  cel(c, S, P.skin, E(-29, -131, 8, 8), 3, { tones: 1 });
  cel(c, S, P.skin, E(33, -131, 8, 8), 3, { tones: 1 });
  cel(c, S, P.skin, E(2, -118, 33, 28), 6, { inner: (cc) => fillPath(cc, E(4, -105, 18, 12), P.belly.b) });
  // fin crest
  c.save(); c.translate(0, -150); c.rotate(Math.sin(t * 2.2 + S.ph) * 0.05);
  cel(c, S, P.teal, (cc) => { cc.moveTo(-12, 2); cc.quadraticCurveTo(-10, -30, 14, -42); cc.quadraticCurveTo(9, -22, 22, 0); cc.closePath(); }, 3, {
    inner: (cc) => { cc.globalAlpha = 0.6; line(cc, [[0, 2], [6, -30]], '#2f8fa6', 1.5); line(cc, [[8, 2], [11, -22]], '#2f8fa6', 1.5); cc.globalAlpha = 1; },
  });
  c.restore();
  // helmet
  cel(c, S, P.armor, (cc) => {
    cc.moveTo(-33, -104); cc.lineTo(-35, -124); cc.bezierCurveTo(-36, -162, 40, -162, 39, -124); cc.lineTo(37, -104);
    cc.lineTo(29, -116); cc.lineTo(26, -130); cc.quadraticCurveTo(2, -140, -22, -130); cc.lineTo(-25, -116); cc.closePath();
  }, 5, {
    inner: (cc) => {
      cc.beginPath(); cc.moveTo(-25, -116); cc.lineTo(-22, -130); cc.quadraticCurveTo(2, -140, 26, -130); cc.lineTo(29, -116);
      cc.strokeStyle = P.trim.b; cc.lineWidth = 3.5; cc.stroke();
      fillPath(cc, E(2, -142, 4.5, 4.5), P.teal.hi);
    },
  });
  face(c, S, {
    x: 4, y: -116, dx: 13.5, rx: 7, ry: 8.6, iris: '#6a5cf0', irisLight: '#b6f4ff', irisDark: '#1d1a52', lid: 0.36,
    my: -101.5, mw: 5, cat: true, ol: '#1b2350',
    nose: (cc) => {
      noseDot(4, -107, 4.6, 2.8, '#232c5c')(cc);
      for (const s of [-1, 1]) { line(cc, [[4 + s * 12, -103], [4 + s * 25, -105]], '#1b2350', 1.1); line(cc, [[4 + s * 12, -100], [4 + s * 24, -98]], '#1b2350', 1.1); }
    },
  });
  c.restore();
}

function mistmuse(c, S) {
  const P = C.mist, t = S.t;
  c.translate(0, (-9 + Math.sin(t * 1.6 + S.ph) * 5) * S.fl);
  const bubble = (x, y, r) => {
    fillPath(c, E(x, y, r, r), '#cfeaff', 0.28);
    strokePath(c, E(x, y, r, r), 'rgba(255,255,255,0.9)', 1.3);
    fillPath(c, E(x - S.lx * r * 0.35, y - r * 0.35, r * 0.28, r * 0.2, -0.6), '#fff', 0.95);
  };
  const orbit = (front) => {
    for (let i = 0; i < 4; i++) {
      const a = t * 0.9 + S.ph + (i * TAU) / 4, z = Math.sin(a);
      if ((z > 0) !== front) continue;
      bubble(Math.cos(a) * 54, -86 + z * 12 + Math.sin(t * 2 + i * 2) * 10 - i * 12, 4 + (i % 2) * 2.5);
    }
  };
  orbit(false);
  const tealTips = (y0, y1) => (cc) => { const g = cc.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(130,226,236,0)'); g.addColorStop(1, '#82e2ec'); cc.fillStyle = g; cc.fillRect(-120, y0, 240, y1 - y0 + 30); };
  // flowing veil hair
  for (const s of [-1, 1]) {
    const f = (k) => Math.sin(t * 1.9 + S.ph + s * 0.8 + k) * 5;
    cel(c, S, P.veil, T([[s * 20, -128], [s * 44 + f(0) * 0.3, -116], [s * 50 + f(1), -86], [s * 40 + f(2), -58], [s * 54 + f(3) * 1.4, -30]], 20, 2, { bulge: 0.35 }), 4, { inner: tealTips(-90, -34) });
  }
  // fin ears
  for (const s of [-1, 1]) cel(c, S, P.teal, POLY([[s * 24, -128], [s * 46, -140], [s * 40, -124], [s * 50, -114], [s * 26, -110]]), 3, { tones: 1 });
  // mist tail curls
  const mw = (k) => Math.sin(t * 2.1 + S.ph + k) * 4;
  cel(c, S, P.body, T([[-8, -56], [-18, -40], [-12 + mw(1), -26], [-24 + mw(2), -18]], 12, 1.5), 3, { tones: 1, inner: tealTips(-44, -16) });
  cel(c, S, P.body, T([[8, -56], [18, -42], [12 + mw(2), -30], [22 + mw(3), -22]], 12, 1.5), 3, { tones: 1, inner: tealTips(-44, -18) });
  cel(c, S, P.body, T([[0, -60], [5, -38], [-5 + mw(0), -20], [5 + mw(1) * 1.5, -4]], 24, 2, { bulge: 0.1 }), 4, { inner: tealTips(-40, -4) });
  // robe body
  cel(c, S, P.body, B([[-13, -94], [13, -94], [19, -72], [16, -52], [-16, -52], [-19, -72]]), 5, {
    inner: (cc) => { fillPath(cc, POLY([[-3, -96], [3, -96], [5, -50], [-5, -50]]), P.veil.b, 0.55); },
  });
  // bell sleeves
  for (const s of [-1, 1]) {
    const f = Math.sin(t * 2 + S.ph + s) * 2;
    cel(c, S, P.body, T([[s * 13, -90], [s * 23, -82 + f], [s * 15, -66]], 9, 15), 3, { tones: 1 });
  }
  cel(c, S, P.veil, (cc) => { E(-9, -93, 8, 6)(cc); E(9, -93, 8, 6)(cc); E(0, -91, 8, 7)(cc); }, 2, { tones: 1, olFirst: true });
  // bubble orb between hands
  const oy = -68 + Math.sin(t * 2.3 + S.ph) * 2.5;
  glow(c, 2, oy, 22, '#9ff1ff', 0.6);
  fillPath(c, E(2, oy, 11.5, 11.5), '#bdf3ff', 0.55);
  strokePath(c, E(2, oy, 11.5, 11.5), '#4a55a8', 2);
  strokePath(c, E(2, oy, 9.6, 9.6), 'rgba(255,255,255,0.85)', 1.3);
  fillPath(c, E(2 - S.lx * 4, oy - 4.5, 3.4, 2.2, -0.6), '#fff');
  star4(c, 4, oy + 2, 4, '#fff', t);
  // head group
  c.save(); c.translate(0, S.bob * 1.2);
  cel(c, S, P.body, E(1, -118, 28, 26), 6);
  for (const s of [-1, 1]) {
    const f = Math.sin(t * 2.6 + S.ph + s * 2) * 4;
    curve(c, [[2 + s * 27, -104], [2 + s * 38, -98 + f * 0.4], [2 + s * 48, -104 + f], [2 + s * 58, -96 + f * 1.4]], P.teal.ol, 3.4);
    curve(c, [[2 + s * 27, -104], [2 + s * 38, -98 + f * 0.4], [2 + s * 48, -104 + f], [2 + s * 58, -96 + f * 1.4]], P.teal.b, 1.6);
  }
  // hood
  const cf = Math.sin(t * 2 + S.ph) * 3;
  cel(c, S, P.veil, T([[0, -142], [3, -158], [13 + cf, -166], [20 + cf * 1.4, -157]], 12, 1.5), 3, { tones: 1 });
  cel(c, S, P.veil, (cc) => {
    cc.moveTo(-29, -110); cc.bezierCurveTo(-36, -154, 38, -154, 31, -110);
    cc.quadraticCurveTo(24, -128, 13, -131); cc.quadraticCurveTo(1, -120, -11, -131); cc.quadraticCurveTo(-22, -128, -29, -110); cc.closePath();
  }, 5);
  cel(c, S, P.gem, POLY([[1, -138], [6.5, -130.5], [1, -122], [-4.5, -130.5]]), 2, { tones: 1, lw: 0.8 });
  glow(c, 1, -130, 10, '#ff9ad6', 0.5 + 0.2 * Math.sin(t * 3));
  face(c, S, {
    x: 3, y: -113, dx: 12.5, rx: 6.6, ry: 9, iris: '#a05cf0', irisLight: '#b8fff4', irisDark: '#2a1a5a', half: 0.3, lash: true,
    my: -100.5, mw: 3.8, ol: '#2c2460', blushCol: '#c79bff',
  });
  c.restore();
  orbit(true);
}

function sproutle(c, S) {
  const P = C.spr, t = S.t, hb = S.bob * 1.4;
  // curled tail with a leaf tip
  const tw = Math.sin(t * 2.3 + S.ph) * 4;
  const tail = [[-12, -14], [-36, -8], [-54, -20 + tw * 0.3], [-52 + tw * 0.4, -42], [-38 + tw, -46]];
  cel(c, S, P.body, T(tail, 17, 6), 4, { tones: 1 });
  c.save(); c.translate(-38 + tw, -46); c.rotate(-0.9 + tw * 0.05);
  cel(c, S, P.leaf, (cc) => { cc.moveTo(0, 2); cc.quadraticCurveTo(-13, -8, 0, -26); cc.quadraticCurveTo(13, -8, 0, 2); cc.closePath(); }, 2.5, { tones: 1, inner: (cc) => line(cc, [[0, 0], [0, -20]], P.dark.b, 1.3) });
  c.restore();
  // feet, body, arms
  for (const x of [-13, 13]) {
    cel(c, S, P.dark, E(x + 1, -5, 11, 6.5), 2.5, { tones: 1 });
    for (let i = -1; i <= 1; i++) line(c, [[x + 4 + i * 4.5, -2], [x + 4 + i * 4.5, -5]], P.dark.ol, 1.1);
  }
  cel(c, S, P.body, E(1, -23, 22, 20), 5, {
    inner: (cc) => {
      fillPath(cc, E(5, -19, 14, 16), P.belly.b);
      cc.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) curve(cc, [[-6, -24 + i * 7], [5, -22 + i * 7], [16, -24 + i * 7]], '#d9cf7a', 1.3);
      cc.globalAlpha = 1;
    },
  });
  cel(c, S, P.body, E(-19, -27, 6.5, 5), 2, { tones: 1 });
  cel(c, S, P.body, E(22, -27, 6.5, 5), 2, { tones: 1 });
  // head group
  c.save(); c.translate(0, hb);
  // sprout
  const sw = Math.sin(t * 2 + S.ph) * 0.12;
  c.save(); c.translate(1, -80); c.rotate(sw);
  line(c, [[0, 2], [0, -13]], P.dark.ol, 5.2); line(c, [[0, 2], [0, -13]], P.dark.b, 2.6);
  const leaf = (s, r) => {
    c.save(); c.translate(0, -12); c.rotate(s * (1.0 + r)); c.scale(s, 1);
    cel(c, S, P.leaf, (cc) => { cc.moveTo(0, 0); cc.bezierCurveTo(-13, -8, -9, -27, 2, -34); cc.bezierCurveTo(13, -22, 10, -7, 0, 0); cc.closePath(); }, 3, {
      inner: (cc) => curve(cc, [[0, 0], [1, -14], [2, -30]], P.dark.b, 1.3),
    });
    c.restore();
  };
  leaf(-1, Math.sin(t * 2.4 + S.ph) * 0.1); leaf(1, Math.sin(t * 2.4 + S.ph + 1) * 0.1);
  c.restore();
  // wide lizard head
  cel(c, S, P.body, B([[2, -82], [24, -78], [38, -62], [38, -48], [24, -37], [2, -34], [-20, -37], [-34, -48], [-34, -62], [-20, -78]]), 6, {
    inner: (cc) => {
      fillPath(cc, E(3, -34, 26, 9), P.belly.b, 0.9);
      cc.fillStyle = P.dark.b; cc.globalAlpha = 0.75;
      for (const s of [-1, 1]) { cc.beginPath(); cc.arc(3 + s * 30, -52, 2, 0, TAU); cc.arc(3 + s * 26, -47, 1.6, 0, TAU); cc.arc(3 + s * 32, -46, 1.3, 0, TAU); cc.fill(); }
      cc.globalAlpha = 1;
    },
  });
  face(c, S, {
    x: 3, y: -60, dx: 18, rx: 8.2, ry: 10.2, iris: '#f08a1f', irisLight: '#fff3a0', irisDark: '#4a2414',
    my: -42, mw: 8.5, ol: '#23331f',
    nose: (cc) => { cc.fillStyle = '#2f6a33'; cc.beginPath(); cc.arc(0, -47, 1.2, 0, TAU); cc.arc(7, -47, 1.2, 0, TAU); cc.fill(); },
  });
  c.restore();
}

function thornback(c, S) {
  const P = C.thorn, t = S.t, hb = S.bob * 1.3;
  // club tail
  const tw = Math.sin(t * 1.9 + S.ph) * 4;
  cel(c, S, P.body, T([[-22, -26], [-50, -18], [-72, -28 + tw * 0.5], [-80, -48 + tw]], 20, 12), 4, { tones: 1 });
  c.save(); c.translate(-82, -54 + tw);
  for (let i = 0; i < 5; i++) thorn(c, S, P.thorn, Math.cos(-2.6 + i * 0.75) * 9, Math.sin(-2.6 + i * 0.75) * 9, -2.6 + i * 0.75 + Math.PI / 2, 11, 8, P.red);
  cel(c, S, P.bark, E(0, 0, 13, 12), 3);
  c.restore();
  // shell thorns then bark shell
  const br = 1 + S.bob * 0.01;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.04 + i * 0.152);
    thorn(c, S, P.thorn, -10 + Math.cos(a) * 58 * br, -80 + Math.sin(a) * 54 * br, a + Math.PI / 2, 25 - Math.abs(i - 3) * 1.5, 16, P.red);
  }
  cel(c, S, P.bark, E(-10, -78, 62, 58), 8, {
    inner: (cc) => {
      cc.globalAlpha = 0.5;
      curve(cc, [[-66, -96], [-40, -112], [-12, -104], [16, -118], [46, -104]], P.bark.s2, 2.2);
      curve(cc, [[-70, -70], [-44, -82], [-18, -74], [8, -84]], P.bark.s2, 2.2);
      line(cc, [[-40, -112], [-44, -82]], P.bark.s2, 2.2); line(cc, [[-12, -104], [-18, -74]], P.bark.s2, 2.2);
      line(cc, [[-28, -134], [-26, -108]], P.bark.s2, 2.2); line(cc, [[4, -134], [2, -111]], P.bark.s2, 2.2);
      cc.globalAlpha = 0.85;
      fillPath(cc, E(-46, -120, 16, 8, -0.6), '#7fbf52'); fillPath(cc, E(-58, -92, 9, 5, -1), '#7fbf52'); fillPath(cc, E(30, -126, 12, 5, 0.4), '#7fbf52');
      cc.globalAlpha = 1;
    },
  });
  // legs
  for (const x of [-20, 20]) {
    cel(c, S, P.body, E(x, -13, 17, 14), 4);
    claws(c, x + 6, -4, 3, 6.5, 5.5);
  }
  // back arm
  cel(c, S, P.body, T([[-30, -64], [-45, -50], [-42, -34]], 16, 14), 4, { tones: 1 });
  cel(c, S, P.body, E(-42, -31, 11, 10), 3, { tones: 1 });
  // belly
  cel(c, S, P.body, E(2, -45, 37, 34), 7, {
    inner: (cc) => {
      fillPath(cc, E(9, -39, 25, 26), P.belly.b);
      cc.globalAlpha = 0.5;
      for (let i = 0; i < 4; i++) curve(cc, [[-14, -52 + i * 9], [9, -49 + i * 9], [32, -52 + i * 9]], '#c9b96a', 1.5);
      cc.globalAlpha = 1;
    },
  });
  // front arm with thorn bracer
  c.save(); c.translate(34, -64); c.rotate(S.anim === 'attack' ? -1.0 * S.atk : Math.sin(t * 2 + S.ph) * 0.05);
  thorn(c, S, P.thorn, 16, 8, 1.2, 10, 7, P.red); thorn(c, S, P.thorn, 17, 17, 1.4, 10, 7, P.red);
  cel(c, S, P.body, T([[0, 0], [14, 13], [13, 30]], 17, 15), 4, { tones: 1 });
  cel(c, S, P.bark, E(13, 34, 12.5, 11), 3, { tones: 1 });
  c.restore();
  // head group
  c.save(); c.translate(0, hb);
  thorn(c, S, P.thorn, -14, -106, -0.3, 15, 10, P.red);
  thorn(c, S, P.thorn, 5, -110, 0.03, 22, 12, P.red);
  thorn(c, S, P.thorn, 24, -106, 0.35, 15, 10, P.red);
  cel(c, S, P.body, B([[5, -113], [31, -108], [45, -92], [43, -76], [27, -65], [5, -63], [-17, -65], [-33, -76], [-35, -92], [-21, -108]]), 6, {
    inner: (cc) => {
      fillPath(cc, E(6, -66, 30, 11), P.belly.b, 0.95);
      fillPath(cc, POLY([[-40, -104], [50, -104], [50, -99], [5, -96], [-40, -99]]), P.body.s2, 0.6);
    },
  });
  face(c, S, {
    x: 6, y: -89, dx: 17, rx: 7.8, ry: 8.4, iris: '#ff6a2a', irisLight: '#ffe07a', irisDark: '#4a1414', lid: 0.78,
    my: -71, mw: 9, ol: '#1f2d1c', mlw: 2.2,
    nose: (cc) => { cc.fillStyle = '#2c5a2c'; cc.beginPath(); cc.arc(2, -78, 1.5, 0, TAU); cc.arc(10, -78, 1.5, 0, TAU); cc.fill(); },
  });
  // underbite tusks
  for (const s of [-1, 1]) cel(c, S, P.thorn, POLY([[6 + s * 10, -68], [6 + s * 13.5, -80], [6 + s * 17, -68]]), 1.5, { tones: 1, lw: 0.7 });
  c.restore();
}

function bloomseer(c, S) {
  const P = C.bloom, t = S.t, hb = S.bob * 1.3;
  // vine staff with lantern bud (back hand)
  c.save(); c.translate(-31, 0); c.rotate(-0.04 + Math.sin(t * 1.5 + S.ph) * 0.015);
  cel(c, S, P.wood, T([[0, -4], [-2, -60], [2, -110], [0, -150], [10, -164], [20, -154], [14, -144]], 6, 3.5), 2, { tones: 1 });
  const ly = -134 + Math.sin(t * 2.2 + S.ph) * 1.5;
  line(c, [[14, -144], [14, ly - 10]], P.wood.ol, 1.4);
  glow(c, 14, ly, 26, '#fff0a0', 0.55 + 0.15 * Math.sin(t * 3 + S.ph));
  for (const s of [-1, 1]) cel(c, S, P.petal, (cc) => { cc.moveTo(14, ly + 9); cc.quadraticCurveTo(14 + s * 14, ly + 4, 14 + s * 7, ly - 10); cc.quadraticCurveTo(14 + s * 2, ly, 14, ly + 9); cc.closePath(); }, 2, { tones: 1, lw: 0.8 });
  cel(c, S, P.gold, E(14, ly, 5.5, 7), 2, { tones: 1, lw: 0.8 });
  c.restore();
  // tail with bud
  const tw = Math.sin(t * 2 + S.ph) * 4;
  const tail = [[-6, -30], [-30, -20], [-52, -34 + tw * 0.4], [-50 + tw * 0.5, -58], [-34 + tw, -62]];
  cel(c, S, P.body, T(tail, 11, 4), 3, { tones: 1 });
  cel(c, S, P.petal, E(-31 + tw, -64, 8, 9.5, 0.7), 3, { tones: 1 });
  cel(c, S, P.robe, POLY([[-34 + tw, -58], [-42 + tw, -66], [-36 + tw, -66]]), 1.5, { tones: 1, lw: 0.7 });
  // feet
  cel(c, S, P.body, E(-8, -5, 9, 6), 2.5, { tones: 1 });
  cel(c, S, P.body, E(11, -5, 9, 6), 2.5, { tones: 1 });
  // back arm
  cel(c, S, P.body, T([[-14, -84], [-26, -78], [-31, -70]], 7, 6), 2.5, { tones: 1 });
  // leaf robe
  const hw = Math.sin(t * 2 + S.ph) * 1.5;
  cel(c, S, P.robe, POLY([[-14, -94], [16, -94], [31, -36], [24 + hw, -9], [13, -25], [3 + hw, -5], [-7, -25], [-18 + hw, -8], [-27, -36]]), 6, {
    inner: (cc) => {
      fillPath(cc, POLY([[-5, -96], [9, -96], [11, -26], [3, -4], [-5, -26]]), P.belly.b);
      cc.globalAlpha = 0.6;
      line(cc, [[17, -86], [22, -18]], P.robe.hi, 1.3); line(cc, [[-13, -86], [-17, -18]], P.robe.hi, 1.3);
      cc.globalAlpha = 1;
    },
  });
  for (const s of [-1, 1]) {
    c.save(); c.translate(1 + s * 12, -93); c.rotate(s * 1.05); c.scale(s, 1);
    cel(c, S, pal('#6fcf8a'), (cc) => { cc.moveTo(-9, -2); cc.quadraticCurveTo(0, -12, 20, -3); cc.quadraticCurveTo(4, 10, -9, -2); cc.closePath(); }, 2.5, { tones: 1 });
    c.restore();
  }
  cel(c, S, P.gold, E(2, -84, 4.5, 4.5), 1.5, { tones: 1, lw: 0.7 });
  // front arm, palm up with pollen
  cel(c, S, P.body, T([[16, -84], [29, -76], [31, -66]], 7, 6), 2.5, { tones: 1 });
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.45 + i * 0.25 + S.ph) % 1;
    glow(c, 32 + Math.sin(k * 9 + i) * 7, -72 - k * 46, 7, '#fff3a0', (1 - k) * 0.9);
    fillPath(c, E(32 + Math.sin(k * 9 + i) * 7, -72 - k * 46, 1.8, 1.8), '#fffbe0', 1 - k);
  }
  // head group
  c.save(); c.translate(0, hb);
  // petal collar
  const open = 1 + S.bob * 0.035;
  for (const layer of [0, 1]) {
    const n = layer ? 8 : 9, len = layer ? 42 : 55;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 1.16 + (i / (n - 1)) * Math.PI * 1.32;
      c.save(); c.translate(2, -110); c.rotate(a + Math.PI / 2); c.scale(open, open);
      cel(c, S, layer ? pal('#ffb3d0') : P.petal, (cc) => { cc.moveTo(0, -12); cc.bezierCurveTo(-13, -22, -11, -len + 8, 0, -len); cc.bezierCurveTo(11, -len + 8, 13, -22, 0, -12); cc.closePath(); }, 3, {
        tones: 1, lw: 0.9, inner: (cc) => line(cc, [[0, -18], [0, -len + 10]], layer ? '#ff88b8' : '#ffc2da', 1.4),
      });
      c.restore();
    }
  }
  // stamen antennae
  for (const s of [-1, 1]) {
    const f = Math.sin(t * 2.4 + S.ph + s) * 3;
    const pts = [[2 + s * 9, -132], [2 + s * 15, -152], [2 + s * 27 + f, -161], [2 + s * 35 + f * 1.5, -153]];
    curve(c, pts, P.gold.ol, 3.6); curve(c, pts, P.gold.b, 1.7);
    glow(c, pts[3][0], pts[3][1], 10, '#fff0a0', 0.6);
    cel(c, S, P.gold, E(pts[3][0], pts[3][1], 3.6, 3.6), 1.5, { tones: 1, lw: 0.7 });
  }
  cel(c, S, P.body, B([[3, -137], [21, -133], [31, -117], [27, -101], [13, -92], [3, -90], [-7, -92], [-21, -101], [-25, -117], [-15, -133]]), 6, {
    inner: (cc) => {
      fillPath(cc, E(4, -92, 20, 8), P.belly.b, 0.9);
      cc.fillStyle = P.robe.b; cc.globalAlpha = 0.6;
      for (const s of [-1, 1]) { cc.beginPath(); cc.arc(3 + s * 23, -107, 1.6, 0, TAU); cc.arc(3 + s * 20, -102, 1.3, 0, TAU); cc.fill(); }
      cc.globalAlpha = 1;
    },
  });
  // third-eye bud
  glow(c, 3, -127, 11, '#ffe07a', 0.5 + 0.25 * Math.sin(t * 2.6 + S.ph));
  cel(c, S, P.gold, (cc) => { cc.moveTo(3, -134); cc.quadraticCurveTo(8.5, -127, 3, -120); cc.quadraticCurveTo(-2.5, -127, 3, -134); cc.closePath(); }, 1.5, { tones: 1, lw: 0.8 });
  fillPath(c, E(3, -127, 1.3, 3), '#c2327a');
  face(c, S, {
    x: 4, y: -111, dx: 12.5, rx: 6.6, ry: 8.4, iris: '#e0408f', irisLight: '#ffe0a0', irisDark: '#4a1438', half: 0.22, lash: true,
    my: -98, mw: 4.6, ol: '#213528',
  });
  c.restore();
}

// eyes for shadow creatures: solid glowing shapes
function glowEyes(c, S, x, y, dx, w, h, col, o = {}) {
  const st = S.eyeStyle;
  c.save();
  c.shadowColor = col; c.shadowBlur = 10; c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(2.2, h * 0.3); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const ex = x + s * dx;
    c.beginPath();
    if (st === 'closed') { c.moveTo(ex - w, y); c.lineTo(ex + w, y); c.stroke(); }
    else if (st === 'hurt') { c.moveTo(ex + s * w, y - h * 0.8); c.lineTo(ex - s * w * 0.6, y); c.lineTo(ex + s * w, y + h * 0.8); c.stroke(); }
    else if (st === 'faint') { c.moveTo(ex - w * 0.7, y - h * 0.7); c.lineTo(ex + w * 0.7, y + h * 0.7); c.moveTo(ex + w * 0.7, y - h * 0.7); c.lineTo(ex - w * 0.7, y + h * 0.7); c.stroke(); }
    else if (S.mood === 'happy') { c.moveTo(ex - w, y + h * 0.5); c.quadraticCurveTo(ex, y - h * 1.3, ex + w, y + h * 0.5); c.quadraticCurveTo(ex, y - h * 0.3, ex - w, y + h * 0.5); c.fill(); }
    else if (S.mood === 'stressed') { c.ellipse(ex, y, w * 0.55, h * 0.75, 0, 0, TAU); c.fill(); }
    else {
      // slanted wicked almond
      c.moveTo(ex - s * w, y + h * 0.55); c.quadraticCurveTo(ex - s * w * 0.2, y - h * 0.5, ex + s * w, y - h);
      c.quadraticCurveTo(ex + s * w * 1.05, y + h * 0.7, ex, y + h); c.quadraticCurveTo(ex - s * w * 0.7, y + h, ex - s * w, y + h * 0.55); c.fill();
      if (o.pupil) { c.shadowBlur = 0; c.fillStyle = o.pupil; c.beginPath(); c.ellipse(ex + s * w * 0.15, y + h * 0.05, w * 0.16, h * 0.62, s * 0.3, 0, TAU); c.fill(); c.fillStyle = col; }
    }
  }
  c.restore();
}

function gloomlet(c, S) {
  const P = S.dire ? C.dire : C.gloom, t = S.t;
  c.translate(0, (-7 + Math.sin(t * 2.6 + S.ph) * 3.5) * S.fl);
  // smoke trail
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.7 + i * 0.25 + S.ph) % 1;
    fillPath(c, E(-22 - k * 26, -16 - k * 14 + Math.sin(k * 6 + i) * 3, 7 * (1 - k) + 1.5, 7 * (1 - k) + 1.5), P.body.s2, 0.55 * (1 - k));
  }
  // ragged wings
  const flap = Math.sin(t * 9 + S.ph) * 0.3;
  for (const s of [-1, 1]) {
    c.save(); c.translate(s * 19, -42); c.scale(s, 1); c.rotate(-flap);
    cel(c, S, P.wing, POLY([[0, 2], [26, -22], [23, -7], [34, -3], [22, 3], [27, 13], [2, 10]]), 3, { tones: 1 });
    c.restore();
  }
  // horns (one chipped)
  cel(c, S, P.bone, (cc) => { cc.moveTo(-21, -62); cc.quadraticCurveTo(-33, -76, -23, -90); cc.quadraticCurveTo(-15, -77, -8, -69); cc.closePath(); }, 2.5, { tones: 1 });
  cel(c, S, P.bone, (cc) => { cc.moveTo(9, -69); cc.quadraticCurveTo(16, -79, 28, -83); cc.lineTo(24, -76); cc.lineTo(28, -72); cc.quadraticCurveTo(22, -66, 20, -61); cc.closePath(); }, 2.5, { tones: 1 });
  // inky body with dripping hem
  const dr = (i) => Math.sin(t * 3 + i * 1.8 + S.ph) * 2.5;
  cel(c, S, P.body, (cc) => {
    cc.moveTo(-27, -32); cc.bezierCurveTo(-36, -82, 36, -82, 27, -32);
    cc.lineTo(21, -11 + dr(0)); cc.lineTo(14, -23); cc.lineTo(7, -5 + dr(1)); cc.lineTo(0, -21); cc.lineTo(-8, -7 + dr(2)); cc.lineTo(-14, -23); cc.lineTo(-22, -11 + dr(3)); cc.closePath();
  }, 6, { inner: (cc) => fillPath(cc, E(0, -30, 30, 16), '#2a1f4a', 0.5) });
  // claw hands
  for (const s of [-1, 1]) {
    const hy = -30 + Math.sin(t * 2.6 + S.ph + s) * 2 - (S.anim === 'attack' ? 10 * S.atk : 0);
    cel(c, S, P.body, POLY([[s * 25, hy - 4], [s * 37, hy - 9], [s * 34, hy - 2], [s * 40, hy + 1], [s * 34, hy + 3], [s * 36, hy + 9], [s * 25, hy + 5]]), 2, { tones: 1, lw: 0.9 });
  }
  glowEyes(c, S, 2, -50, 12, 8.5, 7, P.glow, { pupil: '#2a1f4a' });
  // jagged grin
  c.save(); c.shadowColor = P.glow; c.shadowBlur = 8; c.fillStyle = P.glow; c.strokeStyle = P.glow; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  if (S.eyeStyle === 'hurt' || S.eyeStyle === 'faint') { c.ellipse(2, -33, 4, 5, 0, 0, TAU); c.fill(); }
  else if (S.mood === 'stressed') { c.moveTo(-9, -32); c.lineTo(-5, -35); c.lineTo(-1, -31); c.lineTo(3, -35); c.lineTo(7, -31); c.lineTo(12, -34); c.stroke(); }
  else {
    const g = S.mood === 'happy' || S.anim === 'attack' ? 1.5 : 1;
    c.moveTo(-12, -36); c.lineTo(-8, -32); c.lineTo(-4, -37); c.lineTo(2, -32); c.lineTo(8, -37); c.lineTo(12, -32); c.lineTo(16, -36);
    c.quadraticCurveTo(2, -36 + 13 * g, -12, -36); c.fill();
  }
  c.restore();
}

function hollowWarden(c, S) {
  const P = C.warden, t = S.t, G = P.glow;
  const hov = Math.sin(t * 1.3 + S.ph);
  // key-halberd behind everything on the front side
  const hx = 96, hy = -118 + hov * 3 - (S.anim === 'attack' ? 26 * S.atk : 0);
  c.save(); c.translate(hx, hy); c.rotate(0.05 + (S.anim === 'attack' ? 0.5 * S.atk : 0));
  cel(c, S, P.dark, POLY([[-3.5, 104], [3.5, 104], [3.5, -150], [-3.5, -150]]), 3, { tones: 1 });
  strokePath(c, E(0, 112, 10, 10), P.dark.ol, 8); strokePath(c, E(0, 112, 10, 10), P.iron.b, 4);
  cel(c, S, P.iron, POLY([[3, -150], [42, -150], [42, -132], [28, -132], [28, -118], [42, -118], [42, -98], [22, -98], [14, -108], [3, -108]]), 4);
  cel(c, S, P.iron, POLY([[-3, -150], [-18, -142], [-3, -126]]), 2, { tones: 1 });
  cel(c, S, P.iron, POLY([[0, -176], [6, -150], [-6, -150]]), 2, { tones: 1 });
  glow(c, 24, -124, 34, G, 0.22 + 0.1 * Math.sin(t * 2));
  c.restore();
  // cloak
  const hw = (i) => Math.sin(t * 2 + i * 1.3 + S.ph) * 3.5;
  const hem = [];
  for (let i = 0; i <= 12; i++) hem.push([96 - i * 16, i % 2 ? -22 + hw(i) * 0.5 : -3 + hw(i)]);
  cel(c, S, P.cloak, POLY([[-64, -206], [64, -206], [86, -70], ...hem, [-86, -70]]), 9, {
    inner: (cc) => {
      const g = cc.createLinearGradient(0, -160, 0, 0);
      g.addColorStop(0, P.void); g.addColorStop(0.75, '#0f1c2e'); g.addColorStop(1, '#1f5a66');
      cc.fillStyle = g; cc.beginPath(); cc.moveTo(-24, -152); cc.lineTo(24, -152); cc.lineTo(46, 0); cc.lineTo(-46, 0); cc.closePath(); cc.fill();
      cc.globalAlpha = 0.5;
      for (const x of [-70, -56, 58, 72]) line(cc, [[x * 0.8, -150], [x, -14]], P.cloak.s2, 2.4);
      cc.globalAlpha = 1;
      // drifting soul motes in the hollow
      for (let i = 0; i < 5; i++) {
        const k = (t * 0.25 + i * 0.2 + S.ph) % 1;
        fillPath(cc, E(Math.sin(i * 2.3 + k * 4) * 18, -8 - k * 120, 2.2, 2.2), G, (1 - k) * 0.8);
      }
    },
  });
  // hanging chain + padlock in the hollow
  const sw = Math.sin(t * 1.5 + S.ph) * 4;
  for (let i = 0; i < 7; i++) strokePath(c, E(sw * (i / 7), -128 + i * 9, 2.6, 4.4), P.iron.s1, 1.8);
  cel(c, S, P.iron, POLY([[sw - 9, -64], [sw + 9, -64], [sw + 9, -46], [sw - 9, -46]]), 3, { tones: 1 });
  strokePath(c, (cc) => { cc.moveTo(sw - 5, -64); cc.quadraticCurveTo(sw, -78, sw + 5, -64); }, P.iron.ol, 3);
  fillPath(c, E(sw, -56, 2.4, 3.4), P.void);
  // back gauntlet (floating)
  const g1 = -126 + Math.sin(t * 1.3 + S.ph + 1.5) * 4;
  cel(c, S, P.dark, POLY([[-106, g1 - 34], [-78, g1 - 34], [-74, g1 - 14], [-110, g1 - 14]]), 4, { tones: 1 });
  cel(c, S, P.iron, B([[-112, g1 - 14], [-72, g1 - 14], [-70, g1 + 8], [-80, g1 + 22], [-104, g1 + 22], [-114, g1 + 8]]), 5, {
    inner: (cc) => { for (let i = 0; i < 3; i++) line(cc, [[-102 + i * 10, g1 + 6], [-102 + i * 10, g1 + 24]], P.iron.s2, 1.8); },
  });
  // cuirass with the caged hollow
  cel(c, S, P.iron, B([[-46, -208], [46, -208], [56, -180], [42, -148], [0, -136], [-42, -148], [-56, -180]], 0.8), 8, {
    inner: (cc) => {
      fillPath(cc, E(0, -174, 22, 22), P.void);
      const gg = cc.createRadialGradient(0, -170, 2, 0, -172, 22);
      gg.addColorStop(0, 'rgba(125,255,224,0.55)'); gg.addColorStop(1, 'rgba(125,255,224,0)');
      cc.fillStyle = gg; cc.fillRect(-24, -198, 48, 48);
    },
  });
  flame(c, S, 0, -160, 17, 27, 5, SOULFIRE);
  for (const x of [-11, 0, 11]) line(c, [[x, -196 + Math.abs(x) * 0.3], [x, -152 - Math.abs(x) * 0.3]], P.iron.ol, 4.6);
  for (const x of [-11, 0, 11]) line(c, [[x, -195 + Math.abs(x) * 0.3], [x, -153 - Math.abs(x) * 0.3]], P.iron.hi, 2);
  strokePath(c, E(0, -174, 22, 22), P.iron.ol, 4.5);
  strokePath(c, E(0, -174, 24.5, 24.5), P.iron.hi, 1.4);
  c.fillStyle = P.iron.s2;
  for (const [x, y] of [[-38, -196], [38, -196], [-34, -160], [34, -160]]) { c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); }
  // pauldrons
  for (const s of [-1, 1]) {
    thorn(c, S, P.bone, s * 70, -222, s * 0.35, 24, 15);
    thorn(c, S, P.bone, s * 88, -210, s * 0.9, 18, 13);
    cel(c, S, P.dark, E(s * 68, -202, 32, 25), 7, {
      inner: (cc) => { strokePath(cc, E(s * 68, -194, 32, 25), P.iron.b, 3); fillPath(cc, E(s * 70, -206, 4, 4), P.void); fillPath(cc, POLY([[s * 70 - 2.4, -206], [s * 70 + 2.4, -206], [s * 70 + 3.4, -196], [s * 70 - 3.4, -196]]), P.void); },
    });
  }
  // head: hooded cage-helm
  c.save(); c.translate(0, hov * 2.2);
  cel(c, S, P.cloak, (cc) => { cc.moveTo(-38, -204); cc.bezierCurveTo(-50, -276, 50, -276, 38, -204); cc.quadraticCurveTo(0, -196, -38, -204); cc.closePath(); }, 7, {
    inner: (cc) => fillPath(cc, E(2, -230, 25, 25), P.void),
  });
  glow(c, 2, -230, 30, G, 0.2 + 0.08 * Math.sin(t * 3));
  glowEyes(c, S, 2, -232, 10.5, 7.5, 5, G);
  // cage bars over the face
  for (const x of [-18, -8, 2, 12, 22]) {
    const dy = Math.sqrt(Math.max(0, 1 - ((x - 2) / 26) ** 2)) * 25;
    line(c, [[x, -230 - dy], [x, -230 + dy]], P.iron.ol, 4);
    line(c, [[x - S.lx * 0.4, -230 - dy + 1], [x - S.lx * 0.4, -230 + dy - 1]], P.iron.b, 1.8);
  }
  strokePath(c, E(2, -230, 25, 25), P.iron.ol, 5); strokePath(c, E(2, -230, 25, 25), P.iron.b, 2.2);
  // iron crown
  for (let i = -2; i <= 2; i++) thorn(c, S, P.bone, i * 13, -262 + Math.abs(i) * 4, i * 0.16, 22 - Math.abs(i) * 4, 11);
  cel(c, S, P.iron, (cc) => { cc.moveTo(-36, -250); cc.quadraticCurveTo(0, -270, 36, -250); cc.lineTo(35, -240); cc.quadraticCurveTo(0, -260, -35, -240); cc.closePath(); }, 3, { tones: 1 });
  c.restore();
  // front gauntlet gripping the halberd
  cel(c, S, P.dark, POLY([[hx - 16, hy - 34], [hx + 14, hy - 34], [hx + 18, hy - 14], [hx - 20, hy - 14]]), 4, { tones: 1 });
  cel(c, S, P.iron, B([[hx - 22, hy - 14], [hx + 20, hy - 14], [hx + 22, hy + 8], [hx + 12, hy + 22], [hx - 14, hy + 22], [hx - 24, hy + 8]]), 5, {
    inner: (cc) => { for (let i = 0; i < 3; i++) line(cc, [[hx - 12 + i * 10, hy + 2], [hx - 12 + i * 10, hy + 24]], P.iron.s2, 1.8); },
  });
  if (S.mood === 'stressed' || S.mood === 'hurt') {
    // cracks of leaking light
    c.save(); c.shadowColor = G; c.shadowBlur = 8;
    line(c, [[-30, -196], [-22, -186], [-28, -178], [-18, -166]], G, 1.8);
    if (S.mood === 'hurt') line(c, [[30, -200], [24, -188], [32, -180], [26, -168], [34, -158]], G, 1.8);
    c.restore();
  }
}

// =====================================================================
//  REGISTRY
// =====================================================================
const DEFS = {
  egg: { draw: egg, name: 'Egg', h: 80, w: 64, role: 'egg' },
  flarekit: { draw: flarekit, name: 'Flarekit', h: 118, w: 128, element: 'fire', role: 'baby' },
  blazefang: { draw: blazefang, name: 'Blazefang', h: 176, w: 140, element: 'fire', role: 'might' },
  solwisp: { draw: solwisp, name: 'Solwisp', h: 172, w: 130, element: 'fire', role: 'heart', float: true },
  puddlin: { draw: puddlin, name: 'Puddlin', h: 96, w: 128, element: 'water', role: 'baby' },
  tidalknight: { draw: tidalknight, name: 'Tidalknight', h: 196, w: 140, element: 'water', role: 'might' },
  mistmuse: { draw: mistmuse, name: 'Mistmuse', h: 182, w: 124, element: 'water', role: 'wit', float: true },
  sproutle: { draw: sproutle, name: 'Sproutle', h: 128, w: 124, element: 'leaf', role: 'baby' },
  thornback: { draw: thornback, name: 'Thornback', h: 156, w: 184, element: 'leaf', role: 'might' },
  bloomseer: { draw: bloomseer, name: 'Bloomseer', h: 172, w: 130, element: 'leaf', role: 'wit' },
  gloomlet: { draw: gloomlet, name: 'Gloomlet', h: 100, w: 100, element: 'shadow', role: 'enemy', float: true },
  hollowwarden: { draw: hollowWarden, name: 'Hollow Warden', h: 300, w: 250, element: 'shadow', role: 'boss', lw: 3.6 },
};
const norm = (id) => String(id || '').toLowerCase().replace(/[^a-z]/g, '');
const ALIAS = {
  warden: 'hollowwarden', diregloomlet: 'gloomlet',
  eggfire: 'egg', eggwater: 'egg', eggleaf: 'egg', flarekitegg: 'egg', puddlinegg: 'egg', sproutleegg: 'egg',
};
const EGG_EL = { eggfire: 'fire', eggwater: 'water', eggleaf: 'leaf', flarekitegg: 'fire', puddlinegg: 'water', sproutleegg: 'leaf' };

export const SPRITE_IDS = ['egg', 'flarekit', 'blazefang', 'solwisp', 'puddlin', 'tidalknight', 'mistmuse', 'sproutle', 'thornback', 'bloomseer', 'gloomlet', 'hollow_warden'];
/** id -> { name, h, w (units at scale 1), element, role, float } */
export const SPRITE_META = Object.fromEntries(SPRITE_IDS.map((id) => {
  const { draw, ...meta } = DEFS[norm(id)];
  return [id, meta];
}));
export function spriteMeta(id) {
  const k = norm(id), d = DEFS[k] || DEFS[ALIAS[k]];
  if (!d) return null;
  const { draw, ...meta } = d;
  return meta;
}

/** Soft elliptical contact shadow lying on the ground plane. */
export function drawShadow(ctx, x, y, radius, alpha = 0.34, squash = 0.3) {
  if (radius <= 0) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius);
  g.addColorStop(0, `rgba(24,12,44,${alpha})`);
  g.addColorStop(0.6, `rgba(24,12,44,${alpha * 0.55})`);
  g.addColorStop(1, 'rgba(24,12,44,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill();
  ctx.restore();
}

const hashPh = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997; return (h / 997) * TAU; };

export function drawCreature(ctx, id, x, y, opts = {}) {
  let key = norm(id);
  const dire = key === 'diregloomlet' || opts.variant === 'dire';
  let element = opts.element || EGG_EL[key];
  key = DEFS[key] ? key : ALIAS[key];
  const def = DEFS[key];
  if (!def) {
    ctx.save(); ctx.fillStyle = '#f0f'; ctx.fillRect(x - 10, y - 20, 20, 20); ctx.restore();
    return;
  }
  const scale = opts.scale ?? 1, t = opts.t ?? 0, facing = opts.facing === -1 ? -1 : 1;
  const anim = opts.anim || 'idle';
  let mood = opts.mood || 'neutral';
  const ph = hashPh(key) + (opts.seed || 0) * 1.37;
  const at = opts.animT ?? t;

  let ox = 0, oy = 0, rot = 0, sx = 1, sy = 1, flash = false, atk = 0, fl = 1, faintK = 0;
  if (anim === 'attack') {
    const p = (at % 1.0) / 1.0;
    if (p < 0.3) { const k = ease(p / 0.3); ox = -10 * k; rot = -0.09 * k; sx = 1 + 0.06 * k; sy = 1 - 0.06 * k; atk = k * 0.4; }
    else if (p < 0.45) { const k = ease((p - 0.3) / 0.15); ox = lerp(-10, 30, k); rot = lerp(-0.09, 0.16, k); sx = 0.95; sy = 1.06; atk = lerp(0.4, 1, k); }
    else { const k = ease((p - 0.45) / 0.55); ox = lerp(30, 0, k); rot = lerp(0.16, 0, k); atk = 1 - k; }
  } else if (anim === 'hit') {
    const p = (at % 0.7) / 0.7, d = (1 - p) * (1 - p);
    ox = -15 * d + Math.sin(p * 44) * 3 * d; rot = -0.14 * d; flash = p < 0.16; sx = 1 - 0.05 * d; sy = 1 + 0.04 * d;
  } else if (anim === 'faint') {
    faintK = opts.animT != null ? ease(clamp(opts.animT / 0.6, 0, 1)) : 1;
    rot = -1.42 * faintK; ox = def.h * 0.36 * faintK; oy = -def.w * 0.1 * faintK * (def.float ? 0.4 : 1); fl = 1 - faintK;
  }
  const blinkT = (t + ph * 2) % 3.9;
  const blink = blinkT < 0.13 || (blinkT > 0.3 && blinkT < 0.4 && Math.sin(ph * 9) > 0.3);
  const eyeStyle = anim === 'faint' && faintK > 0.5 ? 'faint' : anim === 'hit' || mood === 'hurt' ? 'hurt' : blink ? 'closed' : 'open';
  const bob = anim === 'faint' ? 0 : Math.sin(t * 2.4 + ph);
  const S = { t, ph, lx: facing, lw: def.lw || 3, mood, anim, bob, eyeStyle, element, atk, fl, dire };

  if (opts.shadow !== false) {
    const lift = def.float ? 0.78 + 0.06 * Math.sin(t * 1.8 + ph) * fl : 1;
    const sr = (anim === 'faint' ? lerp(def.w, def.h, faintK) : def.w) * 0.5 * scale * lift;
    drawShadow(ctx, x + (ox * 0.5 - (anim === 'faint' ? def.h * 0.1 * faintK : 0)) * scale * facing, y, sr, def.float ? 0.24 : 0.34);
  }

  ctx.save();
  ctx.translate(x, y); ctx.scale(scale * facing, scale);
  ctx.translate(ox, oy); ctx.rotate(rot);
  ctx.scale(sx * (1 + 0.012 * bob), sy * (1 - 0.018 * bob));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (flash) ctx.filter = 'brightness(1.9) saturate(0.5)';
  else if (anim === 'faint') ctx.filter = `saturate(${(1 - 0.25 * faintK).toFixed(2)}) brightness(${(1 - 0.1 * faintK).toFixed(2)})`;
  def.draw(ctx, S);
  ctx.restore();

  // overlays in screen-aligned space
  if (anim === 'faint' && faintK > 0.8) {
    const hx = x + facing * scale * (ox - def.h * 0.78), hy2 = y - scale * def.w * 0.42;
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i * TAU) / 3;
      star4(ctx, hx + Math.cos(a) * 16 * scale, hy2 + Math.sin(a) * 5 * scale, 6 * scale, '#ffe36b', a);
    }
  }
  if (anim === 'hit') {
    const p = (at % 0.7) / 0.7;
    if (p < 0.3) {
      ctx.save(); ctx.globalAlpha = 1 - p / 0.3;
      star4(ctx, x + facing * scale * def.w * 0.3, y - scale * def.h * 0.5, (14 + p * 50) * scale, '#fff', 0.4);
      star4(ctx, x + facing * scale * def.w * 0.3, y - scale * def.h * 0.5, (8 + p * 30) * scale, '#ffe36b', 1.2);
      ctx.restore();
    }
  }
  if (mood === 'happy' && anim === 'idle') {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.6 + i * 0.5 + ph) % 1;
      ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI);
      star4(ctx, x + (i ? 1 : -1) * scale * def.w * 0.46, y - scale * def.h * (0.62 + k * 0.25), 5.5 * scale, '#fff6b0', k * 3);
      ctx.restore();
    }
  }
}
