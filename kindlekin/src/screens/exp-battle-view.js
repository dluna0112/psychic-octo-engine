// Kindlekin — battle renderer + event timeline for the expedition screen (Dungeon agent).
// Takes a battle from src/battle.js and plays its events back with pacing on the canvas.
// HTML bits (round label, banners, cheer button) are reported through callbacks.

import { drawCreature, drawShadow, spriteMeta } from '../sprites.js';
import { drawDungeon, groundToScreen, DUNGEON_SPOTS } from '../scenes.js';
import { TUNING as T, AFFLICTIONS, VIRTUES } from '../data.js';

const NAME = Object.fromEntries([...AFFLICTIONS, ...VIRTUES].map((x) => [x.id, x.name]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - (1 - k) * (1 - k);
const FONT = 'ui-rounded, "SF Pro Rounded", Nunito, "Segoe UI", system-ui, sans-serif';

function mood(d) {
  if (d.hp < d.maxHp * T.LOW_HP_PCT) return 'hurt';
  if (d.stress >= T.MOOD_FRAZZLED_STRESS) return 'stressed';
  if (d.stress >= T.MOOD_UNEASY_STRESS) return 'neutral';
  return 'happy';
}

// Formations (ground u, v): slot 0 is the front fighter, nearest the middle; the others step back
// and outwards so every body, name tag and HP bar stays readable, and nobody stands in the
// bottom-centre strip where the Cheer button sits. Portrait phones get a deeper, narrower column.
const FORMATION = {
  wide: {
    party: [{ u: 0.19, v: 0.79 }, { u: -0.09, v: 0.24 }, { u: 0.09, v: 0.24 }],
    enemies: [{ u: 0.81, v: 0.79 }, { u: 1.09, v: 0.24 }, { u: 0.91, v: 0.24 }],
    single: { u: 0.78, v: 0.5 },
  },
  tall: {
    party: [{ u: 0.31, v: 0.72 }, { u: 0.13, v: 0.18 }, { u: -0.4, v: 1.72 }],
    enemies: [{ u: 0.69, v: 0.72 }, { u: 0.87, v: 0.18 }, { u: 1.4, v: 1.72 }],
    single: { u: 0.68, v: 0.4 },
  },
};

/** Where everyone stands. Exported so the map view can reuse the party layout. */
export function spotFor(side, slot, count, isBoss, portrait = false) {
  const F = FORMATION[portrait ? 'tall' : 'wide'];
  if (side === 'party') return F.party[slot] || F.party[0];
  if (isBoss) return DUNGEON_SPOTS.boss;
  if (count === 1) return F.single;
  return F.enemies[slot] || F.enemies[0];
}
const isPortrait = (W, H) => W / H < 0.85;

export function createBattleView({ battle, floor, cb = {} }) {
  const S = battle.state;
  const actors = [];
  const mk = (f, side, slot, count) => ({
    f, key: f.key, side, slot,
    sprite: f.sprite, scale: f.spriteScale || 1, variant: f.variant, boss: f.tier === 'boss',
    count,
    d: { hp: f.hp, maxHp: f.maxHp, stress: f.stress || 0, dead: !!f.dead, affliction: f.affliction || null, virtue: f.virtue || null },
    anim: null, faintAt: null, dash: null, aura: 0,
  });
  S.party.forEach((f, i) => actors.push(mk(f, 'party', i, S.party.length)));
  S.enemies.forEach((f, i) => actors.push(mk(f, 'enemy', i, S.enemies.length)));
  const byKey = Object.fromEntries(actors.map((a) => [a.key, a]));

  let clock = 0, busyUntil = 0.5, speed = 1, ended = false, paused = false;
  const timeline = []; // { at, fn }
  const floats = [];
  let shake = 0, pulse = 0, cheerGlow = 0, lastW = 1, lastH = 1, portrait = false;
  const at = (time, fn) => timeline.push({ at: time, fn });

  // screen positions are needed to place floating numbers; computed lazily from last canvas size
  const pos = (a) => {
    const spot = spotFor(a.side, a.slot, a.count, a.boss, portrait);
    const p = groundToScreen(spot.u, spot.v, lastW, lastH, 'dungeon');
    const m = spriteMeta(a.sprite) || { h: 100, w: 100 };
    return { ...p, top: p.y - m.h * p.scale * a.scale, sw: m.w * p.scale * a.scale };
  };
  const float = (a, text, o = {}) => {
    const p = pos(a);
    // o.body: show on the fighter's body instead of above its head (keeps name tags readable)
    floats.push({ x: p.x + (o.dx || 0), y: (o.body ? p.top + (p.y - p.top) * 0.35 : p.top - 30) + (o.dy || 0), text, color: o.color || '#fff', size: o.size || 26,
      born: clock, life: o.life || 1.1, sub: o.sub || null, subColor: o.subColor || '#fff', rise: o.body ? 16 : 42 });
  };

  function schedule(events) {
    const k = speed;
    const A = 0.62 / k;
    let cursor = Math.max(clock, busyUntil);
    let lastT = cursor, wailImpact = null, mendGroup = false;
    for (const ev of events) {
      if (ev.type !== 'mend' && mendGroup) { cursor += 0.4 / k; mendGroup = false; }
      switch (ev.type) {
        case 'roundStart': {
          const r = ev.round;
          at(cursor, () => cb.onRound?.(r));
          lastT = cursor;
          break;
        }
        case 'attack': {
          const src = byKey[ev.src], dst = byKey[ev.dst];
          let impact;
          if (ev.wail) impact = wailImpact ?? cursor;
          else {
            const t0 = cursor;
            at(t0, () => { src.anim = { type: 'attack', start: clock, dur: A }; src.dash = { to: dst, start: clock, dur: A }; });
            impact = t0 + 0.42 * A;
            cursor += A + 0.06 / k;
          }
          lastT = impact;
          at(impact, () => {
            dst.anim = { type: 'hit', start: clock, dur: 0.5 / k };
            if (ev.warded) { float(dst, 'Warded!', { color: '#fff2b0', size: 22 }); return; }
            dst.d.hp = Math.max(0, dst.d.hp - ev.dmg);
            const sub = ev.element === 'strong' ? 'Strong!' : ev.element === 'weak' ? 'Weak' : ev.spite ? 'Spite!' : null;
            float(dst, String(ev.dmg), {
              color: ev.crit ? '#ffe14a' : ev.spite ? '#ff8aa0' : '#ffffff', size: ev.crit ? 40 : ev.wail ? 26 : 30,
              sub: ev.crit ? (sub ? `CRIT · ${sub}` : 'CRIT!') : sub,
              subColor: ev.element === 'strong' ? '#ffcf6a' : ev.element === 'weak' ? '#a9c4e6' : '#ffe14a',
              dx: (Math.random() - 0.5) * 16,
            });
            if (ev.crit) shake = Math.max(shake, 1);
            else if (dst.side === 'party') shake = Math.max(shake, 0.25);
          });
          break;
        }
        case 'wail': {
          const src = byKey[ev.src];
          const t0 = cursor;
          at(t0, () => { src.anim = { type: 'attack', start: clock, dur: A * 1.3 }; pulse = 1; cb.onWail?.(); });
          wailImpact = t0 + 0.5 * A * 1.3;
          cursor += A * 1.6;
          lastT = wailImpact;
          break;
        }
        case 'stress': {
          const a = byKey[ev.dst];
          const t = Math.max(lastT, ev.reason === 'win' || ev.reason === 'stalemate' ? cursor : lastT);
          at(t + 0.02, () => {
            a.d.stress = ev.total;
            if (Math.abs(ev.amount) >= 5 && ev.reason !== 'cheer' && ev.reason !== 'win') float(a, `${ev.amount > 0 ? '+' : ''}${ev.amount} stress`, { color: ev.amount > 0 ? '#c9a2ff' : '#9fe8c6', size: 15, body: true, life: 1.2 });
          });
          break;
        }
        case 'break': {
          const a = byKey[ev.dst];
          const t = Math.max(lastT, cursor) + 0.1 / k;
          at(t, () => {
            a.d.stress = ev.total;
            if (ev.kind === 'virtue') a.d.virtue = ev.id, a.d.affliction = null;
            if (ev.kind === 'affliction') a.d.affliction = ev.id, a.d.virtue = null;
            if (ev.kind === 'second') { a.d.hp = Math.max(0, a.d.hp - ev.dmg); float(a, String(ev.dmg), { color: '#ff6a6a', size: 34, sub: 'Breaking point' }); }
            a.anim = { type: 'hit', start: clock, dur: 0.7 };
            shake = Math.max(shake, 0.7);
            cb.onBreak?.(a.f, ev);
          });
          cursor = t + 1.5;
          lastT = t;
          break;
        }
        case 'lastEmber':
        case 'devoted': {
          const a = byKey[ev.dst];
          const t = lastT + 0.08;
          at(t, () => { a.d.hp = 1; a.aura = 1; float(a, ev.type === 'lastEmber' ? 'Last Ember!' : 'Devoted!', { color: '#ffd45a', size: 24, dy: -26, life: 1.6 }); cb.onEmber?.(a.f, ev); });
          cursor = Math.max(cursor, t + 1.1);
          break;
        }
        case 'faint': {
          const a = byKey[ev.dst];
          const t = lastT + 0.12 / k;
          at(t, () => { a.d.dead = true; a.d.hp = 0; a.faintAt = clock; a.anim = null; if (a.side === 'party') shake = Math.max(shake, 0.5); });
          cursor = Math.max(cursor, t + 0.55 / k);
          break;
        }
        case 'mend': {
          const src = byKey[ev.src], dst = byKey[ev.dst];
          mendGroup = true;
          at(cursor, () => { dst.d.hp = Math.min(dst.d.maxHp, dst.d.hp + ev.amount); float(dst, `+${ev.amount}`, { color: '#8fe07a', size: 22, dx: (src.slot - 1) * 34, dy: -src.slot * 16 }); dst.heal = clock; });
          lastT = cursor;
          break;
        }
        case 'skip': {
          const a = byKey[ev.src];
          at(cursor, () => { float(a, 'Too scared…', { color: '#c9b9e6', size: 18 }); a.anim = { type: 'hit', start: clock, dur: 0.4 }; });
          cursor += A * 0.8;
          break;
        }
        case 'cheer': {
          at(cursor, () => {
            cheerGlow = 1;
            for (const a of actors) if (a.side === 'party' && !a.d.dead) float(a, 'Cheer!', { color: '#ffd45a', size: 22, dy: -44, life: 1.3 });
          });
          lastT = cursor;
          cursor += 0.25;
          break;
        }
        case 'end': {
          const outcome = ev.outcome;
          at(cursor + 0.7, () => { ended = true; for (const a of actors) syncFromState(a); cb.onEnd?.(outcome); });
          cursor += 0.7;
          break;
        }
        default: break;
      }
    }
    if (mendGroup) cursor += 0.4 / k;
    busyUntil = cursor + 0.08 / k;
  }

  function syncFromState(a) {
    a.d.hp = Math.max(0, a.f.hp); a.d.stress = a.f.stress || 0; a.d.affliction = a.f.affliction || null; a.d.virtue = a.f.virtue || null;
    if (a.f.dead && !a.d.dead) { a.d.dead = true; a.faintAt = clock; }
  }

  function update(dt) {
    if (paused) return;
    clock += dt;
    timeline.sort((a, b) => a.at - b.at);
    while (timeline.length && timeline[0].at <= clock) timeline.shift().fn();
    if (!S.ended && clock >= busyUntil && !timeline.length) schedule(battle.step());
    shake = Math.max(0, shake - dt * 2.6);
    pulse = Math.max(0, pulse - dt * 1.2);
    cheerGlow = S.cheerRound >= S.round && S.cheerRound > 0 && !S.ended ? Math.min(1, cheerGlow + dt * 3) : Math.max(0, cheerGlow - dt * 2);
    for (let i = floats.length - 1; i >= 0; i--) if (clock - floats[i].born > floats[i].life) floats.splice(i, 1);
    for (const a of actors) {
      if (a.anim && clock - a.anim.start > a.anim.dur) a.anim = null;
      if (a.dash && clock - a.dash.start > a.dash.dur) a.dash = null;
      a.aura = Math.max(0, a.aura - dt * 0.8);
    }
  }

  function cheer() {
    const evs = battle.cheer();
    if (evs.length) {
      // play cheer feedback immediately, not after the queued action
      const save = busyUntil; busyUntil = clock;
      schedule(evs);
      busyUntil = Math.max(save, busyUntil);
    }
    return evs;
  }

  function drawBars(c, a, x, top, w) {
    const bw = clamp(w * 0.62, 58, 104), bx = Math.round(x - bw / 2);
    let y = Math.round(top - 16);
    if (a.boss) return;
    const hpK = clamp(a.d.hp / a.d.maxHp, 0, 1);
    // name tag (+ affliction / virtue)
    const tag = a.d.affliction ? NAME[a.d.affliction] : a.d.virtue ? NAME[a.d.virtue] : null;
    c.font = `800 12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(14,8,24,0.9)'; c.lineJoin = 'round';
    const nameY = y - (a.side === 'party' ? 6 : 5);
    if (tag) {
      c.font = `900 11px ${FONT}`;
      const tw = c.measureText(tag.toUpperCase()).width + 12;
      const ty = nameY - 26;
      c.fillStyle = a.d.affliction ? '#c8323c' : '#d9a520';
      roundRect(c, x - tw / 2, ty, tw, 16, 8); c.fill();
      c.fillStyle = a.d.affliction ? '#fff0f0' : '#2e1d00';
      c.fillText(tag.toUpperCase(), x, ty + 12);
      c.font = `800 12px ${FONT}`;
    }
    c.strokeText(a.f.name, x, nameY); c.fillStyle = a.side === 'party' ? '#fff8ec' : '#e6d9ff'; c.fillText(a.f.name, x, nameY);
    // hp
    c.fillStyle = 'rgba(14,8,24,0.85)'; roundRect(c, bx - 2, y - 2, bw + 4, 11, 6); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(c, bx, y, bw, 7, 4); c.fill();
    const hpCol = hpK > 0.5 ? '#7ee08a' : hpK > 0.25 ? '#ffc95c' : '#ff6a6a';
    if (hpK > 0) { c.fillStyle = hpCol; roundRect(c, bx, y, Math.max(4, bw * hpK), 7, 4); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(bx + 3, y + 1, Math.max(0, bw * hpK - 6), 2); }
    if (a.side === 'party') {
      y += 10;
      const sK = clamp(a.d.stress / 100, 0, 1);
      c.fillStyle = 'rgba(14,8,24,0.85)'; roundRect(c, bx - 2, y - 1, bw + 4, 7, 4); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(c, bx, y, bw, 5, 3); c.fill();
      if (sK > 0) { c.fillStyle = a.d.stress >= 70 ? '#ff5fa2' : '#b48cff'; roundRect(c, bx, y, Math.max(3, bw * sK), 5, 3); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(bx + bw * 0.5 - 0.5, y - 1, 1.5, 7);
    }
  }

  function drawBossBar(c, a, w) {
    const bw = Math.min(w - 32, 460), bx = (w - bw) / 2, y = w < 520 ? 94 : 78; // clear of the top bar on phones
    const k = clamp(a.d.hp / a.d.maxHp, 0, 1);
    c.save();
    c.font = `900 14px ${FONT}`; c.textAlign = 'center';
    c.lineWidth = 4; c.strokeStyle = 'rgba(14,8,24,0.9)';
    c.strokeText(a.f.name.toUpperCase(), w / 2, y - 6); c.fillStyle = '#ffd7e6'; c.fillText(a.f.name.toUpperCase(), w / 2, y - 6);
    c.fillStyle = 'rgba(14,8,24,0.85)'; roundRect(c, bx - 3, y - 3, bw + 6, 16, 8); c.fill();
    const g = c.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#8a2a5a'); g.addColorStop(1, '#ff4a6a');
    if (k > 0) { c.fillStyle = g; roundRect(c, bx, y, bw * k, 10, 5); c.fill(); }
    c.restore();
  }

  function draw(c, W, H, t) {
    const V = viewport(W, H), w = V.w, h = V.h;
    lastW = w; lastH = h; portrait = isPortrait(W, H);
    c.fillStyle = '#07060c'; c.fillRect(0, 0, W, H);
    c.save();
    applyViewport(c, V);
    c.save();
    if (shake > 0) { const s = shake * shake * 10; c.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
    drawDungeon(c, w, h, t, floor);
    const list = actors.map((a) => ({ a, p: pos(a) })).sort((x, y) => x.p.y - y.p.y);
    // cheer aura under the party
    if (cheerGlow > 0.01) {
      for (const { a, p } of list) if (a.side === 'party' && !a.d.dead) {
        c.save(); c.globalAlpha = cheerGlow * (0.55 + 0.15 * Math.sin(t * 6)); c.translate(p.x, p.y); c.scale(1, 0.32);
        const g = c.createRadialGradient(0, 0, 4, 0, 0, p.sw * 0.9); g.addColorStop(0, 'rgba(255,214,90,0.9)'); g.addColorStop(1, 'rgba(255,180,60,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, p.sw * 0.9, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    for (const { a, p } of list) {
      let alpha = 1, anim = 'idle', animT;
      if (a.faintAt != null) {
        const ft = (clock - a.faintAt) * speed;
        anim = 'faint'; animT = ft;
        alpha = 1 - clamp((ft - 0.9) / 0.7, 0, 1);
        if (alpha <= 0) continue;
      } else if (a.anim) {
        const k = clamp((clock - a.anim.start) / a.anim.dur, 0, 0.999);
        anim = a.anim.type; animT = anim === 'attack' ? k : k * 0.7;
      }
      let x = p.x;
      if (a.dash) {
        const k = clamp((clock - a.dash.start) / a.dash.dur, 0, 1);
        const bump = Math.sin(Math.PI * clamp((k - 0.15) / 0.7, 0, 1));
        x += (pos(a.dash.to).x - p.x) * 0.28 * bump;
      }
      if (a.aura > 0) { c.save(); c.globalAlpha = a.aura; c.translate(x, p.y - (p.y - p.top) * 0.45); const r = p.sw; const g = c.createRadialGradient(0, 0, 2, 0, 0, r); g.addColorStop(0, 'rgba(255,220,120,0.8)'); g.addColorStop(1, 'rgba(255,160,60,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.restore(); }
      c.save(); c.globalAlpha = alpha;
      drawCreature(c, a.sprite, x, p.y, {
        scale: p.scale * a.scale, t, facing: a.side === 'party' ? 1 : -1, anim, animT,
        mood: a.side === 'party' ? mood(a.d) : 'neutral', seed: a.slot + (a.side === 'enemy' ? 3 : 0), variant: a.variant,
      });
      if (a.heal && clock - a.heal < 0.6) {
        const k = (clock - a.heal) / 0.6; c.globalAlpha = 1 - k; c.strokeStyle = '#8fe07a'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(x, p.y, p.sw * (0.4 + k * 0.4), p.sw * (0.12 + k * 0.12), 0, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    }
    // wail pulse
    if (pulse > 0) {
      const g = c.createRadialGradient(w * 0.7, h * 0.55, 10, w * 0.7, h * 0.55, Math.max(w, h) * (0.3 + (1 - pulse) * 0.9));
      g.addColorStop(0, `rgba(60,0,40,${0.0})`); g.addColorStop(0.7, `rgba(90,10,70,${0.55 * pulse})`); g.addColorStop(1, `rgba(20,0,20,${0.75 * pulse})`);
      c.fillStyle = g; c.fillRect(-20, -20, w + 40, h + 40);
    }
    c.restore();
    c.restore();
    // name tags + bars in screen pixels (not zoomed on phones), so they stay small and apart
    const Z = (x, y) => (V.z === 1 ? [x, y] : [V.fx + (x - V.fx) * V.z, V.fy + (y - V.fy) * V.z]);
    for (const { a, p } of list) {
      if (a.d.dead) continue;
      const [x, top] = Z(p.x, p.top);
      drawBars(c, a, x, top, p.sw * V.z);
    }
    // floating numbers (unshaken, above the name tags)
    c.save();
    applyViewport(c, V);
    for (const f of floats) {
      const k = (clock - f.born) / f.life;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.22 ? 1.15 - ((k - 0.12) / 0.1) * 0.15 : 1;
      const y = f.y - ease(clamp(k, 0, 1)) * f.rise;
      c.save(); c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      c.translate(f.x, y); c.scale(pop, pop);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.font = `900 ${f.size}px ${FONT}`;
      c.lineWidth = Math.max(4, f.size * 0.2); c.strokeStyle = 'rgba(20,6,30,0.95)';
      c.strokeText(f.text, 0, 0); c.fillStyle = f.color; c.fillText(f.text, 0, 0);
      if (f.sub) {
        c.font = `900 ${Math.round(f.size * 0.45 + 4)}px ${FONT}`; c.lineWidth = 4;
        c.strokeText(f.sub, 0, -f.size * 0.75); c.fillStyle = f.subColor; c.fillText(f.sub, 0, -f.size * 0.75);
      }
      c.restore();
    }
    c.restore();
    const boss = actors.find((a) => a.boss);
    if (boss) drawBossBar(c, boss, W);
  }

  return {
    update, draw, cheer, actors,
    get ended() { return ended; },
    setSpeed(s) { speed = s; },
    get speed() { return speed; },
    setPaused(p) { paused = p; },
  };
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Idle party standing in the corridor (map / overlays). */
/**
 * Phones (portrait) get a zoomed view: the scene is laid out in a shorter virtual canvas so feet
 * stay above the bottom controls, then scaled up around the fighting area.
 */
export function viewport(W, H) {
  if (W / H >= 0.85) return { w: W, h: H, z: 1, fx: 0, fy: 0 };
  const h = H - 100, z = Math.min(1.45, 1 + (0.85 - W / H) * 0.9);
  return { w: W, h, z, fx: W / 2, fy: h * 0.72 };
}
export function applyViewport(c, V) {
  if (V.z === 1) return;
  c.translate(V.fx, V.fy); c.scale(V.z, V.z); c.translate(-V.fx, -V.fy);
}

export function drawPartyIdle(c, W, H, t, floor, party, opts = {}) {
  const V = viewport(W, H);
  let w = V.w, h = V.h;
  c.fillStyle = '#07060c'; c.fillRect(0, 0, W, H);
  c.save();
  applyViewport(c, V);
  drawDungeon(c, w, h, t, floor);
  const spots = party.map((m, i) => spotFor('party', i, party.length, false, isPortrait(W, H)));
  const list = party.map((m, i) => ({ m, p: groundToScreen(spots[i].u, spots[i].v, w, h, 'dungeon'), i }))
    .filter((x) => !x.m.dead).sort((a, b) => a.p.y - b.p.y);
  for (const { m, p, i } of list) drawCreature(c, m.sprite, p.x, p.y, { scale: p.scale, t, facing: 1, mood: mood(m), seed: i });
  c.restore();
  w = W; h = H;
  if (opts.dim) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(8,4,16,${opts.dim})`); g.addColorStop(1, `rgba(8,4,16,${opts.dim * 0.55})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
}
export { drawShadow };
