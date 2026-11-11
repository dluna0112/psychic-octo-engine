import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, BOONS } from '../src/data.js';
import { createRng } from '../src/rng.js';
import { createBattle, simulate, calcDamage, makeEnemy, critChance, elementMatchup, changeStress, boonEffects } from '../src/battle.js';
import { makeFighter } from '../src/run.js';

const BOON = Object.fromEntries(BOONS.map((b) => [b.id, b]));
const fighter = (o = {}, eff = {}) => Object.assign(makeFighter({
  uid: o.uid || 'c1', name: o.name || 'Flarekit', species: o.species || 'flarekit',
  might: 10, wit: 5, heart: 8, maxHp: 50, hp: o.hp ?? o.maxHp ?? 50, bond: 20, stress: 0, affliction: null, ...o,
}, eff), o.virtue ? { virtue: o.virtue } : {});
/** Fake rng: chance() follows `queue` then returns `yes`; pick() takes index pickIdx. */
const fakeRng = ({ yes = false, queue = [], pickIdx = 0 } = {}) => {
  const q = queue.slice();
  return { next: () => 0.5, int: (lo) => lo, chance: () => (q.length ? q.shift() : yes), pick: (a) => a[Math.min(pickIdx, a.length - 1)],
    shuffle: (a) => a.slice(), weighted: (w) => Object.keys(w)[0], getState: () => 0, setState: () => {} };
};
const dummy = (o = {}) => ({ ...makeEnemy('gloomlet', 1, 0), ...o });
const events = (b, n = 1) => { const out = []; for (let i = 0; i < n; i++) out.push(...b.step()); return out; };

test('damage formula: base, guard, min 1', () => {
  // (4 + 10) - floor(8/4) = 12
  assert.equal(calcDamage({ might: 10, targetHeart: 8 }), 12);
  assert.equal(calcDamage({ might: 0, targetHeart: 400 }), T.MIN_DAMAGE);
  // crit x1.5: round(21) - 2 = 19
  assert.equal(calcDamage({ might: 10, targetHeart: 8, crit: true }), 19);
  // strong x1.5 and crit: round(14*1.5*1.5=31.5)=32 - 2 = 30
  assert.equal(calcDamage({ might: 10, targetHeart: 8, element: T.ELEMENT_STRONG, crit: true }), 30);
  // weak x0.75: round(10.5)=11 (banker-free Math.round) - 2 = 9
  assert.equal(calcDamage({ might: 10, targetHeart: 8, element: T.ELEMENT_WEAK }), 9);
});

test('element matchups: fire > leaf > water > fire, shadow neutral', () => {
  assert.equal(elementMatchup('fire', 'leaf'), 'strong');
  assert.equal(elementMatchup('leaf', 'water'), 'strong');
  assert.equal(elementMatchup('water', 'fire'), 'strong');
  assert.equal(elementMatchup('leaf', 'fire'), 'weak');
  assert.equal(elementMatchup('fire', 'shadow'), null);
  assert.equal(elementMatchup('shadow', 'water'), null);
  assert.equal(elementMatchup('fire', 'fire'), null);
});

test('attack in battle applies element and crit', () => {
  const p = fighter({ might: 10, wit: 50 });
  const e = dummy({ element: 'leaf', heart: 8, hp: 999, maxHp: 999, wit: 0 });
  const b = createBattle({ party: [p], enemies: [e], rng: fakeRng({ yes: true }) });
  const ev = events(b).find((x) => x.type === 'attack');
  assert.equal(ev.element, 'strong');
  assert.equal(ev.crit, true);
  assert.equal(ev.dmg, 30);
  assert.equal(e.hp, 999 - 30);
});

test('crit chance: 5% + 1%/Wit capped at 40%, bonuses on top, Focused ignores cap', () => {
  assert.equal(critChance({ side: 'party', wit: 0 }), 0.05);
  assert.ok(Math.abs(critChance({ side: 'party', wit: 10 }) - 0.15) < 1e-9);
  assert.equal(critChance({ side: 'party', wit: 80 }), T.CRIT_CAP);
  const fx = boonEffects([BOON.keen_eye]);
  assert.ok(Math.abs(critChance({ side: 'party', wit: 80, critBonus: 0.05 }, fx) - 0.55) < 1e-9);
  assert.ok(Math.abs(critChance({ side: 'party', wit: 80, virtue: 'focused' }) - 0.65) < 1e-9);
});

test('turn order by Wit, ties go to the player; front-most target', () => {
  const p = fighter({ wit: 5, uid: 'p' });
  const e1 = dummy({ key: 'e0', wit: 9, hp: 999, maxHp: 999 });
  const e2 = dummy({ key: 'e1', wit: 5, hp: 999, maxHp: 999 });
  const b = createBattle({ party: [p], enemies: [e1, e2], rng: fakeRng() });
  const order = [];
  for (let i = 0; i < 3; i++) for (const ev of b.step()) if (ev.type === 'attack') order.push(`${ev.src}>${ev.dst}`);
  assert.deepEqual(order, ['e0>p', 'p>e0', 'e1>p']);
});

test('guard (Heart) reduces damage taken; mend heals most-hurt ally by floor(Heart/5)', () => {
  const tank = fighter({ uid: 'a', heart: 40, hp: 30, maxHp: 50, wit: 0 });
  const healer = fighter({ uid: 'b', heart: 25, wit: 0 });
  const e = dummy({ might: 20, wit: 99, hp: 999, maxHp: 999 });
  const b = createBattle({ party: [tank, healer], enemies: [e], rng: fakeRng() });
  const evs = events(b, 3);
  const atk = evs.find((x) => x.type === 'attack' && x.dst === 'a');
  assert.equal(atk.dmg, 24 - 10);
  const mends = evs.filter((x) => x.type === 'mend');
  assert.equal(mends.length, 2);
  assert.ok(mends.every((m) => m.dst === 'a'));
  assert.deepEqual(mends.map((m) => m.amount), [8, 5]);
});

test('Cheerful mend x1.5, Sullen cannot be mended', () => {
  const a = fighter({ uid: 'a', heart: 20, hp: 10, wit: 0 }, { mendMult: 1.5 });
  const s = fighter({ uid: 's', heart: 0, hp: 5, wit: 0, affliction: 'sullen' });
  const e = dummy({ might: 0, wit: 0, hp: 999, maxHp: 999 });
  const b = createBattle({ party: [a, s], enemies: [e], rng: fakeRng() });
  const evs = events(b, 3);
  const m = evs.filter((x) => x.type === 'mend');
  assert.equal(m.length, 1);
  assert.equal(m[0].dst, 'a');
  assert.equal(m[0].amount, 6);
});

test('cheer: limited per fight, Second Cheer adds one, boosts damage and relieves stress', () => {
  const p = fighter({ might: 10, stress: 20, bond: 100, wit: 9 });
  const e = dummy({ heart: 0, hp: 9999, maxHp: 9999, wit: 0 });
  const b = createBattle({ party: [p], enemies: [e], rng: fakeRng() });
  assert.equal(b.state.cheersLeft, T.CHEERS_PER_FIGHT);
  const c = b.cheer();
  assert.equal(c[0].type, 'cheer');
  assert.equal(c[0].mult, T.CHEER_BASE_MULT + 100 / T.CHEER_BOND_DIV);
  assert.equal(p.stress, 20 + T.CHEER_STRESS);
  assert.deepEqual(b.cheer(), []); // used up
  const hit = events(b).find((x) => x.type === 'attack');
  assert.equal(hit.dmg, Math.round(14 * 1.75));
  events(b); // round 1 ends
  const hit2 = events(b).find((x) => x.type === 'attack');
  assert.equal(hit2.dmg, 14); // one round only

  const p2 = fighter({ uid: 'q' });
  const b2 = createBattle({ party: [p2], enemies: [dummy({ hp: 9999, maxHp: 9999 })], boons: [BOON.second_cheer], rng: fakeRng() });
  assert.equal(b2.state.cheersLeft, T.CHEERS_PER_FIGHT + 1);
});

test('Hollow Warden wails every 3rd round: hits all for 50%, +8 stress', () => {
  const party = [fighter({ uid: 'a', hp: 999, maxHp: 999, wit: 0, heart: 0 }), fighter({ uid: 'b', hp: 999, maxHp: 999, wit: 0, heart: 0 })];
  const boss = makeEnemy('hollow_warden', 3);
  assert.equal(boss.maxHp, 420); // unscaled
  const b = createBattle({ party, enemies: [boss], rng: fakeRng() });
  const wails = [];
  for (let i = 0; i < 40 && b.state.round <= 9; i++) for (const ev of b.step()) if (ev.type === 'wail') wails.push(b.state.round);
  assert.deepEqual(wails, [3, 6, 9]);
  const b2 = createBattle({ party: [fighter({ uid: 'x', hp: 999, maxHp: 999, wit: 0, heart: 0, stress: 0 }), fighter({ uid: 'y', hp: 999, maxHp: 999, wit: 0, heart: 0, stress: 0 })], enemies: [makeEnemy('hollow_warden', 1)], rng: fakeRng() });
  let wail = null;
  while (!wail) { const evs = b2.step(); wail = evs.find((x) => x.type === 'wail'); if (wail) { assert.equal(wail.hits.length, 2); assert.equal(wail.hits[0].dmg, 12); assert.ok(evs.filter((x) => x.type === 'stress' && x.amount === 8).length === 2); } }
});

test('enemies scale with floor (HP and Might x1 / 1.25 / 1.5)', () => {
  assert.equal(makeEnemy('gloomlet', 1).maxHp, 40);
  assert.equal(makeEnemy('gloomlet', 2).maxHp, 50);
  assert.equal(makeEnemy('gloomlet', 3).maxHp, 60);
  assert.equal(makeEnemy('dire_gloomlet', 3).might, 21);
});

test('stress from hits and crits, scaled by Calm Bell / personality', () => {
  const p = fighter({ uid: 'a', hp: 999, maxHp: 999, wit: 0 });
  const b = createBattle({ party: [p], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng({ queue: [false, false] }) });
  events(b);
  assert.equal(p.stress, T.STRESS_HIT);
  const q = fighter({ uid: 'q', hp: 999, maxHp: 999, wit: 0 });
  const b2 = createBattle({ party: [q], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng({ yes: true }) });
  events(b2);
  assert.equal(q.stress, T.STRESS_CRIT_TAKEN);
  const r = fighter({ uid: 'r' }, { stressGainMult: 0.9 });
  changeStress([r], r, 20, { rng: fakeRng(), fx: boonEffects([BOON.calm_bell]) }, []);
  assert.equal(r.stress, Math.round(20 * 0.9 * 0.75));
  changeStress([r], r, -50, { rng: fakeRng(), fx: boonEffects([BOON.calm_bell]) }, []);
  assert.equal(r.stress, 0);
});

test('low HP at round end +3 stress; ally death +15', () => {
  const a = fighter({ uid: 'a', hp: 5, maxHp: 50, wit: 0, heart: 0 });
  const b = fighter({ uid: 'b', hp: 1, maxHp: 50, wit: 0, heart: 0 });
  const e = dummy({ might: 0, wit: 0, hp: 999, maxHp: 999 });
  const bt = createBattle({ party: [b, a], enemies: [e], rng: fakeRng() });
  const evs = events(bt, 3);
  // b is front-most and dies to the gloomlet (4 - 0 = 4 dmg)
  assert.ok(evs.some((x) => x.type === 'faint' && x.dst === 'b'));
  assert.ok(evs.some((x) => x.type === 'stress' && x.dst === 'a' && x.reason === 'allyDeath' && x.amount === 15));
  assert.ok(evs.some((x) => x.type === 'stress' && x.dst === 'a' && x.reason === 'lowHp' && x.amount === 3));
});

test('Uneasy at 50 stress deals -10% damage', () => {
  const p = fighter({ might: 16, stress: 50, wit: 9 });
  const b = createBattle({ party: [p], enemies: [dummy({ heart: 0, hp: 999, maxHp: 999, wit: 0 })], rng: fakeRng() });
  assert.equal(events(b).find((x) => x.type === 'attack').dmg, 18);
});

test('breaking point: virtue (Bond-weighted) or affliction, then second break', () => {
  const env = (yes) => ({ rng: fakeRng({ yes }), fx: boonEffects() });
  const v = fighter({ uid: 'v', stress: 95, bond: 100 });
  const evs = [];
  changeStress([v], v, 10, env(true), evs);
  const brk = evs.find((x) => x.type === 'break');
  assert.equal(brk.kind, 'virtue');
  assert.equal(v.virtue, 'stalwart');
  assert.equal(v.stress, T.STRESS_AFTER_VIRTUE);

  const a = fighter({ uid: 'x', stress: 99 });
  changeStress([a], a, 5, env(false), []);
  assert.equal(a.affliction, 'fearful');
  assert.equal(a.stress, T.STRESS_AFTER_AFFLICTION);
  // second break: 50% max HP, stress 70, no new roll
  const e2 = [];
  changeStress([a], a, 50, env(false), e2);
  assert.equal(e2.find((x) => x.type === 'break').kind, 'second');
  assert.equal(a.hp, 25);
  assert.equal(a.stress, T.STRESS_AFTER_SECOND_BREAK);
  assert.equal(a.affliction, 'fearful');
  // a third break can kill
  const e3 = [];
  a.hp = 10;
  const died = changeStress([a], a, 50, env(false), e3);
  assert.equal(died, true);
  assert.ok(a.dead);

  // virtue chance is 20% + 0.5%/Bond: real rng, many trials
  const rng = createRng(42);
  let virt = 0;
  for (let i = 0; i < 4000; i++) { const f = fighter({ uid: `t${i}`, stress: 99, bond: 60 }); changeStress([f], f, 5, { rng, fx: boonEffects() }, []); if (f.virtue) virt++; }
  assert.ok(Math.abs(virt / 4000 - 0.5) < 0.04, `virtue rate ${virt / 4000}`);
});

test('afflictions and virtues in battle: Fearful skip, Reckless, Stalwart, Spiteful', () => {
  const f = fighter({ uid: 'f', affliction: 'fearful', wit: 9 });
  const b = createBattle({ party: [f], enemies: [dummy({ hp: 999, maxHp: 999, wit: 0 })], rng: fakeRng({ yes: true }) });
  assert.equal(b.step()[1].type, 'skip');

  const r = fighter({ uid: 'r', affliction: 'reckless', might: 16, wit: 9, hp: 999, maxHp: 999, heart: 0 });
  const b2 = createBattle({ party: [r], enemies: [dummy({ heart: 0, hp: 999, maxHp: 999, wit: 0, might: 16 })], rng: fakeRng() });
  const ev2 = events(b2, 2).filter((x) => x.type === 'attack');
  assert.equal(ev2[0].dmg, 25);
  assert.equal(ev2[1].dmg, 25);

  const s = fighter({ uid: 's', virtue: 'stalwart', hp: 999, maxHp: 999, heart: 0, wit: 0 });
  const b3 = createBattle({ party: [s], enemies: [dummy({ might: 16, wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng() });
  assert.equal(events(b3).find((x) => x.type === 'attack').dmg, 14);

  const sp = fighter({ uid: 'sp', affliction: 'spiteful', wit: 9, might: 16 });
  const v = fighter({ uid: 'v', wit: 0, heart: 0, hp: 999, maxHp: 999 });
  const w = fighter({ uid: 'w', wit: 0 });
  const b4 = createBattle({ party: [sp, v, w], enemies: [dummy({ hp: 999, maxHp: 999, wit: 0 })], rng: fakeRng({ queue: [true, false], pickIdx: 0 }) });
  const ev4 = b4.step();
  const atk = ev4.find((x) => x.type === 'attack');
  assert.equal(atk.spite, true);
  assert.equal(atk.dst, 'v');
  assert.equal(atk.dmg, 10);
  assert.ok(ev4.some((x) => x.type === 'stress' && x.dst === 'w' && x.amount === 3));
});

test('Radiant: other allies -4 stress each round; Devoted survives once at 1 HP', () => {
  const r = fighter({ uid: 'r', virtue: 'radiant', wit: 9 });
  const o = fighter({ uid: 'o', stress: 40, wit: 9 });
  const b = createBattle({ party: [r, o], enemies: [dummy({ hp: 999, maxHp: 999, wit: 0 })], rng: fakeRng() });
  b.step();
  assert.equal(o.stress, 36);

  const d = fighter({ uid: 'd', virtue: 'devoted', hp: 3, bond: 0, heart: 0, wit: 0 });
  const b2 = createBattle({ party: [d], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng() });
  const evs = events(b2);
  assert.ok(evs.some((x) => x.type === 'devoted'));
  assert.equal(d.hp, 1);
  assert.ok(d.devotedUsed);
});

test('Last Ember: Bond >= 60 survives the first lethal blow of the expedition at 1 HP', () => {
  const p = fighter({ uid: 'p', hp: 3, bond: 60, heart: 0, wit: 0 });
  const b = createBattle({ party: [p], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng() });
  const evs = events(b);
  assert.ok(evs.some((x) => x.type === 'lastEmber'));
  assert.equal(p.hp, 1);
  assert.equal(p.dead, false);
  // second lethal blow (next battle, same expedition): dies
  const b2 = createBattle({ party: [p], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng() });
  const e2 = events(b2);
  assert.ok(e2.some((x) => x.type === 'faint' && x.dst === 'p'));
  assert.ok(e2.some((x) => x.type === 'end' && x.outcome === 'wiped'));
  // Bond 59: no ember
  const q = fighter({ uid: 'q', hp: 3, bond: 59, heart: 0, wit: 0 });
  const b3 = createBattle({ party: [q], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], rng: fakeRng() });
  assert.ok(events(b3).some((x) => x.type === 'faint'));
});

test('Wardlight: the first hit each ally takes per fight deals 0', () => {
  const p = fighter({ uid: 'p', hp: 50, heart: 0, wit: 0 });
  const mk = () => createBattle({ party: [p], enemies: [dummy({ wit: 9, hp: 999, maxHp: 999 })], boons: [BOON.wardlight], rng: fakeRng() });
  const b = mk();
  const e1 = events(b).find((x) => x.type === 'attack' && x.dst === 'p');
  assert.equal(e1.dmg, 0);
  assert.equal(e1.warded, true);
  assert.equal(p.hp, 50);
  assert.equal(p.stress, 0);
  events(b); // round 1 end
  const e2 = events(b).find((x) => x.type === 'attack' && x.dst === 'p');
  assert.equal(e2.dmg, 13);
  // resets next fight
  const b2 = mk();
  assert.equal(events(b2).find((x) => x.type === 'attack' && x.dst === 'p').dmg, 0);
});

test('stalemate after MAX_ROUNDS: enemies flee, party +10 stress', () => {
  const p = fighter({ uid: 'p', might: 0, heart: 40, hp: 999, maxHp: 999, wit: 0 });
  const e = dummy({ might: 0, heart: 40, hp: 999, maxHp: 999 });
  const res = simulate({ party: [p], enemies: [e], rng: fakeRng() }, { cheerRound: 0 });
  assert.equal(res.outcome, 'fled');
  assert.equal(res.rounds, T.MAX_ROUNDS);
  assert.ok(res.log.some((x) => x.type === 'stress' && x.reason === 'stalemate' && x.amount === T.STRESS_STALEMATE));
});

test('win: survivors -4 stress; deterministic with a fixed seed', () => {
  const mk = () => [fighter({ uid: 'a', might: 20, stress: 30 }), fighter({ uid: 'b', might: 12, wit: 14, stress: 30 })];
  const run = (seed) => { const party = mk(); const r = simulate({ party, enemies: [makeEnemy('gloomlet', 2, 0), makeEnemy('gloomlet', 2, 1)], rng: createRng(seed) }); return { r, party }; };
  const A = run(1234), B = run(1234);
  assert.equal(A.r.outcome, 'won');
  assert.ok(A.r.log.some((x) => x.type === 'stress' && x.reason === 'win' && x.amount === T.STRESS_WIN));
  assert.deepEqual(A.r.log, B.r.log);
  assert.deepEqual(A.party, B.party);
});
