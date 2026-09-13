"""Pinned C8 P06 artifacts; no DB/provider requests, no Beget path, no credential/config edit."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

stage=Path(sys.argv[1]).resolve();phase=sys.argv[2]
assert stage==Path('/tmp/maya-c8-p06-20260913')
assert phase in {'check','publish','verify','recover'}
manifest=json.loads((stage/'manifest.json').read_text())
expected={'/var/www/maya-platform/app.html'}|{'/home/botadmin/barbershop-bot/'+n for n in ['owner_ai.py','masters_ai.py','growth_planner.py','webhook_server.py']}
assert {f['target'] for f in manifest['files']}==expected and len(manifest['files'])==5
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
backup=Path('/home/botadmin/.maya-release-evidence/c8-p06-20260913')
for f in manifest['files']:
    assert Path(f['name']).name==f['name']
    target=Path(f['target']);assert target.is_file() and not target.is_symlink()
    assert sha(stage/'files'/f['name'])==f['after']
    assert sha(target)==f['after' if phase in {'verify','recover'} else 'before'], 'Exact pre-state changed: '+f['name']
    if phase=='recover':assert sha(backup/f['name'])==f['before']
subprocess.run(['python3',str(stage/'guards/chapter8-consumers/verify-python.py'),str(stage/'files')],check=True)
subprocess.run(['/opt/node-v24/bin/node',str(stage/'guards/chapter8-consumers/verify-pwa.cjs'),str(stage/'files/app.html')],check=True)
release=Path('/opt/maya-saas/current').resolve().name
assert release=='20260913-c8-wave3-66e83891' or release.startswith('20260913-c8-wave4-')
assert subprocess.check_output(['systemctl','is-active','maya-saas'],text=True).strip()=='active'
if phase in {'publish','recover'}:
    backup.mkdir(parents=True,mode=0o700,exist_ok=True)
    # Preserve every predecessor before the first replacement. Retry/recovery has an exact hash fence.
    for f in manifest['files']:
        target=Path(f['target']);copy=backup/f['name']
        if not copy.exists():shutil.copyfile(target,copy);os.chmod(copy,0o600)
        assert sha(copy)==f['before']
    replaced=[]
    try:
        for f in manifest['files']:
            target=Path(f['target']);st=target.stat();temp=target.with_name('.'+target.name+'.c8-p06-candidate')
            assert not temp.exists()
            shutil.copyfile(stage/'files'/f['name'] if phase=='publish' else backup/f['name'],temp)
            os.chmod(temp,st.st_mode & 0o777)
            subprocess.run(['sudo','-n','chown',f'{st.st_uid}:{st.st_gid}',str(temp)],check=True)
            os.replace(temp,target);replaced.append(f)
        subprocess.run(['sudo','-n','systemctl','restart','barbershop-bot'],check=True)
        assert subprocess.check_output(['systemctl','is-active','barbershop-bot'],text=True).strip()=='active'
    except Exception:
        # Only our just-replaced candidates are recovered; never overwrite intervening changes.
        for f in reversed(replaced):
            target=Path(f['target']);assert sha(target)==f['after' if phase=='publish' else 'before']
            st=target.stat();temp=target.with_name('.'+target.name+'.c8-p06-recovery')
            assert not temp.exists();shutil.copyfile(backup/f['name'],temp);os.chmod(temp,st.st_mode&0o777)
            subprocess.run(['sudo','-n','chown',f'{st.st_uid}:{st.st_gid}',str(temp)],check=True);os.replace(temp,target)
        subprocess.run(['sudo','-n','systemctl','restart','barbershop-bot'],check=True)
        raise
    for f in manifest['files']:assert sha(Path(f['target']))==f['after' if phase=='publish' else 'before']
print(json.dumps({'phase':phase,'status':'PASS','files':len(manifest['files']),'release':release,'BegetChanges':0,'businessEffects':0,'providerEffects':0}))
