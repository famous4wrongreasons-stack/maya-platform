"""Read-only launcher-name/target inventory; no environment values or job execution."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def cmd(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=20)
    return p.returncode, p.stdout


out = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
       'productionWrites': 0, 'jobTriggers': 0, 'databaseConnections': 0,
       'units': [], 'unitFiles': [], 'definitions': [], 'candidateFiles': [], 'readLimitations': []}
for args, field in [(['systemctl','list-units','--all','--type=service,timer','--plain','--no-legend'], 'units'),
                    (['systemctl','list-unit-files','--type=service,timer','--no-legend'], 'unitFiles')]:
    code, raw = cmd(args)
    out[field] = [line.split()[:4] if field == 'units' else line.split()[:2] for line in raw.splitlines() if line.strip()]
    out[field+'ReadExit'] = code
for p in sorted(Path('/etc/systemd/system').rglob('*')):
    if not p.is_file() or p.suffix not in ['.service','.timer','.conf']:
        continue
    try:
        raw = p.read_text()
    except (OSError, UnicodeError) as e:
        out['readLimitations'].append({'path': str(p), 'error': type(e).__name__})
        continue
    refs=[]
    for i,line in enumerate(raw.splitlines(),1):
        if line.startswith(('ExecStart=','ExecStartPre=','ExecStartPost=','ExecStop=','WorkingDirectory=','OnCalendar=','OnBootSec=','OnUnitActiveSec=')):
            key,value=line.split('=',1)
            if key.startswith('Exec'):
                # Retain only executable/script paths, never arguments/credentials.
                refs.append({'line':i,'key':key,'execSha256':hashlib.sha256(line.encode()).hexdigest(),
                             'firstExecutable':line.split('=',1)[1].split()[0],
                             'scriptRefs': sorted(set(re.findall(r'(?<![A-Za-z0-9_./-])(?:/?[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\.(?:py|js|sh)(?![A-Za-z0-9_./-])',line)))})
            else:
                refs.append({'line':i,'key':key,'value':value})
    out['definitions'].append({'path':str(p),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'refs':refs})
for root in [Path('/home/botadmin'),Path('/opt')]:
    # No traversal of DBs, secrets, virtualenvs, installed packages, old releases or archives.
    for base, dirs, files in os.walk(root):
        depth=len(Path(base).relative_to(root).parts)
        dirs[:]=[d for d in dirs if depth<2 and not d.startswith('.') and d not in ['venv','node_modules','releases','backups','archive','__pycache__']]
        for name in files:
            p=Path(base)/name
            if p.suffix=='.sh' or (re.search(r'cron|smm|schedul|ecosystem|supervisor',name,re.I) and p.suffix in ['.py','.json','.conf']):
                out['candidateFiles'].append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
out['scanBoundary']='Live unit names, all readable /etc/systemd/system service/timer/drop-in definitions, application launcher candidates depth <= 3 in /home/botadmin and /opt; excluded virtualenv/package/old-release/archive directories are not absence proof for an unknown Beget command.'
print(json.dumps(out,indent=2))
