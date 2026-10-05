from pathlib import Path
import datetime,hashlib,json,subprocess
root=Path.cwd();repo=root/'work/maya-controlled-integration';work=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002';r=out/'receipts';candidate=(work/'HEAD').read_text().strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())

def ref(p): return {'path':str(p.relative_to(out)), 'sha256':sha(p)}
def checked(name,status='status',value='PASS'):
 d=read(out/name);assert d['candidate']==candidate and d[status]==value,(name,d.get(status));return d

assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==candidate
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
complete=checked('COMPLETE-MUTATIONS.json');assert complete['applicableKills']==533 and complete['parts']==67
# Passive child-process diagnostics cannot turn a red baseline into an admitted result.
# The abandoned attempt is retained separately; only the complete new corpus is admitted.
restart=read(out/'NATIVE-RESTART-PROVENANCE.json')
assert restart['candidate']==candidate and restart['oldAttemptAdmissible'] is False and restart['oldCompletedPartsAdmitted']==0
child_traces=[]
for p in sorted(r.glob('r06-native-worker-*.jsonl')):
 rows=[json.loads(line) for line in p.read_text().splitlines()]
 assert rows and all(d['status']==0 and d['signal'] is None and d['error'] is None and d['timeout']==20000 for d in rows),(p.name,rows)
 child_traces.append({'file':ref(p),'executions':len(rows),'maxElapsedMs':max(d['elapsedMs'] for d in rows)})
assert len(child_traces)==6
(out/'R06-CURRENT-CORPUS-DIAGNOSTICS.json').write_text(json.dumps({'candidate':candidate,'status':'PASS','currentCorpus':child_traces,'originalTimeoutMs':20000,'timeoutsChanged':False,'excludedAttempt':ref(out/'NATIVE-RESTART-PROVENANCE.json'),'historicalFailureCause':'Undetermined; no claim of a product or harness repair. Abandoned corpus is not admitted. Every current unmutated baseline must independently pass the strict collector.'},indent=2)+'\n')
assert all(x['localMarginTo180Minutes']>0 for x in complete['localJobTimings'])
checked('FINAL-REPORT-PATH-REPAIR.json');checked('HARNESS-SMOKE-ORDER.json');checked('HARNESS-RUNTIME-ORDER.json');checked('CI-POSTCONDITIONS.json');parity=checked('ARTIFACT-HASH-PARITY.json','parity')
checked('FINAL-ARTIFACT-STABILITY.json');lifecycle=checked('FINAL-PROCESS-LIFECYCLE.json')
assert lifecycle['remainingOwnedProcesses']==[] and lifecycle['remainingCurrentRunProofDbSessions']==[]
checked('FINAL-ORCHESTRATION-SOURCES.json');environment=checked('HOST-ENVIRONMENT-CHECK.json')
assert not environment['reexecutionRequired']
decisions=checked('FINAL-OWNER-DECISIONS-PROOF.json')
for n in ['AR1-NATIVE-PROOF.json','PRODUCTION-EXECUTION-PROOF.json','PROFILE-NATIVE-PROOF.json','SUCCESSOR-CURRENT-PROOF.json','9.6-CURRENT-PROOF.json','BS1-NS1-CURRENT-PROOF.json','L27-CURRENT-PROOF.json']:
 checked(n)
fbe=checked('FBE2E-DISPOSITION.json','completeApplicableNativeCorpus')
assert fbe['counts']=={'CLOSED':26,'ACCEPTED':2}
assert {x['id'] for x in fbe['limitations'] if x['after']=='ACCEPTED'}=={'L23','L26'}
assert len(fbe['limitations'])==28
groups={'backend_and_platform': ['npm-audit', 'prisma-generate', 'prisma-validate', 'synthetic-smoke-migration', 'synthetic-smoke-seed', 'backend-typecheck', 'scripts-typecheck', 'lint', 'k3', 'backend-full', 'e2e', 'events-db-migration', 'events-live', 'backend-build', 'platform-http-smoke'], 'legacy_python': ['python-compile', 'legacy-python-full'], 'frontend_gates': ['frontend-inline', 'prepublication-contracts', 'prepublication-counterfactuals'], 'widget_contract': ['contract-compile', 'contract-check', 'k1-dossier'], 'widgets_live': ['proof-db-migration', 'live-typecheck', 'widgets-live-full', 'http-bin', 'release-binary', 'evidence-verifier'], 'runtime_node22': ['runtime-build', 'runtime-hash-check', 'runtime-self-test', 'runtime-typecheck', 'runtime-full', 'icons', 'k5-exit', 'k15-census'], 'runtime_node24': ['node24-runtime-check', 'node24-runtime-selftest', 'node24-runtime-typecheck', 'node24-runtime-full', 'node24-icons'], 'carrier': ['carrier-build', 'carrier-capacitor-build', 'carrier-typecheck', 'carrier-full', 'carrier-harness', 'carrier-ratchet-selftest'], 'safe_integration': ['ns1-16-step', 'l27-17-step', 'fbe2e-canonical-net-roundtrip', 'fbe2e-canonical-net-turn', 'fbe2e-canonical-net-bin', 'fbe2e-compiled-net-bin', 'fbe2e-compiled-receipt-net-bin', 'fbe2e-l27-postcommit-dismiss'], 'mutation_integrity_and_assembly': ['mutation-ci-integrity', 'mutation-inventory', 'mutation-assemble'], 'requested_baselines': ['requested-baselines-1', 'requested-baselines-2', 'requested-baselines-3'], 'extra_runtime_mutation_control': ['l27-mutations-baseline'], 'browser_observation': ['l25-browser']}

indexed={}
for group,names in groups.items():
 indexed[group]=[]
 for name in names:
  p=r/(name+'.receipt.json');v=read(p);assert v['candidate']==candidate and v['exit']==0,name
  indexed[group].append({'name':name,'receipt':ref(p),'log':ref(r/(name+'.log')),'seconds':v.get('seconds')})
matrix=read(out/'FRESH-CLAUSE-EVIDENCE.json')
assert matrix['candidate']==candidate and len(matrix['rows'])==165
assert matrix['profileApplicableFalse']==0 and matrix['globalFalse']==2
matrix.update(completeMutationCertification='PASS',completeMutationReceiptSha256=sha(out/'COMPLETE-MUTATIONS.json'),
    certifiedForProfile=True,fullContractCertified=False,
    countMeaning='163 applicable clauses have current source/contract dispositions, fresh HTTP/BIN/U evidence and complete unrestricted native admission. G6-6 and G13-R8 remain globally false/STOP.',
    overallThreshold='SATISFIED FOR closed-input.no-handoff@1 ONLY; full contract remains false; no production authority granted')
for row in matrix['rows']:
 row['certificationAdmitted']=row['state']!='false'

# A reviewable unsigned synthetic payload, validated by the actual compiled canonical parser.
# It grants nothing and is not a signed activation authorization.
policy=repo/'docs/rebuild/widget-release-programme/approved-release/OWNER-DECISIONS.md'
profile=repo/'docs/rebuild/widget-release-programme/profile-isolation/DESIGN.md'
live=read(r/'widgets-live-full.json')
u_tests=[{'source':Path(t['name']).name,'assertions':t['assertionResults']} for t in live['testResults']
    if Path(t['name']).name in ['e1-production-trigger.live-spec.ts','closed-release-scope.live-spec.ts','final-u-scope.live-spec.ts']]
assert len(u_tests)==3 and all(a['status']=='passed' for t in u_tests for a in t['assertions'])
u_binding={'candidate':candidate,'policy':{'path':str(policy.relative_to(repo)),'sha256':sha(policy)},
    'approvedProfile':{'path':str(profile.relative_to(repo)),'sha256':sha(profile)},
    'freshLiveReceipt':ref(r/'widgets-live-full.json'),'currentAssertions':u_tests,
    'meaning':'The named current tests jointly exercise OD-3 absence/refusal/mechanism duties. Policy files supply approved scope only; historical receipts are not admitted.'}
(out/'U-DUTY-BINDING.json').write_text(json.dumps(u_binding,indent=2)+'\n')
# Running-digest algorithm is the canonical AR1 verifier, not the separate artifact inventory hash.
node_exe='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin/node'
running_digest=subprocess.check_output([node_exe,'-e',"const {WidgetReleasePolicy}=require('./dist/src/entitlements/widget-release-policy.service');const {ConfigService}=require('@nestjs/config');console.log(new WidgetReleasePolicy(new ConfigService({NODE_ENV:'production'})).buildDigest())"],cwd=repo/'maya-saas-backend',text=True).strip()
assert len(running_digest)==64
input_path=work/'certificate-input.json' 
input_path.write_text(json.dumps({'candidate':candidate,'matrix':matrix['rows'],
    'buildDigest':running_digest,
    'carrierDigest':next(t['inventorySha256'] for t in parity['trees'] if t['root']=='maya-carrier-react/dist/web'),
    'evidenceDigest':sha(out/'COMPLETE-MUTATIONS.json'),
    'integrationDigest':sha(out/'9.6-CURRENT-PROOF.json'),
    'fbe2eDigest':sha(out/'FBE2E-DISPOSITION.json'),
    'revocationProofDigest':sha(out/'AR1-NATIVE-PROOF.json'),
    'isolationProofDigest':sha(out/'PROFILE-NATIVE-PROOF.json'),
    'dependencyProofDigest':sha(out/'BS1-NS1-CURRENT-PROOF.json'),
    'uBinding':u_binding},indent=2)+'\n')
js="""
const fs=require('fs');
const {profileCertificate,fullContractCertificate,PROFILE_CERT,NO_HANDOFF_PROFILE,PROFILE_DIGEST,PROFILE_REGISTRY_DIGEST}=require('./dist/src/entitlements/widget-release-profile.contract');
const {releaseHash}=require('./dist/src/entitlements/widget-release.contract');
const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const matrix=d.matrix.map(r=>{
 const row={id:r.id,state:r.state==='false'?'STOP':r.state,evidenceDigest:releaseHash({candidate:d.candidate,id:r.id,evidence:r.freshEvidence,disposition:r.state})};
 if(row.state==='U')row.u={decisionDigest:releaseHash({policy:d.uBinding.policy,profile:d.uBinding.approvedProfile,id:r.id}),absence:releaseHash({duty:'absence',id:r.id,proof:d.uBinding,evidence:r.freshEvidence}),refusal:releaseHash({duty:'refusal',id:r.id,proof:d.uBinding,evidence:r.freshEvidence}),mechanism:releaseHash({duty:'mechanism',id:r.id,proof:d.uBinding,evidence:r.freshEvidence})};
 return row;
});
const now=new Date();
const c={contract:PROFILE_CERT,environment:'synthetic',scope:NO_HANDOFF_PROFILE,certification:'CERTIFIED_FOR_PROFILE',candidateSha:d.candidate,profileDigest:PROFILE_DIGEST,registryDigest:PROFILE_REGISTRY_DIGEST,matrix,globalAuditDigest:releaseHash(matrix),issuedAt:now.toISOString(),expiresAt:new Date(+now+24*60*60*1000).toISOString()};
for(const k of ['buildDigest','carrierDigest','evidenceDigest','integrationDigest','fbe2eDigest','revocationProofDigest','isolationProofDigest','dependencyProofDigest'])c[k]=d[k];
profileCertificate(c);
let refused=false;try{fullContractCertificate(c)}catch{refused=true}
if(!refused)throw Error('Profile passed full contract parser');
console.log(JSON.stringify({payload:c,digest:releaseHash(c),profileParser:'PASS',fullContractParser:'REFUSED',signed:false,authorizationIssued:false,entitlementMutation:false}));
"""
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin/node'
validation=json.loads(subprocess.check_output([node,'-e',js,str(input_path)],cwd=repo/'maya-saas-backend',text=True))
assert validation['profileParser']=='PASS' and validation['fullContractParser']=='REFUSED'
(out/'FRESH-CLAUSE-EVIDENCE.json').write_text(json.dumps(matrix,indent=2)+'\n')
(out/'PROFILE-CERTIFICATE-PROPOSAL.json').write_text(json.dumps({'candidate':candidate,**validation},indent=2)+'\n')
components=read(out/'COMPONENT-RECEIPTS.json')
result={'candidate':candidate,'profile':'closed-input.no-handoff@1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'ownerDecisionResults':{'L2':'PASS','L5/L24':'PASS','L20':'PASS','L23':'ACCEPTED','L25':'PASS','L26':'ACCEPTED + ADMISSION REFUSAL PASS'},
    'fullMutations':'PASS','mutationCorpus':{'batteries':46,'parts':67,'declarations':536,'applicableKills':533,'handoffPending':2,'preexistingEquivalent':1,'extraL27Kills':8,'historicalReceiptsAdmitted':0},
    'localCiEquivalent':'PASS','remoteGitHubRunClaimed':False,'remoteBranchProtectionClaimed':False,
    'executionScope':'Local macOS arm64; Node22/24; Python; dedicated PostgreSQL16. Complete workflow commands/postconditions; no hosted Linux or device run claimed.',
    'groups':indexed,'componentResults':components,'fbe2e':'PASS','fbe2eCounts':fbe['counts'],
    'ns1':'PASS','l27':'PASS','pwaCarrierParity':'PASS','profileApplicableFalse':0,'globalFalse':2,'globalStops':['G6-6','G13-R8'],
    'productionUnlockContract':'PASS','productionExecutionPathCertified':True,'readyForOwnerProductionExecutionAuthorization':True,'certifiedForProfile':True,'fullContractCertified':False,'readyForReleaseAuthorization':True,'remainingBlockers':[],
    'certificateProposal':ref(out/'PROFILE-CERTIFICATE-PROPOSAL.json'),'certificateSigned':False,'productionAuthorized':False,
    'productionEffects':0,'productionMigrationApplied':False,'realOtpEffects':0,'realYclientsEffects':0,'iphoneReinstalled':False,'chapter10Started':False,
    'admissionBoundary':'Strict complete fresh native release collector passed. L23 structural limitation and L26 archival boundary remain explicitly accepted for this exact candidate. Evidence readiness is not production activation authorization.',
    'additionalProofs':[ref(out/n) for n in ['FINAL-REPORT-PATH-REPAIR.json','R06-CURRENT-CORPUS-DIAGNOSTICS.json','NATIVE-RESTART-PROVENANCE.json','FINAL-OWNER-DECISIONS-PROOF.json','FBE2E-DISPOSITION.json','FRESH-CLAUSE-EVIDENCE.json','COMPLETE-MUTATIONS.json','AR1-NATIVE-PROOF.json','PRODUCTION-EXECUTION-PROOF.json','PROFILE-NATIVE-PROOF.json','SUCCESSOR-CURRENT-PROOF.json','9.6-CURRENT-PROOF.json','BS1-NS1-CURRENT-PROOF.json','ARTIFACT-HASH-PARITY.json','FINAL-ARTIFACT-STABILITY.json','FINAL-PROCESS-LIFECYCLE.json','HOST-ENVIRONMENT-CHECK.json','FINAL-ORCHESTRATION-SOURCES.json','HARNESS-SMOKE-ORDER.json','HARNESS-RUNTIME-ORDER.json']]}
(out/'CERTIFICATION-RECEIPTS.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['candidate','ownerDecisionResults','fullMutations','localCiEquivalent','fbe2e','profileApplicableFalse','globalFalse','certifiedForProfile','fullContractCertified','readyForReleaseAuthorization','remainingBlockers']}))
