// Usage: node verify.js [chromium|firefox|webkit]
// End-to-end behaviour on file://: controls, arm drag-seek, scrub/scratch, themes, shortcuts, persistence, frame times.
const pw = require('playwright'); const path = require('path');
const { wavFiles, HTML, offKeys } = require('./lib');

(async () => {
  const [name = 'chromium'] = process.argv.slice(2), html = HTML;
  const url = 'file://' + path.resolve(html);
  const b = await pw[name].launch(name === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await offKeys(ctx);
  const p = await ctx.newPage();
  const errs = [], reqs = [], logs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); else logs.push(m.text()); });
  p.on('request', r => reqs.push(r.url()));

  let pass = 0, fail = 0;
  const check = (label, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  — ' + detail : ''}`); };
  const st = () => p.evaluate(() => {
    const { Deck, Arm, Engine, State, Geo } = window.__deck;
    return { motor: Deck.motorState(), wr: Deck.wr, wkl: Engine.wAng ? Engine.wAng.r : null, arm: Arm.mode, th: Arm.th, contact: Deck.contact, seg: Deck.seg && Deck.seg.kind,
      idx: State.currentIdx, pos: Engine.pos(), playing: State.playing, wOn: Engine.wOn, r: Geo.radiusFor(Arm.th), n: State.playlist.length };
  });
  const rms = sec => p.evaluate(async sec => { const { samples } = await window.__deck.Debug.capture(sec); let s = 0; for (const v of samples) s += v * v; return Math.sqrt(s / samples.length); }, sec);
  const set = (id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }, [id, v]);
  // client coordinates of the stylus for an arm angle, or for a radius on the record
  const stylusAt = rn => p.evaluate(rn => {
    const { Geo, Arm } = window.__deck, tt = document.getElementById('turntable').getBoundingClientRect();
    const th = (rn === null ? Arm.th : Geo.angleFor(rn)) * Math.PI / 180;
    return { x: tt.left + Geo.P.x - Geo.L * Math.sin(th), y: tt.top + Geo.P.y + Geo.L * Math.cos(th) };
  }, rn);
  const dragArmTo = async rn => {
    const from = await stylusAt(null), to = await stylusAt(rn);
    await p.mouse.move(from.x, from.y - 6); await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(from.x + (to.x - from.x) * i / 12, from.y - 6 + (to.y - from.y) * i / 12); await p.waitForTimeout(16); }
    await p.waitForTimeout(250);          // let the arm's inertia catch up with the pointer
    await p.mouse.up();
  };

  console.log(`\n=== ${name} ===`);
  await p.goto(url + '?demo&debug&selftest');
  await p.waitForTimeout(900);
  check('selftest (arm geometry, groove mapping)', logs.includes('selftest ok'));
  let s = await st();
  check('demo loads 3 synthesized tracks', s.n === 3, `${s.n} tracks`);
  await set('noiseSlider', 0);

  // ── transport ──
  await p.click('#playBtn'); await p.waitForTimeout(3600); s = await st();
  check('play: motor at speed, stylus in the first track', s.motor === 'at speed' && s.contact && s.seg === 'track' && s.idx === 0, `motor ${s.motor}, segment ${s.seg}, pos ${s.pos.toFixed(2)} s`);
  check('worklet engine carries the track', s.wOn);
  check('music is audible', (await rms(0.4)) > 0.01);
  await p.click('#playBtn'); await p.waitForTimeout(500); s = await st();
  check('pause: stylus lifted, platter coasting', !s.contact && s.arm === 'hover' && s.motor === 'spinning down', `arm ${s.arm}, motor ${s.motor}`);
  await p.waitForTimeout(3200); s = await st();
  check('platter stopped about 3 s after pause', s.wr < 0.05, `speed ${s.wr.toFixed(3)}`);
  check('silent while paused', (await rms(0.4)) < 0.001);
  await p.click('#playBtn'); await p.waitForTimeout(1500);
  const t0 = Date.now(); await p.click('#nextBtn');
  for (;;) { s = await st(); if (s.contact && s.idx === 1) break; if (Date.now() - t0 > 3000) break; await p.waitForTimeout(20); }
  check('next: lift, swing, lower in under 1 s', s.contact && s.idx === 1 && Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  await p.click('#prevBtn'); await p.waitForTimeout(1100); s = await st();
  check('previous: back on track 1', s.contact && s.idx === 0);
  await p.click('#tracklistOl li:nth-child(3)'); await p.waitForTimeout(1100); s = await st();
  check('track click: stylus on track 3', s.contact && s.idx === 2 && s.seg === 'track');

  // ── tonearm drag-seek ──
  const band = await p.evaluate(() => window.__deck.Program.bands.map(b => ({ r0: b.r0, r1: b.r1, dur: b.dur })));
  const mid2 = (band[1].r0 + band[1].r1) / 2;
  await dragArmTo(mid2); await p.waitForTimeout(1000); s = await st();
  check('arm dropped mid-way through track 2 seeks there', s.idx === 1 && s.contact && Math.abs(s.pos - band[1].dur / 2) < band[1].dur * 0.12, `track ${s.idx + 1} at ${s.pos.toFixed(1)} s of ${band[1].dur.toFixed(0)} s`);
  await dragArmTo((band[1].r1 + band[2].r0) / 2); await p.waitForTimeout(1000); s = await st();
  check('arm dropped on a gap goes to the next track start', s.idx === 2 && s.contact && s.pos < 1.2, `track ${s.idx + 1} at ${s.pos.toFixed(2)} s`);
  await dragArmTo(1.1); await p.waitForTimeout(1300); s = await st();
  check('arm dropped off the record returns to rest', s.arm === 'rest' && !s.contact && !s.playing, `arm ${s.arm}`);
  const head = await stylusAt(null);
  await p.mouse.click(head.x, head.y - 6); await p.waitForTimeout(3600); s = await st();
  check('clicking the tonearm lowers it and plays', s.contact && s.playing);

  // ── hand on the record ──
  const wrap = await p.evaluate(() => { const r = document.getElementById('vinylWrap').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 }; });
  const onRecord = deg => ({ x: wrap.cx + wrap.R * 0.6 * Math.cos(deg * Math.PI / 180), y: wrap.cy + wrap.R * 0.6 * Math.sin(deg * Math.PI / 180) });
  const turn = async (from, to, ms) => { const steps = Math.max(2, Math.round(ms / 16)); for (let i = 1; i <= steps; i++) { const q = onRecord(from + (to - from) * i / steps); await p.mouse.move(q.x, q.y); await p.waitForTimeout(16); } };
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
  let before = (await st()).pos, q = onRecord(200);
  await p.mouse.move(q.x, q.y); await p.mouse.down();
  await turn(200, 110, 500); await p.waitForTimeout(150);
  let mid = await st(), quiet = await rms(0.3);
  check('scrub (Scratch off): turning the record back 90° rewinds about 0.45 s, silently', Math.abs((before - mid.pos) - 0.45) < 0.2 && quiet < 0.002, `moved ${(before - mid.pos).toFixed(2)} s, rms ${quiet.toFixed(4)}`);
  await p.mouse.up(); await p.waitForTimeout(120); const slip = (await st()).wr;
  await p.waitForTimeout(280); s = await st();
  check('release: record slips, then is back at speed within about 0.3 s', slip < 0.95 && s.wr > 0.95, `speed ${slip.toFixed(2)} after 0.12 s, ${s.wr.toFixed(2)} after 0.4 s`);
  await p.check('#scratchChk');
  before = (await st()).pos; q = onRecord(200);
  await p.mouse.move(q.x, q.y); await p.mouse.down();
  let minRate = 0, maxRate = 0;
  const probe = async () => { const v = (await st()).wkl; minRate = Math.min(minRate, v); maxRate = Math.max(maxRate, v); };
  await turn(200, 120, 220); await probe(); await turn(120, 210, 220); await probe(); await turn(210, 130, 220); await probe();
  const loud = await rms(0.5);
  await p.mouse.up(); await p.waitForTimeout(500);
  check('scratch (Scratch on): the real track is heard forwards and backwards under the hand', loud > 0.01 && minRate < -0.3 && maxRate > 0.3, `rms ${loud.toFixed(3)}, record speed ${minRate.toFixed(2)} … ${maxRate.toFixed(2)}`);
  await p.uncheck('#scratchChk');

  // ── speed, motor ──
  await p.click('#rpmSwitch button[data-rpm="45"]'); await p.waitForTimeout(2500); s = await st();
  check('45 rpm: platter at 1.35x (270°/s)', Math.abs(s.wr - 1.35) < 0.01, s.wr.toFixed(3));
  await p.click('#rpmSwitch button[data-rpm="33"]'); await p.waitForTimeout(2500);
  await p.click('#motorBtn'); await p.waitForTimeout(300); s = await st();
  check('motor off with the stylus down: music winds down with the platter', s.contact && s.motor === 'spinning down' && Math.abs(s.wkl - s.wr) < 0.03, `platter ${s.wr.toFixed(2)}, audio ${s.wkl.toFixed(2)}`);
  await p.click('#motorBtn'); await p.waitForTimeout(2500);

  // ── end of record ──
  await p.evaluate(() => { const { Player, Engine } = window.__deck; Player.jumpTo(2, true); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const { Player, Engine } = window.__deck; Player.seekTo(Engine.dur() - 1.5); });
  await p.waitForTimeout(2600); s = await st();
  check('after the last track the stylus enters the run-out', s.seg === 'runout' || s.seg === 'locked', s.seg);
  await p.waitForTimeout(3200); s = await st();
  check('…then the locked groove', s.seg === 'locked', `${s.seg}, r=${s.r.toFixed(3)}`);
  await p.waitForTimeout(6500); s = await st();
  check('…then auto-return: arm at rest, motor off', s.arm === 'rest' && !s.playing && s.motor !== 'at speed', `arm ${s.arm}, motor ${s.motor}`);

  // ── themes, colours, focus, shortcuts ──
  await p.selectOption('#themeSel', 'theme-wood');
  check('theme Wood applies', await p.evaluate(() => document.getElementById('app').classList.contains('theme-wood')));
  await p.fill('#accentHex', '#22aa66'); await p.waitForTimeout(100);
  check('accent colour applies', (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) === '#22aa66');
  await p.keyboard.press('Escape'); await p.locator('body').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('f'); await p.waitForTimeout(400);
  check('F enters focus mode', await p.evaluate(() => document.getElementById('app').classList.contains('focus') && getComputedStyle(document.getElementById('focusControls')).display === 'flex'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('Esc leaves focus mode', await p.evaluate(() => !document.getElementById('app').classList.contains('focus')));
  await p.keyboard.press(' '); await p.waitForTimeout(300);
  check('Space plays', (await st()).playing);
  await p.waitForTimeout(3500);
  const v0 = await p.inputValue('#vol'); await p.keyboard.press('ArrowDown'); const v1 = await p.inputValue('#vol'); await p.keyboard.press('ArrowUp');
  check('Up/Down change the volume', Math.abs(parseFloat(v0) - parseFloat(v1) - 0.05) < 0.001, `${v0} → ${v1}`);
  before = (await st()).pos; await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); s = await st();
  check('Right seeks +5 s without lifting the arm', s.pos - before > 4.5 && s.contact, `${before.toFixed(1)} → ${s.pos.toFixed(1)} s`);
  await p.keyboard.press('s'); await p.keyboard.press('r');
  check('S and R toggle shuffle and repeat', await p.evaluate(() => document.getElementById('shuffleBtn').classList.contains('on') && document.getElementById('repeatBtn').classList.contains('on')));
  await p.keyboard.press('s'); await p.keyboard.press('r'); await p.keyboard.press('r');

  // ── frame times over 10 s of playback ──
  await p.evaluate(() => { window.__deck.Debug.frames.length = 0; });
  await p.waitForTimeout(10000);
  const ft = await p.evaluate(() => { const f = window.__deck.Debug.frames, d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((a, b) => a - b); return { n: d.length, mean: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)], p99: d[Math.floor(d.length * 0.99)], max: d[d.length - 1] }; });
  console.log(`  --   frame times over 10 s (playing, Wood theme): ${ft.n} frames, mean ${ft.mean.toFixed(2)} ms, p95 ${ft.p95.toFixed(2)} ms, p99 ${ft.p99.toFixed(2)} ms, max ${ft.max.toFixed(2)} ms`);
  // Headless Firefox and CI runners render in software and miss this by design, so there it is reported only.
  if (name !== 'firefox' && !process.env.CI) check('frame loop keeps up (p95 under 20 ms)', ft.p95 < 20);
  await p.keyboard.press(' ');

  // ── persistence of settings (demo keeps the library untouched) ──
  await p.selectOption('#condSel', 'worn'); await set('pitchSlider', 3); await set('impSlider', 0.8); await set('vol', 0.6);
  await p.click('#deckToggle'); await p.waitForTimeout(500);
  await p.check('#keepSpinChk'); await p.uncheck('#autoReturnChk'); await p.click('#rpmSwitch button[data-rpm="45"]');
  await p.reload(); await p.waitForTimeout(900);
  const kept = await p.evaluate(() => ({ theme: document.getElementById('themeSel').value, accent: document.getElementById('accentHex').value, cond: document.getElementById('condSel').value, pitch: document.getElementById('pitchSlider').value,
    imp: document.getElementById('impSlider').value, vol: document.getElementById('vol').value, keep: document.getElementById('keepSpinChk').checked, auto: document.getElementById('autoReturnChk').checked, rpm: document.getElementById('rpmSel').value,
    keys: Object.keys(localStorage).sort().join(',') }));
  check('settings survive a reload', kept.theme === 'theme-wood' && kept.accent === '#22aa66' && kept.cond === 'worn' && kept.pitch === '3' && kept.imp === '0.8' && kept.vol === '0.6' && kept.keep && !kept.auto && kept.rpm === '45', JSON.stringify(kept));

  // ── library persistence (no ?demo): uploaded files come back after a reload ──
  await p.goto(url + '?debug'); await p.waitForTimeout(500);
  check('demo tracks were not written to the library', (await st()).n === 0);
  await p.setInputFiles('#audioIn', wavFiles()); await p.waitForTimeout(1200);
  await p.reload(); await p.waitForTimeout(1200);
  const lib = await p.evaluate(() => ({ n: window.__deck.State.playlist.length, names: window.__deck.State.playlist.map(t => t.name).join(', '), rms: window.__deck.State.playlist.filter(t => t.rms).length }));
  check('library survives a reload (IndexedDB vinyl-db, same order)', lib.n === 3 && lib.names === 'First Light, Second Wind, Third Rail', lib.names);
  await p.waitForTimeout(800);
  const cached = await p.evaluate(() => window.__deck.State.playlist.filter(t => t.rms).length);
  check('loudness profiles are cached with the tracks', cached >= 1, `${cached} of 3 decoded so far`);

  const foreign = reqs.filter(u => !/^(file|blob|data):/.test(u));
  check('no network requests (file:, blob: and data: only)', foreign.length === 0, `${reqs.length} requests` + (foreign.length ? ', foreign: ' + foreign.join(' ') : ''));
  check('no console errors', errs.length === 0, errs.join(' | '));
  if (fail) console.log('  --   pauses during this run:\n' + logs.filter(l => l.startsWith('STOP')).map(l => '       ' + l).join('\n'));
  console.log(`\n${name}: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exitCode = fail ? 1 : 0;
})();
