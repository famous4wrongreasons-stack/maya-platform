// K1 — the two ledgers and the parity harness, all derived from the certified contract.
import fs from 'node:fs';
const C='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const con=fs.readFileSync(C,'utf8');
const out=process.argv[2];

// ── 1. the capability-gap ledger: every GAP- key the contract names ──────────
const gapKeys=[...new Set([...con.matchAll(/`(GAP-[A-Z][A-Z-]+)`/g)].map(m=>m[1]))].sort();
// the eight acts §0.21 residual 4 / §A1.6 tracks, with their verified owner state
const EIGHT={
 'GAP-CONSENT-PD-GRANT':      {act:'record a 152-FZ base consent',            owner:'registered_elsewhere', ev:'package5.wave3.record-client-consent.execute.v1, kind privacy, granted true'},
 'GAP-CONSENT-PD-WITHDRAW':   {act:'withdraw a 152-FZ base consent',          owner:'registered_elsewhere', ev:'the same call, granted false - granted:false IS the revocation'},
 'GAP-CONSENT-MKT-GRANT':     {act:'grant marketing consent',                 owner:'registered_elsewhere', ev:'the same call, kind marketing'},
 'GAP-CONSENT-MKT-REVOKE':    {act:'revoke marketing consent',                owner:'registered_elsewhere', ev:'the same call, kind marketing, granted false'},
 'GAP-IDENTITY-CLIENT-UNBIND':{act:'unbind a client channel',                 owner:'unreachable',          ev:'ClientChannelLinkService.revoke() has zero callers; its only transactional caller declares allowedSourceTypes legacy_bridge only'},
 'GAP-IDENTITY-STAFF-UNBIND': {act:'unbind a staff Telegram identity',        owner:'none',                 ev:'binding exists at auth/social-auth.service.ts completeTelegramLink; no unbind of any kind exists'},
 'GAP-CONSENT-REGISTER-EXPORT':{act:'export the consent register',            owner:'none',                 ev:'zero occurrences of any consent-register export under src'},
 'GAP-HISTORY-ERASE':         {act:'erase conversation history as a data-subject right', owner:'none',      ev:'the only erasure in the tree is a maintenance-run payload erasure, not a data-subject right'},
};
const capGap=gapKeys.map(k=>({
  gapKey:k,
  act: EIGHT[k]?.act ?? 'named by the contract; the act is stated at its declaring clause',
  ownerState: EIGHT[k]?.owner ?? 'none',
  evidence: EIGHT[k]?.ev ?? 'declared in the certified contract (see F36/F37 and the kind bodies)',
  openedAt:'K1',
  closedAt:null, closingCommit:null,
  isOneOfTheEight: !!EIGHT[k],
}));

// ── 2. the mechanism-gap ledger: one row per prerequisite in the current contract ──
const pRows=[...con.matchAll(/^\| \*\*(P-\d\d)\*\* \| \*\*(.+?)\*\*(.*)$/gm)];
const mechGap=pRows.map(m=>{
  const [_,p,component,rest]=m;
  const st=(rest.match(/`(\[ABSENT\]|\[PARTIAL\]|\[UNENFORCEABLE-TODAY\]|\[EXISTS\])`/)||[])[1] ?? '[ABSENT]';
  const pkg=[...new Set([...rest.matchAll(/\*\*(K1[0-6]|K[1-9])\*\*/g)].map(x=>x[1]))];
  return {gapKey:'MG-'+p, pRef:p, component:component.replace(/`/g,''), status:st,
          packageKey:pkg.length?pkg.join('+'):'NONE - outside the sixteen', blockingRules:[]};
});

// ── 3. the parity harness. RED BY DEFAULT: nothing is green until evidence exists ──
const dossier=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const harness=dossier.map(r=>({
  id:r.id, name:r.name, channel:r.channel, class:r.class, package:r.package,
  parityRequirement:r.parityRequirement,
  successorExists:'RED', parity:'RED', authority:'RED', accessibility:'RED',
  darkWindow:'RED', deepLinkHandoff:'RED',
  retirable:false,
  retirementCondition:r.retirementCondition,
}));
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/k1-capability-gap-ledger.json',JSON.stringify({contract:'maya.k1.capability-gap-ledger/1',rows:capGap},null,1));
fs.writeFileSync(out+'/k1-mechanism-gap-ledger.json',JSON.stringify({contract:'maya.k1.mechanism-gap-ledger/1',rows:mechGap},null,1));
fs.writeFileSync(out+'/k1-parity-harness.json',JSON.stringify({contract:'maya.k1.parity-harness/1',
  rule:'emitted RED by default. A row turns green only when its evidence exists - a passing test, a recorded probe, a signed dossier - and the harness reads the evidence, never a checkbox. No package may mark its own row green.',
  rows:harness},null,1));
console.log('capability-gap ledger rows:', capGap.length, '| of the eight tracked acts:', capGap.filter(r=>r.isOneOfTheEight).length);
console.log('mechanism-gap ledger rows :', mechGap.length);
console.log('  by status:', JSON.stringify(mechGap.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{})));
console.log('  outside the sixteen:', mechGap.filter(r=>r.packageKey.startsWith('NONE')).map(r=>r.pRef).join(', '));
console.log('parity harness rows       :', harness.length, '| green:', harness.filter(r=>r.parity==='GREEN').length, '| retirable:', harness.filter(r=>r.retirable).length);
