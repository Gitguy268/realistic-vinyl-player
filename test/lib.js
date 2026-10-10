// Shared helpers for the verification scripts.
const fs = require('fs');
const path = require('path');

// 16-bit mono WAV: a few harmonics plus a slow amplitude wobble so the bass ring has something to react to.
function makeWav(freq, seconds, sr = 22050) {
  const n = Math.floor(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t);
    const v = env * (0.5 * Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.2 * Math.sin(2 * Math.PI * 60 * t));
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 30000), 44 + i * 2);
  }
  return buf;
}

function wavFiles(dir = path.join(__dirname, 'out', 'wav')) {
  const specs = [['First Light', 220, 6], ['Second Wind', 330, 9], ['Third Rail', 440, 5]];
  fs.mkdirSync(dir, { recursive: true });
  return specs.map(([name, f, s]) => {
    const p = path.join(dir, name + '.wav');
    if (!fs.existsSync(p)) fs.writeFileSync(p, makeWav(f, s));
    return p;
  });
}

// Named layout regions, measured the same way on the original and the remake.
const rectsFn = () => {
  const q = s => document.querySelector(s);
  const rows = [...document.querySelectorAll('#app > .row')];
  const map = {
    app: q('#app'), hint: q('#hint'), files: q('.files'), turntable: q('#turntable'),
    vinylWrap: q('#vinylWrap'), liftRow: q('.lift-arm-row'), tracklist: q('.tracklist'),
    transportRow: rows[0], colorRow: q('.color-row'), volRow: rows[1], eqRow: rows[2],
    about: q('#aboutWrap'), focusBar: q('.focus-bar'), focusControls: q('#focusControls'),
  };
  const out = {};
  for (const [k, el] of Object.entries(map)) {
    if (!el) { out[k] = null; continue; }
    const r = el.getBoundingClientRect();
    out[k] = [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10);
  }
  out.docHeight = document.documentElement.scrollHeight;
  return out;
};

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const THEMES = { minimal: '', wood: 'theme-wood', clear: 'theme-clear' };

// Everything the scripts generate (WAVs, screenshots) goes to test/out, which is not committed.
const OUT = path.join(__dirname, 'out'), WAV = path.join(OUT, 'wav');
fs.mkdirSync(WAV, { recursive: true });
const HTML = process.env.HTML || path.join(__dirname, '..', 'index.html');

// Media keys and headset buttons reach every browser that plays audio, a headless one included, so pausing music
// elsewhere on this machine could pause the page under test. Keep the page's handlers away from the browser and
// collect them in window.__ms, where a test can call them.
// It also logs who calls Player.stop (with ?debug), so a run that pauses unexpectedly can say why.
const offKeys = target => target.addInitScript(() => {
  window.__ms = {};
  if (navigator.mediaSession) navigator.mediaSession.setActionHandler = (k, fn) => { window.__ms[k] = fn; };
  let deck;
  Object.defineProperty(window, '__deck', {
    get: () => deck,
    set(v) {
      deck = v;
      const stop = v.Player.stop;
      v.Player.stop = function () {
        console.log(`STOP at ${(performance.now() / 1000).toFixed(1)} s, hint "${document.getElementById('hint').textContent}", from ${(new Error().stack || '').split('\n').slice(1, 5).map(l => l.trim().replace(/\S*\/index\.html|\S*snap\.html/, '')).join(' < ')}`);
        return stop.apply(this, arguments);
      };
    }
  });
});

module.exports = { makeWav, wavFiles, rectsFn, VIEWPORTS, THEMES, OUT, WAV, HTML, offKeys };
