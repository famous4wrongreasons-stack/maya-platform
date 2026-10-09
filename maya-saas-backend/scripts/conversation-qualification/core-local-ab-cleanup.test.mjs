// Synthetic filesystem fixtures and injected operations only: never signal a
// process, execute ps/pg_ctl, create a service or read an actual runner report.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupAbRunner,
  cleanupAbRunnerUsing,
} from './core-local-ab-cleanup.mjs';

function fixture(t) {
  const root = fs.mkdtempSync('/private/tmp/maya-ab-cleanup-');
  const privateRoot = fs.mkdtempSync('/private/tmp/maya-core-conversation-');
  const runner = path.join(root, 'runner'),
    cluster = path.join(privateRoot, 'pg');
  for (const dir of [runner, cluster]) fs.mkdirSync(dir, { mode: 0o700 });
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  });
  const input = {
    runnerReportPath: path.join(runner, 'runner-report.json'),
    manifestSha256: 'a'.repeat(64),
    knownRunnerPid: 314159,
  };
  const report = {
    contract: 'maya.core-conversation-runner/1',
    mode: 'ADMITTED_LOCAL_MODEL_HTTP',
    manifestSha256: input.manifestSha256,
    status: 'passed-ungraded',
    cluster,
    port: 54321,
    groups: {
      conversation: {
        detached: true,
        pid: 314160,
        pgid: 314160,
        closed: true,
        groupAbsent: true,
      },
    },
  };
  const save = () =>
    fs.writeFileSync(
      input.runnerReportPath,
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    );
  save();
  const calls = [];
  const operations = {
    pidAlive: () => false,
    groupAlive: () => false,
    signalGroup: (...args) => {
      calls.push(['signal', ...args]);
    },
    wait: async (ms) => {
      calls.push(['wait', ms]);
    },
    stopPg: async (args) => {
      calls.push(['stopPg', args]);
      return false;
    },
  };
  const pidfile = (pid = 314161, directory = cluster) =>
    fs.writeFileSync(
      path.join(cluster, 'postmaster.pid'),
      `${pid}\n${directory}\n1000\n54321\n\n127.0.0.1\n12345\nready\n`,
      { mode: 0o600 },
    );
  return { root, cluster, input, report, save, calls, operations, pidfile };
}

test('terminal report, absent recorded groups and no pidfile confirm without any spawn or signal', async (t) => {
  const f = fixture(t);
  const result = await cleanupAbRunnerUsing(f.input, f.operations);
  assert.deepEqual(result, {
    confirmed: true,
    groupChecks: [
      {
        name: 'conversation',
        pgid: 314160,
        absent: true,
        termSent: false,
        killSent: false,
      },
    ],
    pgStopped: true,
    postmasterPidAbsent: true,
  });
  assert.deepEqual(f.calls, []);
});

test('only recorded live groups receive TERM then bounded KILL; exact owned PG stops independently', async (t) => {
  const f = fixture(t);
  f.report.status = 'failed-cluster-stop';
  f.report.groups.conversation.groupAbsent = false;
  f.report.groups['pg-stop'] = {
    detached: true,
    pid: 314162,
    pgid: 314162,
    closed: false,
    groupAbsent: false,
  };
  f.save();
  f.pidfile();
  const living = new Set([314160, 314162]);
  let pgLive = true;
  f.operations.groupAlive = (id) => living.has(id);
  f.operations.pidAlive = (id) => id === 314161 && pgLive;
  f.operations.signalGroup = (id, signal) => {
    f.calls.push(['signal', id, signal]);
    if (id === 314160 || signal === 'SIGKILL') living.delete(id);
  };
  f.operations.stopPg = async (args) => {
    f.calls.push(['stopPg', args]);
    fs.unlinkSync(path.join(f.cluster, 'postmaster.pid'));
    pgLive = false;
    return true;
  };
  const result = await cleanupAbRunnerUsing(f.input, f.operations);
  assert.equal(result.confirmed, true);
  assert.deepEqual(
    f.calls.filter((x) => x[0] === 'signal'),
    [
      ['signal', 314160, 'SIGTERM'],
      ['signal', 314162, 'SIGTERM'],
      ['signal', 314162, 'SIGKILL'],
    ],
  );
  assert.deepEqual(
    f.calls
      .filter((x) => x[0] === 'wait')
      .map((x) => x[1])
      .sort(),
    [1000, 3000, 3000],
  );
  assert.deepEqual(
    f.calls.find((x) => x[0] === 'stopPg'),
    ['stopPg', { cluster: f.cluster, pid: 314161 }],
  );
});

test('missing, oversized, linked, wrong manifest or unsafe directories refuse before process operations', async (t) => {
  for (const change of [
    (f) => fs.unlinkSync(f.input.runnerReportPath),
    (f) => fs.writeFileSync(f.input.runnerReportPath, 'x'.repeat(65537)),
    (f) => {
      f.report.manifestSha256 = 'b'.repeat(64);
      f.save();
    },
    (f) => {
      f.report.cluster = '/private/tmp/production/pg';
      f.save();
    },
    (f) => fs.chmodSync(f.cluster, 0o755),
    (f) => fs.chmodSync(path.dirname(f.input.runnerReportPath), 0o755),
    (f) => {
      const original = f.input.runnerReportPath + '.original';
      fs.renameSync(f.input.runnerReportPath, original);
      fs.symlinkSync(original, f.input.runnerReportPath);
    },
    (f) =>
      fs.linkSync(
        f.input.runnerReportPath,
        f.input.runnerReportPath + '.linked',
      ),
  ]) {
    const f = fixture(t);
    change(f);
    let probes = 0;
    f.operations.pidAlive = () => {
      probes++;
      return false;
    };
    assert.equal(
      (await cleanupAbRunnerUsing(f.input, f.operations)).confirmed,
      false,
    );
    assert.equal(probes, 0);
    assert.deepEqual(f.calls, []);
  }
  assert.equal(
    (
      await cleanupAbRunner({
        runnerReportPath: '/private/tmp/missing/runner/runner-report.json',
        manifestSha256: 'a'.repeat(64),
        knownRunnerPid: 314159,
      })
    ).confirmed,
    false,
  );
});

test('unknown, repeated, non-detached and runner PGIDs never authorize signals', async (t) => {
  for (const change of [
    (f) => {
      f.report.groups.conversation.pgid = 1;
    },
    (f) => {
      f.report.groups.conversation.pid = 314159;
      f.report.groups.conversation.pgid = 314159;
    },
    (f) => {
      f.report.groups.conversation.detached = false;
    },
    (f) => {
      f.report.groups.unrecorded = f.report.groups.conversation;
    },
    (f) => {
      f.report.groups.migrations = f.report.groups.conversation;
    },
  ]) {
    const f = fixture(t);
    change(f);
    f.save();
    f.operations.groupAlive = () => true;
    assert.equal(
      (await cleanupAbRunnerUsing(f.input, f.operations)).confirmed,
      false,
    );
    assert.deepEqual(f.calls, []);
  }
});

test('a resurrected PGID, live runner or partial running report remains unconfirmed', async (t) => {
  const f = fixture(t);
  f.operations.groupAlive = () => true;
  assert.equal(
    (await cleanupAbRunnerUsing(f.input, f.operations)).confirmed,
    false,
  );
  assert.deepEqual(f.calls, []);
  const g = fixture(t);
  g.operations.pidAlive = () => true;
  assert.equal(
    (await cleanupAbRunnerUsing(g.input, g.operations)).confirmed,
    false,
  );
  assert.deepEqual(g.calls, []);
  const h = fixture(t);
  h.report.status = 'running';
  h.save();
  const partial = await cleanupAbRunnerUsing(h.input, h.operations);
  assert.equal(partial.pgStopped, true);
  assert.equal(partial.confirmed, false);
});

test('foreign, linked or changed pidfile cannot direct a pg_ctl stop', async (t) => {
  for (const change of [
    (f) => f.pidfile(314161, '/private/tmp/production/pg'),
    (f) => {
      f.pidfile();
      const file = path.join(f.cluster, 'postmaster.pid');
      fs.renameSync(file, file + '.original');
      fs.symlinkSync(file + '.original', file);
    },
    (f) => f.pidfile(f.input.knownRunnerPid),
  ]) {
    const f = fixture(t);
    change(f);
    assert.equal(
      (await cleanupAbRunnerUsing(f.input, f.operations)).confirmed,
      false,
    );
    assert.deepEqual(f.calls, []);
  }
  const f = fixture(t);
  f.pidfile();
  f.report.groups.conversation.groupAbsent = false;
  f.save();
  let groupLive = true;
  f.operations.groupAlive = () => groupLive;
  f.operations.wait = async () => {
    groupLive = false;
    f.pidfile(314163);
  };
  assert.equal(
    (await cleanupAbRunnerUsing(f.input, f.operations)).confirmed,
    false,
  );
  assert.equal(
    f.calls.some((x) => x[0] === 'stopPg'),
    false,
  );
});

test('PG stop failure or surviving postmaster cannot become cleanup confirmation', async (t) => {
  for (const remove of [false, true]) {
    const f = fixture(t);
    f.pidfile();
    f.operations.pidAlive = (id) => id === 314161;
    f.operations.stopPg = async () => {
      if (remove) fs.unlinkSync(path.join(f.cluster, 'postmaster.pid'));
      return remove;
    };
    const result = await cleanupAbRunnerUsing(f.input, f.operations);
    assert.equal(result.confirmed, false);
    assert.equal(result.pgStopped, false);
  }
});

test('one failed group check does not block checking others, but unknown liveness never permits KILL', async (t) => {
  const f = fixture(t);
  f.report.groups.conversation.groupAbsent = false;
  f.report.groups.migrations = {
    detached: true,
    pid: 314162,
    pgid: 314162,
    closed: true,
    groupAbsent: true,
  };
  f.save();
  let probes = 0;
  f.operations.groupAlive = (id) =>
    id === 314162 ? false : ++probes === 1 ? true : undefined;
  const result = await cleanupAbRunnerUsing(f.input, f.operations);
  assert.equal(result.confirmed, false);
  assert.deepEqual(
    f.calls.filter((x) => x[0] === 'signal'),
    [['signal', 314160, 'SIGTERM']],
  );
  assert.equal(result.pgStopped, true);
  assert.equal(
    result.groupChecks.find((group) => group.name === 'migrations').absent,
    true,
  );
});
