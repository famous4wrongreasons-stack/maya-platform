import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { freezeCurrentCandidate } from './current-candidate.mjs';
const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const script =
  'scripts/conversation-qualification/current-candidate-dry-broker.mjs';
const digest = (v) => createHash('sha256').update(v).digest('hex');
const baseEnv = {
  PATH: process.env.PATH,
  NODE_OPTIONS: '--max-old-space-size=256',
  TZ: 'UTC',
};
function fixture() {
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-dry-broker-test-'),
  );
  const manifest = {
    ...freezeCurrentCandidate(process.cwd(), candidate),
    bindingSources: {},
    selectedCaseIds: ['current-admin-ordinary'],
  };
  const binding = digest(JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(output, 'candidate-manifest.json'),
    JSON.stringify({ ...manifest, bindingManifestSha256: binding }),
  );
  const body = JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'synthetic mechanics only' }],
    max_tokens: 20,
    stream: false,
    thinking: { type: 'disabled' },
  });
  return { output, binding, body };
}
async function start(output, env = baseEnv, extra = []) {
  const child = spawn(
    process.execPath,
    [
      script,
      '--output',
      output,
      '--candidate',
      candidate,
      '--no-upstream',
      ...extra,
    ],
    { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.closed = new Promise((resolve) => child.once('close', resolve));
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('start timeout'));
    }, 5000);
    child.once('message', (m) => {
      clearTimeout(timer);
      resolve(m);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('refused ' + code + ': ' + stderr));
    });
  });
  return { child, url: `http://127.0.0.1:${ready.port}` };
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
  child.kill('SIGTERM');
  try {
    await child.closed;
  } finally {
    clearTimeout(kill);
  }
}
const headers = (f) => ({
  'x-candidate-manifest': f.binding,
  'x-candidate-case': 'current-admin-ordinary',
  'x-candidate-turn': '1',
});
const readReport = (f) =>
  JSON.parse(fs.readFileSync(path.join(f.output, 'broker-report.json')));
async function expired(child, f) {
  const timer = setTimeout(() => child.kill('SIGKILL'), 3500);
  try {
    await child.closed;
  } finally {
    clearTimeout(timer);
  }
  const report = readReport(f);
  assert.equal(report.stopped, true);
  assert.equal(report.stopReason, 'ttl');
  assert.ok(Date.parse(report.stoppedAt) - Date.parse(report.expiresAt) < 1000);
  assert.equal(report.upstreamCalls, 0);
  return report;
}
test('separate keyless broker boots, binds exact source/corpus, reserves before canned response and stops', async () => {
  const f = fixture(),
    { child, url } = await start(f.output);
  try {
    assert.deepEqual(await (await fetch(url + '/status')).json(), {
      mode: 'NO_UPSTREAM_ONLY',
      paidAuthorized: false,
      upstreamCalls: 0,
      blocked: false,
    });
    const response = await fetch(url + '/chat/completions', {
      method: 'POST',
      body: f.body,
      headers: {
        'x-candidate-manifest': f.binding,
        'x-candidate-case': 'current-admin-ordinary',
        'x-candidate-turn': '1',
      },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).model, 'deepseek-v4-pro');
  } finally {
    await stop(child);
  }
  const report = JSON.parse(
    fs.readFileSync(path.join(f.output, 'broker-report.json')),
  );
  assert.equal(report.stopped, true);
  assert.equal(report.upstreamCalls, 0);
  assert.equal(report.credentialsLoaded, false);
  assert.equal(report.requests.length, 1);
  assert.equal(report.stats.attempts, 1);
  const ledger = fs
    .readFileSync(path.join(f.output, 'broker-ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(ledger.filter((r) => r.event === 'reserved').length, 1);
  await assert.rejects(start(f.output), /refused/);
});
for (const kind of [
  'wrong-binding',
  'oversize',
  'authorization',
  'wrong-model',
  'foreign-case',
])
  test('rejects ' + kind + ' with zero dispatch', async () => {
    const f = fixture(),
      { child, url } = await start(f.output);
    try {
      const headers = {
        'x-candidate-manifest': f.binding,
        'x-candidate-case': 'current-admin-ordinary',
        'x-candidate-turn': '1',
      };
      let body = f.body;
      if (kind === 'wrong-binding')
        headers['x-candidate-manifest'] = '0'.repeat(64);
      if (kind === 'oversize') body = 'x'.repeat(98305);
      if (kind === 'authorization')
        headers.authorization = 'synthetic-not-a-key';
      if (kind === 'wrong-model')
        body = body.replace('deepseek-v4-pro', 'different-model');
      if (kind === 'foreign-case')
        headers['x-candidate-case'] = 'unselected-case';
      assert.equal(
        (
          await fetch(url + '/chat/completions', {
            method: 'POST',
            body,
            headers,
          })
        ).status,
        503,
      );
    } finally {
      await stop(child);
    }
    const report = JSON.parse(
      fs.readFileSync(path.join(f.output, 'broker-report.json')),
    );
    assert.equal(report.requests.length, 0);
    assert.equal(report.upstreamCalls, 0);
    assert.equal(report.stats?.attempts ?? 0, 0);
  });
test('no paid switch or credential environment is admitted', async () => {
  await assert.rejects(start(fixture().output, baseEnv, ['--paid']), /refused/);
  await assert.rejects(
    start(fixture().output, {
      ...baseEnv,
      DEEPSEEK_API_KEY: 'synthetic-not-a-key',
    }),
    /refused/,
  );
});

for (const kind of ['partial-body', 'partial-headers'])
  test(
    'TTL destroys active ' + kind + ' and exits without dispatch',
    async () => {
      const f = fixture(),
        { child, url } = await start(f.output, baseEnv, [
          '--lifetime-ms',
          '1000',
        ]);
      const socket = net.createConnection({
        host: '127.0.0.1',
        port: Number(new URL(url).port),
      });
      const closed = new Promise((resolve) => socket.once('close', resolve));
      socket.on('error', () => {});
      try {
        await new Promise((resolve) => socket.once('connect', resolve));
        socket.write(
          kind === 'partial-headers'
            ? 'POST /chat/completions HTTP/1.1\r\nHost: localhost\r\n'
            : 'POST /chat/completions HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10000\r\n' +
                Object.entries(headers(f))
                  .map(([k, v]) => k + ': ' + v + '\r\n')
                  .join('') +
                '\r\n{',
        );
        const report = await expired(child, f);
        await closed;
        assert.ok(report.connectionsAtStop > 0);
        assert.equal(report.requests.length, 0);
        assert.equal(report.stats?.attempts ?? 0, 0);
      } finally {
        socket.destroy();
        await stop(child);
      }
    },
  );
test('TTL aborts a request in budget spacing before its reservation or response', async () => {
  const f = fixture(),
    { child, url } = await start(f.output, baseEnv, ['--lifetime-ms', '1500']);
  try {
    const init = { method: 'POST', body: f.body, headers: headers(f) };
    assert.equal((await fetch(url + '/chat/completions', init)).status, 200);
    const second = fetch(url + '/chat/completions', init).then(
      () => 'responded',
      () => 'closed',
    );
    const report = await expired(child, f);
    assert.equal(await second, 'closed');
    assert.ok(report.requestsAtStop > 0);
    assert.equal(report.requests.length, 1);
    assert.equal(report.stats.attempts, 1);
  } finally {
    await stop(child);
  }
});
test('dry lifetime cannot extend the one-hour ceiling', async () => {
  await assert.rejects(
    start(fixture().output, baseEnv, ['--lifetime-ms', '3600001']),
    /refused/,
  );
});
