// Executable broker prerequisite only. No upstream transport, credential loader,
// paid mode, permit writer or old-pilot path exists in this process.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { freezeCurrentCandidate } from './current-candidate.mjs';
import {
  readBoundedProfileJson,
  verifyKeylessProfileBinding,
} from './current-candidate-keyless-profile.mjs';
import {
  CandidateBudgetGate,
  CANDIDATE_LIMITS,
  candidateReservation,
} from './current-candidate-budget.mjs';

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    candidate: { type: 'string' },
    'no-upstream': { type: 'boolean' },
    'lifetime-ms': { type: 'string' },
    'keyless-profile-sha256': { type: 'string' },
  },
});
assert.equal(values['no-upstream'], true, 'dry_broker_no_upstream_required');
assert.match(values.candidate ?? '', /^[a-f0-9]{40}$/);
assert.ok(values.output && path.isAbsolute(values.output));
const profilePin = values['keyless-profile-sha256'];
assert.ok(
  profilePin === undefined || /^[a-f0-9]{64}$/.test(profilePin),
  'dry_broker_profile_pin',
);
// A dry proof may shorten its lifetime, never extend the proposed ceiling.
const lifetimeMs =
  values['lifetime-ms'] === undefined
    ? CANDIDATE_LIMITS.durationMs
    : Number(values['lifetime-ms']);
assert.ok(
  Number.isSafeInteger(lifetimeMs) &&
    lifetimeMs > 0 &&
    lifetimeMs <= CANDIDATE_LIMITS.durationMs,
  'dry_broker_lifetime',
);
const expiresAt = Date.now() + lifetimeMs;
assert.ok(
  !Object.keys(process.env).some((k) =>
    /API_KEY|TOKEN|SECRET|PASSWORD|PAID|PERMIT|DATABASE_URL/.test(k),
  ),
  'dry_broker_credential_environment_refused',
);
const output = values.output,
  hash = (value) => createHash('sha256').update(value).digest('hex');
const reportPath = path.join(output, 'broker-report.json');
assert.ok(
  !fs.existsSync(reportPath) &&
    !fs.existsSync(path.join(output, 'broker-ledger.jsonl')),
  'dry_broker_restart_refused',
);
let gate,
  manifest,
  busy = false,
  stopped = false,
  blocked = false,
  caseIndex = -1,
  turn = 0;
const report = {
  contract: 'maya.current-candidate-dry-broker/1',
  mode: 'NO_UPSTREAM_ONLY',
  candidate: values.candidate,
  paidAuthorized: false,
  credentialsLoaded: false,
  upstreamCalls: 0,
  keylessProfileSha256: profilePin ?? null,
  keylessProfileVerified: false,
  startedAt: new Date().toISOString(),
  expiresAt: new Date(expiresAt).toISOString(),
  lifetimeMs,
  requests: [],
  rejections: [],
  stopped: false,
};
const save = () =>
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ ...report, stats: gate?.stats ?? null }, null, 2) + '\n',
    { mode: 0o600 },
  );
save();
function bind() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(output, 'candidate-manifest.json'), 'utf8'),
  );
  const { bindingManifestSha256, ...unsigned } = raw;
  assert.equal(
    hash(JSON.stringify(unsigned)),
    bindingManifestSha256,
    'dry_broker_manifest_hash',
  );
  assert.equal(raw.candidateCommit, values.candidate, 'dry_broker_candidate');
  assert.deepEqual(raw.limits, CANDIDATE_LIMITS, 'dry_broker_limits');
  assert.equal(raw.paidAuthorized, false);
  const files = { ...raw.sourceHashes, ...raw.bindingSources };
  for (const [file, expected] of Object.entries(files)) {
    const resolved = path.resolve(file),
      relative = path.relative(process.cwd(), resolved);
    assert.ok(
      !path.isAbsolute(relative) && relative && !relative.startsWith('..'),
      'dry_broker_source_path',
    );
    assert.equal(
      hash(fs.readFileSync(resolved)),
      expected,
      'dry_broker_source_changed',
    );
  }
  if (profilePin !== undefined) {
    assert.equal(
      raw.keylessProfileSha256,
      profilePin,
      'dry_broker_profile_manifest',
    );
    const candidate = freezeCurrentCandidate(process.cwd(), values.candidate);
    assert.equal(
      raw.manifestSha256,
      candidate.manifestSha256,
      'dry_broker_profile_candidate',
    );
    verifyKeylessProfileBinding({
      binding: readBoundedProfileJson(
        path.join(output, 'keyless-profile-binding.json'),
      ),
      candidate,
      expectedSha256: profilePin,
    });
    report.keylessProfileVerified = true;
  } else
    assert.ok(
      raw.keylessProfileSha256 == null,
      'dry_broker_profile_pin_missing',
    );
  manifest = raw;
  report.bindingManifestSha256 = bindingManifestSha256;
  report.verifiedSourcePaths = Object.keys(files).length;
  gate = new CandidateBudgetGate({
    ledgerPath: path.join(output, 'broker-ledger.jsonl'),
    manifestSha256: bindingManifestSha256,
    candidateCommit: values.candidate,
    mode: 'OFFLINE_SYNTHETIC_ONLY',
    transport: async () => {
      assert.ok(!stopped && Date.now() < expiresAt, 'dry_broker_expired');
      return new Response(
        JSON.stringify({
          model: CANDIDATE_LIMITS.model,
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
                        clarification_question:
                          'Уточните синтетический запрос.',
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
    },
  });
}
const controllers = new Set(),
  inflight = new Set(),
  sockets = new Set();
async function handle(req, res) {
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        mode: report.mode,
        paidAuthorized: false,
        upstreamCalls: 0,
        blocked,
      }),
    );
    return;
  }
  const owns = !busy;
  if (owns) busy = true;
  const controller = new AbortController();
  controllers.add(controller);
  const disconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', disconnected);
  try {
    assert.ok(
      owns && !blocked && !stopped && Date.now() < expiresAt,
      'dry_broker_closed_or_busy',
    );
    assert.ok(
      req.method === 'POST' && req.url === '/chat/completions',
      'dry_broker_route',
    );
    assert.ok(!req.headers.authorization, 'dry_broker_credentials_refused');
    gate ?? bind();
    assert.equal(
      req.headers['x-candidate-manifest'],
      manifest.bindingManifestSha256,
      'dry_broker_request_binding',
    );
    const id = req.headers['x-candidate-case'];
    const nextIndex = manifest.selectedCaseIds.indexOf(id);
    const nextTurn = Number(req.headers['x-candidate-turn']);
    const row = manifest.cases.find((c) => c.id === id);
    assert.ok(
      nextIndex >= 0 &&
        nextIndex >= caseIndex &&
        Number.isSafeInteger(nextTurn) &&
        nextTurn > 0 &&
        nextTurn <= row.userTurns.length,
      'dry_broker_turn_scope',
    );
    assert.ok(
      nextIndex !== caseIndex || nextTurn >= turn,
      'dry_broker_rewind_refused',
    );
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      controller.signal.throwIfAborted();
      bytes += chunk.length;
      assert.ok(
        bytes <= CANDIDATE_LIMITS.requestBytes,
        'dry_broker_body_limit',
      );
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    candidateReservation('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      body,
    });
    if (caseIndex !== nextIndex || turn !== nextTurn) {
      if (caseIndex >= 0) gate.endTurn();
      if (caseIndex !== nextIndex) gate.dialog();
      gate.turn();
      caseIndex = nextIndex;
      turn = nextTurn;
    }
    const response = await gate.fetch(
      'https://api.deepseek.com/chat/completions',
      { method: 'POST', body, signal: controller.signal },
    );
    report.requests.push({
      caseId: id,
      turn,
      bytes,
      bodySha256: hash(body),
      status: response.status,
    });
    save();
    res.writeHead(response.status, { 'content-type': 'application/json' });
    res.end(await response.text());
  } catch (error) {
    blocked = true;
    const code =
      error instanceof Error &&
      /^(dry_broker|candidate)_[a-z_]+$/.test(error.message)
        ? error.message
        : 'dry_broker_prerequisite_refused';
    report.rejections.push({ code });
    save();
    if (!res.destroyed) {
      if (!res.headersSent)
        res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code } }));
    }
  } finally {
    res.off('close', disconnected);
    controllers.delete(controller);
    if (owns) busy = false;
  }
}
const server = http.createServer((req, res) => {
  if (stopped) {
    req.destroy();
    res.destroy();
    return;
  }
  const work = handle(req, res).catch(() => {
    void stop('handler_error');
  });
  inflight.add(work);
  void work.finally(() => inflight.delete(work));
});
server.on('connection', (socket) => {
  if (stopped) {
    socket.destroy();
    return;
  }
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
});
server.requestTimeout = CANDIDATE_LIMITS.timeoutMs;
server.headersTimeout = CANDIDATE_LIMITS.timeoutMs;
const deadline = setTimeout(
  () => {
    void stop('ttl');
  },
  Math.max(0, expiresAt - Date.now()),
);
async function stop(reason) {
  if (stopped) return;
  stopped = true;
  blocked = true;
  clearTimeout(deadline);
  report.stopReason = reason;
  report.connectionsAtStop = sockets.size;
  report.requestsAtStop = inflight.size;
  // Cut every socket now, including partial bodies/headers and keepalive. Also
  // cancel budget spacing/transport; closing only idle sockets cannot enforce TTL.
  for (const controller of controllers) controller.abort();
  const closed = new Promise((resolve) => server.close(resolve));
  for (const socket of sockets) socket.destroy();
  await Promise.allSettled([...inflight, closed]);
  gate?.endTurn();
  gate?.close();
  report.stopped = true;
  report.stoppedAt = new Date().toISOString();
  save();
  if (process.connected) process.disconnect();
}
process.on('SIGTERM', () => {
  void stop('SIGTERM');
});
process.on('SIGINT', () => {
  void stop('SIGINT');
});
process.on('disconnect', () => {
  void stop('parent_disconnect');
});
server.listen(0, '127.0.0.1', () => {
  if (stopped || Date.now() >= expiresAt) {
    server.close();
    void stop('ttl');
    return;
  }
  const address = server.address();
  if (process.connected)
    process.send?.({ type: 'ready', port: address.port, mode: report.mode });
});
