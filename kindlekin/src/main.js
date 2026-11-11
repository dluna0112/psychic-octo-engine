// Kindlekin — boot, canvas loop, resize, screen router.
import { loadGame, saveGame } from './state.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');
const toastBox = document.getElementById('toasts');

const SCREENS = {
  title: () => import('./screens/title.js'),
  garden: () => import('./screens/garden.js'),
  expedition: () => import('./screens/expedition.js'),
};

let current = null;
let currentName = '';
let switching = 0;
let W = 0, H = 0, DPR = 1;

export const app = {
  state: loadGame(),
  ui,
  canvas,
  ctx,
  get width() { return W; },
  get height() { return H; },
  get screenName() { return currentName; },
  go,
  save() { return saveGame(app.state); },
  toast,
};
window.kindlekin = app; // handy for debugging / tests

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  el.textContent = text;
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2600);
}

function notBuilt(name, err) {
  console.warn(`[kindlekin] screen "${name}" unavailable:`, err?.message || err);
  return {
    enter(a) {
      const p = document.createElement('div');
      p.className = 'modal-wrap';
      p.innerHTML = `
        <div class="panel modal notbuilt" role="dialog" aria-labelledby="nb-h">
          <div class="nb-badge">Under construction</div>
          <h2 id="nb-h">The ${name} isn't built yet</h2>
          <p class="muted">This part of Kindlekin is still being crafted. Your creatures are safe at home.</p>
          <button class="btn btn-primary" data-act="back">Back to the garden</button>
        </div>`;
      p.querySelector('[data-act=back]').onclick = () => a.go(a.state ? 'garden' : 'title');
      a.ui.append(p);
    },
    draw(a, c, w, h, t) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#231c35'); g.addColorStop(1, '#120e1c');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    },
  };
}

async function go(name, params = {}) {
  const ticket = ++switching;
  let mod;
  try {
    const loader = SCREENS[name];
    if (!loader) throw new Error('unknown screen');
    mod = (await loader()).default;
    if (!mod || typeof mod !== 'object') throw new Error('no default export');
  } catch (err) {
    mod = notBuilt(name, err);
  }
  if (ticket !== switching) return;
  try { current?.exit?.(app); } catch (err) { console.error(err); }
  ui.innerHTML = '';
  ui.className = 'screen-' + name;
  current = mod;
  currentName = name;
  try { await mod.enter?.(app, params); } catch (err) { console.error(err); }
}

// ---------------------------------------------------------------- canvas
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (canvas.width !== Math.round(window.innerWidth * DPR) || W !== window.innerWidth || H !== window.innerHeight) resize();
  try { current?.update?.(app, dt); } catch (err) { console.error(err); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  try { current?.draw?.(app, ctx, W, H, t); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- pointer
function pointer(type) {
  return (e) => {
    if (!current?.pointer) return;
    const r = canvas.getBoundingClientRect();
    current.pointer(app, { type, x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId, button: e.button });
  };
}
canvas.addEventListener('pointerdown', pointer('down'));
canvas.addEventListener('pointermove', pointer('move'));
window.addEventListener('pointerup', pointer('up'));

go('title');
