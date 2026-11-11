// Kindlekin — pure, deterministic auto-battle (DESIGN.md §4, §6, §7).
// No DOM, no Math.random: all chance goes through the rng passed in (src/rng.js).
//
// Fighters are plain objects. Party fighters are MUTATED IN PLACE (hp, stress, affliction,
// virtue, breaks, lastEmberUsed, devotedUsed, dead, deathCause) so run.js keeps one object per
// creature for the whole expedition. Enemy fighters come from makeEnemy().
//
// Party fighter shape (see makeFighter in run.js):
//   { key, side:'party', uid, name, sprite, element, might, wit, heart, maxHp, hp, stress, bond,
//     critBonus, damageMult, stressGainMult, mendMult, affliction, virtue, breaks,
//     lastEmberUsed, devotedUsed, dead }
//
// const b = createBattle({ party, enemies, boons, rng });
// b.step() -> events[]   one actor's turn (plus round start / round end / end events)
// b.cheer() -> events[]  the one player input
// b.state                { round, party, enemies, cheersLeft, cheerRound, ended, outcome }
// simulate({...}, { cheerRound: 1 }) runs to the end.

import { TUNING as T, ELEMENTS, ENEMIES, AFFLICTIONS, VIRTUES } from './data.js';

const AFF = Object.fromEntries(AFFLICTIONS.map((a) => [a.id, a]));
const VIR = Object.fromEntries(VIRTUES.map((v) => [v.id, v]));
const ENEMY = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

export const afflictionOf = (f) => (f.affliction ? AFF[f.affliction] : null);
export const virtueOf = (f) => (f.virtue ? VIR[f.virtue] : null);
const affFx = (f) => afflictionOf(f)?.effect || {};
const virFx = (f) => virtueOf(f)?.effect || {};

/** Combine the boons owned this run into one effect bag. */
export function boonEffects(boons = []) {
  const fx = { elementDamageMult: {}, maxHpMult: 1, stressGainMult: 1, extraCheers: 0, critBonus: 0,
    restHealBonusPct: 0, restStressBonus: 0, moteMult: 1, negateFirstHitPerFight: false };
  for (const b of boons) {
    const e = b.effect || b;
    for (const [el, m] of Object.entries(e.elementDamageMult || {})) fx.elementDamageMult[el] = (fx.elementDamageMult[el] || 1) * m;
    if (e.maxHpMult) fx.maxHpMult *= e.maxHpMult;
    if (e.stressGainMult) fx.stressGainMult *= e.stressGainMult;
    if (e.extraCheers) fx.extraCheers += e.extraCheers;
    if (e.critBonus) fx.critBonus += e.critBonus;
    if (e.restHealBonusPct) fx.restHealBonusPct += e.restHealBonusPct;
    if (e.restStressBonus) fx.restStressBonus += e.restStressBonus;
    if (e.moteMult) fx.moteMult *= e.moteMult;
    if (e.negateFirstHitPerFight) fx.negateFirstHitPerFight = true;
  }
  return fx;
}

/** 'strong' | 'weak' | null for attacker element vs target element. */
export function elementMatchup(atk, def) {
  if (!atk || !def || atk === 'shadow' || def === 'shadow') return null;
  if (ELEMENTS[atk]?.beats === def) return 'strong';
  if (ELEMENTS[def]?.beats === atk) return 'weak';
  return null;
}
export const elementMult = (m) => (m === 'strong' ? T.ELEMENT_STRONG : m === 'weak' ? T.ELEMENT_WEAK : 1);

/** Crit chance. The cap applies to the Wit part; perks/boons add on top, Focused ignores the cap. */
export function critChance(f, fx = boonEffects()) {
  const base = Math.min(T.CRIT_CAP, T.CRIT_BASE + T.CRIT_PER_WIT * (f.wit || 0));
  const bonus = f.side === 'party' ? (f.critBonus || 0) + fx.critBonus : 0;
  return base + bonus + (virFx(f).critBonus || 0);
}

/** The damage formula from DESIGN.md §4. `mods` = product of every other multiplier. */
export function calcDamage({ might, targetHeart, element = 1, crit = false, mods = 1 }) {
  const raw = (T.ATK_BASE + might) * element * (crit ? T.CRIT_MULT : 1) * mods;
  return Math.max(T.MIN_DAMAGE, Math.round(raw) - Math.floor(targetHeart / T.GUARD_HEART_DIV));
}

/** Enemy fighter, scaled by floor (boss unscaled). */
export function makeEnemy(id, floor = 1, slot = 0) {
  const d = ENEMY[id];
  if (!d) throw new Error(`unknown enemy ${id}`);
  const k = d.scalesWithFloor ? 1 + T.FLOOR_SCALE_PER_FLOOR * (floor - 1) : 1;
  const hp = Math.round(d.stats.hp * k);
  return {
    key: `e${slot}`, side: 'enemy', id: d.id, name: d.name, tier: d.tier, sprite: d.sprite, spriteScale: d.spriteScale,
    variant: d.id === 'dire_gloomlet' ? 'dire' : undefined, element: d.element,
    might: Math.round(d.stats.might * k), wit: d.stats.wit, heart: d.stats.heart, maxHp: hp, hp,
    special: d.special || null, dead: false,
  };
}

/** Stress mult for gains (personality x Calm Bell). */
const gainMult = (f, fx) => (f.stressGainMult ?? 1) * fx.stressGainMult;

/**
 * Change a party member's stress, resolving breaking points and second-break damage.
 * Pushes events; returns true if the member died. Used by battles AND by run.js (node entry,
 * events, stalemate) so the rules live in one place. Death of a member here also stresses allies.
 */
export function changeStress(party, f, amount, env, events, reason = '') {
  if (f.dead || !amount) return false;
  const fx = env.fx || boonEffects();
  let d = amount > 0 ? amount * gainMult(f, fx) : amount;
  d = Math.round(d);
  if (!d) return false;
  const before = f.stress;
  f.stress = Math.max(T.STRESS_MIN, Math.min(T.STRESS_MAX, f.stress + d));
  if (f.stress !== before) events.push({ type: 'stress', dst: f.key, amount: f.stress - before, total: f.stress, reason });
  if (f.stress >= T.BREAK_STRESS) return breakPoint(party, f, env, events);
  return false;
}

function breakPoint(party, f, env, events) {
  const { rng } = env;
  f.breaks = (f.breaks || 0) + 1;
  if (f.breaks === 1) {
    const vChance = T.VIRTUE_BASE_CHANCE + T.VIRTUE_CHANCE_PER_BOND * (f.bond || 0);
    if (rng.chance(vChance)) {
      const v = rng.pick(VIRTUES);
      f.virtue = v.id; f.affliction = null; f.stress = T.STRESS_AFTER_VIRTUE;
      events.push({ type: 'break', dst: f.key, kind: 'virtue', id: v.id, name: v.name, total: f.stress });
    } else {
      const a = rng.pick(AFFLICTIONS);
      f.affliction = a.id; f.virtue = null; f.stress = T.STRESS_AFTER_AFFLICTION;
      events.push({ type: 'break', dst: f.key, kind: 'affliction', id: a.id, name: a.name, total: f.stress });
    }
    return false;
  }
  const dmg = Math.round(f.maxHp * T.SECOND_BREAK_DAMAGE_PCT);
  f.hp = Math.max(0, f.hp - dmg);
  f.stress = T.STRESS_AFTER_SECOND_BREAK;
  events.push({ type: 'break', dst: f.key, kind: 'second', dmg, total: f.stress });
  if (f.hp <= 0) { kill(party, f, env, events, 'broke under the strain'); return true; }
  return false;
}

function kill(party, f, env, events, cause) {
  f.hp = 0; f.dead = true; f.deathCause = f.deathCause || cause;
  events.push({ type: 'faint', dst: f.key, side: f.side || 'party' });
  if (f.side === 'enemy') return;
  for (const o of party) if (o !== f && !o.dead) changeStress(party, o, T.STRESS_ALLY_DEATH, env, events, 'allyDeath');
}

export function createBattle({ party, enemies, boons = [], rng, floor = 1 }) {
  if (!rng) throw new Error('createBattle needs an rng');
  const fx = boonEffects(boons);
  party.forEach((f, i) => { f.side = 'party'; f.key = f.key || f.uid || `p${i}`; f.breaks = f.breaks || 0; f.stress = f.stress || 0; });
  enemies.forEach((e, i) => { e.side = 'enemy'; e.key = e.key || `e${i}`; });
  const env = { rng, fx };
  const warded = new Set(); // party keys whose Wardlight hit is used up this fight
  const S = {
    round: 0, party, enemies, floor,
    cheersLeft: T.CHEERS_PER_FIGHT + fx.extraCheers,
    cheerRound: 0, // round whose damage is boosted
    cheerMult: 1,
    ended: false, outcome: null,
    queue: [], acted: 0,
  };
  const living = (arr) => arr.filter((f) => !f.dead);
  const front = (arr) => arr.find((f) => !f.dead);
  const all = () => [...party, ...enemies];
  const byKey = (k) => all().find((f) => f.key === k);

  function startRound(events) {
    S.round += 1; S.acted = 0;
    events.push({ type: 'roundStart', round: S.round });
    // Radiant: every other ally -4 stress
    for (const f of living(party)) {
      const r = virFx(f).allyStressPerRound;
      if (r) for (const o of living(party)) if (o !== f) changeStress(party, o, r, env, events, 'radiant');
    }
    // Wit order, ties: player first, then slot order
    const order = [...living(party).map((f, i) => ({ f, s: 0, i })), ...living(enemies).map((f, i) => ({ f, s: 1, i }))];
    order.sort((a, b) => b.f.wit - a.f.wit || a.s - b.s || a.i - b.i);
    S.queue = order.map((o) => o.f.key);
  }

  function damageMods(src, dst) {
    let m = 1;
    if (src.side === 'party') {
      m *= src.damageMult ?? 1;
      m *= fx.elementDamageMult[src.element] || 1;
      if (src.stress >= T.UNEASY_STRESS) m *= T.UNEASY_DAMAGE_MULT;
      m *= affFx(src).damageMult || 1;
      if (S.cheerRound === S.round && !affFx(src).ignoresCheer) m *= S.cheerMult;
    }
    if (dst.side === 'party') {
      m *= affFx(dst).damageTakenMult || 1;
      m *= virFx(dst).damageTakenMult || 1;
    }
    return m;
  }

  /** Apply a hit. Returns the event. Handles Wardlight, Last Ember, Devoted, faint, stress. */
  function hit(src, dst, events, { mult = 1, canCrit = true, stress = null, tag = null } = {}) {
    const matchup = elementMatchup(src.element, dst.element);
    const crit = canCrit && rng.chance(critChance(src, fx));
    let dmg = calcDamage({ might: src.might, targetHeart: dst.heart, element: elementMult(matchup), crit, mods: damageMods(src, dst) * mult });
    let ward = false;
    if (dst.side === 'party' && fx.negateFirstHitPerFight && !warded.has(dst.key)) { warded.add(dst.key); ward = true; dmg = 0; }
    const ev = { type: 'attack', src: src.key, dst: dst.key, dmg, crit, element: matchup, warded: ward };
    if (tag) ev[tag] = true;
    events.push(ev);
    if (ward) return ev;
    dst.hp -= dmg;
    if (dst.hp <= 0) {
      if (dst.side === 'party' && (dst.bond || 0) >= T.LAST_EMBER_BOND && !dst.lastEmberUsed) {
        dst.hp = 1; dst.lastEmberUsed = true; events.push({ type: 'lastEmber', dst: dst.key });
      } else if (dst.side === 'party' && virFx(dst).surviveLethalOnce && !dst.devotedUsed) {
        dst.hp = 1; dst.devotedUsed = true; events.push({ type: 'devoted', dst: dst.key });
      } else {
        kill(party, dst, env, events, `fell to ${src.side === 'party' ? 'a friend' : `the ${src.name}`} on floor ${S.floor}`);
        return ev;
      }
    }
    if (dst.side === 'party') changeStress(party, dst, stress ?? (crit ? T.STRESS_CRIT_TAKEN : T.STRESS_HIT), env, events, crit ? 'crit' : 'hit');
    return ev;
  }

  function act(f, events) {
    if (f.side === 'party') {
      const a = affFx(f);
      if (a.skipTurnChance && rng.chance(a.skipTurnChance)) { events.push({ type: 'skip', src: f.key, reason: f.affliction }); return; }
      if (a.hitAllyChance && rng.chance(a.hitAllyChance)) {
        const allies = living(party).filter((o) => o !== f);
        if (allies.length) {
          const victim = rng.pick(allies);
          hit(f, victim, events, { mult: a.allyHitDamageMult, tag: 'spite' });
          for (const o of living(party)) if (o !== f && o !== victim) changeStress(party, o, a.allyStress, env, events, 'spite');
          return;
        }
      }
      const t = front(enemies);
      if (t) hit(f, t, events);
      return;
    }
    // enemy
    const sp = f.special;
    if (sp && sp.id === 'wail' && S.round % sp.everyRounds === 0) {
      const ev = { type: 'wail', src: f.key, name: sp.name, hits: [] };
      events.push(ev);
      for (const t of living(party)) {
        const sub = [];
        const h = hit(f, t, sub, { mult: sp.damageMult, canCrit: false, stress: sp.stress });
        h.wail = true;
        ev.hits.push({ dst: t.key, dmg: h.dmg, warded: h.warded });
        events.push(...sub);
      }
      return;
    }
    const t = front(party);
    if (t) hit(f, t, events);
  }

  function checkEnd(events) {
    if (S.ended) return true;
    if (!living(enemies).length) {
      for (const f of living(party)) changeStress(party, f, T.STRESS_WIN, env, events, 'win');
      // a win can't re-wipe (stress only goes down), but be safe:
      return finish(living(party).length ? 'won' : 'wiped', events);
    }
    if (!living(party).length) return finish('wiped', events);
    return false;
  }
  function finish(outcome, events) {
    S.ended = true; S.outcome = outcome; S.queue = [];
    events.push({ type: 'end', outcome, round: S.round });
    return true;
  }

  function endRound(events) {
    // Mend: each living creature heals the most-hurt (lowest HP fraction) eligible ally.
    for (const f of living(party)) {
      const base = Math.floor(f.heart / T.MEND_HEART_DIV);
      const amt = Math.floor(base * (f.mendMult ?? 1) * (virFx(f).mendMult || 1));
      if (amt <= 0) continue;
      const cands = living(party).filter((o) => o.hp < o.maxHp && !affFx(o).ignoresMend);
      if (!cands.length) continue;
      cands.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      const t = cands[0];
      const healed = Math.min(amt, t.maxHp - t.hp);
      t.hp += healed;
      events.push({ type: 'mend', src: f.key, dst: t.key, amount: healed });
    }
    for (const f of living(party)) {
      if (f.hp < f.maxHp * T.LOW_HP_PCT) changeStress(party, f, T.STRESS_LOW_HP, env, events, 'lowHp');
    }
    if (checkEnd(events)) return;
    if (S.round >= T.MAX_ROUNDS) {
      for (const f of living(party)) changeStress(party, f, T.STRESS_STALEMATE, env, events, 'stalemate');
      if (!living(party).length) finish('wiped', events);
      else finish('fled', events);
    }
  }

  function step() {
    const events = [];
    if (S.ended) return events;
    if (S.round === 0 || !S.queue.length) startRound(events);
    if (checkEnd(events)) return events;
    // next living actor
    let actor = null;
    while (S.queue.length && !actor) { const f = byKey(S.queue.shift()); if (f && !f.dead) actor = f; }
    if (actor) { act(actor, events); S.acted += 1; }
    if (checkEnd(events)) return events;
    // drop dead from the queue; if nobody is left to act, the round ends
    S.queue = S.queue.filter((k) => !byKey(k).dead);
    if (!S.queue.length) endRound(events);
    return events;
  }

  /**
   * Cheer: boosts party damage for one round and relieves 5 Stress each.
   * Pressed before anyone has acted this round (or before the fight starts) it boosts this round;
   * pressed mid-round it boosts the next full round.
   */
  function cheer() {
    const events = [];
    if (S.ended || S.cheersLeft <= 0 || S.cheerRound > S.round) return events;
    const alive = living(party);
    if (!alive.length) return events;
    S.cheersLeft -= 1;
    const avgBond = alive.reduce((n, f) => n + (f.bond || 0), 0) / alive.length;
    S.cheerMult = T.CHEER_BASE_MULT + avgBond / T.CHEER_BOND_DIV;
    S.cheerRound = S.round === 0 ? 1 : S.acted === 0 && S.queue.length ? S.round : S.round + 1;
    events.push({ type: 'cheer', mult: S.cheerMult, round: S.cheerRound, left: S.cheersLeft });
    for (const f of alive) if (!affFx(f).ignoresCheer) changeStress(party, f, T.CHEER_STRESS, env, events, 'cheer');
    checkEnd(events);
    return events;
  }

  return { state: S, step, cheer, fx, byKey };
}

/** Run a battle to the end. opts.cheerRound: auto-cheer at the start of this round (and again each later round while cheers last). */
export function simulate(args, { cheerRound = 1, maxSteps = 5000 } = {}) {
  const b = createBattle(args);
  const log = [];
  let n = 0;
  while (!b.state.ended && n++ < maxSteps) {
    if (cheerRound && b.state.cheersLeft > 0 && b.state.round + 1 >= cheerRound && !b.state.queue.length) log.push(...b.cheer());
    log.push(...b.step());
  }
  return { outcome: b.state.outcome, rounds: b.state.round, log, battle: b };
}
