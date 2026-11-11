# Kindlekin

Raise small elemental creatures in a cosy garden, then send them into the Gloom on roguelike
expeditions. Battles play out automatically; you pick the path, the boons and the moment to Cheer.
Stress builds, minds break, and the dead stay dead, leaving an Emberstone and a legacy egg behind.

## Run it locally

No build step and no dependencies. Serve the folder with any static server:

```sh
cd kindlekin && python3 -m http.server 8000
```

Then open <http://localhost:8000>. The game saves to `localStorage`, including mid-expedition:
reload during a run and **Continue** takes you back to the map. If you reload during a battle,
that battle starts again.

## Controls

| Where | Desktop | Phone |
|---|---|---|
| Garden | Click a creature to open its care panel, then click an action (Pet, Feed, Nap, Spar, Puzzle, Sing). Click the name to rename it (max 14 chars, Enter saves, Esc cancels). | Same, with taps. The care panel opens as a bottom sheet. |
| Garden HUD | **End Day** (moon), **+** buys an extra action for 5 Motes, **Expedition** opens the party picker, the stone button opens the memorial. | Same |
| Expedition map | Click a glowing node to choose the next step. | Tap |
| Battle | **Cheer** (once per fight) boosts party damage for a round and calms everyone. **1×/2×** toggles battle speed. Boon icons show their effect. | Tap |
| Everywhere | Buttons are keyboard reachable: Tab / Shift+Tab move focus, Enter or Space activates, Esc closes a garden panel or dialog. Picking a creature in the garden still needs a click or tap. | |

## Tests

```sh
cd kindlekin
node --test 'tests/*.test.js'          # logic tests: state, battle, run (node:test)
```

### End-to-end playthrough

`tests/e2e/playthrough.cjs` plays the game through the real UI with Playwright: a new game, hatching
all eggs, four garden days, a rename, the memorial, the party picker, a whole expedition (2× speed,
Cheer, boons, map choices), a reload mid-run to check the run resumes, the results card, and a
reload to check **Continue** restores the save. It runs at desktop 1280×800 and phone 390×844
(touch), and exits non-zero on any console error, page error, failed request or a screen stuck for
20 s. Layout problems (horizontal scroll, clipped buttons, tap targets under 44 px, no focus ring)
are printed as `LAYOUT` lines.

It needs Playwright with Chromium available to `require('playwright')`:

```sh
cd kindlekin && python3 -m http.server 8000 &
node tests/e2e/playthrough.cjs http://localhost:8000
# options: --only=desktop|phone  --shots=docs/screens/qa  (save screenshots)  --strict-layout  (fail on LAYOUT lines)
```

## File map

```
index.html                 page shell: world <canvas> + HTML overlay (#ui)
style.css                  overlay UI styles (HUD, panels, modals, garden, title)
src/main.js                boot, canvas loop, resize, screen router (app.go / save / toast)
src/data.js                every tuning number (DESIGN.md is the source of truth)
src/rng.js                 seeded RNG used by all game logic
src/state.js               save data, garden actions, hatch / evolve, personality, death and legacy
src/battle.js              pure auto-battle simulation (events out, no DOM)
src/run.js                 expedition rules: map, nodes, boons, events, stress, mid-run snapshots
src/sprites.js             creature and enemy art (canvas)
src/scenes.js              garden and dungeon backdrops, ground-to-screen projection
src/screens/title.js       title screen (New Game / Continue)
src/screens/garden.js      garden hub: creatures, care panel, picker, memorial, results
src/screens/expedition.js  expedition screen: map, battles, rest, events, boons, results
src/screens/exp-battle-view.js  battle renderer and formations
src/screens/exp-icons.js, expedition.css  expedition icons and styles
tests/*.test.js            node:test suites for state, battle and run
tests/e2e/playthrough.cjs  Playwright playthrough (desktop + phone)
docs/DESIGN.md             game design and numbers
docs/CONTRACT.md           module interfaces and save format
docs/screens/              screenshots (docs/screens/qa: QA pass)
art/gallery.html           sprite gallery
```
