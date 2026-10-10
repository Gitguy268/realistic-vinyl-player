// Usage: node wear.js
// Scratch defects: do they tick once per revolution, and is the drawn record locked to the heard angle?
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const { HTML, WAV, OUT } = require('./lib');
(async () => {
  const html = HTML;
  const wav = path.join(WAV, 'Silence.wav');
  if (!fs.existsSync(wav)) { const sr = 22050, n = sr * 60, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); fs.writeFileSync(wav, b); }
  const br = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await br.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + path.resolve(html) + '?debug');
  await p.setInputFiles('#audioIn', wav);
  await p.waitForTimeout(600);
  await p.selectOption('#condSel', 'beat');
  await p.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }; set('noiseSlider', 1); set('impSlider', 1); const c = document.getElementById('sfxChk'); c.checked = false; c.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  // put the stylus on the loudest scratch: seek to the time whose radius is the scratch's middle
  const info = await p.evaluate(() => {
    const { Program, Player, C, Engine } = window.__deck; const W = window.__deck.Wear;
    const d = [...W.defects].sort((a, b) => b.amp - a.amp)[0], band = Program.bands[0];
    const t = (band.r0 - d.m) / (band.r0 - band.r1) * band.dur;
    Player.seekTo(Math.max(0, t - 4));
    // isolate that one scratch for the timing check: no random crackle or pops, no other scratches
    C.CONDITIONS.beat.pops = 0; C.CONDITIONS.beat.crackle = 0; Engine.pushCfg(true);
    W.defects = [d]; W.send();
    return { count: W.defects.length, marks: W.marks.length, amp: d.amp, r: d.m, span: d.r0 - d.r1, t };
  });
  console.log(`Beat-up record: ${info.count} scratches, ${info.marks} dust/scuff marks. Loudest scratch at r=${info.r.toFixed(3)} (amp ${info.amp.toFixed(2)}), reached at ${info.t.toFixed(1)} s`);
  await p.click('#playBtn');
  await p.waitForTimeout(2600);
  // lock error between the drawn record and the heard angle, sampled for 9 s while the audio is captured
  const res = await p.evaluate(async () => {
    const { Deck, Engine, Debug } = window.__deck; let worst = 0, sum = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) {
      await new Promise(r => requestAnimationFrame(r));
      const h = Engine.heardAngle(); if (h === null) continue;
      let d = (h - Deck.angR) % 360; if (d > 180) d -= 360; if (d < -180) d += 360;
      worst = Math.max(worst, Math.abs(d)); sum += Math.abs(d); n++;
    }
    const { samples, sr } = await Debug.capture(9);
    // ticks = the loud peaks; hiss and ordinary crackle are far below a 0.3-amp scratch
    let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v));
    const ticks = []; let lastTick = -1e9;
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > peak * 0.6 && i - lastTick > sr * 0.3) { ticks.push(i / sr); lastTick = i; }
    return { worst, mean: sum / n, peak, ticks, seg: Deck.seg && Deck.seg.kind, pos: Engine.pos() };
  });
  const gaps = res.ticks.slice(1).map((t, i) => (t - res.ticks[i]).toFixed(3));
  console.log(`loud ticks in 9 s: ${res.ticks.length}, spacing ${gaps.join(', ')} s (one revolution at 33⅓ = 1.800 s)`);
  console.log(`drawn record vs heard angle: mean error ${res.mean.toFixed(2)}°, worst ${res.worst.toFixed(2)}°   (segment ${res.seg}, pos ${res.pos.toFixed(1)} s)`);
  await p.locator('#turntable').screenshot({ path: path.join(OUT, 'wear-beat.png') });
  console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no console errors');
  await br.close();
})();
