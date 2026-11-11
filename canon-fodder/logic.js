// Canon Fodder: all game rules, with no DOM access. State is plain JSON so
// it can be saved, and every random roll goes through the seeded state RNG.
// Browser: window.CF. Node: module.exports (see test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.CF = factory(root.CFData);
})(this, function (D) {
  const { GENRES, TRAININGS, SKILLS, SPECIES, RIVALS, BOSSES } = D;
  const STATS = ['hp', 'atk', 'def', 'spd', 'lck'];
  const GENRE_IDS = Object.keys(GENRES);
  const EVO_LV = [4, 10, 18];
  const STAGE_NAMES = ['Extra', 'Sidekick', 'Lead', 'Icon'];
  const STAGE_GROWTH = [1, 1.5, 2.2, 3];
  const BASE_GROWTH = { hp: 5, atk: 1.5, def: 1.5, spd: 1.2, lck: 1 };
  const TRAIN_MULT = [1, 1.4, 1.8, 2.2];
  const ROSTER_CAP = 5, TEAM_CAP = 3, SKILL_CAP = 4, MAX_LIVES = 3, ACT_DAYS = 6, ACTS = 3;
  const BREED_CD = 3;

  // ---------- RNG (mulberry32, state kept in s.rng) ----------
  function R(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (s, a, b) => a + Math.floor(R(s) * (b - a + 1));
  const pick = (s, arr) => arr[Math.floor(R(s) * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function weighted(s, items, weightOf) {
    const total = items.reduce((n, it) => n + weightOf(it), 0);
    let roll = R(s) * total;
    for (const it of items) { roll -= weightOf(it); if (roll <= 0) return it; }
    return items[items.length - 1];
  }

  const tapeSkills = () => Object.keys(SKILLS).filter((k) => SKILLS[k].tier === 1);
  const babies = () => Object.keys(SPECIES).filter((k) => SPECIES[k].stage === 0);
  const log = (s, msg) => { s.log.unshift(msg); if (s.log.length > 60) s.log.pop(); };

  // ---------- Tropelings ----------
  function newMon(s, o = {}) {
    const species = o.species || pick(s, babies());
    const m = {
      id: ++s.nextId, species, name: o.name || SPECIES[species].name,
      stage: 0, genre: null, level: 1, xp: 0, gen: o.gen || 1,
      stats: { hp: 28 + ri(s, 0, 6), atk: 7 + ri(s, 0, 2), def: 5 + ri(s, 0, 2), spd: 7 + ri(s, 0, 2), lck: 4 + ri(s, 0, 2) },
      genes: {}, aff: {}, trainOff: 0, trainDef: 0,
      skills: [], fatigue: 0, acted: false, breedCd: 0, wins: 0, losses: 0,
      parents: o.parents || null,
    };
    for (const st of STATS) m.genes[st] = o.genes ? o.genes[st] : ri(s, 1, 3);
    for (const g of GENRE_IDS) m.aff[g] = 0;
    if (s.seen) s.seen[species] = true;
    return m;
  }

  function hasSkill(m, id) { return m.skills.some((k) => k.id === id); }

  // Returns true if learned right away. A full skill list queues a choice
  // for the player (s.pending), or resolves by coin flip when auto is set.
  function learn(s, m, id, inh, auto) {
    if (id === 'bonk' || hasSkill(m, id)) return false;
    const entry = { id, inh: !!inh };
    if (m.skills.length < SKILL_CAP) { m.skills.push(entry); return true; }
    if (auto) { if (R(s) < 0.6) m.skills[ri(s, 0, SKILL_CAP - 1)] = entry; return true; }
    s.pending.push({ mon: m.id, skill: id, inh: !!inh });
    return false;
  }

  function resolveLearn(s, slot) {
    const p = s.pending.shift();
    if (!p) return;
    const m = s.roster.find((x) => x.id === p.mon);
    if (!m) return;
    if (slot >= 0 && slot < m.skills.length) {
      log(s, `${m.name} forgot ${SKILLS[m.skills[slot].id].name} and learned ${SKILLS[p.skill].name}.`);
      m.skills[slot] = { id: p.skill, inh: p.inh };
    } else if (m.skills.length < SKILL_CAP && !hasSkill(m, p.skill)) {
      m.skills.push({ id: p.skill, inh: p.inh });
    }
  }

  const xpNeed = (level) => 8 + 4 * level;

  function gainLevel(s, m) {
    m.level++;
    const sp = SPECIES[m.species];
    for (const st of STATS) {
      m.stats[st] += BASE_GROWTH[st] * STAGE_GROWTH[m.stage] * sp.growth[st] * (0.7 + 0.15 * m.genes[st]) * (0.9 + R(s) * 0.2);
    }
  }

  function topGenre(s, m) {
    const best = Math.max(...GENRE_IDS.map((g) => m.aff[g]));
    return pick(s, GENRE_IDS.filter((g) => m.aff[g] === best));
  }
  function branchOf(s, m) {
    if (m.trainOff === m.trainDef) return R(s) < 0.5 ? 'off' : 'def';
    return m.trainOff > m.trainDef ? 'off' : 'def';
  }

  // What this Tropeling becomes next (uses RNG only to break ties).
  function evoTarget(s, m) {
    const all = Object.keys(SPECIES);
    if (m.stage === 0) { const g = topGenre(s, m); return all.find((k) => SPECIES[k].stage === 1 && SPECIES[k].genre === g); }
    if (m.stage === 1) { const b = branchOf(s, m); return all.find((k) => SPECIES[k].stage === 2 && SPECIES[k].genre === m.genre && SPECIES[k].branch === b); }
    if (m.stage === 2) {
      if (m.gen >= 3) return 'directorscut';
      if (m.losses >= 3) return 'memeoth';
      return all.find((k) => SPECIES[k].from === m.species);
    }
    return null;
  }

  function checkEvolve(s, m, auto) {
    while (m.stage < 3 && m.level >= EVO_LV[m.stage]) {
      const to = evoTarget(s, m);
      const from = SPECIES[m.species], sp = SPECIES[to];
      if (m.name === from.name) m.name = sp.name;
      m.species = to; m.stage = sp.stage;
      if (sp.genre !== 'any') m.genre = sp.genre;
      for (const st of STATS) m.stats[st] *= 1.12;
      if (s.seen && !auto) s.seen[to] = true;
      if (!auto) {
        log(s, `✨ ${from.name} evolved into ${sp.name}!`);
        s.notices.push({ type: 'evolve', mon: m.id, from: from.name, fromEmoji: from.emoji, to: sp.name, emoji: sp.emoji, stage: sp.stage, blurb: sp.blurb, sig: sp.sig });
      }
      if (sp.sig) learn(s, m, sp.sig, false, auto);
    }
  }

  function addXp(s, m, xp, auto) {
    m.xp += xp;
    while (m.xp >= xpNeed(m.level)) { m.xp -= xpNeed(m.level); gainLevel(s, m); checkEvolve(s, m, auto); }
  }

  function trainGain(m, stat) {
    return (2 + m.genes[stat]) * TRAIN_MULT[m.stage] * (stat === 'hp' ? 3 : 1);
  }

  // ---------- Run setup ----------
  function newMeta() { return { hall: [], dex: {}, asc: 0, runs: 0, wins: 0, bestDay: 0 }; }

  function newRun(meta, seed, legacyIdx) {
    const s = {
      v: 1, rng: seed | 0, nextId: 0, phase: 'starter', asc: meta.asc || 0,
      day: 1, act: 0, actDay: 1, lives: MAX_LIVES, pop: 20,
      roster: [], team: [], starters: [], options: [], pending: [], notices: [], log: [],
      seen: {}, battle: null, shop: null, event: null, bred: 0, legacy: null,
    };
    const pool = tapeSkills();
    for (let i = 0; i < 3; i++) {
      const m = newMon(s);
      learn(s, m, pick(s, pool), false, true);
      s.starters.push(m);
    }
    const h = legacyIdx != null && meta.hall[legacyIdx];
    if (h) {
      // A descendant of a past champion: its genes (slightly faded), one skill.
      const genes = {};
      for (const st of STATS) genes[st] = clamp(h.genes[st] - (R(s) < 0.4 ? 1 : 0), 1, 5);
      const m = newMon(s, { genes, gen: h.gen + 1, name: h.name + ' Jr.', parents: [h.name, 'the reruns'] });
      const inherit = h.skills.filter((k) => k !== 'bonk');
      if (inherit.length) learn(s, m, pick(s, inherit), true, true);
      s.legacy = m;
    }
    return s;
  }

  function pickStarters(s, idxs) {
    if (s.phase !== 'starter' || idxs.length !== 2 || idxs[0] === idxs[1]) return false;
    for (const i of idxs) s.roster.push(s.starters[i]);
    if (s.legacy) s.roster.push(s.legacy);
    s.team = s.roster.slice(0, TEAM_CAP).map((m) => m.id);
    s.starters = []; s.legacy = null;
    s.phase = 'ranch';
    log(s, `📺 Season ${s.asc + 1} begins. Three renewals. Don't get cancelled.`);
    genOptions(s);
    return true;
  }

  const mon = (s, id) => s.roster.find((m) => m.id === id);

  // ---------- Ranch actions ----------
  function train(s, id, stat) {
    const m = mon(s, id);
    if (s.phase !== 'ranch' || !m || m.acted || !TRAININGS[stat]) return null;
    m.acted = true;
    const T = TRAININGS[stat];
    const failP = clamp((m.fatigue - 40) / 80, 0, 0.75);
    if (R(s) < failP) {
      m.fatigue = Math.min(100, m.fatigue + 15);
      log(s, `😵 ${m.name} was too tired for ${T.name} and flubbed the take.`);
      return { result: 'fail' };
    }
    const great = R(s) < 0.1 + m.stats.lck * 0.001;
    const gain = trainGain(m, stat) * (great ? 2 : 1) * (0.85 + R(s) * 0.3);
    m.stats[stat] += gain;
    m.aff[T.genre] += great ? 5 : 3;
    if (T.side === 'off') m.trainOff++; else m.trainDef++;
    m.fatigue = Math.min(100, m.fatigue + 30);
    log(s, `${great ? '🌟 GREAT TAKE! ' : ''}${m.name} did ${T.name}: +${Math.round(gain)} ${stat.toUpperCase()}.`);
    addXp(s, m, 6 + 3 * s.day);
    return { result: great ? 'great' : 'ok', gain };
  }

  function rest(s, id) {
    const m = mon(s, id);
    if (s.phase !== 'ranch' || !m || m.acted) return false;
    m.acted = true;
    m.fatigue = Math.max(0, m.fatigue - 60);
    log(s, `💤 ${m.name} binge-watched something comforting.`);
    return true;
  }

  function canBreed(s, a, b) {
    if (s.phase !== 'ranch' || !a || !b || a.id === b.id) return 'Pick two different Tropelings.';
    if (s.roster.length >= ROSTER_CAP) return 'Ranch is full. Release someone first.';
    for (const m of [a, b]) {
      if (m.stage < 1) return `${m.name} is still an Extra.`;
      if (m.acted) return `${m.name} already acted today.`;
      if (m.breedCd > 0) return `${m.name} needs ${m.breedCd} more day(s).`;
    }
    return null;
  }

  // The egg takes each gene from one parent (with a chance to mutate), one
  // skill from each parent, a slice of their stats and genre leanings.
  function breed(s, idA, idB) {
    const a = mon(s, idA), b = mon(s, idB);
    if (canBreed(s, a, b)) return null;
    const genes = {};
    const muts = [];
    for (const st of STATS) {
      let g = R(s) < 0.5 ? a.genes[st] : b.genes[st];
      const roll = R(s);
      if (roll < 0.18 && g < 5) { g++; muts.push(st.toUpperCase() + '▲'); }
      else if (roll > 0.95 && g > 1) { g--; muts.push(st.toUpperCase() + '▼'); }
      genes[st] = g;
    }
    const c = newMon(s, { genes, gen: Math.max(a.gen, b.gen) + 1, parents: [a.name, b.name] });
    for (const st of STATS) c.stats[st] += (a.stats[st] + b.stats[st]) / 2 * 0.1;
    for (const g of GENRE_IDS) c.aff[g] = Math.round((a.aff[g] + b.aff[g]) * 0.15);
    const inherited = [];
    for (const p of [a, b]) {
      const opts = p.skills.filter((k) => !hasSkill(c, k.id));
      if (opts.length) { const k = pick(s, opts); c.skills.push({ id: k.id, inh: true }); inherited.push(SKILLS[k.id].name); }
    }
    let mutation = null;
    if (R(s) < 0.12) {
      const opts = Object.keys(SKILLS).filter((k) => SKILLS[k].tier >= 1 && !hasSkill(c, k));
      mutation = pick(s, opts);
      c.skills.push({ id: mutation, inh: true });
    }
    for (const p of [a, b]) { p.acted = true; p.breedCd = BREED_CD; }
    c.acted = true;
    s.roster.push(c);
    if (s.team.length < TEAM_CAP) s.team.push(c.id);
    s.bred++;
    log(s, `🥚 ${a.name} and ${b.name} had a spin-off! Gen ${c.gen} ${c.name} hatched, inheriting ${inherited.join(' and ') || 'nothing'}.`);
    s.notices.push({ type: 'hatch', mon: c.id, emoji: SPECIES[c.species].emoji, name: c.name, gen: c.gen, parents: [a.name, b.name], inherited, muts, mutation: mutation && SKILLS[mutation].name });
    return c;
  }

  function release(s, id) {
    const m = mon(s, id);
    if (s.phase !== 'ranch' || !m || s.roster.length <= 1) return false;
    s.roster = s.roster.filter((x) => x.id !== id);
    s.team = s.team.filter((x) => x !== id);
    s.pop += 10;
    log(s, `👋 ${m.name} was written out of the show. (+10 🍿)`);
    return true;
  }

  function toggleTeam(s, id) {
    if (!mon(s, id)) return false;
    if (s.team.includes(id)) { s.team = s.team.filter((x) => x !== id); return true; }
    if (s.team.length >= TEAM_CAP) return false;
    s.team.push(id);
    return true;
  }

  // ---------- Enemies and daily options ----------
  function buildEnemy(s, level, genre, boss) {
    const tmp = { rng: s.rng, nextId: 1000 + s.nextId, pending: [], notices: [], log: [] };
    const m = newMon(tmp, { genes: boss ? { hp: 3, atk: 3, def: 3, spd: 3, lck: 3 } : { hp: 2, atk: 2, def: 2, spd: 2, lck: 2 } });
    m.aff[genre] = 10;
    if (R(tmp) < 0.5) m.trainOff = 1; else m.trainDef = 1;
    for (let l = 1; l < level; l++) { gainLevel(tmp, m); checkEvolve(tmp, m, true); }
    const sessions = Math.floor(level * (boss ? 0.5 : 0.35));
    for (let i = 0; i < sessions; i++) { const st = pick(tmp, STATS); m.stats[st] += trainGain(m, st); }
    if (level >= 6 && (boss || R(tmp) < 0.5)) learn(tmp, m, pick(tmp, tapeSkills()), false, true);
    const scale = 1 + 0.06 * s.asc;
    for (const st of STATS) m.stats[st] *= scale;
    s.rng = tmp.rng; s.nextId = tmp.nextId - 1000;
    return m;
  }

  function enemyTeam(s, kind) {
    const base = Math.round(s.day * 1.2 * (1 + 0.05 * s.asc));
    let level, size;
    if (kind === 'boss') { level = [8, 16, 25][s.act] + s.asc; size = 3; }
    else {
      level = Math.max(1, base + (kind === 'elite' ? 2 : 0));
      size = s.day <= 2 ? 1 : s.day <= 5 ? 2 : 3;
    }
    const theme = pick(s, GENRE_IDS);
    const team = [];
    for (let i = 0; i < size; i++) {
      const genre = kind !== 'boss' && R(s) < 0.6 ? theme : pick(s, GENRE_IDS);
      team.push(buildEnemy(s, Math.max(1, level - (i > 0 && kind !== 'boss' ? ri(s, 0, 1) : 0)), genre, kind === 'boss'));
    }
    return team;
  }

  function genOptions(s) {
    s.options = [];
    if (s.actDay >= ACT_DAYS) {
      const b = BOSSES[s.act];
      s.options.push({ type: 'boss', name: `Season Finale: ${b.name}`, line: b.line, team: enemyTeam(s, 'boss'), pop: 40 + 10 * s.act });
      return;
    }
    const types = ['battle'];
    const pool = [['battle', 3], ['shop', 2], ['event', 2]];
    if (s.day >= 3) pool.push(['elite', 2]);
    while (types.length < 3) {
      const [t] = weighted(s, pool, (p) => p[1]);
      if ((t === 'shop' || t === 'event' || t === 'elite') && types.includes(t)) continue;
      types.push(t);
    }
    for (const t of types) {
      if (t === 'battle') s.options.push({ type: t, name: `Episode vs ${pick(s, RIVALS)}`, team: enemyTeam(s, t), pop: 12 + 2 * s.day });
      else if (t === 'elite') s.options.push({ type: t, name: `Sweeps Week Special vs ${pick(s, RIVALS)}`, team: enemyTeam(s, t), pop: 25 + 4 * s.day });
      else if (t === 'shop') s.options.push({ type: t, name: 'Fan Convention' });
      else s.options.push({ type: t, name: 'Plot Twist' });
    }
  }

  // ---------- Auto-battle ----------
  function typeMult(att, def) {
    if (!att || !def) return 1;
    if (GENRES[att].beats === def) return 1.5;
    if (GENRES[def].beats === att) return 0.75;
    return 1;
  }

  function makeUnit(m, side, i) {
    const tired = side === 'p' && m.fatigue >= 70 ? 0.75 : 1;
    const u = {
      id: side + i, side, name: m.name, emoji: SPECIES[m.species].emoji, genre: m.genre, level: m.level,
      max: Math.round(m.stats.hp * tired), atk: m.stats.atk * tired, def: m.stats.def * tired, spd: m.stats.spd * tired, lck: m.stats.lck,
      skills: ['bonk'], passive: {}, cds: {}, mods: [], stun: false, used: {}, gauge: 0, tired: tired < 1,
    };
    u.hp = u.max;
    for (const k of m.skills) { if (SKILLS[k.id].kind === 'passive') u.passive[k.id] = true; else u.skills.push(k.id); }
    return u;
  }

  const eff = (u, stat) => u.mods.reduce((v, md) => (md.stat === stat ? v * md.mult : v), u[stat]);
  function addMod(u, md, fresh) {
    u.mods = u.mods.filter((x) => !(x.stat === md.stat && (x.mult > 1) === (md.mult > 1)));
    u.mods.push({ stat: md.stat, mult: md.mult, turns: md.turns, fresh: !!fresh });
  }

  // Runs a whole fight and returns { win, events, units }. Each event has
  // display text plus an HP snapshot, so the UI only has to play it back.
  function simulate(s, monsA, monsB) {
    const units = [...monsA.map((m, i) => makeUnit(m, 'p', i)), ...monsB.map((m, i) => makeUnit(m, 'e', i))];
    const start = units.map((u) => ({ id: u.id, side: u.side, name: u.name, emoji: u.emoji, genre: u.genre, level: u.level, max: u.max, tired: u.tired }));
    for (const u of units) u.gauge = u.passive.speedrun ? 100 : R(s) * 30;
    const events = [];
    const alive = (side) => units.filter((u) => u.side === side && u.hp > 0);
    const snap = () => { const h = {}; for (const u of units) h[u.id] = u.hp; return h; };
    const push = (actor, text, fx) => events.push({ actor: actor && actor.id, text, fx: fx || [], hp: snap() });
    let win = null;

    for (let n = 0; n < 300; n++) {
      if (!alive('e').length) { win = true; break; }
      if (!alive('p').length) { win = false; break; }
      const live = units.filter((u) => u.hp > 0);
      let actor = null, best = Infinity;
      for (const u of live) { const t = Math.max(0, 100 - u.gauge) / Math.max(1, eff(u, 'spd')); if (t < best) { best = t; actor = u; } }
      for (const u of live) u.gauge += best * Math.max(1, eff(u, 'spd'));
      actor.gauge = 0;
      for (const k in actor.cds) if (actor.cds[k] > 0) actor.cds[k]--;

      if (actor.stun) {
        actor.stun = false;
        push(actor, `${actor.name} is stunned and misses their cue!`);
      } else {
        const allies = alive(actor.side), foes = alive(actor.side === 'p' ? 'e' : 'p');
        const ready = actor.skills.filter((k) => !actor.cds[k]);
        const hurt = allies.some((u) => u.hp < u.max * 0.55);
        const usable = ready.filter((k) => {
          const sk = SKILLS[k];
          if (sk.kind === 'heal' || sk.kind === 'healall') return hurt;
          if (sk.kind === 'buff' || sk.kind === 'teambuff') return !actor.mods.some((md) => md.stat === sk.buff.stat && md.mult > 1);
          return true;
        });
        const id = weighted(s, usable, (k) => {
          const sk = SKILLS[k];
          if (sk.kind === 'heal' || sk.kind === 'healall') return 6;
          if (sk.kind === 'buff' || sk.kind === 'teambuff') return 2.5;
          const p = sk.random ? (sk.random[0] + sk.random[1]) / 2 : sk.pow * (sk.hits || 1);
          return k === 'bonk' ? 0.4 : p * p * (sk.kind === 'aoe' ? foes.length : 1);
        });
        const sk = SKILLS[id];
        if (sk.cd) actor.cds[id] = sk.cd + 1;
        const fx = [];
        const parts = [];

        const hit = (tgt) => {
          const dodge = clamp(0.03 + (tgt.lck - actor.lck) * 0.002, 0.02, 0.25);
          if (R(s) < dodge) { fx.push({ t: tgt.id, miss: true }); parts.push(`${tgt.name} dodges`); return; }
          const pow = sk.random ? sk.random[0] + R(s) * (sk.random[1] - sk.random[0]) : sk.pow;
          const crit = R(s) < clamp(0.05 + actor.lck * 0.0025 + (actor.passive.mce ? 0.2 : 0), 0, 0.6);
          const tm = typeMult(sk.genre, tgt.genre);
          let dmg = eff(actor, 'atk') * pow * (100 / (100 + (sk.pierce ? 0 : eff(tgt, 'def')))) * tm * (0.85 + R(s) * 0.3);
          if (crit) dmg *= actor.passive.acclaimed ? 2.5 : 1.75;
          if (actor.passive.ensemble) dmg *= 1 + 0.1 * (alive(actor.side).length - 1);
          if (actor.passive.underdog && actor.hp < actor.max * 0.4) dmg *= 1.45;
          dmg = Math.max(1, Math.round(dmg));
          tgt.hp -= dmg;
          let note = '';
          if (tgt.hp <= 0) {
            if (tgt.passive.plotarmor && !tgt.used.plotarmor) { tgt.used.plotarmor = true; tgt.hp = 1; note = ' — saved by Plot Armor!'; }
            else if (tgt.passive.postcredits && !tgt.used.postcredits && (tgt.used.postcredits = true) && R(s) < 0.6) { tgt.hp = Math.round(tgt.max * 0.3); note = ' — but returns in a Post-Credits Scene!'; }
            else { tgt.hp = 0; note = ' — written out!'; }
          }
          fx.push({ t: tgt.id, dmg, crit, eff: tm, ko: tgt.hp === 0 });
          parts.push(`${tgt.name} takes ${dmg}${crit ? ' CRIT' : ''}${tm > 1 ? ' (super effective)' : tm < 1 ? ' (resisted)' : ''}${note}`);
          if (actor.passive.method && actor.hp > 0) actor.hp = Math.min(actor.max, actor.hp + Math.round(dmg * 0.25));
          if (tgt.hp > 0 && sk.stun && R(s) < sk.stun) { tgt.stun = true; parts.push(`${tgt.name} is stunned`); }
          if (tgt.hp > 0 && sk.debuff) addMod(tgt, sk.debuff);
        };

        if (sk.kind === 'atk') {
          let tgt;
          if (R(s) < 0.65) {
            const top = Math.max(...foes.map((f) => typeMult(sk.genre, f.genre)));
            tgt = foes.filter((f) => typeMult(sk.genre, f.genre) === top).sort((a, b) => a.hp - b.hp)[0];
          } else tgt = pick(s, foes);
          for (let h = 0; h < (sk.hits || 1) && tgt.hp > 0; h++) hit(tgt);
        } else if (sk.kind === 'aoe') {
          for (const f of foes) hit(f);
        } else if (sk.kind === 'heal' || sk.kind === 'healall') {
          const tgts = sk.kind === 'heal' ? [allies.slice().sort((a, b) => a.hp / a.max - b.hp / b.max)[0]] : allies;
          for (const t of tgts) {
            const amt = Math.min(t.max - t.hp, Math.round(t.max * sk.pow));
            t.hp += amt; fx.push({ t: t.id, heal: amt }); parts.push(`${t.name} heals ${amt}`);
          }
        } else {
          const tgts = sk.kind === 'buff' ? [actor] : allies;
          for (const t of tgts) { addMod(t, sk.buff, t === actor); fx.push({ t: t.id, buff: true }); }
          parts.push(`${sk.buff.stat.toUpperCase()} up`);
        }
        if (sk.selfbuff) addMod(actor, sk.selfbuff, true);
        push(actor, `${actor.name} uses ${sk.name}: ${parts.join(', ')}.`, fx);
      }
      for (const md of actor.mods) { if (md.fresh) md.fresh = false; else md.turns--; }
      actor.mods = actor.mods.filter((md) => md.turns > 0);
    }
    if (win === null) { win = false; push(null, 'The episode ran long and got cut off. (Loss)'); }
    return { win, events, units: start };
  }

  // ---------- Day flow ----------
  function choose(s, i) {
    const o = s.options[i];
    if (s.phase !== 'ranch' || !o || s.pending.length) return false;
    if (o.type === 'shop') { openShop(s); return true; }
    if (o.type === 'event') { s.phase = 'event'; s.event = { id: ri(s, 0, EVENTS.length - 1), result: null }; return true; }
    const team = s.team.map((id) => mon(s, id)).filter(Boolean);
    if (!team.length) return false;
    const res = simulate(s, team, o.team);
    const big = o.type !== 'battle';
    const xp = Math.round((10 + 5 * s.day) * (big ? 1.5 : 1) * (res.win ? 1 : 0.5));
    const b = { type: o.type, name: o.name, line: o.line, win: res.win, events: res.events, units: res.units, xp, pop: res.win ? o.pop : 0, bonus: [] };
    for (const m of s.roster) {
      const inTeam = s.team.includes(m.id);
      if (inTeam) { m.fatigue = Math.min(100, m.fatigue + 10); if (res.win) m.wins++; else m.losses++; }
      addXp(s, m, inTeam ? xp : Math.round(xp / 2));
    }
    if (res.win) {
      s.pop += o.pop;
      if (o.type === 'elite') {
        for (const m of team) { const st = pick(s, STATS); if (m.genes[st] < 5) { m.genes[st]++; b.bonus.push(`${m.name}: ${st.toUpperCase()} gene +1`); } }
      }
      if (o.type === 'boss') {
        if (s.lives < MAX_LIVES) { s.lives++; b.bonus.push('Renewed! +1 ♥'); }
        b.bossWin = true;
      }
      log(s, `🏆 Won ${o.name}. +${o.pop} 🍿, +${xp} XP.`);
    } else {
      s.lives--;
      log(s, `💔 Lost ${o.name}. Ratings dip: ${s.lives} renewal(s) left.`);
    }
    s.battle = b;
    s.phase = 'battle';
    return true;
  }

  function afterBattle(s, meta) {
    if (s.phase !== 'battle') return;
    const b = s.battle;
    s.battle = null;
    if (s.lives <= 0) { s.phase = 'over'; finishRun(s, meta, false); return; }
    if (b.bossWin) {
      if (s.act >= ACTS - 1) { s.phase = 'won'; finishRun(s, meta, true); return; }
      s.act++; s.actDay = 0;
    }
    endDay(s);
  }

  function endDay(s) {
    for (const m of s.roster) {
      m.fatigue = Math.max(0, m.fatigue - 15);
      m.acted = false;
      if (m.breedCd > 0) m.breedCd--;
    }
    s.day++;
    s.actDay = Math.min(ACT_DAYS, s.actDay + 1);
    s.shop = null; s.event = null;
    s.phase = 'ranch';
    genOptions(s);
  }

  function finishRun(s, meta, won) {
    meta.runs++;
    meta.bestDay = Math.max(meta.bestDay, s.day);
    Object.assign(meta.dex, s.seen);
    const champ = s.roster.slice().sort((a, b) => b.level - a.level)[0];
    if (champ) {
      meta.hall.unshift({ name: champ.name, species: champ.species, emoji: SPECIES[champ.species].emoji, genes: champ.genes, skills: champ.skills.map((k) => k.id), gen: champ.gen, level: champ.level, won, season: s.asc + 1 });
      meta.hall = meta.hall.slice(0, 8);
    }
    if (won) { meta.wins++; meta.asc = Math.max(meta.asc, s.asc + 1); }
  }

  // ---------- Shop ----------
  const WARES = {
    tape:    { name: 'Bootleg Skill Tape', cost: 30, target: true,  desc: (w) => `Teaches ${SKILLS[w.skill].name}. ${SKILLS[w.skill].desc}` },
    snack:   { name: 'Genre Snack',        cost: 12, target: true,  desc: (w) => `+8 ${GENRES[w.genre].name} affinity and -20 fatigue. Steers evolution.` },
    splice:  { name: 'Gene Splice',        cost: 35, target: true,  desc: () => '+1 to a random gene (growth) of one Tropeling.' },
    drink:   { name: 'Craft Services Run', cost: 15, target: false, desc: () => 'Everyone\'s fatigue drops to 0.' },
    egg:     { name: 'Mystery Egg',        cost: 40, target: false, desc: () => 'A fresh Extra with good genes and a random skill.' },
    renewal: { name: 'Renewal Notice',     cost: 60, target: false, desc: () => '+1 ♥ (max 3).' },
  };

  function openShop(s) {
    const kinds = ['tape', 'tape', 'snack', 'splice', 'drink', 'egg', 'renewal'];
    const items = [];
    while (items.length < 4) {
      const kind = pick(s, kinds);
      if (kind !== 'tape' && items.some((w) => w.kind === kind)) continue;
      const w = { kind, sold: false };
      if (kind === 'tape') w.skill = pick(s, tapeSkills());
      if (kind === 'snack') w.genre = pick(s, GENRE_IDS);
      items.push(w);
    }
    s.shop = { items };
    s.phase = 'shop';
  }

  function buy(s, i, targetId) {
    if (s.phase !== 'shop') return 'Shop is closed.';
    const w = s.shop.items[i];
    if (!w || w.sold) return 'Sold out.';
    const W = WARES[w.kind];
    if (s.pop < W.cost) return 'Not enough 🍿.';
    const m = W.target ? mon(s, targetId) : null;
    if (W.target && !m) return 'Pick a Tropeling.';
    if (w.kind === 'tape') { if (hasSkill(m, w.skill)) return `${m.name} already knows that.`; learn(s, m, w.skill, false); }
    if (w.kind === 'snack') { m.aff[w.genre] += 8; m.fatigue = Math.max(0, m.fatigue - 20); }
    if (w.kind === 'splice') {
      const opts = STATS.filter((st) => m.genes[st] < 5);
      if (!opts.length) return `${m.name}'s genes are already perfect.`;
      const st = pick(s, opts); m.genes[st]++;
      log(s, `🧬 ${m.name}'s ${st.toUpperCase()} gene improved.`);
    }
    if (w.kind === 'drink') for (const x of s.roster) x.fatigue = 0;
    if (w.kind === 'egg') {
      if (s.roster.length >= ROSTER_CAP) return 'Ranch is full.';
      const c = newMon(s);
      for (const st of STATS) c.genes[st] = ri(s, 2, 4);
      learn(s, c, pick(s, tapeSkills()), false, true);
      s.roster.push(c);
      if (s.team.length < TEAM_CAP) s.team.push(c.id);
      log(s, `🥚 A ${c.name} hatched from the Mystery Egg.`);
    }
    if (w.kind === 'renewal') { if (s.lives >= MAX_LIVES) return 'Already at max ♥.'; s.lives++; }
    s.pop -= W.cost; w.sold = true;
    return null;
  }

  function leave(s) {
    if (s.phase === 'shop' || (s.phase === 'event' && s.event.result)) endDay(s);
  }

  // ---------- Events ----------
  const anyMon = (s) => pick(s, s.roster);
  const EVENTS = [
    { title: 'The Jellybean Choice', text: 'A stranger in a long coat and tiny sunglasses offers two jellybeans.',
      options: [
        { label: 'Take the red one', run: (s) => { const m = anyMon(s); m.stats.atk *= 1.15; m.stats.def *= 0.95; return `${m.name} sees how deep the rabbit hole goes. ATK +15%, DEF -5%.`; } },
        { label: 'Take the blue one', run: (s) => { const m = anyMon(s); m.stats.def *= 1.15; m.stats.hp *= 1.08; return `${m.name} wakes up believing whatever it wants. DEF +15%, HP +8%.`; } },
      ] },
    { title: 'Crossover Episode', text: 'A Tropeling from a rival network wanders onto your set, contract in beak.',
      options: [
        { label: 'Sign it', run: (s) => {
          if (s.roster.length >= ROSTER_CAP) { s.pop += 15; return 'No room at the ranch. It leaves a gift basket. +15 🍿.'; }
          const c = newMon(s); learn(s, c, pick(s, tapeSkills()), false, true); c.genes[pick(s, STATS)] = 4; s.roster.push(c);
          if (s.team.length < TEAM_CAP) s.team.push(c.id);
          return `${c.name} joins the cast, knowing ${SKILLS[c.skills[0].id].name}.`;
        } },
        { label: 'Sell the rights', run: (s) => { s.pop += 25; return 'Legal sorts it out. +25 🍿.'; } },
      ] },
    { title: 'The Gritty Reboot', text: 'The studio wants to reboot one of your Tropelings. Darker. Edgier. New genes.',
      options: [
        { label: 'Reboot someone', run: (s) => { const m = anyMon(s); for (const st of STATS) m.genes[st] = ri(s, 1, 5); return `${m.name} was rebooted. Genes are now ${STATS.map((st) => m.genes[st]).join('/')}.`; } },
        { label: 'Respect the original', run: (s) => { for (const m of s.roster) m.fatigue = Math.max(0, m.fatigue - 30); return 'The fans approve. Everyone relaxes. Fatigue -30.'; } },
      ] },
    { title: 'Filler Arc', text: 'Nothing canon happens this week. How do you spend it?',
      options: [
        { label: 'Beach episode', run: (s) => { for (const m of s.roster) m.fatigue = 0; return 'Sun, sand, and zero plot. All fatigue cleared.'; } },
        { label: 'Tournament arc', run: (s) => { for (const m of s.roster) addXp(s, m, 12 + 5 * s.day); return 'Everyone powers up for twelve episodes straight. Big XP for all.'; } },
      ] },
    { title: 'The Unlabeled Tape', text: 'A dusty videotape with no label sits on your doorstep. It hums faintly.',
      options: [
        { label: 'Watch it', run: (s) => {
          if (R(s) < 0.6) { const m = anyMon(s); const opts = Object.keys(SKILLS).filter((k) => SKILLS[k].tier >= 1 && !hasSkill(m, k)); const k = pick(s, opts); learn(s, m, k, false); return `It was an instructional video! ${m.name} studies ${SKILLS[k].name}.`; }
          for (const m of s.roster) m.fatigue = Math.min(100, m.fatigue + 40);
          return 'Seven days... of terrible sleep. Everyone gains 40 fatigue.';
        } },
        { label: 'Return it to the video store', run: (s) => { s.pop += 15; return 'Be kind, rewind. The clerk tips you +15 🍿.'; } },
      ] },
    { title: 'Fan Theory', text: 'A forum insists your show is secretly all a dream. Lean into it?',
      options: [
        { label: 'Bet 20 🍿 on it', run: (s) => { if (s.pop < 20) return 'You cannot afford the bit.'; if (R(s) < 0.5) { s.pop += 30; return 'It trends for a week! +30 🍿.'; } s.pop -= 20; return 'The fans revolt. -20 🍿.'; } },
        { label: 'Ignore the forums', run: (s) => { const m = anyMon(s); m.stats.lck += 4; return `${m.name} stays blissfully offline. LCK +4.`; } },
      ] },
    { title: 'Time Loop', text: 'You wake up. The same song is on the radio. Again.',
      options: [
        { label: 'Use the loop to practice', run: (s) => { const m = s.roster.slice().sort((a, b) => a.level - b.level)[0]; addXp(s, m, xpNeed(m.level) * 2); return `${m.name} relives the day until it gets everything right. +2 levels.`; } },
        { label: 'Use the loop for romance', run: (s) => { for (const m of s.roster) m.breedCd = 0; return 'All breeding cooldowns reset. It was a very long day.'; } },
      ] },
    { title: 'The Acting Coach', text: '"For 25 🍿 I will teach one of them to truly BECOME the role."',
      options: [
        { label: 'Pay 25 🍿', run: (s) => { if (s.pop < 25) return 'The coach scoffs at your empty bucket.'; s.pop -= 25; const m = anyMon(s); const out = []; for (let i = 0; i < 2; i++) { const opts = STATS.filter((st) => m.genes[st] < 5); if (opts.length) { const st = pick(s, opts); m.genes[st]++; out.push(st.toUpperCase()); } } return `${m.name} finds its motivation. Genes up: ${out.join(', ') || 'none (already perfect)'}.`; } },
        { label: 'Decline', run: (s) => { s.pop += 5; return 'You keep your popcorn, and find 5 more in the couch.'; } },
      ] },
  ];

  function eventChoice(s, i) {
    if (s.phase !== 'event' || s.event.result) return false;
    const ev = EVENTS[s.event.id];
    s.event.result = ev.options[i].run(s);
    log(s, `❓ ${ev.title}: ${s.event.result}`);
    return true;
  }

  // Hint for the ranch card: where this Tropeling is heading.
  function forecast(m) {
    if (m.stage >= 3) return null;
    const lv = EVO_LV[m.stage];
    if (m.stage === 0) {
      const best = Math.max(...GENRE_IDS.map((g) => m.aff[g]));
      const lead = GENRE_IDS.filter((g) => m.aff[g] === best);
      return { lv, hint: best === 0 ? 'no genre yet (random)' : lead.map((g) => GENRES[g].name).join(' / ') };
    }
    if (m.stage === 1) return { lv, hint: m.trainOff === m.trainDef ? 'offense / defense tied' : m.trainOff > m.trainDef ? 'offense form' : 'defense form' };
    return { lv, hint: m.gen >= 3 ? 'something special…' : m.losses >= 3 ? 'something dank…' : SPECIES[Object.keys(SPECIES).find((k) => SPECIES[k].from === m.species)].name };
  }

  return {
    D, STATS, GENRE_IDS, EVO_LV, STAGE_NAMES, ROSTER_CAP, TEAM_CAP, SKILL_CAP, MAX_LIVES, ACT_DAYS, ACTS, WARES, EVENTS,
    newMeta, newRun, pickStarters, mon, train, rest, canBreed, breed, release, toggleTeam, choose, afterBattle,
    buy, leave, eventChoice, resolveLearn, forecast, xpNeed, typeMult, simulate, learn, addXp, newMon, endDay,
  };
});
