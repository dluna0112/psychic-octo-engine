// Canon Fodder: static game data (genres, skills, species). No logic here.
// Browser: window.CFData. Node: module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CFData = factory();
})(this, function () {
  const GENRES = {
    action:  { name: 'Action',  icon: '💥', beats: 'horror',  stat: 'atk', color: '#ff7a45' },
    horror:  { name: 'Horror',  icon: '🩸', beats: 'comedy',  stat: 'spd', color: '#c44dff' },
    comedy:  { name: 'Comedy',  icon: '🎭', beats: 'scifi',   stat: 'lck', color: '#ffd23f' },
    scifi:   { name: 'Sci-Fi',  icon: '🛸', beats: 'fantasy', stat: 'def', color: '#3fd0ff' },
    fantasy: { name: 'Fantasy', icon: '🔮', beats: 'action',  stat: 'hp',  color: '#5fe08a' },
  };

  const TRAININGS = {
    atk: { name: 'Training Montage',     genre: 'action',  side: 'off' },
    spd: { name: 'Run From The Killer',  genre: 'horror',  side: 'off' },
    lck: { name: 'Improv Night',         genre: 'comedy',  side: 'off' },
    def: { name: 'Shield Calibration',   genre: 'scifi',   side: 'def' },
    hp:  { name: 'Side Quest',           genre: 'fantasy', side: 'def' },
  };

  // kind: atk | aoe | heal | healall | buff | teambuff | passive
  // tier 1 = can appear on tapes and starter eggs. tier 2 = evolution-only
  // (but still inheritable through breeding).
  const SKILLS = {
    bonk:       { name: 'Bonk', kind: 'atk', genre: null, pow: 1, cd: 0, tier: 0, desc: 'A basic bonk. Always available.' },

    montage:    { name: 'Training Montage', kind: 'buff', genre: 'action', cd: 4, tier: 1, buff: { stat: 'atk', mult: 1.4, turns: 3 }, desc: 'Cue the music: +40% ATK for 3 turns.' },
    explosion:  { name: 'Walk Away From Explosion', kind: 'atk', genre: 'action', pow: 1.7, cd: 2, tier: 1, desc: 'Heavy Action hit. Does not look back.' },
    bullettime: { name: 'Slow-Mo Dodge', kind: 'atk', genre: 'action', pow: 1.2, cd: 2, tier: 1, selfbuff: { stat: 'spd', mult: 1.35, turns: 3 }, desc: 'Action hit, then +35% SPD for 3 turns.' },
    over9000:   { name: 'Over 9000-ish', kind: 'atk', genre: 'action', pow: 2.5, cd: 4, tier: 2, desc: 'Enormous Action hit. The scouter breaks.' },

    jumpscare:  { name: 'Jump Scare', kind: 'atk', genre: 'horror', pow: 1.25, cd: 2, tier: 1, stun: 0.35, desc: 'Horror hit with a 35% chance to stun.' },
    split:      { name: "Let's Split Up", kind: 'aoe', genre: 'horror', pow: 0.8, cd: 3, tier: 1, desc: 'Hits every enemy. A terrible idea, for them.' },
    frombelow:  { name: 'It Came From Below', kind: 'atk', genre: 'horror', pow: 1.8, cd: 3, tier: 1, desc: 'Heavy Horror hit.' },
    twist:      { name: 'Twist Ending', kind: 'atk', genre: 'horror', pow: 2.0, cd: 4, tier: 2, pierce: true, desc: 'Big Horror hit that ignores DEF. Nobody saw it coming.' },

    pewpew:     { name: 'Pew Pew', kind: 'atk', genre: 'scifi', pow: 1.4, cd: 1, tier: 1, desc: 'Reliable Sci-Fi laser fire.' },
    polarity:   { name: 'Reverse the Polarity', kind: 'atk', genre: 'scifi', pow: 0.9, cd: 3, tier: 1, debuff: { stat: 'def', mult: 0.65, turns: 3 }, desc: 'Sci-Fi hit that cuts DEF by 35% for 3 turns.' },
    turnoff:    { name: 'Off And On Again', kind: 'atk', genre: 'scifi', pow: 0.6, cd: 4, tier: 1, stun: 0.7, desc: 'Weak hit with a 70% chance to stun.' },
    cannon:     { name: 'Orbital Friendship Cannon', kind: 'aoe', genre: 'scifi', pow: 1.3, cd: 4, tier: 2, desc: 'Huge Sci-Fi blast on every enemy.' },

    rollinit:   { name: 'Roll For Initiative', kind: 'atk', genre: 'fantasy', cd: 1, tier: 1, random: [0.4, 2.6], desc: 'Fantasy hit with wildly random power. Natural 20s happen.' },
    notpass:    { name: 'None Shall Pass-ta', kind: 'teambuff', genre: 'fantasy', cd: 5, tier: 1, buff: { stat: 'def', mult: 1.4, turns: 3 }, desc: 'Whole team gets +40% DEF for 3 turns.' },
    potion:     { name: 'Potion (Probably Healing)', kind: 'heal', genre: 'fantasy', pow: 0.35, cd: 3, tier: 1, desc: 'Heals the weakest ally for 35% of max HP.' },
    fireball:   { name: 'Fireball, Obviously', kind: 'aoe', genre: 'fantasy', pow: 0.95, cd: 3, tier: 1, desc: 'Fantasy damage to every enemy.' },
    deus:       { name: 'Deus Ex Machina', kind: 'heal', genre: 'fantasy', pow: 1, cd: 6, tier: 2, desc: 'Fully heals the weakest ally. The writers ran out of time.' },

    pie:        { name: 'Pie To The Face', kind: 'atk', genre: 'comedy', pow: 1.2, cd: 2, tier: 1, debuff: { stat: 'atk', mult: 0.7, turns: 3 }, desc: 'Comedy hit that cuts ATK by 30% for 3 turns.' },
    laughtrack: { name: 'Laugh Track', kind: 'healall', genre: 'comedy', pow: 0.16, cd: 4, tier: 1, desc: 'Heals the whole team for 16% of max HP.' },
    rule3:      { name: 'Rule Of Three', kind: 'atk', genre: 'comedy', pow: 0.6, hits: 3, cd: 2, tier: 1, desc: 'Three Comedy hits. The third one always lands best.' },
    spittake:   { name: 'Spit Take', kind: 'atk', genre: 'comedy', pow: 1.5, cd: 2, tier: 1, desc: 'Solid Comedy hit.' },
    roast:      { name: 'Roast Battle', kind: 'aoe', genre: 'comedy', pow: 1.0, cd: 4, tier: 2, debuff: { stat: 'atk', mult: 0.75, turns: 2 }, desc: 'Hits every enemy and cuts their ATK by 25%.' },

    finalcut:   { name: 'The Final Cut', kind: 'atk', genre: null, pow: 1.15, hits: 2, cd: 3, tier: 2, pierce: true, desc: 'Two hits that ignore DEF.' },
    stonks:     { name: 'To The Moon', kind: 'atk', genre: 'comedy', cd: 1, tier: 2, random: [0.2, 3.6], desc: 'Absurdly random power. Diamond hands required.' },

    plotarmor:  { name: 'Plot Armor', kind: 'passive', tier: 1, desc: 'Passive: survives one lethal hit per battle at 1 HP.' },
    mce:        { name: 'Main Character Energy', kind: 'passive', tier: 1, desc: 'Passive: +20% crit chance.' },
    postcredits:{ name: 'Post-Credits Scene', kind: 'passive', tier: 1, desc: 'Passive: once per battle, 60% chance to come back at 30% HP.' },
    ensemble:   { name: 'Ensemble Cast', kind: 'passive', tier: 1, desc: 'Passive: +10% damage per other living ally.' },
    underdog:   { name: 'Underdog Story', kind: 'passive', tier: 1, desc: 'Passive: +45% damage while under 40% HP.' },
    acclaimed:  { name: 'Critically Acclaimed', kind: 'passive', tier: 1, desc: 'Passive: crits deal 2.5x instead of 1.75x.' },
    speedrun:   { name: 'Speedrun Strats', kind: 'passive', tier: 1, desc: 'Passive: starts every battle ready to act.' },
    method:     { name: 'Method Acting', kind: 'passive', tier: 1, desc: 'Passive: heals for 25% of damage dealt.' },
  };

  // growth weights are multiplied by the per-stage base in logic.js
  const g = (hp, atk, def, spd, lck) => ({ hp, atk, def, spd, lck });
  const SPECIES = {
    // Stage 0: Extras
    cameo:    { name: 'Cameo',    emoji: '🐣', stage: 0, genre: null, growth: g(1, 1, 1, 1, 1), blurb: 'Blink and you miss it.' },
    stuntlet: { name: 'Stuntlet', emoji: '🐥', stage: 0, genre: null, growth: g(0.9, 1.2, 0.9, 1.1, 0.9), blurb: 'Does its own falls.' },
    blooper:  { name: 'Blooper',  emoji: '🫧', stage: 0, genre: null, growth: g(1.1, 0.9, 1, 0.9, 1.3), blurb: 'Only seen in the outtakes.' },

    // Stage 1: Sidekicks (by top genre affinity)
    henchpup:  { name: 'Henchpup',  emoji: '🐕', stage: 1, genre: 'action',  sig: 'montage',   growth: g(1, 1.3, 0.9, 1, 0.8), blurb: 'Henchman number three. Good boy.' },
    creepling: { name: 'Creepling', emoji: '🕷️', stage: 1, genre: 'horror',  sig: 'jumpscare', growth: g(0.9, 1.1, 0.8, 1.3, 0.9), blurb: 'Lives in the basement nobody checks.' },
    beepboop:  { name: 'Beepboop',  emoji: '🤖', stage: 1, genre: 'scifi',   sig: 'pewpew',    growth: g(1, 1, 1.3, 0.9, 0.8), blurb: 'Comic-relief droid with a tragic backstory.' },
    squireel:  { name: 'Squireel',  emoji: '🐿️', stage: 1, genre: 'fantasy', sig: 'rollinit',  growth: g(1.3, 1, 1, 0.9, 0.9), blurb: 'Carries the hero\'s nuts. Acorns. The acorns.' },
    punchline: { name: 'Punchline', emoji: '🤡', stage: 1, genre: 'comedy',  sig: 'pie',       growth: g(1, 1, 0.8, 1, 1.4), blurb: 'Waits three scenes for the callback.' },

    // Stage 2: Leads (offense vs defense training)
    explodile:     { name: 'Explodile',     emoji: '🐊', stage: 2, genre: 'action',  branch: 'off', sig: 'explosion',   growth: g(0.9, 1.5, 0.8, 1.1, 0.8), blurb: 'Budget: 90% pyrotechnics.' },
    sequelhorn:    { name: 'Sequelhorn',    emoji: '🦏', stage: 2, genre: 'action',  branch: 'def', sig: 'plotarmor',   growth: g(1.3, 1.1, 1.3, 0.7, 0.7), blurb: 'Keeps coming back. Bigger each time.' },
    jumpscarab:    { name: 'Jumpscarab',    emoji: '🪲', stage: 2, genre: 'horror',  branch: 'off', sig: 'frombelow',   growth: g(0.8, 1.3, 0.7, 1.5, 0.9), blurb: 'It was the cat. Then it was not the cat.' },
    finalghoul:    { name: 'Finalghoul',    emoji: '👻', stage: 2, genre: 'horror',  branch: 'def', sig: 'postcredits', growth: g(1.3, 0.9, 1.1, 1.1, 0.9), blurb: 'Definitely dead this time. Probably.' },
    laserraptor:   { name: 'Laserraptor',   emoji: '🦖', stage: 2, genre: 'scifi',   branch: 'off', sig: 'polarity',    growth: g(0.9, 1.4, 1, 1.1, 0.8), blurb: 'Clever girl. With lasers.' },
    warpwhale:     { name: 'Warp Whale',    emoji: '🐋', stage: 2, genre: 'scifi',   branch: 'def', sig: 'turnoff',     growth: g(1.4, 0.8, 1.4, 0.7, 0.8), blurb: 'Boldly drifts where no whale has drifted.' },
    prophesquid:   { name: 'Prophesquid',   emoji: '🦑', stage: 2, genre: 'fantasy', branch: 'off', sig: 'fireball',    growth: g(1, 1.4, 0.8, 1, 1), blurb: 'The chosen one. Has eight chosen arms.' },
    tavernturtle:  { name: 'Tavernturtle',  emoji: '🐢', stage: 2, genre: 'fantasy', branch: 'def', sig: 'notpass',     growth: g(1.5, 0.8, 1.4, 0.6, 0.9), blurb: 'Every quest starts on its back.' },
    sitcondor:     { name: 'Sitcondor',     emoji: '🦅', stage: 2, genre: 'comedy',  branch: 'off', sig: 'rule3',       growth: g(0.9, 1.2, 0.8, 1.2, 1.4), blurb: 'Filmed before a live studio audience.' },
    laughtrackoon: { name: 'Laughtrackoon', emoji: '🦝', stage: 2, genre: 'comedy',  branch: 'def', sig: 'laughtrack',  growth: g(1.3, 0.9, 1.1, 0.8, 1.4), blurb: 'Laughs at its own jokes so you do not have to.' },

    // Stage 3: Icons
    blockbustodon:  { name: 'Blockbustodon',     emoji: '🦣', stage: 3, genre: 'action',  from: 'explodile',     sig: 'over9000', growth: g(1, 1.6, 0.9, 1.1, 0.8), blurb: 'Opening weekend: everything.' },
    franchizilla:   { name: 'Franchizilla',      emoji: '🦕', stage: 3, genre: 'action',  from: 'sequelhorn',    sig: 'ensemble', growth: g(1.5, 1.2, 1.4, 0.7, 0.7), blurb: 'Twelve films, three reboots, one cinematic universe.' },
    nightmaremoth:  { name: 'Nightmaremoth',     emoji: '🦇', stage: 3, genre: 'horror',  from: 'jumpscarab',    sig: 'twist',    growth: g(0.9, 1.4, 0.7, 1.6, 1), blurb: 'It was in the house the whole time.' },
    finalgargoyle:  { name: 'Final Girlgoyle',   emoji: '🗿', stage: 3, genre: 'horror',  from: 'finalghoul',    sig: 'underdog', growth: g(1.4, 1.1, 1.2, 1.1, 1), blurb: 'Last one standing. Every single time.' },
    mecharex:       { name: 'Mecha Rex Machina', emoji: '🦾', stage: 3, genre: 'scifi',   from: 'laserraptor',   sig: 'cannon',   growth: g(1, 1.5, 1.1, 1.1, 0.8), blurb: 'Life, uh, found a way to add rockets.' },
    deathstarfish:  { name: 'Deathstarfish',     emoji: '🌟', stage: 3, genre: 'scifi',   from: 'warpwhale',     sig: 'acclaimed',growth: g(1.5, 0.9, 1.5, 0.7, 1), blurb: 'That is no moon. It is an echinoderm.' },
    lordofwings:    { name: 'Lord of the Wings', emoji: '🐉', stage: 3, genre: 'fantasy', from: 'prophesquid',   sig: 'mce',      growth: g(1.1, 1.5, 0.9, 1, 1.1), blurb: 'One wing to rule them all. Comes with dip.' },
    dungeonmastiff: { name: 'Dungeon Mastiff',   emoji: '🐺', stage: 3, genre: 'fantasy', from: 'tavernturtle',  sig: 'deus',     growth: g(1.6, 0.9, 1.4, 0.7, 0.9), blurb: 'Rocks fall. Everyone else dies.' },
    roastrooster:   { name: 'Roastmaster Rooster', emoji: '🐓', stage: 3, genre: 'comedy', from: 'sitcondor',    sig: 'roast',    growth: g(0.9, 1.3, 0.8, 1.3, 1.5), blurb: 'Wakes you up, then tears you down.' },
    slapsloth:      { name: 'Slapstick Sloth',   emoji: '🦥', stage: 3, genre: 'comedy',  from: 'laughtrackoon', sig: 'method',   growth: g(1.4, 1, 1.2, 0.7, 1.5), blurb: 'The pratfall takes forty minutes. Worth it.' },

    // Secret Icons
    directorscut:   { name: "Director's Cut", emoji: '🎬', stage: 3, genre: 'any', secret: 'Reach Icon as a 3rd-generation (or later) Tropeling.', sig: 'finalcut', growth: g(1.3, 1.4, 1.2, 1.2, 1.2), blurb: 'Four hours long. Better this way.' },
    memeoth:        { name: 'Dank Memeoth',   emoji: '🐸', stage: 3, genre: 'comedy', secret: 'Reach Icon after losing 3 or more battles.', sig: 'stonks', growth: g(1.2, 1.2, 0.9, 1.1, 1.8), blurb: 'Failed so hard it became immortal.' },
  };

  const RIVALS = ['The Rebooted', 'Straight-To-Video Squad', 'The Filler Arc', 'Off-Brand Heroes', 'Jump Cut Gang', 'Canon Violators', 'The Unskippable Cutscenes', 'Pilot Season Rejects', 'The Cliffhangers', 'Deleted Scenes', 'The Spoilers', 'Mid-Season Replacements'];
  const BOSSES = [
    { name: 'The Focus Group', line: '"We tested you with audiences. They want a talking dog."' },
    { name: "The Critics' Circle", line: '"Two stars. Derivative. We will be watching all of it."' },
    { name: 'The Network Executives', line: '"Great show, love it. We are cancelling it."' },
  ];

  return { GENRES, TRAININGS, SKILLS, SPECIES, RIVALS, BOSSES };
});
