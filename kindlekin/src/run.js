// Kindlekin — expedition rules (DESIGN.md §5–§7). Pure logic, no DOM, seeded via rng.js.
//
// Flow (the screen drives it):
//   const run = createRun({ party: creatures.map((c) => makeFighter(c, effectiveStats(state, c))), seed });
//   choices(run)                    -> nodes you may enter next (1 or 2)
//   enterNode(run, lane)            -> { node, events }     entry stress applied
//   combat: startBattle(run)        -> battle (src/battle.js); step it; then finishBattle(run, battle)
//   rest:   resolveRest(run)        event: resolveEvent(run)
//   if run.pendingBoons: pickBoon(run, id) (or skipBoon(run))
//   completeNode(run)               -> { floorCleared, done }
//   run.done / run.outcome ('cleared' | 'wiped' | 'fled')
//   applyRunToSave(state, run, { getCreature, recordDeath }) -> summary for the garden

import { TUNING as T, BOONS, EVENTS, CREATURES } from './data.js';
import { createRng } from './rng.js';
import { createBattle, makeEnemy, changeStress, boonEffects } from './battle.js';

const BOON = Object.fromEntries(BOONS.map((b) => [b.id, b]));
const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
const SPECIES = Object.fromEntries(CREATURES.map((c) => [c.id, c]));

export const NODE_INFO = {
  fight: { name: 'Fight', desc: 'A pack of Gloomlets.' },
  elite: { name: 'Elite', desc: 'A Dire Gloomlet guards the way. Boon after.' },
  rest: { name: 'Rest', desc: 'Heal 40% max HP, Stress -25.' },
  event: { name: 'Event', desc: 'Something stirs in the dark…' },
  boss: { name: 'Hollow Warden', desc: 'The heart of the Gloom.' },
};

/**
 * Build a run member from a save creature and effectiveStats(state, creature).
 * `eff` may be omitted (tests): the creature's own stats are used.
 */
export function makeFighter(c, eff = {}) {
  const sp = SPECIES[c.species] || {};
  const maxHp = Math.round(eff.maxHp ?? c.maxHp);
  const hpFrac = c.maxHp ? Math.max(0, Math.min(1, c.hp / c.maxHp)) : 1;
  return {
    key: c.uid, uid: c.uid, side: 'party', name: c.name || sp.name || c.species, species: c.species,
    sprite: eff.sprite || c.species, element: eff.element || sp.element || 'shadow',
    might: eff.might ?? c.might, wit: eff.wit ?? c.wit, heart: eff.heart ?? c.heart,
    maxHp, hp: Math.max(1, Math.round(maxHp * hpFrac)), stress: c.stress || 0, bond: c.bond || 0,
    critBonus: eff.critBonus || 0, damageMult: eff.damageMult ?? 1, stressGainMult: eff.stressGainMult ?? 1,
    mendMult: eff.mendMult ?? 1, restHealBonusPct: eff.restHealBonusPct || 0,
    affliction: c.affliction || null, virtue: null, breaks: 0,
    lastEmberUsed: false, devotedUsed: false, dead: false, deathCause: null,
  };
}

/** Roll the node map for one floor: array of 5 steps, each an array of nodes (lanes). */
export function makeFloorMap(rng, floor) {
  const steps = [];
  for (let s = 1; s <= T.STEPS_PER_FLOOR; s++) {
    let types;
    if (s === 1) types = ['fight'];
    else if (s === T.STEPS_PER_FLOOR) types = [floor === T.FLOORS ? 'boss' : 'elite'];
    else {
      types = [];
      for (let l = 0; l < T.LANES; l++) {
        // lanes on one step are always different types (a choice between twins is no choice)
        const w = Object.fromEntries(Object.entries(T.NODE_WEIGHTS).filter(([k]) => !types.includes(k)));
        types.push(rng.weighted(w));
      }
      if (s === T.GUARANTEED_REST_STEP && !types.includes('rest')) types[rng.int(0, types.length - 1)] = 'rest';
    }
    steps.push(types.map((type, lane) => ({ type, floor, step: s, lane, eventId: type === 'event' ? rng.pick(EVENTS).id : null })));
  }
  return steps;
}

export function createRun({ party, seed = 1, rng = null }) {
  const r = rng || createRng(seed);
  const map = {};
  for (let f = 1; f <= T.FLOORS; f++) map[f] = makeFloorMap(r, f);
  const run = {
    floor: 1, step: 0, path: [], map, party, boons: [], motes: 0,
    current: null, pendingBoons: null, firstFightDone: {}, floorReached: 1,
    done: false, outcome: null, log: [],
  };
  Object.defineProperty(run, 'rng', { value: r, enumerable: false });
  return run;
}

export const living = (run) => run.party.filter((m) => !m.dead);
export const boonFx = (run) => boonEffects(run.boons.map((id) => BOON[id]));
const env = (run) => ({ rng: run.rng, fx: boonFx(run) });

function checkWipe(run) {
  if (!living(run).length) { run.done = true; run.outcome = 'wiped'; }
  return run.done;
}

/** Nodes the party may enter next. */
export function choices(run) {
  if (run.done || run.current) return [];
  return run.map[run.floor][run.step] || [];
}

const STRESS_KEY = { fight: 'fight', elite: 'elite', boss: 'boss' };

export function enterNode(run, lane = 0) {
  const opts = choices(run);
  const node = opts[lane] || opts[0];
  if (!node) throw new Error('no node to enter');
  run.current = node;
  run.path.push({ floor: run.floor, step: run.step, lane: node.lane });
  const events = [];
  const k = STRESS_KEY[node.type];
  if (k) for (const m of living(run)) changeStress(run.party, m, T.STRESS_ENTER[k], env(run), events, 'enter');
  checkWipe(run);
  return { node, events };
}

/** Enemy list for a combat node. */
export function encounterFor(node) {
  const ids = node.type === 'boss' ? T.BOSS_GROUP : node.type === 'elite' ? T.ELITE_GROUPS[node.floor] : T.FIGHT_GROUPS[node.floor];
  return ids.map((id, i) => makeEnemy(id, node.floor, i));
}

export function startBattle(run) {
  const node = run.current;
  return createBattle({ party: living(run), enemies: encounterFor(node), boons: run.boons.map((id) => BOON[id]), rng: run.rng, floor: node.floor });
}

export const motesFor = (type, fx) => Math.ceil((T.MOTES[type] || 0) * (fx.moteMult || 1));

/** After a battle ended. Returns { outcome, motes, boonOffer }. */
export function finishBattle(run, battle) {
  const node = run.current;
  const outcome = battle.state.outcome;
  let motes = 0, boonOffer = null;
  if (outcome === 'won') {
    motes = motesFor(node.type, boonFx(run));
    run.motes += motes;
    if (node.type === 'boss') { run.done = true; run.outcome = 'cleared'; }
    else if (node.type === 'elite' || (node.type === 'fight' && !run.firstFightDone[run.floor])) boonOffer = offerBoons(run);
    if (node.type === 'fight') run.firstFightDone[run.floor] = true;
  } else if (outcome === 'fled' && node.type === 'boss') {
    run.done = true; run.outcome = 'fled';
  }
  checkWipe(run);
  run.log.push({ floor: run.floor, step: run.step, type: node.type, outcome, rounds: battle.state.round });
  return { outcome: run.outcome === 'wiped' ? 'wiped' : outcome, motes, boonOffer };
}

export function resolveRest(run) {
  const fx = boonFx(run), events = [];
  for (const m of living(run)) {
    const pct = T.REST_HEAL_PCT + fx.restHealBonusPct + (m.restHealBonusPct || 0);
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * pct));
    events.push({ type: 'heal', dst: m.key, amount: m.hp - before });
    changeStress(run.party, m, T.REST_STRESS + fx.restStressBonus, env(run), events, 'rest');
  }
  return events;
}

/** Resolve the current event node. Returns { event, events, boonOffer, motes, target }. */
export function resolveEvent(run) {
  const ev = EVENT[run.current.eventId];
  const events = [];
  let boonOffer = null, motes = 0, target = null;
  const e = ev.effect;
  if (e.boonPick) boonOffer = offerBoons(run);
  if (e.target === 'lowestBond') {
    const alive = living(run);
    target = alive.reduce((a, b) => (b.bond < a.bond ? b : a), alive[0]);
    if (target) {
      target.bond = Math.min(T.BOND_MAX, target.bond + e.bond);
      changeStress(run.party, target, e.stress, env(run), events, 'event');
    }
  }
  if (e.target === 'party') {
    for (const m of living(run)) changeStress(run.party, m, e.stress, env(run), events, 'event');
    motes = e.motes || 0; run.motes += motes;
  }
  checkWipe(run);
  return { event: ev, events, boonOffer, motes, target };
}

/** Up to BOON_CHOICES boons not yet owned; sets run.pendingBoons. */
export function offerBoons(run) {
  const pool = BOONS.filter((b) => !run.boons.includes(b.id));
  const offer = run.rng.shuffle(pool).slice(0, T.BOON_CHOICES).map((b) => b.id);
  run.pendingBoons = offer.length ? offer : null;
  return run.pendingBoons;
}

export function pickBoon(run, id) {
  if (!run.pendingBoons || !run.pendingBoons.includes(id)) throw new Error(`boon ${id} not on offer`);
  run.pendingBoons = null;
  if (run.boons.includes(id)) return;
  run.boons.push(id);
  const b = BOON[id];
  if (b.effect.maxHpMult) {
    for (const m of run.party) {
      if (m.dead) continue;
      const nm = Math.round(m.maxHp * b.effect.maxHpMult);
      m.hp += nm - m.maxHp; m.maxHp = nm;
    }
  }
}
export function skipBoon(run) { run.pendingBoons = null; }

/** Finish the current node and move on. Returns { floorCleared, done, healed }. */
export function completeNode(run) {
  run.current = null;
  if (run.done) return { floorCleared: false, done: true };
  run.step += 1;
  if (run.step >= T.STEPS_PER_FLOOR) {
    const healed = [];
    for (const m of living(run)) {
      const before = m.hp;
      m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * T.FLOOR_CLEAR_HEAL_PCT));
      healed.push({ key: m.key, amount: m.hp - before });
    }
    const cleared = run.floor;
    if (run.floor >= T.FLOORS) { run.done = true; run.outcome = run.outcome || 'cleared'; return { floorCleared: cleared, done: true, healed }; }
    run.floor += 1; run.step = 0; run.floorReached = Math.max(run.floorReached, run.floor);
    return { floorCleared: cleared, done: false, healed };
  }
  return { floorCleared: false, done: false };
}

/**
 * Write the run's results into the save. Helpers come from state.js so this stays testable.
 * Returns the summary the garden expects: { outcome, floorReached, motes, fallen, hatchedLegacy }.
 */
export function applyRunToSave(state, run, { getCreature, recordDeath }) {
  const fallen = [], hatchedLegacy = [];
  for (const m of run.party) {
    const c = getCreature(state, m.uid);
    if (!c) continue;
    if (m.dead) {
      fallen.push(m.name);
      const res = recordDeath(state, m.uid, m.deathCause || 'lost in the Gloom');
      if (res && res.legacyEgg) hatchedLegacy.push(res.legacyEgg.name || m.name);
      continue;
    }
    c.hp = Math.max(1, Math.min(c.maxHp, Math.round((m.hp / m.maxHp) * c.maxHp)));
    c.stress = Math.max(T.STRESS_MIN, Math.min(T.STRESS_MAX, Math.round(m.stress)));
    c.bond = Math.max(T.BOND_MIN, Math.min(T.BOND_MAX, Math.round(m.bond)));
    c.affliction = m.affliction || null;
  }
  state.motes = (state.motes || 0) + run.motes;
  state.bestFloor = Math.max(state.bestFloor || 0, run.floorReached);
  state.expeditions = (state.expeditions || 0) + 1;
  const outcome = run.outcome === 'wiped' ? 'wiped' : run.outcome === 'cleared' ? 'cleared' : 'fled';
  return { outcome, floorReached: run.floorReached, motes: run.motes, fallen, hatchedLegacy };
}

/**
 * Auto-play a whole run (tests / balance). Policy: rest when it's offered and someone is hurt,
 * else prefer fight > event > elite; pick the first boon offered; cheer at round 1.
 */
export function autoRun({ party, seed, policy = {} }) {
  const run = createRun({ party, seed });
  const cheerRound = policy.cheerRound ?? 1;
  let guard = 0;
  while (!run.done && guard++ < 100) {
    const opts = choices(run);
    let lane = 0;
    if (opts.length > 1) {
      const hurt = living(run).some((m) => m.hp < m.maxHp * 0.6 || m.stress >= 60);
      const rank = { rest: hurt ? 0 : 4, fight: 1, event: 2, elite: 3 };
      lane = opts.map((n, i) => [rank[n.type] ?? 5, i]).sort((a, b) => a[0] - b[0])[0][1];
    }
    const { node } = enterNode(run, lane);
    if (run.done) break;
    if (['fight', 'elite', 'boss'].includes(node.type)) {
      const b = startBattle(run);
      let n = 0;
      while (!b.state.ended && n++ < 5000) {
        if (cheerRound && b.state.cheersLeft > 0 && b.state.round + 1 >= cheerRound && !b.state.queue.length) b.cheer();
        b.step();
      }
      finishBattle(run, b);
    } else if (node.type === 'rest') resolveRest(run);
    else resolveEvent(run);
    if (run.pendingBoons) pickBoon(run, (policy.pickBoon || ((o) => o[0]))(run.pendingBoons, run));
    completeNode(run);
  }
  return run;
}
