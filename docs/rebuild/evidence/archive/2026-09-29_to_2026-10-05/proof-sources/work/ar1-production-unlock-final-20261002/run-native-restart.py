from pathlib import Path
import subprocess
root=Path.cwd();w=root/'work/ar1-production-unlock-final-20261002'
subprocess.run(['python3',str(w/'run-complete-native.py')],cwd=root,check=True)
subprocess.run(['python3',str(w/'finish-programme.py')],cwd=root,check=True)
