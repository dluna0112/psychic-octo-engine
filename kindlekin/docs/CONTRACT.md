# Kindlekin — Phase 2 team contract

Two builders work in parallel. This file is the agreement between them. If you
need something outside it, do NOT edit the other agent's files: add a
note under "Requests" at the bottom of this file and work around it.

## Tech rules (everyone)

- Plain ES modules, no build step, no npm dependencies, no external URLs.
  `kindlekin/index.html` opened through any static server must run the game.
- Rendering: one full-window `<canvas>` for the world (scenes + sprites from
  `src/scenes.js` / `src/sprites.js`), with an HTML/CSS overlay
  (`<div id="ui">`) for buttons, panels, bars and text. Do not draw UI text on
  the canvas except floating damage numbers and name tags.
- Must work on phone (390px wide, touch) and desktop. No horizontal scroll.
- All numbers come from `src/data.js`. Do not hard-code tuning values.
- All randomness goes through `src/rng.js` (`createRng(seed)`), never `Math.random`
  in logic modules.
- Logic modules (`state.js`, `battle.js`, `run.js`) import nothing from the DOM
  and are tested with `node --test kindlekin/tests/` (built-in `node:test`).
- Do not modify `data.js`, `sprites.js`, `scenes.js`, `rng.js`. If art needs a
  tweak (new mood pose, etc.), add a Request.
- Do not git commit or push. The manager does that.

## File ownership

| File | Owner |
|---|---|
| `index.html`, `style.css` | Gameplay |
| `src/main.js` (boot, canvas loop, resize, screen router) | Gameplay |
| `src/state.js` (save data, garden rules, hatch, evolve, personality) | Gameplay |
| `src/screens/title.js`, `src/screens/garden.js` | Gameplay |
| `tests/state.test.js` | Gameplay |
| `src/battle.js` (pure battle sim) | Dungeon |
| `src/run.js` (expedition rules: map, nodes, boons, events, stress, death) | Dungeon |
| `src/screens/expedition.js` (+ any `src/screens/exp-*.js` helpers, `expedition.css`) | Dungeon |
| `tests/battle.test.js`, `tests/run.test.js` | Dungeon |

## Screen interface

`src/main.js` keeps a registry and the canvas loop. A screen is a module whose
default export is:

```js
export default {
  enter(app, params) {},   // build DOM into app.ui (already emptied), set up state
  exit(app) {},            // optional cleanup (timers, listeners)
  update(app, dt) {},      // dt in seconds
  draw(app, ctx, w, h, t) {}, // draw world on canvas (CSS pixels; main.js handles DPR)
  pointer(app, ev) {},     // optional: { type: 'down'|'move'|'up', x, y } in CSS px on the canvas
};
```

`app` (created by main.js):

```js
app = {
  state,                 // the save object below (live, mutable)
  ui,                    // the overlay <div id="ui">
  canvas, ctx,
  go(name, params),      // switch screen: 'title' | 'garden' | 'expedition'
  save(),                // persist app.state to localStorage (try/catch inside)
  toast(text),           // brief message in the overlay
}
```

main.js loads screens with dynamic `import()` and shows a friendly
"not built yet" panel if a module is missing, so each builder can run the game
before the other is done.

**Garden → expedition:** `app.go('expedition', { party: [uid, uid, uid] })` (1–3 uids).
**Expedition → garden:** the expedition screen applies all results to
`app.state` (via the helpers below), calls `app.save()`, then `app.go('garden', { returned: summary })`
where `summary = { outcome: 'cleared'|'wiped', floorReached, motes, fallen: [names], hatchedLegacy: [names] }`.
The garden shows that summary once.

## Save data (owned by state.js, read/written by both)

```js
state = {
  version: 1,
  seed,                  // uint32, advanced through rng.getState()/setState()
  day: 1,
  actionsLeft,           // TUNING.ACTIONS_PER_DAY at day start
  extraBought: 0,        // extra actions bought today
  motes: 0,
  emberstones: { might: 0, wit: 0, heart: 0 },
  creatures: [Creature],
  memorials: [{ name, species, day, cause, highestStat }],
  bestFloor: 0,
  expeditions: 0,
}

Creature = {
  uid,                   // string, unique forever
  name,                  // player-facing name; default = species name
  species,               // id from CREATURES (egg ids included)
  might, wit, heart,     // current stats (0 for eggs)
  maxHp, hp,
  bond, stress,
  pets,                  // pets received as an egg (for hatching)
  hatchedDay,            // null for eggs
  actionCounts: {},      // lifetime { actionId: n }
  lastAction: null,
  todayActions: {},      // { actionId: n } reset overnight
  affliction: null,      // id from AFFLICTIONS or null
  legacy: null,          // { from: name } if hatched from a fallen creature's egg
}
```

### state.js exports the Dungeon agent may call

```js
newGame(seed?) -> state                  // three eggs: Flarekit, Puddlin, Sproutle (DESIGN.md)
loadGame() / saveGame(state)             // localStorage, safe when unavailable
getCreature(state, uid)
personalityOf(creature) -> PERSONALITIES entry
moodOf(creature) -> 'happy' | 'neutral' | 'stressed'   // for sprite opts.mood
spriteIdOf(creature) -> SPRITE_IDS entry  // eggs -> 'egg'
effectiveStats(state, creature) -> { might, wit, heart, maxHp, element, critBonus, damageMult, stressGainMult, mendMult, restHealBonusPct }
                                          // includes personality + emberstones where DESIGN.md says so
addStress(creature, amount, mult = 1)    // clamps 0..100, applies mult only to gains
recordDeath(state, uid, cause) -> { memorial, legacyEgg }  // removes creature, adds memorial,
                                          // emberstone and legacy egg exactly as DESIGN.md says
```

## Requests

(append here; one line each, with your role)
