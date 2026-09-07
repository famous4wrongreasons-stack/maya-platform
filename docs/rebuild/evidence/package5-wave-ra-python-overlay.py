"""Compose reviewed R01/R02 source hunks over exact active Python sources.

No network, application import, database or provider effect. Existing production
launcher and unmodified B35 functions survive byte-for-byte. Refuse overlapping
production/source edits; write candidates outside the repository, never deploy.
"""
from __future__ import annotations
import argparse
import ast
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

BASELINE = '45688886'
FILES = ('bot.py', 'webhook_server.py', 'claude_ai.py', 'database.py', 'memory.py',
         'web_auth.py', 'legacy_appointment_bridge.py', 'package5_control_plane_runtime_guard.py')
NEW = ('canonical_staff_access.py', 'package5_staff_authority_guard.py', 'legacy_client_entry.py')
R01_FUNCTIONS = {'_get_ai_response_async', 'cmd_start', 'handle_contact', '_build_dossier', '_dossier_chat_id', 'cmd_client',
 '_request_contact_share', '_start_contact_flow', '_handle_contact_input', '_show_confirm', '_finalize_booking',
 '_show_my_bookings', '_handle_cancel_record_request', '_handle_cancel_record_confirm', '_handle_freed_slot_accept', '_handle_freed_slot_decline'}


def sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def merge(base, changed, active):
    old, new, target = base.splitlines(True), changed.splitlines(True), active.splitlines(True)
    index = {}
    for block in difflib.SequenceMatcher(a=old, b=target, autojunk=False).get_matching_blocks():
        for i in range(block.size):
            index[block.a+i] = block.b+i
    edits = []
    for tag, i, j, k, l in difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        if i == j:
            if i in index:
                start = end = index[i]
            elif i-1 in index:
                start = end = index[i-1]+1
            else:
                raise ValueError(f'Unreviewed production overlap at insertion {i+1}')
        else:
            mapped = [index.get(p) for p in range(i, j)]
            if None in mapped or mapped != list(range(mapped[0], mapped[0]+len(mapped))):
                raise ValueError(f'Unreviewed production overlap at lines {i+1}:{j}')
            start, end = mapped[0], mapped[-1]+1
        edits.append((start, end, new[k:l]))
    for start, end, replacement in sorted(edits, reverse=True):
        target[start:end] = replacement
    output = ''.join(target)
    ast.parse(output)
    return output, len(edits)


def functions(source):
    return {n.name: ast.get_source_segment(source, n) for n in ast.parse(source).body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository-root', type=Path, required=True)
    parser.add_argument('--before-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.resolve().is_relative_to(args.repository_root.resolve()):
        raise ValueError('Candidate files belong in external owned scratch')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for name in FILES:
        rel = 'ai администратор/' + name
        base = subprocess.check_output(['git', '-C', str(args.repository_root), 'show', BASELINE+':'+rel], text=True)
        changed = (args.repository_root / rel).read_text()
        active = (args.before_dir / name).read_text()
        result, hunks = merge(base, changed, active)
        olds, news, acts, outs = map(functions, [base, changed, active, result])
        changed_names = [key for key in news if news[key] != olds.get(key)]
        for key in acts:
            if key not in changed_names and outs.get(key) != acts[key]:
                raise ValueError(f'Unowned function changed: {name}:{key}')
        (args.output_dir / name).write_text(result)
        owners = {}
        for key in changed_names:
            owners[key] = ('R01' if name == 'legacy_appointment_bridge.py' or (name == 'bot.py' and key in R01_FUNCTIONS)
                           else 'R01+R02' if name == 'bot.py' and key in {'handle_callback', 'process_message'} else 'R02')
        records.append({'file': name, 'activeBeforeSha256': sha(active), 'candidateSha256': sha(result),
                        'changedHunks': hunks, 'functionOwners': owners,
                        'changedFunctionsWithExistingProductionOverlay': [key for key in changed_names if olds.get(key) != acts.get(key)],
                        'unchangedProductionFunctionsPreserved': len(acts)-len(changed_names),
                        'dailyReportProductionFunctionPreserved': name != 'bot.py' or '_daily_report_job' in acts and acts['_daily_report_job'] == outs.get('_daily_report_job')})
    for name in NEW:
        source = (args.repository_root / 'ai администратор' / name).read_text()
        ast.parse(source)
        (args.output_dir / name).write_text(source)
        records.append({'file': name, 'owner': 'R01' if name == 'legacy_client_entry.py' else 'R02', 'newFile': True, 'candidateSha256': sha(source)})
    launcher = args.before_dir / 'pwa_api.py'
    if launcher.is_file():
        (args.output_dir / launcher.name).write_bytes(launcher.read_bytes())
        records.append({'file': launcher.name, 'unchangedProductionLauncher': True, 'candidateSha256': hashlib.sha256(launcher.read_bytes()).hexdigest()})
    payload = {'baseline': BASELINE, 'productionEffects': 0, 'method': 'Non-overlapping exact-line three-way R01/R02 hunks; preserve every unmodified production function', 'files': records}
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(payload, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({'pass': True, 'files': len(records), 'manifest': str(args.manifest)}))

if __name__ == '__main__':
    main()
