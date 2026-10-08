from pathlib import Path
import hashlib,json,shutil
src=Path('/tmp/maya-linux-ocr-20261008')
dst=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/docs/rebuild/evidence/maya-development-integration-20261006/portable-ocr-20261008')
assert not dst.exists()
dst.mkdir(parents=True)
roots=['CORPUS-PLAN.md','authority-remainder.md','preflight.md','preflight.json','preflight-official-metadata.json','preflight-alpine-metadata.json','preflight-alpine-choices.json','registry-metadata.json','fetch-pinned-models.mjs','corpus-plan.mjs','generate-corpus.mjs','assert-corpus.mjs','actual-corpus-proof.mjs','assets-guard-proof.mjs','fifo-guard-proof.mjs','local-gates.mjs','http-local-gates.mjs','owned-stage.mjs','loopback-only.cjs','archive-evidence.py','independent-code-review.md','independent-code-review-hashes.json','final-independent-review.md','final-independent-review.json']
files=[src/p for p in roots]+[src/'downloaded-models'/p for p in ['manifest.json','LICENSE']]
for folder in ['attempt1-provenance','corpus-attempt1','corpus-attempt2','actual-attempt1','actual-attempt2','actual-attempt3','assets-guard-attempt1','assets-guard-attempt2','fifo-guard-attempt1','http-carrier-harness-attempt1-provenance','http-carrier-harness','http-browser-attempt1']+[f'local-attempt{i}' for i in range(1,7)]:
 files.extend(sorted((src/folder).rglob('*')))
http=src/'http-browser-attempt2'
files += [http/p for p in ['manifest.json','source-hashes.json','actual-ocr-http.json','browser-jest.json','actual-ocr-browser.log','pg-start.log','pg-stop.log','migrations.log','synthetic-malformed.png']]
files += sorted((http/'harness').rglob('*'))+sorted((http/'output'/'playwright').rglob('*'))
manifest={'contract':'maya.portable-ocr-evidence-archive/1','candidateCommit':'7fe7bab96295bb459a037dade2fc7a6ca5c379fd','runtimeBase':'dc6684cba67659664910578ef96afe06781f7551','nativePlatform':'darwin','linuxExecutionAcceptance':False,'realDocumentAcceptance':False,'exclusions':['model binaries','native executable','node_modules','database data','private auth bodies/tokens','foreign processes'],'files':{}}
for p in sorted(set(files)):
 if p.is_dir():continue
 assert p.is_file() and not p.is_symlink(),p
 rel=p.relative_to(src); assert p.suffix not in ['.traineddata','.so','.dylib'],p
 data=p.read_bytes(); assert len(data)<2_000_000,(p,len(data))
 out=dst/rel;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
 manifest['files'][str(rel)]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
manifest['fileCount']=len(manifest['files']);manifest['totalBytes']=sum(x['bytes'] for x in manifest['files'].values())
(dst/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k in ['fileCount','totalBytes','candidateCommit']},indent=2))
