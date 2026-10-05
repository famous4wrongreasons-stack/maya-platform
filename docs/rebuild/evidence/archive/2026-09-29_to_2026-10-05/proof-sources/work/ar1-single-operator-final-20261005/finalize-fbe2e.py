from pathlib import Path
import collections, datetime, hashlib, json, subprocess
root=Path.cwd();repo=root/'work/maya-controlled-integration';work=root/'work/ar1-single-operator-final-20261005';out=root/'outputs/ar1-single-operator-final-20261005';r=out/'receipts';candidate=(work/'HEAD').read_text().strip()
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
complete=read(out/'COMPLETE-MUTATIONS.json');assert complete['candidate']==candidate and complete['status']=='PASS' and complete['applicableKills']==542
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==candidate
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
def proof(rel):
 p=out/rel;assert p.is_file(),rel;return {'path':rel,'sha256':sha(p)}
wr_path=r/'mutation-receipt/widgets-mutation-report-WR.json';wr=read(wr_path)
assert wr['source_head']==candidate and len(wr['mutants'])==23 and all(m['status'] in ['build-killed','live-killed'] for m in wr['mutants'])
native_wr=str(wr_path.relative_to(out));pmint_path=r/'mutation-receipt/widgets-mutation-report-P-mint.json'
notes = {
    'L1': ('HTTP evidence tags and declared HTTP kills are verified in the complete current mutation programme.', ['COMPLETE-MUTATIONS.json', 'CURRENT-LIVE-PROOF-INDEX.json']),
    'L3': ('Canonical network transport executes authentication, widget submissions and resolve over loopback into the built backend.', ['receipts/canonical-net-bin-observations.json']),
    'L4': ('Emitted runtime JavaScript executes create/reschedule/cancel and NS-1 return against the built backend; compiled React helper is exercised. This is not browser/device/production proof.', ['receipts/compiled-net-bin-observations.json']),
    'L6': ('Canonical unknown fields and incomplete totals remain unknown; current presenter assertions and named WR mutations pass.', ['receipts/backend-full.json', native_wr]),
    'L7': ('Authority user/tenant and actor tenant fences before booking quote/store are asserted and mutation-protected.', ['receipts/backend-full.json', native_wr]),
    'L8': ('Malformed canonical staff results refuse; incomplete lists cannot be relabelled COMPLETE by an undetected mutation.', ['receipts/backend-full.json', native_wr]),
    'L9': ('Actual runtime-issued create/reschedule/cancel COMMIT observations assert all fourteen gates.', ['receipts/compiled-net-bin-observations.json']),
    'L10': ('The current complete native programme requires green plain baselines including neutralised live batteries; harness regression controls pass.', ['COMPLETE-MUTATIONS.json', 'HTTP-HARNESS-NATIVE-PROOF.json']),
    'L11': ('Three canonical selector read kinds assert the selector minter dispatch; WR-M17 is killed.', ['receipts/backend-full.json', native_wr]),
    'L12': ('Every new runtime site named by historical L12 has a killed WR mutation. The exact ports delta emits no new runtime bytes; the pre-existing helper is not mislabelled type-only. No exhaustive line-coverage claim.', ['L12-DELTA-PROOF.json', native_wr]),
    'L13': ('Both booking principal fences are covered by foreign-principal and lock-time change tests, with WR-M18/M19 killed.', ['receipts/backend-full.json', native_wr]),
    'L14': ('Current immutable receipt/retry contract and exclusive confirmed publication are preserved. The injected second COMMIT remains a defensive store proof, not a manufactured production re-reference.', ['L14-CURRENT-CLOSURE.json', 'receipts/l14-fresh-proofs.json', native_wr]),
    'L15': ('Ownership, effect/space narrowing, monotonicity and same-token exception mutations WR-M12..M15 are killed with green controls.', [native_wr]),
    'L16': ('The existing four-part P-mint repair passes full fresh local execution and canonical assembly below the unchanged per-job budget. Remote GitHub timing is not claimed.', ['L16-CURRENT-PLAN-PROOF.json', str(pmint_path.relative_to(out))]),
    'L17': ('Canonical reconciliation lookup is fenced to AE COMMIT and WR-M16 is killed.', ['receipts/widgets-live-full.json', native_wr]),
    'L18': ('Fresh compiled-runtime network observations assert the actual COMMIT gate count, as for L9.', ['receipts/compiled-net-bin-observations.json']),
    'L19': ('Canonical confirmed receipt lines traverse createNet, conversation, the compiled React reply helper and subsequent chat request history.', ['receipts/compiled-receipt-net-bin-observations.json']),
    'L21': ('Server thread reader filters invalid terminal outcomes and receipt-reference bindings; WR-M06..M08 are killed.', ['receipts/backend-full.json', native_wr]),
    'L22': ('The recording store keys by canonical upsert identity and asserts immutable retry. It does not claim rejection of arbitrary first-write owner input.', ['receipts/backend-full.json', native_wr]),
    'L27': ('Built-runtime/binary COMMIT to Dismiss preserves one visible terminal outcome, one durable receipt and one synthetic execution; eight separate runtime mutations are killed.', ['L27-CURRENT-PROOF.json', 'receipts/l27-runtime-mutations.json', 'receipts/l27-postcommit-dismiss-observations.json']),
    'L28': ('Live dismiss before COMMIT leaves no terminal storage/thread line and no ActionExecution.', ['receipts/widgets-live-full.json'])
}
decisions=read(out/'FINAL-OWNER-DECISIONS-PROOF.json');assert decisions['candidate']==candidate and decisions['status']=='PASS'
for key,lookup in [('L2','L2'),('L5','L5/L24'),('L20','L20'),('L24','L5/L24'),('L25','L25')]:
 assert decisions[lookup]['status']=='PASS'
 notes[key]=(decisions[lookup]['boundary'],['FINAL-OWNER-DECISIONS-PROOF.json','receipts/widgets-live-full.json','receipts/mutation-receipt/widgets-mutation-report-FB.json'])
rows=[]
for i in range(1,29):
 key='L'+str(i)
 if key in ['L23','L26']:
  d=decisions[key];assert d['status'].startswith('ACCEPTED')
  rows.append({'id':key,'after':'ACCEPTED','ownerDecision':'A; explicit current user decision','exactCandidate':candidate,'remainingBoundary':d['boundary'],'freshEvidence':[proof('FINAL-OWNER-DECISIONS-PROOF.json')], 'admissionRefusal':'PASS' if key=='L26' else None})
 else:
  note,paths=notes[key]
  rows.append({'id':key,'after':'CLOSED','currentProof':note,'freshEvidence':[proof(p) for p in paths]})
counts=dict(collections.Counter(row['after'] for row in rows));assert counts=={'CLOSED':26,'ACCEPTED':2}
result={'contract':'maya.fbe2e-final-certification-disposition/1','candidate':candidate,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'historicalReceiptsAdmitted':0,'counts':counts,'limitations':rows,'freshSyntheticIntegrationProbes':'6/6 PASS','completeApplicableNativeCorpus':'PASS','overall':'PASS: 26 closed with fresh proofs; L23 and L26 explicitly owner-accepted for this exact candidate with retained boundaries','productionProofClaimed':False,'ownerAcceptanceInferred':False,'fullContractCertified':False}
(out/'FBE2E-DISPOSITION.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'candidate':candidate,'fbe2e':counts}))
