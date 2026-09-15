import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const lines=fs.readFileSync(F,'utf8').split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
const KINDS=['CHOICE','SERVICE_SELECTOR','STAFF_SELECTOR','TIME_SLOT_SELECTOR','BOOKING_CONFIRMATION',
 'SCHEDULE','CLIENT_LIST','METRIC','CHART','REPORT','STRATEGY_OPTIONS','APPROVAL','PROGRESS',
 'LIMITATION','SOURCE_STATUS','SETTINGS_DRAFT','FORM','CONSENT_STATE','IDENTITY_BINDING',
 'PAYMENT_HANDOFF','MEDIA_PREVIEW','ARTIFACT'];
// find markdown tables whose first column is mostly kind names
let i=0; const reports=[];
while(i<annexB){
  if(!/^\|/.test(lines[i])){i++;continue;}
  const start=i; while(i<annexB && /^\|/.test(lines[i])) i++;
  const rows=lines.slice(start,i);
  const first=rows.map(r=>r.split('|')[1]||'').map(c=>c.replace(/[`*\s]/g,''));
  const named=new Set(); let anyKind=false;
  for(const c of first){ for(const k of KINDS){ if(c===k){named.add(k);anyKind=true;} } }
  // multi-kind cells: "| `A`, `B`, `C` | ..."
  if(anyKind||rows.some(r=>KINDS.filter(k=>r.split('|')[1]?.includes(k)).length>1)){
    for(const r of rows){ const c=r.split('|')[1]||''; for(const k of KINDS) if(c.includes(k)) named.add(k); }
    const missing=KINDS.filter(k=>!named.has(k));
    if(named.size>=6) reports.push({line:start+1, have:named.size, missing});
  }
}
console.log('per-kind tables found (≥6 kinds in column 1):', reports.length);
for(const r of reports) console.log(`  line ${r.line}: ${r.have}/22${r.missing.length?'  MISSING: '+r.missing.join(', '):'  TOTAL'}`);
