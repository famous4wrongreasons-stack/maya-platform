import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync('сайт и приложение/app.html', 'utf8');
const checker = resolve('scripts/verify-prepublication-contracts.mjs');
function check(text) {
  const dir = mkdtempSync(join(tmpdir(), 'maya-prepublication-counterfactual-'));
  try {
    const file = join(dir, 'app.html');
    writeFileSync(file, text);
    return spawnSync(process.execPath, [checker, file], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function mutate(find, replacement) {
  assert.equal(source.split(find).length - 1, 1, 'counterfactual anchor must be unique');
  return source.replace(find, replacement);
}
test('current canonical bundle satisfies all release checks', () => {
  const result = check(source);
  assert.equal(result.status, 0, result.stderr);
});
for (const [name, find, replace, failure] of [
  ['tenant isolation', "CHAT_HISTORY_CACHE + ':saas:' + ctx.ns + ':' + uid + ':' + chatSurface()", "CHAT_HISTORY_CACHE + ':saas:shared:' + uid + ':' + chatSurface()", 'tenant-scoped chat cache'],
  ['User isolation', "ctx.ns + ':' + uid + ':' + chatSurface()", "ctx.ns + ':shared:' + chatSurface()", 'AssertionError'],
  ['surface isolation', "ctx.ns + ':' + uid + ':' + chatSurface()", "ctx.ns + ':' + uid + ':shared'", 'AssertionError'],
  ['known AI deny', "if (!_aiOk) s = 'home';", "if (!_aiOk) s = 'chat';", 'AssertionError'],
  ['legacy history fallback', '    if (window.__ME_SAAS_CTX) return;\n    if (chatSyncBlocked()) return;', '    if (chatSyncBlocked()) return;', 'SaaS history sync is not fail-closed'],
  ['legacy server delete', 'p5_b23_server_history_delete_retired', 'action=chat_delete', 'B23 server-delete retirement'],
  ['voice owner routing', "var result = await saasAiFetch('/ai/transcribe',", "var result = await fetch('/legacy-chat',", 'AssertionError'],
]) {
  test(`counterfactual restores forbidden ${name} and fails`, () => {
    const result = check(mutate(find, replace));
    assert.equal(result.status, 1, result.stderr);
    assert(result.stderr.includes(failure), result.stderr);
  });
}
