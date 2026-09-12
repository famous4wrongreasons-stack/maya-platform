"""Bounded UI artifact publication. No backend, PHP, Beget or business data writes."""
import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
stage=Path(sys.argv[1]).resolve();phase=sys.argv[2]
assert stage==Path('/tmp/maya-identity-20260913')
assert phase in {'check','publish','verify','recover'}
root=Path('/var/www/maya-platform')
manifest=json.loads((stage/'release-manifest.json').read_text())
allowed={'app.html','manifest.json','apple-touch-icon.png','icon-192.png','icon-512.png','icon-192-maskable.png','icon-512-maskable.png','favicon-256.png'}
assert set(manifest['files'])==allowed
assert manifest['files']['app.html']['before']=='204daaf2ce452ba5e1383750bded372683596cceade4c9f0f33dade3831b862a'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
release=Path('/opt/maya-saas/current').resolve().name
assert release=='20260912-c7-p06-4058cd8c'
assert subprocess.check_output(['systemctl','is-active','maya-saas'],text=True).strip()=='active'
subprocess.run(['/opt/node-v24/bin/node',str(stage/'verify-pwa.cjs'),str(stage/'app.html')],check=True)
backup=Path.home()/'.maya-release-evidence/maya-identity-20260913'
for name,item in manifest['files'].items():
 p=root/name
 assert not p.is_symlink() and not (stage/name).is_symlink()
 assert sha(stage/name)==item['after']
 assert sha(p)==item['after' if phase in {'verify','recover'} else 'before'],name+' changed from expected baseline'
if phase in {'publish','recover'}:
 if phase=='publish':
  backup.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(backup,0o700)
  for name,item in manifest['files'].items():
   if item['before'] is not None:
    if (backup/name).exists():assert sha(backup/name)==item['before']
    else:shutil.copyfile(root/name,backup/name);os.chmod(backup/name,0o600)
  (backup/'release-manifest.json').write_text(json.dumps(manifest,indent=2));os.chmod(backup/'release-manifest.json',0o600)
 for name in sorted(allowed-{'app.html'})+['app.html']:
  target=root/name;item=manifest['files'][name];source=(stage if phase=='publish' else backup)/name
  if phase=='recover' and item['before'] is None:
   target.unlink() # Only a newly created, exact-hash artifact of this release.
   continue
  st=(target if target.exists() else root/'app.html').stat();candidate=root/('.'+name+'.maya-identity-candidate')
  assert not candidate.exists()
  try:
   shutil.copyfile(source,candidate);os.chmod(candidate,st.st_mode&0o777)
   subprocess.run(['sudo','-n','chown',f'{st.st_uid}:{st.st_gid}',str(candidate)],check=True)
   os.replace(candidate,target)
   assert sha(target)==item['after' if phase=='publish' else 'before']
  finally:
   if candidate.exists():candidate.unlink()
print(json.dumps({'status':'PASS','phase':phase,'files':{n:sha(root/n) for n in sorted(allowed)},'backendRelease':release,'begetMaintenanceChanged':0,'phpChanged':0,'businessProviderMessageEffects':0}))
