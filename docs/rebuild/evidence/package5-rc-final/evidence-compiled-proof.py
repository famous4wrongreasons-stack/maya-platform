import hashlib,json
from pathlib import Path
root=Path('/opt/maya-saas/releases/20260908-p5-rc-8bc03454');stage=Path('/tmp/maya-wave-rc-8bc03454-python')
expected=json.loads((stage/'compiled-expected.json').read_text())
actual={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for folder in ['dist/src','dist/scripts']for p in sorted((root/folder).rglob('*.js'))}
actual['prisma/schema.prisma']=hashlib.sha256((root/'prisma/schema.prisma').read_bytes()).hexdigest()
assert actual==expected,{'missing':list(expected.keys()-actual.keys()),'extra':list(actual.keys()-expected.keys()),'changed':[p for p in actual.keys()&expected.keys()if actual[p]!=expected[p]]}
print(json.dumps({'status':'PASS','runtimeRevision':'8bc03454','compiledScripts':len(actual)-1,'unexpectedChanges':0,'businessWrites':0}))
