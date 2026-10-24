// Run with: node prototype/test.js
const assert = require('assert');
const W = require('./logic.js');

function playRun(seed) {
  const rng = W.makeRng(seed);
  const save = W.newSave(rng);
  const run = W.startRun(save);
  let steps = 0;
  while (run.state !== 'victory' && run.state !== 'defeat' && steps++ < 100) {
    if (run.state === 'ready') W.enterRoom(run, rng);
    else if (run.state === 'cleared') {
      if (run.offered) W.takeBoon(run, run.offered[0]);
      else W.advance(run);
    }
  }
  return { save, run };
}

// A new game starts with a full, fully selected party.
{
  const save = W.newSave(W.makeRng(1));
  assert.strictEqual(save.roster.length, W.MAX_PARTY);
  assert.strictEqual(save.selected.length, W.MAX_PARTY);
  assert.strictEqual(save.fruit, 3);
}

// Every seeded run reaches a final state, and the roster plus memorials
// always accounts for the whole party.
{
  const outcomes = { victory: 0, defeat: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const { save, run } = playRun(seed);
    assert.ok(run.state === 'victory' || run.state === 'defeat', 'seed ' + seed + ' did not finish');
    outcomes[run.state] += 1;
    W.endRun(save, run);
    assert.strictEqual(save.roster.length + save.memorials.length, W.MAX_PARTY, 'seed ' + seed);
    save.roster.forEach((s) => assert.strictEqual(s.hp, s.maxHp, 'survivor not restored, seed ' + seed));
  }
  console.log('runs over 300 seeds:', JSON.stringify(outcomes));
  assert.ok(outcomes.victory > 0, 'no seed produced a victory; balance is probably broken');
  assert.ok(outcomes.defeat > 0, 'no seed produced a defeat; balance is probably too easy');
}

// Retreat keeps the survivors and ends the run.
{
  const rng = W.makeRng(7);
  const save = W.newSave(rng);
  const run = W.startRun(save);
  W.retreat(run);
  assert.strictEqual(run.state, 'retreated');
  W.endRun(save, run);
  assert.strictEqual(save.roster.length, W.MAX_PARTY);
  assert.strictEqual(save.memorials.length, 0);
}

// Evolution: Seedling -> Sapling -> Bloom, branch chosen by dominant care.
{
  const s = { stage: 'Seedling', xp: 30, branch: null, care: { tend: 0, spark: 5, hush: 0 }, atk: 5, spd: 5, guard: 1, hp: 20, maxHp: 20 };
  assert.strictEqual(W.evolveIfReady(s), 'Sapling');
  s.xp = 70;
  assert.strictEqual(W.evolveIfReady(s), 'Bloom');
  assert.strictEqual(s.branch, 'Thornrunner');
  assert.strictEqual(s.spd, 8);

  const m = { stage: 'Sapling', xp: 70, branch: null, care: { tend: 4, spark: 1, hush: 0 }, atk: 5, spd: 5, guard: 1, hp: 20, maxHp: 20 };
  W.evolveIfReady(m);
  assert.strictEqual(m.branch, 'Mosswarden');
  assert.strictEqual(m.maxHp, 28);
  assert.strictEqual(m.guard, 3);
}

// Garden: one action per Sprout per day, Tend costs fruit, nextDay resets it.
{
  const rng = W.makeRng(3);
  const save = W.newSave(rng);
  const id = save.roster[0].id;
  const s = save.roster[0];
  s.stress = 40;

  assert.strictEqual(W.gardenAct(save, id, 'tend').ok, true);
  assert.strictEqual(save.fruit, 2);
  assert.strictEqual(s.stress, 15);
  assert.strictEqual(W.gardenAct(save, id, 'hush').ok, false, 'second action should be blocked');

  W.nextDay(save, rng);
  assert.strictEqual(save.day, 2);
  assert.strictEqual(save.fruit, 2 + W.fruitYield(save));
  assert.strictEqual(W.gardenAct(save, id, 'hush').ok, true);
}

console.log('all prototype tests passed');
