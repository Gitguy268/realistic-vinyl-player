// Usage: node cmp.js <refDir> <newDir> [tolerancePx]
// Compares region rects state by state; prints only regions that moved more than the tolerance.
const fs = require('fs');
const [a, b, tolArg] = process.argv.slice(2);
const tol = parseFloat(tolArg || '4');
const A = JSON.parse(fs.readFileSync(a + '/rects.json')), B = JSON.parse(fs.readFileSync(b + '/rects.json'));
let worst = 0, bad = 0;
for (const state of Object.keys(A)) {
  if (!B[state]) { console.log(`MISSING state ${state}`); bad++; continue; }
  const lines = [];
  for (const k of Object.keys(A[state])) {
    const ra = A[state][k], rb = B[state][k];
    if (k === 'docHeight') { if (Math.abs(ra - rb) > tol) lines.push(`  docHeight ${ra} -> ${rb}`); continue; }
    if (!ra || !rb) { if (ra !== rb) lines.push(`  ${k}: ${ra} -> ${rb}`); continue; }
    const d = Math.max(...ra.map((v, i) => Math.abs(v - rb[i])));
    worst = Math.max(worst, d);
    if (d > tol) lines.push(`  ${k}: [${ra}] -> [${rb}]  (max Δ ${d.toFixed(1)})`);
  }
  if (lines.length) { bad++; console.log(state + '\n' + lines.join('\n')); }
}
console.log(`\n${Object.keys(A).length} states, ${bad} with a region off by > ${tol}px, worst Δ ${worst.toFixed(1)}px`);
