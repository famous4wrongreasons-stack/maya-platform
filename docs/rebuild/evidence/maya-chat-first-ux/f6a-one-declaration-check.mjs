// Implements the F6a build test over the contract document.
import fs from 'node:fs';
const F = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const lines = fs.readFileSync(F, 'utf8').split('\n');
const annexB = lines.findIndex(l => l.startsWith('# Annex B'));
let sec = '(preamble)', inFence = false;
const decls = new Map();           // identifier -> [{sec, line}]
const DECL = /^\s*(?:export\s+)?(?:declare\s+)?(?:const|type|interface|function|class)\s+([A-Za-z_$][\w$]*)/;
for (let i = 0; i < (annexB < 0 ? lines.length : annexB); i++) {
  const l = lines[i];
  const h = l.match(/^#{2,4}\s+(A?[\d.]+|A\.\d+)\s/);
  if (h && !inFence) sec = h[1];
  if (/^\s*```/.test(l)) { inFence = !inFence; continue; }
  if (!inFence) continue;
  const m = l.match(DECL);
  if (!m) continue;
  if (/^\s*\/\//.test(l)) continue;
  const name = m[1];
  if (!decls.has(name)) decls.set(name, []);
  const rows = decls.get(name);
  if (!rows.some(r => r.sec === sec)) rows.push({ sec, line: i + 1 });
}
const dupes = [...decls].filter(([, r]) => r.length > 1);
console.log(`identifiers declared in a fenced block: ${decls.size}`);
console.log(`declared in MORE THAN ONE section: ${dupes.length}`);
for (const [n, r] of dupes) console.log(`  ${n}: ${r.map(x => `§${x.sec}:${x.line}`).join('  ')}`);
// "not restated here" sentences whose subject is declared in the same section
const claims = [];
for (let i = 0; i < (annexB < 0 ? lines.length : annexB); i++) {
  if (/not (?:re-)?(?:re)?stated here|is not re-declared here|and is not restated here/.test(lines[i])) claims.push(i + 1);
}
console.log(`\n"not restated here" sentences: ${claims.length} at ${claims.join(', ')}`);
