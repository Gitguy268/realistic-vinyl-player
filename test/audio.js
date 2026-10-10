// Usage: node audio.js [chromium|firefox|webkit]
// Does the audio rate track the platter? Does pitch change with speed? Do parameter changes click?
const pw = require('playwright'); const path = require('path'); const fs = require('fs');
const { HTML, WAV, offKeys } = require('./lib');
function pureWav(freq, seconds, sr = 48000) {
  const n = Math.floor(seconds * sr), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 0.5 * 32767), 44 + i * 2);
  return buf;
}
(async () => {
  const [name = 'chromium'] = process.argv.slice(2), html = HTML;
  const wav = path.join(WAV, 'Tone 1k.wav');
  if (!fs.existsSync(wav)) fs.writeFileSync(wav, pureWav(1000, 40));
  const b = await pw[name].launch(name === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await offKeys(p);
  await p.goto('file://' + path.resolve(html) + '?debug');
  await p.setInputFiles('#audioIn', wav);
  await p.waitForTimeout(600);
  // quiet surface and no mechanical sounds: this test listens to the music path only
  await p.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }; set('noiseSlider', 0); const c = document.getElementById('sfxChk'); c.checked = false; c.dispatchEvent(new Event('change')); set('impSlider', 0); });
  // frequency of the last `sec` seconds by zero crossings, plus level and the largest second difference
  const listen = sec => p.evaluate(async sec => {
    const { samples, sr } = await window.__deck.Debug.capture(sec);
    let zc = 0, sum = 0, d2 = 0, first = -1, last = -1;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1] <= 0 && samples[i] > 0) { zc++; if (first < 0) first = i; last = i; }
      sum += samples[i] * samples[i];
      if (i > 1) d2 = Math.max(d2, Math.abs(samples[i] - 2 * samples[i - 1] + samples[i - 2]));
    }
    return { hz: zc > 1 ? (zc - 1) * sr / (last - first) : 0, rms: Math.sqrt(sum / samples.length), d2, n: samples.length };
  }, sec);
  const st = () => p.evaluate(() => { const { Deck, Engine } = window.__deck; return { wr: Deck.wr, wkl: Engine.wAng ? Engine.wAng.r : null, wOn: Engine.wOn, seg: Deck.seg && Deck.seg.kind, motor: Deck.motorState() }; });
  const f = (v, d = 3) => v == null ? 'n/a' : v.toFixed(d);

  // BG=1 runs the whole report with background playback on (the mix then leaves through a media element)
  if (process.env.BG) await p.evaluate(() => { const { Settings, Engine } = window.__deck; Settings.v.background = true; Engine.ensure(); Engine.route(); });
  await p.click('#playBtn');
  await p.waitForTimeout(4200);
  const s0 = await st(), a0 = await listen(0.5);
  console.log(`engine: ${s0.wOn ? 'AudioWorklet' : 'media element'}   segment: ${s0.seg}`);
  console.log(`33⅓ rpm: heard ${f(a0.hz, 1)} Hz (expect 1000)   rms ${f(a0.rms)}`);
  for (const [rpm, expect] of [['45', 1350], ['78', 2340], ['33', 1000]]) {
    await p.click(`#rpmSwitch button[data-rpm="${rpm}"]`); await p.waitForTimeout(2600);
    const a = await listen(0.4);
    console.log(`${rpm.padEnd(3)} rpm: heard ${f(a.hz, 1)} Hz (expect ${expect})`);
  }
  await p.evaluate(() => { const e = document.getElementById('pitchSlider'); e.value = 8; e.dispatchEvent(new Event('input')); }); await p.waitForTimeout(2200);
  console.log(`pitch +8%: heard ${f((await listen(0.4)).hz, 1)} Hz (expect 1080)`);
  await p.evaluate(() => { const e = document.getElementById('pitchSlider'); e.value = 0; e.dispatchEvent(new Event('input')); }); await p.waitForTimeout(2200);

  const ramp = async label => {
    console.log(`\n${label}:  t(s)  platter(draw)  record(audio)  heard Hz  Hz/1000`);
    for (let i = 0; i < 9; i++) {
      await p.waitForTimeout(i === 0 ? 150 : 300);
      const s = await st(), a = await listen(0.06);
      console.log(`   ${f(0.15 + i * 0.3, 2)}      ${f(s.wr)}          ${f(s.wkl)}        ${a.rms > 0.002 ? f(a.hz, 0).padStart(5) : '  (silent)'}    ${a.rms > 0.002 ? f(a.hz / 1000) : ''}`);
    }
  };
  await p.click('#motorBtn'); await ramp('spin-down (motor off, stylus in the groove)');
  await p.click('#motorBtn'); await ramp('spin-up (motor on)');
  await p.waitForTimeout(1500);

  // Click test, one change at a time. For a clean tone at f the second difference is peak*(2*pi*f/sr)^2
  // (0.017 of the peak at 1 kHz); a click is a step, which shows up as a large fraction of the peak.
  const set = (id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }, [id, v]);
  const jump = () => p.evaluate(async () => {
    const { samples } = await window.__deck.Debug.capture(1.2);
    let worst = 0;
    for (let i = 2; i < samples.length; i++) {
      const d2 = Math.abs(samples[i] - 2 * samples[i - 1] + samples[i - 2]);
      let pk = 0; for (let k = Math.max(0, i - 96); k < Math.min(samples.length, i + 96); k += 4) pk = Math.max(pk, Math.abs(samples[k]));
      if (pk > 0.01) worst = Math.max(worst, d2 / pk);
    }
    return worst;
  });
  await p.waitForTimeout(1300);
  console.log(`\nclick test (largest second difference as a fraction of the local peak; steady 1 kHz tone = 0.017, a click = 0.2+):`);
  console.log(`   steady tone            ${f(await jump())}`);
  const events = [
    ['volume 0.8 → 0.2 → 0.9', async () => { await set('vol', 0.2); await p.waitForTimeout(300); await set('vol', 0.9); }],
    ['bass +12 → -12 → 0', async () => { for (const v of [12, -12, 0]) { await set('bassSlider', v); await p.waitForTimeout(200); } }],
    ['mid +12 → -12 → 0', async () => { for (const v of [12, -12, 0]) { await set('midSlider', v); await p.waitForTimeout(200); } }],
    ['treble +12 → -12 → 0', async () => { for (const v of [12, -12, 0]) { await set('trebleSlider', v); await p.waitForTimeout(200); } }],
    ['condition Good → Beat-up', async () => { await p.selectOption('#condSel', 'beat'); await p.waitForTimeout(300); await p.selectOption('#condSel', 'good'); }],
    ['seek +5 s / -5 s (keys)', async () => { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350); await p.keyboard.press('ArrowLeft'); }],
    ['pitch 0 → +8 → -8 → 0', async () => { for (const v of [8, -8, 0]) { await set('pitchSlider', v); await p.waitForTimeout(250); } }],
    ['33 → 45 → 33', async () => { await p.click('#rpmSwitch button[data-rpm="45"]'); await p.waitForTimeout(400); await p.click('#rpmSwitch button[data-rpm="33"]'); }],
    ['lift → lower (cue lever)', async () => { await p.click('#cueLever'); await p.waitForTimeout(300); await p.click('#cueLever'); await p.waitForTimeout(500); }],
  ];
  for (const [label, run] of events) {
    await p.waitForTimeout(700);
    await run();
    await p.waitForTimeout(450);
    console.log(`   ${label.padEnd(24)} ${f(await jump())}`);
  }
  console.log(errs.length ? '\nCONSOLE:\n' + errs.join('\n') : '\nno console errors or warnings');
  await b.close();
})();
