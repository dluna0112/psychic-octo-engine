// Run with: node canon-fodder/test.js   (add --balance for a win-rate report)
const assert = require('assert');
const CF = require('./logic.js');
const { SPECIES, SKILLS } = CF.D;

// A simple bot: trains, rests when tired, breeds when it can, always takes
// the first option of the day (a plain battle, or the boss).
function botRun(seed, meta = CF.newMeta(), opts = {}) {
  const s = CF.newRun(meta, seed, opts.legacy);
  CF.pickStarters(s, [0, 1]);
  const flush = () => { while (s.pending.length) CF.resolveLearn(s, s.rng & 3); s.notices = []; };
  for (let guard = 0; guard < 200 && s.phase !== 'over' && s.phase !== 'won'; guard++) {
    assert.strictEqual(s.phase, 'ranch');
    const ready = s.roster.filter((m) => m.stage >= 1 && !m.breedCd);
    if (ready.length >= 2 && s.roster.length < CF.ROSTER_CAP) CF.breed(s, ready[0].id, ready[1].id);
    for (const m of s.roster) {
      if (m.acted) continue;
      if (m.fatigue >= 50) CF.rest(s, m.id);
      else CF.train(s, m.id, CF.STATS[(m.id + s.day) % 2 ? 1 : (m.id % 5)]);
    }
    flush();
    s.team = s.roster.slice().sort((a, b) => b.level - a.level).slice(0, CF.TEAM_CAP).map((m) => m.id);
    assert(CF.choose(s, 0));
    assert.strictEqual(s.phase, 'battle');
    flush();
    CF.afterBattle(s, meta);
  }
  return s;
}

// Data integrity: every signature skill and evolution link exists.
for (const [id, sp] of Object.entries(SPECIES)) {
  if (sp.sig) assert(SKILLS[sp.sig], `${id} has unknown skill ${sp.sig}`);
  if (sp.from) assert(SPECIES[sp.from], `${id} evolves from unknown ${sp.from}`);
}

// Same seed, same run.
{
  const a = botRun(42), b = botRun(42);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
}

// State survives a JSON round trip (it is what gets saved).
{
  const s = CF.newRun(CF.newMeta(), 7);
  CF.pickStarters(s, [0, 2]);
  const copy = JSON.parse(JSON.stringify(s));
  CF.train(s, s.roster[0].id, 'atk'); CF.train(copy, copy.roster[0].id, 'atk');
  assert.deepStrictEqual(copy, JSON.parse(JSON.stringify(s)));
}

// Starters: pick two of three; one action per Tropeling per day.
{
  const s = CF.newRun(CF.newMeta(), 1);
  assert.strictEqual(s.starters.length, 3);
  assert(!CF.pickStarters(s, [1, 1]));
  assert(CF.pickStarters(s, [0, 1]));
  assert.strictEqual(s.roster.length, 2);
  const m = s.roster[0];
  assert(CF.train(s, m.id, 'atk'));
  assert.strictEqual(CF.train(s, m.id, 'atk'), null);
  assert(!CF.rest(s, m.id));
}

// Evolution: genre affinity picks the Sidekick, training side picks the Lead,
// and generation 3+ unlocks the secret Icon.
{
  const s = CF.newRun(CF.newMeta(), 3);
  CF.pickStarters(s, [0, 1]);
  const m = s.roster[0];
  m.skills = [];
  m.aff.horror = 9;
  CF.addXp(s, m, 60);
  assert.strictEqual(m.stage, 1);
  assert.strictEqual(m.species, 'creepling');
  assert(m.skills.some((k) => k.id === 'jumpscare'));
  m.trainDef = 5;
  CF.addXp(s, m, 400);
  assert.strictEqual(m.species, 'finalghoul');
  m.gen = 3;
  CF.addXp(s, m, 2000);
  assert.strictEqual(m.species, 'directorscut');
  assert.strictEqual(m.genre, 'horror');
}

// Breeding: needs two Sidekicks or better, yields a next-generation Extra
// carrying one inherited skill from each parent, and starts a cooldown.
{
  const s = CF.newRun(CF.newMeta(), 5);
  CF.pickStarters(s, [0, 1]);
  const [a, b] = s.roster;
  assert(CF.canBreed(s, a, b));
  assert.strictEqual(CF.breed(s, a.id, b.id), null);
  a.skills = [{ id: 'explosion', inh: false }]; b.skills = [{ id: 'plotarmor', inh: false }];
  a.genes.atk = 5; b.genes.atk = 5;
  CF.addXp(s, a, 60); CF.addXp(s, b, 60);
  s.pending = [];
  const c = CF.breed(s, a.id, b.id);
  assert(c && c.gen === 2 && c.stage === 0);
  assert(c.genes.atk >= 4);
  const ids = c.skills.map((k) => k.id);
  assert(ids.some((k) => a.skills.some((x) => x.id === k)) && ids.some((k) => b.skills.some((x) => x.id === k)));
  assert(c.skills.every((k) => k.inh));
  assert.strictEqual(a.breedCd, 3);
  assert(CF.canBreed(s, a, b));
}

// Battles: type advantage, and a fight always ends with a winner.
{
  assert.strictEqual(CF.typeMult('action', 'horror'), 1.5);
  assert.strictEqual(CF.typeMult('horror', 'action'), 0.75);
  const s = CF.newRun(CF.newMeta(), 9);
  CF.pickStarters(s, [0, 1]);
  const r = CF.simulate(s, s.roster, s.options[0].team);
  assert(typeof r.win === 'boolean' && r.events.length > 0);
  const last = r.events[r.events.length - 1].hp;
  const dead = (side) => r.units.filter((u) => u.side === side).every((u) => last[u.id] === 0);
  assert(dead(r.win ? 'e' : 'p'));
}

// Plot Armor saves a unit from a lethal hit exactly once.
{
  const s = CF.newRun(CF.newMeta(), 11);
  CF.pickStarters(s, [0, 1]);
  const tank = s.roster[0], brute = s.roster[1];
  tank.skills = [{ id: 'plotarmor' }]; tank.stats.hp = 5; tank.stats.atk = 0.1; tank.stats.lck = 0;
  brute.skills = []; brute.stats.atk = 500; brute.stats.spd = 50; brute.stats.lck = 100;
  const r = CF.simulate(s, [tank], [brute]);
  assert.strictEqual(r.events.filter((e) => /Plot Armor/.test(e.text)).length, 1);
  assert.strictEqual(r.win, false);
}

// Full runs: always terminate, never break invariants, and feed the meta.
{
  const meta = CF.newMeta();
  let wins = 0, days = 0, bred = 0;
  const N = process.argv.includes('--balance') ? 400 : 60;
  for (let seed = 1; seed <= N; seed++) {
    const m2 = CF.newMeta();
    const s = botRun(seed * 7919, m2);
    assert(s.phase === 'over' || s.phase === 'won');
    assert(s.roster.length >= 1 && s.roster.length <= CF.ROSTER_CAP);
    for (const m of s.roster) {
      assert(m.skills.length <= CF.SKILL_CAP);
      for (const st of CF.STATS) assert(Number.isFinite(m.stats[st]) && m.genes[st] >= 1 && m.genes[st] <= 5);
    }
    assert.strictEqual(m2.hall.length, 1);
    if (s.phase === 'won') { wins++; assert.strictEqual(m2.asc, 1); }
    days += s.day; bred += s.bred;
  }
  if (process.argv.includes('--balance')) console.log(`bot: ${wins}/${N} wins, avg day ${(days / N).toFixed(1)}, avg eggs ${(bred / N).toFixed(1)}`);

  // Legacy: a Hall of Fame champion can seed the next run.
  const first = botRun(123, meta);
  const next = CF.newRun(meta, 456, 0);
  assert(next.legacy && next.legacy.gen === meta.hall[0].gen + 1);
  CF.pickStarters(next, [0, 1]);
  assert.strictEqual(next.roster.length, 3);
  assert(first.day >= 1);
}

// Shop and events resolve and hand control back to the ranch.
{
  const s = CF.newRun(CF.newMeta(), 21);
  CF.pickStarters(s, [0, 1]);
  s.options = [{ type: 'shop', name: 'x' }, { type: 'event', name: 'y' }];
  CF.choose(s, 0);
  assert.strictEqual(s.phase, 'shop');
  s.pop = 0;
  assert(CF.buy(s, 0, s.roster[0].id));
  s.pop = 999;
  for (let i = 0; i < 4; i++) CF.buy(s, i, s.roster[0].id);
  assert(s.pop < 999);
  CF.leave(s);
  assert.strictEqual(s.phase, 'ranch');
  assert.strictEqual(s.day, 2);
  for (let id = 0; id < CF.EVENTS.length; id++) for (let o = 0; o < 2; o++) {
    s.phase = 'event'; s.event = { id, result: null }; s.pop = 50;
    assert(CF.eventChoice(s, o));
    assert(typeof s.event.result === 'string');
    CF.leave(s);
    assert.strictEqual(s.phase, 'ranch');
    s.pending = [];
  }
}

console.log('canon-fodder: all tests passed');
