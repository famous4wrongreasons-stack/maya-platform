"""Scoped R-C artifact publication using the established staged replacement flow.

No business command or provider call. The caller pins the reviewed manifest hash.
Before/after hashes, fixed destinations and guard sources are checked before any
write. Failure restores only files changed by this invocation, then restarts the
Python service if needed. The existing backend deployment script stays separate.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def restore_metadata(path, mode, owner):
    os.chmod(path, mode)
    if owner != (os.getuid(), os.getgid()):
        subprocess.run(['sudo', '-n', 'chown', f'{owner[0]}:{owner[1]}', str(path)], check=True)


def replace_items(stage, items, restart=None):
    """Replace pinned candidates and roll back the exact owned subset on failure."""
    backup = stage / 'before'
    backup.mkdir(mode=0o700, exist_ok=True)
    changed, temporary_owned = [], set()
    try:
        for item in sorted(items, key=lambda value: (value['before'] is not None, value['file'])):
            if item['before'] == item['after']:
                continue
            target = Path(item['destination'])
            if item['before'] is None:
                assert not target.exists(), 'New target appeared after preflight'
            else:
                assert sha(target) == item['before'], 'Target changed after preflight'
            stat = target.stat() if target.exists() else None
            mode = stat.st_mode & 0o777 if stat else 0o644
            parent = target.parent.stat()
            owner = (stat.st_uid, stat.st_gid) if stat else (parent.st_uid, parent.st_gid)
            prior = backup / item['artifact']
            assert not prior.exists(), 'An earlier publication backup must not be overwritten'
            if stat:
                shutil.copyfile(target, prior)
                os.chmod(prior, 0o600)
            temporary = target.with_name(target.name + '.wave-rc-candidate')
            assert not temporary.exists()
            temporary_owned.add(temporary)
            shutil.copyfile(stage / item['artifact'], temporary)
            restore_metadata(temporary, mode, owner)
            os.replace(temporary, target)
            temporary_owned.discard(temporary)
            changed.append((item, mode, owner))
            assert sha(target) == item['after']
        if restart:
            restart()
    except BaseException:
        for path in temporary_owned:
            path.unlink(missing_ok=True)
        for item, mode, owner in reversed(changed):
            target = Path(item['destination'])
            if item['before'] is None:
                assert sha(target) == item['after']
                target.unlink()
            else:
                temporary = target.with_name(target.name + '.wave-rc-restore')
                assert not temporary.exists()
                shutil.copyfile(backup / item['artifact'], temporary)
                restore_metadata(temporary, mode, owner)
                os.replace(temporary, target)
                assert sha(target) == item['before']
        if restart:
            restart()
        raise
    return len(changed)


PYTHON_FILES = set('''bot.py canonical_cash_declaration.py canonical_expense_intake.py
canonical_governed_settings.py canonical_operational_alerts.py canonical_public_community.py
canonical_report_download.py canonical_staff_access.py canonical_team_communications.py
database.py freed_slot.py lead_alerts.py legacy_client_command_bridge.py masters_ai.py
maya_capabilities.py maya_inbox_bridge.py package4_value_runtime_guard.py
package5_cash_declaration_runtime_guard.py package5_expense_intake_runtime_guard.py
package5_governed_settings_runtime_guard.py package5_native_feedback_runtime_guard.py
package5_operational_delivery_runtime_guard.py package5_owner_reports_runtime_guard.py
package5_public_community_runtime_guard.py package5_team_communications_runtime_guard.py
package5_wave_rc_guard_contracts.py reviews.py site_community.py site_engagement.py
webhook_server.py'''.split())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=['python', 'edge'])
    parser.add_argument('phase', choices=['check', 'publish', 'verify'])
    parser.add_argument('revision')
    parser.add_argument('manifest_sha256')
    args = parser.parse_args()
    assert re.fullmatch('[0-9a-f]{8}', args.revision)
    stage = Path('/tmp/maya-wave-rc-' + args.revision + '-' + args.kind)
    manifest_path = stage / 'manifest.json'
    assert not stage.is_symlink() and sha(manifest_path) == args.manifest_sha256
    manifest = json.loads(manifest_path.read_text())
    assert manifest['kind'] == args.kind and manifest['wave'] == 'R-C'
    items = manifest['files']
    assert items and len({i['destination'] for i in items}) == len(items)
    assert len({i['artifact'] for i in items}) == len(items)
    botroot = Path('/home/botadmin/barbershop-bot')
    salon = Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html')
    mayaos = Path('/home/m/mocine3388/mayaos.ru/public_html')
    edge_targets = {salon / 'app' / name for name in [
        'index.html','index.codex-loyalty-20260721.html','index.backup-20260731-anton-analytics.html',
        'tenant-test.html','api-proxy.php','api-proxy.codex-loyalty-20260721.php',
        'maya-native-api.php','package5-client-consent-proxy.php','site-community-proxy.php',
        'media/team/.htaccess']}
    edge_targets.update([mayaos/'app/index.html',mayaos/'maya-platform-api.php',
        salon/'_next/static/chunks/6434-4f518aa0b3044b08.js'])
    if args.kind == 'python':
        expected = (manifest['requiredBackendRelease'] if args.phase == 'verify'
                    else manifest['baselineBackendRelease'])
        assert Path('/opt/maya-saas/current').resolve().name == expected
        if args.phase == 'publish':
            # Backend and the Python initiators remain quiesced until every
            # host/artifact is verified. This publisher never starts a service.
            for unit in ['maya-saas','barbershop-bot']:
                assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode != 0
    overrides = {}
    for item in items:
        assert Path(item['artifact']).name == item['artifact']
        target, candidate = Path(item['destination']), stage / item['artifact']
        assert not candidate.is_symlink() and not target.is_symlink()
        assert target.parent.is_dir() and not target.parent.is_symlink()
        if args.kind == 'edge':
            assert target in edge_targets
        else:
            assert (item['file'] in PYTHON_FILES and target == botroot / item['file']) or (
                item['file'] == 'app.html' and target == Path('/var/www/maya-platform/app.html'))
        assert sha(candidate) == item['after']
        expected = item['after'] if args.phase == 'verify' else item['before']
        if expected is None:
            assert not target.exists(), 'New target already exists'
        else:
            assert target.is_file() and sha(target) == expected, item['file'] + ': baseline/artifact mismatch'
        if candidate.suffix == '.py':
            compile(candidate.read_text(), item['file'], 'exec')
            overrides[item['file']] = candidate.read_text()
    if args.kind == 'python':
        assert {i['file'] for i in items} == PYTHON_FILES | {'app.html'}
        sys.path.insert(0, str(stage)); sys.path.insert(1, str(botroot))
        for guard in manifest['guards']:
            assert Path(guard['file']).name == guard['file']
            path = stage / guard['file']; assert sha(path) == guard['sha256']
            spec = importlib.util.spec_from_file_location('wave_rc_' + path.stem, path)
            module = importlib.util.module_from_spec(spec);sys.modules[spec.name] = module;spec.loader.exec_module(module)
            assert not getattr(module, guard['function'])(botroot, overrides), guard['file'] + ': candidate rejected'
    else:
        assert {Path(i['destination']) for i in items} == edge_targets
    changed = replace_items(stage, items) if args.phase == 'publish' else 0
    print(json.dumps({'wave':'R-C','kind':args.kind,'phase':args.phase,'status':'PASS',
        'filesChecked':len(items),'filesPublished':changed,'guards':len(manifest.get('guards', [])),
        'servicesStarted':0,'productionProofMessages':0,'productionProofBusinessMutations':0}))


if __name__ == '__main__':
    main()

