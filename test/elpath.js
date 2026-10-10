// Usage: node elpath.js [chromium|firefox|webkit]
// The fallback path: a track that is not decoded plays through the <audio> element. Does its pitch still follow the platter?
const pw = require('playwright'); const path = require('path');
const { HTML, WAV, offKeys } = require('./lib');
(async () => {
  const [name = 'chromium'] = process.argv.slice(2), html = HTML;
  const b = await pw[name].launch(name === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await offKeys(p);
  await p.goto('file://' + path.resolve(html) + '?debug');
  await p.setInputFiles('#audioIn', path.join(WAV, 'Tone 1k.wav'));
  await p.waitForTimeout(700);
  // pretend the track is too long to decode: it must stay on the media element
  await p.evaluate(() => { const { State, Player } = window.__deck; State.playlist.forEach(t => { State.deckNode && State.deckNode.port.postMessage({ unload: t.id }); t.pcm = 'long'; t.pcmCh = null; }); Player.loadTrack(0); const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }; set('noiseSlider', 0); const c = document.getElementById('sfxChk'); c.checked = false; c.dispatchEvent(new Event('change')); });
  const hz = () => p.evaluate(async () => { const { samples, sr } = await window.__deck.Debug.capture(0.4); let zc = 0, first = -1, last = -1, sum = 0; for (let i = 1; i < samples.length; i++) { if (samples[i - 1] <= 0 && samples[i] > 0) { zc++; if (first < 0) first = i; last = i; } sum += samples[i] * samples[i]; } return { hz: zc > 1 ? (zc - 1) * sr / (last - first) : 0, rms: Math.sqrt(sum / samples.length) }; });
  const st = () => p.evaluate(() => { const { Deck, Engine } = window.__deck, a = document.getElementById('audio'); return { wOn: Engine.wOn, paused: a.paused, rate: a.playbackRate, pp: a.preservesPitch, wr: Deck.wr, pos: Engine.pos() }; });
  await p.click('#playBtn'); await p.waitForTimeout(4300);
  let s = await st(), a = await hz();
  console.log(`${name}: engine ${s.wOn ? 'worklet' : 'media element'}, element playing ${!s.paused}, preservesPitch ${s.pp}, playbackRate ${s.rate.toFixed(3)}, heard ${a.hz.toFixed(0)} Hz (expect 1000)`);
  await p.click('#rpmSwitch button[data-rpm="45"]'); await p.waitForTimeout(2600); s = await st(); a = await hz();
  console.log(`   45 rpm: playbackRate ${s.rate.toFixed(3)}, heard ${a.hz.toFixed(0)} Hz (expect 1350: pitch rises, no time-stretch)`);
  await p.click('#rpmSwitch button[data-rpm="33"]'); await p.waitForTimeout(2600);
  await p.click('#motorBtn'); await p.waitForTimeout(900); s = await st(); a = await hz();
  console.log(`   0.9 s into spin-down: platter ${s.wr.toFixed(2)}, playbackRate ${s.rate.toFixed(2)}, heard ${a.hz.toFixed(0)} Hz`);
  await p.waitForTimeout(3000); s = await st();
  console.log(`   stopped: element paused ${s.paused} at ${s.pos.toFixed(1)} s`);
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : '   no console errors');
  await b.close();
})();
