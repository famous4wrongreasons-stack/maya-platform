// Synthetic compiled AppModule/HTTP/PG fixture; no real key, model or CRM access.
// Keep raw synthetic setup/fault injection in test support. Production scripts
// must reach the existing certified writer; K3 admits no ad-hoc entitlement writer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {
  createNativeExecutionVerifier,
  installedExecutorDigest,
  executionHash,
  NATIVE_EXECUTION,
} from '../../../scripts/phone-native-execution.mjs';
import {
  openNativeChannel,
  forwardNativeOnce,
} from '../../../scripts/phone-native-channel.mjs';
import { installNativeExecution } from '../../../scripts/phone-native-runtime.mjs';
import { revokeNativeRun } from '../../../scripts/phone-native-run-guard.mjs';
import { assertNativeModelPayload } from '../../../scripts/phone-native-model.mjs';
import { EXECUTION_EGRESS_CONTRACT } from '../../../scripts/phone-native-create-egress.mjs';
const require = createRequire(import.meta.url),
  backend = process.cwd();
assert.equal(process.argv[2], '--run');
const output = process.argv[3];
const loseCreateResponse = process.argv[4] === '--lose-create-response';
assert(process.argv.length === (loseCreateResponse ? 5 : 4));
assert(path.isAbsolute(output) && !fs.existsSync(output));
for (const f of ['.env', '.env.local']) assert(!fs.existsSync(f));
const db = new URL(process.env.DATABASE_URL);
assert(
  db.hostname === '127.0.0.1' &&
    db.port !== '5432' &&
    /^\/maya_widget_gate_proof_native_execution_[a-f0-9]+$/.test(db.pathname),
);
fs.mkdirSync(output, { mode: 0o700 });
require('reflect-metadata');
require('ts-node').register({
  transpileOnly: true,
  project: path.join(backend, 'tsconfig.scripts.json'),
});
const {
  WIDGETS_LIVE_TEST_LITERALS,
} = require('./environment.ts');
for (const [k, v] of Object.entries(WIDGETS_LIVE_TEST_LITERALS))
  process.env[k] = v;
const {
  singleOperatorProof,
} = require('./widget-single-operator-proof.ts');
const {
  firstPhoneCertificate,
} = require('./widget-first-phone-proof.ts');
const load = (n) => require(path.join(backend, 'dist/src', n));
const { NestFactory } = require('@nestjs/core'),
  { ConfigService } = require('@nestjs/config'),
  bcrypt = require('bcrypt');
const originalFetch = globalThis.fetch,
  checks = [],
  apps = [];
let runtime,
  app,
  channel,
  forwarding,
  forwardingStopped = false,
  ipcDirectory;
const result = {
  contract: 'maya.native-execution-compiled-proof/1',
  status: 'running',
  sourceCandidate: process.env.MAYA_PROOF_CANDIDATE,
  loseCreateResponse,
  syntheticSigners: true,
  syntheticCertificate: true,
  realProviderEffects: 0,
  realModelCalls: 0,
  certification: 'NOT_ISSUED',
  checks,
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'manifest.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
save();
try {
  app = await NestFactory.create(load('app.module.js').AppModule, {
    bodyParser: false,
    logger: {
      log() {},
      warn() {},
      debug() {},
      verbose() {},
      error(message, stack) {
        (result.syntheticServerErrors ??= []).push({
          message: String(message),
          stack: String(stack),
        });
      },
    },
    abortOnError: false,
  });
  load('bootstrap/configure-http-app.js').configureHttpApp(app);
  await app.init();
  await app.listen(0, '127.0.0.1');
  const origin = 'http://127.0.0.1:' + app.getHttpServer().address().port;
  const p = app.get(load('prisma/prisma.service.js').PrismaService),
    cfg = app.get(ConfigService),
    policy = app.get(
      load('entitlements/widget-release-policy.service.js').WidgetReleasePolicy,
    );
  const password = 'synthetic-' + randomUUID(),
    hash = await bcrypt.hash(password, 10);
  const tenant = await p.tenant.create({
    data: {
      name: 'Synthetic execution',
      slug: 'widgets-live-' + randomUUID().replaceAll('-', ''),
      status: 'active',
      trialFullAccess: false,
      calendarSource: 'internal',
    },
  });
  const owner = await p.user.create({
    data: {
      tenantId: null,
      email: randomUUID() + '@synthetic.invalid',
      passwordHash: hash,
      role: 'platform_owner',
      status: 'active',
    },
  });
  const user = await p.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@synthetic.invalid',
      passwordHash: hash,
      role: 'client',
      status: 'active',
    },
  });
  const membership = await p.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'client',
      status: 'active',
      joinedAt: new Date(),
    },
  });
  const call = async (route, body, token) => {
    const r = await originalFetch(origin + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': randomUUID(),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  const login = await call('/api/auth/login', { email: owner.email, password });
  assert.equal(login.status, 201);
  const token = login.body.access_token;
  const loginUser = await call('/api/auth/login', {
    tenantSlug: tenant.slug,
    email: user.email,
    password,
  });
  assert.equal(loginUser.status, 201);
  const userToken = loginUser.body.access_token;
  const session = await p.authSession.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await p.crmIntegration.create({
    data: {
      tenantId: tenant.id,
      provider: 'yclients',
      status: 'active',
      encryptedApiToken: app
        .get(load('encryption/encryption.service.js').EncryptionService)
        .encrypt('SYNTHETIC_NATIVE_USER'),
      settingsJson: { companyId: '450001' },
    },
  });
  for (const key of [
    'widgets.runtime',
    'ai.consultant',
    'ai.owner',
    'booking',
    'booking.customer_app',
    'crm.integration',
  ]) {
    await p.feature.upsert({
      where: { key },
      update: {},
      create: {
        key,
        name: key,
        description: 'synthetic',
        module: 'platform',
        status: 'active',
      },
    });
    if (key !== 'widgets.runtime')
      await p.tenantEntitlement.create({
        data: {
          tenantId: tenant.id,
          featureKey: key,
          enabled: true,
          reason: 'synthetic proof',
        },
      });
  }
  const proof = singleOperatorProof(
    process.env.DATABASE_URL,
    tenant.id,
    owner.id,
  );
  for (const key of [
    'NODE_ENV',
    'WIDGET_RELEASE_ENVIRONMENT',
    'WIDGET_RELEASE_CANDIDATE_SHA',
    'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
    'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
  ])
    cfg.set(key, proof.config.get(key));
  cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', process.env.MAYA_PROOF_CANDIDATE);
  cfg.set('MAYA_RELEASE', process.env.MAYA_PROOF_CANDIDATE);
  cfg.set('MAYA_NATIVE_SERVER_ORIGIN', 'https://phone.synthetic.invalid');
  const command = proof.command();
  command.certificate = firstPhoneCertificate({
    ...command.certificate,
    candidateSha: process.env.MAYA_PROOF_CANDIDATE,
    buildDigest: policy.buildDigest(true),
  });
  command.authorization = proof.signOwner({
    ...command.authorization.payload,
    candidateSha: process.env.MAYA_PROOF_CANDIDATE,
    buildDigest: command.certificate.buildDigest,
    profileId: command.certificate.scope,
    profileDigest: command.certificate.profileDigest,
    certificateDigest: executionHash(command.certificate),
  });
  const route = '/api/platform/widget-release/' + tenant.id;
  const tenantOwner = await p.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@synthetic.invalid',
      passwordHash: hash,
      role: 'tenant_owner',
      status: 'active',
    },
  });
  await p.membership.create({
    data: {
      tenantId: tenant.id,
      userId: tenantOwner.id,
      role: 'tenant_owner',
      status: 'active',
      joinedAt: new Date(),
    },
  });
  const ownerLogin = await call('/api/auth/login', {
    tenantSlug: tenant.slug,
    email: tenantOwner.email,
    password,
  });
  assert.equal(ownerLogin.status, 201);
  assert.equal(
    (await call(route + '/grant', command, ownerLogin.body.access_token))
      .status,
    403,
  );
  checks.push('tenant_owner_cannot_grant');
  const granted = await call(route + '/grant', command, token);
  assert.equal(granted.status, 201);
  checks.push('canonical_signed_grant_with_atomic_audit');
  const at = Date.now(),
    pricing = {
      model: 'deepseek-v4-pro',
      inputNanoUsdPerToken: 1320,
      outputNanoUsdPerToken: 3960,
      evidenceDigest: executionHash('synthetic pricing only'),
      verifiedAt: new Date(at - 2000).toISOString(),
      validUntil: new Date(at + 1800000).toISOString(),
    };
  const a = {
    contract: NATIVE_EXECUTION,
    runId: randomUUID(),
    candidateSha: command.certificate.candidateSha,
    buildDigest: command.certificate.buildDigest,
    executorDigest: installedExecutorDigest(path.join(backend, 'scripts')),
    certificateDigest: executionHash(command.certificate),
    evidenceDigest: command.certificate.evidenceDigest,
    profileId: command.certificate.scope,
    profileDigest: command.certificate.profileDigest,
    grantAuthorizationDigest: executionHash(command.authorization),
    entitlementVersion: granted.body.receipt.version,
    environment: 'production',
    serverOrigin: 'https://phone.synthetic.invalid',
    tenantId: tenant.id,
    companyId: '450001',
    userId: user.id,
    operatorId: owner.id,
    platformSessionId: session.id,
    independentHumanReview: false,
    notBefore: new Date(at - 1000).toISOString(),
    expiresAt: new Date(at + 600000).toISOString(),
    model: pricing.model,
    pricing,
    maxModelAttempts: 12,
    maxSpendNanoUsd: 2000000000,
    maxReads: 256,
    maxCreates: 1,
    maxReschedules: 1,
    maxCancels: 1,
  };
  const signed = proof.signOwner(a);
  const context = app.get(
    load('tenancy/tenant-context.service.js').TenantContextService,
  );
  // Offline operator check uses the actual compiled policy and installed executor.
  const cliDir = path.join(output, 'operator-check');
  fs.mkdirSync(cliDir, { mode: 0o700 });
  const cliEnv = {
    NODE_ENV: 'production',
    WIDGET_RELEASE_ENVIRONMENT: 'production',
    WIDGET_RELEASE_CANDIDATE_SHA: a.candidateSha,
    WIDGET_RELEASE_PRODUCTION_TENANTS_JSON: JSON.stringify([tenant.id]),
    WIDGET_RELEASE_PRODUCTION_TRUST_JSON: cfg.get(
      'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
    ),
    MAYA_NATIVE_SERVER_ORIGIN: a.serverOrigin,
    MAYA_NATIVE_PRICING_FILE: path.join(cliDir, 'pricing.json'),
  };
  fs.writeFileSync(cliEnv.MAYA_NATIVE_PRICING_FILE, JSON.stringify(pricing), {
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(cliDir, 'public.env'),
    Object.entries(cliEnv)
      .map(([k, v]) => k + "='" + v + "'")
      .join('\n'),
    { mode: 0o600 },
  );
  const offline = (attachment, actor = owner.id) => {
    fs.writeFileSync(
      path.join(cliDir, 'attachment.json'),
      JSON.stringify(attachment),
      { mode: 0o600 },
    );
    return spawnSync(
      process.execPath,
      [
        'scripts/widget-release-operator.cjs',
        'check-native-execution',
        path.join(cliDir, 'public.env'),
        tenant.id,
        a.candidateSha,
        path.join(cliDir, 'attachment.json'),
        actor,
      ],
      {
        cwd: backend,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        encoding: 'utf8',
      },
    );
  };
  const admittedOffline = offline(signed);
  assert.equal(admittedOffline.status, 0, admittedOffline.stderr);
  const offlineBody = JSON.parse(admittedOffline.stdout);
  assert.equal(offlineBody.authorityGranted, false);
  assert.equal(offlineBody.sessionVerified, false);
  for (const bad of [
    proof.signOwner({ ...a, candidateSha: '0'.repeat(40) }),
    { ...signed, signature: 'bad' },
    proof.signOwner({ ...a, independentHumanReview: true }),
  ])
    assert.equal(offline(bad).status, 1);
  assert.equal(offline(signed, user.id).status, 1);
  fs.rmSync(cliDir, { recursive: true });
  checks.push('compiled_operator_offline_check_and_substitution_refusals');
  const current = (over = {}) =>
    createNativeExecutionVerifier({
      app,
      backend,
      readAuthorization: () => signed,
      readPricing: () => pricing,
      operatorToken: () => token,
      ...over,
    });
  const authenticated = (f) =>
    context.run('synthetic-execution-request', () => {
      context.setResolvedTenant({
        tenantId: tenant.id,
        userId: user.id,
        membershipId: membership.id,
        role: 'client',
        source: 'membership',
      });
      return f();
    });
  assert.equal((await current().check()).digest, executionHash(signed));
  await authenticated(() => current().check(true));
  checks.push('actual_global_session_and_current_tenant_context');
  await assert.rejects(current({ operatorToken: () => userToken }).check());
  checks.push('tenant_session_cannot_replace_global_session');
  await assert.rejects(current().check(true));
  checks.push('missing_authenticated_request_context_refused');
  const negatives = [
    [
      'target_user_disabled',
      async () => {
        await p.user.update({
          where: { id: user.id },
          data: { status: 'suspended' },
        });
        return () =>
          p.user.update({ where: { id: user.id }, data: { status: 'active' } });
      },
    ],
    [
      'target_membership_removed',
      async () => {
        await p.membership.update({
          where: { id: membership.id },
          data: { status: 'suspended' },
        });
        return () =>
          p.membership.update({
            where: { id: membership.id },
            data: { status: 'active' },
          });
      },
    ],
    [
      'stale_CAS',
      async () => {
        const row = await p.tenantEntitlement.findUniqueOrThrow({
          where: {
            tenantId_featureKey: {
              tenantId: tenant.id,
              featureKey: 'widgets.runtime',
            },
          },
        });
        await p.tenantEntitlement.update({
          where: { id: row.id },
          data: { reason: 'synthetic changed' },
        });
        return () =>
          p.tenantEntitlement.update({
            where: { id: row.id },
            data: { reason: row.reason, updatedAt: row.updatedAt },
          });
      },
    ],
    [
      'allowlist_removal',
      async () => {
        cfg.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
        return () =>
          cfg.set(
            'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
            JSON.stringify([tenant.id]),
          );
      },
    ],
    [
      'candidate_replacement',
      async () => {
        cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', '0'.repeat(40));
        return () => cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', a.candidateSha);
      },
    ],
    [
      'global_session_revoked',
      async () => {
        await p.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return () =>
          p.authSession.update({
            where: { id: session.id },
            data: { revokedAt: null },
          });
      },
    ],
    [
      'global_session_expired',
      async () => {
        await p.authSession.update({
          where: { id: session.id },
          data: { expiresAt: new Date(0) },
        });
        return () =>
          p.authSession.update({
            where: { id: session.id },
            data: { expiresAt: session.expiresAt },
          });
      },
    ],
    [
      'platform_authority_removed',
      async () => {
        await p.user.update({
          where: { id: owner.id },
          data: { role: 'tenant_owner' },
        });
        return () =>
          p.user.update({
            where: { id: owner.id },
            data: { role: 'platform_owner' },
          });
      },
    ],
    [
      'grant_disabled',
      async () => {
        const row = await p.tenantEntitlement.findUniqueOrThrow({
          where: {
            tenantId_featureKey: {
              tenantId: tenant.id,
              featureKey: 'widgets.runtime',
            },
          },
        });
        await p.tenantEntitlement.update({
          where: { id: row.id },
          data: { enabled: false },
        });
        return () =>
          p.tenantEntitlement.update({
            where: { id: row.id },
            data: { enabled: row.enabled, updatedAt: row.updatedAt },
          });
      },
    ],
    [
      'audit_missing',
      async () => {
        const row = await p.auditLog.findUniqueOrThrow({
          where: { id: granted.body.receipt.auditId },
        });
        await p.auditLog.delete({ where: { id: row.id } });
        return () => p.auditLog.create({ data: row });
      },
    ],
  ];
  for (const [name, mutate] of negatives) {
    const restore = await mutate();
    const verifier = current();
    await assert.rejects(verifier.check());
    await restore();
    await assert.rejects(verifier.check());
    checks.push(name + '_refused_and_poisoned');
  }
  for (const [key, value] of [
    ['tenantId', 'tenant-b'],
    ['userId', 'user-b'],
    ['companyId', '450002'],
    ['platformSessionId', 'session-b'],
  ]) {
    const rebound = proof.signOwner({ ...a, [key]: value });
    await assert.rejects(
      authenticated(() =>
        current({ readAuthorization: () => rebound }).check(true),
      ),
    );
    checks.push('operator_signed_' + key + '_substitution_refused');
  }
  const installedDir = path.join(output, 'installed'),
    state = path.join(output, 'state');
  fs.mkdirSync(installedDir, { mode: 0o700 });
  fs.mkdirSync(state, { mode: 0o700 });
  const hashBytes = (b) => createHash('sha256').update(b).digest('hex'),
    credential = 'Bearer SYNTHETIC_NATIVE_PARTNER, User SYNTHETIC_NATIVE_USER';
  const scope = {
    contract: EXECUTION_EGRESS_CONTRACT,
    runId: a.runId,
    maxReschedules: 1,
    maxCancels: 1,
    candidate: a.candidateSha,
    profile: a.profileId,
    tenantId: a.tenantId,
    companyId: a.companyId,
    executionAuthorizationDigest: executionHash(signed),
    credentialDigest: hashBytes(credential),
    notBefore: a.notBefore,
    expiresAt: a.expiresAt,
    maxReads: a.maxReads,
    maxCreates: 1,
  };
  const installed = {};
  for (const [name, value] of Object.entries({
    authorization: signed,
    pricing,
    session: token,
    scope,
    modelCredential: 'SYNTHETIC_MODEL_CREDENTIAL_ONLY',
    partnerCredential: 'SYNTHETIC_NATIVE_PARTNER',
  })) {
    const bytes =
        typeof value === 'string'
          ? value
          : JSON.stringify(value, null, 2) + '\n',
      file = path.join(installedDir, name);
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    installed[name] = { file, sha256: hashBytes(bytes) };
  }
  // Canonical Client linkage uses the existing owner with a synthetic verifier.
  const enc = app.get(
    load('encryption/encryption.service.js').EncryptionService,
  );
  const branch = await p.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Synthetic branch',
      timezone: 'Europe/Moscow',
    },
  });
  await p.tenant.update({
    where: { id: tenant.id },
    data: {
      defaultTimezone: 'Europe/Moscow',
      currentPeriodEnd: new Date('2099-01-01'),
    },
  });
  await p.brandingSettings.create({
    data: { tenantId: tenant.id, themeJson: { booking: { mode: 'live' } } },
  });
  await p.user.update({
    where: { id: user.id },
    data: {
      encryptedName: enc.encrypt('Synthetic client'),
      phone: '+79990000001',
    },
  });
  const client = await p.client.create({
    data: { tenantId: tenant.id, userId: user.id },
  });
  const { ClientChannelLinkService } = load(
    'crm/client-channel-link.service.js',
  );
  const { clientChannelSubjectHash } = load('crm/client-channel-subject.js');
  const fixtureProof = 'synthetic-link-' + randomUUID();
  const identity = new ClientChannelLinkService(p, context, {
    async verifyLink(token) {
      assert.equal(token, fixtureProof);
      return {
        tenantId: tenant.id,
        clientId: client.id,
        provider: 'maya_user',
        providerSubjectHash: clientChannelSubjectHash(
          enc,
          'maya_user',
          user.id,
        ),
        method: 'proven_user_client_link',
        verificationIdentityHash: executionHash(fixtureProof),
        verifier: 'synthetic-isolated-challenge-verifier.v1',
        channelControlProofHash: executionHash('channel'),
        clientAuthorityProofHash: executionHash('client'),
        validUntil: new Date(Date.now() + 600000),
      };
    },
    async verifyRevocation() {
      throw Error('synthetic verifier has no revocation');
    },
  });
  await context.runAsSystemTenant(tenant.id, () =>
    identity.link({ proof: fixtureProof }),
  );
  await p.crmIntegration.update({
    where: { tenantId: tenant.id },
    data: {
      settingsJson: {
        companyId: '450001',
        currency: 'RUB',
        branchBinding: {
          contract: 'maya.crm-branch-binding/1',
          companyId: 450001,
          branchId: branch.id,
        },
      },
    },
  });
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 86400000));
  const { Client: PgClient } = require('pg');
  const ledger = new PgClient({ connectionString: process.env.DATABASE_URL });
  await ledger.connect();
  await ledger.query(
    'CREATE TABLE native_execution_provider (id serial PRIMARY KEY, payload jsonb NOT NULL, moved_start text, cancelled boolean NOT NULL DEFAULT false)',
  );
  await ledger.end();
  const providerQuery = async (sql, args = []) => {
    const c = new PgClient({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      return await c.query(sql, args);
    } finally {
      await c.end();
    }
  };
  let bookingMode = false,
    modelCalls = 0,
    providerCalls = 0,
    creates = 0,
    moves = 0,
    cancels = 0;

  const externalFetch = async (raw, init) => {
    const url = new URL(String(raw));
    if (url.origin === origin || url.hostname === '127.0.0.1')
      return originalFetch(raw, init);
    if (url.origin === 'https://api.deepseek.com') {
      modelCalls++;
      const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      result.syntheticModelPhase = input.phase;
      assert(['tool_planning', 'final_response'].includes(input.phase));
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content:
                  input.phase === 'final_response'
                    ? 'Привет! Я рядом.'
                    : JSON.stringify({
                        semantic_plan: {
                          parent_request: bookingMode
                            ? 'Хочу записаться'
                            : 'Привет',
                          language: 'ru',
                          dialogue_act: bookingMode ? 'request' : 'greeting',
                          tasks: [
                            {
                              id: 'task_1',
                              intent: bookingMode
                                ? 'booking.prepare_personal'
                                : 'small_talk.greeting',
                              entities_json: '{}',
                              depends_on: [],
                              confidence: 0.99,
                              requires_clarification: false,
                              clarification_question: null,
                            },
                          ],
                          context: {
                            carried_slots: [],
                            replaced_slots: [],
                            unresolved_references: [],
                          },
                        },
                        tool_call: bookingMode
                          ? {
                              name: 'catalog.services.read',
                              arguments_json: '{}',
                            }
                          : null,
                      }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200 },
      );
    }
    assert.equal(url.origin, 'https://api.yclients.com');
    assert.equal(new Headers(init.headers).get('authorization'), credential);
    providerCalls++;
    const route = url.pathname;
    const reply = (data) =>
      new Response(JSON.stringify({ success: true, data }), { status: 200 });
    if (route === '/api/v1/book_record/450001' && init.method === 'POST') {
      const payload = JSON.parse(init.body);
      assert.equal(payload.notify_by_sms, 0);
      assert.equal(payload.notify_by_email, 0);
      const r = await providerQuery(
        'INSERT INTO native_execution_provider(payload) VALUES($1::jsonb) RETURNING id',
        [JSON.stringify(payload)],
      );
      creates++;
      if (loseCreateResponse)
        throw new Error('synthetic provider persisted; response lost');
      return reply([{ id: 1, record_id: r.rows[0].id }]);
    }
    if (route.startsWith('/api/v1/record/450001/')) {
      const id = Number(route.split('/').at(-1));
      const row = (
        await providerQuery(
          'SELECT * FROM native_execution_provider WHERE id=$1',
          [id],
        )
      ).rows[0];
      assert(row);
      if (init.method === 'PUT') {
        const value = JSON.parse(init.body);
        assert.equal(value.send_sms, false);
        await providerQuery(
          'UPDATE native_execution_provider SET moved_start=$1 WHERE id=$2',
          [value.datetime, id],
        );
        moves++;
        return reply({});
      }
      if (init.method === 'DELETE') {
        await providerQuery(
          'UPDATE native_execution_provider SET cancelled=true WHERE id=$1',
          [id],
        );
        cancels++;
        return reply({});
      }
      assert.equal(init.method, 'GET');
      return reply({
        id,
        company_id: 450001,
        staff_id: 71,
        staff: { id: 71, name: 'Synthetic staff' },
        datetime: row.moved_start ?? day + 'T17:00:00',
        seance_length: 1800,
        services: [{ id: 81, cost: 1500, first_cost: 1500, discount: 0 }],
        client: {
          id: 901,
          name: row.payload.fullname,
          phone: row.payload.phone,
        },
        attendance: 0,
        comment: row.payload.comment,
        deleted: row.cancelled,
      });
    }
    if (
      loseCreateResponse &&
      (route === '/api/v1/company/450001/clients/search' ||
        route.startsWith('/api/v1/records/450001'))
    )
      return new Response(
        JSON.stringify({
          success: false,
          error: 'synthetic reconciliation unavailable',
        }),
        { status: 503 },
      );
    assert.equal(init.method, 'GET');
    if (route === '/api/v1/book_times/450001/71/' + day)
      return reply([
        { time: creates ? '18:00' : '17:00', seance_length: 1800 },
      ]);

    const data =
      route === '/api/v1/book_services/450001'
        ? {
            services: [
              {
                id: 81,
                title: 'Synthetic service',
                price_min: 1500,
                price_max: 1500,
                seance_length: 1800,
              },
            ],
          }
        : route === '/api/v1/service_categories/450001'
          ? []
          : [
                '/api/v1/company/450001/staff',
                '/api/v1/staff/450001',
                '/api/v1/book_staff/450001',
              ].includes(route)
            ? [
                {
                  id: 71,
                  name: 'Synthetic staff',
                  bookable: true,
                  fired: false,
                  hidden: false,
                },
              ]
            : route === '/api/v1/company/450001'
              ? {
                  id: 450001,
                  title: 'Synthetic salon',
                  timezone_name: 'Europe/Moscow',
                }
              : null;
    assert(data !== null, 'unexpected synthetic catalogue route');
    return new Response(
      JSON.stringify({
        success: true,
        data,
        meta: { total_count: Array.isArray(data) ? data.length : 1 },
      }),
      { status: 200 },
    );
  };
  ipcDirectory = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'mne-'));
  fs.chmodSync(ipcDirectory, 0o700);
  const nativeFetch = (raw, init) =>
    new URL(String(raw)).hostname === '127.0.0.1'
      ? originalFetch(raw, init)
      : channel.fetch(raw, init);
  const methodOwners = [
    ['ai-tools/ai-core.service.js', 'AiCoreService', ['chat']],
    [
      'ai-tools/ai-tool-runtime.service.js',
      'AiToolRuntimeService',
      ['listTools', 'execute', 'replayCompletedRead'],
    ],
    [
      'action-engine/action-engine.runtime.js',
      'ActionEngineRuntimeService',
      ['execute', 'executeWithReceipt'],
    ],
  ].flatMap(([file, name, methods]) => {
    const owner = app.get(load(file)[name]);
    return methods.map((method) => ({
      owner,
      method,
      original: owner[method],
    }));
  });
  runtime = await installNativeExecution({
    app,
    backend,
    installed,
    stateDirectory: state,
    operatorUid: process.getuid(),
    nativeFetch,
  });
  channel = await openNativeChannel({
    directory: ipcDirectory,
    operatorUid: process.getuid(),
    assertCurrent: () => runtime.checkCurrent(),
  });
  forwarding = (async () => {
    while (!forwardingStopped)
      await forwardNativeOnce({
        socket: channel.socket,
        nativeFetch: externalFetch,
      });
  })().catch((e) => {
    if (!forwardingStopped) {
      result.forwardingFailure = e.message;
      void runtime?.close();
    }
  });
  for (const item of methodOwners)
    assert.equal(item.owner[item.method], item.original);
  checks.push('chat_tools_action_engine_methods_unchanged');
  globalThis.fetch = async (raw, init) => {
    if (String(raw).includes('api.deepseek.com')) {
      try {
        assertNativeModelPayload(init, {
          inputNanoUsdPerToken: pricing.inputNanoUsdPerToken,
          outputNanoUsdPerToken: pricing.outputNanoUsdPerToken,
        });
      } catch (e) {
        result.syntheticPayloadRefusal = e.message;
      }
    }
    return runtime.fetch(raw, init);
  };
  const chat = await call(
    '/api/ai/chat',
    {
      surface: 'web',
      audience: 'client',
      requestId: 'synthetic_native_' + randomUUID().replaceAll('-', ''),
      messages: [{ role: 'user', content: 'Привет' }],
    },
    userToken,
  );
  result.modelCalls = modelCalls;
  result.runtimeSnapshot = runtime.snapshot();
  result.chatStatus = chat.status;
  result.syntheticChatBody = chat.body;
  save();
  assert.equal(chat.status, 201);
  assert(modelCalls > 0);
  assert(JSON.stringify(chat.body).includes('Привет! Я рядом.'));
  assert.equal(providerCalls, 0);
  checks.push('ordinary_compiled_HTTP_chat_model_without_method_patches');
  await p.tenant.update({
    where: { id: tenant.id },
    data: { calendarSource: 'external' },
  });
  const catalog = await call(
    '/api/ai/tools/catalog.services.read/execute',
    { arguments: {}, surface: 'web' },
    userToken,
  );
  result.catalogStatus = catalog.status;
  result.syntheticCatalogBody = catalog.body;
  save();
  assert.equal(catalog.status, 201);
  assert(providerCalls > 0);
  assert(JSON.stringify(catalog.body).includes('Synthetic service'));
  checks.push('ordinary_compiled_catalog_native_adapter_private_channel');
  const {
    observe,
    submit,
    firstOption,
    firstSlot,
  } = require('./release-booking-flow.ts');
  const http = {
    resolveWidgets: (t, b) => call('/api/widgets/resolve', b, t),
    postIntent: (t, b) => call('/api/widgets/intent', b, t),
  };
  bookingMode = true;
  const bookingChat = await call(
    '/api/ai/chat',
    {
      surface: 'web',
      audience: 'client',
      requestId: 'native_booking_' + randomUUID().replaceAll('-', ''),
      messages: [{ role: 'user', content: 'Хочу записаться' }],
    },
    userToken,
  );
  result.syntheticBookingChat = bookingChat;
  save();
  assert.equal(bookingChat.status, 201, JSON.stringify(bookingChat.body));
  let envelope = bookingChat.body.resolution.receipt.envelope;
  assert.equal(envelope.kind, 'SERVICE_SELECTOR');
  await observe(http, userToken, envelope);

  const chosen = await submit(
    http,
    userToken,
    envelope,
    'REFINE',
    firstOption(envelope),
  );
  assert.equal(chosen.receipt_outcome, 'ACCEPTED', JSON.stringify(chosen));
  const staff = chosen.next_envelope;
  assert.equal(staff.kind, 'STAFF_SELECTOR');
  await observe(http, userToken, staff);
  const staffResult = await submit(
    http,
    userToken,
    staff,
    'REFINE',
    firstOption(staff),
  );
  assert.equal(staffResult.receipt_outcome, 'ACCEPTED');
  const availability = await call(
    '/api/ai/tools/booking.availability.read/execute',
    {
      surface: 'web',
      arguments: {
        branch_id: branch.id,
        date: day,
        staff_id: '71',
        service_ids: ['81'],
      },
    },
    userToken,
  );
  assert.equal(availability.status, 201, JSON.stringify(availability.body));
  const slots = availability.body.resolution.receipt.envelope;
  assert.equal(slots.kind, 'TIME_SLOT_SELECTOR');
  try {
    const quote = await authenticated(() =>
      app
        .get(
          load('appointments/client-appointment-create.service.js')
            .ClientAppointmentCreateService,
        )
        .quoteForAccount(tenant.id, user.id, {
          branchId: branch.id,
          staffId: '71',
          serviceIds: ['81'],
          start: day + 'T17:00:00+03:00',
        }),
    );
    result.syntheticQuote = { status: 'passed', timezone: quote.timezone };
  } catch (e) {
    result.syntheticQuote = {
      status: 'failed',
      name: e.name,
      message: e.message,
      stack: e.stack,
    };
    save();
    throw e;
  }
  const draft = await submit(
    http,
    userToken,
    slots,
    'DRAFT',
    firstSlot(slots).slot_ref,
  );
  assert.equal(draft.receipt_outcome, 'ACCEPTED', JSON.stringify(draft));
  const confirmation = draft.next_envelope;
  assert.equal(confirmation.kind, 'BOOKING_CONFIRMATION');
  assert.equal(creates, 0);
  const committed = await submit(http, userToken, confirmation, 'COMMIT');
  assert.equal(
    committed.receipt_outcome,
    'ACCEPTED',
    JSON.stringify(committed),
  );
  assert.equal(creates, 1);
  if (loseCreateResponse) {
    assert.equal(committed.owner_decision.state, 'UNKNOWN');
    const repeats = [
      await submit(http, userToken, confirmation, 'COMMIT'),
      ...(await Promise.all(
        Array.from({ length: 4 }, () =>
          submit(http, userToken, confirmation, 'COMMIT'),
        ),
      )),
    ];
    for (const response of [committed, ...repeats])
      assert(!JSON.stringify(response).includes('Запись подтверждена.'));
    assert.equal(creates, 1);
    const rows = await p.actionExecution.findMany({
      where: { tenantId: tenant.id, capability: 'crm.appointment.create.v1' },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'UNKNOWN');
    assert.equal(rows[0].executionAttemptCount, 1);
    assert.equal(
      await p.appointment.count({ where: { tenantId: tenant.id } }),
      0,
    );
    assert.equal(
      (await providerQuery('SELECT * FROM native_execution_provider')).rows
        .length,
      1,
    );
    checks.push(
      'durable_synthetic_provider_commit_lost_response_UNKNOWN_no_success_no_duplicate_pending_reconciliation',
    );
  } else {
    const appointment = await p.appointment.findFirstOrThrow({
      where: { tenantId: tenant.id, source: 'external' },
    });
    assert.equal(appointment.mayaClientId, client.id);
    const mutation = async (operation, key, body = {}) => {
      const response = await originalFetch(
        origin + '/api/appointments/' + appointment.id + '/' + operation,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + userToken,
            'Idempotency-Key': key,
            'x-maya-authority-context': 'personal_client',
          },
          body: JSON.stringify(body),
        },
      );
      return { status: response.status, body: await response.json() };
    };
    const moveKey = randomUUID(),
      cancelKey = randomUUID(),
      move = () =>
        mutation('reschedule', moveKey, { start: day + 'T15:00:00.000Z' }),
      cancel = () => mutation('cancel', cancelKey);
    const moved = await move();
    assert.equal(moved.status, 201, JSON.stringify(moved.body));
    await move();
    await Promise.all(Array.from({ length: 4 }, move));
    assert.equal(moves, 1);
    const cancelled = await cancel();
    assert.equal(cancelled.status, 201, JSON.stringify(cancelled.body));
    await cancel();
    await Promise.all(Array.from({ length: 4 }, cancel));
    assert.equal(cancels, 1);
    const persisted = (
      await providerQuery('SELECT * FROM native_execution_provider')
    ).rows;
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].cancelled, true);
    for (const operation of ['create', 'reschedule', 'cancel']) {
      const rows = await p.actionExecution.findMany({
        where: {
          tenantId: tenant.id,
          capability: 'crm.appointment.' + operation + '.v1',
        },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].state, 'SUCCEEDED');
      assert.equal(rows[0].executionAttemptCount, 1);
    }
    checks.push(
      'ordinary_confirmation_action_engine_private_network_create_move_cancel_exactly_once',
    );
  }
  result.syntheticBusinessEffects = { creates, moves, cancels };
  const beforeRevocation = { modelCalls, providerCalls };
  revokeNativeRun(state, a.runId, process.getuid());
  await assert.rejects(runtime.checkCurrent());
  await assert.rejects(
    runtime.fetch('https://api.yclients.com/api/v1/company/450001', {
      method: 'GET',
    }),
  );
  assert.deepEqual({ modelCalls, providerCalls }, beforeRevocation);
  checks.push(
    'persistent_run_revocation_closes_current_dispatch_without_business_cancel',
  );
  result.providerReads = providerCalls - creates - moves - cancels;

  result.modelCalls = modelCalls;
  result.runtimeSnapshot = runtime.snapshot();
  globalThis.fetch = originalFetch;
  forwardingStopped = true;
  await forwarding;
  await channel.close();
  channel = null;
  assert.equal(result.forwardingFailure, undefined);
  checks.push('private_pull_only_forwarder_current_admission');
  await runtime.close();
  runtime = null;
  await assert.rejects(
    installNativeExecution({
      app,
      backend,
      installed,
      stateDirectory: state,
      operatorUid: process.getuid(),
      nativeFetch,
    }),
  );
  checks.push('runtime_restart_cannot_reuse_consumed_run');
  // Sensitive-looking synthetic session/signatures are not evidence; remove only
  // files this disposable proof created. Production or owner keys never exist here.
  fs.rmSync(installedDir, { recursive: true });
  result.status = 'passed';
} catch (e) {
  result.status = 'failed';
  result.failure = { name: e.name, message: e.message, stack: e.stack };
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  forwardingStopped = true;
  await channel?.close();
  await forwarding?.catch(() => {});
  await runtime?.close();
  await app?.close();
  if (ipcDirectory) fs.rmSync(ipcDirectory, { recursive: true, force: true });
  result.applicationStopped = true;
  save();
}
