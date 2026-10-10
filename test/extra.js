// Usage: node extra.js [chromium|firefox|webkit]
// Cases the main suite does not reach: long-track guard, undecodable file, hidden tab, repeat and shuffle.
const pw = require('playwright'); const path = require('path'); const fs = require('fs');
const { wavFiles, HTML, WAV } = require('./lib');
function wav(seconds, sr, fill) {
  const n = Math.floor(seconds * sr), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  if (fill) for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 12000), 44 + i * 2);
  return b;
}
(async () => {
  const [name = 'chromium'] = process.argv.slice(2), html = HTML;
  const url = 'file://' + path.resolve(html);
  const dir = WAV;
  const longWav = path.join(dir, 'Long Mix.wav'), junk = path.join(dir, 'Broken.mp3');
  if (!fs.existsSync(longWav)) fs.writeFileSync(longWav, wav(21 * 60, 8000, true));
  if (!fs.existsSync(junk)) fs.writeFileSync(junk, Buffer.from(Array.from({ length: 40000 }, (_, i) => (i * 7919 + 13) % 251)));
  const b = await pw[name].launch(name === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
  let pass = 0, fail = 0;
  const check = (label, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  — ' + detail : ''}`); };
  const open = async query => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      window.__ms = {};                                             // media-session handlers, so the test can press the keys
      if (navigator.mediaSession) { const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession); navigator.mediaSession.setActionHandler = (k, fn) => { window.__ms[k] = fn; set(k, fn); }; }
      window.__decodes = 0;
      for (const C of [window.BaseAudioContext, window.webkitAudioContext, window.webkitOfflineAudioContext].filter(Boolean)) {
        const orig = C.prototype.decodeAudioData;
        if (orig && !orig.__counted) { C.prototype.decodeAudioData = function (...a) { window.__decodes++; return orig.apply(this, a); }; C.prototype.decodeAudioData.__counted = true; }
      }
    });
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', e => p.errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push('console: ' + m.text()); });
    await p.goto(url + query); await p.waitForTimeout(600);
    return p;
  };
  const st = p => p.evaluate(() => { const { Deck, Arm, Engine, State } = window.__deck, a = document.getElementById('audio'); return { arm: Arm.mode, contact: Deck.contact, seg: Deck.seg && Deck.seg.kind, idx: State.currentIdx, pos: Engine.pos(), playing: State.playing, wOn: Engine.wOn, elPlaying: !a.paused, pcm: State.playlist.map(t => t.pcm), decodes: window.__decodes, hint: document.getElementById('hint').textContent, frames: window.__deck.Debug.frames.length }; });
  console.log(`\n=== ${name} ===`);

  // ── a 21-minute track must stay on the media element and never be decoded, on upload and after a reload ──
  let p = await open('?debug');
  await p.setInputFiles('#audioIn', longWav); await p.waitForTimeout(2500);
  let s = await st(p);
  check('21-minute track is not decoded on upload', s.decodes === 0 && s.pcm[0] === 'long', `decodeAudioData calls: ${s.decodes}, state: ${s.pcm[0]}`);
  await p.reload(); await p.waitForTimeout(2500); s = await st(p);
  check('…nor when the library is restored after a reload', s.decodes === 0 && s.pcm[0] === 'long', `decodeAudioData calls: ${s.decodes}, state: ${s.pcm[0]}`);
  await p.click('#playBtn'); await p.waitForTimeout(4500); s = await st(p);
  check('…and it plays through the media element', !s.wOn && s.elPlaying && s.pos > 0.5 && s.decodes === 0, `pos ${s.pos.toFixed(1)} s`);
  check('no console errors (long track)', p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();

  // ── a file nothing can read: a clear message, no exception, the next track still plays ──
  p = await open('?debug');
  await p.setInputFiles('#audioIn', [junk, ...wavFiles(dir).slice(0, 1)]); await p.waitForTimeout(1800);
  await p.click('#playBtn'); await p.waitForTimeout(800); s = await st(p);
  check('undecodable file: message shown, nothing starts', /Can't play/.test(s.hint) && !s.playing && s.pcm[0] === 'failed', `hint: "${s.hint}"`);
  await p.click('#nextBtn'); await p.waitForTimeout(300); await p.click('#playBtn'); await p.waitForTimeout(4200); s = await st(p);
  check('…and the next track plays', s.idx === 1 && s.contact && s.seg === 'track' && s.pos > 0.3, `track ${s.idx + 1} at ${s.pos.toFixed(1)} s`);
  const real = p.errs.filter(e => !/Failed to load resource|NotSupportedError|MEDIA_ERR|decode/i.test(e));
  check('no uncaught exceptions (undecodable file)', real.length === 0, p.errs.join(' | ').slice(0, 200));
  await p.context().close();

  // ── hidden tab: no frames drawn, playback logic still advances ──
  p = await open('?demo&debug');
  await p.evaluate(() => { const e = document.getElementById('noiseSlider'); e.value = 0; e.dispatchEvent(new Event('input')); });
  await p.click('#playBtn'); await p.waitForTimeout(3600);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300); const f0 = (await st(p)).frames; await p.waitForTimeout(700); const f1 = (await st(p)).frames;
  check('hidden tab: the frame loop is paused', f1 === f0, `${f1 - f0} frames in 0.7 s`);
  await p.evaluate(() => { const { Player, Engine } = window.__deck; Player.seekTo(Engine.dur() - 1); });
  await p.waitForTimeout(4200); s = await st(p);
  check('hidden tab: track 1 ends, the gap passes, track 2 starts', s.idx === 1 && s.seg === 'track' && s.contact, `track ${s.idx + 1}, segment ${s.seg}, pos ${s.pos.toFixed(1)} s`);
  await p.evaluate(() => { const { Player } = window.__deck; Player.jumpTo(2, true); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const { Player, Engine } = window.__deck; Player.seekTo(Engine.dur() - 1); });
  await p.waitForTimeout(3200); const mid = await st(p);
  await p.waitForTimeout(9500); s = await st(p);
  check('hidden tab: run-out, locked groove and auto-return all happen without frames', (mid.seg === 'runout' || mid.seg === 'locked') && s.arm === 'rest' && !s.playing && (await st(p)).frames === f1, `then ${mid.seg}, finally arm ${s.arm}`);
  await p.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  check('visible again: frames resume', (await st(p)).frames > f1);

  // ── repeat one and shuffle: lift and relocate ──
  await p.click('#repeatBtn');                                   // repeat: one
  await p.click('#tracklistOl li:nth-child(2)'); await p.waitForTimeout(1300);
  await p.evaluate(() => { const { Player, Engine } = window.__deck; Player.seekTo(Engine.dur() - 1); });
  await p.waitForTimeout(2300); s = await st(p);
  check('repeat one: the arm lifts and comes back down at the start of the same track', s.idx === 1 && s.contact && s.seg === 'track' && s.pos < 1.6, `track ${s.idx + 1} at ${s.pos.toFixed(2)} s`);
  await p.click('#repeatBtn'); await p.click('#repeatBtn');     // repeat: off
  await p.click('#shuffleBtn');
  const order = await p.evaluate(() => window.__deck.State.shuffleQueue.slice());
  await p.evaluate(() => { const { Player, Engine } = window.__deck; Player.seekTo(Engine.dur() - 1); });
  // when the shuffled order continues with track 1, the stylus first rides its 2 s lead-in
  for (let i = 0; i < 35; i++) { await p.waitForTimeout(200); s = await st(p); if (s.contact && s.seg === 'track' && s.idx === order[1]) break; }
  check('shuffle: the next track is the next one in the shuffled order', s.idx === order[1] && s.contact && s.seg === 'track', `order ${order.map(i => i + 1).join(',')} → now track ${s.idx + 1}`);
  check('no console errors (hidden tab, repeat, shuffle)', p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();

  // ── media keys ──
  p = await open('?demo&debug');
  if (await p.evaluate(() => !!navigator.mediaSession)) {
    const ms = () => p.evaluate(() => { const { State, Deck, Engine } = window.__deck, m = navigator.mediaSession; return { playing: State.playing, idx: State.currentIdx, pos: Engine.pos(), contact: Deck.contact, title: m.metadata && m.metadata.title, state: m.playbackState, name: State.playlist[State.currentIdx].name }; });
    await p.evaluate(() => window.__ms.play()); await p.waitForTimeout(3800); s = await ms();
    check('media key Play starts the deck and names the track', s.playing && s.contact && s.title === s.name && s.state === 'playing', `"${s.title}", ${s.state}`);
    await p.evaluate(() => window.__ms.nexttrack()); await p.waitForTimeout(1300); s = await ms();
    check('media key Next goes to track 2', s.idx === 1 && s.title === s.name, `track ${s.idx + 1}, "${s.title}"`);
    await p.evaluate(() => window.__ms.seekto({ seekTime: 12 })); await p.waitForTimeout(400); s = await ms();
    check('media seek moves the stylus', Math.abs(s.pos - 12.3) < 0.6, `${s.pos.toFixed(1)} s`);
    await p.evaluate(() => window.__ms.pause()); await p.waitForTimeout(300); s = await ms();
    check('media key Pause lifts the stylus', !s.playing && !s.contact && s.state === 'paused');
    check('no console errors (media keys)', p.errs.length === 0, p.errs.join(' | '));
  } else console.log('  --   no Media Session in this browser');
  await p.context().close();

  // ── phone, focus mode: the deck and the floating bar fit the screen ──
  if (name !== 'firefox') {                                       // Playwright's Firefox has no mobile emulation
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    p = await ctx.newPage(); await p.goto(url + '?demo'); await p.waitForTimeout(900);
    await p.evaluate(() => document.getElementById('focusBtn').click()); await p.waitForTimeout(700);
    const wide = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > 390.5 || r.left < -0.5); }).map(el => el.id || el.className));
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check('phone focus mode: nothing is wider than the screen', wide.length === 0 && sw <= 390, `scroll width ${sw}` + (wide.length ? ', sticking out: ' + wide.slice(0, 4).join(', ') : ''));
    await ctx.close();
  }

  console.log(`\n${name}: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exitCode = fail ? 1 : 0;
})();
