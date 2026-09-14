"""Release ratchets must run from the deployed Python directory alone."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from package5_wave_rc_guard_contracts import _CONTRACTS

ROOT=Path(__file__).parent
class GuardPackProof(unittest.TestCase):
 def test_expected_contracts_match_reviewed_overlays(self):
  repo=ROOT.parent
  if not (repo/'docs/rebuild/evidence').is_dir():return # parity is a repository proof only
  for package,fields in _CONTRACTS.items():
   path=repo/f'docs/rebuild/evidence/package5-wave-rc-{package}-python-overlay.py'
   spec=importlib.util.spec_from_file_location(package,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
   for key,value in fields.items():self.assertEqual(value,getattr(module,key))
 def test_deployed_guards_need_no_repository_docs_or_runtime_import(self):
  with tempfile.TemporaryDirectory(prefix='maya-rc-guards-') as directory:
   for file in ROOT.glob('*.py'):
    if file.name.startswith('package5_') and ('runtime_guard' in file.name or file.name=='package5_wave_rc_guard_contracts.py'):shutil.copyfile(file,Path(directory)/file.name)
   for name in ['owner_reports','operational_delivery','native_feedback','public_community','team_communications','expense_intake']:
    result=subprocess.run([sys.executable,str(Path(directory)/f'package5_{name}_runtime_guard.py'),str(ROOT)],env={'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True,timeout=30)
    self.assertEqual(result.returncode,0,result.stdout+result.stderr)
if __name__=='__main__':unittest.main()
