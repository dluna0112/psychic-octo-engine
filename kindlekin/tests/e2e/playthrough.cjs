#!/usr/bin/env node
// Kindlekin — end-to-end playthrough through the real UI (clicks/taps only, no state injection).
//
//   node tests/e2e/playthrough.cjs http://localhost:8000 [--shots=docs/screens/qa] [--only=desktop|phone] [--strict-layout]
//
// For each device (desktop 1280x800, phone 390x844 touch) it: clears localStorage, starts a New Game,
// pets every egg until it hatches, spends actions and ends days for 4 days, renames a creature,
// opens the memorial and the party picker, launches an expedition, reloads mid-run and checks
// Continue resumes it, drives the map / battles (Cheer, 2x speed, boons, events, rests) to the end,
// checks the garden results card, then reloads and checks Continue restores the save.
// Exits non-zero on any console error, page error, stuck screen (no progress for 20 s) or failed check.
// Layout problems (horizontal scroll, clipped buttons, tap targets < 44 px, no focus ring) are
// printed as LAYOUT lines; with --strict-layout they fail the run too.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(BASE)) { console.error('usage: node playthrough.cjs <base-url> [--shots=dir] [--only=desktop|phone] [--strict-layout]'); process.exit(2); }
const opt = Object.fromEntries(process.argv.slice(3).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SHOTS = opt.shots ? path.resolve(opt.shots) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const STUCK_MS = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Fail extends Error {}

async function runDevice(browser, name) {
  const ctx = await browser.newContext(DEVICES[name]);
  const page = await ctx.newPage();
  const touch = !!DEVICES[name].hasTouch;
  const errors = [];
  const layout = [];
  const log = (...a) => console.log(`[${name}]`, ...a);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const checkErrors = () => { if (errors.length) throw new Fail(`errors:\n  ${errors.join('\n  ')}`); };

  const shot = async (label) => {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`) });
    log('screenshot', `${label}-${name}.png`);
  };
  const press = async (locator) => {
    await locator.waitFor({ state: 'visible', timeout: STUCK_MS });
    if (touch) await locator.tap({ timeout: STUCK_MS }); else await locator.click({ timeout: STUCK_MS });
  };
  const tryPress = async (locator) => { // for controls that may disable themselves while we reach for them
    try { if (touch) await locator.tap({ timeout: 1500 }); else await locator.click({ timeout: 1500 }); return true; } catch { return false; }
  };
  const pressAt = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  const until = async (what, fn, ms = STUCK_MS) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { checkErrors(); if (await fn()) return; await sleep(150); }
    await shot(`STUCK-${what.replace(/\W+/g, '_')}`).catch(() => {});
    throw new Fail(`stuck: waited ${ms / 1000}s for ${what}`);
  };
  const screenName = () => page.evaluate(() => window.kindlekin?.screenName);

  // ------------------------------------------------------------ layout audit (read-only)
  const audit = async (label) => {
    const issues = await page.evaluate(({ phone }) => {
      const out = [];
      const de = document.documentElement;
      if (de.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1) out.push(`horizontal scroll (${de.scrollWidth}px > ${innerWidth}px)`);
      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.display === 'none' || Number(s.opacity) < 0.05 || s.pointerEvents === 'none' && p === el) return false;
          if (p.classList.contains('closed') || p.classList.contains('hidden')) return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) return p; } return null; };
      const desc = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.textContent.trim() ? ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}"` : el.getAttribute('aria-label') ? ` [${el.getAttribute('aria-label')}]` : ''}`;
      for (const el of document.querySelectorAll('#ui button, #ui input, #ui [role=button]')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const sc = scroller(el);
        const box = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        const vis = { l: Math.max(r.left, box.left, 0), t: Math.max(r.top, box.top, 0), r: Math.min(r.right, box.right, innerWidth), b: Math.min(r.bottom, box.bottom, innerHeight) };
        if (sc) { if (r.left < -1 || r.right > innerWidth + 1) out.push(`clipped: ${desc(el)}`); }
        else if (vis.r - vis.l < r.width - 1 || vis.b - vis.t < r.height - 1) out.push(`clipped: ${desc(el)} (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`);
        if (phone && el.tagName !== 'INPUT' && (r.width < 43.5 || r.height < 43.5) && !el.disabled) out.push(`small tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${desc(el)}`);
      }
      return out;
    }, { phone: name === 'phone' });
    // keyboard focus ring: Tab through a few controls and check each shows an outline or ring
    if (name === 'desktop') {
      const seen = new Set();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body || !el.closest('#ui')) return null;
          const cs = getComputedStyle(el);
          const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || /rgb/.test(cs.boxShadow) && cs.boxShadow !== 'none';
          return { id: `${el.tagName}.${el.className}`, ring };
        });
        if (!f || seen.has(f.id)) continue;
        seen.add(f.id);
        if (!f.ring) issues.push(`no visible focus ring: ${f.id}`);
      }
      await page.evaluate(() => document.activeElement?.blur?.());
    }
    for (const i of issues) { const line = `${label}: ${i}`; if (!layout.includes(line)) { layout.push(line); log('LAYOUT', line); } }
  };

  // ------------------------------------------------------------ garden helpers (read positions, then tap)
  const creatures = () => page.evaluate(() => window.kindlekin.state.creatures.map((c) => ({ uid: c.uid, name: c.name, species: c.species, pets: c.pets, hatched: c.hatchedDay != null })));
  const creatureXY = (uid, k) => page.evaluate(async ({ uid, k }) => {
    const { _gardenDebug: G } = await import('/src/screens/garden.js');
    const { groundToScreen } = await import('/src/scenes.js');
    const { spriteMeta } = await import('/src/sprites.js');
    const a = G.actors.get(uid); if (!a) return null;
    const V = G.view;
    const p = groundToScreen(a.u, a.v, V.w, V.h, 'garden');
    const m = spriteMeta(a.showId) || { h: 100 };
    const egg = a.showId === 'egg';
    const hh = Math.max(44, m.h * p.scale * (egg ? 0.85 : 1));
    return { x: V.x + p.x, y: p.y - hh * k };
  }, { uid, k });
  const selected = () => page.evaluate(async () => (await import('/src/screens/garden.js'))._gardenDebug.sel);
  const select = async (uid) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await selected() === uid) return;
      await sleep(attempt ? 400 : 700); // let the view settle after the care panel opens/closes
      const p = await creatureXY(uid, [0.35, 0.6, 0.2, 0.8][attempt % 4]);
      if (!p) throw new Fail(`no actor for ${uid}`);
      await pressAt(p.x, p.y);
      await sleep(250);
    }
    if (await selected() !== uid) throw new Fail(`could not select creature ${uid} by tapping it`);
  };
  const doAct = async (actionId) => {
    const b = page.locator(`.care .act[data-act=${actionId}]`);
    await b.waitFor({ state: 'visible', timeout: STUCK_MS });
    if (await b.isDisabled()) return false;
    const before = await page.evaluate(() => window.kindlekin.state.actionsLeft);
    await press(b);
    await until(`action ${actionId}`, async () => (await page.evaluate(() => window.kindlekin.state.actionsLeft)) < before);
    await sleep(200);
    return true;
  };
  const actionsLeft = () => page.evaluate(() => window.kindlekin.state.actionsLeft);
  const day = () => page.evaluate(() => window.kindlekin.state.day);
  const endDay = async () => {
    const d = await day();
    await press(page.locator('.hud .btn-end'));
    const sleepBtn = page.locator('.modal [data-a=yes]');
    await sleep(300);
    if (await sleepBtn.isVisible().catch(() => false)) await press(sleepBtn);
    await until('day to end', async () => (await day()) === d + 1);
    await sleep(900);
    log(`day ${d + 1} dawns`);
  };
  const closePanel = async () => { if (await selected()) { await press(page.locator('.care [data-r=close]')); await sleep(400); } };

  // ------------------------------------------------------------ 1. title → new game
  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await until('title', async () => (await screenName()) === 'title');
  await page.locator('.title-menu .btn').first().waitFor();
  await sleep(800);
  await shot('title'); await audit('title');
  await press(page.getByRole('button', { name: 'New Game' }));
  await until('garden', async () => (await screenName()) === 'garden');
  await sleep(1000);
  await audit('garden');

  // ------------------------------------------------------------ 2. garden days
  const eggs = (await creatures()).filter((c) => !c.hatched);
  if (eggs.length !== 3) throw new Fail(`expected 3 eggs, got ${eggs.length}`);
  const careFor = async (plan) => { // plan: [[uid, action], ...]
    for (const [uid, a] of plan) {
      if ((await actionsLeft()) <= 0) break;
      await select(uid);
      if (!(await doAct(a))) { if (!(await doAct('pet'))) await doAct('nap'); }
    }
  };
  // day 1: hatch two eggs
  await careFor([[eggs[0].uid, 'pet'], [eggs[0].uid, 'pet'], [eggs[0].uid, 'pet'], [eggs[1].uid, 'pet'], [eggs[1].uid, 'pet'], [eggs[1].uid, 'pet']]);
  await sleep(1200);
  await shot('garden-hatch'); await audit('garden-panel');
  await endDay();
  // day 2: hatch the third, care for the others
  await careFor([[eggs[2].uid, 'pet'], [eggs[2].uid, 'pet'], [eggs[2].uid, 'pet'], [eggs[0].uid, 'feed'], [eggs[1].uid, 'spar'], [eggs[0].uid, 'spar']]);
  const notHatched = (await creatures()).filter((c) => !c.hatched);
  if (notHatched.length) throw new Fail(`eggs failed to hatch: ${notHatched.map((c) => c.name).join(', ')}`);
  log('all eggs hatched:', (await creatures()).map((c) => c.name).join(', '));
  await endDay();
  // day 3: train everyone
  await careFor([[eggs[0].uid, 'spar'], [eggs[1].uid, 'puzzle'], [eggs[2].uid, 'sing'], [eggs[2].uid, 'feed'], [eggs[1].uid, 'feed'], [eggs[0].uid, 'pet']]);
  await endDay();
  // day 4: leave one action unspent to exercise the End Day confirm
  await careFor([[eggs[0].uid, 'spar'], [eggs[1].uid, 'spar'], [eggs[2].uid, 'spar'], [eggs[0].uid, 'feed'], [eggs[2].uid, 'pet']]);

  // rename through the care panel (tap the name, type, Enter)
  await select(eggs[0].uid);
  await press(page.locator('.care .care-name'));
  const input = page.locator('.care input.care-name-input');
  await input.waitFor({ timeout: 5000 });
  await input.fill('Emberpaw the Brave and Bold'); // longer than the 14-char cap
  await input.press('Enter');
  await until('rename', async () => (await creatures()).find((c) => c.uid === eggs[0].uid).name === 'Emberpaw the B');
  log('renamed to', (await creatures()).find((c) => c.uid === eggs[0].uid).name);
  await sleep(600);
  await shot('garden'); await audit('garden-panel-renamed');
  await closePanel();
  await endDay();

  // memorial panel
  await press(page.locator('.dock .btn-mem'));
  await page.locator('.modal').waitFor();
  await sleep(400);
  await shot('memorial'); await audit('memorial');
  await press(page.locator('.modal [data-a=ok]'));

  // ------------------------------------------------------------ 3. party picker → expedition
  await sleep(400);
  await press(page.locator('.dock [data-r=exp]'));
  await page.locator('.picker-list').waitFor();
  const picks = page.locator('.pick');
  const nPicked = await page.locator('.pick[aria-pressed=true]').count();
  if (nPicked < 3) for (let i = 0; i < await picks.count(); i++) if ((await picks.nth(i).getAttribute('aria-pressed')) === 'false') await press(picks.nth(i));
  await sleep(500);
  await shot('picker'); await audit('picker');
  await press(page.locator('.modal [data-a=go]'));
  await until('expedition', async () => (await screenName()) === 'expedition');

  // ------------------------------------------------------------ 4. drive the expedition
  const seen = { map: 0, battle: 0, boon: 0, rest: 0, event: 0, floor: 0, cheer: 0, speed: 0, resumed: false, runResults: false };
  let sig = '', sigAt = Date.now();
  const t0 = Date.now();
  for (;;) {
    checkErrors();
    if (Date.now() - t0 > 12 * 60 * 1000) throw new Fail('expedition took over 12 minutes');
    const s = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      return {
        screen: window.kindlekin.screenName,
        text: (q('#ui')?.innerText || '').slice(0, 400),
        round: q('.xp-round')?.textContent || '',
        results: !!q('.modal.results'),
        map: !!q('.xp-map .xp-node.is-open'),
        done: document.querySelectorAll('.xp-map .xp-node.is-done').length,
        boon: !!q('.xp-boon-card'),
        cheer: !!q('.xp-cheer:not(:disabled)'),
        speed: q('.xp-speed') && q('.xp-speed').style.display !== 'none' ? q('.xp-speed').getAttribute('aria-pressed') : null,
        cont: q('.xp-card > .btn:not(:disabled)')?.textContent || null,
        card: q('.xp-card')?.className || '',
      };
    });
    const now = `${s.screen}|${s.text}|${s.round}`;
    if (now !== sig) { sig = now; sigAt = Date.now(); }
    else if (Date.now() - sigAt > STUCK_MS) { await shot('STUCK-expedition').catch(() => {}); throw new Fail(`stuck: expedition screen unchanged for 20s:\n${s.text}`); }

    if (s.screen === 'garden') { if (s.results) break; await sleep(200); continue; }
    if (s.screen !== 'expedition') { await sleep(200); continue; }

    if (s.speed === 'false') { await press(page.locator('.xp-speed')); seen.speed++; log('speed 2x'); await sleep(150); continue; }
    if (s.round && Number(s.round) >= 1 && s.cheer && !seen.cheer) {
      if (await tryPress(page.locator('.xp-cheer'))) { seen.cheer++; log('cheer!'); }
      await sleep(200); continue;
    }
    if (s.round && Number(s.round) >= 3 && !seen.battleShot) { seen.battleShot = true; await shot('battle'); await audit('battle'); }
    if (s.round && Number(s.round) >= 2 && s.cheer && seen.cheer && Math.random() < 0.05) { if (await tryPress(page.locator('.xp-cheer'))) seen.cheer++; continue; }
    if (s.map) {
      // mid-run save: after the first finished node, reload and make sure Continue resumes the run
      if (s.done >= 1 && !seen.resumed) {
        seen.resumed = true;
        await sleep(400);
        const before = await page.evaluate(() => JSON.stringify(window.kindlekin.state.activeRun?.run?.path || null));
        await page.reload();
        await until('title after mid-run reload', async () => (await screenName()) === 'title');
        await sleep(500);
        await press(page.getByRole('button', { name: /Continue/ }));
        await until('resumed expedition map', async () => (await screenName()) === 'expedition' && (await page.locator('.xp-map .xp-node.is-open').count()) > 0);
        const after = await page.evaluate(() => JSON.stringify(window.kindlekin.state.activeRun?.run?.path || null));
        if (before === 'null' || before !== after) throw new Fail(`mid-run resume lost progress: ${before} vs ${after}`);
        log('mid-run reload → Continue resumed the run at the map');
        continue;
      }
      if (!seen.map++) { await sleep(500); await shot('map'); await audit('map'); }
      const nodes = page.locator('.xp-map .xp-node.is-open');
      const n = await nodes.count();
      await press(nodes.nth(n > 1 ? (seen.map % 2) : 0));
      await sleep(300);
      continue;
    }
    if (s.boon) {
      if (!seen.boon++) { await sleep(600); await shot('boon'); await audit('boon'); }
      await press(page.locator('.xp-boon-card').first());
      log('boon picked');
      await sleep(300);
      continue;
    }
    if (s.cont) {
      const kind = /Return to the garden/.test(s.cont) ? 'results' : /Descend/.test(s.cont) ? 'floor' : /Listen|Onward/.test(s.cont) && /\bevent\b/i.test(s.text) ? 'event' : 'rest';
      if (kind === 'results') { seen.runResults = true; await sleep(700); await shot('results-run'); await audit('results-run'); }
      else if (!seen[kind]++) { await sleep(500); await shot(kind); await audit(kind); }
      log('continue:', s.cont.trim());
      await press(page.locator('.xp-card > .btn:not(:disabled)').first());
      await sleep(300);
      continue;
    }
    await sleep(150);
  }
  if (!seen.cheer) throw new Fail('never got to press Cheer');
  if (!seen.speed) throw new Fail('never switched to 2x speed');
  if (!seen.resumed) log('WARN: run ended before the mid-run reload check could happen');
  if (!seen.boon) log('WARN: no boon pick was offered on this run');

  // ------------------------------------------------------------ 5. garden results → reload → Continue
  await sleep(800);
  const runOver = await page.evaluate(() => window.kindlekin.state.activeRun == null);
  if (!runOver) throw new Fail('activeRun was not cleared after the run ended');
  await shot('results'); await audit('results');
  await press(page.locator('.modal.results [data-a=ok]'));
  await sleep(600);
  const snap = await page.evaluate(() => { const s = window.kindlekin.state; return JSON.stringify({ day: s.day, n: s.creatures.length, names: s.creatures.map((c) => c.name), motes: s.motes, exp: s.expeditions }); });
  await page.reload();
  await until('title after reload', async () => (await screenName()) === 'title');
  await press(page.getByRole('button', { name: /Continue/ }));
  await until('garden after Continue', async () => (await screenName()) === 'garden');
  const snap2 = await page.evaluate(() => { const s = window.kindlekin.state; return JSON.stringify({ day: s.day, n: s.creatures.length, names: s.creatures.map((c) => c.name), motes: s.motes, exp: s.expeditions }); });
  if (snap !== snap2) throw new Fail(`Continue did not restore the save:\n  ${snap}\n  ${snap2}`);
  if (JSON.parse(snap2).exp !== 1) throw new Fail('expedition count not saved');
  await sleep(500);
  checkErrors();
  log(`OK  run: map×${seen.map} boon×${seen.boon} rest×${seen.rest || 0} event×${seen.event || 0} floors×${seen.floor || 0} cheer×${seen.cheer}; save restored ${snap2}`);
  await ctx.close();
  return layout;
}

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  const allLayout = [];
  for (const name of Object.keys(DEVICES)) {
    if (opt.only && opt.only !== name) continue;
    try {
      const lay = await runDevice(browser, name);
      allLayout.push(...lay.map((l) => `${name}: ${l}`));
      console.log(`PASS ${name}`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${name}: ${e instanceof Fail ? e.message : e.stack}`);
    }
  }
  await browser.close();
  if (allLayout.length) {
    console.log(`\n${allLayout.length} layout issue(s)`);
    if (opt['strict-layout']) failed = true;
  }
  process.exit(failed ? 1 : 0);
})();
