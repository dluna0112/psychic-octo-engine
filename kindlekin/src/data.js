// Kindlekin — game data. Single source of truth for every number in docs/DESIGN.md.
// Plain data only: no logic, no imports. Percentages are fractions (0.25 = 25%).

export const ELEMENTS = {
  fire: { beats: 'leaf' },
  leaf: { beats: 'water' },
  water: { beats: 'fire' },
  shadow: { beats: null }, // neutral: never deals or takes element bonus
};

export const TUNING = {
  // --- Garden ---
  ACTIONS_PER_DAY: 6, // shared across the whole garden
  MOTES_PER_EXTRA_ACTION: 5,
  MAX_EXTRA_ACTIONS_PER_DAY: 3,
  STAT_CAP: 40, // Might / Wit / Heart
  BOND_MIN: 0,
  BOND_MAX: 100,
  BOND_START: 10, // on hatching
  STRESS_MIN: 0,
  STRESS_MAX: 100,
  TRAIN_REFUSE_STRESS: 70, // training actions disabled at or above this
  BOND_TRAIN_BONUS_AT: 60, // training gives +BOND_TRAIN_BONUS extra stat at this Bond
  BOND_TRAIN_BONUS: 1,
  OVERNIGHT_STRESS: -5,
  OVERNIGHT_HEAL_PCT: 1.0,
  NEGLECT_BOND: -2, // hatched creature that got 0 actions that day
  PERSONALITY_MIN_ACTIONS: 5, // below this the creature is "Unformed"
  MOOD_UNEASY_STRESS: 30, // face/pose: happy < 30 <= uneasy < 70 <= frazzled
  MOOD_FRAZZLED_STRESS: 70,

  // --- Evolution ---
  HATCH_PETS: 3,
  EVOLVE_MIN_DAYS: 3, // days since hatching
  EVOLVE_STAT: 20, // branch stat threshold
  EVOLVE_BOND_GENTLE: 30, // extra Bond needed for Wit/Heart branches
  EVOLVE_TIE_BREAK: 'might',

  // --- Battle ---
  PARTY_SIZE: 3,
  ATK_BASE: 4, // raw = ATK_BASE + Might
  ELEMENT_STRONG: 1.5,
  ELEMENT_WEAK: 0.75,
  CRIT_BASE: 0.05,
  CRIT_PER_WIT: 0.01,
  CRIT_CAP: 0.4,
  CRIT_MULT: 1.5,
  GUARD_HEART_DIV: 4, // flat damage reduction = floor(Heart / 4)
  MEND_HEART_DIV: 5, // end-of-round heal to most-hurt ally = floor(Heart / 5)
  MIN_DAMAGE: 1,
  MAX_ROUNDS: 20, // then enemies flee: no reward, party +STRESS_STALEMATE
  CHEERS_PER_FIGHT: 1,
  CHEER_BASE_MULT: 1.25, // party damage mult for one round = base + avgBond / CHEER_BOND_DIV
  CHEER_BOND_DIV: 200, // => x1.25 at Bond 0, x1.75 at Bond 100
  CHEER_STRESS: -5, // each party member

  // --- Expedition ---
  FLOORS: 3,
  STEPS_PER_FLOOR: 5,
  LANES: 2, // node choices on steps 2-4
  NODE_WEIGHTS: { fight: 50, event: 20, rest: 15, elite: 15 }, // steps 2-4
  GUARANTEED_REST_STEP: 4, // at least one lane on this step is a rest
  FLOOR_SCALE_PER_FLOOR: 0.25, // enemy HP & Might x (1 + 0.25 * (floor - 1)); boss unscaled
  FIGHT_GROUPS: { 1: ['gloomlet', 'gloomlet'], 2: ['gloomlet', 'gloomlet', 'gloomlet'], 3: ['gloomlet', 'gloomlet', 'gloomlet'] },
  ELITE_GROUPS: { 1: ['dire_gloomlet'], 2: ['dire_gloomlet', 'gloomlet'], 3: ['dire_gloomlet', 'gloomlet', 'gloomlet'] },
  BOSS_GROUP: ['hollow_warden'],
  REST_HEAL_PCT: 0.4,
  REST_STRESS: -25,
  FLOOR_CLEAR_HEAL_PCT: 0.2,
  BOON_CHOICES: 3, // pick 1; boons are unique per run
  MOTES: { fight: 2, elite: 5, boss: 15 },

  // --- Stress ---
  STRESS_ENTER: { fight: 3, elite: 6, boss: 10 },
  STRESS_HIT: 2,
  STRESS_CRIT_TAKEN: 6,
  STRESS_LOW_HP: 3, // at round end while HP < LOW_HP_PCT
  LOW_HP_PCT: 0.25,
  STRESS_ALLY_DEATH: 15,
  STRESS_WIN: -4,
  STRESS_STALEMATE: 10,
  UNEASY_STRESS: 50,
  UNEASY_DAMAGE_MULT: 0.9,
  BREAK_STRESS: 100,
  VIRTUE_BASE_CHANCE: 0.2, // virtue chance = base + Bond * per-bond (20%..70%)
  VIRTUE_CHANCE_PER_BOND: 0.005,
  STRESS_AFTER_AFFLICTION: 60,
  STRESS_AFTER_VIRTUE: 30,
  SECOND_BREAK_DAMAGE_PCT: 0.5, // of max HP, can kill
  STRESS_AFTER_SECOND_BREAK: 70,
  AFFLICTION_CURE_STRESS: 30, // cured in the garden once Stress drops below this

  // --- Permadeath & legacy ---
  LAST_EMBER_BOND: 60, // once per expedition: survive a lethal blow at 1 HP
  EMBERSTONE_TRAIN_BONUS: 1, // per stone, to training of the fallen's highest stat
  EMBERSTONE_MAX_PER_STAT: 2,
  LEGACY_EGG_INHERIT_PCT: 0.25, // of fallen's Might/Wit/Heart, rounded down, added at hatch
};

// base = stats when created at that stage. Adults also carry evolveBonus, which is what is
// actually ADDED to the baby's trained stats on evolution (base is the reference/preview block).
// Condition keys: pets, daysSinceHatch, might/wit/heart (>=), bond (>=).
export const CREATURES = [
  { id: 'flarekit_egg', name: 'Flarekit Egg', element: 'fire', stage: 'egg', base: { might: 0, wit: 0, heart: 0, hp: 10 },
    evolvesTo: [{ to: 'flarekit', conditions: { pets: 3 } }] },
  { id: 'puddlin_egg', name: 'Puddlin Egg', element: 'water', stage: 'egg', base: { might: 0, wit: 0, heart: 0, hp: 10 },
    evolvesTo: [{ to: 'puddlin', conditions: { pets: 3 } }] },
  { id: 'sproutle_egg', name: 'Sproutle Egg', element: 'leaf', stage: 'egg', base: { might: 0, wit: 0, heart: 0, hp: 10 },
    evolvesTo: [{ to: 'sproutle', conditions: { pets: 3 } }] },

  { id: 'flarekit', name: 'Flarekit', element: 'fire', stage: 'baby', base: { might: 6, wit: 4, heart: 5, hp: 30 },
    evolvesTo: [
      { to: 'blazefang', branch: 'might', conditions: { daysSinceHatch: 3, might: 20 } },
      { to: 'solwisp', branch: 'heart', conditions: { daysSinceHatch: 3, heart: 20, bond: 30 } },
    ] },
  { id: 'puddlin', name: 'Puddlin', element: 'water', stage: 'baby', base: { might: 4, wit: 6, heart: 5, hp: 34 },
    evolvesTo: [
      { to: 'tidalknight', branch: 'might', conditions: { daysSinceHatch: 3, might: 20 } },
      { to: 'mistmuse', branch: 'wit', conditions: { daysSinceHatch: 3, wit: 20, bond: 30 } },
    ] },
  { id: 'sproutle', name: 'Sproutle', element: 'leaf', stage: 'baby', base: { might: 5, wit: 5, heart: 4, hp: 38 },
    evolvesTo: [
      { to: 'thornback', branch: 'might', conditions: { daysSinceHatch: 3, might: 20 } },
      { to: 'bloomseer', branch: 'wit', conditions: { daysSinceHatch: 3, wit: 20, bond: 30 } },
    ] },

  { id: 'blazefang', name: 'Blazefang', element: 'fire', stage: 'adult', branch: 'might',
    base: { might: 26, wit: 6, heart: 7, hp: 60 }, evolveBonus: { might: 6, wit: 2, heart: 2, hp: 30 }, evolvesTo: [] },
  { id: 'solwisp', name: 'Solwisp', element: 'fire', stage: 'adult', branch: 'heart',
    base: { might: 8, wit: 6, heart: 26, hp: 58 }, evolveBonus: { might: 2, wit: 2, heart: 6, hp: 28 }, evolvesTo: [] },
  { id: 'tidalknight', name: 'Tidalknight', element: 'water', stage: 'adult', branch: 'might',
    base: { might: 26, wit: 8, heart: 7, hp: 64 }, evolveBonus: { might: 6, wit: 2, heart: 2, hp: 30 }, evolvesTo: [] },
  { id: 'mistmuse', name: 'Mistmuse', element: 'water', stage: 'adult', branch: 'wit',
    base: { might: 6, wit: 26, heart: 7, hp: 58 }, evolveBonus: { might: 2, wit: 6, heart: 2, hp: 24 }, evolvesTo: [] },
  { id: 'thornback', name: 'Thornback', element: 'leaf', stage: 'adult', branch: 'might',
    base: { might: 26, wit: 7, heart: 6, hp: 68 }, evolveBonus: { might: 6, wit: 2, heart: 2, hp: 30 }, evolvesTo: [] },
  { id: 'bloomseer', name: 'Bloomseer', element: 'leaf', stage: 'adult', branch: 'wit',
    base: { might: 7, wit: 26, heart: 6, hp: 62 }, evolveBonus: { might: 2, wit: 6, heart: 2, hp: 24 }, evolvesTo: [] },
];

// special.wail: every `everyRounds` rounds, replaces the normal attack with a hit on ALL
// party members for damageMult x normal damage and +stress each.
export const ENEMIES = [
  { id: 'gloomlet', name: 'Gloomlet', element: 'shadow', tier: 'common', sprite: 'gloomlet', spriteScale: 1,
    stats: { might: 9, wit: 5, heart: 4, hp: 40 }, scalesWithFloor: true },
  { id: 'dire_gloomlet', name: 'Dire Gloomlet', element: 'shadow', tier: 'elite', sprite: 'gloomlet', spriteScale: 1.4,
    stats: { might: 14, wit: 8, heart: 8, hp: 90 }, scalesWithFloor: true },
  { id: 'hollow_warden', name: 'Hollow Warden', element: 'shadow', tier: 'boss', sprite: 'hollow_warden', spriteScale: 1,
    stats: { might: 20, wit: 10, heart: 12, hp: 420 }, scalesWithFloor: false,
    special: { id: 'wail', name: 'Hollow Wail', everyRounds: 3, target: 'all', damageMult: 0.5, stress: 8 } },
];

// cost = action points. Effects are deltas. healPct is a fraction of max HP.
// kind 'train' is blocked at Stress >= TUNING.TRAIN_REFUSE_STRESS and gets the Bond bonus.
// Eggs accept only 'pet'.
export const GARDEN_ACTIONS = [
  { id: 'pet', name: 'Pet', kind: 'care', cost: 1, maxPerCreaturePerDay: null, personality: 'cuddly',
    effects: { bond: 5, stress: -6 } },
  { id: 'feed', name: 'Feed', kind: 'care', cost: 1, maxPerCreaturePerDay: 2, personality: 'gluttonous',
    effects: { maxHp: 2, bond: 2, stress: -2 } },
  { id: 'nap', name: 'Nap', kind: 'care', cost: 1, maxPerCreaturePerDay: null, personality: 'sleepy',
    effects: { stress: -15 } },
  { id: 'spar', name: 'Spar', kind: 'train', cost: 1, maxPerCreaturePerDay: null, personality: 'fierce',
    effects: { might: 2, stress: 8 } },
  { id: 'puzzle', name: 'Puzzle', kind: 'train', cost: 1, maxPerCreaturePerDay: null, personality: 'curious',
    effects: { wit: 2, stress: 6 } },
  { id: 'sing', name: 'Sing', kind: 'train', cost: 1, maxPerCreaturePerDay: null, personality: 'cheerful',
    effects: { heart: 2, bond: 1, stress: 4 } },
];

// Personality = the action a creature has received most over its lifetime (tie: most recent).
export const PERSONALITIES = [
  { id: 'unformed', name: 'Unformed', fromAction: null, effect: {}, desc: 'No perk yet.' },
  { id: 'cuddly', name: 'Cuddly', fromAction: 'pet', effect: { stressGainMult: 0.9 }, desc: 'Stress gained -10%.' },
  { id: 'gluttonous', name: 'Gluttonous', fromAction: 'feed', effect: { maxHpMult: 1.1 }, desc: 'Max HP +10%.' },
  { id: 'sleepy', name: 'Sleepy', fromAction: 'nap', effect: { restHealBonusPct: 0.1 }, desc: 'Heals +10% max HP more at rest nodes.' },
  { id: 'fierce', name: 'Fierce', fromAction: 'spar', effect: { damageMult: 1.1 }, desc: 'Damage dealt +10%.' },
  { id: 'curious', name: 'Curious', fromAction: 'puzzle', effect: { critBonus: 0.05 }, desc: 'Crit chance +5%.' },
  { id: 'cheerful', name: 'Cheerful', fromAction: 'sing', effect: { mendMult: 1.5 }, desc: 'Mend healing +50%.' },
];

export const BOONS = [
  { id: 'cinder_charm', name: 'Cinder Charm', effect: { elementDamageMult: { fire: 1.2 } }, desc: 'Fire allies deal +20% damage.' },
  { id: 'dew_charm', name: 'Dew Charm', effect: { elementDamageMult: { water: 1.2 } }, desc: 'Water allies deal +20% damage.' },
  { id: 'thorn_charm', name: 'Thorn Charm', effect: { elementDamageMult: { leaf: 1.2 } }, desc: 'Leaf allies deal +20% damage.' },
  { id: 'hearthstone', name: 'Hearthstone', effect: { maxHpMult: 1.15 }, desc: 'Party max HP +15% (heals the amount gained).' },
  { id: 'calm_bell', name: 'Calm Bell', effect: { stressGainMult: 0.75 }, desc: 'Party stress gained -25%.' },
  { id: 'second_cheer', name: 'Second Cheer', effect: { extraCheers: 1 }, desc: '+1 Cheer per fight.' },
  { id: 'keen_eye', name: 'Keen Eye', effect: { critBonus: 0.1 }, desc: 'Party crit chance +10%.' },
  { id: 'soft_moss', name: 'Soft Moss', effect: { restHealBonusPct: 0.2, restStressBonus: -10 }, desc: 'Rest nodes heal +20% max HP more and remove 10 more stress.' },
  { id: 'mote_magnet', name: 'Mote Magnet', effect: { moteMult: 1.5 }, desc: '+50% Motes from fights (rounded up).' },
  { id: 'wardlight', name: 'Wardlight', effect: { negateFirstHitPerFight: true }, desc: 'The first hit each ally takes in a fight deals 0 damage.' },
];

export const EVENTS = [
  { id: 'whispering_well', name: 'Whispering Well', effect: { boonPick: true }, desc: 'Pick 1 of 3 boons.' },
  { id: 'lost_lantern', name: 'Lost Lantern', effect: { target: 'lowestBond', bond: 10, stress: -10 }, desc: 'Your lowest-Bond creature gains +10 Bond and -10 stress.' },
  { id: 'gloom_fog', name: 'Gloom Fog', effect: { target: 'party', stress: 12, motes: 6 }, desc: 'Whole party +12 stress; gain 6 Motes.' },
];

// Rolled at Stress 100. Lasts the rest of the expedition; afflictions persist into the garden
// until Stress < TUNING.AFFLICTION_CURE_STRESS.
export const AFFLICTIONS = [
  { id: 'fearful', name: 'Fearful', effect: { skipTurnChance: 0.25 }, desc: '25% chance to skip its turn.' },
  { id: 'reckless', name: 'Reckless', effect: { damageMult: 1.25, damageTakenMult: 1.25 }, desc: 'Deals +25% damage, takes +25% damage.' },
  { id: 'sullen', name: 'Sullen', effect: { ignoresCheer: true, ignoresMend: true }, desc: 'Gets nothing from Cheer and cannot be Mended.' },
  { id: 'spiteful', name: 'Spiteful', effect: { hitAllyChance: 0.2, allyHitDamageMult: 0.5, allyStress: 3 }, desc: '20% chance to hit a random ally for 50% damage; every other ally +3 stress.' },
];

export const VIRTUES = [
  { id: 'stalwart', name: 'Stalwart', effect: { damageTakenMult: 0.7 }, desc: 'Takes -30% damage.' },
  { id: 'radiant', name: 'Radiant', effect: { allyStressPerRound: -4 }, desc: 'Each round start: every other ally -4 stress.' },
  { id: 'focused', name: 'Focused', effect: { critBonus: 0.25 }, desc: 'Crit chance +25% (ignores the crit cap).' },
  { id: 'devoted', name: 'Devoted', effect: { mendMult: 2, surviveLethalOnce: true }, desc: 'Mend healing x2; survives one lethal blow at 1 HP.' },
];
