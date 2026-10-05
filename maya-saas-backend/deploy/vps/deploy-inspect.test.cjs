'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Execute the actual entrypoint with fake commands. Nothing can reach a host or
// mutate a deployment; only this test's disposable command log is written.
function run(mode, preparation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-inspect-test-'));
  const log = path.join(dir, 'commands');
  const names = ['git', 'dirname', 'mktemp', 'cp', 'chmod', 'rm', 'mkdir', 'npm', 'npx',
    'node', 'ssh', 'rsync', 'scp', 'curl', 'sudo', 'systemctl', 'pg_dump', 'psql'];
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), `#!/bin/bash
printf '%s\\n' '${name}' >> "$COMMAND_LOG"
${name === 'dirname' ? 'exec /usr/bin/dirname "$@"' : name === 'git' ? `case " $* " in
  *' rev-parse HEAD '*) printf '%s\\n' '1111111111111111111111111111111111111111';;
  *' status --porcelain -- . '*) printf '%s\\n' ' M src/synthetic.ts';;
  *) exit 93;;
esac` : 'exit 94'}
`, { mode: 0o700 });
  }
  try {
    const result = spawnSync('/bin/bash', [path.join(__dirname, 'deploy.sh')], {
      encoding: 'utf8', env: { PATH: dir, COMMAND_LOG: log,
        MAYA_DEPLOY_INSPECT_ONLY: mode, ...(preparation === undefined ? {} : {MAYA_DEPLOY_PREPARE_ONLY: preparation}) },
    });
    return { ...result, commands: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('inspection exits before any build, temp file, remote or database command; no stamp or HOME needed', () => {
  const result = run('1');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /LOCAL INSPECTION ONLY/);
  assert.match(result.stdout, /1111111111111111111111111111111111111111/);
  assert.match(result.stdout, /M src\/synthetic.ts/);
  assert.match(result.stdout, /NOT CHECKED/);
  assert.match(result.stdout, /not a dry run/);
  assert.deepEqual(result.commands, ['dirname', 'dirname', 'git', 'git']);
});
for (const [mode, preparation] of [['1', '1'], ['true', undefined], ['0', 'true']]) {
  test(`invalid/ambiguous mode ${mode}/${preparation} fails before work`, () => {
    const result = run(mode, preparation);
    assert.equal(result.status, 2);
    assert.deepEqual(result.commands, ['dirname', 'dirname']);
  });
}
