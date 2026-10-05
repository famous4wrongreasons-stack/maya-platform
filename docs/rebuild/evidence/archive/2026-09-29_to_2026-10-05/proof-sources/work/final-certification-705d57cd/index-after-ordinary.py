from pathlib import Path
import json,subprocess,time,shutil
root=Path.cwd();work=root/'work/final-certification-705d57cd';out=root/'outputs/final-certification-705d57cd';candidate='705d57cd787e24d8944dbe764789e27fd9af3708';receipt=out/'receipts/extra-l27.orchestration.json'
while not receipt.exists():time.sleep(1)
d=json.loads(receipt.read_text());assert d['candidate']==candidate and d['exit']==0
for script in ['index-fresh-artifacts.py','index-integration-proofs.py','check-ci-postconditions.py']:
 r=subprocess.run(['python3',str(work/script)],cwd=root)
 assert r.returncode==0,script
source=out/'ARTIFACT-HASH-PARITY.json';target=out/'INITIAL-ARTIFACT-HASH-PARITY.json';assert not target.exists();shutil.copyfile(source,target)
print('Fresh ordinary proof indexes and initial artifact inventory saved.',flush=True)
