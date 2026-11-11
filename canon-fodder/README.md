# Canon Fodder

A roguelike monster-raising game about pop culture tropes. You run a ranch of
"Tropelings", train and breed them, and send them into automatic battles. Get
through three acts before the network cancels your show.

Open `index.html` in a browser. There is no build step and no dependencies.
Progress saves in the browser's local storage.

## What is in it

- **Ranch days.** Each Tropeling gets one action a day: train a stat, rest, or
  breed. Training builds fatigue, and tired Tropelings flub training and fight
  worse.
- **Auto-battles.** Up to 3v3. Units act by speed and pick their own skills.
  Five genres form a wheel (Action › Horror › Comedy › Sci-Fi › Fantasy ›
  Action), each dealing ×1.5 to the next.
- **Evolution.** Extra → Sidekick → Lead → Icon at levels 4, 10 and 18. The
  genre trained most picks the Sidekick, offense vs defense training picks the
  Lead, and two secret Icons have their own conditions. 30 species in all.
- **Breeding.** Two Sidekicks or better make an egg. It takes each gene
  (growth rate) from one parent with a chance to mutate, one skill from each
  parent, and a slice of their stats.
- **Roguelike run.** Each day offers a choice of battles, elite battles,
  shops and random events. Day 6 of each act is a boss. Three lives.
- **Legacy.** When a run ends, the best Tropeling enters the Hall of Reruns,
  and its descendant can join the next run. Winning unlocks a harder season.

## Code

| File | Role |
|---|---|
| `data.js` | Genres, skills, species, flavor text |
| `logic.js` | All rules. Pure, seeded, state is plain JSON |
| `main.js` | Rendering and input |
| `test.js` | `node canon-fodder/test.js` (add `--balance` for a bot win rate) |
