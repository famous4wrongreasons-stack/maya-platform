"""Fresh scratch guard proof; no product execution, keys or network effects."""
from pathlib import Path
import ast
import datetime
import hashlib
import json

root = Path(__file__).resolve().parents[2]
work = root / 'work/ar1-single-operator-final-20261003'
out = root / 'outputs/ar1-single-operator-final-20261003'
candidate = (work / 'HEAD').read_text().strip()
source = (work / 'run-entire.py').read_text()
loop = next(node for node in ast.parse(source).body if isinstance(node, ast.While))
code = ast.unparse(loop)
assert "d.get('status')" in code


class Fixture:
    def __init__(self, value):
        self.value = value

    def exists(self):
        return True

    def read_text(self):
        return json.dumps(self.value)


class Container:
    def __init__(self, main, l27):
        self.main, self.l27 = main, l27

    def __truediv__(self, name):
        return self.main if name == 'receipts/main-programme-status.json' else self.l27


def probe(text, states):
    events = []
    main = Fixture({'candidate': candidate, 'exits': [0] * 9})
    l27 = Fixture(states[0])
    counter = [0]

    class Clock:
        def sleep(self, _seconds):
            events.append('wait')
            counter[0] += 1
            if counter[0] >= len(states):
                raise RuntimeError('partial-not-admitted')
            l27.value = states[counter[0]]

    env = {'out': Container(main, l27), 'head': candidate, 'json': json, 'time': Clock()}
    try:
        exec(compile(text, 'current-run-entire-guard', 'exec'), env)
        events.append('admission')
        error = None
    except Exception as exception:
        error = type(exception).__name__ + ':' + str(exception)
    return {'events': events, 'error': error}


before = probe(code.replace("d.get('status')", "d['status']"),
               [{'baseline': 'green'}, {'status': 'PASS'}])
after = probe(code, [{'baseline': 'green'}, {'status': 'PASS'}])
failed = probe(code, [{'baseline': 'green'}, {'status': 'FAIL'}])
partial = probe(code, [{'baseline': 'green'}])
assert before['error'].startswith('KeyError') and before['events'] == []
assert after == {'events': ['wait', 'admission'], 'error': None}
assert failed['error'].startswith('AssertionError') and failed['events'] == ['wait']
assert partial == {'events': ['wait'], 'error': 'RuntimeError:partial-not-admitted'}
value = {
    'candidate': candidate, 'status': 'PASS',
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'source': str((work / 'run-entire.py').relative_to(root)),
    'sourceSha256': hashlib.sha256(source.encode()).hexdigest(),
    'proofDriver': str(Path(__file__).relative_to(root)),
    'proofDriverSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'before': before, 'after': after, 'explicitFailure': failed,
    'partialNeverAdmitted': partial, 'candidateCodeChanged': False,
    'testProcessInterrupted': False, 'admissionOfPartialReport': False,
    'scope': 'Fresh isolated execution of the actual scratch guard AST; synthetic report objects only. '
             'Restoring direct indexing reproduces the historical missing-status failure. Current guard '
             'waits for a complete report and refuses explicit failure and partial admission. '
             'No historical receipt admitted. Actual native corpus and product results remain independently required.',
}
(out / 'HARNESS-INTERMEDIATE-RECEIPT.json').write_text(json.dumps(value, indent=2) + '\n')
print('Fresh scratch report guard: PASS; candidate unchanged')
