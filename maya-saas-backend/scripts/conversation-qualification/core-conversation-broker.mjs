// Separate explicit profile. Ordinary widgets and the old dry entry cannot load
// credentials. A live invocation requires a fresh pinned external permit first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  CandidateBudgetGate,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  candidateReservation,
} from './current-candidate-budget.mjs';
import {
  readCoreManifest,
  claimCorePermit,
} from './core-conversation-admission.mjs';
import { assertCoreSocket } from './core-conversation-socket.mjs';
import { readLocalTerminalCredential } from './core-local-terminal-credential.mjs';
import { serveCandidateBroker } from './candidate-broker-server.mjs';
import { assertCoreSources, coreHash } from './core-conversation-source.mjs';
const { values } = parseArgs({
  options: {
    mode: { type: 'string' },
    manifest: { type: 'string' },
    'manifest-sha256': { type: 'string' },
    output: { type: 'string' },
    permit: { type: 'string' },
    'permit-sha256': { type: 'string' },
    'owner-approval-ref': { type: 'string' },
  },
  strict: true,
});
assert.ok(
  ['dry', 'admitted', 'admitted-local'].includes(values.mode),
  'core_broker_explicit_mode',
);
assert.ok(
  values.output && path.isAbsolute(values.output),
  'core_broker_output',
);
assert.ok(
  !Object.keys(process.env).some((k) =>
    /API_KEY|TOKEN|SECRET|PASSWORD|PAID|PERMIT|DATABASE_URL/.test(k),
  ),
  'core_broker_ambient_credentials',
);
const localStdin = values.mode === 'admitted-local';
const pinned = readCoreManifest(values.manifest, values['manifest-sha256'], {
  localStdin,
});
const live = values.mode !== 'dry';
assert.equal(
  pinned.mode,
  localStdin
    ? 'ADMITTED_LOCAL_MODEL_HTTP'
    : live
      ? 'ADMITTED_MODEL_HTTP'
      : 'DRY_HTTP',
  'core_broker_manifest_mode',
);
assertCoreSources(pinned);
const reportPath = path.join(values.output, 'broker-report.json');
assert.ok(
  !fs.existsSync(reportPath) &&
    !fs.existsSync(path.join(values.output, 'broker-ledger.jsonl')),
  'core_broker_restart_refused',
);
let admission;
if (live) {
  assertCoreSocket(pinned.admissionContext.target, {
    beforeListen: true,
    localStdin,
  });
  assert.ok(
    values.permit && values['permit-sha256'] && values['owner-approval-ref'],
    'core_broker_explicit_permit',
  );
  admission = claimCorePermit({
    path: values.permit,
    sha256: values['permit-sha256'],
    manifest: pinned,
    claimPath: values.permit + '.claim',
    target: pinned.admissionContext.target,
    credentialSource: pinned.admissionContext.credentialSource,
    ownerApprovalRef: values['owner-approval-ref'],
    role: 'broker',
  });
} else
  assert.ok(
    !values.permit && !values['permit-sha256'] && !values['owner-approval-ref'],
    'core_broker_dry_permit_refused',
  );
const expiresAt = live
  ? admission.expiresAt
  : Date.now() + CORE_DIAGNOSTIC_LIMITS.durationMs;
const report = {
  contract: 'maya.core-conversation-broker/1',
  mode: pinned.mode,
  runId: pinned.runId,
  candidateCommit: pinned.candidateCommit,
  manifestSha256: pinned.manifestSha256,
  paidAuthorized: live,
  credentialsLoaded: false,
  upstreamCalls: 0,
  upstreamCountMeaning: 'attempts started; delivery may be unknown',
  startedAt: new Date().toISOString(),
  expiresAt: new Date(expiresAt).toISOString(),
  requests: [],
  rejections: [],
  stopped: false,
  qualification: live
    ? 'ACTUAL_MODEL_SYNTHETIC_DATA_UNGRADED'
    : 'CANNED_WIRING_ONLY_NOT_MODEL_QUALITY',
};
let gate, credentialIdentity, localCredential, broker;
let localStopQueued = false;
const save = () => {
  // Drop the reference on every terminal stop; JS strings are not securely erasable.
  if (report.stopped) localCredential = undefined;
  if (localStdin && report.rejections.length > 0 && !localStopQueued) {
    localStopQueued = true;
    localCredential = undefined;
    queueMicrotask(() => {
      void broker?.stop('local_request_refused');
    });
  }
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ ...report, stats: gate?.stats ?? null }, null, 2) + '\n',
    { mode: 0o600 },
  );
};
save();
function readCredential() {
  if (localStdin) {
    if (!localCredential) throw new Error('core_local_credential_unavailable');
    return localCredential;
  }
  const source = pinned.admissionContext.credentialSource;
  assert.equal(source.kind, 'file', 'core_broker_credential_kind');
  assert.ok(
    path.isAbsolute(source.reference) &&
      fs.realpathSync(source.reference) === source.reference,
    'core_broker_credential_path',
  );
  const fd = fs.openSync(
    source.reference,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(fd);
    assert.ok(
      stat.isFile() && stat.nlink === 1 && stat.size >= 16 && stat.size <= 1024,
      'core_broker_credential_shape',
    );
    assert.equal(stat.uid, source.owner, 'core_broker_credential_owner');
    assert.equal(
      source.reader,
      process.getuid(),
      'core_broker_credential_reader',
    );
    assert.equal(stat.mode & 0o022, 0, 'core_broker_credential_writable');
    const raw = Buffer.alloc(1025);
    const read = fs.readSync(fd, raw, 0, raw.length, 0);
    assert.equal(read, stat.size, 'core_broker_credential_changed');
    const after = fs.fstatSync(fd),
      current = fs.lstatSync(source.reference);
    for (const observed of [after, current]) {
      assert.ok(
        observed.isFile() && observed.nlink === 1,
        'core_broker_credential_changed',
      );
      for (const field of [
        'dev',
        'ino',
        'size',
        'uid',
        'mode',
        'mtimeMs',
        'ctimeMs',
      ])
        assert.equal(
          observed[field],
          stat[field],
          'core_broker_credential_changed',
        );
    }
    const key = raw.subarray(0, read).toString('utf8').trim();
    if (!/^[A-Za-z0-9_-]{16,512}$/.test(key)) {
      raw.fill(0);
      throw new Error('core_broker_scalar_credential_required');
    }
    const identity = JSON.stringify([
      stat.dev,
      stat.ino,
      stat.uid,
      stat.mode,
      coreHash(raw.subarray(0, read)),
    ]);
    raw.fill(0);
    if (credentialIdentity)
      assert.equal(
        identity,
        credentialIdentity,
        'core_broker_credential_changed',
      );
    else credentialIdentity = identity;
    report.credentialsLoaded = true;
    save();
    return key;
  } finally {
    fs.closeSync(fd);
  }
}
function canned() {
  return new Response(
    JSON.stringify({
      model: CORE_DIAGNOSTIC_LIMITS.model,
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              semantic_plan: {
                parent_request: 'Синтетическая проверка механики',
                language: 'ru',
                dialogue_act: 'request',
                tasks: [
                  {
                    id: 'task_1',
                    intent: 'small_talk.greeting',
                    entities_json: '{}',
                    depends_on: [],
                    confidence: 1,
                    requires_clarification: true,
                    clarification_question: 'Уточните синтетический запрос.',
                  },
                ],
                context: {
                  carried_slots: [],
                  replaced_slots: [],
                  unresolved_references: [],
                },
              },
              tool_call: null,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}
const binding = {
  candidateCommit: pinned.candidateCommit,
  manifestSha256: pinned.manifestSha256,
  profile: CORE_DIAGNOSTIC_PROFILE,
  limitsSha256: pinned.limitsSha256,
};
if (localStdin) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.on(signal, cancel);
  const revocation = setInterval(() => {
    try {
      admission(binding);
    } catch {
      controller.abort();
    }
  }, 100);
  try {
    admission(binding);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) throw new Error('core_local_permit_expired');
    localCredential = await readLocalTerminalCredential({
      signal: controller.signal,
      timeoutMs: Math.min(30000, remaining),
    });
    admission(binding);
    controller.signal.throwIfAborted();
    report.credentialsLoaded = true;
    save();
  } catch {
    report.inputAborted = true;
    report.stopped = true;
    report.stopReason = 'local_credential_input_refused';
    report.stoppedAt = new Date().toISOString();
    save();
    throw new Error('core_local_credential_input_refused');
  } finally {
    clearInterval(revocation);
    for (const signal of signals) process.off(signal, cancel);
  }
}
const transport = async (url, init) => {
  assert.ok(Date.now() < expiresAt, 'core_broker_expired');
  assertCoreSources(pinned);
  if (!live) return canned();
  admission(binding);
  assertCoreSocket(pinned.admissionContext.target, { localStdin });
  const key = readCredential();
  // Recheck after credential I/O, before the only external edge in this profile.
  admission(binding);
  init.signal.throwIfAborted();
  report.upstreamCalls++;
  save();
  return fetch(url, {
    method: 'POST',
    body: init.body,
    redirect: 'error',
    signal: init.signal,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + key,
    },
  });
};
broker = serveCandidateBroker({
  report,
  save,
  expiresAt,
  limits: CORE_DIAGNOSTIC_LIMITS,
  bind: () => {
    gate = new CandidateBudgetGate({
      ledgerPath: path.join(values.output, 'broker-ledger.jsonl'),
      manifestSha256: pinned.manifestSha256,
      candidateCommit: pinned.candidateCommit,
      profile: CORE_DIAGNOSTIC_PROFILE,
      mode: live ? 'ADMITTED_MODEL_ONLY' : 'OFFLINE_SYNTHETIC_ONLY',
      ...(live ? { assertAdmission: admission } : {}),
      transport,
    });
    return {
      gate,
      manifest: {
        ...pinned,
        bindingManifestSha256: pinned.manifestSha256,
        selectedCaseIds: pinned.cases.map((c) => c.id),
      },
    };
  },
  reserve: (url, init) =>
    candidateReservation(url, init, CORE_DIAGNOSTIC_PROFILE),
  allowFinish: true,
  ...(live
    ? {
        listenTarget: pinned.admissionContext.target.brokerSocket.path,
        onListen: () => {
          admission(binding);
          fs.chmodSync(
            pinned.admissionContext.target.brokerSocket.path,
            localStdin ? 0o600 : 0o660,
          );
          assertCoreSocket(pinned.admissionContext.target, { localStdin });
        },
      }
    : {}),
  statusExtra: () => {
    if (live) {
      admission(binding);
      assertCoreSocket(pinned.admissionContext.target, { localStdin });
    }
    return {
      manifestSha256: pinned.manifestSha256,
      runId: pinned.runId,
      candidateCommit: pinned.candidateCommit,
      limitsSha256: pinned.limitsSha256,
      expiresAt: report.expiresAt,
    };
  },
  onReady: ({ port, socketPath }) => {
    if (live) report.socketPath = socketPath;
    else report.port = port;
    save();
    if (!process.connected)
      console.log(
        JSON.stringify({
          mode: report.mode,
          ...(live ? { socketPath } : { port }),
          manifestSha256: pinned.manifestSha256,
          expiresAt: report.expiresAt,
        }),
      );
  },
  onResponse: ({ caseId, turn, status, text }) => {
    let safe = {
      caseId,
      turn,
      status,
      content: null,
      finishReason: null,
      usage: null,
    };
    if (status === 200) {
      const body = JSON.parse(text),
        choice = body.choices?.[0];
      safe = {
        ...safe,
        content:
          typeof choice?.message?.content === 'string'
            ? choice.message.content.slice(0, 16384)
            : null,
        finishReason:
          typeof choice?.finish_reason === 'string'
            ? choice.finish_reason
            : null,
        usage: Object.fromEntries(
          [
            'prompt_tokens',
            'completion_tokens',
            'total_tokens',
            'prompt_cache_hit_tokens',
            'prompt_cache_miss_tokens',
          ]
            .filter((k) => Number.isSafeInteger(body.usage?.[k]))
            .map((k) => [k, body.usage[k]]),
        ),
      };
    }
    fs.appendFileSync(
      path.join(values.output, 'model-responses.jsonl'),
      JSON.stringify({ ...safe, qualification: report.qualification }) + '\n',
      { mode: 0o600 },
    );
  },
});
if (localStdin)
  process.on('SIGHUP', () => {
    void broker.stop('SIGHUP');
  });
