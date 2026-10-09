// Preparation only: read-only Git subprocesses; no permit, credential access,
// services, database or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  captureCoreManifest,
  coreBackend,
  coreHash,
} from './core-conversation-source.mjs';
import { readCoreManifest } from './core-conversation-admission.mjs';
import { assertCoreSocket } from './core-conversation-socket.mjs';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_UI_PROFILE,
  CORE_UNION_PROFILE,
  CORE_OFFLINE_PROFILE,
} from './current-candidate-budget.mjs';

export function prepareLocalCore(output, profileId = CORE_DIAGNOSTIC_PROFILE) {
  const profile = coreConversationProfile(profileId);
  assert.notEqual(
    profile.id,
    CORE_OFFLINE_PROFILE,
    'core_local_profile_offline_only',
  );
  assert.ok(
    process.platform === 'darwin' && process.getuid() > 0,
    'core_local_mac_owner_required',
  );
  assert.ok(
    typeof output === 'string' &&
      path.isAbsolute(output) &&
      path.normalize(output) === output &&
      !/[\u0000-\u001f\u007f]/.test(output),
    'core_local_output',
  );
  assert.equal(
    fs.realpathSync(path.dirname(output)),
    path.dirname(output),
    'core_local_canonical_parent',
  );
  assert.ok(!fs.existsSync(output), 'core_local_fresh_root');
  const socketPath = path.join(output, 'channel', 'b.sock');
  assert.ok(
    Buffer.byteLength(socketPath) <= 100,
    'core_local_socket_path_limit',
  );
  const uid = process.getuid(),
    gid = process.getgid();
  const context = {
    target: {
      host: 'localhost',
      workDirectory: coreBackend,
      brokerUid: uid,
      runnerUid: uid,
      brokerSocket: { path: socketPath, gid },
    },
    credentialSource: {
      kind: 'terminal-stdin',
      reference: 'owner-terminal-stdin-once',
      owner: uid,
      reader: uid,
    },
  };
  const manifest = captureCoreManifest(
    'ADMITTED_LOCAL_MODEL_HTTP',
    context,
    profile.id,
  );
  // Exclusive root creation; failures leave this nonsecret, non-reusable root intact.
  fs.mkdirSync(output, { mode: 0o700 });
  fs.mkdirSync(path.join(output, 'channel'), { mode: 0o700 });
  // macOS inherits /private/tmp's group; pin this new directory to the owner group.
  fs.chownSync(path.join(output, 'channel'), uid, gid);

  fs.mkdirSync(path.join(output, 'broker'), { mode: 0o700 });
  assertCoreSocket(context.target, { beforeListen: true, localStdin: true });
  const manifestPath = path.join(output, 'candidate-manifest.json');
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(manifestPath, bytes, { flag: 'wx', mode: 0o600 });
  const manifestSha256 = coreHash(bytes);
  readCoreManifest(manifestPath, manifestSha256, { localStdin: true });
  const common = [
    '--mode',
    'admitted-local',
    '--manifest',
    manifestPath,
    '--manifest-sha256',
    manifestSha256,
    '--permit',
    path.join(output, 'permit.json'),
    '--permit-sha256',
    'REQUIRES_FRESH_APPROVED_PERMIT_SHA256',
    '--owner-approval-ref',
    'REQUIRES_EXACT_OWNER_APPROVAL',
  ];
  const plan = {
    status: 'PREPARED_NOT_AUTHORIZED',
    qualification: 'NO_CREDENTIAL_OR_MODEL_CALL',
    mode: manifest.mode,
    profile: profile.id,
    limitsSha256: profile.limitsSha256,
    dialogs: profile.dialogs,
    userTurns: profile.userTurns,
    candidateCommit: manifest.candidateCommit,
    manifestPath,
    manifestSha256,
    runId: manifest.runId,
    workDirectory: coreBackend,
    executable: process.execPath,
    paidAuthorized: false,
    credentialAdmission: false,
    trustBoundary: 'OWNER_MANAGED_SAME_UID_NOT_PROCESS_ISOLATION',
    terminalInput: {
      recipient: 'local broker only',
      timeoutMs: 30000,
      storage: 'memory only',
      inputsPerRun: 1,
    },
    ...(profile.id === CORE_UNION_PROFILE
      ? {
          batch: {
            runner: 'existing core conversation runner',
            brokerInstances: 1,
            logicalBudgetCaps: 1,
            ledgerFiles: ['broker-ledger.jsonl', 'runner-budget-ledger.jsonl'],
            accounting:
              'broker enforces provider cap; runner mirrors the same profile',
            semanticFailure:
              'record actual reply; skip dependent turns; continue next independent dialogue',
            hardStop:
              'transport or usage unknown, unsafe effect, budget, expiry or revocation',
            automaticResume: false,
            keychainAccess: false,
          },
        }
      : {}),
    limits: manifest.limits,
    commandsRequireSanitizedEnvironment: true,
    brokerArgv: [
      'scripts/conversation-qualification/core-conversation-broker.mjs',
      ...common,
      '--output',
      path.join(output, 'broker'),
    ],
    runnerArgv: [
      'scripts/conversation-qualification/core-conversation-runner.mjs',
      '--run',
      '--profile',
      profile.id,
      ...common,
      '--output',
      path.join(output, 'runner'),
      '--node-heap-mb',
      '3072',
      '--broker-heap-mb',
      '256',
    ],
  };
  if (profile.id === CORE_UI_PROFILE)
    plan.uiAcceptance = {
      carrier: 'current React',
      transport: 'canonical login/chat via owned same-origin relay',
      qualification: 'PREPARED_NOT_AUTHORIZED',
      approvalHandoff: path.join(output, 'approved-run.json'),
      launchCommand: path.join(output, 'launch.command'),
      approvalFields: [
        'candidateCommit',
        'manifestSha256',
        'ownerApprovalRef',
        'permitSha256',
      ],
      effects: 'SYNTHETIC_SOURCES_READ_AND_PROPOSAL_ONLY_NO_BUSINESS_DISPATCH',
    };
  fs.writeFileSync(
    path.join(output, 'local-plan.json'),
    JSON.stringify(plan, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  if (profile.id === CORE_UI_PROFILE) {
    const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
    const planPath = path.join(output, 'local-plan.json');
    const planPin = coreHash(fs.readFileSync(planPath));
    const argv = [
      process.execPath,
      '--max-old-space-size=256',
      'scripts/conversation-qualification/core-ui-local.mjs',
      '--run',
      '--plan',
      planPath,
      '--plan-sha256',
      planPin,
    ];
    fs.writeFileSync(
      path.join(output, 'launch.command'),
      '#!/bin/sh\nset -eu\ncd ' +
        quote(coreBackend) +
        '\nexec env -i PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/stanislavmosin TMPDIR=/tmp TZ=UTC ' +
        argv.map(quote).join(' ') +
        '\n',
      { flag: 'wx', mode: 0o700 },
    );
  }
  return plan;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      prepare: { type: 'boolean' },
      output: { type: 'string' },
      profile: { type: 'string' },
    },
    strict: true,
  });
  assert.equal(values.prepare, true, 'core_local_preparation_only');
  console.log(
    JSON.stringify(prepareLocalCore(values.output, values.profile), null, 2),
  );
}
