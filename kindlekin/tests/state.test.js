import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING, CREATURES } from '../src/data.js';
import {
  newGame, getCreature, doAction, canDoAction, buyExtraAction, endDay, personalityOf, moodOf, spriteIdOf,
  effectiveStats, addStress, recordDeath, saveGame, loadGame, migrate, SAVE_KEY, checkEvolution, makeCreature,
  beginExpedition, finishExpedition, eggOf, renameCreature, NAME_MAX, RUN_SAVE_VERSION,
} from '../src/state.js';

const byId = (st, species) => st.creatures.find((c) => c.species === species);
const baby = (st, species = 'flarekit') => { const c = makeCreature(st, species); st.creatures.push(c); return c; };

test('newGame: three eggs, full action budget, seed persisted', () => {
  const st = newGame(42);
  assert.equal(st.seed !== undefined, true);
  assert.deepEqual(st.creatures.map((c) => c.species), ['flarekit_egg', 'puddlin_egg', 'sproutle_egg']);
  assert.equal(st.actionsLeft, TUNING.ACTIONS_PER_DAY);
  assert.equal(st.day, 1);
  assert.equal(new Set(st.creatures.map((c) => c.uid)).size, 3);
  assert.equal(spriteIdOf(st.creatures[0]), 'egg');
  // deterministic with same seed
  assert.deepEqual(newGame(42).creatures.map((c) => c.uid), st.creatures.map((c) => c.uid));
});

test('eggs accept only Pet; hatch after 3 pets with Bond 10', () => {
  const st = newGame(1);
  const egg = byId(st, 'flarekit_egg');
  for (const a of ['feed', 'nap', 'spar', 'puzzle', 'sing']) assert.equal(doAction(st, egg.uid, a).ok, false);
  assert.equal(st.actionsLeft, 6);
  doAction(st, egg.uid, 'pet');
  const r2 = doAction(st, egg.uid, 'pet');
  assert.ok(!r2.events.some((e) => e.type === 'hatched'));
  const r3 = doAction(st, egg.uid, 'pet');
  const h = r3.events.find((e) => e.type === 'hatched');
  assert.deepEqual(h, { type: 'hatched', uid: egg.uid, from: 'flarekit_egg', to: 'flarekit' });
  const c = getCreature(st, egg.uid);
  assert.equal(c.species, 'flarekit');
  assert.equal(c.name, 'Flarekit');
  assert.deepEqual([c.might, c.wit, c.heart, c.maxHp, c.hp], [6, 4, 5, 30, 30]);
  assert.equal(c.bond, TUNING.BOND_START);
  assert.equal(c.hatchedDay, 1);
  assert.equal(st.actionsLeft, 3);
  assert.equal(spriteIdOf(c), 'flarekit');
});

test('action effects, costs and budget', () => {
  const st = newGame(2);
  const c = baby(st);
  c.stress = 20;
  doAction(st, c.uid, 'pet');
  assert.equal(c.bond, 15); assert.equal(c.stress, 14);
  doAction(st, c.uid, 'feed');
  assert.equal(c.maxHp, 32); assert.equal(c.bond, 17); assert.equal(c.stress, 12);
  doAction(st, c.uid, 'nap');
  assert.equal(c.stress, 0);
  doAction(st, c.uid, 'spar');
  assert.equal(c.might, 8); assert.equal(c.stress, 8);
  doAction(st, c.uid, 'puzzle');
  assert.equal(c.wit, 6); assert.equal(c.stress, 14);
  doAction(st, c.uid, 'sing');
  assert.equal(c.heart, 7); assert.equal(c.bond, 18); assert.equal(c.stress, 18);
  assert.equal(st.actionsLeft, 0);
  const r = doAction(st, c.uid, 'pet');
  assert.equal(r.ok, false); assert.match(r.reason, /No actions/);
});

test('feed capped at 2 per creature per day, resets overnight', () => {
  const st = newGame(3);
  const c = baby(st);
  assert.ok(doAction(st, c.uid, 'feed').ok);
  assert.ok(doAction(st, c.uid, 'feed').ok);
  const r = doAction(st, c.uid, 'feed');
  assert.equal(r.ok, false); assert.match(r.reason, /Full/);
  assert.equal(st.actionsLeft, 4);
  endDay(st);
  assert.ok(doAction(st, c.uid, 'feed').ok);
});

test('training refused at Stress >= 70; care still allowed', () => {
  const st = newGame(4);
  const c = baby(st);
  c.stress = 69;
  assert.ok(canDoAction(st, c.uid, 'spar').ok);
  c.stress = 70;
  for (const a of ['spar', 'puzzle', 'sing']) {
    const r = doAction(st, c.uid, a);
    assert.equal(r.ok, false); assert.match(r.reason, /stressed/);
  }
  assert.ok(doAction(st, c.uid, 'nap').ok);
  assert.equal(c.stress, 55);
});

test('stat cap 40 and Bond 0..100', () => {
  const st = newGame(5);
  const c = baby(st);
  c.might = 39;
  doAction(st, c.uid, 'spar');
  assert.equal(c.might, 40);
  assert.equal(doAction(st, c.uid, 'spar').ok, false);
  c.bond = 98;
  doAction(st, c.uid, 'pet');
  assert.equal(c.bond, 100);
});

test('Bond >= 60 gives +1 on training; emberstones add +1 each, max 2 per stat', () => {
  const st = newGame(6);
  const c = baby(st);
  c.bond = 59; doAction(st, c.uid, 'spar'); assert.equal(c.might, 8);
  c.bond = 60; doAction(st, c.uid, 'spar'); assert.equal(c.might, 11);
  c.bond = 0; c.stress = 0;
  st.emberstones.wit = 1; doAction(st, c.uid, 'puzzle'); assert.equal(c.wit, 7);
  st.emberstones.wit = 5; doAction(st, c.uid, 'puzzle'); assert.equal(c.wit, 11);
  // care actions get no emberstone bonus
  st.emberstones.heart = 2; const hp = c.maxHp; doAction(st, c.uid, 'feed'); assert.equal(c.maxHp, hp + 2);
});

test('buy extra action: 5 motes, max 3 per day', () => {
  const st = newGame(7);
  assert.equal(buyExtraAction(st).ok, false);
  st.motes = 100;
  for (let i = 0; i < 3; i++) assert.ok(buyExtraAction(st).ok);
  assert.equal(buyExtraAction(st).ok, false);
  assert.equal(st.motes, 85); assert.equal(st.actionsLeft, 9);
  endDay(st);
  assert.equal(st.extraBought, 0); assert.equal(st.actionsLeft, 6);
  assert.ok(buyExtraAction(st).ok);
});

test('overnight: full HP, Stress -5, neglect -2 Bond, affliction cure, day++', () => {
  const st = newGame(8);
  const a = baby(st, 'flarekit'), b = baby(st, 'puddlin');
  a.hp = 3; a.stress = 40; a.bond = 20; b.bond = 20; b.stress = 32; b.affliction = 'fearful';
  a.affliction = 'sullen';
  doAction(st, b.uid, 'feed'); // b acted: stress 32 -> 30 (still afflicted), no neglect
  const { events } = endDay(st);
  assert.equal(st.day, 2);
  assert.equal(a.hp, a.maxHp);
  assert.equal(a.stress, 35); assert.equal(a.bond, 18); assert.equal(a.affliction, 'sullen');
  assert.equal(b.stress, 25); assert.equal(b.bond, 22); assert.equal(b.affliction, null);
  assert.ok(events.some((e) => e.type === 'neglected' && e.uid === a.uid));
  assert.ok(events.some((e) => e.type === 'cured' && e.uid === b.uid));
  // eggs are never neglected
  for (const e of st.creatures.filter((c) => c.species.endsWith('_egg'))) assert.equal(e.bond, 0);
  // stress floors at 0, bond floors at 0
  a.stress = 2; a.bond = 1; endDay(st);
  assert.equal(a.stress, 0); assert.equal(a.bond, 0);
});

test('expedition party is exempt from neglect and the day ends on return', () => {
  const st = newGame(9);
  const a = baby(st), b = baby(st, 'sproutle');
  a.bond = 20; b.bond = 20;
  beginExpedition(st, [a.uid]);
  assert.equal(st.actionsLeft, 0);
  finishExpedition(st);
  assert.equal(st.day, 2); assert.equal(a.bond, 20); assert.equal(b.bond, 18);
  assert.equal(st.pendingExpedition, null);
});

function grown(st, species, stats) {
  const c = baby(st, species);
  Object.assign(c, stats);
  return c;
}

test('evolution waits 3 days since hatching (checked at dawn)', () => {
  const st = newGame(10);
  const c = grown(st, 'flarekit', { might: 20 });
  endDay(st); endDay(st);
  assert.equal(c.species, 'flarekit'); // day 3: only 2 days
  const { events } = endDay(st); // day 4
  assert.equal(c.species, 'blazefang');
  assert.deepEqual(events.find((e) => e.type === 'evolved'), { type: 'evolved', uid: c.uid, from: 'flarekit', to: 'blazefang', branch: 'might' });
});

test('Might branch: exact threshold 20, bonuses applied', () => {
  const st = newGame(11);
  st.day = 4;
  const c = grown(st, 'puddlin', { might: 19, wit: 6, heart: 5, hatchedDay: 1 });
  assert.equal(checkEvolution(st, c), null);
  c.might = 20;
  const ev = checkEvolution(st, c);
  assert.equal(ev.to, 'tidalknight');
  assert.deepEqual([c.might, c.wit, c.heart, c.maxHp], [26, 8, 7, 64]);
  assert.equal(c.name, 'Tidalknight');
});

test('Gentle branch: stat >= 20 AND Bond >= 30 (exact thresholds)', () => {
  const st = newGame(12);
  st.day = 4;
  const c = grown(st, 'flarekit', { heart: 20, bond: 29, hatchedDay: 1 });
  assert.equal(checkEvolution(st, c), null);
  c.bond = 30;
  assert.equal(checkEvolution(st, c).to, 'solwisp');
  assert.deepEqual([c.might, c.wit, c.heart, c.maxHp], [8, 6, 26, 58]);

  const s = grown(st, 'sproutle', { wit: 20, bond: 30, hatchedDay: 1 });
  assert.equal(checkEvolution(st, s).to, 'bloomseer');
  assert.deepEqual([s.might, s.wit, s.heart, s.maxHp], [7, 26, 6, 62]);
});

test('both branches qualify: higher stat wins, tie goes to Might', () => {
  const st = newGame(13);
  st.day = 4;
  const a = grown(st, 'puddlin', { might: 22, wit: 24, bond: 30, hatchedDay: 1 });
  assert.equal(checkEvolution(st, a).to, 'mistmuse');
  const b = grown(st, 'puddlin', { might: 24, wit: 22, bond: 30, hatchedDay: 1 });
  assert.equal(checkEvolution(st, b).to, 'tidalknight');
  const c = grown(st, 'puddlin', { might: 22, wit: 22, bond: 30, hatchedDay: 1 });
  assert.equal(checkEvolution(st, c).to, 'tidalknight');
  // gentle stat high but bond too low -> might branch
  const d = grown(st, 'flarekit', { might: 20, heart: 30, bond: 10, hatchedDay: 1 });
  assert.equal(checkEvolution(st, d).to, 'blazefang');
});

test('evolution bonus respects the stat cap; adults do not evolve further', () => {
  const st = newGame(14);
  st.day = 4;
  const c = grown(st, 'flarekit', { might: 38, hatchedDay: 1 });
  checkEvolution(st, c);
  assert.equal(c.might, 40);
  assert.equal(checkEvolution(st, c), null);
});

test('personality: most-received action, min 5, tie -> most recent', () => {
  const st = newGame(15);
  const c = baby(st);
  c.actionCounts = { spar: 4 }; c.actionSeen = { spar: 4 };
  assert.equal(personalityOf(c).id, 'unformed');
  c.actionCounts = { spar: 5, sing: 5 }; c.actionSeen = { spar: 10, sing: 9 };
  assert.equal(personalityOf(c).id, 'fierce');
  // via real actions: tie resolved by the latest one received
  const d = baby(st);
  st.actionsLeft = 99;
  for (let i = 0; i < 5; i++) doAction(st, d.uid, 'nap');
  for (let i = 0; i < 5; i++) { d.stress = 0; doAction(st, d.uid, 'puzzle'); }
  assert.equal(personalityOf(d).id, 'curious');
  doAction(st, d.uid, 'nap');
  assert.equal(personalityOf(d).id, 'sleepy');
  // egg pets do not count toward personality
  const st2 = newGame(16);
  const e = st2.creatures[0];
  for (let i = 0; i < 3; i++) doAction(st2, e.uid, 'pet');
  assert.equal(e.actionCounts.pet || 0, 0);
});

test('personality perks reach effectiveStats; cuddly reduces stress gains', () => {
  const st = newGame(17);
  const c = baby(st, 'sproutle');
  c.actionCounts = { feed: 5 };
  assert.equal(effectiveStats(st, c).maxHp, Math.round(38 * 1.1));
  assert.equal(effectiveStats(st, c).element, 'leaf');
  c.actionCounts = { spar: 6 }; assert.equal(effectiveStats(st, c).damageMult, 1.1);
  c.actionCounts = { puzzle: 6 }; assert.equal(effectiveStats(st, c).critBonus, 0.05);
  c.actionCounts = { sing: 6 }; assert.equal(effectiveStats(st, c).mendMult, 1.5);
  c.actionCounts = { nap: 6 }; assert.equal(effectiveStats(st, c).restHealBonusPct, 0.1);
  c.actionCounts = { pet: 6 }; c.actionSeen = { pet: 6 };
  assert.equal(effectiveStats(st, c).stressGainMult, 0.9);
  c.stress = 0; st.actionsLeft = 9;
  doAction(st, c.uid, 'spar'); // +8 * 0.9 = 7.2 -> 7
  assert.equal(c.stress, 7);
});

test('addStress clamps and only scales gains', () => {
  const c = { stress: 50 };
  addStress(c, 10, 0.5); assert.equal(c.stress, 55);
  addStress(c, -10, 0.5); assert.equal(c.stress, 45);
  addStress(c, 500); assert.equal(c.stress, 100);
  addStress(c, -500); assert.equal(c.stress, 0);
});

test('mood thresholds', () => {
  assert.equal(moodOf({ stress: 29 }), 'happy');
  assert.equal(moodOf({ stress: 30 }), 'neutral');
  assert.equal(moodOf({ stress: 69 }), 'neutral');
  assert.equal(moodOf({ stress: 70 }), 'stressed');
});

test('recordDeath: memorial, emberstone for highest stat, legacy egg with 25% stats', () => {
  const st = newGame(18);
  st.day = 7;
  const c = grown(st, 'blazefang', { name: 'Pip', might: 31, wit: 9, heart: 14 });
  const before = st.creatures.length;
  const { memorial, legacyEgg } = recordDeath(st, c.uid, 'Hollow Warden');
  assert.deepEqual(memorial, { name: 'Pip', species: 'blazefang', day: 7, cause: 'Hollow Warden', highestStat: 'might' });
  assert.equal(getCreature(st, c.uid), null);
  assert.equal(st.memorials.length, 1);
  assert.equal(st.emberstones.might, 1);
  assert.equal(st.creatures.length, before); // one removed, one egg added
  assert.equal(legacyEgg.species, 'flarekit_egg');
  assert.deepEqual(legacyEgg.legacy, { from: 'Pip', might: 7, wit: 2, heart: 3 });
  assert.notEqual(legacyEgg.uid, c.uid);
  // the legacy egg hatches with the inherited stats added to the baby base
  for (let i = 0; i < 3; i++) doAction(st, legacyEgg.uid, 'pet');
  assert.deepEqual([legacyEgg.might, legacyEgg.wit, legacyEgg.heart], [13, 6, 8]);
  // tie on highest stat -> might > wit > heart order
  const t = grown(st, 'mistmuse', { might: 10, wit: 10, heart: 10 });
  assert.equal(recordDeath(st, t.uid, 'x').memorial.highestStat, 'might');
  const w = grown(st, 'mistmuse', { might: 9, wit: 30, heart: 30 });
  assert.equal(recordDeath(st, w.uid, 'x').memorial.highestStat, 'wit');
  assert.equal(st.emberstones.wit, 1);
  assert.equal(eggOf('bloomseer'), 'sproutle_egg');
});

test('save round-trip through localStorage (and safe when unavailable)', () => {
  assert.equal(loadGame(), null); // no localStorage in node
  assert.equal(saveGame(newGame(1)), false);
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  try {
    const st = newGame(19);
    doAction(st, st.creatures[0].uid, 'pet');
    st.motes = 12;
    assert.equal(saveGame(st), true);
    assert.ok(mem.has(SAVE_KEY));
    const back = loadGame();
    assert.deepEqual(back, st);
    mem.set(SAVE_KEY, '{not json');
    assert.equal(loadGame(), null);
    assert.equal(migrate({ nope: 1 }), null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('data sanity: every baby has two branches', () => {
  for (const c of CREATURES.filter((x) => x.stage === 'baby')) assert.equal(c.evolvesTo.length, 2);
});

test('renameCreature: trims, collapses spaces, caps at 14 chars, refuses empty; survives evolution', () => {
  const st = newGame(5);
  const c = st.creatures[0];
  assert.equal(NAME_MAX, 14);
  assert.deepEqual(renameCreature(st, c.uid, '  Ember   paw  '), { ok: true, name: 'Ember paw' });
  assert.equal(renameCreature(st, c.uid, 'Emberpaw the Brave and Bold').name, 'Emberpaw the B');
  assert.equal(c.name, 'Emberpaw the B');
  assert.equal(renameCreature(st, c.uid, '   ').ok, false);
  assert.equal(c.name, 'Emberpaw the B');
  assert.equal(renameCreature(st, 'nope', 'X').ok, false);
  // a custom name is kept when the egg hatches
  for (let i = 0; i < TUNING.HATCH_PETS; i++) doAction(st, c.uid, 'pet');
  assert.equal(c.species, 'flarekit');
  assert.equal(c.name, 'Emberpaw the B');
});

test('mid-run save: activeRun is optional, versioned and survives migrate()', () => {
  const st = newGame(3);
  assert.equal(st.activeRun, null);
  const legacy = JSON.parse(JSON.stringify(st));
  delete legacy.activeRun; // saves from before mid-run saving existed
  assert.equal(migrate(legacy).activeRun, null);
  const snap = { v: RUN_SAVE_VERSION, run: { floor: 2, party: [{ uid: 'k1' }] }, rng: 99 };
  assert.deepEqual(migrate({ ...legacy, activeRun: snap }).activeRun, snap);
  assert.equal(migrate({ ...legacy, activeRun: { ...snap, v: RUN_SAVE_VERSION + 1 } }).activeRun, null);
  assert.equal(migrate({ ...legacy, activeRun: { v: RUN_SAVE_VERSION, run: {} } }).activeRun, null);
});
