from pathlib import Path
import hashlib,json,shutil,subprocess
source=Path('/tmp/maya-core-runner-20261008')
repo=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
dest=repo/'docs/rebuild/evidence/maya-development-integration-20261006/core-http-runner-20261008'
assert not dest.exists()
dest.mkdir(parents=True)
for name in ['checks1','checks2','checks3','checks4','checks5','checks6','http1','http2']:
    if (source/name).exists(): shutil.copytree(source/name,dest/name)
for name in ['local-gates.mjs','tsconfig.proof.json','core-followup-cases.json','archive.py','loopback-owned-unix.cjs','artifact-audit.json','independent-code-review.json']:
    shutil.copyfile(source/name,dest/name)
shutil.copyfile('/tmp/maya-c9-failure-20261008/loopback-only.cjs',dest/'loopback-only.cjs')
files={str(p.relative_to(dest)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(dest.rglob('*')) if p.is_file()}
manifest={'contract':'maya.core-http-runner-evidence/1','candidateCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'qualification':'DRY_HTTP_CANNED_WIRING_ONLY_NOT_MODEL_QUALITY','paidCalls':0,'credentialsRead':False,'productionOrYclientsCalls':0,'files':files}
(dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'files':len(files),'manifestSha256':hashlib.sha256((dest/'manifest.json').read_bytes()).hexdigest(),'directory':str(dest)}))
