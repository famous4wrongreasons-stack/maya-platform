from pathlib import Path
import subprocess,json,hashlib
root=Path.cwd();w=root/'work/ar1-single-operator-20261003';out=root/'outputs/ar1-single-operator-20261003';repo=root/'work/maya-controlled-integration';head=(w/'HEAD').read_text().strip()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
for script in ['rehearse-final-migration.py','rehearse-final-ios.py']:subprocess.run(['python3',str(w/script)],cwd=root,check=True)
proofs=[]
for name in ['FINAL-MIGRATION-ROLLBACK-REHEARSAL.json','FINAL-IOS-SIGNING-REHEARSAL.json']:
 p=out/name;d=json.loads(p.read_text());assert d['candidate']==head and d['status']=='PASS';proofs.append({'path':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(out/'FINAL-RELEASE-REHEARSAL.json').write_text(json.dumps({'candidate':head,'status':'PASS','scope':'isolated migration clean replay, backup/restore, real canonical test-account login and single-operator grant/revoke on test DB; signed development app verification without installation','proofs':proofs,'productionEffects':0,'productionPrivateKeysGenerated':0,'productionTrustInstalled':False,'productionAuthorizationIssued':False,'deviceInstalled':False},indent=2)+'\n')
