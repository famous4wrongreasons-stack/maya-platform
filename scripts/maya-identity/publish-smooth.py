"""Publish one checked UI motion block; preserve all other runtime and artifacts."""
import hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
stage = Path(sys.argv[1]).resolve()
phase = sys.argv[2]
assert stage == Path('/tmp/maya-smooth-20260913')
assert phase in {'check', 'publish', 'verify'}
target = Path('/var/www/maya-platform/app.html')
assert not target.is_symlink()
manifest = json.loads((stage / 'manifest.json').read_text())
assert manifest['before'] == '59bd3301dc16ae6f16828a8def6ed1d3c978a205af07e70e4a8cbb2624b03077'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(stage / 'app.html') == manifest['after']
assert sha(target) == manifest['after' if phase == 'verify' else 'before']
assert Path('/opt/maya-saas/current').resolve().name == '20260912-c7-p06-4058cd8c'
assert subprocess.check_output(['systemctl', 'is-active', 'maya-saas'], text=True).strip() == 'active'
subprocess.run(['/opt/node-v24/bin/node', str(stage / 'verify-pwa.cjs'), str(stage / 'app.html')], check=True)
if phase == 'publish':
    backup = Path.home() / '.maya-release-evidence/maya-smooth-20260913'
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    shutil.copyfile(target, backup / 'app.html')
    os.chmod(backup / 'app.html', 0o600)
    (backup / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    os.chmod(backup / 'manifest.json', 0o600)
    candidate = target.with_name('.app.html.maya-smooth-candidate')
    assert not candidate.exists()
    st = target.stat()
    try:
        shutil.copyfile(stage / 'app.html', candidate)
        os.chmod(candidate, st.st_mode & 0o777)
        subprocess.run(['sudo', '-n', 'chown', f'{st.st_uid}:{st.st_gid}', str(candidate)], check=True)
        assert sha(candidate) == manifest['after']
        os.replace(candidate, target)
    finally:
        if candidate.exists():
            candidate.unlink()
print(json.dumps({'phase': phase, 'status': 'PASS', 'appSha256': sha(target), 'changedFiles': 1 if phase == 'publish' else 0, 'backendChanges': 0, 'begetChanges': 0}))
