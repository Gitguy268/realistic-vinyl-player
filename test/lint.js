// Usage: node lint.js [--online]
// Zero-dependency checks: the inline script parses, the page loads nothing from outside,
// no debug leftovers, and every link in the docs resolves (external ones only with --online).
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const root = path.join(__dirname, '..');
// this project's own pages cannot be checked before it is published; localhost is the reader's machine
const SELF = /^https?:\/\/(github\.com\/Gitguy268\/realistic-vinyl-player|gitguy268\.github\.io\/realistic-vinyl-player|localhost)/;
const problems = [];
const bad = (file, msg) => problems.push(`${file}: ${msg}`);

// ── index.html ──
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
if (!scripts.length) bad('index.html', 'no inline script found');
for (const [, attrs, code] of scripts) {
  if (/\bsrc=/.test(attrs)) bad('index.html', 'external script: ' + attrs.trim());
  try { new vm.Script(code, { filename: 'index.html <script>' }); } catch (e) { bad('index.html', 'script does not parse: ' + e.message); }
}
// xmlns namespaces in inline SVG are identifiers, not requests
const outside = html.replace(/https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xhtml|1999\/xlink)/g, '').match(/(https?:)?\/\/[a-z0-9-]+\.[a-z]{2,}[^\s"'<>)]*/gi) || [];
for (const u of new Set(outside)) bad('index.html', 'reference to an outside address: ' + u);
html.split('\n').forEach((line, i) => {
  if (/\b(TODO|FIXME|XXX)\b|\bdebugger\b/.test(line)) bad(`index.html:${i + 1}`, 'leftover marker: ' + line.trim().slice(0, 80));
  if (/console\.(log|debug|info)\(/.test(line) && !/selftest/.test(line)) bad(`index.html:${i + 1}`, 'debug output: ' + line.trim().slice(0, 80));
  if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\s*\(/.test(line)) bad(`index.html:${i + 1}`, 'network call: ' + line.trim().slice(0, 80));
});
for (const need of ['<title>', 'name="description"', 'rel="icon"', 'name="viewport"', 'lang=']) if (!html.includes(need)) bad('index.html', 'missing ' + need);
for (const [img] of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(img)) bad('index.html', 'image without alt text: ' + img.slice(0, 80));

// ── links in the docs ──
const docs = fs.readdirSync(root).filter(f => /\.(md|txt|xml)$/.test(f))
  .concat(fs.readdirSync(path.join(root, '.github')).filter(f => f.endsWith('.md')).map(f => '.github/' + f));
const external = new Map();
for (const doc of docs) {
  const text = fs.readFileSync(path.join(root, doc), 'utf8');
  const links = [...text.matchAll(/\]\(([^)\s]+)\)|<(https?:[^>\s]+)>|^\[[^\]]+\]:\s*(\S+)|<loc>([^<]+)<\/loc>|^- \[[^\]]*\]\(([^)]+)\)/gm)].map(m => m[1] || m[2] || m[3] || m[4] || m[5]);
  for (const link of links) {
    if (/^https?:/.test(link)) { external.set(link.split('#')[0], doc); continue; }
    if (/^(#|mailto:)/.test(link)) continue;
    if (!fs.existsSync(path.join(root, path.dirname(doc), link.split('#')[0]))) bad(doc, 'broken link: ' + link);
  }
}

(async () => {
  if (process.argv.includes('--online')) {
    for (const [url, doc] of external) {
      if (SELF.test(url)) continue;
      try {
        const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'realistic-vinyl-player link check' }, signal: AbortSignal.timeout(15000) });
        if (r.status >= 400) bad(doc, `${r.status} ${url}`);
      } catch (e) { bad(doc, `unreachable ${url} (${e.message})`); }
    }
  }
  console.log(`lint: index.html (${scripts.length} script, ${Math.round(html.length / 1024)} kB), ${docs.length} documents, ${external.size} external links${process.argv.includes('--online') ? ' checked' : ' not fetched (use --online)'}`);
  if (problems.length) { console.log(problems.map(p => '  ✗ ' + p).join('\n')); process.exitCode = 1; } else console.log('  ok');
})();
