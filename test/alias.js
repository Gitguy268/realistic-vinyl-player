// Usage: node alias.js [chromium|firefox|webkit]
// What the read filter in the worklet does above cut speed:
//  - at 78 rpm a 20 kHz tone comes out at 46.8 kHz, above what the output can carry. How loud is what folds back down?
//  - at 45 rpm a 10 kHz tone comes out at 13.5 kHz. How much level does the filter cost there?
const pw = require('playwright'); const path = require('path'); const fs = require('fs');
const { HTML, WAV, offKeys } = require('./lib');
const SR = 48000;
function tone(hz) {
  const file = path.join(WAV, `Tone ${hz / 1000}k.wav`), n = SR * 30;
  if (!fs.existsSync(file)) {
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * i / SR) * 0.5 * 32767), 44 + i * 2);
    fs.writeFileSync(file, b);
  }
  return file;
}
(async () => {
  const [name = 'chromium'] = process.argv.slice(2);
  const b = await pw[name].launch(name === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
  // level (dB relative to the tone on the record) at the frequency a tone of `hz` ends up at when played at `rpm`
  const measure = async (hz, rpm, factor) => {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await offKeys(p);
    await p.goto('file://' + path.resolve(HTML) + '?debug');
    await p.setInputFiles('#audioIn', tone(hz)); await p.waitForTimeout(700);
    await p.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }; set('noiseSlider', 0); set('impSlider', 0); const c = document.getElementById('sfxChk'); c.checked = false; c.dispatchEvent(new Event('change')); document.getElementById('condSel').value = 'mint'; document.getElementById('condSel').dispatchEvent(new Event('change')); });
    await p.click(`#rpmSwitch button[data-rpm="${rpm}"]`); await p.click('#playBtn'); await p.waitForTimeout(5200);
    const r = await p.evaluate(async out => {
      const { samples, sr } = await window.__deck.Debug.capture(0.5);
      let f = out % sr; if (f > sr / 2) f = sr - f;                        // where it lands, folded if it is above Nyquist
      let re = 0, im = 0;
      for (let i = 0; i < samples.length; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / samples.length); re += samples[i] * w * Math.cos(2 * Math.PI * f * i / sr); im += samples[i] * w * Math.sin(2 * Math.PI * f * i / sr); }
      return { sr, f, db: 20 * Math.log10(Math.max(1e-9, 4 * Math.hypot(re, im) / samples.length / 0.5)) };
    }, hz * factor);
    await p.close();
    return r;
  };
  const a = await measure(20000, '78', 2.34), t = await measure(10000, '45', 1.35);
  console.log(`${name} (output ${a.sr} Hz): 20 kHz at 78 rpm folds back to ${a.f.toFixed(0)} Hz at ${a.db.toFixed(1)} dB.  10 kHz at 45 rpm comes out at ${t.f.toFixed(0)} Hz at ${t.db.toFixed(1)} dB (includes the record's own treble roll-off).`);
  await b.close();
})();
