"""Compose approved R03/R04/R07 overlays over exact R-A production snapshots.

Only creates a fresh private staging directory. No production I/O or app imports.
The manifest is suitable for the scoped publisher after ordinary wave gates.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--evidence-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--node', required=True)
    parser.add_argument('--release-name', required=True)
    args = parser.parse_args()
    repo, evidence, output = args.repository.resolve(), args.evidence_root.resolve(), args.output.resolve()
    assert not output.exists(), 'Create a new candidate; do not overwrite prior proof artifacts'
    assert args.release_name.startswith('202609') and '/' not in args.release_name
    tools = repo / 'docs/rebuild/evidence'
    canonical = repo / 'ai администратор'
    metadata = json.loads((evidence / 'production-entry-metadata.json').read_text())
    assert metadata['release'] == '/opt/maya-saas/releases/20260907-p5-ra-d8049d47'
    baseline = evidence / 'production-python-baseline'
    stage, edge = output / 'python', output / 'edge'
    stage.mkdir(parents=True)
    edge.mkdir()
    for path in sorted(baseline.glob('*.py')):
        assert sha(path) == metadata['pythonHashes'][path.name]
        shutil.copy2(path, stage / path.name)
    r03 = load(tools / 'package5-wave-rb-r03-overlay.py', 'r03_overlay')
    r04 = load(tools / 'package5-wave-rb-r04-overlay.py', 'r04_overlay')
    r07 = load(tools / 'package5-wave-rb-r07-overlay.py', 'r07_overlay')
    ownership = {}
    for name, transform in r03.TRANSFORMS.items():
        path = stage / name
        path.write_text(transform(path.read_text()))
        ownership.setdefault(name, []).append('R03')
    for name in [*r04.BODIES, 'claude_ai.py']:
        path = stage / name
        path.write_text(r04.transform(name, path.read_text(), repo))
        ownership.setdefault(name, []).append('R04')
    for name in r07.FUNCTIONS:
        path = stage / name
        result, _ = r07.transform(name, path.read_text(), canonical)
        path.write_text(result)
        ownership.setdefault(name, []).append('R07')
    for package, names in {
        'R03': ['canonical_staff_schedule_entry.py', 'package5_staff_schedule_guard.py'],
        'R04': ['canonical_work_entry.py', 'package5_operational_work_runtime_guard.py'],
        'R07': r07.NEW_FILES,
    }.items():
        for name in names:
            assert name not in metadata['pythonHashes'] and not (stage / name).exists()
            shutil.copy2(canonical / name, stage / name)
            ownership[name] = [package]
    # R04 owns the shared dispatch and renewal-marker bodies containing R07's
    # exact refusal. The package staging manifests separately pin commit hunks.
    for name in ['database.py', 'webhook_server.py']:
        ownership[name].append('R07')
    for path in stage.glob('*.py'):
        ast.parse(path.read_text())
    def daily_report(path):
        source = path.read_text()
        node = next(n for n in ast.walk(ast.parse(source))
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == '_daily_report_job')
        return ast.dump(node, include_attributes=False)
    assert daily_report(stage / 'bot.py') == daily_report(baseline / 'bot.py')
    files = [{'file': name, 'artifact': name,
              'destination': '/home/botadmin/barbershop-bot/' + name,
              'before': metadata['pythonHashes'].get(name), 'after': sha(stage / name),
              'packages': packages} for name, packages in sorted(ownership.items())]
    pwas = json.loads((evidence / 'production-pwa-baseline-manifest.json').read_text())
    edge_files = []
    for index, item in enumerate(pwas):
        before = Path(item['path'])
        assert sha(before) == item['sha256']
        destination = stage / 'app.html' if item['target'] == 'vps/app.html' else edge / f'pwa-{index}.html'
        script = "const fs=require('fs');const m=require(process.argv[1]);const s=fs.readFileSync(process.argv[2],'utf8');fs.writeFileSync(process.argv[3],m.transform(s,process.argv[4]));"
        subprocess.run([args.node, '-e', script, str(tools / 'package5-wave-rb-r04-pwa-overlay.cjs'),
                        str(before), str(destination), str(repo)], check=True)
        row = {'file': 'app.html' if item['target'] == 'vps/app.html' else item['target'],
               'artifact': destination.name, 'destination': item['destination'],
               'before': item['sha256'], 'after': sha(destination), 'packages': ['R04']}
        (files if item['target'] == 'vps/app.html' else edge_files).append(row)
    guard_map = {
        'package4_value_runtime_guard.py': 'scan_runtime',
        'package5_control_plane_runtime_guard.py': 'scan_runtime',
        'package5_bulk_runtime_guard.py': 'scan_bulk_sources',
        'package5_staff_authority_guard.py': 'scan_staff_authority',
        'package5_staff_schedule_guard.py': 'scan_staff_schedule',
        'package5_operational_work_runtime_guard.py': 'scan_operational_work',
        'package5_retention_runtime_guard.py': 'scan_retention_sources',
    }
    sys.path.insert(0, str(stage))
    guards = []
    for name, function in guard_map.items():
        module = load(stage / name, 'candidate_' + Path(name).stem)
        findings = getattr(module, function)(stage)
        assert not findings, (name, [str(f) for f in findings])
        guards.append({'file': name, 'function': function, 'sha256': sha(stage / name)})
    common = {'wave': 'R-B', 'baselineBackendRelease': Path(metadata['release']).name,
              'requiredBackendRelease': args.release_name}
    for directory, kind, rows in [(stage, 'python', files), (edge, 'edge', edge_files)]:
        manifest = {**common, 'kind': kind, 'files': rows, 'guards': guards if kind == 'python' else []}
        (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        shutil.copy2(tools / 'package5-wave-rb-publish.py', directory / 'publish.py')
    result = {'status': 'PASS', 'pythonTargets': len(files), 'edgeTargets': len(edge_files),
              'guards': len(guards), 'b36DailyReportPreserved': True,
              'pythonManifestSha256': sha(stage / 'manifest.json'),
              'edgeManifestSha256': sha(edge / 'manifest.json'),
              'productionMutationsMessages': 0}
    (output / 'composition-proof.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
