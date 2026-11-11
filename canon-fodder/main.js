// Canon Fodder UI. All rules live in logic.js (window.CF).
(function () {
  const { GENRES, TRAININGS, SKILLS, SPECIES } = CF.D;
  const $ = (sel) => document.querySelector(sel);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  let meta = Object.assign(CF.newMeta(), store.get('cf-meta') || {});
  let S = store.get('cf-run');
  if (S && S.v !== 1) S = null;
  const ui = { breedFrom: null, shopPick: null, starters: [], legacy: null, speed: 1, playing: null, timer: null };

  function save() {
    if (S) Object.assign(meta.dex, S.seen);
    store.set('cf-meta', meta);
    store.set('cf-run', S && S.phase !== 'over' && S.phase !== 'won' ? S : null);
  }
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ---------- Pieces ----------
  const genreBadge = (g) => g ? `<span class="badge" style="color:${GENRES[g].color}">${GENRES[g].icon} ${GENRES[g].name}</span>` : '<span class="badge dim">No genre</span>';
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  function chip(k) {
    const sk = SKILLS[k.id];
    const g = sk.genre ? GENRES[sk.genre].icon + ' ' : '';
    return `<span class="chip ${k.inh ? 'inh' : ''} ${sk.kind === 'passive' ? 'passive' : ''}" data-a="skill" data-id="${k.id}" title="${esc(sk.desc)}">${k.inh ? '✦ ' : ''}${g}${esc(sk.name)}</span>`;
  }
  function statGrid(m) {
    return `<div class="stats">${CF.STATS.map((st) => `<div><b>${st.toUpperCase()}</b>${Math.round(m.stats[st])}<small title="Gene: growth rate">${stars(m.genes[st])}</small></div>`).join('')}</div>`;
  }
  function monHead(m) {
    const sp = SPECIES[m.species];
    return `<div class="top"><div class="emoji">${sp.emoji}</div><div style="flex:1;min-width:0">
      <div class="name" data-a="rename" data-id="${m.id}" title="Click to rename">${esc(m.name)}</div>
      <div class="sub">${esc(sp.name)} · ${CF.STAGE_NAMES[m.stage]} · Gen ${m.gen}</div>
      <div>${genreBadge(m.genre)} <span class="sub">Lv ${m.level}</span></div></div></div>`;
  }

  function monCard(m) {
    const inTeam = S.team.includes(m.id);
    const f = CF.forecast(m);
    const picking = ui.breedFrom && ui.breedFrom !== m.id;
    const breedErr = picking ? CF.canBreed(S, CF.mon(S, ui.breedFrom), m) : null;
    const trainBtns = CF.STATS.map((st) => `<button data-a="train" data-id="${m.id}" data-stat="${st}" ${m.acted ? 'disabled' : ''} title="${esc(TRAININGS[st].name)}: +${st.toUpperCase()}, leans ${GENRES[TRAININGS[st].genre].name}">${GENRES[TRAININGS[st].genre].icon} ${st.toUpperCase()}</button>`).join('');
    const tired = m.fatigue >= 70 ? '<span class="bad"> burnt out: -25% in battle</span>' : m.fatigue > 40 ? '<span class="acc"> training may fail</span>' : '';
    return `<div class="card ${inTeam ? 'team' : ''} ${picking && !breedErr ? 'pickme' : ''}" ${picking && !breedErr ? `data-a="breedwith" data-id="${m.id}"` : ''}>
      ${monHead(m)}
      <div class="sub">XP ${m.xp}/${CF.xpNeed(m.level)}${f ? ` · evolves Lv ${f.lv}: <span class="acc">${esc(f.hint)}</span>` : ' · final form'}</div>
      <div class="bar"><i style="width:${100 * m.xp / CF.xpNeed(m.level)}%"></i></div>
      ${statGrid(m)}
      <div class="sub">Fatigue ${Math.round(m.fatigue)}${tired}</div>
      <div class="bar"><i style="width:${m.fatigue}%;background:${m.fatigue >= 70 ? 'var(--bad)' : '#8a7fd1'}"></i></div>
      <div class="skills">${m.skills.map(chip).join('') || '<span class="sub">No skills yet (just Bonk)</span>'}</div>
      ${picking ? `<div class="sub ${breedErr ? 'bad' : 'good'}">${breedErr ? esc(breedErr) : 'Click this card to breed'}</div>` : `
      <div class="row">${trainBtns}<button data-a="rest" data-id="${m.id}" ${m.acted ? 'disabled' : ''}>💤 Rest</button></div>
      <div class="row">
        <button data-a="team" data-id="${m.id}" class="${inTeam ? 'on' : ''}">${inTeam ? '★ In lineup' : '☆ Benched'}</button>
        <button data-a="breed" data-id="${m.id}" ${m.stage < 1 || m.acted || m.breedCd ? 'disabled' : ''} class="${ui.breedFrom === m.id ? 'on' : ''}">${ui.breedFrom === m.id ? 'Cancel' : m.breedCd ? `🥚 in ${m.breedCd}d` : '🥚 Breed'}</button>
        <button data-a="release" data-id="${m.id}" ${S.roster.length <= 1 ? 'disabled' : ''}>Release</button>
      </div>`}
    </div>`;
  }

  function foeLine(team) {
    return team.map((e) => `<span title="${esc(e.name)} Lv ${e.level}: ${e.skills.map((k) => SKILLS[k.id].name).join(', ') || 'Bonk'}">${SPECIES[e.species].emoji}<small style="font-size:11px">${e.genre ? GENRES[e.genre].icon : ''}Lv${e.level}</small></span>`).join(' ');
  }
  function optionCard(o, i) {
    const icon = { battle: '⚔️', elite: '🔥', boss: '👑', shop: '🎪', event: '❓' }[o.type];
    let body = '';
    if (o.team) body = `<div class="foes">${foeLine(o.team)}</div><div class="sub">Win: +${o.pop} 🍿${o.type === 'elite' ? ', gene boosts' : o.type === 'boss' ? ', +1 ♥' : ''} · Lose: -1 ♥</div>${o.line ? `<div class="sub"><i>${esc(o.line)}</i></div>` : ''}`;
    else if (o.type === 'shop') body = '<div class="sub">Spend 🍿 on tapes, eggs and gene splices. No battle today.</div>';
    else body = '<div class="sub">Something unscripted happens. No battle today.</div>';
    return `<div class="opt"><b>${icon} ${esc(o.name)}</b>${body}<div class="row"><button class="primary" data-a="go" data-i="${i}">${o.team ? 'Roll cameras' : 'Go'}</button></div></div>`;
  }

  // ---------- Screens ----------
  function hud() {
    if (!S || S.phase === 'starter') { $('#hud').innerHTML = `<span class="dim">Season ${meta.asc + 1} unlocked · ${meta.wins} win(s) in ${meta.runs} run(s)</span>`; return; }
    const left = CF.ACT_DAYS - S.actDay;
    $('#hud').innerHTML = `Season ${S.asc + 1} · Act ${S.act + 1}/${CF.ACTS} · Day ${S.day} <span class="dim">(${left ? `finale in ${left}` : 'FINALE'})</span> · <span class="bad">${'♥'.repeat(Math.max(0, S.lives))}${'♡'.repeat(CF.MAX_LIVES - Math.max(0, S.lives))}</span> · 🍿 ${S.pop}`;
  }

  function title() {
    const hall = meta.hall.map((h, i) => `<div class="card ${ui.legacy === i ? 'team' : ''}" data-a="legacy" data-i="${i}" style="cursor:pointer">
      <div class="top"><div class="emoji">${h.emoji}</div><div><div class="name">${esc(h.name)}</div><div class="sub">Lv ${h.level} · Gen ${h.gen} · Season ${h.season} ${h.won ? '🏆' : '💀'}</div></div></div>
      <div class="sub">Genes ${CF.STATS.map((st) => h.genes[st]).join('/')}</div>
      <div class="skills">${h.skills.map((id) => chip({ id })).join('')}</div></div>`).join('');
    $('#app').innerHTML = `<div class="wrap" style="grid-template-columns:1fr"><div class="center">
      <div class="big">📼</div><h1 style="color:var(--accent);letter-spacing:4px">CANON FODDER</h1>
      <p class="dim">Raise Tropelings. Breed better ones. Survive three acts of auto-battles before the network cancels you.</p>
      <p><button class="primary" data-a="start" style="font-size:16px;padding:10px 22px">Start Season ${meta.asc + 1}</button></p></div>
      ${hall ? `<div><h2>Hall of Reruns — pick an ancestor (optional)</h2><p class="sub">Its descendant joins your starters as a third Tropeling, with its genes and one of its skills.</p><div class="cards">${hall}</div></div>` : ''}
    </div>`;
  }

  function starterScreen() {
    const cards = S.starters.map((m, i) => `<div class="card ${ui.starters.includes(i) ? 'team' : ''}" data-a="starter" data-i="${i}" style="cursor:pointer">${monHead(m)}${statGrid(m)}<div class="skills">${m.skills.map(chip).join('')}</div></div>`).join('');
    const leg = S.legacy ? `<h2 style="margin-top:16px">Joining automatically</h2><div class="cards"><div class="card">${monHead(S.legacy)}${statGrid(S.legacy)}<div class="skills">${S.legacy.skills.map(chip).join('')}</div></div></div>` : '';
    $('#app').innerHTML = `<div class="wrap" style="grid-template-columns:1fr"><div><h2>Casting call — choose 2 of 3</h2>
      <p class="sub">★ are genes: how fast each stat grows. They pass on when you breed.</p>
      <div class="cards">${cards}</div>${leg}
      <p><button class="primary" data-a="confirmStarters" ${ui.starters.length === 2 ? '' : 'disabled'}>Begin the season</button></p></div></div>`;
  }

  function ranch() {
    const idle = S.roster.filter((m) => !m.acted).length;
    $('#app').innerHTML = `<div class="wrap"><div>
      <h2>The Ranch — ${S.roster.length}/${CF.ROSTER_CAP} Tropelings · lineup ${S.team.length}/${CF.TEAM_CAP} · ${idle} action(s) left today</h2>
      ${ui.breedFrom ? '<p class="good">Choose a partner for the spin-off…</p>' : ''}
      <div class="cards">${S.roster.map(monCard).join('')}</div></div>
      <div><h2>Tonight's schedule</h2>${S.options.map(optionCard).join('')}
      <div class="wheel">Genre wheel: 💥 Action › 🩸 Horror › 🎭 Comedy › 🛸 Sci-Fi › 🔮 Fantasy › 💥<br>Beats the next one for ×1.5 damage.</div>
      <h2 style="margin-top:14px">Production log</h2><div class="log">${S.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div></div></div>`;
  }

  function modal(html) { $('#modal').innerHTML = html ? `<div class="overlay"><div class="modal">${html}</div></div>` : ''; }

  function noticeModal(n) {
    if (n.type === 'evolve') {
      modal(`<div class="center"><h3>✨ Evolution!</h3><div class="big">${n.fromEmoji} → ${n.emoji}</div>
        <p><b>${esc(n.from)}</b> became <b class="acc">${esc(n.to)}</b>, ${/^[AEIOU]/.test(CF.STAGE_NAMES[n.stage]) ? 'an' : 'a'} ${CF.STAGE_NAMES[n.stage]}.</p><p class="dim"><i>${esc(n.blurb)}</i></p>
        ${n.sig ? `<p>Signature skill: <b>${esc(SKILLS[n.sig].name)}</b><br><span class="sub">${esc(SKILLS[n.sig].desc)}</span></p>` : ''}
        <button class="primary" data-a="notice">Nice</button></div>`);
    } else {
      modal(`<div class="center"><h3>🥚 Spin-off hatched!</h3><div class="big">${n.emoji}</div>
        <p><b class="acc">${esc(n.name)}</b> · Generation ${n.gen}<br><span class="sub">Child of ${esc(n.parents.join(' & '))}</span></p>
        <p>Inherited: <b>${esc(n.inherited.join(', ') || 'nothing')}</b>${n.mutation ? `<br><span class="good">Mutation! Also born knowing ${esc(n.mutation)}.</span>` : ''}</p>
        ${n.muts.length ? `<p class="sub">Gene mutations: ${esc(n.muts.join(' '))}</p>` : ''}
        <button class="primary" data-a="notice">Welcome to the cast</button></div>`);
    }
  }

  function learnModal(p) {
    const m = CF.mon(S, p.mon), sk = SKILLS[p.skill];
    modal(`<h3>${SPECIES[m.species].emoji} ${esc(m.name)} wants to learn ${esc(sk.name)}</h3><p>${esc(sk.desc)}</p>
      <p class="dim">Skill list is full (${CF.SKILL_CAP}). Forget one?</p>
      ${m.skills.map((k, i) => `<div class="opt"><b>${k.inh ? '✦ ' : ''}${esc(SKILLS[k.id].name)}</b><div class="sub">${esc(SKILLS[k.id].desc)}</div><div class="row"><button data-a="forget" data-i="${i}">Forget this</button></div></div>`).join('')}
      <button data-a="forget" data-i="-1">Skip ${esc(sk.name)}</button>`);
  }

  function shopModal() {
    const items = S.shop.items.map((w, i) => {
      const W = CF.WARES[w.kind];
      return `<div class="opt"><b>${esc(W.name)}</b> <span class="acc">${W.cost} 🍿</span><div class="sub">${esc(W.desc(w))}</div>
        <div class="row">${w.sold ? '<span class="dim">Sold</span>' : `<button data-a="buy" data-i="${i}" ${S.pop < W.cost ? 'disabled' : ''} class="${ui.shopPick === i ? 'on' : ''}">${ui.shopPick === i ? 'Choose who…' : 'Buy'}</button>`}</div></div>`;
    }).join('');
    const who = ui.shopPick != null ? `<p class="good">For whom?</p><div class="row">${S.roster.map((m) => `<button data-a="buyfor" data-id="${m.id}">${SPECIES[m.species].emoji} ${esc(m.name)}</button>`).join('')}</div>` : '';
    modal(`<h3>🎪 Fan Convention</h3><p class="dim">You have ${S.pop} 🍿.</p><div class="grid2">${items}</div>${who}<p><button class="primary" data-a="leave">Head home</button></p>`);
  }

  function eventModal() {
    const ev = CF.EVENTS[S.event.id];
    modal(`<h3>❓ ${esc(ev.title)}</h3><p>${esc(ev.text)}</p>${S.event.result
      ? `<p class="acc">${esc(S.event.result)}</p><button class="primary" data-a="leave">Continue</button>`
      : `<div class="row">${ev.options.map((o, i) => `<button data-a="event" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`}`);
  }

  function endModal() {
    const won = S.phase === 'won';
    const champ = meta.hall[0];
    modal(`<div class="center"><h3>${won ? '🏆 Renewed for another season!' : '📉 Cancelled.'}</h3><div class="big">${won ? '🎉' : '📺'}</div>
      <p>${won ? `You beat the Network Executives on day ${S.day}. Season ${S.asc + 2} is tougher.` : `The show ended on day ${S.day}, in Act ${S.act + 1}.`}</p>
      ${champ ? `<p>${champ.emoji} <b>${esc(champ.name)}</b> enters the Hall of Reruns. Its descendant can join your next run.</p>` : ''}
      <p class="dim">Eggs bred this run: ${S.bred}</p><button class="primary" data-a="toTitle">Back to title</button></div>`);
  }

  // ---------- Battle playback ----------
  function battleScreen() {
    const b = S.battle;
    if (ui.playing === b) return;
    ui.playing = b;
    const unit = (u) => `<div class="unit" id="u-${u.id}"><div class="e">${u.emoji}</div><div class="info"><b>${esc(u.name)}</b> <span class="dim">Lv${u.level} ${u.genre ? GENRES[u.genre].icon : ''}${u.tired ? ' 😩' : ''}</span>
      <div class="bar hpbar"><i style="width:100%"></i></div><span class="hp">${u.max}/${u.max}</span></div></div>`;
    modal(`<h3>${esc(b.name)}</h3>${b.line ? `<p class="dim"><i>${esc(b.line)}</i></p>` : ''}
      <div class="arena"><div class="side">${b.units.filter((u) => u.side === 'p').map(unit).join('')}</div><div class="dim">VS</div><div class="side right">${b.units.filter((u) => u.side === 'e').map(unit).join('')}</div></div>
      <div class="ticker" id="ticker"></div>
      <div class="row" id="bctl"><button data-a="speed">Speed ×${ui.speed}</button><button data-a="skip">Skip to result</button></div>`);
    let i = 0;
    const lines = [];
    const setHp = (hp) => {
      for (const u of b.units) {
        const el = $('#u-' + u.id); if (!el) continue;
        el.querySelector('.hpbar i').style.width = (100 * hp[u.id] / u.max) + '%';
        el.querySelector('.hp').textContent = `${Math.max(0, Math.round(hp[u.id]))}/${u.max}`;
        el.classList.toggle('ko', hp[u.id] <= 0);
      }
    };
    const finish = () => {
      clearTimeout(ui.timer);
      if (!$('#bctl')) return;
      setHp(b.events[b.events.length - 1].hp);
      document.querySelectorAll('.unit').forEach((el) => el.classList.remove('acting', 'hit', 'healed'));
      $('#ticker').innerHTML = `<div style="font-size:16px" class="${b.win ? 'good' : 'bad'}"><b>${b.win ? '🏆 That\'s a wrap — you win!' : '💔 Critically panned. You lose a renewal.'}</b></div>
        <div>+${b.xp} XP to the lineup (half for the bench)${b.pop ? `, +${b.pop} 🍿` : ''}</div>${b.bonus.map((x) => `<div class="good">${esc(x)}</div>`).join('')}`;
      $('#bctl').innerHTML = '<button class="primary" data-a="afterBattle">Continue</button>';
    };
    const step = () => {
      if (ui.playing !== b || !$('#ticker')) return;
      if (i >= b.events.length) return finish();
      const ev = b.events[i++];
      document.querySelectorAll('.unit').forEach((el) => el.classList.remove('acting', 'hit', 'healed'));
      if (ev.actor) $('#u-' + ev.actor).classList.add('acting');
      for (const f of ev.fx) {
        const el = $('#u-' + f.t);
        void el.offsetWidth;
        if (f.dmg || f.miss) el.classList.add('hit');
        if (f.heal) el.classList.add('healed');
        const txt = f.miss ? 'miss' : f.dmg ? `-${f.dmg}${f.crit ? '!' : ''}` : f.heal ? `+${f.heal}` : '';
        if (txt) { const p = document.createElement('span'); p.className = 'pop' + (f.heal ? ' heal' : ''); p.textContent = txt; el.appendChild(p); setTimeout(() => p.remove(), 700); }
      }
      setHp(ev.hp);
      lines.push(ev.text);
      $('#ticker').innerHTML = lines.slice(-3).map((l) => `<div>${esc(l)}</div>`).join('');
      ui.timer = setTimeout(step, 800 / ui.speed);
    };
    ui.finishBattle = finish;
    ui.timer = setTimeout(step, 500);
  }

  function dexModal() {
    const cell = (id) => {
      const sp = SPECIES[id], seen = meta.dex[id] || (S && S.seen[id]);
      return `<div><div class="e">${seen ? sp.emoji : '❔'}</div><b>${seen ? esc(sp.name) : '???'}</b><br><span class="dim">${sp.genre && sp.genre !== 'any' ? GENRES[sp.genre].icon + ' ' : ''}${sp.branch ? (sp.branch === 'off' ? 'offense' : 'defense') : ''}</span>
        <div class="sub">${seen ? esc(sp.blurb) : sp.secret ? esc(sp.secret) : ''}</div></div>`;
    };
    const ids = Object.keys(SPECIES);
    const n = ids.filter((id) => meta.dex[id] || (S && S.seen[id])).length;
    modal(`<h3>Tropedex — ${n}/${ids.length} discovered</h3>
      ${[0, 1, 2, 3].map((st) => `<h2 style="margin-top:12px">${CF.STAGE_NAMES[st]}s ${st < 3 ? `(evolve at Lv ${CF.EVO_LV[st]})` : ''}</h2><div class="dex">${ids.filter((id) => SPECIES[id].stage === st).map(cell).join('')}</div>`).join('')}
      <p><button class="primary" data-a="close">Close</button></p>`);
  }

  function helpModal() {
    modal(`<h3>How to play</h3>
      <p><b>Each day</b> every Tropeling gets one action: train a stat, rest, or breed. Then pick one item from tonight's schedule.</p>
      <p><b>Battles are automatic.</b> Your lineup (up to ${CF.TEAM_CAP}) fights on its own using its skills. You win by preparing: stats, skills, genre matchups, and rest.</p>
      <p><b>Evolution</b> happens at Lv ${CF.EVO_LV.join(', ')}. The genre you trained most picks the Sidekick form. Offense training (ATK/SPD/LCK) vs defense training (HP/DEF) picks the Lead form. Icons follow from Leads, with a couple of secrets.</p>
      <p><b>Breeding</b> needs two Sidekicks or better. The egg takes each gene (★) from one parent, sometimes mutating, plus one skill from each parent (✦) and a slice of their stats. Later generations are how you get monsters no single lifetime can train.</p>
      <p><b>Fatigue</b> builds from training and fights. Over 40, training can fail. At 70+, the Tropeling fights at -25%.</p>
      <p><b>The run</b> is 3 acts. Day ${CF.ACT_DAYS} of each act is a Season Finale you must win to move on. Lose a fight, lose a ♥. At zero you are cancelled, but your best Tropeling goes to the Hall of Reruns and can seed your next run.</p>
      <p><button class="primary" data-a="close">Got it</button></p>`);
  }

  function render() {
    hud();
    if (!S) { modal(''); return title(); }
    if (S.phase === 'starter') { modal(''); return starterScreen(); }
    ranch();
    if (S.phase === 'battle') return battleScreen();
    ui.playing = null;
    if (S.notices.length) return noticeModal(S.notices[0]);
    if (S.pending.length) return learnModal(S.pending[0]);
    if (S.phase === 'shop') return shopModal();
    if (S.phase === 'event') return eventModal();
    if (S.phase === 'over' || S.phase === 'won') return endModal();
    modal('');
  }

  // ---------- Input ----------
  const actions = {
    start() { S = CF.newRun(meta, (Math.random() * 2 ** 31) | 0, ui.legacy); ui.starters = []; ui.legacy = null; },
    legacy(d) { ui.legacy = ui.legacy === +d.i ? null : +d.i; },
    starter(d) { const i = +d.i; if (ui.starters.includes(i)) ui.starters = ui.starters.filter((x) => x !== i); else if (ui.starters.length < 2) ui.starters.push(i); },
    confirmStarters() { CF.pickStarters(S, ui.starters); },
    train(d) { CF.train(S, +d.id, d.stat); },
    rest(d) { CF.rest(S, +d.id); },
    team(d) { if (!CF.toggleTeam(S, +d.id)) toast(`Lineup is full (${CF.TEAM_CAP}). Bench someone first.`); },
    breed(d) { ui.breedFrom = ui.breedFrom === +d.id ? null : +d.id; },
    breedwith(d) { CF.breed(S, ui.breedFrom, +d.id); ui.breedFrom = null; },
    release(d) { const m = CF.mon(S, +d.id); if (confirm(`Release ${m.name} for 10 🍿? This is permanent.`)) CF.release(S, +d.id); },
    rename(d) { const m = S && CF.mon(S, +d.id); if (!m) return; const n = prompt('Rename this Tropeling:', m.name); if (n && n.trim()) m.name = n.trim().slice(0, 20); },
    skill(d) { toast(`${SKILLS[d.id].name}: ${SKILLS[d.id].desc}`); return false; },
    go(d) {
      const o = S.options[+d.i];
      if (o.team && !S.team.length) return toast('Put at least one Tropeling in the lineup.');
      const idle = S.roster.filter((m) => !m.acted).length;
      if (idle && !confirm(`${idle} Tropeling(s) have not acted today. Continue anyway?`)) return false;
      ui.breedFrom = null;
      CF.choose(S, +d.i);
    },
    speed() { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 4 : 1; document.querySelector('[data-a=speed]').textContent = `Speed ×${ui.speed}`; return false; },
    skip() { ui.finishBattle(); return false; },
    afterBattle() { CF.afterBattle(S, meta); },
    notice() { S.notices.shift(); },
    forget(d) { CF.resolveLearn(S, +d.i); },
    buy(d) { const i = +d.i; if (CF.WARES[S.shop.items[i].kind].target) ui.shopPick = ui.shopPick === i ? null : i; else { const err = CF.buy(S, i); if (err) toast(err); } },
    buyfor(d) { const err = CF.buy(S, ui.shopPick, +d.id); if (err) toast(err); ui.shopPick = null; },
    leave() { ui.shopPick = null; CF.leave(S); },
    event(d) { CF.eventChoice(S, +d.i); },
    toTitle() { S = null; },
    abandon() { if (!S || confirm('Abandon this run and return to the title screen?')) { clearTimeout(ui.timer); ui.playing = null; S = null; } else return false; },
    dex() { dexModal(); return false; },
    help() { helpModal(); return false; },
    close() {},
  };

  document.addEventListener('click', (e) => {
    let el = e.target.closest('[data-a]');
    // A name is only renamable on the ranch; elsewhere the click belongs to the card.
    if (el && el.dataset.a === 'rename' && (!S || S.phase !== 'ranch' || ui.breedFrom)) el = el.parentElement.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (!fn) return;
    if (fn(el.dataset) === false) return;
    save();
    render();
  });

  render();
  if (!meta.runs && !S) helpModal();
})();
