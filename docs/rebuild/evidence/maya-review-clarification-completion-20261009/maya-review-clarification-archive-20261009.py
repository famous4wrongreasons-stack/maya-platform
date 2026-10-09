import pathlib,json,hashlib,shutil
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
tmp=pathlib.Path('/private/tmp');out=root/'docs/rebuild/evidence/maya-review-clarification-completion-20261009'
out.mkdir(exist_ok=False)
for dirname,source in [('http/r1','maya-reviews-clarification-http-20261009-r1'),('full81/r1','maya-offline48-review-clarification-v2-20261009-r1')]:
 dst=out/dirname;dst.mkdir(parents=True)
 for f in sorted((tmp/source).iterdir()):
  assert f.is_file() and f.suffix in ['.json','.jsonl','.log'] and 'private' not in f.name,f
  shutil.copyfile(f,dst/f.name)
for prefix in ['maya-reviews-clarification-r1-20261009','maya-reviews-clarification-r2-20261009']:
 for f in tmp.glob(prefix+'-*'):
  assert f.is_file();shutil.copyfile(f,out/f.name)
for name in ['maya-reviews-clarification-checks-20261009.py','maya-reviews-clarification-20261009-types.json','maya-reviews-period-verify-20261009.py','maya-review-clarification-v2-verify-20261009.py','maya-review-rating-source-semantics-20261009.json','maya-reviews-clarification-independent-source-review-20261009.json','maya-review-clarification-archive-20261009.py']:
 shutil.copyfile(tmp/name,out/name)
print('Copied immutable new checkpoint sources; final manifest waits for independent evidence review')
