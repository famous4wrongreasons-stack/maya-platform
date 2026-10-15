// Actual compiled AppModule + fresh PostgreSQL + private HTTP relay. All issuer
// keys, users and CRM rows are synthetic. Native network is loopback only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  createSign,
} from 'node:crypto';
import { sessionPlan, stage } from './local-onboarding.mjs';
import {
  PRIVATE_KEYS,
  profileEnvironment,
  migrationConfigSource,
} from './local-onboarding-profile.mjs';
import { installPhoneTelegram } from './phone-telegram-runtime.mjs';
import { phoneTelegramEgress } from './phone-telegram-egress.mjs';
import { installPhoneAi } from './phone-ai-runtime.mjs';
import {
  validatePhoneTelegramScope,
  PHONE_TELEGRAM_ORIGIN as origin,
  PHONE_TELEGRAM_CLIENT_ID as clientId,
} from './phone-telegram-scope.mjs';
const backend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  ),
  require = createRequire(import.meta.url),
  out = process.argv[2];
assert.ok(out && path.isAbsolute(out) && !fs.existsSync(out));
fs.mkdirSync(out, { mode: 0o700 });
const state = fs.mkdtempSync('/private/tmp/maya-phone-telegram-proof-');
fs.chmodSync(state, 0o700);
async function port() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const pgPort = await port(),
  apiPort = await port(),
  webPort = await port(),
  password = randomBytes(32).toString('hex'),
  database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
const keys = Object.fromEntries(
  PRIVATE_KEYS.map((k) => [k, randomBytes(32).toString('hex')]),
);
const opts = {
  databaseUrl: `postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`,
  keys,
  apiPort,
  origin,
  stateDirectory: state,
};
const env = profileEnvironment(process.env, {
    ...opts,
    origin: `http://127.0.0.1:${webPort}`,
  }),
  plan = sessionPlan({
    stateDirectory: state,
    pgBin: '/opt/homebrew/opt/postgresql@16/bin',
    database,
    pgPort,
    apiPort,
    webPort,
  }),
  control = { cancelled: null, terminate: null };
for (const [name, value] of Object.entries({
  'pg-password': password + '\n',
  pgpass: `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`,
  'prisma.config.mjs': migrationConfigSource(backend),
}))
  fs.writeFileSync(state + '/' + name, value, { mode: 0o600, flag: 'wx' });
const report = {
  status: 'RUNNING',
  qualification: 'SYNTHETIC_COMPILED_HTTP_PG_PRIVATE_RELAY_NOT_LIVE_ACCEPTANCE',
  checks: [],
  realProviderCalls: 0,
};
const save = () =>
  fs.writeFileSync(
    out + '/RESULT.json',
    JSON.stringify(report, null, 2) + '\n',
  );
let started = false,
  prisma,
  app,
  installed,
  ai,
  relay;
const nativeFetch = globalThis.fetch,
  oldCwd = process.cwd();
try {
  for (const step of plan.setup) {
    if (step.name === 'react-build') continue;
    if (step.name === 'pg-start') started = true;
    report.phase = step.name;
    save();
    await stage(step, env, state, control);
  }
  process.chdir(state);
  for (const key of Object.keys(process.env))
    if (
      /DATABASE|TOKEN|SECRET|KEY|YCLIENTS|OPENAI|DEEPSEEK|SCHEDULER/.test(key)
    )
      delete process.env[key];
  Object.assign(process.env, env, {
    YCLIENTS_BASE_URL: 'http://catalog-egress:8080/api/v1',
    YCLIENTS_PARTNER_TOKEN: 'SYNTHETIC_PARTNER_NOT_REAL',
    CORS_ALLOWED_ORIGINS: origin,
    PWA_PUBLIC_APP_URL: origin + '/',
  });
  const { PrismaClient } = require('@prisma/client'),
    { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: opts.databaseUrl }),
  });
  async function principal(slug) {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Synthetic Telegram staging',
        slug,
        status: 'trial',
        trialFullAccess: true,
        trialEndsAt: new Date(Date.now() + 3600000),
        calendarSource: 'external',
        allowSelfRegistration: true,
      },
    });
    const email = randomUUID() + '@example.invalid',
      pw = 'Synthetic-only-42!';
    const owner = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await require('bcrypt').hash(pw, 10),
        role: 'tenant_owner',
        status: 'active',
      },
    });
    await prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        role: 'tenant_owner',
        status: 'active',
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic',
        timezone: 'Europe/Moscow',
      },
    });
    return { tenant, owner, branch, email, pw };
  }
  const own = await principal('malestheticstavropol'),
    foreign = await principal('synthetic-other'),
    now = Date.now(),
    pin = 'a'.repeat(64);
  const scope = {
    contract: 'maya.phone-owner-telegram/1',
    approvalRef: 'owner-20261015-phone-telegram-30m-3logins',
    candidate: '7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3',
    tenantId: own.tenant.id,
    userId: own.owner.id,
    branchId: own.branch.id,
    tenantSlug: own.tenant.slug,
    companyId: '503759',
    notBefore: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 1200000).toISOString(),
  };
  require('reflect-metadata');
  const load = (f) => require(path.join(backend, 'dist/src', f)),
    { NestFactory } = require('@nestjs/core');
  const { EncryptionService } = load('encryption/encryption.service.js');
  const encryption = new EncryptionService({ get: (key) => keys[key] });
  await prisma.crmIntegration.create({
    data: {
      tenantId: own.tenant.id,
      provider: 'yclients',
      status: 'active',
      verifiedAt: new Date(),
      encryptedApiToken: encryption.encrypt('SYNTHETIC_USER_NOT_REAL'),
      settingsJson: {
        companyId: 503759,
        branchBinding: {
          contract: 'maya.crm-branch-binding/1',
          companyId: 503759,
          branchId: own.branch.id,
        },
        acceptedImportSnapshotHash: 'b'.repeat(64),
      },
    },
  });
  globalThis.fetch = async () => {
    throw Error('Unlisted external network forbidden');
  };
  app = await NestFactory.create(load('app.module.js').AppModule, {
    bodyParser: false,
    logger: false,
    abortOnError: false,
  });
  let alive = true,
    issuedSub = 'synthetic-owner',
    forged = false;
  const wireCalls = [];
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }),
    otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  relay = phoneTelegramEgress({
    scope,
    pin,
    secret: 'SYNTHETIC_TELEGRAM_NOT_REAL',
    assertCurrent() {
      assert.ok(alive);
    },
    nativeFetch: async (url, init) => {
      wireCalls.push(url);
      if (url.endsWith('/token')) {
        assert.equal(new URLSearchParams(init.body).get('client_id'), clientId);
        const current = Math.floor(Date.now() / 1000),
          claims = {
            iss: 'https://oauth.telegram.org',
            aud: clientId,
            sub: issuedSub,
            phone_number: '12025550123',
            phone_number_verified: true,
            iat: current,
            exp: current + 600,
          };
        const data =
          Buffer.from(
            JSON.stringify({ alg: 'RS256', kid: 'synthetic-tg' }),
          ).toString('base64url') +
          '.' +
          Buffer.from(JSON.stringify(claims)).toString('base64url');
        const id_token =
          data +
          '.' +
          createSign('RSA-SHA256')
            .update(data)
            .end()
            .sign((forged ? otherPair : pair).privateKey)
            .toString('base64url');
        return Response.json({ id_token });
      }
      if (url.endsWith('/jwks.json'))
        return Response.json({
          keys: [
            {
              ...pair.publicKey.export({ format: 'jwk' }),
              kid: 'synthetic-tg',
            },
          ],
        });
      assert.equal(
        url,
        'https://api.yclients.com/api/v1/company/503759/clients/search',
      );
      return Response.json({
        data: [
          {
            id: 7654321,
            name: 'Synthetic personal client',
            phone: '+12025550123',
            visits_count: 2,
            sold_amount: 0,
            last_visit_date: null,
          },
        ],
      });
    },
  });
  await new Promise((r) => relay.server.listen(0, '127.0.0.1', r));
  let unrelatedCalls = 0;
  ai = await installPhoneAi({
    app,
    require,
    backend,
    scope,
    assertCurrent() {},
    nativeFetch: async () => {
      unrelatedCalls++;
      return Response.json({ unchanged: true });
    },
    relayFetch: async () => {
      throw Error('Model use not part of Telegram proof');
    },
  });
  installed = await installPhoneTelegram({
    app,
    require,
    backend,
    scope,
    assertCurrent() {
      assert.ok(alive);
      validatePhoneTelegramScope(scope);
    },
    nativeFetch: ai.fetch,
    relay: (route, body, options = {}) =>
      nativeFetch(`http://127.0.0.1:${relay.server.address().port}/${route}`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: options.signal,
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-maya-scope': pin,
          'x-maya-tenant': scope.tenantId,
          'x-maya-user': scope.userId,
          ...(route === 'client_registry'
            ? {
                'x-maya-crm-authorization': new Headers(options.headers).get(
                  'authorization',
                ),
              }
            : {}),
        },
      }),
  });
  globalThis.fetch = installed.fetch;
  app.use((req, res, next) => installed.runRequest(req, res, next));
  load('bootstrap/configure-http-app.js').configureHttpApp(app);
  await app.listen(apiPort, '127.0.0.1');
  const request = require('supertest');
  const post = (route, body, bearer) => {
    const r = request(app.getHttpServer())
      .post('/api/' + route)
      .send(body);
    if (bearer) r.set('Authorization', 'Bearer ' + bearer);
    return r;
  };
  const get = (route, bearer, context) => {
    const r = request(app.getHttpServer()).get('/api/' + route);
    if (bearer) r.set('Authorization', 'Bearer ' + bearer);
    if (context) r.set('x-maya-authority-context', context);
    return r;
  };
  const login = async (p) => {
    const r = await post('auth/login', {
      tenantSlug: p.tenant.slug,
      email: p.email,
      password: p.pw,
    });
    assert.equal(r.status, 201);
    return r.body.access_token;
  };
  const token = await login(own),
    other = await login(foreign);
  report.checks.push('ordinary-password-sessions-remain-canonical');
  const dto = { platform: 'web', redirectUri: origin + '/oauth-callback.html' };
  assert.equal((await post('auth/oauth/telegram/link/start', dto)).status, 401);
  assert.equal(
    (await post('auth/oauth/telegram/link/start', dto, other)).status,
    403,
  );
  assert.equal(
    (
      await post('auth/oauth/telegram/start', {
        ...dto,
        tenantSlug: own.tenant.slug,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        'auth/oauth/telegram/link/start',
        { ...dto, redirectUri: 'https://evil.invalid/callback' },
        token,
      )
    ).status,
    403,
  );
  report.checks.push(
    'missing-foreign-owner-unknown-login-wrong-redirect-refused',
  );
  assert.equal(
    (
      await get(
        'personal-client/appointments/results',
        token,
        'personal_client',
      )
    ).status,
    403,
  );
  const startedLink = await post('auth/oauth/telegram/link/start', dto, token);
  assert.equal(startedLink.status, 201, JSON.stringify(startedLink.body));
  const linkBody = { state: startedLink.body.state, code: 'synthetic-code' };
  const linked = await post(
    'auth/oauth/telegram/link/complete',
    linkBody,
    token,
  );
  assert.equal(linked.status, 201, JSON.stringify(linked.body));
  assert.equal(linked.body.linked, true);
  assert.equal(await prisma.client.count(), 0);
  assert.equal(await prisma.clientChannelLink.count(), 0);
  assert.equal(
    await prisma.authIdentity.count({ where: { provider: 'telegram' } }),
    1,
  );
  assert.equal(
    (await post('auth/oauth/telegram/link/complete', linkBody, token)).status,
    403,
  );
  report.checks.push(
    'actual-signed-A23-link-only-no-client-and-replay-refused',
  );
  const start = () =>
    post('auth/oauth/telegram/start', { ...dto, tenantSlug: own.tenant.slug });
  // Reject a forged signature through the real verifier before registry reads.
  forged = true;
  const bad = await start();
  assert.equal(bad.status, 201);
  const badComplete = await post('auth/oauth/telegram/complete', {
    state: bad.body.state,
    code: 'synthetic-code',
  });
  assert.ok(badComplete.status >= 400);
  assert.equal(wireCalls.filter((u) => u.endsWith('/search')).length, 0);
  assert.equal(await prisma.client.count(), 0);
  forged = false;
  report.checks.push('real-verifier-rejects-forgery-before-CRM');
  // Another Telegram subject cannot gain the selected owner account.
  issuedSub = 'synthetic-unlinked-other';
  const substituted = await start();
  assert.equal(substituted.status, 201);
  assert.equal(
    (
      await post('auth/oauth/telegram/complete', {
        state: substituted.body.state,
        code: 'synthetic-code',
      })
    ).status,
    403,
  );
  issuedSub = 'synthetic-owner';
  assert.equal(wireCalls.filter((u) => u.endsWith('/search')).length, 0);
  report.checks.push('foreign-Telegram-subject-refused-before-CRM');
  const good = await start();
  assert.equal(good.status, 201);
  const result = await post('auth/oauth/telegram/complete', {
    state: good.body.state,
    code: 'synthetic-code',
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.user.id, own.owner.id);
  assert.equal(result.body.user.role, 'tenant_owner');
  assert.equal(
    result.body.client_binding.status,
    'linked',
    JSON.stringify(result.body.client_binding),
  );
  assert.equal(await prisma.client.count(), 1);
  assert.equal(await prisma.clientChannelLink.count(), 1);
  assert.equal(
    await prisma.user.count({ where: { tenantId: own.tenant.id } }),
    1,
  );
  assert.equal(
    (
      await get(
        'personal-client/appointments/results',
        token,
        'personal_client',
      )
    ).status,
    200,
  );
  assert.equal(
    (await get('personal-client/appointments/results', token, 'tenant_owner'))
      .status,
    403,
  );
  assert.equal(
    (
      await get(
        'personal-client/appointments/results',
        other,
        'personal_client',
      )
    ).status,
    403,
  );
  report.checks.push(
    'fresh-signed-login-real-registry-adapter-unique-initial-binding-original-session-reread',
  );
  assert.equal((await start()).status, 403);
  assert.equal(
    (await post('auth/oauth/telegram/link/start', dto, token)).status,
    403,
  );
  report.checks.push('fourth-login-and-second-link-refused');
  const finder = await get('mobile/pwa/search?q=' + own.tenant.slug);
  assert.equal(finder.status, 200);
  assert.equal(finder.body.items.length, 1);
  for (const route of [
    'mobile/pwa/search?q=foreign',
    'mobile/pwa/' + own.tenant.slug + '/install',
    'mobile/pwa/' + own.tenant.slug + '/manifest.webmanifest',
  ])
    assert.equal((await get(route)).status, 403);
  report.checks.push('exact-finder-only-no-directory-or-install');
  assert.equal(
    (
      await (
        await installed.fetch(
          'http://catalog-egress:8080/api/v1/services/503759',
        )
      ).json()
    ).unchanged,
    true,
  );
  assert.equal(unrelatedCalls, 1);
  report.checks.push('catalogue-pass-through-unchanged');
  const engine = app.get(
    load('action-engine/action-engine.runtime.js').ActionEngineRuntimeService,
  );
  assert.throws(() => engine.execute({}), /Forbidden/);
  assert.equal(await prisma.appointment.count(), 0);
  assert.equal(await prisma.tenantEntitlement.count(), 0);
  report.checks.push(
    'action-engine-refusal-and-no-booking-entitlement-effects',
  );
  alive = false;
  assert.equal(
    (await get('mobile/pwa/search?q=' + own.tenant.slug)).status,
    403,
  );
  installed.stop();
  assert.equal((await get('health')).status, 200);
  assert.ok(await login(own));
  report.checks.push(
    'withdrawal-stops-Telegram-without-breaking-health-or-password',
  );
  report.wireCalls = wireCalls.length;
  report.relay = relay.snapshot();
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = String(error.message).slice(0, 3000);
  process.exitCode = 1;
} finally {
  installed?.stop();
  ai?.stop();
  await app?.close().catch(() => {});
  await prisma?.$disconnect();
  globalThis.fetch = nativeFetch;
  if (relay) {
    relay.revoke();
    relay.server.closeAllConnections();
    await new Promise((r) => relay.server.close(r));
  }
  if (started) {
    await stage(plan.stop, env, state, control);
    report.proofDatabaseStopped = !fs.existsSync(
      plan.cluster + '/postmaster.pid',
    );
  }
  process.chdir(oldCwd);
  save();
  console.log(JSON.stringify(report));
}
