// Kindlekin — the garden hub.
import { drawGarden, groundToScreen, GARDEN_SPOTS } from '../scenes.js';
import { drawCreature, spriteMeta } from '../sprites.js';
import { TUNING, GARDEN_ACTIONS, CREATURES, AFFLICTIONS } from '../data.js';
import {
  getCreature, personalityOf, moodOf, spriteIdOf, doAction, canDoAction, buyExtraAction, canBuyExtraAction,
  endDay, evolutionHint, isEgg, stageOf, elementOf, partyCandidates, beginExpedition, finishExpedition,
  speciesOf,
} from '../state.js';

// ------------------------------------------------------------------ helpers
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a); // visual only
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nameOfSpecies = (id) => CREATURES.find((c) => c.id === id)?.name || id;
const STAT_LABEL = { might: 'Might', wit: 'Wit', heart: 'Heart', maxHp: 'Max HP', bond: 'Bond', stress: 'Stress' };
const STAT_COLOR = { might: '#ff9a72', wit: '#7cc6ff', heart: '#ff8fc0', maxHp: '#8de896', bond: '#ffd36b', stress: '#c6a6ff' };
const EL_TINT = { fire: '#6a3a2c', water: '#274a72', leaf: '#35592f', shadow: '#3d2a5e' };
const ACT_COLOR = { pet: '#ff8fc0', feed: '#ff9a5a', nap: '#9fb8ff', spar: '#ff7b57', puzzle: '#63b9ff', sing: '#ffd45a' };

const ICON = {
  pet: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  feed: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7.5c-1.2-1-3-1.6-4.6-1.1C4.2 7.4 3.3 11 4.4 14.6 5.6 18.5 8.3 21.3 10.4 21c.7-.1 1.1-.5 1.6-.5s.9.4 1.6.5c2.1.3 4.8-2.5 6-6.4 1.1-3.6.2-7.2-3-8.2-1.6-.5-3.4.1-4.6 1.1z"/><path d="M12.6 7.2c.2-2 1.4-3.6 3.6-4.4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  nap: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>',
  spar: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z"/></svg>',
  puzzle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 3.5a2 2 0 0 1 4 0V5h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4H19v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 0 0-4 0V19H6a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H5V6a1 1 0 0 1 1-1h4V3.5z"/></svg>',
  sing: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 17.5V5.8L20 3v11.5"/><path d="M9 6v11.5M20 3.2v11.3" stroke="currentColor" stroke-width="2.2" fill="none"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15" r="3"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 21V9a7 7 0 0 1 14 0v12h-3v-6a4 4 0 0 0-8 0v6H5z"/></svg>',
  stone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 21V10a6 6 0 0 1 12 0v11H6z" opacity=".85"/><path d="M12 8.5c1.3 1.4 1.6 2.6.9 3.7-.4.7-1.4 1-1.9.4-.7-.8.2-1.3 0-2.4.6.3.9-.6 1-1.7z" fill="#ffb15c"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c.6 4.6 2.4 6.9 7 8-4.6 1.1-6.4 3.4-7 8-.6-4.6-2.4-6.9-7-8 4.6-1.1 6.4-3.4 7-8z"/></svg>',
};

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// ------------------------------------------------------------------ runtime state (not saved)
const G = {
  app: null,
  actors: new Map(), // uid -> actor
  fx: [], // particles
  sel: null,
  view: { x: 0, w: 0, h: 0, init: false },
  night: 0, // 0..1 overlay for end-of-day
  dom: {},
  t: 0,
  portraitCtx: null,
};

function actorFor(c, i) {
  let a = G.actors.get(c.uid);
  if (!a) {
    const spot = freeSpot(i);
    a = {
      uid: c.uid, u: spot.u, v: spot.v, tu: spot.u, tv: spot.v, facing: Math.random() < 0.5 ? 1 : -1,
      wait: rand(1, 5), hop: 0, hopH: 0, flash: 0, showId: spriteIdOf(c), seed: (G.actors.size * 7) % 13,
      element: elementOf(c), walkT: 0, nudge: 0,
    };
    G.actors.set(c.uid, a);
  }
  return a;
}

// screen-space distance on a nominal 1000x700 garden, so "far apart" means far apart on screen
function sep(a, b) {
  const p = groundToScreen(a.u, a.v, 1000, 700, 'garden'), q = groundToScreen(b.u, b.v, 1000, 700, 'garden');
  return Math.hypot(p.x - q.x, (p.y - q.y) * 1.6);
}
const SPOT_ORDER = [0, 5, 1, 3, 2, 4];
function freeSpot(i) {
  const taken = [...G.actors.values()].map((a) => ({ u: a.tu, v: a.tv }));
  const spots = SPOT_ORDER.map((j) => GARDEN_SPOTS[j]).concat(GARDEN_SPOTS.map((s) => ({ u: clamp(s.u + 0.12, 0.08, 0.86), v: clamp(s.v + 0.15, 0, 0.95) })));
  let best = spots[i % spots.length], bestD = -1;
  for (const s of spots) {
    const d = taken.length ? Math.min(...taken.map((t) => sep(s, t))) : 999;
    if (d > 170) return s;
    if (d > bestD) { bestD = d; best = s; }
  }
  return best;
}

function syncActors() {
  const st = G.app.state;
  const live = new Set(st.creatures.map((c) => c.uid));
  for (const uid of [...G.actors.keys()]) if (!live.has(uid)) G.actors.delete(uid);
  st.creatures.forEach((c, i) => actorFor(c, i));
  if (G.sel && !live.has(G.sel)) select(null);
}

// ------------------------------------------------------------------ effects
function spawn(uid, kind, n = 6) {
  const a = G.actors.get(uid);
  if (!a) return;
  const m = spriteMeta(a.showId) || { h: 100, w: 100 };
  for (let i = 0; i < n; i++) {
    G.fx.push({
      uid, kind, age: -i * 0.09, life: kind === 'z' ? 2.1 : 1.4,
      x: rand(-m.w * 0.35, m.w * 0.35), y: -m.h * rand(0.55, 0.95),
      vx: rand(-25, 25), vy: kind === 'fruit' ? rand(-30, -10) : rand(-70, -40),
      rot: rand(-0.5, 0.5), size: rand(0.8, 1.2), color: ACT_COLOR[kind] || '#fff',
    });
  }
}
function floater(uid, text, color, delay = 0) {
  const a = G.actors.get(uid);
  if (!a) return;
  const m = spriteMeta(a.showId) || { h: 100 };
  G.fx.push({ uid, kind: 'text', text, color, age: -delay, life: 1.5, x: 0, y: -m.h, vx: 0, vy: -50 });
}
function burst(uid) {
  const a = G.actors.get(uid);
  if (!a) return;
  const m = spriteMeta(a.showId) || { h: 100 };
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * TAU;
    G.fx.push({ uid, kind: 'spark', age: 0.55, life: 1.9, x: 0, y: -m.h * 0.5, vx: Math.cos(ang) * rand(80, 150), vy: Math.sin(ang) * rand(80, 150), rot: ang, size: rand(0.9, 1.5), color: i % 2 ? '#fff6b0' : '#ffd45a' });
  }
}

const ACT_FX = { pet: 'heart', feed: 'fruit', nap: 'z', spar: 'spark', puzzle: 'q', sing: 'note' };

function playEvents(uid, actionId, res) {
  const a = G.actors.get(uid);
  if (a) { a.hop = 0.55; a.hopH = actionId === 'nap' ? 0.15 : actionId === 'spar' ? 1.3 : 1; }
  if (actionId) spawn(uid, ACT_FX[actionId], actionId === 'nap' ? 3 : 6);
  let d = 0;
  for (const e of res.events) {
    if (e.type === 'stat') {
      const sign = e.delta > 0 ? '+' : '';
      floater(e.uid, `${sign}${e.delta} ${STAT_LABEL[e.stat]}`, STAT_COLOR[e.stat], d);
      d += 0.55;
    } else if (e.type === 'pets') {
      floater(e.uid, `${e.pets}/${e.need}`, '#ffd36b', d);
      if (a) { a.hop = 0.6; a.hopH = 0.5; a.nudge = 0.6; }
    } else if (e.type === 'hatched' || e.type === 'evolved') {
      celebrate(e);
    } else if (e.type === 'personality') {
      const c = getCreature(G.app.state, e.uid);
      if (c && e.to !== 'unformed') G.app.toast(`${c.name} is becoming ${personalityOf(c).name}!`);
    } else if (e.type === 'cured') {
      const c = getCreature(G.app.state, e.uid);
      if (c) G.app.toast(`${c.name} shook off ${AFFLICTIONS.find((x) => x.id === e.affliction)?.name || 'its affliction'}.`);
    }
  }
}

function celebrate(e) {
  const a = G.actors.get(e.uid);
  const c = getCreature(G.app.state, e.uid);
  if (a) { a.flash = 1.6; a.pendingId = spriteIdOf(c); a.element = elementOf(c); burst(e.uid); }
  if (e.type === 'hatched') G.app.toast(`${nameOfSpecies(e.to)} hatched!`, 'gold');
  else G.app.toast(`${c && c.name !== nameOfSpecies(e.to) ? c.name : nameOfSpecies(e.from)} evolved into ${nameOfSpecies(e.to)}!`, 'gold');
}

// ------------------------------------------------------------------ DOM: HUD
function buildHud() {
  const app = G.app;
  const hud = h('div', 'hud pass');
  hud.innerHTML = `
    <div class="hud-left">
      <div class="panel hud-card">
        <div class="day"><small>Day</small><b data-r="day"></b></div>
        <div class="sep"></div>
        <div class="pips" data-r="pips" role="img"></div>
        <span class="pips-label" data-r="pipsLabel"></span>
        <div class="sep"></div>
        <span class="motes" title="Motes"><span class="mote-ico"></span><span data-r="motes"></span></span>
        <button class="btn btn-icon btn-ghost btn-buy" data-r="buy" aria-label="Buy an extra action">${ICON.plus}</button>
      </div>
    </div>
    <div class="hud-right">
      <button class="btn btn-end" data-r="end">${ICON.moon}<span>End Day</span></button>
    </div>`;
  const q = (k) => hud.querySelector(`[data-r=${k}]`);
  q('buy').onclick = () => {
    const r = buyExtraAction(app.state);
    if (!r.ok) { app.toast(r.reason); return; }
    app.save();
    app.toast(`+1 action for ${TUNING.MOTES_PER_EXTRA_ACTION} Motes`);
    refresh();
  };
  q('end').onclick = () => askEndDay();
  G.dom.hud = { el: hud, day: q('day'), pips: q('pips'), pipsLabel: q('pipsLabel'), motes: q('motes'), buy: q('buy') };
  app.ui.append(hud);
}

function renderHud() {
  const st = G.app.state;
  const d = G.dom.hud;
  d.day.textContent = st.day;
  const total = TUNING.ACTIONS_PER_DAY + st.extraBought;
  const shown = Math.max(total, st.actionsLeft);
  let pips = '';
  for (let i = 0; i < shown; i++) pips += `<i class="pip${i < st.actionsLeft ? ' on' : ''}${i >= TUNING.ACTIONS_PER_DAY ? ' extra' : ''}"></i>`;
  d.pips.innerHTML = pips;
  d.pips.setAttribute('aria-label', `${st.actionsLeft} actions left`);
  d.pipsLabel.textContent = `${st.actionsLeft} left`;
  d.motes.textContent = st.motes;
  const b = canBuyExtraAction(st);
  d.buy.disabled = !b.ok;
  d.buy.title = b.ok ? `Buy +1 action (${TUNING.MOTES_PER_EXTRA_ACTION} Motes)` : b.reason;
}

// ------------------------------------------------------------------ DOM: dock
function buildDock() {
  const dock = h('div', 'dock');
  dock.innerHTML = `
    <button class="btn btn-primary btn-lg" data-r="exp">${ICON.door}<span>Expedition</span></button>
    <button class="btn btn-lg btn-mem" data-r="mem" aria-label="Memorial stones" title="Memorial stones">${ICON.stone}<span class="n" data-r="memN"></span></button>`;
  dock.querySelector('[data-r=exp]').onclick = () => openPicker();
  dock.querySelector('[data-r=mem]').onclick = () => openMemorial();
  G.dom.dock = { el: dock, exp: dock.querySelector('[data-r=exp]'), memN: dock.querySelector('[data-r=memN]') };
  G.dom.hint = h('div', 'hint');
  G.app.ui.append(dock, G.dom.hint);
}

function renderDock() {
  const st = G.app.state;
  const n = partyCandidates(st).length;
  G.dom.dock.exp.disabled = n === 0;
  G.dom.dock.exp.title = n ? 'Choose up to 3 kin to venture into the Gloom' : 'Hatch a creature first';
  G.dom.dock.memN.textContent = st.memorials.length ? String(st.memorials.length) : '';
  G.dom.dock.el.classList.toggle('hidden', !!G.sel && G.app.width < 760);
  const eggs = st.creatures.filter(isEgg).length;
  let hint = '';
  if (!G.sel) hint = st.actionsLeft === 0 ? 'Out of actions — end the day to rest' : eggs === st.creatures.length ? 'Tap an egg to pet it' : 'Tap a kin to care for it';
  G.dom.hint.textContent = hint;
  G.dom.hint.style.display = hint && !document.querySelector('.modal-wrap') ? '' : 'none';
}

// ------------------------------------------------------------------ DOM: care panel
function buildCare() {
  const care = h('aside', 'panel care closed');
  care.setAttribute('aria-label', 'Creature care');
  care.innerHTML = `
    <div class="care-head">
      <canvas class="portrait" width="64" height="64"></canvas>
      <div class="care-title"><h2 data-r="name"></h2><div class="care-tags" data-r="tags"></div></div>
      <button class="btn btn-icon btn-ghost" data-r="close" aria-label="Close">${ICON.close}</button>
    </div>
    <div class="care-body" data-r="body"></div>`;
  care.querySelector('[data-r=close]').onclick = () => select(null);
  G.dom.care = { el: care, name: care.querySelector('[data-r=name]'), tags: care.querySelector('[data-r=tags]'), body: care.querySelector('[data-r=body]'), portrait: care.querySelector('.portrait') };
  G.portraitCtx = G.dom.care.portrait.getContext('2d');
  G.app.ui.append(care);
}

function bar(label, val, max, color, extra = '', mark = null) {
  const pct = clamp((val / max) * 100, 0, 100);
  const m = mark != null ? ` bar-mark" style="--m:${clamp((mark / max) * 100, 0, 100)}%` : '';
  return `<span class="bar-label">${label}</span>
    <div class="bar${m}"><i style="--v:${pct}%;--c:${color}"></i></div>
    <span class="bar-val">${val}<small>${extra}</small></span>`;
}

function renderCare() {
  const st = G.app.state;
  const d = G.dom.care;
  const c = G.sel && getCreature(st, G.sel);
  d.el.classList.toggle('closed', !c);
  if (!c) return;
  const sp = speciesOf(c.species);
  const egg = isEgg(c);
  const el = elementOf(c);
  const pers = personalityOf(c);
  d.name.textContent = c.name;
  d.portrait.style.setProperty('--tint', EL_TINT[el]);
  const stage = { egg: 'Egg', baby: 'Baby', adult: 'Adult' }[stageOf(c)];
  d.tags.innerHTML = `
    <span class="chip chip-${el}"><span class="dot"></span>${el[0].toUpperCase() + el.slice(1)}</span>
    <span class="chip">${stage}${egg || c.name === sp.name ? '' : ' · ' + esc(sp.name)}</span>
    ${c.affliction ? `<span class="chip chip-bad">${esc(AFFLICTIONS.find((a) => a.id === c.affliction)?.name || c.affliction)}</span>` : ''}
    ${c.legacy ? `<span class="chip chip-gold">Heir of ${esc(c.legacy.from)}</span>` : ''}`;

  const hint = evolutionHint(st, c);
  let evo = '';
  if (egg) {
    let pips = '';
    for (let i = 0; i < TUNING.HATCH_PETS; i++) pips += `<i class="${i < c.pets ? 'on' : ''}"></i>`;
    evo = `<div class="evo"><div class="evo-title">${ICON.spark.replace('<svg', '<svg width="16" height="16"')}${esc(hint.title)}</div><div class="egg-progress">${pips}</div>
      ${c.legacy ? `<div class="muted" style="font-size:12.5px">Carries ${esc(c.legacy.from)}'s spark: +${c.legacy.might} Might, +${c.legacy.wit} Wit, +${c.legacy.heart} Heart on hatching.</div>` : ''}</div>`;
  } else if (stageOf(c) === 'adult') {
    evo = `<div class="evo"><div class="evo-title">${ICON.spark.replace('<svg', '<svg width="16" height="16"')}Fully grown</div><div class="muted" style="font-size:12.5px">Keep training up to ${TUNING.STAT_CAP} in each stat.</div></div>`;
  } else {
    const title = hint.waitDays > 1 ? `Can grow up in ${hint.waitDays} days` : hint.waitDays === 1 ? 'Can grow up at the next dawn' : 'Grows up at dawn when a path is met';
    const lines = hint.lines.map((l) => `<div class="evo-line"><b>${esc(l.name)}</b>${l.reqs.map((r) => `<span class="req${r.have >= r.need ? ' met' : ''}">${r.label} ${r.have}/${r.need}</span>`).join('')}</div>`).join('');
    evo = `<div class="evo"><div class="evo-title">${ICON.spark.replace('<svg', '<svg width="16" height="16"')}${title}</div>${lines}</div>`;
  }

  let stats = '';
  if (!egg) {
    stats = `<div class="bars">
      ${bar('Might', c.might, TUNING.STAT_CAP, 'var(--might)')}
      ${bar('Wit', c.wit, TUNING.STAT_CAP, 'var(--wit)')}
      ${bar('Heart', c.heart, TUNING.STAT_CAP, 'var(--heart)')}
      ${bar('HP', c.hp, c.maxHp, 'var(--hp)', `/${c.maxHp}`)}
      ${bar('Bond', c.bond, TUNING.BOND_MAX, 'var(--bond)', '', TUNING.BOND_TRAIN_BONUS_AT)}
      ${bar('Stress', c.stress, TUNING.STRESS_MAX, c.stress >= TUNING.MOOD_FRAZZLED_STRESS ? 'var(--bad)' : c.stress >= TUNING.MOOD_UNEASY_STRESS ? 'var(--warn)' : 'var(--stress)', '', TUNING.TRAIN_REFUSE_STRESS)}
    </div>
    <div class="trait"><span><b>${esc(pers.name)}</b> <span class="muted">· ${esc(pers.id === 'unformed' ? `Personality forms after ${TUNING.PERSONALITY_MIN_ACTIONS} of one action.` : pers.desc)}</span></span></div>`;
  } else {
    stats = `<p class="muted" style="font-size:13.5px">A warm, wobbly egg. It only wants gentle pets for now.</p>`;
  }

  const acts = GARDEN_ACTIONS.map((a) => {
    const chk = canDoAction(st, c.uid, a.id);
    const eff = Object.entries(a.effects).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${STAT_LABEL[k] || k}`).slice(0, 2).join(', ');
    const sub = chk.ok ? (egg ? 'Helps it hatch' : eff) : chk.reason;
    return `<button class="act" data-act="${a.id}" style="--c:${ACT_COLOR[a.id]}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? a.name + ': ' + eff : chk.reason)}">
      ${ICON[a.id]}<span class="an">${a.name}</span><span class="ae">${esc(sub)}</span></button>`;
  }).join('');

  d.body.innerHTML = `${stats}${evo}
    <div class="acts-label"><span>Care &amp; training</span><span>${st.actionsLeft} action${st.actionsLeft === 1 ? '' : 's'} left</span></div>
    <div class="acts">${acts}</div>`;
  d.body.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => act(c.uid, b.dataset.act); });
}

function refresh() {
  syncActors();
  renderHud();
  renderCare();
  renderDock();
}

function select(uid) {
  G.sel = uid;
  refresh();
}

function act(uid, actionId) {
  const app = G.app;
  const res = doAction(app.state, uid, actionId);
  if (!res.ok) { app.toast(res.reason); return; }
  app.save();
  playEvents(uid, actionId, res);
  refresh();
}

// ------------------------------------------------------------------ modals
function modal(inner, cls = '') {
  const m = h('div', 'modal-wrap');
  m.innerHTML = `<div class="panel modal ${cls}" role="dialog" aria-modal="true">${inner}</div>`;
  const close = () => { m.remove(); renderDock(); };
  m.addEventListener('pointerdown', (e) => { if (e.target === m) close(); });
  G.app.ui.append(m);
  renderDock();
  return { el: m, box: m.firstElementChild, close };
}

function askEndDay() {
  const st = G.app.state;
  if (st.actionsLeft <= 0) { doEndDay(); return; }
  const m = modal(`
    <h2>End day ${st.day}?</h2>
    <p class="muted">You still have ${st.actionsLeft} action${st.actionsLeft === 1 ? '' : 's'} left. Kin who got no care today lose ${-TUNING.NEGLECT_BOND} Bond overnight.</p>
    <div class="actions-row"><button class="btn btn-ghost" data-a="no">Not yet</button><button class="btn btn-primary" data-a="yes">${ICON.moon}Sleep</button></div>`);
  m.box.querySelector('[data-a=no]').onclick = m.close;
  m.box.querySelector('[data-a=yes]').onclick = () => { m.close(); doEndDay(); };
}

function doEndDay(res) {
  const app = G.app;
  const r = res || endDay(app.state);
  app.save();
  G.night = 1;
  const neglected = r.events.filter((e) => e.type === 'neglected').map((e) => getCreature(app.state, e.uid)?.name).filter(Boolean);
  setTimeout(() => {
    app.toast(`Day ${app.state.day} dawns`);
    for (const e of r.events) {
      if (e.type === 'evolved') celebrate(e);
      if (e.type === 'cured') { const c = getCreature(app.state, e.uid); if (c) app.toast(`${c.name} feels itself again.`); }
    }
    if (neglected.length) app.toast(`${neglected.join(', ')} felt a little lonely (−${-TUNING.NEGLECT_BOND} Bond)`);
    refresh();
  }, res ? 0 : 450);
  refresh();
}

function portrait(cv, c) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = cv.clientWidth || 56;
  cv.width = s * dpr; cv.height = s * dpr;
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const id = spriteIdOf(c);
  const m = spriteMeta(id);
  const k = Math.min((s * 0.82) / m.h, (s * 0.9) / m.w);
  drawCreature(x, id, s / 2, s * 0.93, { scale: k, t: 0.4, mood: moodOf(c), element: elementOf(c), shadow: false });
}

function openPicker() {
  const st = G.app.state;
  const cands = partyCandidates(st);
  if (!cands.length) { G.app.toast('Hatch a creature first'); return; }
  const picked = new Set(cands.slice(0, TUNING.PARTY_SIZE).filter((c) => c.stress < TUNING.MOOD_FRAZZLED_STRESS).map((c) => c.uid));
  const rows = cands.map((c) => {
    const aff = c.affliction ? `<span class="chip chip-bad">${esc(AFFLICTIONS.find((a) => a.id === c.affliction)?.name || '')}</span>` : '';
    return `<button class="pick" data-uid="${c.uid}" aria-pressed="false" style="--tint:${EL_TINT[elementOf(c)]}">
      <canvas></canvas>
      <span class="pick-info">
        <span class="pick-name">${esc(c.name)} <span class="chip chip-${elementOf(c)}"><span class="dot"></span>${c.might}/${c.wit}/${c.heart}</span>${aff}</span>
        <span class="mini-bars">
          <span>HP</span><span class="bar"><i style="--v:${(c.hp / c.maxHp) * 100}%;--c:var(--hp)"></i></span>
          <span>Stress</span><span class="bar"><i style="--v:${c.stress}%;--c:${c.stress >= 70 ? 'var(--bad)' : c.stress >= 30 ? 'var(--warn)' : 'var(--stress)'}"></i></span>
        </span>
      </span>
      <span class="check">${ICON.check}</span>
    </button>`;
  }).join('');
  const m = modal(`
    <h2>Into the Gloom</h2>
    <p class="muted">Choose 1–${TUNING.PARTY_SIZE} kin. Three floors, a Hollow Warden at the bottom — and not everyone comes home.</p>
    <div class="picker-list">${rows}</div>
    ${st.actionsLeft > 0 ? `<p class="warn-note">${ICON.moon.replace('<svg', '<svg width="16" height="16" style="flex:none;margin-top:2px"')}Setting out ends the day (${st.actionsLeft} action${st.actionsLeft === 1 ? '' : 's'} unused).</p>` : ''}
    <div class="actions-row"><button class="btn btn-ghost" data-a="no">Stay home</button><button class="btn btn-primary" data-a="go">Set out</button></div>`);
  const go = m.box.querySelector('[data-a=go]');
  const sync = () => {
    m.box.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.uid))));
    go.disabled = picked.size === 0;
    go.textContent = picked.size ? `Set out with ${picked.size}` : 'Pick at least one';
  };
  m.box.querySelectorAll('.pick').forEach((b) => {
    portrait(b.querySelector('canvas'), getCreature(st, b.dataset.uid));
    b.onclick = () => {
      const u = b.dataset.uid;
      if (picked.has(u)) picked.delete(u);
      else if (picked.size < TUNING.PARTY_SIZE) picked.add(u);
      else G.app.toast(`Up to ${TUNING.PARTY_SIZE} kin per expedition`);
      sync();
    };
  });
  m.box.querySelector('[data-a=no]').onclick = m.close;
  go.onclick = () => {
    const party = cands.map((c) => c.uid).filter((u) => picked.has(u));
    beginExpedition(st, party);
    G.app.save();
    G.app.go('expedition', { party });
  };
  sync();
}

function openMemorial() {
  const st = G.app.state;
  const stones = st.memorials.slice().reverse().map((mm) => `
    <div class="stone"><div class="stone-ico"><i></i></div>
      <div><b>${esc(mm.name)}</b><small>${mm.name === nameOfSpecies(mm.species) ? '' : esc(nameOfSpecies(mm.species)) + ' · '}Fell on day ${mm.day} · ${esc(mm.cause || 'lost in the Gloom')}</small>
      <small>Emberstone of ${STAT_LABEL[mm.highestStat] || mm.highestStat}</small></div></div>`).join('');
  const e = st.emberstones;
  const sum = ['might', 'wit', 'heart'].filter((k) => e[k]).map((k) => `<span class="chip chip-gold">${STAT_LABEL[k]} training +${Math.min(e[k], TUNING.EMBERSTONE_MAX_PER_STAT) * TUNING.EMBERSTONE_TRAIN_BONUS}</span>`).join('');
  const m = modal(`
    <h2>Memorial stones</h2>
    <p class="muted">Every kin lost in the Gloom leaves an Emberstone. Their spark helps everyone who trains here.</p>
    ${sum ? `<div class="ember-sum">${sum}</div>` : ''}
    <div class="stones">${stones || '<div class="empty">No stones yet. May it stay that way.</div>'}</div>
    <div class="actions-row"><button class="btn btn-ghost" data-a="ok">Close</button></div>`);
  m.box.querySelector('[data-a=ok]').onclick = m.close;
}

function showResults(sum) {
  const win = sum.outcome === 'cleared';
  const fallen = sum.fallen || [];
  const legacy = sum.hatchedLegacy || [];
  const m = modal(`
    <div class="result-hero">
      <span class="badge ${win ? 'win' : 'lose'}">${win ? 'Expedition cleared' : 'Party lost'}</span>
      <h2>${win ? 'The Warden falls!' : 'The Gloom took them'}</h2>
      <p class="muted">${win ? 'Your kin come home tired, proud and a little singed.' : 'The garden is quieter tonight.'}</p>
    </div>
    <div class="stats-row">
      <div class="stat-box"><b>${sum.floorReached ?? '?'}</b><small>Floor reached</small></div>
      <div class="stat-box"><b>+${sum.motes ?? 0}</b><small>Motes</small></div>
    </div>
    ${fallen.length ? `<div class="name-list"><div class="row"><b>Fallen:</b> ${fallen.map((n) => `<span class="chip chip-bad">${esc(n)}</span>`).join('')}</div>
      ${legacy.length ? `<div class="row"><b>Legacy eggs:</b> ${legacy.map((n) => `<span class="chip chip-gold">${esc(n)}</span>`).join('')}</div>` : ''}
      <p class="muted" style="font-size:13px">Their Emberstones now rest in the garden.</p></div>` : ''}
    <div class="actions-row"><button class="btn btn-primary" data-a="ok">Back to the garden</button></div>`, 'results');
  m.box.querySelector('[data-a=ok]').onclick = m.close;
}

// ------------------------------------------------------------------ world drawing
function heartPath(c, s) {
  c.beginPath();
  c.moveTo(0, s * 0.35);
  c.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.5, -s * 1.05, 0, -s * 0.45);
  c.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  c.closePath();
}
function star(c, r) {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const rr = i % 2 ? r * 0.36 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  c.closePath();
}

function drawFx(c, p, x, y, k) {
  const age = p.age;
  if (age < 0) return;
  const f = age / p.life;
  const alpha = f < 0.15 ? f / 0.15 : 1 - Math.max(0, (f - 0.6) / 0.4);
  c.save();
  c.globalAlpha = clamp(alpha, 0, 1);
  if (p.kind === 'text') {
    const fs = clamp(17 * Math.sqrt(k), 13, 22);
    const yy = y + (p.y * k) - 46 + p.vy * age * (1 - f * 0.35);
    c.font = `900 ${fs}px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(40,18,52,0.85)'; c.lineJoin = 'round';
    const pop = f < 0.12 ? 0.7 + (f / 0.12) * 0.4 : f < 0.2 ? 1.1 - ((f - 0.12) / 0.08) * 0.1 : 1;
    c.translate(x, yy); c.scale(pop, pop);
    c.strokeText(p.text, 0, 0);
    c.fillStyle = p.color; c.fillText(p.text, 0, 0);
    c.restore();
    return;
  }
  const px = x + (p.x + p.vx * age) * k;
  const grav = p.kind === 'fruit' ? 140 : p.kind === 'spark' ? 60 : 0;
  const py = y + (p.y + p.vy * age + 0.5 * grav * age * age) * k + (p.kind === 'z' ? 0 : 0);
  const sway = p.kind === 'z' || p.kind === 'note' || p.kind === 'heart' ? Math.sin(age * 5 + p.rot * 6) * 8 * k : 0;
  c.translate(px + sway, py);
  const s = 12 * p.size * Math.max(0.6, k);
  c.lineWidth = 2.5; c.strokeStyle = 'rgba(52,22,58,0.9)'; c.lineJoin = 'round';
  switch (p.kind) {
    case 'heart':
      heartPath(c, s); c.fillStyle = '#ff6f9e'; c.fill(); c.stroke();
      c.beginPath(); c.arc(-s * 0.32, -s * 0.38, s * 0.15, 0, TAU); c.fillStyle = '#ffd3e2'; c.fill();
      break;
    case 'fruit':
      c.rotate(p.rot + age * 2);
      c.beginPath(); c.arc(0, 0, s * 0.62, 0, TAU); c.fillStyle = '#ff6a4a'; c.fill(); c.stroke();
      c.beginPath(); c.ellipse(s * 0.3, -s * 0.72, s * 0.35, s * 0.18, -0.5, 0, TAU); c.fillStyle = '#7bd35a'; c.fill(); c.stroke();
      c.beginPath(); c.arc(-s * 0.2, -s * 0.22, s * 0.16, 0, TAU); c.fillStyle = '#ffc2a8'; c.fill();
      break;
    case 'z':
    case 'q':
    case 'note': {
      const ch = p.kind === 'z' ? 'Z' : p.kind === 'q' ? '?' : (p.size > 1 ? '♫' : '♪');
      const fs = s * (p.kind === 'z' ? 1.5 + f : 1.7);
      if (p.kind === 'q') { c.beginPath(); c.arc(0, 0, s * 1.05, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill(); c.stroke(); }
      c.font = `900 ${fs}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (p.kind !== 'q') { c.lineWidth = 4; c.strokeText(ch, 0, 0); }
      c.fillStyle = p.kind === 'z' ? '#c9d6ff' : p.kind === 'q' ? '#3a7fd0' : '#ffd45a';
      c.fillText(ch, 0, p.kind === 'q' ? s * 0.08 : 0);
      break;
    }
    case 'spark':
      c.rotate(p.rot + age * 4);
      star(c, s * 0.9); c.fillStyle = p.color === '#ff7b57' ? '#ffe36b' : p.color; c.fill();
      c.lineWidth = 1.5; c.stroke();
      break;
    default: break;
  }
  c.restore();
}

function nameTag(c, text, x, y, k, selected, mood) {
  const fs = clamp(12.5 * Math.sqrt(k / 0.8), 11, 15);
  c.save();
  c.font = `800 ${fs}px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif`;
  const w = c.measureText(text).width + 18 + (mood ? 12 : 0);
  const hh = fs + 9;
  c.globalAlpha = selected ? 1 : 0.88;
  c.fillStyle = selected ? '#ffd45a' : 'rgba(30,20,46,0.78)';
  c.beginPath(); c.roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); c.fill();
  if (mood) {
    c.beginPath(); c.arc(x - w / 2 + 11, y, 4, 0, TAU);
    c.fillStyle = mood === 'happy' ? '#8fe07a' : mood === 'neutral' ? '#ffbf5a' : '#ff6a6a'; c.fill();
  }
  c.fillStyle = selected ? '#3a1f12' : '#fbf3e6';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x + (mood ? 6 : 0), y + 0.5);
  c.restore();
}

function viewTarget(app, w, h) {
  const care = G.dom.care?.el;
  if (!G.sel || !care || care.classList.contains('closed')) return { x: 0, w, h };
  const r = care.getBoundingClientRect();
  if (w < 760) return { x: 0, w, h: clamp(r.top + 10, h * 0.36, h) };
  return { x: 0, w: clamp(r.left - 6, w * 0.55, w), h };
}

function screenPos(a, V) {
  const p = groundToScreen(a.u, a.v, V.w, V.h, 'garden');
  return { x: V.x + p.x, y: p.y, scale: p.scale };
}

// ------------------------------------------------------------------ screen
export default {
  enter(app, params = {}) {
    G.app = app;
    G.actors = new Map();
    G.fx = [];
    G.sel = null;
    G.view.init = false;
    G.night = 0;
    if (!app.state) { app.go('title'); return; }
    let ended = null;
    if (app.state.pendingExpedition) { ended = finishExpedition(app.state); app.save(); }
    buildHud();
    buildDock();
    buildCare();
    refresh();
    if (params.returned) showResults(params.returned);
    if (ended) doEndDay(ended);
    if (params.fresh) app.toast('Three eggs wait in the garden. Pet them!');
    G.onKey = (e) => {
      if (e.key === 'Escape') { const m = document.querySelector('.modal-wrap'); if (m) { m.remove(); renderDock(); } else select(null); }
    };
    window.addEventListener('keydown', G.onKey);
  },

  exit() {
    window.removeEventListener('keydown', G.onKey);
    G.sel = null;
  },

  update(app, dt) {
    G.t += dt;
    G.night = Math.max(0, G.night - dt * 0.9);
    const st = app.state;
    if (!st) return;
    for (const c of st.creatures) {
      const a = G.actors.get(c.uid);
      if (!a) continue;
      a.hop = Math.max(0, a.hop - dt);
      a.nudge = Math.max(0, a.nudge - dt);
      if (a.flash > 0) {
        const before = a.flash;
        a.flash = Math.max(0, a.flash - dt);
        if (before > 0.8 && a.flash <= 0.8 && a.pendingId) { a.showId = a.pendingId; a.pendingId = null; }
      } else if (!a.pendingId) a.showId = spriteIdOf(c);
      if (isEgg(c) || a.flash > 0) continue;
      const selected = G.sel === c.uid;
      const du = a.tu - a.u, dv = a.tv - a.v;
      const dist = Math.hypot(du, dv);
      if (dist > 0.005 && !selected) {
        const sp = (moodOf(c) === 'stressed' ? 0.035 : 0.06) * dt;
        const k = Math.min(1, sp / dist);
        a.u += du * k; a.v += dv * k;
        if (Math.abs(du) > 0.004) a.facing = du > 0 ? 1 : -1;
        a.walkT += dt;
      } else {
        a.walkT = 0;
        a.wait -= dt;
        if (a.wait <= 0 && !selected) {
          a.wait = rand(4, 10);
          // wander to a nearby spot that no one else is heading to
          const others = [...G.actors.values()].filter((o) => o !== a);
          let best = null;
          for (let i = 0; i < 8; i++) {
            const base = Math.random() < 0.5 ? GARDEN_SPOTS[Math.floor(Math.random() * GARDEN_SPOTS.length)] : { u: a.u, v: a.v };
            const cand = { u: clamp(base.u + rand(-0.1, 0.1), 0.08, 0.86), v: clamp(base.v + rand(-0.1, 0.1), 0.0, 0.95) };
            if (Math.hypot(cand.u - a.u, cand.v - a.v) > 0.35) continue;
            const sx = groundToScreen(cand.u, cand.v, 1000, 700, 'garden').x;
            if (sx < 140 || sx > 800) continue; // stay clear of the edges and the care panel
            if (others.some((o) => sep(cand, { u: o.tu, v: o.tv }) < 150 || sep(cand, o) < 150)) continue;
            if (!GARDEN_SPOTS.some((s) => Math.hypot(s.u - cand.u, s.v - cand.v) < 0.16)) continue;
            best = cand; break;
          }
          if (best) { a.tu = best.u; a.tv = best.v; }
        }
      }
    }
    for (const p of G.fx) p.age += dt;
    G.fx = G.fx.filter((p) => p.age < p.life);
  },

  draw(app, ctx, w, h, t) {
    const st = app.state;
    if (!st) return;
    const tgt = viewTarget(app, w, h);
    const V = G.view;
    if (!V.init || Math.abs(V.w - tgt.w) > w || Math.abs(V.h - tgt.h) > h) { Object.assign(V, tgt, { init: true }); }
    const k = 1 - Math.pow(0.0015, Math.min(0.05, 1 / 60));
    V.x = lerp(V.x, tgt.x, k); V.w = lerp(V.w, tgt.w, k); V.h = lerp(V.h, tgt.h, k);

    // backdrop behind panels
    ctx.fillStyle = '#5f9a4a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(V.x, 0, V.w, V.h); ctx.clip();
    ctx.translate(V.x, 0);
    drawGarden(ctx, V.w, V.h, t);
    ctx.restore();
    if (V.h < h - 1) {
      const g = ctx.createLinearGradient(0, V.h - 30, 0, h);
      g.addColorStop(0, 'rgba(30,20,46,0)'); g.addColorStop(0.2, 'rgba(30,20,46,0.6)'); g.addColorStop(1, '#1e162e');
      ctx.fillStyle = g; ctx.fillRect(0, V.h - 30, w, h - V.h + 30);
    }
    if (V.w < w - 1) {
      ctx.fillStyle = '#1e162e';
      ctx.fillRect(V.x + V.w, 0, w - V.w, h);
    }

    // memorial stones at the garden's edge
    G.stoneBoxes = [];
    st.memorials.slice(-5).forEach((mm, i) => {
      const p = groundToScreen(0.02 + (i % 3) * 0.045, 0.32 + Math.floor(i / 3) * 0.08 + (i % 2) * 0.03, V.w, V.h, 'garden');
      const s = p.scale * 0.9;
      ctx.save();
      G.stoneBoxes.push({ x: V.x + p.x, y: p.y, r: Math.max(24, 26 * s) });
      ctx.translate(V.x + p.x, p.y);
      ctx.fillStyle = 'rgba(24,12,44,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 0, 20 * s, 6 * s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7d7392'; ctx.strokeStyle = '#3c3350'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.lineTo(-14 * s, -24 * s); ctx.arc(0, -24 * s, 14 * s, Math.PI, 0); ctx.lineTo(14 * s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      const fl = 1 + 0.12 * Math.sin(t * 5 + i);
      const gg = ctx.createRadialGradient(0, -22 * s, 0, 0, -22 * s, 16 * s * fl);
      gg.addColorStop(0, 'rgba(255,190,90,0.95)'); gg.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, -22 * s, 16 * s * fl, 0, TAU); ctx.fill();
      ctx.restore();
    });

    // creatures, far to near
    const items = st.creatures.map((c) => {
      const a = G.actors.get(c.uid);
      return a ? { c, a, p: screenPos(a, V) } : null;
    }).filter(Boolean).sort((x, y) => x.p.y - y.p.y);

    for (const { c, a, p } of items) {
      const egg = isEgg(c);
      const sel = G.sel === c.uid;
      const k = p.scale * (egg ? 0.85 : 1);
      const m = spriteMeta(a.showId) || { h: 100, w: 100 };
      let lift = 0;
      if (a.hop > 0) lift = Math.sin((1 - a.hop / 0.55) * Math.PI) * 26 * a.hopH;
      if (a.walkT > 0) lift += Math.abs(Math.sin(a.walkT * 9)) * 5;
      const wob = egg ? Math.sin(t * 2 + a.seed) * 0.03 + (a.nudge > 0 ? Math.sin(a.nudge * 30) * 0.12 * a.nudge : 0) : 0;
      if (sel) {
        const pulse = 1 + 0.06 * Math.sin(t * 4);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 0.32);
        ctx.beginPath(); ctx.arc(0, 0, m.w * 0.62 * k * pulse, 0, TAU);
        ctx.fillStyle = 'rgba(255,212,90,0.22)'; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,212,90,0.95)'; ctx.stroke();
        ctx.restore();
      }
      if (a.flash > 0) {
        const f = a.flash / 1.6;
        const r = m.h * k * (1.1 + (1 - f) * 0.6);
        const g = ctx.createRadialGradient(p.x, p.y - m.h * k * 0.5, 0, p.x, p.y - m.h * k * 0.5, r);
        g.addColorStop(0, `rgba(255,250,220,${0.9 * Math.sin(f * Math.PI)})`); g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y - m.h * k * 0.5, r, 0, TAU); ctx.fill(); ctx.restore();
      }
      ctx.save();
      if (wob) { ctx.translate(p.x, p.y); ctx.rotate(wob); ctx.translate(-p.x, -p.y); }
      if (lift) ctx.translate(0, -lift * Math.max(0.6, k));
      const flashK = a.flash > 0 ? Math.sin((a.flash / 1.6) * Math.PI) : 0;
      if (flashK > 0.2) ctx.filter = `brightness(${1 + flashK * 1.6}) saturate(${1 - flashK * 0.6})`;
      drawCreature(ctx, a.showId, p.x, p.y, {
        scale: k, t, facing: a.facing, mood: egg ? 'neutral' : moodOf(c), element: a.element, seed: a.seed,
        shadow: true,
      });
      ctx.restore();
    }
    // name tags + effects above everything
    for (const { c, a, p } of items) {
      const m = spriteMeta(a.showId) || { h: 100 };
      const k = p.scale * (isEgg(c) ? 0.85 : 1);
      const sel = G.sel === c.uid;
      if (sel || !isEgg(c)) nameTag(ctx, c.name, p.x, p.y - m.h * k - 14, k, sel, isEgg(c) ? null : moodOf(c));
    }
    for (const fx of G.fx) {
      const it = items.find((i) => i.a.uid === fx.uid);
      if (!it) continue;
      drawFx(ctx, fx, it.p.x, it.p.y, it.p.scale);
    }

    if (G.night > 0) {
      ctx.fillStyle = `rgba(20,14,48,${Math.sin(Math.min(1, G.night) * Math.PI) * 0.85})`;
      ctx.fillRect(0, 0, w, h);
    }

    // selected portrait
    const sc = G.sel && getCreature(st, G.sel);
    if (sc && G.portraitCtx) {
      const cv = G.dom.care.portrait;
      const s = cv.clientWidth || 64;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(s * dpr)) { cv.width = Math.round(s * dpr); cv.height = Math.round(s * dpr); }
      const x = G.portraitCtx;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, s, s);
      const id = G.actors.get(sc.uid)?.showId || spriteIdOf(sc);
      const m = spriteMeta(id);
      const kk = Math.min((s * 0.8) / m.h, (s * 0.88) / m.w);
      drawCreature(x, id, s / 2, s * 0.92, { scale: kk, t, mood: isEgg(sc) ? 'neutral' : moodOf(sc), element: elementOf(sc), shadow: false, facing: 1 });
    }
  },

  pointer(app, ev) {
    if (ev.type !== 'down' || !app.state) return;
    const V = G.view;
    const hits = app.state.creatures.map((c) => {
      const a = G.actors.get(c.uid);
      if (!a) return null;
      const p = screenPos(a, V);
      const m = spriteMeta(a.showId) || { h: 100, w: 100 };
      const k = p.scale * (isEgg(c) ? 0.85 : 1);
      const hw = Math.max(26, m.w * k * 0.45), hh = Math.max(44, m.h * k);
      const inside = ev.x > p.x - hw && ev.x < p.x + hw && ev.y > p.y - hh && ev.y < p.y + 12;
      return inside ? { c, y: p.y } : null;
    }).filter(Boolean).sort((a, b) => b.y - a.y);
    if (!hits.length && (G.stoneBoxes || []).some((b) => Math.abs(ev.x - b.x) < b.r && ev.y < b.y + 8 && ev.y > b.y - b.r * 2.2)) {
      openMemorial();
      return;
    }
    if (hits.length) {
      const uid = hits[0].c.uid;
      const a = G.actors.get(uid);
      if (a && G.sel !== uid) { a.hop = 0.4; a.hopH = 0.5; a.tu = a.u; a.tv = a.v; }
      select(uid);
    } else if (G.sel) {
      select(null);
    }
  },
};

export { G as _gardenDebug };
