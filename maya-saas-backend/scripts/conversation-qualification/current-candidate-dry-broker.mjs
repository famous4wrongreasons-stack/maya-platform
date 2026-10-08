// Executable broker prerequisite only. No upstream transport, credential loader,
// paid mode, permit writer or old-pilot path exists in this process.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { serveCandidateBroker } from './candidate-broker-server.mjs';
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
let gate, manifest;
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
      assert.ok(Date.now() < expiresAt, 'dry_broker_expired');
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
serveCandidateBroker({
  report,
  save,
  expiresAt,
  limits: CANDIDATE_LIMITS,
  bind: () => {
    bind();
    return { gate, manifest };
  },
  reserve: candidateReservation,
});
