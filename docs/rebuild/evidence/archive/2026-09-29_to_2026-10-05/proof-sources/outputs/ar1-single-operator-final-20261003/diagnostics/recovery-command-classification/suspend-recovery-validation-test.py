from pathlib import Path
import datetime
import hashlib
import importlib.util
import json
import tempfile

root = Path.cwd()
work = root / 'work/ar1-single-operator-final-20261003'
out = root / 'outputs/ar1-single-operator-final-20261003'
source = work / 'suspend-recovery-validation.py'
spec = importlib.util.spec_from_file_location('recovery_validation', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
read = lambda path: json.loads(path.read_text())
plan = read(out / 'SUSPEND-RECOVERY-PLAN.json')
events = read(out / 'diagnostics/host-suspend-20261004/snapshot.json')['events']
now = datetime.datetime.now(datetime.timezone.utc)
intervals = module.periods(events, now)
assert intervals == [(module.instant(plan['firstSleep']), module.instant(plan['fullWake']))]
results = []


def refused(name, call):
    try:
        call()
    except AssertionError:
        results.append({'case': name, 'result': 'REFUSED AS REQUIRED'})
        return
    raise AssertionError(name + ' was admitted')


good = read(out / 'receipts/mutation-parts/widgets-mutation-part-P-mint-part-4-of-4.json')
module.require_awake(module.instant(good['startedAt']), module.instant(good['finishedAt']), intervals)
results.append({'case': 'Actual complete pre-sleep control', 'result': 'PASS'})
bad = read(out / 'receipts/suspend-invalidated/P-ledger/widgets-mutation-part-P-ledger.json')
assert bad['status'] == 'AS-DECLARED' and not bad['baseline_red'] and bad['mismatches'] == 0
refused('Actual green P-ledger overlapping clamshell sleep',
        lambda: module.require_awake(module.instant(bad['startedAt']), module.instant(bad['finishedAt']), intervals))
refused('DarkWake is not a full wake',
        lambda: module.require_awake(module.instant('2026-10-04T06:26:35Z'), module.instant('2026-10-04T06:26:36Z'), intervals))
module.require_awake(module.instant(plan['fullWake']) + datetime.timedelta(seconds=1), now, intervals)
results.append({'case': 'Post-full-wake interval', 'result': 'PASS'})
open_period = module.periods([{'utc': plan['firstSleep'], 'event': 'Sleep'}], now)
refused('Missing full wake keeps interval inadmissible',
        lambda: module.require_awake(now - datetime.timedelta(seconds=1), now, open_period))
with tempfile.TemporaryDirectory(prefix='recovery-validator-', dir=work) as directory:
    base = Path(directory)
    path = base / 'binding.json'
    path.write_text('{"candidate":"retained"}\n')
    binding = {'path': path.name, 'sha256': module.digest(path)}
    module.require_binding(base, binding)
    path.write_text('{"candidate":"substituted"}\n')
    refused('Retained evidence hash drift', lambda: module.require_binding(base, binding))
second = {'slot': 'after', 'startedAt': plan['fullWake'], 'finishedAt': now.isoformat()}
first = {**good, 'slot': 'before'}
assert module.part_for_execution([first, second], module.instant(good['startedAt']), module.instant(good['finishedAt']))['slot'] == 'before'
results.append({'case': 'Reused worker mirror binds by exact part interval', 'result': 'PASS'})
refused('Ambiguous overlapping part intervals',
        lambda: module.part_for_execution([first, first], module.instant(good['startedAt']), module.instant(good['finishedAt'])))
with tempfile.TemporaryDirectory(prefix='recovery-mirror-', dir=work) as directory:
    base = Path(directory)
    (base / 'canonical-ai').mkdir()
    (base / 'mirror').mkdir()
    link = base / 'mirror' / 'ai'
    link.symlink_to(base / 'canonical-ai', target_is_directory=True)
    assert module.mirror_for_cwd(str(link)) == str((base / 'mirror').resolve())
    assert str(link.resolve().parent) != module.mirror_for_cwd(str(link))
results.append({'case': 'Symlinked fixture retains declared worker-mirror parent', 'result': 'PASS'})
assert len(results) == 9
result = {'candidate': plan['candidate'], 'status': 'PASS', 'checkedAt': now.isoformat(),
          'cases': results, 'sourceSha256': module.digest(source),
          'testSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'actualGreenInvalidatedPartSha256': module.digest(out / 'receipts/suspend-invalidated/P-ledger/widgets-mutation-part-P-ledger.json'),
          'productChanged': False, 'timeoutsChanged': False}
(out / 'SUSPEND-RECOVERY-VALIDATION-TEST.json').write_text(json.dumps(result, indent=2) + '\n')
print('Recovery evidence admission: 9 counterfactuals PASS; actual green sleep-overlapped part refused.')
