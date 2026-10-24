# Wyrdgarden — Game Design Document (working title)

A dark, run-based descent crossed with a tender creature garden. You send a
party of raised creatures ("Sprouts") into a cursed Depths, where they can
die for good. What survives comes home to grow, evolve, and seed the next
expedition.

Inspirations, and what each one contributes:

| Source | What we take | What we change |
|---|---|---|
| **Darkest Dungeon** | Party stress, afflictions and virtues, a hamlet that is the only safe place, permadeath with memorials | Stress is shared with the garden: caring for a Sprout heals it, neglect breeds Blight |
| **Hades** | Short escape attempts, boons from patrons after each room, persistent narrative across failed runs, reasons to die and try again | Boons come from the Sprouts' own memories, not gods |
| **Chao Garden** (Sonic Adventure) | A garden you tend between runs, raising a creature through attention, play and fruit, with traits that depend on how you raised it | Care style matters more than raw stats; eggs are bred, not just hatched |
| **Digimon** | Evolution into branching forms, chosen by how the creature was raised and what it fought | Branches are mutually exclusive and keep a memory of their past forms |

## Pillars

1. **Care has consequences.** How you raise a Sprout changes what it becomes.
2. **Loss is real, and it means something.** Dead Sprouts leave memorials that
   feed the garden, so a fallen party is still a contribution.
3. **Every attempt teaches.** Each run reveals a little more of the Depths and
   of the garden's past.
4. **Short sessions, long arcs.** A run is 15–25 minutes. The garden carries
   the long story across runs.

## Core loop

```
  Garden (safe)  ──►  Choose party  ──►  Descend (rooms + boons)  ──►  Return
      ▲                                                                  │
      └──── care, breed, evolve, read memorials, unlock new Depths ◄─────┘
```

## The Garden (hub, Chao-style raising)

- **Sprouts** are the party members. Each has a Care profile with three
  axes: **Tend** (attention, feeding, rest), **Spark** (play, training,
  challenge), and **Hush** (quiet time, shelter, restraint). The dominant
  axis shapes evolution.
- **Actions** (one per Sprout per day, up to a daily cap):
  - *Tend*: feed fruit, rest in the shade (reduces stress, raises Tend).
  - *Spark*: race in the Garden course, spar with a training dummy (raises
    Spark and a stat).
  - *Hush*: sit in the still pond, read a memorial (raises Hush, lowers stress
    faster, slowly reveals lore).
- **Breeding**: two adult Sprouts can grow an egg in the Hatchery. The egg
  inherits one stat from each parent and one trait, chosen at random from the
  parents' traits.
- **Blight**: neglect and high stress seed Blight in the garden. Blight lowers
  fruit yield and makes new eggs more likely to carry a flaw trait. It is
  cleared by tending the affected Sprouts or by returning with a Blight Seed
  from the Depths.

## Evolution (Digimon-style branches)

Stages: **Seedling → Sapling → Bloom → Ascendant**.

- Each stage requires XP from battle and an affection threshold.
- At Sapling and Bloom, the Sprout chooses a branch based on its dominant Care
  axis. Example branches:
  - Tend-dominant → **Mosswarden** (defensive, heals the party between rooms)
  - Spark-dominant → **Thornrunner** (fast, crits, high risk stress)
  - Hush-dominant → **Veilsong** (buffs, lowers enemy initiative, slow to start)
- Evolution keeps a **Lineage** record: which forms came before, and which
  battles shaped them. A Lineage also changes the final form's art and
  dialogue, so no two Sprouts end up looking identical.

## The Depths (expedition, Hades-style)

- A run is a descent through **four Depths**, each with about 8 rooms and a
  boss. The layout of each Depth is shuffled, but the rooms follow a fixed
  pattern: combat, shrine, treasure, rest, and the boss.
- After each cleared room, one of three **Boons** is offered. Boons come from
  a Sprout's memory of a battle or a loved one, so the same Sprout offers
  different boons on different days. Examples:
  - *Remembered Warmth*: heal 20% after each combat.
  - *Stubborn Root*: first death in a room returns the Sprout at 1 HP.
  - *Quiet Mind*: stress gain halved in the next room.
- Death or retreat ends the run. Surviving Sprouts return with their XP and
  affection. Dead Sprouts leave a **Memorial**, which gives the garden a
  permanent bonus (for example, +1 fruit yield per Memorial in the Garden).
- Each attempt reveals a **Memory** of the Depths (a lore fragment and a new
  room type). Memories are the long narrative spine across runs.

## Combat (Darkest Dungeon meets turn-based tactics)

- A party of up to 4 Sprouts faces up to 4 enemies, placed in front and back
  rows. Front-row Sprouts take hits; back-row Sprouts are safe from melee but
  do less damage.
- Each Sprout has **HP**, **Attack**, **Guard**, **Speed**, and **Stress**
  (0–100). Initiative follows Speed.
- **Stress** rises from ally deaths, critical hits taken, and low HP.
  - At 50+: the Sprout hesitates (may skip its turn 25% of the time).
  - At 80+: an **affliction** triggers (Brittle: lower Guard; Frenzied: attacks
    anything, including allies).
  - At 100: the Sprout is **Overwhelmed** for one turn and gains a random
    **virtue** when the room ends (Resolute: stress capped at 60 for the rest
    of the run).
- Stress is shared with the garden: a Sprout that returns with high stress
  needs a Tend action before its next run, or it starts the next run already
  Brittle.

## Tone and art direction

- Palette: deep indigo and ink-black depths, with bioluminescent flora as the
  only warm light. The garden is the one place with daylight, and it should
  feel earned.
- Sprouts are plant-and-animal hybrids drawn in a soft painterly style. Their
  evolutions get harder, more ornate silhouettes.
- Music: one melody per Sprout, layered into a gentle ambient bed in the
  garden and stripped to a single drone in the Depths.

## Scope

**Vertical slice (first milestone):**
- One Depth with 6 rooms and a boss.
- Four Sprouts, two branches (Mosswarden, Thornrunner).
- Stress, afflictions, one virtue.
- Garden with Tend and Spark actions, and Seedling → Sapling evolution.
- Memorials that persist across runs.

**Post-slice:** the other Depths, breeding, the Hush branch, and the full Memory
arc.

## Open questions

- Is the Garden a single screen, or a place you walk through?
- Should a Sprout's death be permanent by default, or should there be an
  "ascend" choice that keeps its lineage for a future egg?
- How many Sprouts is the right party size: 3 for tighter stress, or 4 for
  more choice?

## Prototype

A playable web prototype of the core loop (expedition, stress, boons,
permadeath, memorials, and the garden) lives in `prototype/`. Open
`prototype/index.html` in a browser. It has no build step and no dependencies.
