// K2 — extract the certified contract's TypeScript into modules.
// The contract IS the source. Nothing is retyped by hand, so nothing can drift from it.
import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const lines=fs.readFileSync(F,'utf8').split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
const blocks=[]; let sec=null;
for(let i=0;i<annexB;i++){
  const m=lines[i].match(/^#{2,4}\s+(A?[\d.]+)\s/); if(m) sec=m[1];
  if(!lines[i].trim().startsWith('```ts')) continue;
  let j=i+1, body=[];
  while(j<annexB && !lines[j].trim().startsWith('```')){ body.push(lines[j]); j+=1; }
  blocks.push({sec, line:i+1, body:body.join('\n')}); i=j;
}
// module assignment follows §0.2's ownership map
const MOD=sec=>{
  const n=parseFloat(sec);
  if(sec.startsWith('0.5')) return 'envelope-roots';
  if(sec.startsWith('0.6')) return 'capability-ref';
  if(sec.startsWith('0.7')) return 'registries';
  if(sec.startsWith('0.8')) return 'verification-floor';
  if(sec.startsWith('0.13')||sec.startsWith('0.14')) return 'confirmation-guard';
  if(sec.startsWith('1.')) return 'envelope';
  if(sec.startsWith('2.')) return 'kinds';
  if(sec.startsWith('3.')) return 'intent';
  if(sec.startsWith('4.')) return 'lifecycle';
  return 'misc';
};
const mods={};
for(const b of blocks){ const m=MOD(b.sec); (mods[m] ||= []).push(b); }
const decls=b=>[...b.body.matchAll(/^(?:export\s+)?(?:declare\s+)?(?:interface|type|const|function|class)\s+(\w+)/gm)].map(x=>x[1]);
console.log('blocks:',blocks.length);
for(const [m,bs] of Object.entries(mods)){
  const names=bs.flatMap(decls);
  console.log(`  ${m.padEnd(20)} ${String(bs.length).padStart(2)} blocks, ${String(names.length).padStart(3)} declarations`);
}
fs.writeFileSync(process.argv[2], JSON.stringify(mods,null,1));
// every declared name, and where
const all={};
for(const [m,bs] of Object.entries(mods)) for(const b of bs) for(const d of decls(b)) (all[d] ||= []).push(`${m}:§${b.sec}`);
const dupes=Object.entries(all).filter(([,v])=>v.length>1);
console.log('\ntotal distinct declarations:',Object.keys(all).length);
console.log('declared in more than one block:',dupes.length, dupes.map(([k,v])=>`${k}(${v.join(',')})`).join(' ')||'none');
