// For every "§N.M ... `Identifier`" or "§N.M Fnn" citation in normative text, check that the
// cited section actually contains that identifier / clause id.
import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const lines=fs.readFileSync(F,'utf8').split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
// section spans
const spans=[]; let cur=null;
for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^#{2,4}\s+(A?[\d]+(?:\.[\d]+)*)\s/);
  if(m){ if(cur) cur.end=i; cur={id:m[1],start:i,end:lines.length}; spans.push(cur); }
}
const textOf=(id)=>{
  // a citation of §0.8 covers §0.8 and its subsections
  const hits=spans.filter(s=>s.id===id||s.id.startsWith(id+'.'));
  if(!hits.length) return null;
  return hits.map(s=>lines.slice(s.start,s.end).join('\n')).join('\n');
};
const problems=[];
for(let i=0;i<annexB;i++){
  const l=lines[i];
  // "§N.M Fnn" / "§N.M R3.x.y" / "§N.M `Ident`" / "§N.M Xxx.n"
  for(const m of l.matchAll(/§(\d+(?:\.\d+)*)\s+((?:F\d+|R[\d.]+\d|[A-Z][A-Z_]{2,}\.\d+|`[A-Za-z_$][\w$]*`))/g)){
    const [full,sec,rawTok]=m;
    const tok=rawTok.replace(/`/g,'');
    const body=textOf(sec);
    if(body===null){ problems.push(`${i+1}: §${sec} does not exist  — "${full}"`); continue; }
    const declRe=new RegExp(`(?:interface|type|const|function|declare)\\s+${tok.replace(/[.$]/g,'\\$&')}\\b`);
    const present = body.includes('`'+tok+'`') || new RegExp(`\\*\\*${tok.replace(/[.$]/g,'\\$&')}\\b`).test(body)
                    || declRe.test(body) || body.includes(tok);
    if(!present) problems.push(`${i+1}: §${sec} does not contain ${tok}  — "${full}"`);
  }
}
console.log(`citations of the form "§N.M <token>" checked in normative text`);
console.log(`problems: ${problems.length}`);
for(const p of problems) console.log('  '+p);
