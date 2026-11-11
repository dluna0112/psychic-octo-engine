import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, BOONS } from '../src/data.js';
import { createRng } from '../src/rng.js';
import {
  createRun, makeFighter, makeFloorMap, choices, enterNode, startBattle, finishBattle, resolveRest, resolveEvent,
  offerBoons, pickBoon, completeNode, applyRunToSave, autoRun, encounterFor, motesFor, living,
} from '../src/run.js';
import { boonEffects } from '../src/battle.js';

const creature = (o = {}) => ({
  uid: o.uid || 'c1', name: o.name || o.species || 'Flarekit', species: o.species || 'flarekit',
  might: 10, wit: 5, heart: 8, maxHp: 50, hp: o.hp ?? o.maxHp ?? 50, bond: 20, stress: 0,
  pets: 0, hatchedDay: 1, actionCounts: {}, lastAction: null, todayActions: {}, affliction: null, legacy: null, ...o,
});
const party = (list) => list.map((o) => makeFighter(creature(o)));
const adults = () => party([
  { uid: 'a', species: 'blazefang', might: 28, wit: 7, heart: 8, maxHp: 64, bond: 40, stress: 15 },
  { uid: 'b', species: 'tidalknight', might: 27, wit: 9, heart: 8, maxHp: 68, bond: 40, stress: 15 },
  { uid: 'c', species: 'bloomseer', might: 8, wit: 27, heart: 8, maxHp: 64, bond: 40, stress: 15 },
]);
const babies = () => party([
  { uid: 'a', species: 'flarekit', might: 10, wit: 5, heart: 6, maxHp: 32, bond: 20, stress: 10 },
  { uid: 'b', species: 'puddlin', might: 5, wit: 10, heart: 6, maxHp: 36, bond: 20, stress: 10 },
  { uid: 'c', species: 'sproutle', might: 8, wit: 6, heart: 6, maxHp: 40, bond: 20, stress: 10 },
]);

test('map shape: 3 floors x 5 steps, lanes, guaranteed rest, elite gates and boss', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const run = createRun({ party: adults(), seed });
    assert.equal(Object.keys(run.map).length, T.FLOORS);
    for (let f = 1; f <= T.FLOORS; f++) {
      const steps = run.map[f];
      assert.equal(steps.length, T.STEPS_PER_FLOOR);
      assert.deepEqual(steps[0].map((n) => n.type), ['fight']);
      for (let s = 2; s <= 4; s++) {
        assert.equal(steps[s - 1].length, T.LANES);
        assert.notEqual(steps[s - 1][0].type, steps[s - 1][1].type, 'lanes differ');
        for (const n of steps[s - 1]) assert.ok(['fight', 'event', 'rest', 'elite'].includes(n.type));
      }
      assert.ok(steps[T.GUARANTEED_REST_STEP - 1].some((n) => n.type === 'rest'));
      assert.deepEqual(steps[4].map((n) => n.type), [f === 3 ? 'boss' : 'elite']);
      for (const st of steps) for (const n of st) if (n.type === 'event') assert.ok(n.eventId);
    }
  }
});

test('node weights roughly follow 50/20/15/15 on step 2', () => {
  const rng = createRng(9);
  const c = { fight: 0, event: 0, rest: 0, elite: 0 };
  for (let i = 0; i < 3000; i++) c[makeFloorMap(rng, 1)[1][0].type]++;
  assert.ok(Math.abs(c.fight / 3000 - 0.5) < 0.04, JSON.stringify(c));
  assert.ok(Math.abs(c.elite / 3000 - 0.15) < 0.03, JSON.stringify(c));
});

test('encounters by floor and enemy scaling', () => {
  assert.deepEqual(encounterFor({ type: 'fight', floor: 1 }).map((e) => e.id), ['gloomlet', 'gloomlet']);
  assert.equal(encounterFor({ type: 'fight', floor: 3 }).length, 3);
  assert.deepEqual(encounterFor({ type: 'elite', floor: 2 }).map((e) => e.id), ['dire_gloomlet', 'gloomlet']);
  assert.equal(encounterFor({ type: 'elite', floor: 2 })[0].maxHp, Math.round(90 * 1.25));
  assert.deepEqual(encounterFor({ type: 'boss', floor: 3 }).map((e) => e.id), ['hollow_warden']);
});

test('entering a fight/elite/boss adds stress', () => {
  const run = createRun({ party: adults(), seed: 3 });
  enterNode(run, 0);
  assert.ok(living(run).every((m) => m.stress === 15 + T.STRESS_ENTER.fight));
});

test('boon offers are unique per run and Hearthstone heals the amount gained', () => {
  const run = createRun({ party: adults(), seed: 5 });
  const seen = new Set();
  for (let i = 0; i < BOONS.length; i++) {
    const offer = offerBoons(run);
    assert.ok(offer.length <= T.BOON_CHOICES && offer.length >= 1);
    assert.equal(new Set(offer).size, offer.length);
    for (const id of offer) assert.ok(!run.boons.includes(id));
    const pick = offer.includes('hearthstone') ? 'hearthstone' : offer[0];
    const m = run.party[0], hp0 = m.hp, max0 = m.maxHp;
    pickBoon(run, pick);
    if (pick === 'hearthstone') { assert.equal(m.maxHp, Math.round(max0 * 1.15)); assert.equal(m.hp - hp0, m.maxHp - max0); }
    assert.ok(!seen.has(pick)); seen.add(pick);
  }
  assert.equal(run.boons.length, BOONS.length);
  assert.equal(offerBoons(run), null); // nothing left
  assert.throws(() => pickBoon(run, 'keen_eye'));
});

test('boon after first fight of a floor (not the second), motes with Mote Magnet', () => {
  const run = createRun({ party: adults(), seed: 11 });
  enterNode(run, 0);
  let b = startBattle(run);
  while (!b.state.ended) b.step();
  let r = finishBattle(run, b);
  assert.equal(r.outcome, 'won');
  assert.equal(r.motes, T.MOTES.fight);
  assert.ok(r.boonOffer && r.boonOffer.length === 3);
  pickBoon(run, r.boonOffer.includes('mote_magnet') ? 'mote_magnet' : r.boonOffer[0]);
  completeNode(run);
  // force a second fight on this floor
  run.map[1][1] = [{ type: 'fight', floor: 1, step: 2, lane: 0 }];
  enterNode(run, 0);
  b = startBattle(run);
  while (!b.state.ended) b.step();
  r = finishBattle(run, b);
  assert.equal(r.boonOffer, null);
  assert.equal(r.motes, motesFor('fight', boonFx(run.boons)));
  assert.equal(motesFor('fight', { moteMult: 1.5 }), 3);
  assert.equal(motesFor('boss', { moteMult: 1.5 }), 23);
});
const boonFx = (ids) => boonEffects(ids.map((id) => BOONS.find((b) => b.id === id)));

test('rest heals 40% (+Soft Moss, +Sleepy) and removes stress', () => {
  const run = createRun({ party: party([{ uid: 'a', hp: 10, maxHp: 100, stress: 50 }]), seed: 1 });
  run.party.push(makeFighter(creature({ uid: 's', hp: 10, maxHp: 100, stress: 50 }), { maxHp: 100, restHealBonusPct: 0.1 }));
  run.current = { type: 'rest' };
  run.boons.push('soft_moss');
  resolveRest(run);
  assert.equal(run.party[0].hp, 10 + 60);
  assert.equal(run.party[1].hp, 10 + 70);
  assert.equal(run.party[0].stress, 50 - 25 - 10);
});

test('events: Lost Lantern, Gloom Fog, Whispering Well', () => {
  const run = createRun({ party: party([{ uid: 'a', bond: 50, stress: 40 }, { uid: 'b', bond: 10, stress: 40 }]), seed: 1 });
  run.current = { type: 'event', eventId: 'lost_lantern' };
  let r = resolveEvent(run);
  assert.equal(r.target.uid, 'b');
  assert.equal(run.party[1].bond, 20);
  assert.equal(run.party[1].stress, 30);
  run.current = { type: 'event', eventId: 'gloom_fog' };
  r = resolveEvent(run);
  assert.equal(run.motes, 6);
  assert.equal(run.party[0].stress, 52);
  run.current = { type: 'event', eventId: 'whispering_well' };
  r = resolveEvent(run);
  assert.equal(r.boonOffer.length, 3);
});

test('floor clear heals 20% and moves to the next floor; boss clears the run', () => {
  const run = createRun({ party: party([{ uid: 'a', hp: 10, maxHp: 100 }]), seed: 1 });
  run.step = 4;
  const r = completeNode(run);
  assert.equal(r.floorCleared, 1);
  assert.equal(run.party[0].hp, 30);
  assert.equal(run.floor, 2);
  assert.equal(run.step, 0);
  assert.equal(run.floorReached, 2);
});

test('a second break from event stress can kill; a full wipe ends the run', () => {
  const run = createRun({ party: party([{ uid: 'a', stress: 95, hp: 10, maxHp: 100 }]), seed: 1 });
  run.party[0].breaks = 1;
  run.current = { type: 'event', eventId: 'gloom_fog' };
  resolveEvent(run);
  assert.ok(run.party[0].dead);
  assert.equal(run.done, true);
  assert.equal(run.outcome, 'wiped');
});

test('applyRunToSave writes hp/stress/affliction/bond, deaths, motes, bestFloor, expeditions', () => {
  const state = { motes: 3, bestFloor: 1, expeditions: 0, creatures: [creature({ uid: 'a', maxHp: 50 }), creature({ uid: 'b', name: 'Puddlin', species: 'puddlin' })], memorials: [] };
  const run = createRun({ party: party(state.creatures), seed: 2 });
  run.party[0].hp = 25; run.party[0].stress = 77; run.party[0].affliction = 'sullen'; run.party[0].bond = 31;
  run.party[1].dead = true; run.party[1].deathCause = 'fell';
  run.motes = 12; run.floorReached = 2; run.done = true; run.outcome = 'wiped';
  const deaths = [];
  const summary = applyRunToSave(state, run, {
    getCreature: (s, uid) => s.creatures.find((c) => c.uid === uid),
    recordDeath: (s, uid, cause) => { deaths.push([uid, cause]); s.creatures = s.creatures.filter((c) => c.uid !== uid); return { legacyEgg: { name: 'Puddlin Egg' } }; },
  });
  assert.deepEqual(deaths, [['b', 'fell']]);
  const a = state.creatures[0];
  assert.equal(a.hp, 25); assert.equal(a.stress, 77); assert.equal(a.affliction, 'sullen'); assert.equal(a.bond, 31);
  assert.equal(state.motes, 15); assert.equal(state.bestFloor, 2); assert.equal(state.expeditions, 1);
  assert.deepEqual(summary, { outcome: 'wiped', floorReached: 2, motes: 12, fallen: ['Puddlin'], hatchedLegacy: ['Puddlin Egg'] });
});

test('determinism: same seed and choices give the same run', () => {
  const A = autoRun({ party: adults(), seed: 777 });
  const B = autoRun({ party: adults(), seed: 777 });
  assert.deepEqual(A.log, B.log);
  assert.deepEqual(A.party, B.party);
  assert.equal(A.motes, B.motes);
  assert.deepEqual(A.boons, B.boons);
});

test('balance: 200 runs, trained adults vs babies (prints win rates)', () => {
  const sim = (mk) => {
    const N = 200; const reach = { 1: 0, 2: 0, 3: 0 }; let deaths = 0, motes = 0;
    for (let s = 1; s <= N; s++) {
      const run = autoRun({ party: mk(), seed: s * 7919 });
      for (let f = 1; f <= 3; f++) if (run.floor > f || run.outcome === 'cleared') reach[f]++;
      deaths += run.party.filter((m) => m.dead).length; motes += run.motes;
    }
    return { f1: reach[1] / N, f2: reach[2] / N, boss: reach[3] / N, deaths: deaths / N, motes: motes / N };
  };
  const A = sim(adults), B = sim(babies);
  console.log(`# balance adults(day~10): clear F1 ${(A.f1 * 100).toFixed(0)}%  F2 ${(A.f2 * 100).toFixed(0)}%  boss ${(A.boss * 100).toFixed(0)}%  avg deaths ${A.deaths.toFixed(2)}  avg motes ${A.motes.toFixed(1)}`);
  console.log(`# balance babies(day~4):  clear F1 ${(B.f1 * 100).toFixed(0)}%  F2 ${(B.f2 * 100).toFixed(0)}%  boss ${(B.boss * 100).toFixed(0)}%  avg deaths ${B.deaths.toFixed(2)}`);
  assert.ok(A.f1 >= 0.9, 'adults nearly always clear floor 1');
  assert.ok(A.boss > 0.2 && A.boss < 0.8, 'boss is a coin flip-ish for a good party');
  assert.ok(B.f2 < 0.2, 'babies struggle on floor 2');
});
