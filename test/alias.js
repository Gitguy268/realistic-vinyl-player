// Usage: node alias.js [chromium|firefox|webkit]
// At 78 rpm a 20 kHz tone comes out at 46.8 kHz, above what the output can carry. How loud is what folds back down?
const pw = require('playwright'); const path = require('path'); const fs = require('fs');
const { HTML, WAV } = require('./lib');
(async () => {
  const [name = 'chromium'] = process.argv.slice(2);
  const wav = path.join(WAV, 'Tone 20k.wav'), sr = 48000, n = sr * 30;
  if (!fs.existsSync(wav)) {
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 20000 * i / sr) * 0.5 * 32767), 44 + i * 2);
    fs.writeFileSync(wav, b);
  }
  const b = await pw[name].launch(name === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {});
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file://' + path.resolve(HTML) + '?debug');
  await p.setInputFiles('#audioIn', wav); await p.waitForTimeout(700);
  await p.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }; set('noiseSlider', 0); set('impSlider', 0); const c = document.getElementById('sfxChk'); c.checked = false; c.dispatchEvent(new Event('change')); });
  await p.click('#rpmSwitch button[data-rpm="78"]'); await p.click('#playBtn'); await p.waitForTimeout(5200);
  const r = await p.evaluate(async () => {
    const { samples, sr } = await window.__deck.Debug.capture(0.5);
    let f = (20000 * 2.34) % sr; if (f > sr / 2) f = sr - f;                // where the tone folds to
    let re = 0, im = 0, sum = 0;
    for (let i = 0; i < samples.length; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / samples.length); re += samples[i] * w * Math.cos(2 * Math.PI * f * i / sr); im += samples[i] * w * Math.sin(2 * Math.PI * f * i / sr); sum += samples[i] * samples[i]; }
    return { sr, f, amp: 4 * Math.hypot(re, im) / samples.length, rms: Math.sqrt(sum / samples.length), wOn: window.__deck.Engine.wOn };
  });
  const db = v => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  console.log(`${name}: ${r.wOn ? 'worklet' : 'media element'}, output ${r.sr} Hz. 20 kHz tone (level 0.5) at 78 rpm folds to ${r.f.toFixed(0)} Hz: ${db(r.amp / 0.5)} dB relative to the tone (total output rms ${db(r.rms)} dBFS)`);
  await b.close();
})();
