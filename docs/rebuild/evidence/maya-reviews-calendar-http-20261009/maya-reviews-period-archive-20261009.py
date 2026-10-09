import pathlib,json,hashlib,shutil
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
tmp=pathlib.Path('/private/tmp')
http=root/'docs/rebuild/evidence/maya-reviews-calendar-http-20261009'
full=root/'docs/rebuild/evidence/maya-offline48-after-reviews-20261009'
http.mkdir(exist_ok=False);full.mkdir(exist_ok=False)
for n in range(1,5):
 src=tmp/f'maya-reviews-period-http-20261009-r{n}'; dst=http/f'r{n}';dst.mkdir()
 for f in sorted(src.iterdir()):
  assert f.is_file() and f.suffix in ['.json','.log'] and 'private' not in f.name,f
  shutil.copyfile(f,dst/f.name)
for prefix in ['maya-reviews-period-checks-r1-20261009','maya-reviews-period-checks-r2-20261009','maya-reviews-period-probe-r2-20261009','maya-reviews-period-probe-r3-20261009','maya-reviews-period-probe-r4-20261009']:
 for f in tmp.glob(prefix+'-*'):
  assert f.is_file(),f
  shutil.copyfile(f,http/f.name)
for name in ['maya-reviews-period-checks-20261009.py','maya-reviews-period-probe-checks-20261009.py','maya-reviews-period-verify-20261009.py','maya-reviews-period-independent-source-review-20261009.json']:
 shutil.copyfile(tmp/name,http/name)
src=tmp/'maya-offline48-after-reviews-20261009-r1';dst=full/'r1';dst.mkdir()
for f in sorted(src.iterdir()):
 assert f.is_file() and f.suffix in ['.json','.jsonl','.log'],f
 shutil.copyfile(f,dst/f.name)
shutil.copyfile(tmp/'maya-offline48-after-reviews-verify-20261009.py',full/'maya-offline48-after-reviews-verify-20261009.py')
# Independent evidence review is copied and manifests finalized separately once settled.
print('Raw archives copied')
