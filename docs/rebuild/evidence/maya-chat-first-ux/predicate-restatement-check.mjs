import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const text=fs.readFileSync(F,'utf8'); const lines=text.split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
// every `X(cap) :=` or `type X =` or `const X =` declaration, and every later use of ":=" on the same name
const declared=new Map();
for(let i=0;i<annexB;i++){
  const m=lines[i].match(/^([A-Z][A-Z0-9_]*)\s*\(cap\)\s*:?=/) || lines[i].match(/^\s*([A-Z][A-Z0-9_]*)\s*\(cap\)\s+:=/);
  if(m && !declared.has(m[1])) declared.set(m[1], i+1);
}
const restated=[];
for(let i=0;i<annexB;i++){
  for(const [name,decl] of declared){
    if(i+1===decl) continue;
    const re=new RegExp(`\`?${name}\\(cap\\)\`?\\s*:=`);
    if(re.test(lines[i])) restated.push(`${name} restated at line ${i+1} (declared ${decl})`);
  }
}
console.log('predicates declared with := :', [...declared].map(([k,v])=>`${k}@${v}`).join(' '));
console.log('restatements outside the declaration:', restated.length);
for(const r of restated) console.log('  '+r);
