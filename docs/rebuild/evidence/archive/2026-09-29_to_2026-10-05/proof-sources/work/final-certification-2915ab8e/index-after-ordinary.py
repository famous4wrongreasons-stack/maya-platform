from pathlib import Path
import json,subprocess,time,shutil
root=Path.cwd();work=root/'work/final-certification-2915ab8e';out=root/'outputs/final-certification-2915ab8e';candidate='2915ab8e7c089e2c1f39848cb795940e5267c119';receipt=out/'receipts/extra-l27.orchestration.json'
while not receipt.exists():time.sleep(1)
d=json.loads(receipt.read_text());assert d['candidate']==candidate and d['exit']==0
for script in ['index-fresh-artifacts.py','index-integration-proofs.py','check-ci-postconditions.py']:
 r=subprocess.run(['python3',str(work/script)],cwd=root)
 assert r.returncode==0,script
source=out/'ARTIFACT-HASH-PARITY.json';target=out/'INITIAL-ARTIFACT-HASH-PARITY.json';assert not target.exists();shutil.copyfile(source,target)
print('Fresh ordinary proof indexes and initial artifact inventory saved.',flush=True)
