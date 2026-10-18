// Runner evidence regression: no Jest, database or external provider execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const file = new URL('./widgets-mutation-battery.mjs', import.meta.url);
const current = fs.readFileSync(file, 'utf8');
function snapshot(source, jsonFile) {
  const start = source.indexOf('const failedTests = '),
    end = source.indexOf('\nconst run = ', start);
  assert(start >= 0 && end > start);
  const a = source.indexOf('const controls = new Map();'),
    b = source.indexOf('\n// Even a shard', a);
  assert(a >= 0 && b > a);
  const report = { baseline_controls: {}, neutraliser_controls: {} };
  const ctx = vm.createContext({
    fs,
    path,
    report,
    jsonFile,
    runSteps: () => ({
      unitFailed: [],
      liveFailed: JSON.parse(JSON.stringify(ctx.failure)).failed,
      outcome: { live: { status: 1, tail: 'synthetic timeout detail' } },
      problems: [],
    }),
  });
  vm.runInContext(
    source.slice(start, end) +
      '\nglobalThis.failure=failedTests(jsonFile,true);',
    ctx,
  );
  vm.runInContext(source.slice(a, b) + '\ncontrolFor(null,["live"]);', ctx);
  return JSON.parse(JSON.stringify(report));
}
test('baseline receipt retains original error and duration after a later Jest report overwrites the working file', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-mutation-report-'),
  );
  try {
    const jsonFile = path.join(directory, 'jest.json');
    fs.writeFileSync(
      jsonFile,
      JSON.stringify({
        testResults: [
          {
            name: 'synthetic',
            status: 'failed',
            assertionResults: [
              {
                title: 'C9 synthetic',
                fullName: 'C9 synthetic',
                ancestorTitles: [],
                status: 'failed',
                duration: 15001,
                failureMessages: ['synthetic wait exceeded original budget'],
              },
            ],
          },
        ],
      }),
    );
    // Counterfactual restores the title-only baseline receipt behavior of 30db3a94.
    const before = current
      .replace(/^      failure_details:.*\n/m, '')
      .replace(/^      failure_tails:.*\n/m, '');
    assert.notEqual(before, current);
    const old = snapshot(before, jsonFile),
      result = snapshot(current, jsonFile);
    fs.writeFileSync(jsonFile, JSON.stringify({ testResults: [] }));
    assert.equal(
      old.baseline_controls['baseline|live'].failure_details,
      undefined,
    );
    assert.deepEqual(
      result.baseline_controls['baseline|live'].failure_details[0]
        .failureMessages,
      ['synthetic wait exceeded original budget'],
    );
    assert.equal(
      result.baseline_controls['baseline|live'].failure_details[0].duration,
      15001,
    );
    assert.equal(
      result.baseline_controls['baseline|live'].failure_tails.live,
      'synthetic timeout detail',
    );
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
