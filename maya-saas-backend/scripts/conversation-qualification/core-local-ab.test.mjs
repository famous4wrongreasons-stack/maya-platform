// SCRIPTED/SYNTHETIC orchestration only. No real TTY, key, model, app or PG.
// Run only after committing the harness: production source-pin checks stay on.
// Test permits expire in 2000 and use synthetic-test-only as their approval ref.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const file = fileURLToPath(import.meta.url);
const backend = path.resolve(path.dirname(file), '../..');
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
const syntheticCredential = 'synthetic-test-only-not-a-provider-key';
const approvalRef = 'synthetic-test-only';
const scenarios = ['complete', 'unknown', 'deadline', 'bad-plan-pin'];

function findFrozenWorktrees(candidates, execFileSync) {
  const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: backend,
    encoding: 'utf8',
    timeout: 10000,
  });
  const records = listing
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split('\n');
      return {
        directory: lines.find((line) => line.startsWith('worktree '))?.slice(9),
        head: lines.find((line) => line.startsWith('HEAD '))?.slice(5),
      };
    });
  return Object.fromEntries(
    Object.entries(candidates).map(([stage, head]) => {
      const record = records.find((row) => row.head === head);
      assert.ok(record?.directory, `missing_exact_frozen_${stage}_worktree`);
      return [stage, path.join(record.directory, 'maya-saas-backend')];
    }),
  );
}

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory()
      ? filesBelow(full)
      : entry.isFile()
        ? [full]
        : [];
  });
}

async function syntheticWorker(scenario, root) {
  assert.ok(scenarios.includes(scenario));
  assert.equal(
    process.platform,
    'darwin',
    'the local profile remains Mac-only',
  );
  assert.equal(fs.realpathSync(root), root);
  assert.match(path.basename(root), /^maya-ab-unit-/);
  const RealDate = Date;
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalSpawn = childProcess.spawn;
  const originalExec = childProcess.execFileSync;
  const originalKill = process.kill;
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
  const stderrDescriptor = Object.getOwnPropertyDescriptor(process, 'stderr');
  let clock = RealDate.parse('2000-01-02T00:00:00.000Z');
  class SyntheticDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  }
  globalThis.Date = SyntheticDate;
  let inputCount = 0,
    fakeFetches = 0;
  const spawnedStages = [],
    observedCredentials = [],
    failures = [],
    fakePids = new Set();
  const syntheticClusterRoots = [];
  const input = new EventEmitter();
  Object.assign(input, {
    isTTY: true,
    isRaw: false,
    destroyed: false,
    readableEnded: false,
    readableEncoding: null,
    setRawMode(value) {
      this.isRaw = value;
    },
    pause() {},
    resume() {
      inputCount++;
      queueMicrotask(() =>
        input.emit('data', Buffer.from(syntheticCredential + '\n')),
      );
    },
  });
  const output = new EventEmitter();
  Object.assign(output, {
    isTTY: true,
    destroyed: false,
    write(value) {
      assert.equal(
        value,
        'Provider key (hidden; Enter submits, Ctrl-C cancels):\n',
      );
      return true;
    },
  });
  Object.defineProperty(process, 'stdin', { configurable: true, value: input });
  Object.defineProperty(process, 'stderr', {
    configurable: true,
    value: output,
  });
  process.kill = (pid, signal) => {
    assert.equal(
      signal,
      0,
      'no actual process signalling is allowed in this fixture',
    );
    assert.ok(
      fakePids.has(Math.abs(pid)),
      'only an explicitly synthetic PID may be inspected',
    );
    throw Object.assign(new Error('synthetic_absent'), { code: 'ESRCH' });
  };
  childProcess.execFileSync = (command, args, options) => {
    assert.equal(command, 'git', 'no subprocess except read-only Git may run');
    assert.ok(
      ['rev-parse', 'status', 'ls-files', 'worktree'].includes(args[0]),
    );
    return originalExec(command, args, options);
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, 'Bearer ' + syntheticCredential);
    init.signal.throwIfAborted();
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.match(body.messages[0].content, /^SCRIPTED\/SYNTHETIC /);
    fakeFetches++;
    observedCredentials.push(init.headers.authorization);
    const usage =
      scenario === 'unknown'
        ? { prompt_tokens: 1, completion_tokens: 1, total_tokens: 999 }
        : {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
            prompt_cache_hit_tokens: 0,
            prompt_cache_miss_tokens: 1,
          };
    // Never delegate to originalFetch. This is not a provider response capture.
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content: 'SCRIPTED/SYNTHETIC only' },
            finish_reason: 'stop',
          },
        ],
        usage,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  let socketRequest, roots;
  childProcess.spawn = (command, argv, options) => {
    assert.equal(command, process.execPath);
    const runnerPath = argv[1];
    const stage = Object.keys(roots).find(
      (name) =>
        runnerPath ===
        path.join(
          roots[name],
          'scripts/conversation-qualification/core-conversation-runner.mjs',
        ),
    );
    assert.ok(stage, 'only a frozen runner invocation may be substituted');
    if (stage === 'B') {
      const previous = JSON.parse(
        fs.readFileSync(
          path.join(root, 'run', 'a', 'broker', 'broker-report.json'),
          'utf8',
        ),
      );
      assert.equal(
        previous.stopped,
        true,
        'A must drain before B runner exists',
      );
      assert.equal(previous.stopReason, 'explicit_finish');
      const previousLedger = fs
        .readFileSync(
          path.join(root, 'run', 'a', 'broker', 'broker-ledger.jsonl'),
          'utf8',
        )
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert.equal(previousLedger.at(-1).event, 'closed');
    }
    assert.equal(options.cwd, roots[stage]);
    assert.equal(options.stdio[0], 'ignore');
    assert.ok(!JSON.stringify(options.env).includes(syntheticCredential));
    assert.ok(!argv.includes(syntheticCredential));
    const value = (name) => argv[argv.indexOf(name) + 1];
    assert.equal(value('--mode'), 'admitted-local');
    assert.equal(value('--owner-approval-ref'), approvalRef);
    assert.equal(argv.includes('--profile'), stage === 'B');
    const manifest = JSON.parse(fs.readFileSync(value('--manifest'), 'utf8'));
    const manifestSha256 = value('--manifest-sha256');
    const runnerOutput = value('--output');
    assert.equal(
      runnerOutput,
      path.join(root, 'run', stage.toLowerCase(), 'runner'),
    );
    const child = new EventEmitter();
    child.pid = 2000000000 + spawnedStages.length;
    child.exitCode = null;
    child.signalCode = null;
    fakePids.add(child.pid);
    spawnedStages.push(stage);
    let closed = false,
      stopping = false;
    const close = (code) => {
      if (closed) return;
      closed = true;
      child.exitCode = code;
      child.emit('close', code, null);
    };
    child.kill = (signal) => {
      assert.ok(['SIGTERM', 'SIGKILL'].includes(signal));
      stopping = true;
      return true;
    };
    fs.mkdirSync(runnerOutput, { mode: 0o700 });
    const clusterRoot = fs.realpathSync(
      fs.mkdtempSync('/private/tmp/maya-core-conversation-'),
    );
    syntheticClusterRoots.push(clusterRoot);
    const cluster = path.join(clusterRoot, 'pg');
    fs.mkdirSync(cluster, { mode: 0o700 });
    const groups = Object.fromEntries(
      [
        'initdb',
        'pg-start',
        'createdb',
        'migrations',
        'conversation',
        'pg-stop',
      ].map((name, i) => {
        const groupPid = 2000000100 + spawnedStages.length * 10 + i;
        fakePids.add(groupPid);
        return [
          name,
          {
            pid: groupPid,
            pgid: groupPid,
            detached: true,
            closed: true,
            groupAbsent: true,
          },
        ];
      }),
    );
    const runnerReport = {
      contract: 'maya.core-conversation-runner/1',
      mode: 'ADMITTED_LOCAL_MODEL_HTTP',
      qualification: 'SCRIPTED_SYNTHETIC_RUNNER_NO_APP_OR_PG',
      status: 'running',
      candidateCommit: manifest.candidateCommit,
      manifestSha256,
      sourcesUnchanged: true,
      cluster,
      port: 33331,
      clusterStopped: true,
      postmasterPidAbsent: true,
      groups,
    };
    const saveRunner = () =>
      fs.writeFileSync(
        path.join(runnerOutput, 'runner-report.json'),
        canonical(runnerReport),
        { mode: 0o600 },
      );
    saveRunner();
    setImmediate(() => {
      void (async () => {
        let succeeded = false;
        try {
          for (const c of manifest.cases) {
            for (let turn = 1; turn <= c.userTurns.length; turn++) {
              if (stopping) throw new Error('synthetic_runner_stopped');
              // Only the component read clock changes. Real timers remain real.
              clock += scenario === 'deadline' ? 1800000 : 6000;
              const response = await socketRequest(
                manifest.admissionContext.target,
                '/chat/completions',
                {
                  method: 'POST',
                  redirect: 'error',
                  timeoutMs: 10000,
                  headers: {
                    'content-type': 'application/json',
                    'x-candidate-manifest': manifestSha256,
                    'x-candidate-case': c.id,
                    'x-candidate-turn': String(turn),
                  },
                  body: JSON.stringify({
                    model: 'deepseek-v4-pro',
                    messages: [
                      {
                        role: 'user',
                        content: `SCRIPTED/SYNTHETIC ${stage}/${c.id}/${turn}`,
                      },
                    ],
                    max_tokens: 2048,
                    stream: false,
                    thinking: { type: 'disabled' },
                  }),
                },
                { localStdin: true },
              );
              assert.equal(response.status, 200);
              await response.text();
            }
          }
          const finish = await socketRequest(
            manifest.admissionContext.target,
            '/finish',
            {
              method: 'POST',
              redirect: 'error',
              timeoutMs: 10000,
              headers: { 'x-candidate-manifest': manifestSha256 },
            },
            { localStdin: true },
          );
          assert.equal(finish.status, 200);
          await finish.text();
          succeeded = true;
        } catch (error) {
          failures.push(error.code ?? error.message);
        } finally {
          runnerReport.status = succeeded ? 'passed-ungraded' : 'failed';
          saveRunner();
          close(succeeded ? 0 : 1);
        }
      })().catch((error) => {
        failures.push(error.message);
        close(1);
      });
    });
    return child;
  };
  syncBuiltinESMExports();
  try {
    const { AB_CANDIDATES, prepareAb, runAb } =
      await import('./core-local-ab.mjs');
    ({ socketRequest } = await import('./core-conversation-socket.mjs'));
    roots = findFrozenWorktrees(AB_CANDIDATES, originalExec);
    const prepared = await prepareAb({
      output: path.join(root, 'run'),
      aDirectory: roots.A,
      bDirectory: roots.B,
      ownerApprovalRef: approvalRef,
      pricing: {
        model: 'deepseek-v4-pro',
        inputNanoUsdPerToken: 1320,
        outputNanoUsdPerToken: 3960,
        reference: 'synthetic-test-only',
        sha256: 'a'.repeat(64),
        verifiedAt: new Date(clock).toISOString(),
      },
    });
    if (scenario === 'bad-plan-pin') {
      await assert.rejects(
        runAb({
          ...prepared,
          planSha256: '0'.repeat(64),
          ownerApprovalRef: approvalRef,
        }),
        /core_ab_plan_pin/,
      );
      assert.equal(inputCount, 0);
      assert.equal(fakeFetches, 0);
      assert.deepEqual(spawnedStages, []);
      assert.ok(!fs.existsSync(path.join(root, 'run', 'ab-ledger.jsonl')));
    } else {
      const report = await runAb({
        planPath: prepared.planPath,
        planSha256: prepared.planSha256,
        ownerApprovalRef: approvalRef,
      });
      const rows = fs
        .readFileSync(path.join(root, 'run', 'ab-ledger.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
      const reserved = rows.filter((row) => row.event === 'reserved');
      assert.equal(inputCount, 1);
      assert.equal(report.credentialInputs, 1);
      assert.equal(report.launcherCredentialCleared, true);
      assert.equal(rows.at(-1).event, 'closed');
      assert.equal(reserved.length, fakeFetches);
      assert.ok(reserved.every((row, i) => row.attempt === i + 1));
      assert.ok(
        reserved.every(
          (row, i) => i === 0 || row.at - reserved[i - 1].at >= 6000,
        ),
      );
      assert.ok(
        reserved.reduce((sum, row) => sum + row.nanoUsd, 0) <= 6000000000,
      );
      assert.ok(
        observedCredentials.every(
          (value) => value === 'Bearer ' + syntheticCredential,
        ),
      );
      if (scenario === 'complete') {
        assert.equal(report.status, 'passed-ungraded');
        assert.deepEqual(spawnedStages, ['A', 'B']);
        assert.equal(fakeFetches, 18);
        assert.deepEqual(
          report.stages.map((stage) => stage.usage.length),
          [5, 13],
        );
        assert.deepEqual(
          rows
            .filter((row) => row.event === 'stage_completed')
            .map((row) => [row.stage, row.clean]),
          [
            ['A', true],
            ['B', true],
          ],
        );
        assert.deepEqual(failures, []);
      } else {
        assert.notEqual(report.status, 'passed-ungraded');
        assert.deepEqual(spawnedStages, ['A']);
        assert.equal(fakeFetches, scenario === 'unknown' ? 1 : 0);
        assert.ok(rows.some((row) => row.event === 'halted'));
        assert.ok(!fs.existsSync(path.join(root, 'run', 'b', 'permit.json')));
        assert.ok(
          !fs.existsSync(path.join(root, 'run', 'b', 'permit.json.claim')),
        );
      }
    }
    for (const stage of ['a', 'b']) {
      const permitPath = path.join(root, 'run', stage, 'permit.json');
      if (fs.existsSync(permitPath)) {
        const permit = JSON.parse(fs.readFileSync(permitPath, 'utf8'));
        assert.equal(permit.ownerApprovalRef, approvalRef);
        assert.ok(
          RealDate.parse(permit.expiresAt) < RealDate.parse('2001-01-01'),
        );
      }
      assert.ok(
        !fs.existsSync(path.join(root, 'run', stage, 'channel', 'b.sock')),
        'all real test-only Unix listeners must be closed',
      );
    }
    for (const artifact of filesBelow(root))
      assert.ok(
        !fs.readFileSync(artifact).includes(Buffer.from(syntheticCredential)),
        'synthetic credential must not reach any file',
      );
    assert.equal(input.isRaw, false);
    assert.equal(input.listenerCount('data'), 0);
    console.log('SYNTHETIC_AB_ASSERTIONS_PASSED:' + scenario);
  } finally {
    process.chdir(originalCwd);
    process.exitCode = 0; // Expected negative runAb outcomes do not fail the test worker.
    globalThis.Date = RealDate;
    globalThis.fetch = originalFetch;
    childProcess.spawn = originalSpawn;
    childProcess.execFileSync = originalExec;
    process.kill = originalKill;
    Object.defineProperty(process, 'stdin', stdinDescriptor);
    Object.defineProperty(process, 'stderr', stderrDescriptor);
    syncBuiltinESMExports();
    for (const directory of syntheticClusterRoots)
      fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--synthetic-worker') {
  await syntheticWorker(process.argv[3], process.argv[4]);
} else {
  for (const scenario of scenarios) {
    test(
      `SCRIPTED/SYNTHETIC real A+B launcher: ${scenario}`,
      { timeout: 180000 },
      async () => {
        const root = fs.realpathSync(
          fs.mkdtempSync(path.join(os.tmpdir(), 'maya-ab-unit-')),
        );
        try {
          const result = await new Promise((resolve, reject) => {
            childProcess.execFile(
              process.execPath,
              [
                '--max-old-space-size=512',
                file,
                '--synthetic-worker',
                scenario,
                root,
              ],
              {
                cwd: backend,
                timeout: 170000,
                maxBuffer: 1024 * 1024,
                env: {
                  PATH: process.env.PATH,
                  HOME: process.env.HOME,
                  TMPDIR: '/tmp',
                  TZ: 'UTC',
                },
              },
              (error, stdout, stderr) =>
                error
                  ? reject(
                      new Error(
                        `synthetic worker ${scenario} failed: ${stdout}\n${stderr}`,
                        { cause: error },
                      ),
                    )
                  : resolve({ stdout, stderr }),
            );
          });
          assert.ok(
            result.stdout.includes(
              'SYNTHETIC_AB_ASSERTIONS_PASSED:' + scenario,
            ),
          );
          assert.ok(!result.stdout.includes(syntheticCredential));
          assert.ok(!result.stderr.includes(syntheticCredential));
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
    );
  }
}
