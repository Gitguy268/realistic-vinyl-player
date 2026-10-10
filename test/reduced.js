// Usage: node reduced.js  — prefers-reduced-motion: the spin stays, wobble and vibration go
const { chromium } = require('playwright'); const path = require('path');
const { HTML } = require('./lib');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + path.resolve(HTML) + '?demo&debug'); await p.waitForTimeout(800);
  await p.evaluate(() => { const e = document.getElementById('impSlider'); e.value = 1; e.dispatchEvent(new Event('input')); });
  await p.click('#playBtn'); await p.waitForTimeout(4200);
  const s = await p.evaluate(async () => {
    const tf = () => document.getElementById('vinyl').style.transform, sheen = () => document.querySelector('.vinyl-sheen').style.transform, arm = () => document.getElementById('tonearm').style.transform;
    const a = [tf()], sh = new Set([sheen()]), arms = [];
    for (let i = 0; i < 30; i++) { await new Promise(r => requestAnimationFrame(r)); a.push(tf()); sh.add(sheen()); arms.push(parseFloat(arm().match(/rotate\(([-\d.]+)/)[1])); }
    const jitter = Math.max(...arms.slice(1).map((v, i) => Math.abs(v - arms[i])));
    return { spinning: new Set(a).size > 20, wobble: a[5], sheen: [...sh], armStepMax: jitter, bump: document.getElementById('turntable').classList.contains('bump') };
  });
  console.log(`reduced motion: record spinning ${s.spinning}; record transform "${s.wobble}" (no eccentric offset expected); sheen "${s.sheen.join('|')}"; largest arm step between frames ${s.armStepMax.toFixed(4)}° (groove drift only); bump animation ${s.bump}`);
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no console errors');
  await b.close();
})();
