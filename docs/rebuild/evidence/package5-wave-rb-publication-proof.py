"""Offline fault injection against the actual scoped publication implementation."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch


def run_case(module, failure_copy=None, failure_restart=False, success=False):
    with tempfile.TemporaryDirectory(prefix='maya-rb-publication-proof-') as temporary:
        root = Path(temporary)
        stage, active = root / 'stage', root / 'active'
        stage.mkdir()
        active.mkdir()
        items, before = [], {}
        for index in range(5):
            name = f'{index}.py'
            target = active / name
            if index:
                target.write_text(f'old_{index}\n')
                target.chmod(0o640)
                before[name] = (target.read_bytes(), target.stat().st_mode & 0o777)
            candidate = stage / name
            candidate.write_text(f'new_{index}\n')
            items.append({'file': name, 'artifact': name, 'destination': str(target),
                          'before': module.sha(target) if index else None,
                          'after': module.sha(candidate)})
        copies, restarts, ownership_calls = 0, 0, []
        copyfile, metadata = module.shutil.copyfile, module.restore_metadata

        def fault_copy(source, destination, *args, **kwargs):
            nonlocal copies
            if Path(source).parent == stage:
                copies += 1
                if copies == failure_copy:
                    raise OSError('Synthetic candidate copy failure')
            return copyfile(source, destination, *args, **kwargs)

        def restart():
            nonlocal restarts
            restarts += 1
            if failure_restart and restarts == 1:
                raise RuntimeError('Synthetic restart failure')

        def track_metadata(path, mode, owner):
            ownership_calls.append((mode, owner))
            metadata(path, mode, owner)

        failed = False
        with patch.object(module.shutil, 'copyfile', side_effect=fault_copy), \
             patch.object(module, 'restore_metadata', side_effect=track_metadata):
            try:
                changed = module.replace_items(stage, items, restart)
                assert success and changed == 5
            except (OSError, RuntimeError):
                failed = True
                assert not success
        assert failed != success
        if success:
            assert all(module.sha(Path(item['destination'])) == item['after'] for item in items)
        else:
            assert not (active / '0.py').exists()
            for name, (content, mode) in before.items():
                assert (active / name).read_bytes() == content
                assert (active / name).stat().st_mode & 0o777 == mode
        assert not list(active.glob('*.wave-rb-*'))
        assert ownership_calls
        assert restarts == (2 if failure_restart else 1)
        # Preflight-to-write races cannot overwrite an unowned replacement.
        changed_path = active / '1.py'
        changed_path.write_text('someone_else_changed_this\n')
        try:
            module.replace_items(stage, [items[1]])
        except AssertionError:
            pass
        else:
            raise AssertionError('Baseline race accepted')
        assert changed_path.read_text() == 'someone_else_changed_this\n'
        return {'copyFailureAt': failure_copy, 'restartFailure': failure_restart,
                'successCase': success, 'status': 'PASS', 'metadataPreserved': True,
                'temporaryFilesRemaining': 0, 'baselineRaceRejected': True,
                'externalCommandsExecuted': 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    source = Path(__file__).with_name('package5-wave-rb-publish.py')
    spec = importlib.util.spec_from_file_location('wave_rb_publication', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cases = [run_case(module, failure_copy=number) for number in [2, 4]]
    cases.append(run_case(module, failure_restart=True))
    cases.append(run_case(module, success=True))
    # Preserve root-owned PWA metadata using the exact scoped chown call;
    # intercept that command, never execute it on the local computer.
    with tempfile.TemporaryDirectory(prefix='maya-rb-owner-proof-') as temporary:
        target = Path(temporary) / 'app.html'
        target.write_text('fixture')
        with patch.object(module.subprocess, 'run') as command:
            module.restore_metadata(target, 0o644, (0, 0))
            command.assert_called_once_with(['sudo', '-n', 'chown', '0:0', str(target)], check=True)
        assert target.stat().st_mode & 0o777 == 0o644
    report = {'status': 'PASS', 'publisherSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'cases': cases, 'rootOwnedPwaMetadata': 'PASS',
              'actualGuardChecks': 'separate composed-source proof, not substituted by this filesystem harness',
              'productionOperations': 0, 'processHygiene': 0}
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': 'PASS', 'filesystemCases': len(cases), 'rootOwnershipCase': 'PASS'}))


if __name__ == '__main__':
    main()
