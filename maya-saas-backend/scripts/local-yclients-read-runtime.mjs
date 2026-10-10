// Ordinary AppModule and existing A17 owners. Diagnostics contain only closed
// stage/code enums, never provider input, error text or credential metadata.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPrivateCwd, localBrowserBoundary } from './local-onboarding-profile.mjs';
import { assertRealReadEnvironment, realReadIngress, companyId } from './local-yclients-read-profile.mjs';
import { createReadTransport } from './local-yclients-read-transport.mjs';
import { runtimeStatus } from './local-yclients-read-status.mjs';
import { PUBLIC_DIAGNOSTIC_PARTNER } from './local-yclients-read-diagnostic.mjs';

const require = createRequire(import.meta.url);
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function start() {
  let app, prisma, guard, closing, stage = 'environment_validating', code = 'environment_refused';
  const send = message => { if (process.connected) process.send(message); };
  const enter = (nextStage, nextCode) => { stage = nextStage; code = nextCode; send(runtimeStatus(stage)); };
  const stop = () => closing ??= (async () => {
    send(runtimeStatus('runtime_stopping'));
    try { await app?.close(); await prisma?.$disconnect(); }
    catch (error) { send(runtimeStatus('runtime_stopping', 'failed', 'runtime_cleanup_failed', error)); throw new Error('Runtime cleanup failed'); }
    finally {
      delete process.env.YCLIENTS_PARTNER_TOKEN;
      if (guard) send({ type: 'read-summary', contract: 'maya.local-yclients-read/1', calls: guard.counters.calls, refused: guard.counters.refused, routes: guard.counters.routes });
    }
    send(runtimeStatus('runtime_stopping', 'completed'));
  })();
  try {
    enter('environment_validating', 'ipc_required');
    assert.equal(process.connected, true, 'Use the bounded local launcher');
    code = 'environment_refused';
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--diagnostic-no-provider'));
    const diagnostic = args.length === 1;
    assertRealReadEnvironment(process.env, true);
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN === PUBLIC_DIAGNOSTIC_PARTNER, diagnostic);
    code = 'private_state_refused';
    assertPrivateCwd(process.cwd());
    assert.equal(process.cwd(), process.env.MAYA_LOCAL_ONBOARDING_STATE);
    enter('network_guard_installing', 'network_guard_failed');
    const nativeFetch = diagnostic ? async () => { throw new Error('Diagnostic provider dispatch forbidden'); } : globalThis.fetch;
    guard = createReadTransport(nativeFetch, async request => {
      if (request.originalUrl === '/api/integrations/crm/connect') return request.body?.settingsJson?.companyId;
      const integration = await prisma.crmIntegration.findUnique({ where: { tenantId: request.user.tenantId }, select: { provider: true, baseUrl: true, settingsJson: true } });
      assert.ok(integration?.provider === 'yclients' && !integration.baseUrl && companyId(integration.settingsJson?.companyId), 'Current YCLIENTS company required');
      return integration.settingsJson.companyId;
    });
    globalThis.fetch = guard.fetch;
    enter('app_importing', 'app_import_failed');
    require('reflect-metadata');
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require(path.join(backend, 'dist/src/app.module.js'));
    const { configureHttpApp } = require(path.join(backend, 'dist/src/bootstrap/configure-http-app.js'));
    const { PrismaService } = require(path.join(backend, 'dist/src/prisma/prisma.service.js'));
    enter('app_creating', 'app_create_failed');
    app = await NestFactory.create(AppModule, { bodyParser: false, logger: false, abortOnError: false });
    prisma = app.get(PrismaService);
    const terminate = () => { void stop().catch(() => { process.exitCode = 1; }).finally(() => { if (process.connected) process.disconnect(); }); };
    process.once('SIGINT', terminate); process.once('SIGTERM', terminate); process.once('disconnect', terminate);
    enter('http_configuring', 'http_setup_failed');
    configureHttpApp(app);
    app.disable('x-powered-by'); app.set('trust proxy', 'loopback');
    const origin = process.env.CORS_ALLOWED_ORIGINS;
    app.use((request, response, next) => {
      const boundary = localBrowserBoundary(request.headers, origin, `127.0.0.1:${process.env.PORT}`);
      const diagnosticRoute = request.method === 'GET' && ['/api/health', '/api/health/ready'].includes(request.originalUrl);
      const reason = !boundary ? 'local_onboarding_origin_refused' : diagnostic ? (diagnosticRoute ? null : 'local_yclients_diagnostic_route_disabled') : realReadIngress(request.method, request.originalUrl, request.headers, request.body, origin);
      if (reason) { response.status(403).json({ error: { code: reason }, message: 'Этот локальный профиль допускает только явно разрешённые действия.' }); return; }
      guard.run(request, response, next);
    });
    app.enableCors({ origin, credentials: false, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], exposedHeaders: ['Retry-After'] });
    enter('backend_listening', 'listen_failed');
    await app.listen(Number(process.env.PORT), '127.0.0.1');
    if (closing) { await closing; return; }
    code = 'startup_provider_attempt';
    assert.equal(guard.counters.calls, 0, 'Startup provider dispatch forbidden');
    assert.equal(guard.counters.refused, 0, 'Startup provider attempt forbidden');
    send(runtimeStatus('runtime_ready', 'completed'));
    send({ type: 'ready', contract: 'maya.local-yclients-read/1', origin: `http://127.0.0.1:${process.env.PORT}`, providerAdmission: diagnostic ? 'diagnostic_network_closed' : 'explicit_setup_reads_only' });
  } catch (error) {
    send(runtimeStatus(stage, 'failed', code, error));
    await stop().catch(() => {});
    throw new Error('Local YCLIENTS read runtime failed; see closed service code');
  }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  start().catch(() => { console.error('Local YCLIENTS read runtime stopped; see service stage/code'); process.exitCode = 1; if (process.connected) process.disconnect(); });
