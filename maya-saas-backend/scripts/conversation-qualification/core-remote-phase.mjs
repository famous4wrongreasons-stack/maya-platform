// systemd ExecCondition runs immediately before each own service ExecStart.
// A closed phase can never be reopened; no authority is issued here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readJson } from './core-remote-bootstrap.mjs';
export function validatePhaseRecord(record, phase, sha256, closed, now) {
  assert.equal(closed, false, 'remote_phase_closed');
  assert.equal(record.planSha256, sha256);
  assert.equal(record.phase, phase);
  assert.ok(
    Number.isSafeInteger(record.executeBefore) && now < record.executeBefore,
    'remote_phase_expired',
  );
}
export function assertPhase(root, phase, sha256, now = Date.now()) {
  assert.match(root, /^\/srv\/maya-core-diagnostic-[a-f0-9-]{36}$/);
  assert.equal(root.length, 62);
  assert.ok(['setup', 'run'].includes(phase));
  assert.ok(
    typeof sha256 === 'string' &&
      sha256.length === 64 &&
      /^[a-f0-9]{64}$/.test(sha256),
  );
  assert.equal(
    fs.existsSync(root + '/' + phase + '-closed.json'),
    false,
    'remote_phase_closed',
  );
  const file = root + '/' + phase + '-phase.json';
  assert.equal(fs.lstatSync(file).uid, 0);
  const record = readJson(file);
  validatePhaseRecord(
    record,
    phase,
    sha256,
    fs.existsSync(root + '/' + phase + '-closed.json'),
    now,
  );
  return record;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      strict: true,
      options: {
        root: { type: 'string' },
        phase: { type: 'string' },
        sha256: { type: 'string' },
      },
    });
    assertPhase(values.root, values.phase, values.sha256);
  } catch {
    process.exitCode = 1;
  }
}
