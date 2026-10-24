// Wyrdgarden prototype UI. All rules live in logic.js (window.Wyrd).
(function () {
  'use strict';

  const W = window.Wyrd;
  const KEY = 'wyrdgarden-prototype-v1';
  const app = document.getElementById('app');

  let save = loadSave();
  let run = null;
  let note = '';

  function loadSave() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* private mode or blocked storage: start fresh */ }
    return W.newSave();
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch (e) { /* storage unavailable: the game still works for this session */ }
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function bar(label, value, max, cls) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return `<div class="bar ${cls}"><span style="width:${pct}%"></span>` +
      `<em>${label} ${Math.round(value)}/${max}</em></div>`;
  }

  function tags(s) {
    const out = [];
    if (s.affliction) out.push(`<span class="tag">${esc(s.affliction)}</span>`);
    if (s.virtue) out.push(`<span class="tag virtue">${esc(s.virtue)}</span>`);
    return out.join('');
  }

  // ---- Garden -------------------------------------------------------------

  function renderSprout(s) {
    const picked = save.selected.indexOf(s.id) !== -1;
    const done = !!save.acted[s.id];
    const xpNeed = s.stage === 'Seedling' ? 30 : s.stage === 'Sapling' ? 70 : null;
    return `
      <article class="sprout">
        <div class="head">
          <strong>${esc(s.name)}</strong>
          <span class="muted">${esc(s.stage)}${s.branch ? ' · ' + esc(s.branch) : ''}</span>
        </div>
        <div class="bars">
          ${bar('HP', s.hp, s.maxHp, 'hp')}
          ${bar('Stress', s.stress, 100, 'stress')}
          ${xpNeed ? bar('XP', s.xp, xpNeed, 'xp') : ''}
        </div>
        <div class="care muted">
          Tend ${s.care.tend} · Spark ${s.care.spark} · Hush ${s.care.hush}<br>
          ATK ${s.atk} · GRD ${s.guard} · SPD ${s.spd}
        </div>
        <div>${tags(s)}</div>
        <div class="row">
          <label><input type="checkbox" data-pick="${s.id}" ${picked ? 'checked' : ''}> Party</label>
          <button data-care="tend" data-id="${s.id}" ${done || save.fruit < 1 ? 'disabled' : ''}>Tend</button>
          <button data-care="spark" data-id="${s.id}" ${done ? 'disabled' : ''}>Spark</button>
          <button data-care="hush" data-id="${s.id}" ${done ? 'disabled' : ''}>Hush</button>
        </div>
      </article>`;
  }

  function renderGarden() {
    const count = save.selected.length;
    const memorials = save.memorials.length
      ? save.memorials.map((m) => `<li>${esc(m.name)}, ${esc(m.stage)}${m.branch ? ' ' + esc(m.branch) : ''} (day ${m.day})</li>`).join('')
      : '<li class="muted">No memorials yet.</li>';

    return `
      <header>
        <h1>Wyrdgarden</h1>
        <div class="stats">Day ${save.day} · Fruit ${save.fruit} · Memorials ${save.memorials.length}</div>
      </header>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <h2>The Garden</h2>
      <div class="roster">${save.roster.map(renderSprout).join('')}</div>
      <div class="row">
        <button data-act="descend" ${count ? '' : 'disabled'}>
          Descend with ${count} Sprout${count === 1 ? '' : 's'}
        </button>
        <button data-act="nextday" class="ghost">Next day</button>
      </div>
      <h2>Memorials</h2>
      <ul class="memorials">${memorials}</ul>`;
  }

  // ---- Expedition ---------------------------------------------------------

  const ROOM_LABEL = { combat: 'a skirmish', rest: 'the hollow', boss: 'the Sunken Mother' };

  function renderRun() {
    const type = run.rooms[run.index];
    const pips = run.rooms.map((r, i) => {
      const cls = i < run.index ? 'done' : i === run.index ? 'now' : '';
      const glyph = r === 'boss' ? '◆' : r === 'rest' ? '○' : '●';
      return `<span class="pip ${cls}">${glyph}</span>`;
    }).join('');

    const party = run.party.map((p) => `
      <div class="member ${p.hp > 0 ? '' : 'fallen'}">
        <strong>${esc(p.name)}</strong>
        <span class="muted">${p.hp > 0 ? esc(p.stage) : 'fallen'}</span>
        <div class="bars">${bar('HP', p.hp, p.maxHp, 'hp')}${bar('Stress', p.stress, 100, 'stress')}</div>
        ${tags(p)}
      </div>`).join('');

    const boons = run.boons.length
      ? `<p class="muted">Boons: ${run.boons.map((id) => esc(W.boon(id).name)).join(', ')}</p>`
      : '';

    let actions = '';
    if (run.state === 'ready') {
      actions = `<button data-act="enter">Enter ${ROOM_LABEL[type]}</button>
                 <button data-act="retreat" class="danger">Retreat</button>`;
    } else if (run.state === 'cleared' && run.offered) {
      actions = '<h3>Choose a boon</h3>' + run.offered.map((id) => {
        const b = W.boon(id);
        return `<button class="boon" data-boon="${b.id}"><strong>${esc(b.name)}</strong><span>${esc(b.text)}</span></button>`;
      }).join('');
    } else if (run.state === 'cleared') {
      actions = `<button data-act="continue">Continue</button>
                 <button data-act="retreat" class="danger">Retreat</button>`;
    } else {
      const heading = run.state === 'victory' ? 'The Depths are quiet, for now.'
        : run.state === 'defeat' ? 'The party has fallen. Their memorials remain.'
        : 'The party withdraws to the garden.';
      actions = `<p>${esc(heading)}</p><button data-act="return">Return to the garden</button>`;
    }

    return `
      <header>
        <h1>The Depths</h1>
        <div class="pips">${pips}</div>
      </header>
      <h2>Party</h2>
      <div class="roster">${party}</div>
      ${boons}
      <h2>Log</h2>
      <div class="panel">
        <ol class="log">${run.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
      </div>
      <h2>${run.state === 'ready' ? 'Next room' : 'Choices'}</h2>
      <div class="row" style="display:block">${actions}</div>`;
  }

  function render() {
    app.innerHTML = run ? renderRun() : renderGarden();
  }

  // ---- Events -------------------------------------------------------------

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.care) {
      const result = W.gardenAct(save, Number(btn.dataset.id), btn.dataset.care);
      note = result.ok ? '' : result.msg;
    } else if (btn.dataset.boon) {
      W.takeBoon(run, btn.dataset.boon);
    } else if (btn.dataset.act === 'descend') {
      run = W.startRun(save);
      note = '';
    } else if (btn.dataset.act === 'nextday') {
      W.nextDay(save);
      note = `Day ${save.day} dawns.`;
    } else if (btn.dataset.act === 'enter') {
      W.enterRoom(run);
    } else if (btn.dataset.act === 'continue') {
      W.advance(run);
    } else if (btn.dataset.act === 'retreat') {
      W.retreat(run);
    } else if (btn.dataset.act === 'return') {
      W.endRun(save, run);
      note = run.state === 'defeat'
        ? 'The party fell. Their memorials will feed the garden.'
        : run.state === 'victory'
          ? 'Back from the Depths. Tend your Sprouts before the next descent.'
          : 'The survivors came home. Tend them before the next descent.';
      run = null;
    }

    persist();
    render();
  });

  app.addEventListener('change', (e) => {
    const id = e.target.dataset.pick;
    if (id === undefined) return;
    const sproutId = Number(id);
    const at = save.selected.indexOf(sproutId);
    if (e.target.checked && at === -1 && save.selected.length < W.MAX_PARTY) {
      save.selected.push(sproutId);
    } else if (!e.target.checked && at !== -1) {
      save.selected.splice(at, 1);
    } else if (e.target.checked) {
      note = `A party can have at most ${W.MAX_PARTY} Sprouts.`;
    }
    persist();
    render();
  });

  render();
})();
