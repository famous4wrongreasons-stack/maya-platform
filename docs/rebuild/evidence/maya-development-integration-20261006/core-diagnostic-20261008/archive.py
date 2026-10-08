from pathlib import Path
import json,hashlib,shutil,os
repo=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
base=Path('/tmp/maya-core-conversation-20261008');dest=repo/'docs/rebuild/evidence/maya-development-integration-20261006/core-diagnostic-20261008'
assert not dest.exists();dest.mkdir(parents=True)
for name in ['candidate-manifest.json','bind-candidate.mjs','followup-roadmap.json','archive.py']:shutil.copyfile(base/name,dest/name)
for folder in ['mechanical','mechanical2','preflight']:shutil.copytree(base/folder,dest/folder)
for name in ['owned-stage.mjs','loopback-only.cjs']:shutil.copyfile(Path('/tmp/maya-c9-failure-20261008')/name,dest/name)
shutil.copyfile(repo/'maya-saas-backend/datasets/conversation-intelligence/core-diagnostic-20261008.json',dest/'frozen-diagnostic.json')
manifest=json.loads((dest/'candidate-manifest.json').read_text())
for name,h in manifest['sourceHashes'].items():assert hashlib.sha256((repo/name).read_bytes()).hexdigest()==h
local=json.loads((dest/'mechanical/report.json').read_text());corrected=json.loads((dest/'mechanical2/report.json').read_text());preflight=json.loads((dest/'preflight/metadata-preflight.log').read_text())
assert local['completed']==['replay-and-candidate'] and local['sourceUnchanged'];assert corrected['status']=='passed';assert preflight['status']=='INCOMPLETE'
groups=0
for folder in ['mechanical','mechanical2','preflight']:
 r=json.loads((dest/folder/'report.json').read_text())
 for g in r['groups'].values():
  assert g['closed'] and g['groupAbsent'];groups+=1
  try:os.killpg(g['pgid'],0)
  except ProcessLookupError:pass
  else:raise AssertionError('owned group alive')
verification={'contract':'maya.core-diagnostic-preparation/1','status':'PREPARED_NOT_EXECUTED','candidateCommit':manifest['candidateCommit'],'candidateManifestSha256':manifest['manifestSha256'],'sourceFiles':len(manifest['sourceHashes']),'dialogs':3,'userTurns':5,'mechanicalTests':26,'formatAndParse':True,'eslint':'NOT_QUALIFIED: repo TypeScript project service excludes these existing .mjs files; exact failed invocation retained, no config suppression','provenanceVerified':True,'actualAssistantHistoryMechanicsChecked':True,'modelRepliesEvaluated':0,'modelCalls':0,'providerCalls':0,'credentialsRead':False,'resourcesCreatedByMetadataPreflight':False,'paidAuthorized':False,'ownedGroupsAbsent':groups,'currentLocalNode':preflight['localObservation']['node']['version'],'currentLocalPostgres':preflight['localObservation']['binaries']['postgres']['version'],'metadataPreflightStatus':'INCOMPLETE','limitations':['Candidate binds app/backend source, not new build/browser/runtime acceptance.','Five-user-turn fixture/live adapter has not been executed or qualified.','Metadata preflight uses existing 24-case manifest and unknown example profile; this is not admission for the five-turn batch.','Proposed USD2/12attempt/10minute ceiling is not executable in current offline-only USD12/96attempt gate.','Live broker/target/credential reference and fresh owner authorization still missing.','No model quality or 99% conclusion; known derived development cases only.']}
(dest/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
review={'reviewer':'independent_review agent','status':'qualified-code-pass','blockingFindings':[],'scope':['strict required/stable conversation correlation','actual response history and stop on unknown','3500 model reply bound; deterministic C9 might be longer and then fails closed','derived-development batch no gold, proposed only limits, no inherited paid authority'],'codeCandidate':manifest['candidateCommit'],'servicesOrTestsRunByReviewer':False}
(dest/'independent-review.json').write_text(json.dumps(review,indent=2)+'\n')
print(json.dumps({'files':sum(p.is_file() for p in dest.rglob('*')),'groups':groups,'sourceFiles':len(manifest['sourceHashes'])}))
