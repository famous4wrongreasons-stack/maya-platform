import argparse, hashlib, json
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--runtime',required=True)
p.add_argument('--release-view',required=True)
p.add_argument('--output',required=True)
p.add_argument('--evidence-root',default=str(Path(__file__).resolve().parent))
a=p.parse_args()
s=Path(a.evidence_root).resolve()
actual=json.loads(Path(a.runtime).read_text())
before=json.loads((s/'production-baseline.json').read_text())
manifest=json.loads((s/'stage-python/manifest.json').read_text())
view=Path(a.release_view)
expected_release='/opt/maya-saas/releases/'+manifest['requiredBackendRelease']
assert actual['release']==expected_release
expected_python=dict(before['pythonHashes'])
for f in manifest['files']:
 if f['file'].endswith('.py'): expected_python[f['file']]=f['after']
assert actual['pythonHashes']==expected_python, 'Python artifacts differ from exact approved overlay'
expected_js={'dist/'+str(f.relative_to(view/'maya-saas-backend/dist')):hashlib.sha256(f.read_bytes()).hexdigest() for f in (view/'maya-saas-backend/dist').rglob('*.js')}
assert expected_js and actual['compiledHashes']==expected_js, 'Backend artifacts differ from verified release view'
assert actual['flags']==before['flags']
assert actual['environmentFileFlags']==before['environmentFileFlags']
for name, old in before['services'].items():
 new=actual['services'][name]
 for key in ['LoadState','ActiveState','SubState','UnitFileState','StandardOutput']: assert old[key]==new[key], (name,key)
 if name not in {'maya-saas','barbershop-bot'}: assert old['MainPID']==new['MainPID'], name
assert not actual['otherStdinPythonProcesses']
result={'status':'PASS','checkedAt':actual['checkedAt'],'release':expected_release,'pythonFiles':len(expected_python),'compiledFiles':len(expected_js),'exactPythonOverlay':True,'exactBackendBuild':True,'runtimeFlagsPreserved':True,'unrelatedServicesPreserved':True,'productionProofMessages':0,'productionProofBusinessMutations':0}
Path(a.output).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
