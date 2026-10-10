// Usage: node shots.js <index.html> <outDir> [--block-cdn]
// Screenshots + region rects for every theme x scheme x viewport, empty and loaded, plus focus mode.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { wavFiles, rectsFn, VIEWPORTS, THEMES } = require('./lib');

(async () => {
  const [html, outDir, flag] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const wavs = wavFiles();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const rects = {};
  const errors = [];
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    for (const scheme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: 1,
        hasTouch: vp === 'phone', isMobile: vp === 'phone' });
      if (flag === '--block-cdn') await ctx.route(/^https?:/, r => r.abort());
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(`${vp}/${scheme}: ${m.text()}`); });
      page.on('pageerror', e => errors.push(`${vp}/${scheme}: ${e.message}`));
      await page.goto('file://' + path.resolve(html));
      await page.waitForTimeout(flag === '--block-cdn' ? 300 : 1500);
      for (const [name, cls] of Object.entries(THEMES)) {
        await page.selectOption('#themeSel', cls);
        await page.waitForTimeout(450);
        const key = `${vp}-${scheme}-${name}`;
        if (name === 'minimal') {
          rects[key + '-empty'] = await page.evaluate(rectsFn);
          await page.screenshot({ path: path.join(outDir, key + '-empty.png'), fullPage: true });
          await page.setInputFiles('#audioIn', wavs);
          await page.waitForTimeout(1200);
        }
        rects[key] = await page.evaluate(rectsFn);
        await page.screenshot({ path: path.join(outDir, key + '.png'), fullPage: true });
      }
      await page.selectOption('#themeSel', '');
      await page.evaluate(() => document.getElementById('focusBtn').click());
      await page.waitForTimeout(600);
      rects[`${vp}-${scheme}-focus`] = await page.evaluate(rectsFn);
      await page.screenshot({ path: path.join(outDir, `${vp}-${scheme}-focus.png`) });
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(outDir, 'rects.json'), JSON.stringify(rects, null, 1));
  console.log(`${Object.keys(rects).length} states captured -> ${outDir}`);
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
})();
