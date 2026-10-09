// Read-only evidence of one credential-input refusal, never a permit/rearm path.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const files = Object.freeze({
  'ab-plan.json': 16384,
  'ab-report.json': 32768,
  'ab-ledger.jsonl': 16384,
  'a/broker/broker-report.json': 32768,
  'a/permit.json': 16384,
  'a/permit.json.claim': 4096,
  'input-refusal-cleanup.json': 4096,
  'b/candidate-manifest.json': 2 * 1024 * 1024,
});
const commits = {
  A: '0d90de11710e7212286a7e74755c8a12b55d116b',
  B: '82ea84c46c4a535aaba8aa4c549f7a0eb074dcfa',
};
const requireThat = (value) => {
  if (!value) throw new Error('core_ab_previous_input_refused');
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const instant = (value) => {
  requireThat(typeof value === 'string');
  const at = Date.parse(value);
  requireThat(Number.isSafeInteger(at) && at > 0);
  return at;
};
function directory(root) {
  requireThat(
    typeof root === 'string' &&
      root.startsWith('/private/tmp/') &&
      path.normalize(root) === root &&
      fs.realpathSync(root) === root,
  );
  let current = '/private/tmp';
  for (const name of root.slice('/private/tmp/'.length).split('/')) {
    requireThat(/^[a-zA-Z0-9_.-]+$/.test(name));
    current = path.join(current, name);
    const stat = fs.lstatSync(current);
    requireThat(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid() &&
        (stat.mode & 0o7777) === 0o700,
    );
  }
}
const identity = (stat) =>
  ['dev', 'ino', 'size', 'uid', 'gid', 'mode', 'nlink', 'mtimeMs', 'ctimeMs']
    .map((k) => stat[k])
    .join(':');
function read(file, maximum) {
  directory(path.dirname(file));
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(fd);
    requireThat(
      before.isFile() &&
        before.nlink === 1 &&
        before.uid === process.getuid() &&
        (before.mode & 0o022) === 0 &&
        before.size > 0 &&
        before.size <= maximum,
    );
    const bytes = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    const after = fs.lstatSync(file);
    requireThat(
      count === before.size &&
        !after.isSymbolicLink() &&
        identity(before) === identity(after) &&
        identity(before) === identity(fs.fstatSync(fd)),
    );
    return bytes.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
function absent(file) {
  try {
    fs.lstatSync(file);
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}
function zero(stats) {
  requireThat(
    stats &&
      ['attempts', 'inputTokens', 'outputTokens', 'reservedNanoUsd'].every(
        (key) => stats[key] === 0,
      ),
  );
}
function capture(root, ownerApprovalRef) {
  directory(root);
  requireThat(
    typeof ownerApprovalRef === 'string' &&
      /^[a-zA-Z0-9_./:@-]{1,256}$/.test(ownerApprovalRef),
  );
  const sha256ByFile = {},
    data = {};
  for (const [name, maximum] of Object.entries(files)) {
    const bytes = read(path.join(root, name), maximum);
    sha256ByFile[name] = sha(bytes);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (name.endsWith('.jsonl')) {
      requireThat(text.endsWith('\n'));
      data[name] = text
        .slice(0, -1)
        .split('\n')
        .map((line) => {
          const row = JSON.parse(line);
          requireThat(JSON.stringify(row) === line);
          return row;
        });
    } else {
      data[name] = JSON.parse(text);
      requireThat(JSON.stringify(data[name], null, 2) + '\n' === text);
    }
  }
  const plan = data['ab-plan.json'],
    report = data['ab-report.json'],
    ledger = data['ab-ledger.jsonl'];
  const broker = data['a/broker/broker-report.json'],
    permit = data['a/permit.json'],
    claim = data['a/permit.json.claim'];
  const cleanup = data['input-refusal-cleanup.json'],
    b = data['b/candidate-manifest.json'];
  requireThat(
    plan.contract === 'maya.local-ab-plan/1' &&
      plan.output === root &&
      plan.ownerApprovalRef === ownerApprovalRef &&
      plan.status === 'PREPARED_NO_PERMIT_NO_CREDENTIAL' &&
      equal(plan.limits, {
        spendNanoUsd: 6000000000,
        attempts: 36,
        durationMs: 1800000,
      }) &&
      Array.isArray(plan.stages) &&
      plan.stages.length === 2,
  );
  for (const [index, stage] of ['A', 'B'].entries())
    requireThat(
      plan.stages[index].stage === stage &&
        plan.stages[index].manifestPath ===
          path.join(root, stage.toLowerCase(), 'candidate-manifest.json') &&
        hex(plan.stages[index].manifestSha256),
    );
  requireThat(
    report.contract === 'maya.local-ab-run/1' &&
      report.planSha256 === sha256ByFile['ab-plan.json'] &&
      report.status === 'failed-no-continuation' &&
      report.failureCode === 'core_local_credential_input_refused' &&
      report.launcherCredentialCleared === true &&
      report.credentialInputs === 1 &&
      !report.ledgerIoUnconfirmed &&
      Array.isArray(report.stages) &&
      report.stages.length === 1,
  );
  const start = instant(report.startedAt),
    finish = instant(report.finishedAt),
    previousExpiresAt = instant(report.expiresAt);
  const inputElapsedMs = finish - start;
  requireThat(
    inputElapsedMs > 0 &&
      inputElapsedMs < 600000 &&
      previousExpiresAt === start + 1800000,
  );
  const a = report.stages[0],
    stats = report.stats;
  requireThat(
    a.stage === 'A' &&
      a.candidateCommit === commits.A &&
      a.manifestSha256 === plan.stages[0].manifestSha256 &&
      a.permitSha256 === sha256ByFile['a/permit.json'] &&
      a.runnerPid === null &&
      a.status === 'starting' &&
      equal(a.usage, []),
  );
  requireThat(
    stats?.closed === true &&
      stats.halted === true &&
      stats.haltReason === 'explicit_halt' &&
      stats.activeStage === 'A' &&
      stats.lastReservedAt === null &&
      stats.startedAt === start &&
      stats.expiresAt === previousExpiresAt,
  );
  zero(stats);
  zero(stats.stages?.A);
  zero(stats.stages?.B);
  requireThat(
    stats.stages.A.startedAt === instant(a.startsAt) &&
      stats.stages.A.expiresAt === instant(a.expiresAt) &&
      stats.stages.A.startedAt >= start &&
      stats.stages.A.startedAt <= finish &&
      stats.stages.A.expiresAt ===
        Math.min(previousExpiresAt, stats.stages.A.startedAt + 600000) &&
      stats.stages.A.completed === false &&
      stats.stages.A.clean === null &&
      stats.stages.B.startedAt === null &&
      stats.stages.B.expiresAt === null &&
      stats.stages.B.completed === false &&
      stats.stages.B.clean === null,
  );
  requireThat(
    equal(
      ledger.map((row) => row.event),
      ['opened', 'stage_started', 'halted', 'closed'],
    ),
  );
  requireThat(
    ledger[0].contract === 'maya.local-ab-budget/1' &&
      ledger[0].startedAt === start &&
      ledger[0].expiresAt === previousExpiresAt &&
      ledger[0].limits?.attempts === 36 &&
      ledger[0].limits.spendNanoUsd === 6000000000 &&
      ledger[0].limits.durationMs === 1800000 &&
      ledger[1].stage === 'A' &&
      ledger[1].at === stats.stages.A.startedAt &&
      ledger[1].expiresAt === stats.stages.A.expiresAt &&
      ledger[2].reason === 'explicit_halt' &&
      ledger[2].at === stats.stages.A.startedAt,
  );
  const { event, ...closed } = ledger[3];
  requireThat(event === 'closed' && equal(closed, stats));
  requireThat(
    permit.contract === 'maya.core-conversation-permit/1' &&
      permit.ownerApprovalRef === ownerApprovalRef &&
      permit.revoked === false &&
      permit.candidateCommit === commits.A &&
      permit.manifestSha256 === a.manifestSha256 &&
      permit.profile === 'core-diagnostic-20261008/1' &&
      hex(permit.limitsSha256) &&
      permit.startsAt === a.startsAt &&
      permit.expiresAt === a.expiresAt &&
      permit.claimPath === path.join(root, 'a/permit.json.claim') &&
      permit.target?.workDirectory === plan.stages[0].workDirectory &&
      permit.target?.brokerSocket?.path ===
        path.join(root, 'a/channel/b.sock') &&
      permit.credentialSource?.kind === 'terminal-stdin' &&
      permit.credentialSource.reference === 'owner-terminal-stdin-once',
  );
  requireThat(
    claim.contract === 'maya.core-conversation-claim/1' &&
      claim.runId === permit.runId &&
      claim.permitSha256 === sha256ByFile['a/permit.json'] &&
      claim.manifestSha256 === a.manifestSha256 &&
      Number.isSafeInteger(claim.brokerPid) &&
      claim.brokerPid > 1 &&
      instant(claim.claimedAt) >= instant(a.startsAt) &&
      instant(claim.claimedAt) <= finish,
  );
  requireThat(
    broker.contract === 'maya.core-conversation-broker/1' &&
      broker.mode === 'ADMITTED_LOCAL_MODEL_HTTP' &&
      broker.candidateCommit === commits.A &&
      broker.runId === permit.runId &&
      broker.manifestSha256 === a.manifestSha256 &&
      broker.profile === permit.profile &&
      broker.limitsSha256 === permit.limitsSha256 &&
      broker.stopped === true &&
      broker.inputAborted === true &&
      broker.stopReason === 'local_credential_input_refused' &&
      broker.credentialsLoaded === false &&
      broker.upstreamCalls === 0 &&
      broker.stats === null &&
      equal(broker.requests, []) &&
      equal(broker.rejections, []) &&
      broker.recordedReplay === false &&
      instant(broker.startedAt) >= instant(a.startsAt) &&
      instant(broker.stoppedAt) >= instant(broker.startedAt) &&
      instant(broker.stoppedAt) <= finish,
  );
  requireThat(
    b.contract === 'maya.core-conversation-run/1' &&
      b.candidateCommit === commits.B &&
      b.mode === 'ADMITTED_LOCAL_MODEL_HTTP' &&
      b.profile === 'core-followup-20261009/1' &&
      b.dialogs === 6 &&
      b.userTurns === 13 &&
      b.paidAuthorized === false &&
      b.upstreamAllowed === false &&
      b.credentialAdmission === false &&
      sha256ByFile['b/candidate-manifest.json'] ===
        plan.stages[1].manifestSha256 &&
      b.admissionContext?.target?.workDirectory ===
        plan.stages[1].workDirectory &&
      b.admissionContext?.target?.brokerSocket?.path ===
        path.join(root, 'b/channel/b.sock'),
  );
  requireThat(
    cleanup.brokerPid === claim.brokerPid &&
      cleanup.brokerPidAbsent === true &&
      cleanup.claimPreserved === true &&
      cleanup.rearmed === false &&
      instant(cleanup.checkedAt) >= finish &&
      [
        'aSocketAbsent',
        'aRunnerDirectoryAbsent',
        'bPermitAbsent',
        'bClaimAbsent',
        'bSocketAbsent',
        'bRunnerDirectoryAbsent',
      ].every((k) => cleanup[k] === true),
  );
  for (const dir of ['a', 'b', 'a/channel', 'b/channel'])
    directory(path.join(root, dir));
  for (const name of [
    'a/runner',
    'a/channel/b.sock',
    'b/permit.json',
    'b/permit.json.claim',
    'b/runner',
    'b/channel/b.sock',
  ])
    requireThat(absent(path.join(root, name)));
  return Object.freeze({
    root,
    sha256ByFile: Object.freeze(sha256ByFile),
    inputElapsedMs,
    previousExpiresAt,
  });
}

export function capturePreviousInputTimeout(root, ownerApprovalRef) {
  try {
    return capture(root, ownerApprovalRef);
  } catch {
    throw new Error('core_ab_previous_input_refused');
  }
}
export function assertPreviousInputTimeout(projection, ownerApprovalRef) {
  try {
    requireThat(
      projection &&
        equal(Object.keys(projection).sort(), [
          'inputElapsedMs',
          'previousExpiresAt',
          'root',
          'sha256ByFile',
        ]),
    );
    const observed = capture(projection.root, ownerApprovalRef);
    requireThat(
      observed.inputElapsedMs === projection.inputElapsedMs &&
        observed.previousExpiresAt === projection.previousExpiresAt &&
        equal(
          Object.keys(projection.sha256ByFile).sort(),
          Object.keys(files).sort(),
        ) &&
        Object.keys(files).every(
          (name) =>
            projection.sha256ByFile[name] === observed.sha256ByFile[name],
        ),
    );
    return observed.inputElapsedMs;
  } catch {
    throw new Error('core_ab_previous_input_refused');
  }
}
