// §0.1 F1: a guarantee that cannot name a mechanism is deleted. Every normative rule should
// name a Mechanism and an evaluation point.
import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const lines=fs.readFileSync(F,'utf8').split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
// a "rule" = a bolded clause id at line start: **F12 — , **R3.4.1 — , **K22 — , - **BOOK.2 — , | INV-x |
const RULE=/^(?:- )?\*\*((?:F\d+[a-z]?|R[\d.]+\d|K\d+|[A-Z][A-Z_]{2,}\.\d+|A-\d+|P\d+|V\d+|C\d+|E\d+|L\d+|DR\d+|RT\d+|PR\d+[a-z]?|INV-\d+)) (?:—|--) /;
const rules=[];
let inF=false;
for(let i=0;i<annexB;i++){
  if(/^\s*```/.test(lines[i])){inF=!inF;continue;}
  if(inF) continue;
  const m=lines[i].match(RULE);
  if(m) rules.push({id:m[1], line:i+1});
}
// window: from the rule line to the next rule line or blank-blank
for(let k=0;k<rules.length;k++){
  const a=rules[k].line-1, b=(k+1<rules.length? rules[k+1].line-1 : Math.min(a+30,annexB));
  const body=lines.slice(a, Math.min(b, a+30)).join('\n');
  rules[k].mech=/\*Mechanism/.test(body)||/Mechanism:/.test(body);
  rules[k].ep=/\*Evaluat|Evaluation point|Evaluated at/.test(body);
  rules[k].nonNorm=/\[NON-NORMATIVE\]/.test(lines[a]);
}
const noMech=rules.filter(r=>!r.mech&&!r.nonNorm);
const noEp=rules.filter(r=>r.mech&&!r.ep&&!r.nonNorm);
console.log(`normative rules detected: ${rules.length}`);
console.log(`without a named Mechanism: ${noMech.length}`);
console.log('  '+noMech.slice(0,40).map(r=>`${r.id}@${r.line}`).join(' '));
console.log(`with a Mechanism but no evaluation point: ${noEp.length}`);
console.log('  '+noEp.slice(0,40).map(r=>`${r.id}@${r.line}`).join(' '));
