// Kindlekin — expedition screen (Dungeon agent): node map, auto-battles, rests, events,
// boon picks, floor clears and the results hand-off back to the garden (docs/CONTRACT.md).

import { getCreature, effectiveStats, recordDeath, spriteIdOf } from '../state.js';
import { createRng } from '../rng.js';
import { TUNING as T, BOONS, AFFLICTIONS, VIRTUES } from '../data.js';
import { DUNGEON_FLOORS } from '../scenes.js';
import { drawCreature, spriteMeta } from '../sprites.js';
import {
  createRun, makeFighter, choices, enterNode, startBattle, finishBattle, resolveRest, resolveEvent,
  pickBoon, completeNode, applyRunToSave, living, NODE_INFO,
} from '../run.js';
import { createBattleView, drawPartyIdle } from './exp-battle-view.js';
import { NODE_ICONS, BOON_ICONS, ICON } from './exp-icons.js';

const BOON = Object.fromEntries(BOONS.map((b) => [b.id, b]));
const STATUS = Object.fromEntries([...AFFLICTIONS, ...VIRTUES].map((x) => [x.id, x]));
const EL_COL = { fire: 'var(--fire)', water: 'var(--water)', leaf: 'var(--leaf)', shadow: 'var(--shadow-el)' };
const TINT = { fire: '#7a3a2a', water: '#2a4a7a', leaf: '#35602e', shadow: '#4a3d63' };
const SPEED_KEY = 'kindlekin.xp.speed';
const NODE_LABEL = { fight: 'Fight', elite: 'Elite', rest: 'Rest', event: '?', boss: 'Warden' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const loadSpeed = () => { try { return localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1; } catch { return 1; } };
const saveSpeed = (s) => { try { localStorage.setItem(SPEED_KEY, String(s)); } catch { /* storage unavailable */ } };

function ensureCss() {
  if (document.getElementById('xp-css')) return;
  const l = document.createElement('link');
  l.id = 'xp-css'; l.rel = 'stylesheet'; l.href = new URL('./expedition.css', import.meta.url).href;
  document.head.append(l);
}

const X = {
  enter(app, params = {}) {
    ensureCss();
    this.app = app;
    this.timers = [];
    this.applied = null;
    const st = app.state;
    let uids = (params.party || []).filter((u) => getCreature(st, u));
    if (!uids.length) uids = st.creatures.filter((c) => c.hatchedDay != null && spriteIdOf(c) !== 'egg' && c.hp > 0).slice(0, T.PARTY_SIZE).map((c) => c.uid);
    if (!uids.length) { app.toast('Nobody is ready for the Gloom yet.'); app.go('garden'); return; }
    const party = uids.slice(0, T.PARTY_SIZE).map((u) => {
      const c = getCreature(st, u);
      return makeFighter(c, { ...effectiveStats(st, c), sprite: spriteIdOf(c) });
    });
    // seed the run from the save's rng stream and advance it
    const r = createRng(st.seed || 1);
    const runSeed = r.int(1, 0x7fffffff);
    st.seed = r.getState();
    this.run = createRun({ party, seed: params.seed ?? runSeed });
    this.speed = loadSpeed();
    this.view = 'map';
    this.bv = null;

    this.root = h('div', 'xp');
    app.ui.append(this.root);
    this.renderShell();
    this.showMap();
  },

  exit() {
    for (const t of this.timers || []) clearTimeout(t);
    this.timers = [];
    this.bv = null;
  },

  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); },

  // ------------------------------------------------------------ shell (top bar, boons, banner)
  renderShell() {
    const R = this.root;
    R.innerHTML = '';
    this.top = h('header', 'xp-top');
    this.floorEl = h('div', 'panel xp-floor');
    const right = h('div', 'xp-top-right');
    this.motesEl = h('div', 'panel xp-motes', `<i class="mote-ico" aria-hidden="true"></i><b>0</b>`);
    this.motesEl.setAttribute('aria-label', 'Motes found');
    this.speedBtn = h('button', 'btn xp-speed', '');
    this.speedBtn.type = 'button';
    this.speedBtn.onclick = () => { this.speed = this.speed === 2 ? 1 : 2; saveSpeed(this.speed); this.bv?.setSpeed(this.speed); this.updateSpeed(); };
    right.append(this.motesEl, this.speedBtn);
    this.top.append(this.floorEl, right);
    this.boonsEl = h('div', 'xp-boons');
    this.main = h('div', 'xp-main pass');
    this.partyEl = h('div', 'xp-party');
    this.bannerWrap = h('div', 'xp-banner-wrap');
    R.append(this.top, this.boonsEl, this.main, this.partyEl, this.bannerWrap);
    this.updateSpeed();
    this.updateTop();
  },

  updateSpeed() {
    this.speedBtn.innerHTML = `${ICON.speed}<span>${this.speed}×</span>`;
    this.speedBtn.setAttribute('aria-pressed', String(this.speed === 2));
    this.speedBtn.setAttribute('aria-label', `Battle speed ${this.speed}x`);
    this.speedBtn.hidden = this.view !== 'battle';
  },

  updateTop(round) {
    const run = this.run, F = DUNGEON_FLOORS[run.floor];
    const step = Math.min(run.step + 1, T.STEPS_PER_FLOOR);
    const sub = this.view === 'battle' ? `Round <span class="xp-round">${round || 1}</span> · ${esc(NODE_INFO[run.current?.type]?.name || 'Battle')}` : `Step ${step} of ${T.STEPS_PER_FLOOR}`;
    this.floorEl.style.setProperty('--fl', F.light);
    this.floorEl.innerHTML = `<div class="xp-floor-num" aria-hidden="true">${run.floor}</div><div class="xp-floor-txt"><b>${esc(F.name)}</b><span>Floor ${run.floor} · ${sub}</span></div>`;
    this.motesEl.querySelector('b').textContent = run.motes;
    this.boonsEl.innerHTML = '';
    for (const id of run.boons) {
      const b = BOON[id];
      const el = h('button', 'xp-boon-ico', BOON_ICONS[id] || '');
      el.type = 'button'; el.title = `${b.name}: ${b.desc}`; el.setAttribute('aria-label', `${b.name}: ${b.desc}`);
      el.onclick = () => this.app.toast(`${b.name}: ${b.desc}`);
      this.boonsEl.append(el);
    }
  },

  renderParty() {
    const P = this.partyEl;
    P.innerHTML = '';
    P.hidden = this.view === 'battle';
    P.style.setProperty('--n', this.run.party.length);
    for (const m of this.run.party) {
      const card = h('div', `panel xp-mem${m.dead ? ' is-dead' : ''}`);
      const cv = document.createElement('canvas');
      cv.width = 100; cv.height = 100; cv.style.setProperty('--tint', TINT[m.element] || TINT.shadow);
      card.style.setProperty('--tint', TINT[m.element]);
      cv.style.background = `radial-gradient(110% 90% at 50% 100%, ${TINT[m.element] || TINT.shadow} 0%, #2a2140 75%)`;
      const meta = spriteMeta(m.sprite) || { h: 100, w: 100 };
      const s = Math.min(78 / meta.h, 84 / meta.w);
      const c = cv.getContext('2d');
      drawCreature(c, m.sprite, 50, 92, { scale: s, t: 0.4, facing: 1, mood: m.dead ? 'hurt' : m.stress >= 70 ? 'stressed' : m.stress >= 50 ? 'neutral' : 'happy', shadow: false, anim: m.dead ? 'faint' : 'idle' });
      const st = m.affliction ? STATUS[m.affliction] : m.virtue ? STATUS[m.virtue] : null;
      const badge = st ? `<span class="xp-badge ${m.affliction ? 'bad' : 'good'}" title="${esc(st.desc)}">${esc(st.name)}</span>` : '';
      const hpK = Math.max(0, m.hp / m.maxHp);
      const info = h('div', 'xp-mem-info');
      info.innerHTML = `
        <div class="xp-mem-name"><i class="xp-el" style="--c:${EL_COL[m.element]}"></i><span>${esc(m.name)}</span>${badge}</div>`;
      const bars = h('div', 'xp-mem-bars', `
        <div class="xp-bar hp${hpK < 0.3 ? ' low' : ''}" role="img" aria-label="HP ${m.hp} of ${m.maxHp}"><i style="width:${hpK * 100}%"></i></div>
        <div class="xp-bar st${m.stress >= 70 ? ' high' : ''}" role="img" aria-label="Stress ${m.stress} of 100"><i style="width:${m.stress}%"></i></div>
        <div class="xp-mem-nums">${m.dead ? '<span>Fallen</span>' : `<span>HP ${m.hp}/${m.maxHp}</span><span>Stress ${m.stress}</span>`}</div>`);
      card.append(cv, info, bars);
      P.append(card);
    }
  },

  banner(html, kind = 'bad', ms = 1700) {
    const b = h('div', `xp-banner ${kind}`, html);
    b.setAttribute('role', 'status');
    this.bannerWrap.innerHTML = '';
    this.bannerWrap.append(b);
    this.later(ms, () => b.remove());
  },

  breakBanner(m, ev) {
    const name = esc(m.name);
    if (ev.kind === 'virtue') this.banner(`<small>Breaking point</small>${name} is <b>${esc(ev.name.toUpperCase())}</b>`, 'good');
    else if (ev.kind === 'affliction') this.banner(`<small>Breaking point</small>${name} is <b>${esc(ev.name.toUpperCase())}</b>`, 'bad');
    else this.banner(`<small>Breaks again · −${ev.dmg} HP</small>${name} <b>CRACKS</b>`, 'bad');
  },

  /** Banners for out-of-battle stress events (node entry, events). */
  playEvents(events) {
    let delay = 0;
    for (const ev of events) {
      const m = this.run.party.find((p) => p.key === ev.dst);
      if (ev.type === 'break' && m) { this.later(delay, () => this.breakBanner(m, ev)); delay += 1800; }
      if (ev.type === 'faint' && m) { this.later(delay, () => this.banner(`<small>Lost to the Gloom</small><b>${esc(m.name)}</b> has fallen`, 'bad')); delay += 1800; }
    }
    return delay;
  },

  // ------------------------------------------------------------ map
  showMap() {
    this.view = 'map';
    this.root.classList.remove('is-battle');
    this.updateSpeed(); this.updateTop(); this.renderParty();
    const run = this.run, F = DUNGEON_FLOORS[run.floor];
    const steps = run.map[run.floor];
    const wrap = h('div', 'xp-map-wrap');
    const panel = h('section', 'panel xp-map');
    panel.setAttribute('aria-label', 'Expedition map');
    const nextTxt = run.floor < T.FLOORS ? `Then: ${DUNGEON_FLOORS[run.floor + 1].name}` : 'The Hollow Warden waits';
    panel.innerHTML = `<div class="xp-map-head"><h2>Choose your path</h2><span class="muted">${esc(nextTxt)}</span></div>`;
    const path = h('div', 'xp-path');
    const open = choices(run);
    const taken = Object.fromEntries(run.path.filter((p) => p.floor === run.floor).map((p) => [p.step, p.lane]));
    const xOf = (n, len) => (len === 1 ? 50 : n.lane === 0 ? 28 : 72);
    const rowsH = steps.length;
    const lines = [];
    steps.forEach((nodes, si) => {
      const row = h('div', 'xp-row');
      nodes.forEach((n) => {
        const b = h('button', `xp-node t-${n.type}`, `${NODE_ICONS[n.type]}<span class="xp-node-lbl">${NODE_LABEL[n.type]}</span>`);
        b.type = 'button';
        b.style.left = `${xOf(n, nodes.length)}%`;
        const isOpen = open.includes(n);
        const done = si < run.step && taken[si] === n.lane;
        const skipped = si < run.step && taken[si] !== n.lane;
        b.classList.add(isOpen ? 'is-open' : done ? 'is-done' : skipped ? 'is-skipped' : 'is-future');
        const info = NODE_INFO[n.type];
        b.setAttribute('aria-label', `Step ${si + 1}: ${info.name}. ${info.desc}${done ? ' (cleared)' : ''}`);
        b.title = `${info.name} — ${info.desc}`;
        if (isOpen) b.onclick = () => this.onNode(n.lane);
        else b.disabled = !done;
        row.append(b);
        // connections to the next step
        const next = steps[si + 1];
        if (next) {
          for (const m of next) {
            const active = (si < run.step && taken[si] === n.lane && (si + 1 < run.step ? taken[si + 1] === m.lane : si + 1 === run.step)) ;
            const dead = si < run.step && taken[si] !== n.lane;
            lines.push({ x1: xOf(n, nodes.length), y1: si, x2: xOf(m, next.length), y2: si + 1, active, dead });
          }
        }
      });
      path.append(row);
    });
    // lines in an SVG behind the nodes; rows are stacked bottom (step 1) to top
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'xp-lines'); svg.setAttribute('viewBox', `0 0 100 ${rowsH * 10}`); svg.setAttribute('preserveAspectRatio', 'none');
    const yOf = (si) => (rowsH - si - 0.5) * 10;
    for (const L of lines) {
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('x1', L.x1); ln.setAttribute('y1', yOf(L.y1)); ln.setAttribute('x2', L.x2); ln.setAttribute('y2', yOf(L.y2));
      ln.setAttribute('vector-effect', 'non-scaling-stroke');
      ln.setAttribute('stroke', L.active ? F.light : 'rgba(255,236,214,0.22)');
      ln.setAttribute('stroke-width', L.active ? '3.5' : '2');
      ln.setAttribute('stroke-dasharray', L.active ? '' : '4 5');
      ln.setAttribute('stroke-linecap', 'round');
      if (L.dead) ln.setAttribute('opacity', '0.25');
      svg.append(ln);
    }
    path.prepend(svg);
    panel.append(path);
    const foot = h('div', 'xp-map-foot');
    foot.innerHTML = ['fight', 'elite', 'rest', 'event'].map((k) => `<span class="xp-legend" style="color:var(--dim)">${NODE_ICONS[k]}${NODE_INFO[k].name}</span>`).join('');
    panel.append(foot);
    wrap.append(panel);
    this.main.innerHTML = '';
    this.main.append(wrap);
    this.later(30, () => panel.querySelector('.xp-node.is-open')?.focus({ preventScroll: true }));
  },

  onNode(lane) {
    if (this.busy) return;
    const run = this.run;
    const { node, events } = enterNode(run, lane);
    this.renderParty();
    const delay = this.playEvents(events);
    if (run.done) { this.later(delay + 300, () => this.showResults()); return; }
    this.busy = true;
    this.later(delay + 120, () => {
      this.busy = false;
      if (node.type === 'rest') this.showRest();
      else if (node.type === 'event') this.showEvent();
      else this.showBattle();
    });
  },

  // ------------------------------------------------------------ battle
  showBattle() {
    const run = this.run;
    this.view = 'battle';
    this.root.classList.add('is-battle');
    this.battle = startBattle(run);
    this.bv = createBattleView({
      battle: this.battle, floor: run.floor,
      cb: {
        onRound: (r) => { this.updateTop(r); this.updateCheer(); },
        onBreak: (f, ev) => this.breakBanner(f, ev),
        onEmber: (f, ev) => this.banner(`<small>${ev.type === 'lastEmber' ? 'Last Ember' : 'Devoted'}</small>${esc(f.name)} <b>clings on</b>`, 'good', 1500),
        onWail: () => this.banner('<small>Hollow Warden</small><b>HOLLOW WAIL</b>', 'dark', 1200),
        onEnd: (outcome) => this.onBattleEnd(outcome),
      },
    });
    this.bv.setSpeed(this.speed);
    this.updateSpeed(); this.updateTop(1); this.renderParty();
    this.main.innerHTML = '';
    const cw = h('div', 'xp-cheer-wrap');
    this.cheerBtn = h('button', 'xp-cheer', '');
    this.cheerBtn.type = 'button';
    this.cheerBtn.onclick = () => { this.bv.cheer(); this.updateCheer(); };
    this.cheerHint = h('div', 'xp-cheer-hint', '');
    cw.append(this.cheerBtn, this.cheerHint);
    this.main.append(cw);
    const type = run.current.type;
    if (type === 'boss') this.banner('<small>The heart of the Gloom</small><b>HOLLOW WARDEN</b>', 'dark', 1900);
    else if (type === 'elite') this.banner('<small>Elite</small><b>Dire Gloomlet</b>', 'dark', 1400);
    this.updateCheer();
  },

  updateCheer() {
    if (!this.cheerBtn || !this.battle) return;
    const S = this.battle.state;
    const avg = living(this.run).reduce((n, m) => n + m.bond, 0) / Math.max(1, living(this.run).length);
    const mult = (T.CHEER_BASE_MULT + avg / T.CHEER_BOND_DIV).toFixed(2).replace(/0$/, '');
    const active = S.cheerRound > 0 && S.cheerRound >= S.round && !S.ended;
    this.cheerBtn.classList.toggle('is-active', active);
    this.cheerBtn.disabled = S.ended || S.cheersLeft <= 0 || active;
    this.cheerBtn.innerHTML = `${ICON.flame}<span>${active ? 'Cheering!' : 'Cheer'}</span><span class="xp-count" aria-label="${S.cheersLeft} left">${S.cheersLeft}</span>`;
    this.cheerHint.textContent = active ? `Party damage ×${mult} this round` : S.cheersLeft > 0 ? `×${mult} damage for a round · −5 stress` : 'No cheers left this fight';
  },

  update(app, dt) {
    if (this.view === 'battle' && this.bv) {
      this.bv.update(dt);
      if (this.cheerBtn && (this._cheerTick = (this._cheerTick || 0) + dt) > 0.2) { this._cheerTick = 0; this.updateCheer(); }
    }
  },

  onBattleEnd(outcome) {
    const run = this.run;
    const r = finishBattle(run, this.battle);
    this.updateCheer();
    this.updateTop(this.battle.state.round);
    if (run.done) {
      if (run.outcome === 'cleared') this.banner('<small>The Gloom lifts</small><b>VICTORY</b>', 'good', 1800);
      else if (run.outcome === 'wiped') this.banner('<small>The lights go out</small><b>PARTY LOST</b>', 'bad', 1800);
      this.later(1500, () => this.showResults());
      return;
    }
    if (outcome === 'won') {
      this.banner(`<small>+${r.motes} Motes</small><b>VICTORY</b>`, 'good', 1300);
      this.later(1200, () => {
        if (r.boonOffer) this.showBoons(`Victory · +${r.motes} Motes`);
        else this.afterNode();
      });
    } else {
      this.banner('<small>20 rounds · +10 stress</small><b>THE GLOOM SLIPS AWAY</b>', 'dark', 1600);
      this.later(1500, () => this.afterNode());
    }
  },

  /** Node finished: pending boon → pick; else move on (floor clear / results / map). */
  afterNode() {
    const run = this.run;
    if (run.pendingBoons) { this.showBoons(); return; }
    const res = completeNode(run);
    this.bv = null; this.battle = null;
    if (res.done) { this.showResults(); return; }
    if (res.floorCleared) { this.showFloorClear(res); return; }
    this.showMap();
  },

  // ------------------------------------------------------------ overlays
  modal(cls = '') {
    this.view = this.view === 'battle' ? 'battle' : 'overlay';
    const wrap = h('div', 'modal-wrap');
    const card = h('section', `panel modal xp-card ${cls}`);
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    wrap.append(card);
    this.main.innerHTML = '';
    this.main.append(wrap);
    return card;
  },
  continueBtn(card, label, fn, primary = true) {
    const b = h('button', `btn btn-lg ${primary ? 'btn-primary' : ''}`, esc(label));
    b.type = 'button'; b.onclick = fn;
    card.append(b);
    this.later(30, () => b.focus({ preventScroll: true }));
    return b;
  },
  toMapOverlay() { this.view = 'overlay'; this.root.classList.remove('is-battle'); this.updateSpeed(); this.renderParty(); },

  showRest() {
    this.toMapOverlay();
    const run = this.run;
    const before = Object.fromEntries(living(run).map((m) => [m.key, { hp: m.hp, st: m.stress }]));
    const events = resolveRest(run);
    this.updateTop(); this.renderParty();
    const card = this.modal();
    card.innerHTML = `<div class="xp-hero" style="--hc:#ffb340">${NODE_ICONS.rest}</div><div class="xp-kicker">Rest</div><h2>A quiet campfire</h2>
      <p>The party huddles by the embers and catches its breath.</p>`;
    const list = h('div', 'xp-list');
    for (const m of living(run)) {
      const b = before[m.key];
      list.append(h('div', 'xp-li', `<i class="xp-el" style="--c:${EL_COL[m.element]}"></i><span class="grow">${esc(m.name)}</span><span class="good">+${m.hp - b.hp} HP</span><span class="st">${m.stress - b.st} stress</span>`));
    }
    card.append(list);
    this.playEvents(events);
    this.continueBtn(card, 'Onward', () => this.afterNode());
  },

  showEvent() {
    this.toMapOverlay();
    const run = this.run;
    const res = resolveEvent(run);
    this.updateTop(); this.renderParty();
    const ev = res.event;
    const card = this.modal();
    const hero = { whispering_well: ['#8fd0ff', NODE_ICONS.event], lost_lantern: ['#ffd45a', NODE_ICONS.rest], gloom_fog: ['#b48cff', NODE_ICONS.elite] }[ev.id] || ['#8fd0ff', NODE_ICONS.event];
    const flavour = {
      whispering_well: 'Voices rise from a dry well, offering gifts to those who listen.',
      lost_lantern: 'A little lantern still burns in the dark. Someone holds it close.',
      gloom_fog: 'A cold fog rolls in. Glittering Motes drift inside it.',
    }[ev.id] || ev.desc;
    card.innerHTML = `<div class="xp-hero" style="--hc:${hero[0]}">${hero[1]}</div><div class="xp-kicker">Event</div><h2>${esc(ev.name)}</h2><p>${esc(flavour)}</p>`;
    const list = h('div', 'xp-list');
    if (res.target) list.append(h('div', 'xp-li', `<span class="grow">${esc(res.target.name)}</span><span class="gold">+${ev.effect.bond} Bond</span><span class="st">${ev.effect.stress} stress</span>`));
    if (ev.id === 'gloom_fog') list.append(h('div', 'xp-li', `<span class="grow">Whole party</span><span class="st">+${ev.effect.stress} stress</span><span class="gold">+${res.motes} Motes</span>`));
    if (list.children.length) card.append(list);
    const delay = this.playEvents(res.events);
    const go = () => (run.done ? this.showResults() : res.boonOffer ? this.showBoons('Whispering Well') : this.afterNode());
    const btn = this.continueBtn(card, res.boonOffer ? 'Listen' : 'Onward', go);
    if (delay) { btn.disabled = true; this.later(delay, () => { btn.disabled = false; }); }
  },

  showBoons(kicker = 'A gift in the dark') {
    this.toMapOverlay();
    const run = this.run;
    const offer = run.pendingBoons || [];
    const card = this.modal('xp-boonpick');
    card.innerHTML = `<div class="xp-kicker">${esc(kicker)}</div><h2>Choose a boon</h2><p class="muted">Lasts for the rest of this expedition.</p>`;
    const grid = h('div', 'xp-boon-cards');
    for (const id of offer) {
      const b = BOON[id];
      const c = h('button', 'xp-boon-card', `<div class="xp-hero">${BOON_ICONS[id] || ''}</div><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>`);
      c.type = 'button';
      c.onclick = () => {
        pickBoon(run, id);
        this.app.toast(`${b.name} acquired`, 'gold');
        this.updateTop();
        this.afterNode();
      };
      grid.append(c);
    }
    card.append(grid);
    this.later(30, () => grid.firstChild?.focus({ preventScroll: true }));
  },

  showFloorClear(res) {
    this.toMapOverlay();
    const run = this.run;
    this.updateTop(); this.renderParty();
    const F = DUNGEON_FLOORS[run.floor];
    const card = this.modal('is-win');
    card.innerHTML = `<div class="xp-hero" style="--hc:${DUNGEON_FLOORS[res.floorCleared].light}">${NODE_ICONS.start}</div><div class="xp-kicker">Floor ${res.floorCleared} cleared</div>
      <h2>${esc(DUNGEON_FLOORS[res.floorCleared].name)}</h2><p>The way down opens. The party patches itself up (+${Math.round(T.FLOOR_CLEAR_HEAL_PCT * 100)}% HP).</p>`;
    const list = h('div', 'xp-list');
    for (const x of res.healed) {
      const m = run.party.find((p) => p.key === x.key);
      list.append(h('div', 'xp-li', `<i class="xp-el" style="--c:${EL_COL[m.element]}"></i><span class="grow">${esc(m.name)}</span><span class="good">+${x.amount} HP</span>`));
    }
    card.append(list);
    this.continueBtn(card, `Descend to ${F.name}`, () => this.showMap());
  },

  showResults() {
    this.toMapOverlay();
    const run = this.run, app = this.app;
    if (!this.applied) {
      this.applied = applyRunToSave(app.state, run, { getCreature, recordDeath });
      app.save();
    }
    const sum = this.applied;
    this.updateTop(); this.renderParty();
    const win = sum.outcome === 'cleared';
    const card = this.modal(win ? 'is-win' : 'is-loss');
    const title = win ? 'The Gloom is pushed back' : sum.outcome === 'wiped' ? 'The party was lost' : 'The Warden withdrew';
    const kicker = win ? 'Expedition cleared' : sum.outcome === 'wiped' ? 'Expedition failed' : 'Expedition over';
    const blurb = win ? 'The Hollow Warden falls silent. Your creatures limp home, proud and tired.'
      : sum.outcome === 'wiped' ? 'No one came back. Their embers still glow in the garden, and new eggs wait.'
        : 'The Hollow Warden melts into the dark. The survivors head home.';
    card.innerHTML = `<div class="xp-hero" style="--hc:${win ? '#ffd45a' : '#ff6a6a'}">${win ? NODE_ICONS.boss : NODE_ICONS.elite}</div>
      <div class="xp-kicker">${kicker}</div><h2>${title}</h2><p>${blurb}</p>
      <div class="xp-stats"><div class="xp-stat"><b>${sum.floorReached}</b><span>Floor reached</span></div><div class="xp-stat"><b>${sum.motes}</b><span>Motes</span></div><div class="xp-stat"><b>${sum.fallen.length}</b><span>Fallen</span></div></div>`;
    const list = h('div', 'xp-list');
    for (const m of run.party) {
      const st = m.affliction ? STATUS[m.affliction] : null;
      const right = m.dead ? `<span class="bad">Fallen · ${esc(m.deathCause || 'lost')}</span>`
        : `<span class="good">HP ${m.hp}/${m.maxHp}</span><span class="st">Stress ${m.stress}</span>${st ? `<span class="xp-badge bad">${esc(st.name)}</span>` : ''}`;
      list.append(h('div', 'xp-li', `<i class="xp-el" style="--c:${EL_COL[m.element]}"></i><span class="grow">${esc(m.name)}</span>${right}`));
    }
    card.append(list);
    if (sum.fallen.length) card.append(h('p', 'xp-fallen', `Each fallen friend leaves an Emberstone and a legacy egg in the garden.`));
    this.continueBtn(card, 'Return to the garden', () => app.go('garden', { returned: sum }));
  },

  // ------------------------------------------------------------ canvas
  draw(app, ctx, w, h2, t) {
    if (!this.run) return;
    if (this.view === 'battle' && this.bv) { this.bv.draw(ctx, w, h2, t); return; }
    drawPartyIdle(ctx, w, h2, t, this.run.floor, this.run.party, { dim: this.view === 'map' ? 0.42 : 0.55 });
  },
};

export default X;
