import pathlib,json,hashlib,shutil,subprocess,re
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
out=root/'docs/rebuild/evidence/maya-review-clarification-completion-20261009';tmp=pathlib.Path('/private/tmp')
name='maya-reviews-clarification-independent-evidence-review-20261009.json';shutil.copyfile(tmp/name,out/name)
shutil.copyfile(tmp/'maya-review-clarification-finalize-20261009.py',out/'maya-review-clarification-finalize-20261009.py')
entries=[{'path':str(p.relative_to(out)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='archive-manifest.json']
manifest={'contract':'maya.review-clarification-completion.archive/1','sourceCommit':'586c71779eb3743a318436e5316811375b3204af','originalBaselineCommit':'b81ac624cd8b359bbebc6d809f530e1ed978e360','previousCheckpointCommit':'34f3b60864d1ee9ffd05ee8d9078d0c93fe68c8d','scriptedModel':True,'syntheticDomainFacts':True,'realModelAcceptance':False,'liveProviderAcceptance':False,'overallMayaAcceptance':'NOT_ISSUED','original81':{'pass':57,'semantic_fail':0,'unsupported':12,'insufficient_evidence':10,'clarification_pending':2,'remainingNonPendingTurns':22,'unclosedTurns':24},'separateSupplementalGoalsCompleted':2,'restartPendingContinuationVariantForCase':'utt-reviews.list_recent-062','entries':entries}
(out/'archive-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
doc=root/'docs/rebuild/MAYA-REVIEW-CLARIFICATION-COMPLETION-20261009.md'
for link in re.findall(r'\]\(([^)]+)\)',doc.read_text()):
 if not link.startswith('http'):assert (doc.parent/link).exists(),link
files=[str(p.relative_to(root)) for p in sorted(out.rglob('*')) if p.is_file()]
subprocess.run(['git','add','docs/rebuild/MAYA-REVIEW-CLARIFICATION-COMPLETION-20261009.md','docs/rebuild/MAYA-FINAL-COMPLETION-MAP.md'],cwd=root,check=True)
# Exact archive allowlist, including ignored raw .log files. No unrelated files.
subprocess.run(['git','add','-f','--',*files],cwd=root,check=True)
# Raw logs preserve original whitespace byte-for-byte; check authored text only.
subprocess.run(['git','diff','--cached','--check','--','docs/rebuild/MAYA-REVIEW-CLARIFICATION-COMPLETION-20261009.md','docs/rebuild/MAYA-FINAL-COMPLETION-MAP.md',*[f for f in files if not f.endswith('.log')]],cwd=root,check=True)
print(json.dumps({'archiveEntries':len(entries),'committedFileCandidates':len(files),'manifestSha256':hashlib.sha256((out/'archive-manifest.json').read_bytes()).hexdigest()}))
