"""Publish the approved reference motion asset and two checked presentation blocks."""
import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
stage=Path(sys.argv[1]).resolve();phase=sys.argv[2]
assert stage==Path('/tmp/maya-reference-20260913')
assert phase in {'check','publish','verify'}
root=Path('/var/www/maya-platform');target=root/'app.html';asset=root/'maya-motion-reference.png'
assert not target.is_symlink() and not asset.is_symlink()
m=json.loads((stage/'manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert m['before']=='2d85dbe8a0d6afa3b0c5c10a4afae31bcbaf1b7c987c2016d60bc9877a245f80'
assert m['reference']=='b57b04948f6b029ba9eb10ed186cf03e408cb78ea8911103eed83eb4f35ef385'
assert sha(stage/'app.html')==m['after'] and sha(stage/asset.name)==m['reference']
assert sha(target)==m['after' if phase=='verify' else 'before']
assert (asset.exists() and sha(asset)==m['reference']) if phase=='verify' else not asset.exists()
assert Path('/opt/maya-saas/current').resolve().name=='20260912-c7-p06-4058cd8c'
assert subprocess.check_output(['systemctl','is-active','maya-saas'],text=True).strip()=='active'
subprocess.run(['/opt/node-v24/bin/node',str(stage/'verify-pwa.cjs'),str(stage/'app.html')],check=True)
if phase=='publish':
    backup=Path.home()/'.maya-release-evidence/maya-reference-20260913';backup.mkdir(mode=0o700,parents=True,exist_ok=False)
    shutil.copyfile(target,backup/'app.html');os.chmod(backup/'app.html',0o600)
    (backup/'manifest.json').write_text(json.dumps(m,indent=2));os.chmod(backup/'manifest.json',0o600)
    st=target.stat()
    # The local asset is installed first; the old consumer cannot reference it.
    for name in [asset.name,'app.html']:
        dest=root/name;candidate=root/('.'+name+'.maya-reference-candidate');assert not candidate.exists()
        try:
            shutil.copyfile(stage/name,candidate);os.chmod(candidate,st.st_mode&0o777)
            subprocess.run(['sudo','-n','chown',f'{st.st_uid}:{st.st_gid}',str(candidate)],check=True)
            assert sha(candidate)==m['after' if name=='app.html' else 'reference']
            os.replace(candidate,dest)
        finally:
            if candidate.exists():candidate.unlink()
print(json.dumps({'phase':phase,'status':'PASS','appSha256':sha(target),'referencePresent':asset.exists(),'changedFiles':2 if phase=='publish' else 0,'backendChanges':0,'begetChanges':0}))
