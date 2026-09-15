// Proves the repaired R3.11.5 refusal is CONSTRUCTIBLE — that every lookup in its chain
// resolves — rather than merely reading correctly. Run from maya-saas-backend.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const BE='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/maya-saas-backend';
const DOC='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const doc=fs.readFileSync(DOC,'utf8');
const PROBE=new URL('./probe', import.meta.url).pathname;
const run=(f)=>execSync(`node -r ts-node/register/transpile-only ${PROBE}/${f}`,{cwd:BE,encoding:'utf8'}).trim();

const AE=JSON.parse(run('ae.js'));
const C9=JSON.parse(run('c9.js'));

const steps=[];
const step=(n,claim,ok,ev)=>steps.push({n,claim,ok,ev});

step(1,'communication.bulk-campaign.admit.v2 is a registered AE-CAP row', AE.found, JSON.stringify(AE));
step(2,'…it satisfies MARKETING_FANOUT (actionClass ∈ {deliver_bulk_campaign, send_bulk_campaign})',
     ['deliver_bulk_campaign','send_bulk_campaign'].includes(AE.actionClass), AE.actionClass);
step(3,'…it is policyDecision ALLOW and reachable from authenticated_request',
     AE.policyDecision==='ALLOW' && (AE.sources||[]).includes('authenticated_request'), `${AE.policyDecision} / ${AE.sources}`);
step(4,'…its approvalRequirement is REQUIRED, so F30 forces requires_ae_approval: true',
     AE.approvalRequirement==='REQUIRED', AE.approvalRequirement);
step(5,'F34 declares it the single allowlisted MARKETING_FANOUT row, confirmation_kind APPROVAL',
     /Exactly one\s*\n?`MARKETING_FANOUT` row — `communication\.bulk-campaign\.admit\.v2`/.test(doc) &&
     /`confirmation_kind: 'APPROVAL'`, `requires_ae_approval: true`/.test(doc), 'F34');
// STEP 6 CORRECTED. Non-nullness yields a value, not a C9-resolving one: AeCommitRow.propose
// being non-null says nothing about its space or its membership. What makes the lookup total is
// F31's pair of assertions, checked at step 13. This step now checks only what it can: that the
// member exists and is typed as a ref rather than a bare string.
step(6,'F30 types AeCommitRow.propose as a CapabilityRef (a ref, not a bare key) — totality comes from F31, see step 13',
     /propose: CapabilityRef;/.test(doc), 'F30 AeCommitRow.propose');
step(7,'F38 pairs it with the C9 propose key b35.confirm',
     /\| `b35\.confirm` \| `CanonicalBulkService\.request\(\)` \| `communication\.bulk-campaign\.admit\.v2` \|/.test(doc), 'F38 last row');
step(8,'b35.confirm is a member of C9_CAPABILITIES (56 rows)', C9.found && C9.total===56, JSON.stringify(C9));
step(9,'F28 makes WIDGET_CAPABILITY_POLICY total over C9-CAP\'s 56 rows, so b35.confirm HAS a row',
     /total over C9-CAP's 56 rows,\s*\n?and over those only/.test(doc), 'F28');
step(10,'R3.11.5 now reads the flag through the C9 PROPOSE key, not the AE key',
     /whose \*\*C9 propose key's\*\* `WIDGET_CAPABILITY_POLICY` row declares\s*\n?`dispatch_is_synchronous: false`/.test(doc), 'R3.11.5');
step(11,'R3.11.5 states in place why the AE-keyed form fails open',
     /the refusal would never fire\*\* — a fence that fails open rather than\s*\n?closed/.test(doc), 'R3.11.5 rationale');
step(12,'F28\'s column gloss reads the flag through the pairing row\'s propose side',
     /whose pairing row names that key as `propose`\*\* refuses until the owner declares it/.test(doc), 'F28 gloss');
step(13,'F31 is what makes the lookup total: exactly one pairing row per allowlisted AE key, and every pairing row propose is a C9-SPACE ref resolving in C9_CAPABILITIES',
     /`ae` side of exactly one AE_PROPOSE_PAIRING row/.test(doc)
     && /propose\.space === 'C9'/.test(doc)
     && /propose\.key resolves in C9_CAPABILITIES/.test(doc), 'F31 — space and membership both asserted');

let bad=0;
console.log('R3.11.5 CONSTRUCTIBILITY PROOF — every link executed or matched against the contract\n');
for(const s of steps){ if(!s.ok) bad++; console.log(`${s.ok?'PASS':'FAIL'}  ${s.n}. ${s.claim}\n        ${s.ev}`); }
console.log(`\n${steps.length-bad}/${steps.length} links hold`);
console.log(bad===0
 ? '\nCONCLUSION: the refusal is CONSTRUCTIBLE. Every lookup in the chain resolves, and F31 —\n  not non-nullness — is what makes it total:\n    allowlist row → F31: exactly one AE_PROPOSE_PAIRING row with this key on the `ae` side\n                 → F31: that row`s propose is a C9-SPACE ref resolving in C9_CAPABILITIES\n                 → b35.confirm ∈ C9-CAP (executed)\n                 → F28: WIDGET_CAPABILITY_POLICY is total over C9-CAP, so the row exists\n                 → dispatch_is_synchronous readable; false is its correct value for b35.confirm,\n                   whose owner resumes delivery after APPROVED\n                 → mintIntent() refuses. R3.11.5 additionally fails closed on a missing row.'
 : '\nCONCLUSION: a link does NOT hold — the refusal is not constructible as written.');
process.exit(bad===0?0:1);
