"""Scoped R-B artifact publication using the established staged replacement flow.

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


def restart_bot():
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'barbershop-bot'], check=True)
    assert subprocess.check_output(['systemctl', 'is-active', 'barbershop-bot'], text=True).strip() == 'active'


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
            owner = (stat.st_uid, stat.st_gid) if stat else (os.getuid(), os.getgid())
            prior = backup / item['artifact']
            assert not prior.exists(), 'An earlier publication backup must not be overwritten'
            if stat:
                shutil.copyfile(target, prior)
                os.chmod(prior, 0o600)
            temporary = target.with_name(target.name + '.wave-rb-candidate')
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
                temporary = target.with_name(target.name + '.wave-rb-restore')
                assert not temporary.exists()
                shutil.copyfile(backup / item['artifact'], temporary)
                restore_metadata(temporary, mode, owner)
                os.replace(temporary, target)
                assert sha(target) == item['before']
        if restart:
            restart()
        raise
    return len(changed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=['python', 'edge'])
    parser.add_argument('phase', choices=['check', 'publish', 'verify'])
    parser.add_argument('manifest_sha256')
    args = parser.parse_args()
    stage = Path('/tmp/maya-wave-rb-cb4fb27c-' + args.kind)
    manifest_path = stage / 'manifest.json'
    assert sha(manifest_path) == args.manifest_sha256
    manifest = json.loads(manifest_path.read_text())
    assert manifest['kind'] == args.kind and manifest['wave'] == 'R-B'
    items = manifest['files']
    assert items and len({i['destination'] for i in items}) == len(items)
    assert len({i['artifact'] for i in items}) == len(items)
    botroot = Path('/home/botadmin/barbershop-bot')
    edge_roots = [Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html'),
                  Path('/home/m/mocine3388/mayaos.ru/public_html')]
    edge_targets = {edge_roots[0] / 'app' / name for name in [
        'index.html', 'index.codex-loyalty-20260721.html',
        'index.backup-20260731-anton-analytics.html', 'tenant-test.html']}
    edge_targets.add(edge_roots[1] / 'app/index.html')
    if args.kind == 'python':
        expected = manifest['baselineBackendRelease'] if args.phase == 'check' else manifest['requiredBackendRelease']
        assert Path('/opt/maya-saas/current').resolve().name == expected
        assert subprocess.check_output(['systemctl', 'is-active', 'barbershop-bot'], text=True).strip() == 'active'
    overrides = {}
    for item in items:
        assert Path(item['artifact']).name == item['artifact']
        target, candidate = Path(item['destination']), stage / item['artifact']
        if args.kind == 'edge':
            assert target in edge_targets and target.suffix == '.html'
        else:
            assert target == botroot / item['file'] and target.suffix == '.py' or (
                item['file'] == 'app.html' and target == Path('/var/www/maya-platform/app.html'))
            assert Path(item['file']).name == item['file']
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
        sys.path.insert(0, str(stage))
        sys.path.insert(1, str(botroot))
        for guard in manifest['guards']:
            assert Path(guard['file']).name == guard['file']
            path = stage / guard['file']
            assert sha(path) == guard['sha256']
            spec = importlib.util.spec_from_file_location('wave_rb_' + path.stem, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = module
            spec.loader.exec_module(module)
            assert not getattr(module, guard['function'])(botroot, overrides), guard['file'] + ': guard rejected candidate'
    changed = replace_items(stage, items, restart_bot if args.kind == 'python' else None) if args.phase == 'publish' else 0
    print(json.dumps({'wave': 'R-B', 'kind': args.kind, 'phase': args.phase,
                      'status': 'PASS', 'filesChecked': len(items), 'filesPublished': changed,
                      'guards': len(manifest.get('guards', [])),
                      'productionProofMessages': 0, 'productionProofBusinessMutations': 0}))


if __name__ == '__main__':
    main()
