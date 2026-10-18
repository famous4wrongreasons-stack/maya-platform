import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readChromeReadyFile } from './chrome-ready-file.mjs';

const endpoint = ['49321', '/devtools/browser/0da2b3c4-1234-4567-8910-aabbccddeeff'];
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-chrome-readiness-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'DevToolsActivePort');
}

test('Chrome endpoint is pending before the ready file exists', t => {
  assert.equal(readChromeReadyFile(fixture(t)), null);
});

test('Chrome create-before-write race waits for the complete endpoint', t => {
  const file = fixture(t);
  fs.writeFileSync(file, '');
  // The former existence-only oracle fails on this actual filesystem state.
  assert.equal(fs.existsSync(file), true);
  assert.throws(() => assert.match(fs.readFileSync(file, 'utf8').trim().split('\n')[0], /^\d+$/));
  assert.equal(readChromeReadyFile(file), null);
  fs.writeFileSync(file, endpoint[0] + '\n');
  assert.equal(readChromeReadyFile(file), null);
  fs.appendFileSync(file, endpoint[1].slice(0, -1));
  assert.equal(readChromeReadyFile(file), null);
  fs.appendFileSync(file, endpoint[1].slice(-1));
  assert.deepEqual(readChromeReadyFile(file), endpoint);
});

for (const [name, text] of [
  ['nonnumeric port', 'other\n' + endpoint[1]],
  ['zero port', '0\n' + endpoint[1]],
  ['out-of-range port', '65536\n' + endpoint[1]],
  ['foreign WebSocket URL', endpoint[0] + '\nws://example.invalid/devtools/browser/0da2b3c4-1234-4567-8910-aabbccddeeff'],
  ['wrong route', endpoint[0] + '\n/other/0da2b3c4-1234-4567-8910-aabbccddeeff'],
  ['extra field', endpoint.join('\n') + '\nother'],
]) test('Chrome readiness refuses ' + name, t => {
  const file = fixture(t); fs.writeFileSync(file, text);
  assert.equal(readChromeReadyFile(file), null);
});

test('Chrome readiness does not swallow filesystem errors', t => {
  assert.throws(() => readChromeReadyFile(path.dirname(fixture(t))), { code: 'EISDIR' });
});
