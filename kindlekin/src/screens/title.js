// Kindlekin — title screen over the garden.
import { drawGarden, groundToScreen } from '../scenes.js';
import { drawCreature } from '../sprites.js';
import { newGame, hasSave } from '../state.js';

const CAST = [
  { id: 'flarekit', u: 0.24, v: 0.2, facing: 1, mood: 'happy' },
  { id: 'puddlin', u: 0.73, v: 0.3, facing: -1, mood: 'happy' },
  { id: 'sproutle', u: 0.5, v: 0.62, facing: 1, mood: 'neutral' },
  { id: 'egg', u: 0.62, v: 0.9, element: 'fire', seed: 1 },
  { id: 'egg', u: 0.4, v: 0.95, element: 'water', seed: 2 },
];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export default {
  enter(app) {
    const wrap = el('div', 'title-screen pass');
    const logo = el('div', 'logo', `
      <h1 class="logo-word" aria-label="Kindlekin">Kindle<span class="flame">k</span>in</h1>
      <p class="tagline">Raise little embers of hope. Send them into the Gloom.</p>`);
    const menu = el('div', 'panel title-menu');
    const saved = hasSave() && app.state;
    if (saved) {
      const s = app.state;
      const cont = el('button', 'btn btn-primary btn-lg', 'Continue');
      cont.onclick = () => app.go('garden');
      menu.append(cont);
      const meta = el('p', 'title-meta', `Day ${s.day} · ${s.creatures.length} kin · ${s.memorials.length} remembered`);
      const ng = el('button', 'btn btn-ghost', 'New Game');
      ng.onclick = () => confirmNew(app);
      menu.append(ng, meta);
    } else {
      const ng = el('button', 'btn btn-primary btn-lg', 'New Game');
      ng.onclick = () => start(app);
      menu.append(ng, el('p', 'title-meta', 'Three eggs are waiting in the garden.'));
    }
    wrap.append(logo, menu);
    app.ui.append(wrap);
    menu.querySelector('.btn')?.focus({ preventScroll: true });
  },

  draw(app, ctx, w, h, t) {
    drawGarden(ctx, w, h, t);
    const tall = h > w * 1.2; // portrait: keep the cast above the menu panel
    const placed = CAST.map((a) => ({ ...a, p: groundToScreen(tall ? a.u * 0.8 + 0.1 : a.u, tall ? 0.55 + a.v * 0.45 : a.v, w, h, 'garden') })).sort((a, b) => a.p.y - b.p.y);
    for (const a of placed) {
      drawCreature(ctx, a.id, a.p.x, a.p.y, { scale: a.p.scale * (a.id === 'egg' ? 0.9 : 1), t, facing: a.facing, mood: a.mood, element: a.element, seed: a.seed });
    }
    // soft vignette so the logo and menu read clearly
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(23,14,40,0.45)');
    g.addColorStop(0.28, 'rgba(23,14,40,0)');
    g.addColorStop(0.7, 'rgba(23,14,40,0)');
    g.addColorStop(1, 'rgba(23,14,40,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
};

function start(app) {
  app.state = newGame();
  app.save();
  app.go('garden', { fresh: true });
}

function confirmNew(app) {
  const m = el('div', 'modal-wrap');
  m.innerHTML = `
    <div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="cn-h">
      <h2 id="cn-h">Start a new garden?</h2>
      <p class="muted">Your current garden on day ${app.state.day}, its ${app.state.creatures.length} kin and every memorial stone will be gone for good.</p>
      <div class="actions-row">
        <button class="btn btn-ghost" data-a="no">Keep my garden</button>
        <button class="btn btn-danger" data-a="yes">Start over</button>
      </div>
    </div>`;
  m.querySelector('[data-a=no]').onclick = () => m.remove();
  m.querySelector('[data-a=yes]').onclick = () => start(app);
  m.addEventListener('pointerdown', (e) => { if (e.target === m) m.remove(); });
  app.ui.append(m);
  m.querySelector('[data-a=no]').focus();
}
