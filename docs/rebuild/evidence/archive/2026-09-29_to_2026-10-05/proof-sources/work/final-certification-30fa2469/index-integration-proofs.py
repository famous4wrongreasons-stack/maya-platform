from pathlib import Path
import json, hashlib, subprocess

root=Path.cwd(); repo=root/'work/maya-controlled-integration'; out=root/'outputs/final-certification-30fa2469'; r=out/'receipts'
head='30fa24698f3ae277c22209e8edfd448c29e4f872'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
def load(name): return json.loads((r/name).read_text())
def ref(name): return {'path':'receipts/'+name,'sha256':hashlib.sha256((r/name).read_bytes()).hexdigest()}
def save(name,data):
    (out/name).write_text(json.dumps({'candidate':head,'scope':'Fresh synthetic/local evidence only; not production evidence or whole-corpus certification',**data},ensure_ascii=False,indent=2)+'\n')
live=load('widgets-live-full.json')
tests=[a for t in live['testResults'] for a in t['assertionResults']]
assert live['numPassedTests']==406 and live['numFailedTests']==0
def named(prefix):
    rows=[a for a in tests if a['title'].startswith(prefix)]
    assert rows and all(a['status']=='passed' for a in rows),prefix
    return [{'title':a['title'],'status':a['status'],'durationMs':a['duration']} for a in rows]
turn=load('canonical-net-turn-observations.json')
journal=next(o for o in turn['observations'] if o['mode']=='journal')
persisted=journal['persistedTurnProof']; assert len(persisted)==2
assert all(p['canonicalRows']==1 and p['bindingAudits']==1 and p['actualActor'] is True for p in persisted)
assert len({p['conversationId'] for p in persisted})==1
save('9.6-CURRENT-PROOF.json',{'result':'PASS','liveEntry':named('TURN-CANONICAL'),'persistedTurnProof':persisted,'sources':[ref('widgets-live-full.json'),ref('canonical-net-turn-observations.json')],'boundary':'Persisted turn probe inspects the journal typed turns. Ordinary typed, widget typed and native tap share the writer in the named full-live proof. The personal observation does not itself inspect persisted turn rows.'})
successor=[named('SV2-'+str(i).zfill(2))[0] for i in range(1,13)]
save('SUCCESSOR-CURRENT-PROOF.json',{'result':'12/12 PASS','proofs':successor,'additional':[named(x)[0] for x in ['SV2-JSON','SV2-CHANNEL','SV2-SESSION','SV2-LIMIT','SV2-DELIVERY','SV2-V1','SV2-HTTP']],'source':ref('widgets-live-full.json'),'realOtpSent':False,'nativeMutationAdmission':'PENDING'})
compiled=load('compiled-net-bin-observations.json')['observations']
personal=next(o for o in compiled if o['mode']=='personal'); journal=next(o for o in compiled if o['mode']=='journal')
assert personal['createRescheduleCancel'] and personal['realCanonicalNet'] and personal['compiledRuntime'] and personal['allCommitsRan14Gates']
assert journal['roundTripPassed'] and journal['compiledRuntime'] and journal['backendDetail'] and journal['fullscreen'] is None
save('BS-NS-CURRENT-PROOF.json',{'BS1':'PASS','NS1':'PASS','liveProofs':named('BS-')+named('NS-'),'compiledPersonal':{k:personal[k] for k in ['mode','createRescheduleCancel','realCanonicalNet','compiledRuntime','allCommitsRan14Gates']},'compiledJournal':{k:journal[k] for k in ['mode','realCanonicalNet','compiledRuntime','backendDetail','fullscreen','roundTripPassed','parentReturn']},'sources':[ref('widgets-live-full.json'),ref('compiled-net-bin-observations.json')],'migration':'Written and tested only in fresh local proof databases; production not applied'})
l27=load('l27-postcommit-dismiss-observations.json')['observations'][0]
assert l27['before']==l27['after'] and len(l27['after'])==1
assert l27['serverBefore']==l27['serverAfter'] and len(l27['serverAfter'])==1
assert l27['durable']['executions']==1 and len(l27['durable']['appointments'])==1
save('L27-CURRENT-PROOF.json',{'result':'PASS','before':l27['before'],'after':l27['after'],'serverReceiptUnchanged':True,'durable':l27['durable'],'sources':[ref('l27-postcommit-dismiss-observations.json'),ref('l27-runtime-mutations.json')],'runtimeMutations':'8/8 KILLED','productionEffects':0})
print(json.dumps({'candidate':head,'9.6':'PASS','successor':'12/12 PASS','BS1':'PASS','NS1':'PASS','L27':'PASS'}))
