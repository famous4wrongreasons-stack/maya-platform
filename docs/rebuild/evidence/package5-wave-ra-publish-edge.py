import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

stage = Path('/tmp/maya-wave-ra-45688886-edge')
phase = sys.argv[1]
assert phase in {'check', 'php', 'pwa', 'verify'}
items = json.loads((stage / 'manifest.json').read_text())
assert len(items) == 9 and {i['target'] for i in items} == {
    'salon/app/index.html', 'salon/app/index.codex-loyalty-20260721.html',
    'salon/app/index.backup-20260731-anton-analytics.html', 'salon/app/tenant-test.html',
    'mayaos/app/index.html', 'salon/app/api-proxy.php',
    'salon/app/api-proxy.codex-loyalty-20260721.php',
    'salon/app/maya-native-api.php', 'mayaos/maya-platform-api.php'}
allowed = ('/home/m/mocine3388/muzhskayaestetika.rf/public_html/', '/home/m/mocine3388/mayaos.ru/public_html/')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for item in items:
    target = Path(item['destination'])
    site, relative = item['target'].split('/', 1)
    expected_destination = Path(allowed[0 if site == 'salon' else 1]) / relative
    assert target == expected_destination
    assert Path(item['artifact']).name == item['artifact']
    assert target.suffix in {'.html', '.php'} and target.is_file()
    assert sha(stage / item['artifact']) == item['after']
    if target.suffix == '.php':
        subprocess.run(['/usr/local/bin/php8.4', '-n', '-l', str(stage / item['artifact'])], check=True, stdout=subprocess.DEVNULL)
    expected = item['after'] if phase == 'verify' or (phase == 'pwa' and target.suffix == '.php') else item['before']
    assert sha(target) == expected, item['target'] + ': source baseline mismatch'
if phase in {'php', 'pwa'}:
    suffix = '.php' if phase == 'php' else '.html'
    selected = [i for i in items if Path(i['destination']).suffix == suffix]
    backup = stage / 'before'
    backup.mkdir(mode=0o700, exist_ok=True)
    changed = []
    temporary_owned = set()
    try:
        for item in selected:
            target = Path(item['destination'])
            prior = backup / item['artifact']
            assert not prior.exists()
            shutil.copyfile(target, prior)
            os.chmod(prior, 0o600)
            temporary = target.with_name(target.name + '.wave-ra-candidate')
            assert not temporary.exists()
            temporary_owned.add(temporary)
            shutil.copyfile(stage / item['artifact'], temporary)
            os.chmod(temporary, target.stat().st_mode & 0o777)
            os.replace(temporary, target)
            temporary_owned.discard(temporary)
            changed.append(item)
            assert sha(target) == item['after']
    except BaseException:
        for temporary in temporary_owned:
            temporary.unlink(missing_ok=True)
        for item in reversed(changed):
            target = Path(item['destination'])
            temporary = target.with_name(target.name + '.wave-ra-restore')
            assert not temporary.exists()
            shutil.copyfile(backup / item['artifact'], temporary)
            os.chmod(temporary, target.stat().st_mode & 0o777)
            os.replace(temporary, target)
        raise
print(json.dumps({'phase': phase, 'status': 'PASS', 'filesChecked': len(items),
                  'filesPublished': len(changed) if phase in {'php', 'pwa'} else 0,
                  'productionProofMessages': 0, 'productionProofBusinessMutations': 0}))
