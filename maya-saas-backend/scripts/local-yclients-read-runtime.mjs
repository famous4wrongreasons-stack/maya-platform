// Ordinary AppModule and existing A17 owners; native provider GETs only inside
// explicit authenticated setup actions. No synthetic source or credential store.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPrivateCwd, localBrowserBoundary } from './local-onboarding-profile.mjs';
import { assertRealReadEnvironment, realReadIngress, companyId } from './local-yclients-read-profile.mjs';
import { createReadTransport } from './local-yclients-read-transport.mjs';

const require = createRequire(import.meta.url);
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function start() {
  assert.equal(process.connected, true, 'Use the bounded local YCLIENTS read launcher');
  assertRealReadEnvironment(process.env, true);
  assertPrivateCwd(process.cwd());
  assert.equal(process.cwd(), process.env.MAYA_LOCAL_ONBOARDING_STATE);
  let prisma;
  const originalFetch = globalThis.fetch;
  const guard = createReadTransport(originalFetch, async request => {
    if (request.originalUrl === '/api/integrations/crm/connect') return request.body?.settingsJson?.companyId;
    const integration = await prisma.crmIntegration.findUnique({ where: { tenantId: request.user.tenantId }, select: { provider: true, baseUrl: true, settingsJson: true } });
    assert.ok(integration?.provider === 'yclients' && !integration.baseUrl && companyId(integration.settingsJson?.companyId), 'Current YCLIENTS company required');
    return integration.settingsJson.companyId;
  });
  globalThis.fetch = guard.fetch;
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(backend, 'dist/src/app.module.js'));
  const { configureHttpApp } = require(path.join(backend, 'dist/src/bootstrap/configure-http-app.js'));
  const { PrismaService } = require(path.join(backend, 'dist/src/prisma/prisma.service.js'));
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false, abortOnError: false });
  prisma = app.get(PrismaService);
  let closing;
  const stop = () => closing ??= (async () => {
    try { await app.close(); } finally {
      await prisma.$disconnect();
      delete process.env.YCLIENTS_PARTNER_TOKEN;
      process.send?.({ type: 'read-summary', contract: 'maya.local-yclients-read/1', calls: guard.counters.calls, refused: guard.counters.refused, routes: guard.counters.routes });
    }
  })();
  const terminate = () => { void stop().finally(() => { if (process.connected) process.disconnect(); }); };
  process.once('SIGINT', terminate); process.once('SIGTERM', terminate); process.once('disconnect', terminate);
  try {
    configureHttpApp(app);
    app.disable('x-powered-by'); app.set('trust proxy', 'loopback');
    const origin = process.env.CORS_ALLOWED_ORIGINS;
    app.use((request, response, next) => {
      const reason = localBrowserBoundary(request.headers, origin, `127.0.0.1:${process.env.PORT}`) ? realReadIngress(request.method, request.originalUrl, request.headers, request.body, origin) : 'local_onboarding_origin_refused';
      if (reason) { response.status(403).json({ error: { code: reason }, message: 'Этот локальный профиль допускает только регистрацию, вход и явно подтверждённое подключение YCLIENTS.' }); return; }
      guard.run(request, response, next);
    });
    app.enableCors({ origin, credentials: false, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], exposedHeaders: ['Retry-After'] });
    await app.listen(Number(process.env.PORT), '127.0.0.1');
    if (closing) { await closing; return; }
    assert.equal(guard.counters.calls, 0, 'Startup must make no external provider request');
    process.send({ type: 'ready', contract: 'maya.local-yclients-read/1', origin: `http://127.0.0.1:${process.env.PORT}`, providerAdmission: 'explicit_setup_reads_only' });
  } catch { await stop(); throw new Error('Local YCLIENTS read bootstrap failed'); }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  start().catch(() => { console.error('Local YCLIENTS read runtime stopped; no credential or provider body recorded'); process.exitCode = 1; if (process.connected) process.disconnect(); });
