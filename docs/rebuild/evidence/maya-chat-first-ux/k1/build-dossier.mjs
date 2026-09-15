// K1 — the surface disposition dossier. Derives one row per inventory surface from the
// evidence, by an explicit rule table, and marks every field the evidence does not decide.
import fs from 'node:fs';
import path from 'node:path';
const E='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/evidence/maya-chat-first-ux/';
const inv=JSON.parse(fs.readFileSync(E+'surface-inventory.json','utf8'));
const disp=JSON.parse(fs.readFileSync(E+'surface-dispositions.json','utf8'));
const tri=JSON.parse(fs.readFileSync(E+'triage-135.json','utf8')).assignments;
const SEP=' |#| ';
const key=r=>path.basename(r.file||'')+SEP+(r.name||'').trim().toLowerCase();
const D=new Map(), T=new Map();
for(const r of disp) if(!D.has(key(r))) D.set(key(r),r);
for(const r of tri)  if(!T.has(key(r))) T.set(key(r),r);

// the rule table. One row per class; everything downstream derives from here.
const RULES={
 'KEEP AS CAPABILITY':            {succ:'CAPABILITY_IN_CHAT', parity:'the capability is reachable from chat in every channel that offers it today', retire:'NOT RETIRED - it becomes a capability', pkg:'K8/K10/K11'},
 'MOVE INTO CHAT WIDGET':         {succ:'WIDGET',             parity:'the widget emits every fact this surface showed, per kind per profile', retire:'RETIRE AFTER PARITY - K16', pkg:'K8'},
 'CONVERT TO WIDGET':             {succ:'WIDGET',             parity:'the widget emits every fact this surface showed, per kind per profile', retire:'RETIRE AFTER PARITY - K16', pkg:'K8'},
 'KEEP AS FULLSCREEN DETAIL':     {succ:'ROUTE_KEY',          parity:'the fullscreen_intent resolves and the route renders the same detail', retire:'NOT RETIRED - reached by HANDOFF', pkg:'K5'},
 'KEEP AS FULLSCREEN SECONDARY':  {succ:'ROUTE_KEY',          parity:'the route resolves under the same authority', retire:'NOT RETIRED - secondary route', pkg:'K5'},
 'KEEP AS CHAT SURFACE':          {succ:'CHAT',               parity:'chat carries it; no separate surface is required', retire:'NOT RETIRED - it is the conversation', pkg:'K5'},
 'MERGE':                         {succ:'MERGE_TARGET',       parity:'the merged surface covers both behaviours, neither silently dropped', retire:'RETIRE AFTER PARITY - K16', pkg:'K5/K8'},
 'SECURITY/AUTHORITY ONLY':       {succ:'SERVER_FENCE',       parity:'the fence fires independently of any UI, proved by test', retire:'RETIRED AS UI - K15; the fence remains server-side', pkg:'K15'},
 'SETTINGS / SECURITY ONLY':      {succ:'CLASS_S_DESTINATION',parity:'the destination is reachable by a class-s HANDOFF at its floor', retire:'RETIRE FROM PRIMARY NAV - K16', pkg:'K12'},
 'RETIRE FROM PRIMARY NAVIGATION':{succ:'CHAT_OR_ROUTE',      parity:'the successor is reachable and the nav target is met', retire:'RETIRE IN K16, row by row', pkg:'K16'},
 'RETIRE AFTER PARITY':           {succ:'NAMED_SUCCESSOR',    parity:'the named successor is proven against the fixture corpus', retire:'RETIRE IN K16', pkg:'K16'},
 'LEGACY / UNREACHABLE':          {succ:'NONE',               parity:'a recorded unreachability probe, not an assumption', retire:'RETIRE IN K16 after the probe is recorded', pkg:'K16'},
 'OUT OF SCOPE WITH EXACT REASON':{succ:'OUT_OF_SCOPE',       parity:'none - not this programme surface', retire:'NOT RETIRED - out of scope, with the reason on the row', pkg:'-'},
};
const rows=[]; const unknownClass=new Set();
for(const s of inv){
  const d=D.get(key(s)), t=T.get(key(s));
  const cls=(d?.disposition ?? t?.classification ?? '').trim();
  const rule=RULES[cls]; if(!rule) unknownClass.add(cls);
  const widgetType=(d?.widgetType||'').trim();
  const namedWidget = widgetType && !/^none/i.test(widgetType) ? widgetType : null;
  const caps0=Array.isArray(s.capabilities)?s.capabilities:[];
  const capStr=caps0.join(' / ');
  // Four provenances, and the distinction is the point of the dossier:
  //   EVIDENCE            the sweep names it
  //   DERIVED             the class plus the capability list fix it uniquely
  //   ASSIGNED BY <K>     the FORM is fixed; the instance is a later package's mechanical job
  //   REQUIRES SIGNATURE  a judgement, and the owner makes it
  const NAV=(c)=>{
    const t=c.toLowerCase();
    if(/consent|privacy|gdpr|152|erasure|personal data|pd\b/.test(t)) return 'Privacy & Data';
    if(/notification|push|reminder|quiet hours|delivery pref/.test(t)) return 'Notifications';
    if(/provider|integration|channel|oauth|link|bind|yclients|telegram|social/.test(t)) return 'Connections';
    if(/auth|identity|session|login|account|profile|tenant|subject/.test(t)) return 'Account';
    return null;
  };
  let successor, successorSource;
  const mergeTarget=(d?.rationale||'').match(/merge target:\s*([^.;]+)/i);
  if(namedWidget){ successor=namedWidget; successorSource='EVIDENCE - widgetType on the disposition row'; }
  else if(rule?.succ==='CHAT'){ successor='Maya (the conversation)'; successorSource='DERIVED - class'; }
  else if(rule?.succ==='OUT_OF_SCOPE'){ successor='- (out of scope)'; successorSource='DERIVED - class'; }
  else if(rule?.succ==='NONE'){ successor='- (none; unreachable)'; successorSource='DERIVED - class'; }
  else if(rule?.succ==='SERVER_FENCE'){ successor='server-side fence (no UI successor)'; successorSource='DERIVED - class'; }
  else if(rule?.succ==='CAPABILITY_IN_CHAT'){
    if(capStr){ successor='the capability, reached from chat: '+capStr; successorSource='DERIVED - class + inventory capabilities'; }
    else { successor='CAPABILITY_IN_CHAT - capability to be named'; successorSource='REQUIRES SIGNATURE'; } }
  else if(rule?.succ==='ROUTE_KEY'){
    successor='a route_key serving '+(capStr||'this surface')+'; the exact key is assigned by K5';
    successorSource='ASSIGNED BY K5'; }
  else if(rule?.succ==='WIDGET'){
    successor='a widget kind serving '+(capStr||'this surface')+'; the kind is assigned by K8';
    successorSource='ASSIGNED BY K8'; }
  else if(rule?.succ==='CLASS_S_DESTINATION'){
    const n=NAV(capStr+' '+s.name+' '+(d?.rationale||t?.reason||''));
    if(n){ successor=n+' (class-s destination)'; successorSource='DERIVED - class + capability keywords'; }
    else { successor='CLASS_S_DESTINATION - one of the five, to be named'; successorSource='REQUIRES SIGNATURE'; } }
  else if(rule?.succ==='CHAT_OR_ROUTE'){
    if(capStr){ successor='Maya, or the route serving '+capStr; successorSource='DERIVED - class + inventory capabilities'; }
    else { successor='CHAT_OR_ROUTE - successor to be named'; successorSource='REQUIRES SIGNATURE'; } }
  else if(rule?.succ==='MERGE_TARGET'){
    if(mergeTarget){ successor='merge into: '+mergeTarget[1].trim(); successorSource='EVIDENCE - rationale names the target'; }
    else { successor='MERGE_TARGET - the surface it folds into, to be named'; successorSource='REQUIRES SIGNATURE'; } }
  else { successor=(rule?.succ??'UNKNOWN')+' - instance to be named'; successorSource='REQUIRES SIGNATURE'; }
  const caps=caps0;
  rows.push({
    id:'S-'+String(rows.length+1).padStart(3,'0'),
    name:s.name, file:s.file, channel:s.channel, kind:s.kind, roleMode:s.roleMode,
    primaryNav:!!s.primaryNav, mayaOwned:s.channel!=='smm-bot',
    class:cls, classSource:d?'disposition sweep':'triage of the 135',
    successor, successorSource,
    canonicalOwner: caps.length?caps.join(' / '):'- (no capability named on the inventory row)',
    canonicalOwnerSource: caps.length?'EVIDENCE - inventory capabilities':'REQUIRES SIGNATURE',
    parityRequirement: rule?.parity ?? 'REQUIRES SIGNATURE',
    retirementCondition: rule?.retire ?? 'REQUIRES SIGNATURE',
    package: rule?.pkg ?? '-',
    parityRiskNote: (d?.parityRisk||'').trim()||null,
    rationale: (d?.rationale || t?.reason || '').trim()||null,
  });
}
if(unknownClass.size){ console.error('UNKNOWN CLASSES:', [...unknownClass]); process.exit(1); }
fs.writeFileSync(process.argv[2], JSON.stringify(rows,null,1));
const by=f=>rows.reduce((m,r)=>(m[r[f]]=(m[r[f]]||0)+1,m),{});
console.log('rows:', rows.length);
console.log('by class:'); for(const [k,v] of Object.entries(by('class')).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
const prov=rows.reduce((m,r)=>{const k=r.successorSource.split(' - ')[0];m[k]=(m[k]||0)+1;return m;},{});
console.log('successor provenance:'); for(const [k,v] of Object.entries(prov).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log('owner needs signature    :', rows.filter(r=>r.canonicalOwnerSource==='REQUIRES SIGNATURE').length);
console.log('primaryNav:', rows.filter(r=>r.primaryNav).length, '| Maya-owned:', rows.filter(r=>r.primaryNav&&r.mayaOwned).length);
