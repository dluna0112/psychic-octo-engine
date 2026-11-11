# Kindlekin — Design Doc (v1)

Raise small elemental creatures in a cosy garden, then send them into the Gloom on expeditions they may not come back from. Browser, HTML5 canvas. All numbers below live in `src/data.js` (`TUNING` unless noted) and must match it.

## 1. Core loop

```
        ┌──────────────── GARDEN (one day = 6 actions) ───────────────┐
        │  pet / feed / nap / spar / puzzle / sing                    │
        │  → stats, Bond, Stress, personality → hatch → evolve        │
        └───────┬─────────────────────────────────────────▲───────────┘
   pick 1–3     │                                         │ survivors return: Stress and
   creatures    ▼                                         │ afflictions carried home, Motes
        EXPEDITION (3 floors of nodes) ── auto-battles ───┤
        fight / elite / rest / event / boss; boons        │ the dead leave an Emberstone
        Stress climbs → affliction or virtue → death ─────┘ and a legacy Egg
```

Launching an expedition ends the garden day. Overnight: HP full, Stress −5, and any hatched creature that got 0 actions that day loses 2 Bond.

## 2. Garden

Start with three Eggs (Flarekit, Puddlin, Sproutle). **6 actions per day**, shared across the garden; every action costs 1. Spend 5 Motes for +1 action (max +3 per day).

| Action | Kind | Effect on target |
|---|---|---|
| Pet | care | Bond +5, Stress −6 (on an Egg: counts toward hatching) |
| Feed | care | Max HP +2, Bond +2, Stress −2 (max 2 per creature per day) |
| Nap | care | Stress −15 |
| Spar | train | Might +2, Stress +8 |
| Puzzle | train | Wit +2, Stress +6 |
| Sing | train | Heart +2, Bond +1, Stress +4 |

- Might/Wit/Heart cap at 40. Bond 0–100 (10 on hatching). Stress 0–100.
- Training is refused at Stress ≥ 70. At Bond ≥ 60 each training action gives +1 extra stat.
- **Personality** = the action a creature has received most in its life (min 5 actions, tie → most recent). It changes its idle animation/accessory and gives a perk: Cuddly (Pet) stress gained −10% · Gluttonous (Feed) max HP +10% · Sleepy (Nap) +10% max HP healed at rest nodes · Fierce (Spar) damage +10% · Curious (Puzzle) crit +5% · Cheerful (Sing) Mend +50%.
- **Mood** (face/pose): happy below Stress 30, uneasy 30–69, frazzled 70+.

## 3. Evolution

Egg → baby after **3 Pets**. Baby → adult is checked at dawn, once it is **3+ days since hatching**:

| Baby (element; Might/Wit/Heart/HP) | Might branch: Might ≥ 20 | Gentle branch: stat ≥ 20 **and** Bond ≥ 30 |
|---|---|---|
| Flarekit (fire; 6/4/5/30) | Blazefang | Solwisp (Heart) |
| Puddlin (water; 4/6/5/34) | Tidalknight | Mistmuse (Wit) |
| Sproutle (leaf; 5/5/4/38) | Thornback | Bloomseer (Wit) |

If both branches qualify, the higher stat wins; a tie goes to Might. Evolution adds to trained stats: Might branch +6 Might, +2 to the other two, +30 max HP; Wit branch +6 Wit, +2/+2, +24 max HP; Heart branch (Solwisp) +6 Heart, +2/+2, +28 max HP. Adults keep training up to the cap.

## 4. Battle (automatic)

Up to 3 creatures vs up to 3 enemies. Each round everyone acts once in Wit order (ties: player first) and hits the front-most living opponent.

```
damage = max(1, round((4 + Might) × element × crit × modifiers) − floor(targetHeart / 4))
```

- **Element:** fire > leaf > water > fire. Strong ×1.5, weak ×0.75. Shadow is neutral.
- **Crit:** chance 5% + 1% per Wit (cap 40%), ×1.5 damage.
- **Mend:** at round end each creature heals the most-hurt ally for floor(Heart / 5).
- **Cheer** (the one player input, 1 per fight): for one round the party deals ×(1.25 + average Bond / 200) damage — ×1.25 at Bond 0, ×1.75 at Bond 100 — and each member loses 5 Stress.
- After 20 rounds the enemies flee: no reward, party +10 Stress.

| Enemy (`ENEMIES`) | Might/Wit/Heart/HP | Notes |
|---|---|---|
| Gloomlet | 9/5/4/40 | common |
| Dire Gloomlet | 14/8/8/90 | elite; Gloomlet sprite at 1.4× |
| Hollow Warden | 20/10/12/420 | boss, unscaled. Hollow Wail every 3rd round: hits all for 50% damage, +8 Stress each |

Gloomlet and Dire Gloomlet HP and Might scale ×1.0 / ×1.25 / ×1.5 on floors 1 / 2 / 3.

## 5. Expedition

**3 floors, 5 steps each.** Step 1 is a fight. Steps 2–4 offer 2 nodes to choose from, rolled fight 50 / event 20 / rest 15 / elite 15, with at least one rest on step 4. Step 5 is an elite gate on floors 1–2 and the Hollow Warden on floor 3. Clearing a floor heals 20% max HP.

- **Fight:** 2 Gloomlets on floor 1, 3 on floors 2–3. Reward 2 Motes.
- **Elite:** Dire Gloomlet plus 0 / 1 / 2 Gloomlets by floor. Reward 5 Motes. Boss: 15 Motes.
- **Rest:** heal 40% max HP, Stress −25.
- **Event** (`EVENTS`): Whispering Well (boon pick) · Lost Lantern (lowest-Bond creature +10 Bond, −10 Stress) · Gloom Fog (party +12 Stress, +6 Motes).
- **Boons:** pick 1 of 3 after the first fight of each floor, after every elite, and at a Whispering Well. No duplicates in a run.

| Boon (`BOONS`) | Effect |
|---|---|
| Cinder / Dew / Thorn Charm (3 boons) | Fire / water / leaf allies deal +20% damage |
| Hearthstone | Party max HP +15% (heals the amount gained) |
| Calm Bell | Party stress gained −25% |
| Second Cheer | +1 Cheer per fight |
| Keen Eye | Party crit chance +10% |
| Soft Moss | Rest nodes heal +20% max HP more and remove 10 more Stress |
| Mote Magnet | +50% Motes from fights |
| Wardlight | The first hit each ally takes in a fight deals 0 damage |

The run ends when the boss falls or the whole party is dead.

## 6. Stress

**Sources:** entering a fight +3 / elite +6 / boss +10 · being hit +2 · being crit +6 · ending a round below 25% HP +3 · an ally dying +15 · winning a fight −4.

**Thresholds:** at 50+ the creature is Uneasy (damage dealt −10%). At 100 it hits its **breaking point**: virtue chance = 20% + 0.5% per Bond (20–70%), otherwise an affliction. Stress then resets to 30 (virtue) or 60 (affliction). Breaking again in the same expedition costs 50% max HP (can kill) and resets Stress to 70. Both last the expedition; an affliction also follows the creature home until its Stress is below 30.

| Affliction | Effect | Virtue | Effect |
|---|---|---|---|
| Fearful | 25% chance to skip its turn | Stalwart | Takes −30% damage |
| Reckless | Deals +25%, takes +25% damage | Radiant | Each round: other allies −4 Stress |
| Sullen | Gets nothing from Cheer, cannot be Mended | Focused | Crit chance +25% |
| Spiteful | 20% chance to hit an ally for 50% damage; other allies +3 Stress | Devoted | Mend ×2; survives one lethal blow at 1 HP |

## 7. Permadeath and legacy

A creature at 0 HP is dead for good. One mercy: **Last Ember** — at Bond ≥ 60, the first lethal blow of an expedition leaves it at 1 HP. Each death leaves two things in the garden:

- an **Emberstone** (a small named memorial): every training action for the fallen's highest stat gives +1, to every creature, forever (max 2 stones count per stat);
- a **legacy Egg** of the same species, which hatches with 25% of the fallen's Might, Wit and Heart added to its base stats.

A full wipe therefore never ends the save — the garden restarts from eggs and stones.

## 8. v1 scope

**In:** the 3 lines (egg, baby, 2 adults each) · 6 garden actions, day/action budget, personality and mood visuals · one 3-floor expedition with the 3 enemies, 3 events, 10 boons · auto-battle with Cheer · stress, 4 afflictions, 4 virtues · permadeath, Emberstones, legacy Eggs · Motes · local save.

**Out (later):** more species, elements or evolution stages · equipment and items · a garden tournament/cup mode · garden building and decoration · mid-run retreat · player-chosen targets or skills · stacking boons · sound beyond basic effects · meta-progression beyond Emberstones · multiplayer, accounts, monetisation.
