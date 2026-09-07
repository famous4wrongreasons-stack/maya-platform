import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

stage = Path('/tmp/maya-wave-ra-45688886-python')
root = Path('/home/botadmin/barbershop-bot')
phase = sys.argv[1]
assert phase in {'check', 'publish', 'verify'}
manifest = json.loads((stage / 'manifest.json').read_text())
items = manifest['files']
assert len(items) == 13 and {i['file'] for i in items} == {
    'app.html', 'bot.py', 'webhook_server.py', 'claude_ai.py', 'database.py',
    'memory.py', 'web_auth.py', 'legacy_appointment_bridge.py',
    'package5_control_plane_runtime_guard.py', 'canonical_staff_access.py',
    'package5_staff_authority_guard.py', 'legacy_client_entry.py', 'pwa_api.py'}
destinations = {item['file']: root / item['file'] for item in items}
destinations['app.html'] = Path('/var/www/maya-platform/app.html')
for item in items:
    assert Path(item['destination']) == destinations[item['file']]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
support = manifest['supportFiles']
assert len(support) == 3 and {i['file'] for i in support} == {
    'package5_loyalty_read_guard.py', 'package5_review_source_guard.py', 'package5_bulk_runtime_guard.py'}
for item in support:
    assert sha(root / item['file']) == item['sha256']
    assert sha(stage / item['file']) == item['sha256']
expected_release = manifest['baselineBackendRelease'] if phase == 'check' else manifest['requiredBackendRelease']
assert Path('/opt/maya-saas/current').resolve().name == expected_release
assert subprocess.check_output(['systemctl', 'is-active', 'barbershop-bot'], text=True).strip() == 'active'
overrides = {}
for item in items:
    name = item['file']
    assert Path(name).name == name and Path(name).suffix in {'.py', '.html'}
    target = destinations[name]
    candidate = stage / name
    assert sha(candidate) == item['after']
    if candidate.suffix == '.py':
        compile(candidate.read_text(), name, 'exec')
        overrides[name] = candidate.read_text()
    if phase == 'verify':
        assert sha(target) == item['after'], name + ': deployed artifact mismatch'
    elif item['before'] is None:
        assert not target.exists(), name + ': new file already exists'
    else:
        assert sha(target) == item['before'], name + ': baseline mismatch'

def guard(name, function):
    path = stage / name if (stage / name).exists() else root / name
    spec = importlib.util.spec_from_file_location('wave_ra_' + name[:-3], path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    findings = getattr(module, function)(root, overrides)
    assert not findings, name + ': architectural guard rejected candidate'

guard('package4_value_runtime_guard.py', 'scan_runtime')
guard('package5_control_plane_runtime_guard.py', 'scan_runtime')
guard('package5_bulk_runtime_guard.py', 'scan_bulk_sources')
guard('package5_staff_authority_guard.py', 'scan_staff_authority')
changed = []
if phase == 'publish':
    backup = stage / 'before'
    backup.mkdir(mode=0o700, exist_ok=True)
    temporary_owned = set()
    try:
        for item in sorted(items, key=lambda x: (x['before'] is not None, x['file'])):
            if item['before'] == item['after']:
                continue
            target = destinations[item['file']]
            previous_stat = target.stat() if target.exists() else None
            mode = previous_stat.st_mode & 0o777 if previous_stat else 0o644
            owner = (previous_stat.st_uid, previous_stat.st_gid) if previous_stat else (os.getuid(), os.getgid())
            if target.exists():
                shutil.copyfile(target, backup / item['file'])
                os.chmod(backup / item['file'], 0o600)
            temporary = target.with_name(target.name + '.wave-ra-candidate')
            assert not temporary.exists()
            temporary_owned.add(temporary)
            shutil.copyfile(stage / item['file'], temporary)
            os.chmod(temporary, mode)
            if owner != (os.getuid(), os.getgid()):
                subprocess.run(['sudo', '-n', 'chown', str(owner[0]) + ':' + str(owner[1]), str(temporary)], check=True)
            os.replace(temporary, target)
            temporary_owned.discard(temporary)
            changed.append((item, mode, owner))
            assert sha(target) == item['after']
        subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'barbershop-bot'], check=True)
        assert subprocess.check_output(['systemctl', 'is-active', 'barbershop-bot'], text=True).strip() == 'active'
    except BaseException:
        for temporary in temporary_owned:
            temporary.unlink(missing_ok=True)
        for item, mode, owner in reversed(changed):
            target = destinations[item['file']]
            if item['before'] is None:
                # Only a file created by this exact failed publication is removed.
                assert sha(target) == item['after']
                target.unlink()
            else:
                temporary = target.with_name(target.name + '.wave-ra-restore')
                assert not temporary.exists()
                shutil.copyfile(backup / item['file'], temporary)
                os.chmod(temporary, mode)
                if owner != (os.getuid(), os.getgid()):
                    subprocess.run(['sudo', '-n', 'chown', str(owner[0]) + ':' + str(owner[1]), str(temporary)], check=True)
                os.replace(temporary, target)
        subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'barbershop-bot'], check=True)
        raise
print(json.dumps({'phase': phase, 'status': 'PASS', 'filesChecked': len(items),
                  'filesPublished': len(changed), 'guards': 4,
                  'productionProofMessages': 0, 'productionProofBusinessMutations': 0}))
