// Fresh committed candidate; native memory-only helper, real admission/broker,
// real retained runtime launcher, synthetic child using the compiled CRM factory.
// No retained personal DB, real Keychain, external provider or new paid allowance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { buildHelper } from './build-local-keychain-helper.mjs';
import { prepareLocalCore } from './conversation-qualification/core-local-prepare.mjs';
import {
  coreHash,
  coreBackend,
} from './conversation-qualification/core-conversation-source.mjs';
import { CORE_OWNER_HISTORY_PROFILE } from './conversation-qualification/current-candidate-budget.mjs';
import { startOwnerKeychainSession } from './local-owner-keychain.mjs';
import { readOwnerChatLaunch } from './local-owner-chat-launch.mjs';
import { socketRequest } from './conversation-qualification/core-conversation-socket.mjs';
import { createDiagnostic, runReadRuntime } from './local-yclients-read.mjs';

const output = process.argv[2];
assert.ok(
  process.argv.length === 3 &&
    path.isAbsolute(output) &&
    !fs.existsSync(output),
);
assert.equal(process.cwd(), coreBackend);
fs.mkdirSync(output, { mode: 0o700 });
const root = fs.mkdtempSync('/private/tmp/maya-kc-proof-');
const report = {
  qualification: 'SYNTHETIC_NATIVE_ADMISSION_BROKER_LAUNCHER_COMPILED_FACTORY',
  keychainAccesses: 0,
  providerNetworkCalls: 0,
  personalDatabaseAccesses: 0,
  checks: [],
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
const record = (name) => {
  report.checks.push(name);
  save();
};
const write = (file, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
  return coreHash(bytes);
};
async function port() {
  const s = net.createServer();
  await new Promise((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', resolve);
  });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
let active,
  modelCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
  assert.equal(
    new Headers(init.headers).get('authorization'),
    'Bearer SYNTHETIC_DEEPSEEK_KEY_ONLY',
  );
  assert.equal(process.env.DEEPSEEK_API_KEY, undefined);
  modelCalls++;
  return new Response(
    JSON.stringify({
      choices: [
        { finish_reason: 'stop', message: { content: 'Synthetic answer' } },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }),
    { status: 200 },
  );
};
try {
  const built = buildHelper(path.join(root, 'native'), true);
  const source = {
    ...built.source,
    storageApprovalRef: 'SYNTHETIC_MEMORY_ONLY_NOT_REAL_STORAGE',
  };
  report.helper = {
    synthetic: true,
    sha256: source.sha256,
    cdhash: source.cdhash,
  };
  const scope = {
    stateDirectory: root,
    initialManifestSha256: 'a'.repeat(64),
    privateStateSha256: 'b'.repeat(64),
    restartReceiptPath: root + '/restart.json',
    restartReceiptSha256: 'c'.repeat(64),
    tenantId: 'synthetic-tenant',
    userId: 'synthetic-user',
    branchId: 'synthetic-branch',
    tenantSlug: 'synthetic-salon',
    companyId: '321',
  };
  function run(name, changes = {}) {
    const dir = path.join(root, name),
      plan = prepareLocalCore(dir, CORE_OWNER_HISTORY_PROFILE, scope, source);
    report.candidate = plan.candidateCommit;
    assert.equal(plan.terminalInput, undefined);
    assert.equal(plan.credentialInput.inputsPerRun, 0);
    const manifest = JSON.parse(fs.readFileSync(plan.manifestPath));
    const permit = {
      contract: 'maya.core-conversation-permit/1',
      runId: manifest.runId,
      nonce: randomBytes(32).toString('hex'),
      candidateCommit: manifest.candidateCommit,
      manifestSha256: plan.manifestSha256,
      profile: manifest.profile,
      limitsSha256: manifest.limitsSha256,
      ownerApprovalRef: 'SYNTHETIC_NO_PAID_OR_REAL_STORAGE_AUTHORIZATION',
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
      revoked: false,
      target: manifest.admissionContext.target,
      credentialSource: source,
      pricing: {
        model: manifest.limits.model,
        inputNanoUsdPerToken: 1320,
        outputNanoUsdPerToken: 3960,
        reference: 'SYNTHETIC_PRICE_ONLY',
        sha256: 'd'.repeat(64),
        verifiedAt: new Date(Date.now() - 2000).toISOString(),
      },
      claimPath: path.join(dir, 'permit.json.claim'),
      ...changes,
    };
    const permitSha = write(path.join(dir, 'permit.json'), permit);
    write(path.join(dir, 'approved-run.json'), {
      candidateCommit: manifest.candidateCommit,
      manifestSha256: plan.manifestSha256,
      ownerApprovalRef: permit.ownerApprovalRef,
      permitSha256: permitSha,
    });
    const file = path.join(dir, 'local-plan.json');
    return {
      dir,
      plan,
      manifest,
      permit,
      file,
      pin: coreHash(fs.readFileSync(file)),
    };
  }
  async function model(f) {
    return socketRequest(
      f.manifest.admissionContext.target,
      '/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-candidate-manifest': f.plan.manifestSha256,
          'x-candidate-case': f.manifest.cases[0].id,
          'x-candidate-turn': '1',
        },
        body: JSON.stringify({
          model: f.manifest.limits.model,
          messages: [{ role: 'user', content: 'SYNTHETIC_PUBLIC_QUESTION' }],
          max_tokens: 16,
          stream: false,
          thinking: { type: 'disabled' },
        }),
      },
      { localStdin: true },
    );
  }
  for (const name of ['first', 'restart']) {
    const f = run(name);
    active = await startOwnerKeychainSession(f.file, f.pin);
    assert.equal(active.partner, 'SYNTHETIC_PARTNER_KEY_ONLY');
    assert.equal((await model(f)).status, 200);
    assert.equal(active.broker.snapshot().credentialsLoaded, true);
    await assert.rejects(startOwnerKeychainSession(f.file, f.pin));
    const api = await port();
    let web = await port();
    while (web === api) web = await port();
    const plan = {
      diagnosticNoProvider: false,
      providerAdmission: 'explicit_setup_reads_only',
      durationMs: 50,
      runtime: {
        command: process.execPath,
        args: [
          fileURLToPath(
            new URL('./local-keychain-runtime-fixture.mjs', import.meta.url),
          ),
          f.file,
          f.pin,
        ],
      },
    };
    const state = { diagnostic: createDiagnostic(false) },
      control = { cancelled: null, terminate: null };
    const running = runReadRuntime(
      plan,
      {
        PATH: '/usr/bin:/bin',
        PORT: String(api),
        CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${web}`,
      },
      root,
      control,
      state,
      () => {},
      active.partner,
    );
    active.partner = undefined;
    await running;
    assert.equal(state.runtimeGroupAbsent, true);
    assert.equal(state.providerReadSummaryStatus, 'reported_at_clean_stop');
    assert.equal(state.diagnostic.firstFailure, null);
    await active.broker.stop('synthetic_complete');
    await active.broker.closed;
    active = null;
    record(
      name +
        ': native load → claimed broker → model stub → fd4 → compiled CRM adapter → stop, no repeated enrollment',
    );
  }
  const revoked = run('revoked');
  active = await startOwnerKeychainSession(revoked.file, revoked.pin);
  fs.writeFileSync(
    path.join(revoked.dir, 'permit.json'),
    JSON.stringify({ ...revoked.permit, revoked: true }),
    { mode: 0o600 },
  );
  assert.throws(() => readOwnerChatLaunch(revoked.file, revoked.pin, 'broker'));
  const before = modelCalls;
  let revokedStatus;
  try {
    revokedStatus = (await model(revoked)).status;
  } catch {}
  assert.notEqual(revokedStatus, 200);
  assert.equal(modelCalls, before);
  await active.broker.stop('synthetic_revoked');
  await active.broker.closed;
  active = null;
  record('revocation closes existing admission before next model dispatch');
  for (const [name, patch] of [
    [
      'expired',
      {
        startsAt: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() - 1).toISOString(),
      },
    ],
    ['not-yet-valid', { startsAt: new Date(Date.now() + 60000).toISOString() }],
    ['wrong-candidate', { candidateCommit: 'f'.repeat(40) }],
    ['revoked-before-load', { revoked: true }],
  ]) {
    const f = run(name, patch);
    await assert.rejects(startOwnerKeychainSession(f.file, f.pin));
    record(name + ' refuses before loading either credential');
  }
  const f = run('concurrent');
  const results = await Promise.allSettled([
    startOwnerKeychainSession(f.file, f.pin),
    startOwnerKeychainSession(f.file, f.pin),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  active = results.find((x) => x.status === 'fulfilled').value;
  await active.broker.stop('synthetic_concurrent');
  await active.broker.closed;
  active = null;
  record('concurrent launch: exactly one permit claim and broker');
  const files = fs
    .readdirSync(root, { recursive: true })
    .filter((name) => /\.jsonl?$/.test(name));
  for (const name of files) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    for (const key of [
      'SYNTHETIC_DEEPSEEK_KEY_ONLY',
      'SYNTHETIC_PARTNER_KEY_ONLY',
    ])
      assert.ok(!text.includes(key));
  }
  record('reports/ledger/manifests contain no synthetic credential values');
  report.fakeModelCalls = modelCalls;
  report.result = 'PASS';
  save();
} finally {
  await active?.broker.stop('synthetic_cleanup');
  globalThis.fetch = originalFetch;
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    result: report.result,
    checks: report.checks.length,
    candidate: report.candidate,
    keychainAccesses: 0,
    providerNetworkCalls: 0,
  }),
);
