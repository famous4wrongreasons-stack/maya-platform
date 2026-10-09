// Finite fallback for one stopped, source-bound local runner. No discovery by
// process name, stdout authority, arbitrary executable or cluster directory.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const pgCtl = '/opt/homebrew/opt/postgresql@16/bin/pg_ctl';
const names = [
  'initdb',
  'pg-start',
  'createdb',
  'migrations',
  'conversation',
  'pg-stop',
];
const terminal = [
  'passed-ungraded',
  'failed',
  'failed-broker-cleanup',
  'failed-cluster-stop',
  'failed-source-drift',
];
const pid = (value) =>
  Number.isSafeInteger(value) && value > 1 && value <= 2147483647;
const refused = () => {
  throw new Error('core_ab_cleanup_unconfirmed');
};
function privateDirectory(directory) {
  if (
    !directory.startsWith('/private/tmp/') ||
    path.normalize(directory) !== directory ||
    fs.realpathSync(directory) !== directory
  )
    refused();
  let at = '/private/tmp';
  for (const name of directory.slice('/private/tmp/'.length).split('/')) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) refused();
    at = path.join(at, name);
    const stat = fs.lstatSync(at);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o7777) !== 0o700
    )
      refused();
  }
}
const identity = (stat) =>
  ['dev', 'ino', 'size', 'mode', 'uid', 'gid', 'nlink', 'mtimeMs', 'ctimeMs']
    .map((k) => stat[k])
    .join(':');
function readBounded(file, maximum) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      (before.mode & 0o7777) !== 0o600 ||
      before.size < 1 ||
      before.size > maximum
    )
      refused();
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const n = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (!n) break;
      count += n;
    }
    const current = fs.lstatSync(file);
    if (
      count !== before.size ||
      current.isSymbolicLink() ||
      identity(before) !== identity(fs.fstatSync(fd)) ||
      identity(before) !== identity(current)
    )
      refused();
    return new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(0, count),
    );
  } finally {
    fs.closeSync(fd);
  }
}
function postmaster(cluster, port) {
  const file = path.join(cluster, 'postmaster.pid');
  try {
    fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const lines = readBounded(file, 4096).split('\n');
  if (
    lines.length < 8 ||
    lines.length > 10 ||
    !/^[1-9][0-9]*$/.test(lines[0]) ||
    !pid(Number(lines[0])) ||
    lines[1] !== cluster ||
    lines[3] !== String(port)
  )
    refused();
  return Number(lines[0]);
}
function readReport(input) {
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'knownRunnerPid,manifestSha256,runnerReportPath' ||
    !pid(input.knownRunnerPid) ||
    input.knownRunnerPid === process.pid ||
    !/^[a-f0-9]{64}$/.test(input.manifestSha256) ||
    typeof input.runnerReportPath !== 'string' ||
    path.basename(input.runnerReportPath) !== 'runner-report.json' ||
    path.basename(path.dirname(input.runnerReportPath)) !== 'runner'
  )
    refused();
  privateDirectory(path.dirname(input.runnerReportPath));
  const raw = readBounded(input.runnerReportPath, 65536);
  const report = JSON.parse(raw);
  if (
    JSON.stringify(report, null, 2) + '\n' !== raw ||
    report.contract !== 'maya.core-conversation-runner/1' ||
    report.mode !== 'ADMITTED_LOCAL_MODEL_HTTP' ||
    report.manifestSha256 !== input.manifestSha256 ||
    !['running', ...terminal].includes(report.status) ||
    typeof report.cluster !== 'string' ||
    !/^\/private\/tmp\/maya-core-conversation-[a-zA-Z0-9]+\/pg$/.test(
      report.cluster,
    ) ||
    !Number.isInteger(report.port) ||
    report.port <= 1024 ||
    report.port > 65535 ||
    report.port === 5432 ||
    !report.groups ||
    typeof report.groups !== 'object' ||
    Array.isArray(report.groups)
  )
    refused();
  privateDirectory(report.cluster);
  const groups = Object.entries(report.groups);
  if (!groups.length || groups.length > names.length) refused();
  const seen = new Set();
  for (const [name, group] of groups) {
    if (
      !names.includes(name) ||
      !group ||
      group.detached !== true ||
      !pid(group.pid) ||
      group.pid !== group.pgid ||
      [input.knownRunnerPid, process.pid].includes(group.pgid) ||
      seen.has(group.pgid) ||
      typeof group.closed !== 'boolean' ||
      typeof group.groupAbsent !== 'boolean'
    )
      refused();
    seen.add(group.pgid);
  }
  const pgPid = postmaster(report.cluster, report.port);
  if (pgPid !== null && [input.knownRunnerPid, process.pid].includes(pgPid))
    refused();
  return { report, groups, pgPid };
}

// Tests replace only finite process operations. File provenance/shape checks are
// identical; the public production entry below never accepts these callbacks.
export async function cleanupAbRunnerUsing(input, operations) {
  const result = {
    confirmed: false,
    groupChecks: [],
    pgStopped: false,
    postmasterPidAbsent: false,
  };
  let observed;
  try {
    observed = readReport(input);
    if (operations.pidAlive(input.knownRunnerPid) !== false) return result;
  } catch {
    return result;
  }
  const { report, groups, pgPid } = observed;
  result.groupChecks = await Promise.all(
    groups.map(async ([name, group]) => {
      const checked = {
        name,
        pgid: group.pgid,
        absent: false,
        termSent: false,
        killSent: false,
      };
      try {
        const alive = operations.groupAlive(group.pgid);
        if (alive === false) {
          checked.absent = true;
          return checked;
        }
        // An already-confirmed-absent group cannot come back; do not signal a
        // possibly reused PGID. An unknown probe never authorizes a signal.
        if (alive !== true || group.groupAbsent) return checked;
        operations.signalGroup(group.pgid, 'SIGTERM');
        checked.termSent = true;
        await operations.wait(3000);
        const remaining = operations.groupAlive(group.pgid);
        if (remaining === false) {
          checked.absent = true;
          return checked;
        }
        if (remaining !== true) return checked;
        operations.signalGroup(group.pgid, 'SIGKILL');
        checked.killSent = true;
        await operations.wait(1000);
        checked.absent = operations.groupAlive(group.pgid) === false;
      } catch {
        /* Keep this exact group's cleanup unconfirmed. */
      }
      return checked;
    }),
  );
  try {
    // Revalidate the complete owned directory and immutable pidfile projection
    // after awaited process cleanup, before the only possible pg_ctl dispatch.
    privateDirectory(report.cluster);
    if (postmaster(report.cluster, report.port) !== pgPid) return result;
    if (pgPid !== null) {
      if (operations.pidAlive(pgPid) !== true) return result;
      const stopped = await operations.stopPg({
        cluster: report.cluster,
        pid: pgPid,
      });
      if (stopped !== true) return result;
    }
    privateDirectory(report.cluster);
    result.postmasterPidAbsent =
      postmaster(report.cluster, report.port) === null;
    result.pgStopped =
      result.postmasterPidAbsent &&
      (pgPid === null || operations.pidAlive(pgPid) === false);
    for (const checked of result.groupChecks)
      checked.absent =
        checked.absent && operations.groupAlive(checked.pgid) === false;
    result.confirmed =
      terminal.includes(report.status) &&
      result.pgStopped &&
      result.groupChecks.every((g) => g.absent) &&
      operations.pidAlive(input.knownRunnerPid) === false;
  } catch {
    /* No stdout or raw filesystem/process error becomes proof. */
  }
  return result;
}

function alive(id) {
  try {
    process.kill(id, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
async function stopPg({ cluster, pid: postmasterPid }) {
  // A stale pidfile must not make pg_ctl signal a reused production PID.
  const executable = fs.realpathSync(pgCtl);
  if (
    !/^\/opt\/homebrew\/Cellar\/postgresql@16\/[a-zA-Z0-9_.-]+\/bin\/pg_ctl$/.test(
      executable,
    )
  )
    refused();
  const stat = fs.lstatSync(executable);
  if (
    !stat.isFile() ||
    ![0, process.getuid()].includes(stat.uid) ||
    (stat.mode & 0o022) !== 0
  )
    refused();
  const postgres = path.join(path.dirname(executable), 'postgres');
  const command = execFileSync(
    '/bin/ps',
    ['-p', String(postmasterPid), '-o', 'uid=', '-o', 'command='],
    {
      encoding: 'utf8',
      timeout: 1000,
      maxBuffer: 4096,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
    },
  ).trim();
  const match = command.match(/^([0-9]+)\s+(.+)$/);
  if (
    !match ||
    match[1] !== String(process.getuid()) ||
    ![postgres, '/opt/homebrew/opt/postgresql@16/bin/postgres'].some((binary) =>
      match[2].startsWith(binary + ' -D ' + cluster + ' '),
    )
  )
    refused();
  return await new Promise((resolve) => {
    let child,
      timer,
      finalTimer,
      settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(finalTimer);
      resolve(success);
    };
    try {
      child = spawn(
        executable,
        ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'],
        {
          cwd: path.dirname(cluster),
          stdio: 'ignore',
          env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
        },
      );
      child.once('error', () => finish(false));
      child.once('close', (code, signal) =>
        finish(code === 0 && signal === null),
      );
      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* Report unconfirmed at the bound. */
        }
        finalTimer = setTimeout(() => finish(false), 1000);
      }, 39000);
    } catch {
      finish(false);
    }
  });
}

export async function cleanupAbRunner(input) {
  if (process.platform !== 'darwin')
    return {
      confirmed: false,
      groupChecks: [],
      pgStopped: false,
      postmasterPidAbsent: false,
    };
  return cleanupAbRunnerUsing(input, {
    pidAlive: alive,
    groupAlive: (pgid) => alive(-pgid),
    signalGroup: (pgid, signal) => {
      try {
        process.kill(-pgid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    },
    wait,
    stopPg,
  });
}
