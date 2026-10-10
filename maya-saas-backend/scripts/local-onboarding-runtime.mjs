// Actual compiled application, with finite local ingress. No test container,
// synthetic source, intercepted domain owner, seed or grant is installed here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPrivateCwd, assertProfileEnvironment, ingressDecision, localBrowserBoundary } from './local-onboarding-profile.mjs';

const require = createRequire(import.meta.url);
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function start() {
  assert.equal(process.connected, true, 'Use the bounded normal onboarding launcher');
  assertProfileEnvironment(process.env);
  assertPrivateCwd(process.cwd());
  assert.equal(process.cwd(), process.env.MAYA_LOCAL_ONBOARDING_STATE);
  // The only ConfigModule envFilePath is resolved in this controlled empty cwd.
  // Do not import AppModule before this check; native module initialization stays real.
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(backend, 'dist/src/app.module.js'));
  const { configureHttpApp } = require(path.join(backend, 'dist/src/bootstrap/configure-http-app.js'));
  const { PrismaService } = require(path.join(backend, 'dist/src/prisma/prisma.service.js'));
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false, abortOnError: false });
  let closing;
  const stop = () => closing ??= (async () => { try { await app.close(); } finally { await app.get(PrismaService).$disconnect(); } })();
  const terminate = () => { void stop().finally(() => { if (process.connected) process.disconnect(); }); };
  process.once('SIGINT', terminate); process.once('SIGTERM', terminate); process.once('disconnect', terminate);
  try {
    configureHttpApp(app);
    app.disable('x-powered-by');
    app.set('trust proxy', 'loopback');
    const origin = process.env.CORS_ALLOWED_ORIGINS;
    app.use((request, response, next) => {
      const reason = localBrowserBoundary(request.headers, origin, `127.0.0.1:${process.env.PORT}`) ? ingressDecision(request.method, request.originalUrl, request.headers.origin, origin, request.body) : 'local_onboarding_origin_refused';
      if (reason) {
        response.status(403).json({ error: { code: reason }, message: reason === 'local_provider_admission_required' ? 'Настоящее подключение YCLIENTS ещё не разрешено для этого локального этапа.' : 'Этот локальный этап поддерживает только создание бизнеса и вход.' });
        return;
      }
      next();
    });
    // Same-origin relay is the carrier entry. No wildcard CORS is granted.
    app.enableCors({ origin, credentials: false, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], exposedHeaders: ['Retry-After'] });
    await app.listen(Number(process.env.PORT), '127.0.0.1');
    if (closing) { await closing; return; }
    process.send({ type: 'ready', contract: 'maya.normal-local-onboarding/1', origin: `http://127.0.0.1:${process.env.PORT}`, providerAdmission: false });
  } catch {
    await stop();
    throw new Error('Normal local onboarding bootstrap failed');
  }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  start().catch(() => { console.error('Normal local onboarding bootstrap failed; no request or credential data recorded'); process.exitCode = 1; if (process.connected) process.disconnect(); });
