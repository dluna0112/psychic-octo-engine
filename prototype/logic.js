// Wyrdgarden prototype: the game rules, with no DOM access.
// In the browser this is window.Wyrd. In Node it is a plain module, so the
// rules can be tested without a browser.
(function (root) {
  'use strict';

  const MAX_PARTY = 4;
  const SAPLING_XP = 30;
  const BLOOM_XP = 70;
  const HESITATE_AT = 50;
  const BRITTLE_AT = 80;
  const OVERWHELM_AT = 100;
  const MAX_ROUNDS = 60;
  const NAMES = ['Mira', 'Bramble', 'Okto', 'Fen', 'Sorrel', 'Wick', 'Pip', 'Hollis', 'Quill', 'Ash'];

  const ENEMIES = [
    { name: 'Rot Crawler', hp: 16, atk: 5, guard: 1, spd: 4 },
    { name: 'Hollow Moth', hp: 12, atk: 7, guard: 0, spd: 7 },
    { name: 'Briar Hound', hp: 22, atk: 6, guard: 2, spd: 5 },
    { name: 'Gloom Wisp', hp: 10, atk: 8, guard: 0, spd: 9 },
  ];
  const BOSS = { name: 'The Sunken Mother', hp: 46, atk: 9, guard: 3, spd: 6 };

  // Room order for one Depth. 'boss' ends the run in victory.
  const ROOMS = ['combat', 'combat', 'rest', 'combat', 'boss'];

  const BOONS = [
    { id: 'warmth', name: 'Remembered Warmth', text: 'Heal 20% of max HP after each won fight.' },
    { id: 'root', name: 'Stubborn Root', text: 'The first death in each room returns that Sprout at 1 HP.' },
    { id: 'quiet', name: 'Quiet Mind', text: 'Stress gain is halved for the rest of the run.' },
    { id: 'keen', name: 'Keen Edge', text: '+3 Attack for every Sprout.' },
  ];

  // A seeded generator for tests. The game itself falls back to Math.random.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const up = (u) => u.hp > 0;
  const hasBoon = (run, id) => run.boons.indexOf(id) !== -1;
  const say = (run, text) => run.log.push(text);
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function makeSprout(id, name, rng) {
    const hp = 18 + Math.floor(rng() * 6);
    return {
      id: id,
      name: name,
      stage: 'Seedling',
      branch: null,
      hp: hp,
      maxHp: hp,
      atk: 4 + Math.floor(rng() * 3),
      guard: 1,
      spd: 3 + Math.floor(rng() * 5),
      stress: 0,
      xp: 0,
      care: { tend: 0, spark: 0, hush: 0 },
      affliction: null,
      virtue: null,
      overwhelmed: false,
    };
  }

  function newSave(rng) {
    rng = rng || Math.random;
    const roster = [];
    for (let i = 0; i < MAX_PARTY; i++) roster.push(makeSprout(i + 1, NAMES[i], rng));
    return {
      day: 1,
      fruit: 3,
      roster: roster,
      memorials: [],
      selected: roster.map((s) => s.id),
      acted: {},
      nextId: MAX_PARTY + 1,
    };
  }

  function fruitYield(save) {
    return 1 + Math.min(3, save.memorials.length);
  }

  // ---- Garden -------------------------------------------------------------

  function evolveIfReady(s) {
    if (s.stage === 'Seedling' && s.xp >= SAPLING_XP) s.stage = 'Sapling';
    if (s.stage === 'Sapling' && s.xp >= BLOOM_XP) {
      s.stage = 'Bloom';
      // Veilsong (Hush) is post-slice, so Hush-leaning Sprouts become Mosswarden here.
      if (s.care.spark > s.care.tend) {
        s.branch = 'Thornrunner';
        s.atk += 2;
        s.spd += 3;
      } else {
        s.branch = 'Mosswarden';
        s.maxHp += 8;
        s.hp += 8;
        s.guard += 2;
      }
    }
    return s.stage;
  }

  function gardenAct(save, id, action) {
    const s = save.roster.find((x) => x.id === id);
    if (!s) return { ok: false, msg: 'No such Sprout.' };
    if (save.acted[id]) return { ok: false, msg: s.name + ' has already been tended today.' };

    if (action === 'tend') {
      if (save.fruit < 1) return { ok: false, msg: 'No fruit left. More grows each morning.' };
      save.fruit -= 1;
      s.stress = Math.max(0, s.stress - 25);
      s.care.tend += 1;
    } else if (action === 'spark') {
      s.xp += 8;
      s.care.spark += 1;
      s.stress = Math.min(OVERWHELM_AT - 1, s.stress + 3);
    } else if (action === 'hush') {
      s.stress = Math.max(0, s.stress - 15);
      s.care.hush += 1;
    } else {
      return { ok: false, msg: 'Unknown action.' };
    }

    save.acted[id] = true;
    evolveIfReady(s);
    return { ok: true };
  }

  function nextDay(save, rng) {
    rng = rng || Math.random;
    save.day += 1;
    save.acted = {};
    save.fruit += fruitYield(save);
    save.roster.forEach((s) => {
      s.stress = Math.max(0, s.stress - 5);
    });
    while (save.roster.length < MAX_PARTY) {
      save.roster.push(makeSprout(save.nextId++, pick(rng, NAMES), rng));
    }
    const ids = save.roster.map((s) => s.id);
    save.selected = save.selected.filter((id) => ids.indexOf(id) !== -1);
    if (!save.selected.length) save.selected = ids.slice(0, MAX_PARTY);
    return save;
  }

  // ---- Combat -------------------------------------------------------------
  //
  // Each round, every living unit acts once in speed order. Enemies act on
  // their own. When a Sprout's turn comes up, the fight pauses in
  // run.combat.awaiting until the player calls act().

  // Branch abilities. Each one has a cooldown counted in the Sprout's own turns.
  function abilityOf(u) {
    if (u.branch === 'Mosswarden') {
      return { id: 'bark', name: 'Bark Wall', text: 'Guard +2 and draw every enemy attack until their next turn.', cooldown: 2 };
    }
    if (u.branch === 'Thornrunner') {
      return { id: 'dash', name: 'Thorn Dash', text: 'Strike a chosen foe with +4 Attack and a 50% critical chance.', cooldown: 2 };
    }
    return null;
  }

  function guardOf(u) {
    const brittle = u.affliction === 'Brittle' ? 2 : 0;
    const braced = u.guardUp ? 2 : 0;
    return Math.max(0, u.guard + braced - brittle);
  }

  function critChance(u) {
    return u.branch === 'Thornrunner' ? 0.25 : 0.1;
  }

  function addStress(run, s, amount) {
    if (hasBoon(run, 'quiet')) amount /= 2;
    const cap = s.virtue === 'Resolute' ? 60 : OVERWHELM_AT;
    s.stress = clamp(s.stress + amount, 0, cap);

    if (!s.affliction && s.stress >= BRITTLE_AT) {
      s.affliction = 'Brittle';
      say(run, s.name + ' is Brittle now. Their guard is weakened.');
    }
    if (s.stress >= OVERWHELM_AT) {
      s.overwhelmed = true;
      s.stress = 50;
      s.virtue = 'Resolute';
      say(run, s.name + ' is overwhelmed, then steadies. Resolute: stress is capped at 60 from now on.');
    }
  }

  function strike(run, attacker, target, rng, opts) {
    opts = opts || {};
    const chance = opts.crit !== undefined ? opts.crit : critChance(attacker);
    const crit = rng() < chance;
    const keen = !attacker.enemy && hasBoon(run, 'keen') ? 3 : 0;
    const atk = attacker.atk + keen + (opts.bonusAtk || 0);
    let dmg = Math.max(1, atk - guardOf(target));
    if (crit) dmg *= 2;
    target.hp = Math.max(0, target.hp - dmg);
    say(run, attacker.name + ' hits ' + target.name + ' for ' + dmg + (crit ? ' (critical)' : '') + '.');

    if (!target.enemy) addStress(run, target, crit ? 12 : 4);
    if (target.hp > 0) return;

    if (target.enemy) {
      say(run, target.name + ' falls.');
      return;
    }
    if (!run.combat.rootUsed && hasBoon(run, 'root')) {
      run.combat.rootUsed = true;
      target.hp = 1;
      say(run, 'Stubborn Root holds. ' + target.name + ' stays on their feet at 1 HP.');
      return;
    }
    say(run, target.name + ' has fallen.');
    run.party.filter(up).forEach((p) => addStress(run, p, 12));
  }

  function enemyTurn(run, e, rng) {
    const taunt = run.combat.taunt;
    const target = taunt && up(taunt) ? taunt : pick(rng, run.party.filter(up));
    strike(run, e, target, rng);
  }

  // Runs automatic turns until a Sprout needs a decision or the fight ends.
  function playOn(run, rng) {
    const c = run.combat;
    c.awaiting = null;

    while (true) {
      if (!run.party.some(up) || !c.foes.some(up)) return finishCombat(run, rng);
      if (c.round >= MAX_ROUNDS) {
        say(run, 'The fight drags on past its limit. The party falls back.');
        run.combat = null;
        run.state = 'retreated';
        return run;
      }
      if (!c.queue.length) {
        c.round += 1;
        c.queue = run.party.concat(c.foes).filter(up).sort((a, b) => b.spd - a.spd);
      }

      const u = c.queue.shift();
      if (!up(u)) continue;
      if (u.enemy) {
        enemyTurn(run, u, rng);
        continue;
      }

      // Guard and Bark Wall last until this Sprout's next turn.
      u.guardUp = false;
      if (c.taunt === u) c.taunt = null;
      if (u.cooldown > 0) u.cooldown -= 1;
      if (u.overwhelmed) {
        u.overwhelmed = false;
        say(run, u.name + ' freezes, overwhelmed.');
        continue;
      }
      if (u.stress >= HESITATE_AT && rng() < 0.25) {
        say(run, u.name + ' hesitates.');
        continue;
      }
      c.awaiting = u;
      run.state = 'fighting';
      return run;
    }
  }

  // The player's decision for the Sprout whose turn it is.
  //   action: 'attack' | 'guard' | 'ability'
  //   targetIndex: index into run.combat.foes (used by attack and dash)
  // Invalid choices change nothing and return the same state.
  function act(run, action, targetIndex, rng) {
    rng = rng || Math.random;
    const c = run.combat;
    if (!c || !c.awaiting) return run;

    const u = c.awaiting;
    const foe = c.foes[targetIndex];
    const foeOk = !!foe && up(foe);
    const ab = abilityOf(u);

    if (action === 'attack') {
      if (!foeOk) return run;
      c.awaiting = null;
      strike(run, u, foe, rng);
    } else if (action === 'guard') {
      c.awaiting = null;
      u.guardUp = true;
      say(run, u.name + ' braces.');
    } else if (action === 'ability') {
      if (!ab || u.cooldown > 0) return run;
      if (ab.id === 'dash' && !foeOk) return run;
      c.awaiting = null;
      u.cooldown = ab.cooldown;
      if (ab.id === 'bark') {
        u.guardUp = true;
        c.taunt = u;
        say(run, u.name + ' plants Bark Wall. Enemies must attack them until their next turn.');
      } else {
        strike(run, u, foe, rng, { bonusAtk: 4, crit: 0.5 });
      }
    } else {
      return run;
    }

    return playOn(run, rng);
  }

  // Ends a fight: rewards and boon offers if the party won, or defeat if it fell.
  function finishCombat(run, rng) {
    const foesFought = run.combat.foes.length;
    run.combat = null;

    if (!run.party.some(up)) {
      say(run, 'The party has fallen.');
      run.state = 'defeat';
      return run;
    }

    run.party.filter(up).forEach((p) => {
      p.xp += 6 + 2 * foesFought;
      if (hasBoon(run, 'warmth')) p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.2));
    });

    if (run.rooms[run.index] === 'boss') {
      say(run, BOSS.name + ' is silenced. The Depths grow quiet.');
      run.state = 'victory';
      return run;
    }

    run.offered = offerBoons(run, rng || Math.random);
    run.state = 'cleared';
    return run;
  }

  function enemyFrom(t) {
    return { name: t.name, hp: t.hp, maxHp: t.hp, atk: t.atk, guard: t.guard, spd: t.spd, enemy: true };
  }

  function pickFoes(rng) {
    const count = 2 + Math.floor(rng() * 2);
    const foes = [];
    for (let i = 0; i < count; i++) foes.push(enemyFrom(pick(rng, ENEMIES)));
    return foes;
  }

  function offerBoons(run, rng) {
    const pool = BOONS.map((b) => b.id).filter((id) => !hasBoon(run, id));
    const offer = [];
    while (offer.length < 3 && pool.length) {
      offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return offer.length ? offer : null;
  }

  function startRun(save) {
    const party = save.roster
      .filter((s) => save.selected.indexOf(s.id) !== -1)
      .slice(0, MAX_PARTY)
      .map((s) => {
        const p = clone(s);
        p.hp = p.maxHp;
        p.overwhelmed = false;
        p.guardUp = false;
        p.cooldown = 0;
        return p;
      });
    return {
      party: party,
      rooms: ROOMS.slice(),
      index: 0,
      boons: [],
      log: [],
      offered: null,
      combat: null,
      state: 'ready', // ready -> fighting -> cleared -> ready ... -> victory | defeat | retreated
    };
  }

  // Starts the current room. Rest resolves at once. A fight starts and runs
  // until a Sprout needs a decision (state 'fighting').
  function enterRoom(run, rng) {
    if (run.state !== 'ready') return run;
    rng = rng || Math.random;
    const type = run.rooms[run.index];
    run.log = [];

    if (type === 'rest') {
      run.party.filter(up).forEach((p) => {
        p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.25));
        p.stress = Math.max(0, p.stress - 20);
      });
      say(run, 'A quiet hollow. The party rests: healed 25% of max HP, stress eased by 20.');
      run.state = 'cleared';
      return run;
    }

    const foes = type === 'boss' ? [enemyFrom(BOSS)] : pickFoes(rng);
    run.combat = { foes: foes, queue: [], round: 0, taunt: null, awaiting: null };
    say(run, type === 'boss'
      ? BOSS.name + ' rises from the water.'
      : 'Enemies emerge: ' + foes.map((f) => f.name).join(', ') + '.');
    return playOn(run, rng);
  }

  function takeBoon(run, id) {
    if (!run.offered || run.offered.indexOf(id) === -1) return run;
    run.boons.push(id);
    run.offered = null;
    return run;
  }

  function advance(run) {
    if (run.state !== 'cleared' || run.offered) return run;
    run.index += 1;
    run.state = 'ready';
    return run;
  }

  function retreat(run) {
    if (run.state === 'ready' || run.state === 'cleared') {
      run.offered = null;
      run.state = 'retreated';
    }
    return run;
  }

  // Brings the run's Sprouts back to the garden. Survivors return healed to
  // full HP but keep their stress, XP, care, and any affliction or virtue.
  // The dead become memorials.
  function endRun(save, run) {
    run.party.forEach((p) => {
      const idx = save.roster.findIndex((s) => s.id === p.id);
      if (idx === -1) return;
      if (up(p)) {
        p.hp = p.maxHp;
        p.overwhelmed = false;
        delete p.guardUp;
        delete p.cooldown;
        evolveIfReady(p);
        save.roster[idx] = p;
      } else {
        save.roster.splice(idx, 1);
        save.selected = save.selected.filter((id) => id !== p.id);
        save.memorials.push({ name: p.name, stage: p.stage, branch: p.branch, day: save.day });
      }
    });
    return save;
  }

  const api = {
    MAX_PARTY: MAX_PARTY,
    ROOMS: ROOMS,
    BOONS: BOONS,
    boon: (id) => BOONS.find((b) => b.id === id),
    abilityOf: abilityOf,
    makeRng: makeRng,
    newSave: newSave,
    fruitYield: fruitYield,
    gardenAct: gardenAct,
    nextDay: nextDay,
    evolveIfReady: evolveIfReady,
    startRun: startRun,
    enterRoom: enterRoom,
    act: act,
    takeBoon: takeBoon,
    advance: advance,
    retreat: retreat,
    endRun: endRun,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Wyrd = api;
})(typeof window !== 'undefined' ? window : globalThis);
