// Keep the standalone certification path in the ordinary runtime test glob. It previously
// drifted from intents.test.mjs after submitted confirmations became immutable factual previews.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('L27 certification: COMMIT → frozen preview → explicit receipt READ remains one outcome', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./l27-terminal-outcome-probe.mjs', import.meta.url))], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\nL27: PASS\s*$/);
});
