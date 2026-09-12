"""Exact C7 VPS consumer artifact cutover. Only release artifact bytes, never business data.
Stage must contain the approved manifest/candidate/guard. No Beget file is addressed.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

stage = Path(sys.argv[1]).resolve()
phase = sys.argv[2]
assert phase in {'check', 'publish', 'verify', 'recover'}
assert stage.name == 'maya-c7-p06-pwa-20260912' and stage.parent == Path('/tmp')
target = Path('/var/www/maya-platform/app.html')
manifest = json.loads((stage / 'manifest.json').read_text())
assert manifest['target'] == str(target)
assert manifest['before'] == '46e713c6cca82817b07697bdede877cd5e85ca940667299bab8db3a819360527'
assert manifest['after'] == '204daaf2ce452ba5e1383750bded372683596cceade4c9f0f33dade3831b862a'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert not target.is_symlink() and target.is_file()
assert sha(stage / 'app.html') == manifest['after']
subprocess.run(['/opt/node-v24/bin/node', str(stage / 'verify-pwa.cjs'), str(stage / 'app.html')], check=True)
release = Path('/opt/maya-saas/current').resolve().name
assert release in manifest['allowedBackendReleases']
assert subprocess.check_output(['systemctl','is-active','maya-saas'],text=True).strip() == 'active'
backup = Path.home() / '.maya-release-evidence' / 'c7-p06-pwa-20260912'
if phase in {'check', 'publish'}: assert sha(target) == manifest['before'], 'Exact baseline changed'
if phase == 'verify': assert sha(target) == manifest['after']
if phase == 'recover':
    assert sha(target) == manifest['after'] and sha(backup / 'app.html') == manifest['before']
if phase in {'publish', 'recover'}:
    st = target.stat()
    if phase == 'publish':
        backup.mkdir(parents=True,mode=0o700,exist_ok=True)
        os.chmod(backup,0o700)
        if (backup / 'app.html').exists(): assert sha(backup / 'app.html') == manifest['before']
        else: shutil.copyfile(target,backup / 'app.html');os.chmod(backup / 'app.html',0o600)
    candidate = target.with_name('.app.html.c7-p06-candidate')
    assert not candidate.exists()
    try:
        shutil.copyfile(stage / 'app.html' if phase == 'publish' else backup / 'app.html',candidate)
        os.chmod(candidate,st.st_mode & 0o777)
        subprocess.run(['sudo','-n','chown',f'{st.st_uid}:{st.st_gid}',str(candidate)],check=True)
        os.replace(candidate,target)
        assert sha(target) == manifest['after' if phase == 'publish' else 'before']
    finally:
        if candidate.exists(): candidate.unlink() # Only this invocation's temporary file.
print(json.dumps({'phase':phase,'status':'PASS','target':str(target),'sha256':sha(target),
                  'backendRelease':release,'maintenanceFilesChanged':0,'businessEffects':0,'providerEffects':0}))
