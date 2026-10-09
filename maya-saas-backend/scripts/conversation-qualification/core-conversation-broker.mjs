// Separate explicit profile. Ordinary widgets and the old dry entry cannot load
// credentials. A live invocation requires a fresh pinned external permit first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  CandidateBudgetGate,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_OFFLINE_PROFILE,
  candidateReservation,
} from './current-candidate-budget.mjs';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import {
  readCoreManifest,
  claimCorePermit,
} from './core-conversation-admission.mjs';
import { assertCoreSocket } from './core-conversation-socket.mjs';
import { readLocalTerminalCredential } from './core-local-terminal-credential.mjs';
import { serveCandidateBroker } from './candidate-broker-server.mjs';
import { assertCoreSources, coreHash } from './core-conversation-source.mjs';
import {
  createCoreRecordedReplay,
  CORE_RECORDED_REPLAY_QUALIFICATION,
} from './core-recorded-replay.mjs';
import { createCoreActualDefectsReplay } from './core-actual-defects-replay.mjs';
import { checkAbUsage } from './core-local-ab-checks.mjs';

// One pending response witness, not another budget. The existing gate already
// reserved these exact serialized bytes before invoking the live transport.
// Keep the refusal latched even if reporting or the caller's halt callback fails.
export function createCoreUsageFence({ profile, onUnknown }) {
  let pending = null;
  let halted = false;
  function refuse() {
    const first = !halted;
    halted = true;
    pending = null;
    try {
      if (first) onUnknown();
    } catch {
      // A reporting failure may contain a private path; the latch is already set.
    }
    throw new Error('core_broker_usage_unknown');
  }
  return Object.freeze({
    reserve(url, init) {
      if (halted || pending !== null) refuse();
      pending = candidateReservation(url, init, profile);
    },
    response(status, text) {
      if (halted) refuse();
      const reservation = pending;
      pending = null;
      try {
        return checkAbUsage(status, text, reservation);
      } catch {
        refuse();
      }
    },
  });
}
// Import-safe for the finite local A+B launcher. Shared input never enters CLI,
// runner, environment, files or IPC; all ordinary permit checks remain mandatory.
export async function startCoreBroker(values, batch = null) {
  if (batch) {
    assert.equal(values.mode, 'admitted-local', 'core_batch_local_only');
    assert.equal(
      values['manifest-sha256'],
      batch.manifestSha256,
      'core_batch_binding',
    );
  }
  const checkSources = batch ? batch.assertSources : assertCoreSources;
  assert.ok(
    ['dry', 'admitted', 'admitted-local'].includes(values.mode),
    'core_broker_explicit_mode',
  );
  const recordedReplay = values['recorded-replay'] === true;
  const replayFixture = values['replay-fixture'];
  assert.ok(
    replayFixture === undefined ||
      (recordedReplay &&
        ['actual-20261009', 'synthetic-accept-20261009'].includes(
          replayFixture,
        )),
    'core_broker_replay_fixture_refused',
  );
  assert.ok(
    !recordedReplay || values.mode === 'dry',
    'core_broker_recorded_replay_dry_only',
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
  const profile = coreConversationProfile(pinned.profile);
  assert.ok(
    profile.id !== CORE_OFFLINE_PROFILE ||
      (values.mode === 'dry' &&
        !values.permit &&
        !values['permit-sha256'] &&
        !values['owner-approval-ref'] &&
        batch === null),
    'core_broker_profile_offline_only',
  );
  assert.ok(
    !recordedReplay || profile.id === CORE_DIAGNOSTIC_PROFILE,
    'core_broker_recorded_replay_profile',
  );
  // Paused WIP: no 48-case scripted planner has been integrated yet.
  assert.notEqual(
    profile.id,
    CORE_OFFLINE_PROFILE,
    'core_broker_offline_fixture_pending',
  );
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
  checkSources(pinned);
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
      !values.permit &&
        !values['permit-sha256'] &&
        !values['owner-approval-ref'],
      'core_broker_dry_permit_refused',
    );
  const expiresAt = live
    ? admission.expiresAt
    : Date.now() + profile.limits.durationMs;
  const report = {
    contract: 'maya.core-conversation-broker/1',
    mode: pinned.mode,
    runId: pinned.runId,
    candidateCommit: pinned.candidateCommit,
    profile: profile.id,
    limitsSha256: profile.limitsSha256,
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
      : recordedReplay
        ? CORE_RECORDED_REPLAY_QUALIFICATION
        : 'CANNED_WIRING_ONLY_NOT_MODEL_QUALITY',
    recordedReplay,
    usageValidation: live
      ? 'REQUIRED_BEFORE_APP_DELIVERY'
      : 'OFFLINE_SYNTHETIC_NOT_ACTUAL_USAGE',
    replayFixture: replayFixture ?? null,
    ...(recordedReplay ? { recordedResponses: [] } : {}),
  };
  const replay = recordedReplay
    ? replayFixture
      ? createCoreActualDefectsReplay(
          replayFixture === 'actual-20261009' ? 'archived' : 'synthetic-accept',
        )
      : createCoreRecordedReplay()
    : null;
  let gate, credentialIdentity, localCredential, broker;
  let liveStopQueued = false;
  function stopAfterRefusal(reason) {
    if (!live || liveStopQueued) return;
    liveStopQueued = true;
    localCredential = undefined;
    // Queue cleanup before a batch halt/report can itself fail on disk I/O.
    queueMicrotask(() => {
      void broker?.stop(
        localStdin ? 'local_request_refused' : 'core_request_refused',
      );
    });
    batch?.halt(reason);
  }
  const usageFence = live
    ? createCoreUsageFence({
        profile: profile.id,
        onUnknown: () => {
          report.usageValidation = 'UNKNOWN_STOP';
          stopAfterRefusal('unknown');
        },
      })
    : null;
  const save = () => {
    // Drop the reference on every terminal stop; JS strings are not securely erasable.
    if (report.stopped) localCredential = undefined;
    if (live && report.rejections.length > 0)
      stopAfterRefusal('request_refused');
    fs.writeFileSync(
      reportPath,
      JSON.stringify({ ...report, stats: gate?.stats ?? null }, null, 2) + '\n',
      { mode: 0o600 },
    );
  };
  save();
  function readCredential() {
    if (localStdin) {
      if (batch) return batch.readCredential();
      if (!localCredential)
        throw new Error('core_local_credential_unavailable');
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
        stat.isFile() &&
          stat.nlink === 1 &&
          stat.size >= 16 &&
          stat.size <= 1024,
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
        model: profile.limits.model,
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
    profile: profile.id,
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
      if (batch)
        await batch.credential({
          signal: controller.signal,
          timeoutMs: Math.min(30000, remaining),
        });
      else
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
    checkSources(pinned);
    if (!live) {
      if (!replay) return canned();
      const response = replay.respond(init.body);
      report.recordedResponses.push(response.maya_recorded_replay);
      save();
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }
    admission(binding);
    assertCoreSocket(pinned.admissionContext.target, { localStdin });
    if (batch) await batch.beforeDispatch(url, init);
    const key = readCredential();
    // Recheck after credential I/O, before the only external edge in this profile.
    admission(binding);
    init.signal.throwIfAborted();
    usageFence.reserve(url, init);
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
    limits: profile.limits,
    bind: () => {
      gate = new CandidateBudgetGate({
        ledgerPath: path.join(values.output, 'broker-ledger.jsonl'),
        manifestSha256: pinned.manifestSha256,
        candidateCommit: pinned.candidateCommit,
        profile: profile.id,
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
    reserve: (url, init) => candidateReservation(url, init, profile.id),
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
      // Kernel calls this after the existing gate bounded the full body, and
      // before writing any provider bytes to the application response.
      // Optional A+B bookkeeping must never be the admission for actual usage.
      if (live) usageFence.response(status, text);
      batch?.response({ caseId, turn, status, text });
      const replayEvidence = replay?.observations.at(-1);
      if (replay) {
        assert.ok(
          replayEvidence?.caseId === caseId && replayEvidence?.turn === turn,
          'core_broker_recorded_scope_refused',
        );
      }
      let safe = {
        caseId,
        turn,
        status,
        content: null,
        finishReason: null,
        usage: null,
        actualUsageValidated: live,
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
        JSON.stringify({
          ...safe,
          qualification: report.qualification,
          ...(replayEvidence ? { recordedReplay: replayEvidence } : {}),
        }) + '\n',
        { mode: 0o600 },
      );
    },
  });
  if (localStdin) {
    const onHangup = () => {
      void broker.stop('SIGHUP');
    };
    process.on('SIGHUP', onHangup);
    void broker.closed
      .finally(() => process.off('SIGHUP', onHangup))
      .catch(() => {});
  }
  return {
    ...broker,
    snapshot: () => ({ ...report, stats: gate?.stats ?? null }),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      'recorded-replay': { type: 'boolean' },
      'replay-fixture': { type: 'string' },
      manifest: { type: 'string' },
      'manifest-sha256': { type: 'string' },
      output: { type: 'string' },
      permit: { type: 'string' },
      'permit-sha256': { type: 'string' },
      'owner-approval-ref': { type: 'string' },
    },
    strict: true,
  });
  await startCoreBroker(values);
}
