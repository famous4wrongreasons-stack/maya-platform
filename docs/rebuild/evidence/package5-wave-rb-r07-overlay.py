"""R07 bounded production-source overlay, no runtime imports or publication.

Use the hash-matched R-A deployed sources. Replace only listed functions with
canonical reviewed counterparts. In particular do not copy subscriptions.py
wholesale: unrelated production P405 tombstone differences are preserved.
Shared webhook/database replacements belong to the R04 overlay and are checked
by the composed R07 guard. B36 daily-report source is never selected.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path

FUNCTIONS = {
    'reactivation.py': ['run_reactivation_job'],
    'cycle_reminder.py': ['run_cycle_reminder_job'],
    'subscriptions.py': ['_send_renew_push', 'run_subscriptions_job'],
    'bot.py': ['cmd_cycle_now', 'cmd_subscriptions_now', 'cmd_reactivation_now', '_reactivation_job', '_subscriptions_job'],
    'package5_bulk_runtime_guard.py': ['scan_bulk_sources'],
}
NEW_FILES = ['canonical_retention_entry.py', 'package5_retention_runtime_guard.py']
# Full before-file hashes are supplied by the cutover manifest. The immutable
# function allowlist below additionally rejects an unexpected source body when
# another package has already changed an unrelated function in the same file.
BASELINE_FUNCTION_SHA256 = {
    "reactivation.py:run_reactivation_job": "0e795f1c45ae95cd18a0959b68287f1cef774fcad543a26df9ca0e235270427d",
    "cycle_reminder.py:run_cycle_reminder_job": "73e3d0c4b5f4e52bb36c9f44ebc41dd989bcdb17dc1f7744e32bb944323ae37a",
    "subscriptions.py:_send_renew_push": "bafe6135ae78020d4e2b3c1de9de400798d65bcc61e0040553350cd3b8c073e8",
    "subscriptions.py:run_subscriptions_job": "0d1b7293ee7fe41cdffa424b2506656b4b1dd27cdb77c3d65948c18282bc96fc",
    "bot.py:cmd_cycle_now": "3777100c7adcf13173bd44b3b6ead7832378eb148df4c3a8d53f433a8e70dc7b",
    "bot.py:cmd_subscriptions_now": "b1cd6b0c52935684c404d24bc1d516aee57bcfbd7fa4257d0a6186fa835cd409",
    "bot.py:cmd_reactivation_now": "65852ea492003bdde89e578c22fc4e34f58f5f5f74cf16ec4a7866d90c42cf2b",
    "bot.py:_reactivation_job": "d24854459baac2ff0358d75286177fd8b644f8a047ea201668fa57541e30b61c",
    "bot.py:_subscriptions_job": "4a72c710901ac5d1aa9387fc8093be6008c73be95a7335804574e8fc8c032fe1",
    "package5_bulk_runtime_guard.py:scan_bulk_sources": "10d1729aa46d09748950369a714d7f46c1ab3af99c20d46c5e5a52b19fcc894d"
}


def _functions(source):
    result = {}
    for node in ast.parse(source).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name in result:
                raise ValueError('Duplicate top-level function: ' + node.name)
            result[node.name] = node
    return result


def transform(filename, source, canonical_root):
    if filename not in FUNCTIONS:
        raise ValueError('Unowned R07 file')
    target = (Path(canonical_root) / filename).read_text()
    before_nodes, after_nodes = _functions(source), _functions(target)
    lines = source.splitlines(keepends=True)
    edits, manifest = [], []
    for name in FUNCTIONS[filename]:
        before, after = before_nodes[name], after_nodes[name]
        old = ast.get_source_segment(source, before)
        replacement = ast.get_source_segment(target, after)
        before_hash = hashlib.sha256(old.encode()).hexdigest()
        if before_hash != BASELINE_FUNCTION_SHA256[filename + ':' + name]:
            raise ValueError('Unexpected R07 baseline function: ' + filename + ':' + name)
        if before.decorator_list or after.decorator_list:
            raise ValueError('Unexpected decorated source boundary')
        edits.append((before.lineno - 1, before.end_lineno, replacement + '\n'))
        manifest.append({'function': name, 'beforeSha256': before_hash,
                         'afterSha256': hashlib.sha256(replacement.encode()).hexdigest()})
    for start, end, replacement in sorted(edits, reverse=True):
        lines[start:end] = [replacement]
    result = ''.join(lines)
    ast.parse(result)
    # Every unrelated module byte is preserved by line-slice construction.
    return result, manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name', choices=FUNCTIONS)
    parser.add_argument('source', type=Path)
    parser.add_argument('canonical_root', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('sha256')
    args = parser.parse_args()
    raw = args.source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == args.sha256, 'Unexpected full source hash'
    assert args.output.resolve() != args.source.resolve()
    result, manifest = transform(args.name, raw.decode(), args.canonical_root)
    with args.output.open('x') as handle:
        handle.write(result)
    print(json.dumps({'filename': args.name, 'beforeSha256': args.sha256,
                      'afterSha256': hashlib.sha256(result.encode()).hexdigest(), 'functions': manifest}))
