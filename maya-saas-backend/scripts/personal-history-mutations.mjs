// Exclusive, synthetic-only targeted mutations. Restore only our exact bytes;
// keep external backups and refuse to overwrite any concurrent source edit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
assert.ok(out && path.isAbsolute(out) && !fs.existsSync(out));
for (const f of ['.env', '.env.local'])
  assert.equal(fs.existsSync(path.join(cwd, f)), false);
fs.mkdirSync(out, { mode: 0o700 });
const presentation = 'src/ai-tools/personal-history-presentation.ts';
const handler = 'src/ai-tools/ai-tool-handler.service.ts';
const core = 'src/ai-tools/ai-core.service.ts';
const reader = 'src/crm/client-appointment-read.service.ts';
const definitions = [
  [
    'private-history-route',
    core,
    [
      [
        "if (requestedPeriod === 'past' || requestedPeriod === 'last_visit')",
        'if (false)',
      ],
    ],
    'answers authorized personal history',
  ],
  [
    'history-permission',
    presentation,
    [
      ['if (scope.enabled === false)', 'if (false)'],
      ['if (scope.enabled !== true)', 'if (false)'],
    ],
    'refuses disabled history',
  ],
  [
    'strict-setting',
    handler,
    [
      [
        '(await this.governedSettings?.ownHistoryEnabled(principal.tenantId)) ===\n      true',
        '(await this.governedSettings?.ownHistoryEnabled(principal.tenantId)) !== false',
      ],
    ],
    'publishes history only for the existing strict enabled setting ("true")',
  ],
  [
    'source-binding',
    presentation,
    [["scope.source !== 'maya_canonical'", 'false']],
    'refuses missing/foreign/unqualified',
  ],
  [
    'coverage',
    presentation,
    [["scope.coverage !== 'last_synchronized'", 'false']],
    'refuses missing/foreign/unqualified',
  ],
  [
    'attendance-proof',
    presentation,
    [["item.attendance !== 'arrived'", 'false']],
    'completion without arrived evidence',
  ],
  [
    'latest-order',
    presentation,
    [['b.time - a.time', 'a.time - b.time']],
    'five latest saved records',
  ],
  [
    'attendance-projection',
    handler,
    [['attendance: item.attendance ?? null,', 'attendance: null,']],
    'publishes history only for the existing strict enabled setting (true)',
  ],
  [
    'terminal-status',
    presentation,
    [["value === 'completed' ||\n    value === 'no_show'", 'false']],
    'past CRM status',
  ],
  [
    'canonical-attendance-read',
    reader,
    [['attendance: row.attendance,', 'attendance: null,']],
    'source-to-card history uses exact Client',
    'live',
  ],
];
const files = [...new Set(definitions.map((d) => d[1]))];
const originals = Object.fromEntries(
  files.map((f) => [f, fs.readFileSync(path.join(cwd, f), 'utf8')]),
);
const expected = { ...originals };
for (const [f, value] of Object.entries(originals))
  fs.writeFileSync(path.join(out, path.basename(f) + '.backup'), value, {
    mode: 0o600,
  });
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd,
  encoding: 'utf8',
}).trim();
const summary = {
  qualification: 'TARGETED_SYNTHETIC_NOT_FULL_RELEASE_CERTIFICATION',
  head,
  sourceHashes: Object.fromEntries(
    Object.entries(originals).map(([f, s]) => [
      f,
      createHash('sha256').update(s).digest('hex'),
    ]),
  ),
  baseline: null,
  liveBaseline: null,
  mutations: [],
  restored: null,
};
const save = () =>
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    { mode: 0o600 },
  );
const env = {
  NODE_ENV: 'test',
  TZ: 'UTC',
  LANG: 'C',
  NODE_OPTIONS: '--max-old-space-size=3072',
};
for (const key of ['PATH', 'HOME', 'TMPDIR'])
  if (process.env[key]) env[key] = process.env[key];
let active,
  cancelled = false;
const cancel = () => {
  cancelled = true;
  active?.kill('SIGTERM');
};
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
function restore(f) {
  assert.equal(
    fs.readFileSync(path.join(cwd, f), 'utf8'),
    expected[f],
    'Concurrent edit: do not overwrite ' + f,
  );
  fs.writeFileSync(path.join(cwd, f), originals[f]);
  expected[f] = originals[f];
}
async function run(name, live = false) {
  assert.equal(cancelled, false);
  const json = live
    ? path.join(out, name, 'telegram-initial-jest.json')
    : path.join(out, name + '.json');
  const args = live
    ? ['scripts/telegram-client-binding-proof.mjs', path.join(out, name)]
    : [
        'node_modules/jest/bin/jest.js',
        '--runInBand',
        '--runTestsByPath',
        'src/ai-tools/personal-history-presentation.spec.ts',
        'src/ai-tools/personal-history-source.spec.ts',
        'src/ai-tools/ai-core.service.spec.ts',
        '--json',
        '--outputFile=' + json,
      ];
  const fd = fs.openSync(path.join(out, name + '.log'), 'wx', 0o600);
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      active = spawn(process.execPath, args, {
        cwd,
        env,
        stdio: ['ignore', fd, fd],
      });
      active.once('error', reject);
      active.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    active = null;
    fs.closeSync(fd);
  }
  assert.equal(cancelled, false);
  const receipt = JSON.parse(fs.readFileSync(json, 'utf8'));
  if (live) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(out, name, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.clusterStopped, true);
    assert.equal(manifest.sourceUnchanged, true);
  }
  return {
    ...exit,
    passed: receipt.numPassedTests,
    failed: receipt.numFailedTests,
    failedAssertions: receipt.testResults.flatMap((r) =>
      r.assertionResults
        .filter((a) => a.status === 'failed')
        .map((a) => a.fullName),
    ),
    json,
  };
}
try {
  summary.baseline = await run('baseline');
  assert.equal(summary.baseline.code, 0);
  assert.equal(summary.baseline.failed, 0);
  save();
  summary.liveBaseline = await run('live-baseline', true);
  assert.equal(summary.liveBaseline.code, 0);
  save();
  for (const [name, file, edits, needle, mode] of definitions) {
    let mutated = originals[file];
    for (const [from, to] of edits) {
      assert.equal(
        mutated.split(from).length - 1,
        1,
        name + ': exact one mutation point',
      );
      mutated = mutated.replace(from, to);
    }
    assert.equal(
      fs.readFileSync(path.join(cwd, file), 'utf8'),
      originals[file],
    );
    expected[file] = mutated;
    fs.writeFileSync(path.join(cwd, file), mutated);
    let result;
    try {
      result = await run(name, mode === 'live');
    } finally {
      restore(file);
    }
    const killed =
      result.code === 1 &&
      result.failedAssertions.some((s) => s.includes(needle));
    summary.mutations.push({ name, file, killed, ...result });
    save();
    process.stdout.write(name + ': ' + (killed ? 'KILLED' : 'FAILED') + '\n');
    assert.ok(killed, 'Expected assertion did not kill ' + name);
  }
  summary.restored = await run('restored');
  assert.equal(summary.restored.code, 0);
  summary.liveRestored = await run('live-restored', true);
  assert.equal(summary.liveRestored.code, 0);
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.failure = error.message;
  process.exitCode = 1;
} finally {
  for (const f of files) restore(f);
  summary.sourceRestored = files.every(
    (f) => fs.readFileSync(path.join(cwd, f), 'utf8') === originals[f],
  );
  save();
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
}
