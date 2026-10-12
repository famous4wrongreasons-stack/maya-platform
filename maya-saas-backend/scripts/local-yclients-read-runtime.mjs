import { OWNER_HISTORY_REVIEW_PROFILE, OWNER_HISTORY_REVIEW_ADMISSION, historyReviewIngress } from './local-owner-history-review-policy.mjs';
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
import { runtimeStatus, createReadTrace, traceHttpRequest } from './local-yclients-read-status.mjs';
import { PUBLIC_DIAGNOSTIC_PARTNER } from './local-yclients-read-diagnostic.mjs';
import { ownerChatIngress } from './local-owner-chat-policy.mjs';
import { installOwnerChat } from './local-owner-chat-runtime.mjs';
import { readOwnerChatLaunch } from './local-owner-chat-launch.mjs';
import { readOwnerTelegramLaunch } from './local-owner-telegram-launch.mjs';
import { ownerTelegramIngress, OWNER_TELEGRAM_ADMISSION } from './local-owner-telegram-policy.mjs';
import { installOwnerTelegram } from './local-owner-telegram-runtime.mjs';
import { readSourceBinding } from './local-yclients-read.mjs';

import { readOwnerHistoryLaunch } from './local-owner-history-launch.mjs';
import { ownerHistoryIngress, OWNER_HISTORY_ADMISSION } from './local-owner-history-policy.mjs';
import { installOwnerHistory } from './local-owner-history-runtime.mjs';

const require = createRequire(import.meta.url);
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function start() {
  let app, prisma, guard, ownerChat, ownerTelegram, ownerHistory, closing, stage = 'environment_validating', code = 'environment_refused';
  const send = message => { if (process.connected) process.send(message); };
  const trace = createReadTrace(send);
  const enter = (nextStage, nextCode) => { stage = nextStage; code = nextCode; send(runtimeStatus(stage)); };
  const stop = () => closing ??= (async () => {
    send(runtimeStatus('runtime_stopping'));
    ownerChat?.stop();
    ownerTelegram?.stop();
    ownerHistory?.stop();
    try { await app?.close(); await prisma?.$disconnect(); }
    catch (error) { send(runtimeStatus('runtime_stopping', 'failed', 'runtime_cleanup_failed', error)); throw new Error('Runtime cleanup failed'); }
    finally {
      delete process.env.YCLIENTS_PARTNER_TOKEN;
      delete process.env.TELEGRAM_CLIENT_SECRET;
      if (guard) send({ type: 'read-summary', contract: 'maya.local-yclients-read/1', calls: guard.counters.calls, refused: guard.counters.refused, routes: guard.counters.routes });
    }
    send(runtimeStatus('runtime_stopping', 'completed'));
  })();
  try {
    enter('environment_validating', 'ipc_required');
    assert.equal(process.connected, true, 'Use the bounded local launcher');
    code = 'environment_refused';
    const args = process.argv.slice(2);
    const ownerChatRequested = args.length === 3 && args[0] === '--owner-chat-plan';
    const ownerHistoryRequested = args.length === 4 && args[0] === '--owner-history-plan';
    const ownerTelegramRequested = args.length === 4 && args[0] === '--owner-telegram-plan';
    assert.ok(args.length === 0 || ownerChatRequested || ownerTelegramRequested || ownerHistoryRequested || (args.length === 1 && args[0] === '--diagnostic-no-provider'));
    const diagnostic = args.length === 1;
    const chatLaunch = ownerChatRequested ? readOwnerChatLaunch(args[1], args[2]) : null;
    const telegramLaunch = ownerTelegramRequested ? readOwnerTelegramLaunch(args[1], args[2], args[3], readSourceBinding, 'child') : null;
    const historyLaunch = ownerHistoryRequested ? readOwnerHistoryLaunch(args[1], args[2], args[3], readSourceBinding, 'child') : null;
    const checkedEnv = { ...process.env };
    if (telegramLaunch) {
      assert.ok(typeof checkedEnv.TELEGRAM_CLIENT_SECRET === 'string' && /^[\x21-\x7e]{16,4096}$/.test(checkedEnv.TELEGRAM_CLIENT_SECRET), 'local_telegram_secret_required');
      delete checkedEnv.TELEGRAM_CLIENT_SECRET;
    }
    assertRealReadEnvironment(checkedEnv, true);
    const allowUserAuth = process.env.MAYA_LOCAL_YCLIENTS_USER_AUTH === 'owner_login_v1';
    assert.ok(!diagnostic || !allowUserAuth);
    assert.ok(!(telegramLaunch || historyLaunch) || !allowUserAuth);
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN === PUBLIC_DIAGNOSTIC_PARTNER, diagnostic);
    code = 'private_state_refused';
    assertPrivateCwd(process.cwd());
    assert.equal(process.cwd(), process.env.MAYA_LOCAL_ONBOARDING_STATE);
    if (chatLaunch) assert.equal(chatLaunch.manifest.ownerScope.stateDirectory, process.cwd(), 'owner_chat_wrong_database');
    if (telegramLaunch) assert.ok(telegramLaunch.plan.scope.stateDirectory === process.cwd()
      && telegramLaunch.plan.origin === process.env.CORS_ALLOWED_ORIGINS, 'local_telegram_wrong_database');
    if (historyLaunch) assert.ok(historyLaunch.plan.scope.stateDirectory === process.cwd()
      && historyLaunch.plan.origin === process.env.CORS_ALLOWED_ORIGINS, 'local_history_wrong_database');
    enter('network_guard_installing', 'network_guard_failed');
    const nativeFetch = diagnostic ? async () => { throw new Error('Diagnostic provider dispatch forbidden'); } : globalThis.fetch;
    guard = createReadTransport(nativeFetch, async request => {
      if (request.originalUrl === '/api/integrations/crm/connect') return request.body?.settingsJson?.companyId;
      const integration = await prisma.crmIntegration.findUnique({ where: { tenantId: request.user.tenantId }, select: { provider: true, baseUrl: true, settingsJson: true } });
      assert.ok(integration?.provider === 'yclients' && !integration.baseUrl && companyId(integration.settingsJson?.companyId), 'Current YCLIENTS company required');
      return integration.settingsJson.companyId;
    }, Date.now, trace, { allowUserAuth, allowOwnerChat: chatLaunch ? request => ownerChat?.allowProvider(request) : null });
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
    const historyReview = chatLaunch?.manifest.profile === OWNER_HISTORY_REVIEW_PROFILE;
    if (historyReview) {
      ownerHistory = await installOwnerHistory({ app, prisma, require, backend,
        launch: { plan: { scope: chatLaunch.manifest.ownerScope }, assertCurrent: chatLaunch.assertCurrent },
        nativeFetch, readExistingOnly: true });
      guard = { counters: ownerHistory.counters, run: ownerHistory.runRequest, fetch: ownerHistory.fetch };
    }
    if (chatLaunch) {
      ownerChat = await installOwnerChat({ app, prisma, require, backend, launch: chatLaunch, providerFetch: guard.fetch });
      globalThis.fetch = ownerChat.fetch;
    }
    if (telegramLaunch) {
      ownerTelegram = await installOwnerTelegram({ app, prisma, require, backend, launch: telegramLaunch, nativeFetch, trace });
      globalThis.fetch = ownerTelegram.fetch;
      guard = { counters: ownerTelegram.counters, run: ownerTelegram.runRequest };
    }
    if (historyLaunch) {
      ownerHistory = await installOwnerHistory({ app, prisma, require, backend, launch: historyLaunch, nativeFetch });
      globalThis.fetch = ownerHistory.fetch; guard = { counters: ownerHistory.counters, run: ownerHistory.runRequest };
    }
    const terminate = () => { void stop().catch(() => { process.exitCode = 1; }).finally(() => { if (process.connected) process.disconnect(); }); };
    process.once('SIGINT', terminate); process.once('SIGTERM', terminate); process.once('disconnect', terminate);
    enter('http_configuring', 'http_setup_failed');
    configureHttpApp(app);
    app.disable('x-powered-by'); app.set('trust proxy', 'loopback');
    const origin = process.env.CORS_ALLOWED_ORIGINS;
    app.use((request, response, next) => {
      const boundary = localBrowserBoundary(request.headers, origin, `127.0.0.1:${process.env.PORT}`);
      const diagnosticRoute = request.method === 'GET' && ['/api/health', '/api/health/ready'].includes(request.originalUrl);
      const reason = !boundary ? 'local_onboarding_origin_refused' : historyLaunch
        ? ownerHistoryIngress(request.method, request.originalUrl, request.headers, request.body, origin, historyLaunch.plan.scope) : telegramLaunch
        ? ownerTelegramIngress(request.method, request.originalUrl, request.headers, request.body, origin, telegramLaunch.plan.scope, telegramLaunch.plan.contract) : chatLaunch
        ? (historyReview ? historyReviewIngress : ownerChatIngress)(request.method, request.originalUrl, request.headers, request.body, origin, chatLaunch.manifest.ownerScope)
        : diagnostic ? (diagnosticRoute ? null : 'local_yclients_diagnostic_route_disabled') : realReadIngress(request.method, request.originalUrl, request.headers, request.body, origin, allowUserAuth);
      traceHttpRequest(request, response, trace, reason);
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
    if (historyLaunch) {
      let requested = false;
      process.on('message', message => {
        if (requested || closing || !message || Object.keys(message).length !== 1 || message.type !== 'owner-history-run') return;
        requested = true;
        void ownerHistory.importOnce().then(result => send({ type: 'history-result', result }));
      });
    }
    send(runtimeStatus('runtime_ready', 'completed'));
    send({ type: 'ready', contract: 'maya.local-yclients-read/1', origin: `http://127.0.0.1:${process.env.PORT}`, providerAdmission: historyLaunch ? OWNER_HISTORY_ADMISSION : telegramLaunch ? OWNER_TELEGRAM_ADMISSION : chatLaunch ? (historyReview ? OWNER_HISTORY_REVIEW_ADMISSION : 'explicit_owner_catalog_and_bounded_model') : diagnostic ? 'diagnostic_network_closed' : allowUserAuth ? 'explicit_setup_auth_and_reads_only' : 'explicit_setup_reads_only' });
  } catch (error) {
    send(runtimeStatus(stage, 'failed', code, error));
    await stop().catch(() => {});
    throw new Error('Local YCLIENTS read runtime failed; see closed service code');
  }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  start().catch(() => { console.error('Local YCLIENTS read runtime stopped; see service stage/code'); process.exitCode = 1; if (process.connected) process.disconnect(); });
