// Kindlekin — save data and garden rules. Pure logic: no DOM (localStorage is optional).
// Every number comes from data.js; all randomness from rng.js.

import { TUNING, CREATURES, GARDEN_ACTIONS, PERSONALITIES, AFFLICTIONS } from './data.js';
import { createRng } from './rng.js';

export const SAVE_KEY = 'kindlekin.save.v1';
export const SAVE_VERSION = 1;
const STATS = ['might', 'wit', 'heart'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const speciesOf = (id) => CREATURES.find((c) => c.id === id) || null;
export const actionOf = (id) => GARDEN_ACTIONS.find((a) => a.id === id) || null;
export const afflictionOf = (id) => AFFLICTIONS.find((a) => a.id === id) || null;
const statName = (s) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- rng

/** Run fn(rng) with the save's seeded rng and persist the advanced seed. */
export function withRng(state, fn) {
  const rng = createRng(state.seed);
  const out = fn(rng);
  state.seed = rng.getState();
  return out;
}

// ---------------------------------------------------------------- creation

function nextUid(state) {
  state.nextUid = (state.nextUid || 1);
  const n = state.nextUid++;
  return withRng(state, (r) => `k${n}-${r.int(0, 0xffff).toString(36)}`);
}

/** Root egg id for any species in a line (blazefang -> flarekit_egg). */
export function eggOf(speciesId) {
  let id = speciesId;
  for (let guard = 0; guard < 5; guard++) {
    const sp = speciesOf(id);
    if (!sp || sp.stage === 'egg') return id;
    const parent = CREATURES.find((c) => c.evolvesTo.some((e) => e.to === id));
    if (!parent) return id;
    id = parent.id;
  }
  return id;
}

export function makeCreature(state, speciesId, extra = {}) {
  const sp = speciesOf(speciesId);
  if (!sp) throw new Error(`unknown species ${speciesId}`);
  const isEgg = sp.stage === 'egg';
  return {
    uid: nextUid(state),
    name: sp.name,
    species: sp.id,
    might: sp.base.might, wit: sp.base.wit, heart: sp.base.heart,
    maxHp: sp.base.hp, hp: sp.base.hp,
    bond: isEgg ? 0 : TUNING.BOND_START,
    stress: 0,
    pets: 0,
    hatchedDay: isEgg ? null : state.day,
    actionCounts: {},
    actionSeen: {}, // { actionId: lifetime action index when last received } — for personality tie-break
    lastAction: null,
    todayActions: {},
    affliction: null,
    legacy: null,
    ...extra,
  };
}

export function newGame(seed) {
  const s = (seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0)) >>> 0;
  const state = {
    version: SAVE_VERSION,
    seed: s,
    day: 1,
    actionsLeft: TUNING.ACTIONS_PER_DAY,
    extraBought: 0,
    motes: 0,
    emberstones: { might: 0, wit: 0, heart: 0 },
    creatures: [],
    memorials: [],
    bestFloor: 0,
    expeditions: 0,
    nextUid: 1,
    pendingExpedition: null, // { day, party } while an expedition is out
  };
  for (const id of ['flarekit_egg', 'puddlin_egg', 'sproutle_egg']) state.creatures.push(makeCreature(state, id));
  return state;
}

// ---------------------------------------------------------------- save

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function hasSave() {
  try { const ls = storage(); return !!(ls && ls.getItem(SAVE_KEY)); } catch { return false; }
}

/** Normalise a parsed save so older/partial saves keep working. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.creatures)) return null;
  const base = newGame(raw.seed);
  const st = { ...base, ...raw, creatures: [], emberstones: { ...base.emberstones, ...(raw.emberstones || {}) } };
  st.memorials = Array.isArray(raw.memorials) ? raw.memorials : [];
  for (const c of raw.creatures) {
    if (!c || !speciesOf(c.species)) continue;
    st.creatures.push({
      actionCounts: {}, actionSeen: {}, todayActions: {}, lastAction: null, affliction: null, legacy: null, pets: 0,
      ...c,
    });
  }
  const maxN = st.creatures.reduce((n, c) => Math.max(n, parseInt(String(c.uid).replace(/^k/, ''), 10) || 0), 0);
  st.nextUid = Math.max(st.nextUid || 1, maxN + 1);
  st.version = SAVE_VERSION;
  return st;
}

export function loadGame() {
  try {
    const ls = storage();
    const txt = ls && ls.getItem(SAVE_KEY);
    return txt ? migrate(JSON.parse(txt)) : null;
  } catch { return null; }
}

export function saveGame(state) {
  try {
    const ls = storage();
    if (!ls || !state) return false;
    ls.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { storage()?.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- queries

export const getCreature = (state, uid) => state.creatures.find((c) => c.uid === uid) || null;
export const isEgg = (c) => speciesOf(c.species)?.stage === 'egg';
export const stageOf = (c) => speciesOf(c.species)?.stage || 'baby';
export const elementOf = (c) => speciesOf(c.species)?.element || 'shadow';

export function personalityOf(creature) {
  const counts = creature.actionCounts || {};
  const seen = creature.actionSeen || {};
  let best = null;
  for (const a of GARDEN_ACTIONS) {
    const n = counts[a.id] || 0;
    if (n <= 0) continue;
    if (!best || n > best.n || (n === best.n && (seen[a.id] || 0) > (seen[best.id] || 0))) best = { id: a.id, n };
  }
  if (!best || best.n < TUNING.PERSONALITY_MIN_ACTIONS) return PERSONALITIES.find((p) => p.id === 'unformed');
  return PERSONALITIES.find((p) => p.fromAction === best.id);
}

export function moodOf(creature) {
  if (creature.stress >= TUNING.MOOD_FRAZZLED_STRESS) return 'stressed';
  if (creature.stress >= TUNING.MOOD_UNEASY_STRESS) return 'neutral';
  return 'happy';
}

export function spriteIdOf(creature) {
  return isEgg(creature) ? 'egg' : creature.species;
}

export function highestStat(c) {
  // tie order: might > wit > heart
  return STATS.reduce((best, s) => (c[s] > c[best] ? s : best), 'might');
}

export function emberBonus(state, stat) {
  return Math.min(state.emberstones?.[stat] || 0, TUNING.EMBERSTONE_MAX_PER_STAT) * TUNING.EMBERSTONE_TRAIN_BONUS;
}

export function effectiveStats(state, creature) {
  const fx = personalityOf(creature).effect || {};
  return {
    might: creature.might,
    wit: creature.wit,
    heart: creature.heart,
    maxHp: Math.round(creature.maxHp * (fx.maxHpMult || 1)),
    element: elementOf(creature),
    critBonus: fx.critBonus || 0,
    damageMult: fx.damageMult || 1,
    stressGainMult: fx.stressGainMult || 1,
    mendMult: fx.mendMult || 1,
    restHealBonusPct: fx.restHealBonusPct || 0,
  };
}

export function addStress(creature, amount, mult = 1) {
  const d = amount > 0 ? Math.round(amount * mult) : amount;
  creature.stress = clamp(creature.stress + d, TUNING.STRESS_MIN, TUNING.STRESS_MAX);
  return creature.stress;
}

// ---------------------------------------------------------------- death & legacy

export function recordDeath(state, uid, cause = 'Fell in the Gloom') {
  const c = getCreature(state, uid);
  if (!c) return { memorial: null, legacyEgg: null };
  const top = highestStat(c);
  const memorial = { name: c.name, species: c.species, day: state.day, cause, highestStat: top };
  state.memorials.push(memorial);
  state.emberstones[top] = (state.emberstones[top] || 0) + 1;
  state.creatures = state.creatures.filter((x) => x.uid !== uid);

  const k = TUNING.LEGACY_EGG_INHERIT_PCT;
  const legacyEgg = makeCreature(state, eggOf(c.species), {
    legacy: { from: c.name, might: Math.floor(c.might * k), wit: Math.floor(c.wit * k), heart: Math.floor(c.heart * k) },
  });
  state.creatures.push(legacyEgg);
  return { memorial, legacyEgg };
}

// ---------------------------------------------------------------- hatch & evolve

function hatch(state, c) {
  const from = c.species;
  const sp = speciesOf(from);
  const to = sp.evolvesTo[0].to;
  const baby = speciesOf(to);
  const lg = c.legacy || {};
  const wasDefault = c.name === sp.name;
  Object.assign(c, {
    species: to,
    might: clamp(baby.base.might + (lg.might || 0), 0, TUNING.STAT_CAP),
    wit: clamp(baby.base.wit + (lg.wit || 0), 0, TUNING.STAT_CAP),
    heart: clamp(baby.base.heart + (lg.heart || 0), 0, TUNING.STAT_CAP),
    maxHp: baby.base.hp, hp: baby.base.hp,
    bond: TUNING.BOND_START, stress: 0,
    hatchedDay: state.day,
  });
  if (wasDefault) c.name = baby.name;
  return { type: 'hatched', uid: c.uid, from, to };
}

/** Which adult a baby would become right now (ignoring the day requirement), or null. */
export function evolutionTarget(c) {
  const sp = speciesOf(c.species);
  if (!sp || sp.stage !== 'baby') return null;
  const ok = sp.evolvesTo.filter((e) => {
    const k = e.conditions;
    return STATS.every((s) => k[s] == null || c[s] >= k[s]) && (k.bond == null || c.bond >= k.bond);
  });
  if (!ok.length) return null;
  ok.sort((a, b) => {
    const d = c[b.branch] - c[a.branch];
    if (d) return d;
    return (b.branch === TUNING.EVOLVE_TIE_BREAK) - (a.branch === TUNING.EVOLVE_TIE_BREAK);
  });
  return ok[0];
}

export function daysSinceHatch(state, c) {
  return c.hatchedDay == null ? 0 : state.day - c.hatchedDay;
}

export function checkEvolution(state, c) {
  const sp = speciesOf(c.species);
  if (!sp || sp.stage !== 'baby') return null;
  if (daysSinceHatch(state, c) < TUNING.EVOLVE_MIN_DAYS) return null;
  const e = evolutionTarget(c);
  if (!e) return null;
  const adult = speciesOf(e.to);
  const b = adult.evolveBonus;
  const from = c.species;
  const wasDefault = c.name === sp.name;
  for (const s of STATS) c[s] = clamp(c[s] + b[s], 0, TUNING.STAT_CAP);
  c.maxHp += b.hp;
  c.hp = c.maxHp;
  c.species = adult.id;
  if (wasDefault) c.name = adult.name;
  return { type: 'evolved', uid: c.uid, from, to: adult.id, branch: e.branch };
}

/** Human-readable "what next" for the care panel. */
export function evolutionHint(state, c) {
  const sp = speciesOf(c.species);
  if (sp.stage === 'egg') {
    const left = TUNING.HATCH_PETS - (c.pets || 0);
    return { title: `Pet ${left} more time${left === 1 ? '' : 's'} to hatch`, lines: [], progress: (c.pets || 0) / TUNING.HATCH_PETS };
  }
  if (sp.stage === 'adult') return { title: 'Fully grown', lines: ['Keep training up to the cap of ' + TUNING.STAT_CAP + '.'] };
  const days = daysSinceHatch(state, c);
  const waitDays = Math.max(0, TUNING.EVOLVE_MIN_DAYS - days);
  const lines = sp.evolvesTo.map((e) => {
    const k = e.conditions;
    const name = speciesOf(e.to).name;
    const reqs = [];
    for (const s of STATS) if (k[s] != null) reqs.push({ label: statName(s), have: c[s], need: k[s] });
    if (k.bond != null) reqs.push({ label: 'Bond', have: c.bond, need: k.bond });
    return { to: e.to, name, branch: e.branch, reqs, met: reqs.every((r) => r.have >= r.need) };
  });
  const title = waitDays > 0
    ? `Can grow up in ${waitDays} day${waitDays === 1 ? '' : 's'}`
    : 'Ready to grow up at dawn if a path is met';
  return { title, lines, waitDays };
}

// ---------------------------------------------------------------- actions

/** Can `actionId` be done on creature `uid` right now? -> { ok, reason } */
export function canDoAction(state, uid, actionId) {
  const c = getCreature(state, uid);
  const a = actionOf(actionId);
  if (!c) return { ok: false, reason: 'No such creature' };
  if (!a) return { ok: false, reason: 'Unknown action' };
  if (state.actionsLeft < a.cost) return { ok: false, reason: 'No actions left today' };
  if (isEgg(c) && a.id !== 'pet') return { ok: false, reason: 'Eggs only like pets' };
  if (a.maxPerCreaturePerDay != null && (c.todayActions[a.id] || 0) >= a.maxPerCreaturePerDay) {
    return { ok: false, reason: `Full for today (${a.maxPerCreaturePerDay}/day)` };
  }
  if (a.kind === 'train') {
    if (c.stress >= TUNING.TRAIN_REFUSE_STRESS) return { ok: false, reason: 'Too stressed to train' };
    const stat = STATS.find((s) => a.effects[s]);
    if (stat && c[stat] >= TUNING.STAT_CAP) return { ok: false, reason: `${statName(stat)} is maxed` };
  }
  return { ok: true, reason: '' };
}

function receive(c, actionId) {
  c.actionCounts[actionId] = (c.actionCounts[actionId] || 0) + 1;
  const total = Object.values(c.actionCounts).reduce((n, v) => n + v, 0);
  c.actionSeen = c.actionSeen || {};
  c.actionSeen[actionId] = total;
  c.lastAction = actionId;
}

/**
 * Perform a garden action. -> { ok, reason, events[] }
 * events: { type:'stat', uid, stat, delta } · { type:'hatched'|'evolved', ... } · { type:'cured', uid, affliction }
 *         { type:'personality', uid, to }
 */
export function doAction(state, uid, actionId) {
  const chk = canDoAction(state, uid, actionId);
  if (!chk.ok) return { ok: false, reason: chk.reason, events: [] };
  const c = getCreature(state, uid);
  const a = actionOf(actionId);
  const events = [];
  state.actionsLeft -= a.cost;
  c.todayActions[a.id] = (c.todayActions[a.id] || 0) + 1;

  if (isEgg(c)) {
    c.pets = (c.pets || 0) + 1;
    events.push({ type: 'pets', uid, pets: c.pets, need: TUNING.HATCH_PETS });
    if (c.pets >= TUNING.HATCH_PETS) events.push(hatch(state, c));
    return { ok: true, reason: '', events };
  }

  const before = personalityOf(c).id;
  const fx = a.effects;
  for (const s of STATS) {
    if (!fx[s]) continue;
    let gain = fx[s];
    if (a.kind === 'train') {
      if (c.bond >= TUNING.BOND_TRAIN_BONUS_AT) gain += TUNING.BOND_TRAIN_BONUS;
      gain += emberBonus(state, s);
    }
    const old = c[s];
    c[s] = clamp(c[s] + gain, 0, TUNING.STAT_CAP);
    if (c[s] !== old) events.push({ type: 'stat', uid, stat: s, delta: c[s] - old });
  }
  if (fx.maxHp) {
    c.maxHp += fx.maxHp; c.hp = Math.min(c.maxHp, c.hp + fx.maxHp);
    events.push({ type: 'stat', uid, stat: 'maxHp', delta: fx.maxHp });
  }
  if (fx.bond) {
    const old = c.bond;
    c.bond = clamp(c.bond + fx.bond, TUNING.BOND_MIN, TUNING.BOND_MAX);
    if (c.bond !== old) events.push({ type: 'stat', uid, stat: 'bond', delta: c.bond - old });
  }
  if (fx.stress) {
    const old = c.stress;
    addStress(c, fx.stress, effectiveStats(state, c).stressGainMult);
    if (c.stress !== old) events.push({ type: 'stat', uid, stat: 'stress', delta: c.stress - old });
  }
  receive(c, a.id);
  const after = personalityOf(c).id;
  if (after !== before) events.push({ type: 'personality', uid, to: after });
  if (c.affliction && c.stress < TUNING.AFFLICTION_CURE_STRESS) {
    events.push({ type: 'cured', uid, affliction: c.affliction });
    c.affliction = null;
  }
  return { ok: true, reason: '', events };
}

export function canBuyExtraAction(state) {
  if (state.extraBought >= TUNING.MAX_EXTRA_ACTIONS_PER_DAY) return { ok: false, reason: 'Max extra actions today' };
  if (state.motes < TUNING.MOTES_PER_EXTRA_ACTION) return { ok: false, reason: `Needs ${TUNING.MOTES_PER_EXTRA_ACTION} Motes` };
  return { ok: true, reason: '' };
}

export function buyExtraAction(state) {
  const chk = canBuyExtraAction(state);
  if (!chk.ok) return chk;
  state.motes -= TUNING.MOTES_PER_EXTRA_ACTION;
  state.extraBought += 1;
  state.actionsLeft += 1;
  return { ok: true, reason: '' };
}

/**
 * Overnight. opts.away = uids that spent the day on an expedition (exempt from neglect).
 * -> { events[] } with 'neglected', 'cured', 'evolved' events, then a 'dawn' event.
 */
export function endDay(state, opts = {}) {
  const away = new Set(opts.away || []);
  const events = [];
  for (const c of state.creatures) {
    if (isEgg(c)) { c.todayActions = {}; continue; }
    c.hp = Math.min(c.maxHp, Math.max(c.hp, Math.round(c.maxHp * TUNING.OVERNIGHT_HEAL_PCT)));
    addStress(c, TUNING.OVERNIGHT_STRESS);
    const acted = Object.values(c.todayActions || {}).some((n) => n > 0);
    if (!acted && !away.has(c.uid)) {
      const old = c.bond;
      c.bond = clamp(c.bond + TUNING.NEGLECT_BOND, TUNING.BOND_MIN, TUNING.BOND_MAX);
      if (c.bond !== old) events.push({ type: 'neglected', uid: c.uid, delta: c.bond - old });
    }
    if (c.affliction && c.stress < TUNING.AFFLICTION_CURE_STRESS) {
      events.push({ type: 'cured', uid: c.uid, affliction: c.affliction });
      c.affliction = null;
    }
    c.todayActions = {};
  }
  state.day += 1;
  state.actionsLeft = TUNING.ACTIONS_PER_DAY;
  state.extraBought = 0;
  for (const c of state.creatures) {
    const ev = checkEvolution(state, c);
    if (ev) events.push(ev);
  }
  events.push({ type: 'dawn', day: state.day });
  return { events };
}

// ---------------------------------------------------------------- expedition hand-off

export function partyCandidates(state) {
  return state.creatures.filter((c) => !isEgg(c) && c.hp > 0);
}

/** Mark an expedition as launched (the garden day ends when it returns). */
export function beginExpedition(state, party) {
  state.pendingExpedition = { day: state.day, party: party.slice(0, TUNING.PARTY_SIZE) };
  state.actionsLeft = 0;
}

/** Called by the garden when an expedition comes back: ends the day, party exempt from neglect. */
export function finishExpedition(state) {
  const p = state.pendingExpedition;
  state.pendingExpedition = null;
  if (!p) return { events: [] };
  return endDay(state, { away: p.party });
}
