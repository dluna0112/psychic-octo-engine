// Seeded RNG shared by all game logic, so runs and tests are reproducible.
// mulberry32: small, fast, good enough for games. State is a single uint32.

export function createRng(seed = Date.now()) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,                                            // float in [0, 1)
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted: (weights) => { // { key: weight } -> key
      const entries = Object.entries(weights); let r = next() * entries.reduce((n, [, w]) => n + w, 0);
      for (const [k, w] of entries) { if ((r -= w) < 0) return k; } return entries[entries.length - 1][0];
    },
    getState: () => s,
    setState: (v) => { s = v >>> 0; },
  };
}
