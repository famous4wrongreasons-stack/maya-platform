// Synthetic fixture preparation + actual compiled entry HTTP/React. No bootHttp substitute.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  Fixtures,
  type TenantFixture,
  type UserFixture,
} from './support/fixtures';
import {
  assertNoEnvFiles,
  widgetsLiveChildEnvironment,
} from './support/environment';
import { assertProofDatabase } from './support/proof-db-guard';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import type { HistoryErasureCompletion } from '../../src/widgets/consent/history-erasure.owner';

const stage = process.env.JEST_HISTORY_ERASURE_STAGE;
const receiptPath = process.env.JEST_HISTORY_ERASURE_RECEIPT;
const output = process.env.JEST_HISTORY_ERASURE_OUTPUT;
if (!['prepare', 'resume'].includes(stage ?? '') || !receiptPath || !output)
  throw new Error('Use the owned history-erasure-react-proof.mjs runner');
const database = assertProofDatabase();
type Saved = {
  database: string;
  tenant: TenantFixture;
  user: UserFixture;
  principalProofHash: string;
  conversationId: string;
  targetTurnId: string;
  siblingConversationId: string;
  siblingTurnId: string;
  erasedMarker: string;
  survivorMarker: string;
  completion: HistoryErasureCompletion;
  tombstoneHash: string;
  nextLoginAt: number;
  backendPid: number;
  probePid: number;
  pgStarted: string;
};
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const json = (value: unknown): Record<string, unknown> => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
};
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Observe close/error from spawn time, including a child which exits on a signal. */
const own = (child: ChildProcess) => {
  let settled = false;
  const finished = new Promise<void>((resolve) => {
    const done = () => {
      settled = true;
      resolve();
    };
    child.once('close', done);
    child.once('error', done);
  });
  const wait = async (ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        finished,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return async () => {
    if (settled) return;
    child.kill('SIGTERM');
    await wait(2000);
    if (!settled) {
      child.kill('SIGKILL');
      await wait(1000);
    }
    assert.equal(settled, true, 'owned process cleanup unconfirmed');
  };
};

describe('history erasure current React and separate compiled entry restart [synthetic]', () => {
  let db: FixtureContext;
  let saved: Saved;
  let backendOrigin = '';
  let backend: ChildProcess | undefined;
  let stopBackend: (() => Promise<void>) | undefined;
  let browser: ChildProcess | undefined;
  let stopBrowser: (() => Promise<void>) | undefined;
  let logFd: number | undefined;
  const terminate = () => {
    void Promise.allSettled([stopBrowser?.(), stopBackend?.()]).finally(() =>
      process.exit(2),
    );
  };
  const report: Record<string, unknown> = {
    contract: 'maya.history-erasure-compiled-react/1',
    stage,
    status: 'running',
    actualCompiledEntry: 'dist/src/main.js',
    nodeEnvironment: 'test',
    syntheticFixtures: true,
    debugEmail: true,
    modelProvider: 'safe',
    productionConfiguration: false,
    realModelAcceptance: false,
    externalProviderAcceptance: false,
    externalEgressMeasured: false,
  };
  const scopedTurns = () =>
    db.prisma.widgetTimelineTurn.findMany({
      where: {
        tenantId: saved.tenant.id,
        conversationId: saved.conversationId,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        textContent: true,
        spokenTranscript: true,
        erasedAt: true,
      },
    });
  const tombstones = () =>
    db.prisma.widgetErasureTombstone.findMany({
      where: { tenantId: saved.tenant.id },
      orderBy: { id: 'asc' },
    });
  const assertScope = async () => {
    const target = await scopedTurns();
    expect(target.length).toBeGreaterThan(0);
    for (const row of target) {
      expect(row.textContent).toBeNull();
      expect(row.spokenTranscript).toBeNull();
      expect(row.erasedAt).toBeInstanceOf(Date);
    }
    expect(
      await db.prisma.widgetTimelineTurn.findFirstOrThrow({
        where: { tenantId: saved.tenant.id, id: saved.siblingTurnId },
        select: { textContent: true, erasedAt: true },
      }),
    ).toEqual({ textContent: saved.survivorMarker, erasedAt: null });
  };
  async function call(route: string, body: object, token?: string) {
    const response = await fetch(backendOrigin + '/api' + route, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }
  beforeAll(async () => {
    process.once('SIGTERM', terminate);
    process.once('SIGINT', terminate);
    assertNoEnvFiles();
    db = await bootFixtureContext();
    const [{ started }] = await db.prisma.$queryRaw<
      Array<{ started: Date }>
    >`SELECT pg_postmaster_start_time() AS started`;
    if (stage === 'prepare') {
      const fx = new Fixtures(db, null);
      const tenant = await fx.tenant(
        'history erasure React binary',
        CalendarSource.INTERNAL,
      );
      await fx.grantFeature(tenant, 'widgets.runtime');
      const user = await fx.user(tenant, UserRole.TENANT_OWNER);
      const actor = await fx.actor(tenant, user);
      const principalProofHash = await fx.principalProofHash(actor);
      const conversationId = randomUUID(),
        siblingConversationId = randomUUID();
      const erasedMarker = 'Синтетический разговор для удаления 7319';
      const survivorMarker = 'Другой синтетический разговор сохраняется 8426';
      const createdAt = new Date();
      const sibling = await db.prisma.widgetTimelineTurn.create({
        data: {
          tenantId: tenant.id,
          conversationId: siblingConversationId,
          turnIndex: 0,
          role: 'user',
          principalProofHash,
          channel: 'pwa',
          createdAt: new Date(createdAt.getTime() - 1000),
          retentionUntil: new Date(createdAt.getTime() + 86400000),
          textContent: survivorMarker,
        },
      });
      const target = await db.prisma.widgetTimelineTurn.create({
        data: {
          tenantId: tenant.id,
          conversationId,
          turnIndex: 0,
          role: 'user',
          principalProofHash,
          channel: 'pwa',
          createdAt,
          retentionUntil: new Date(createdAt.getTime() + 86400000),
          textContent: erasedMarker,
        },
      });
      // Exact fixture ownership stays inside this private fresh cluster until the
      // resume phase ends. The runner stops it; no shared database is cleaned.
      saved = {
        database: database.database,
        tenant,
        user,
        principalProofHash,
        conversationId,
        targetTurnId: target.id,
        siblingConversationId,
        siblingTurnId: sibling.id,
        erasedMarker,
        survivorMarker,
        nextLoginAt: 0,
        backendPid: 0,
        probePid: process.pid,
        pgStarted: started.toISOString(),
        completion: null as unknown as HistoryErasureCompletion,
        tombstoneHash: '',
      };
    } else {
      saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Saved;
      expect(saved.database).toBe(database.database);
      expect(saved.probePid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(started.toISOString());
      report.separateProbeProcess = true;
      report.postgresRestartObserved = true;
      await assertScope();
      expect(digest(await tombstones())).toBe(saved.tombstoneHash);
    }
    const socket = createServer();
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.listen(0, '127.0.0.1', resolve);
    });
    const address = socket.address();
    assert.ok(address && typeof address !== 'string');
    await new Promise<void>((resolve, reject) =>
      socket.close((error) => (error ? reject(error) : resolve())),
    );
    backendOrigin = `http://127.0.0.1:${address.port}`;
    const { env } = widgetsLiveChildEnvironment(process.env, {
      HOST: '127.0.0.1',
      PORT: String(address.port),
      NODE_ENV: 'test',
      AI_CORE_PROVIDER: 'safe',
      EMAIL_LOGIN_ENABLED: 'true',
      EMAIL_AUTH_PROVIDER: 'debug',
      PHONE_LOGIN_ENABLED: 'false',
      SWAGGER_ENABLED: 'false',
      AUTH_TRUST_PROXY: '127.0.0.1',
    });
    for (const key of [
      'OPENAI_API_KEY',
      'YCLIENTS_PARTNER_TOKEN',
      'SMSRU_API_ID',
      'SMTP_PASSWORD',
    ])
      expect(env[key]).toBeUndefined();
    logFd = fs.openSync(
      path.join(path.dirname(receiptPath), `${stage}-backend-private.log`),
      'wx',
      0o600,
    );
    backend = spawn(
      process.execPath,
      ['--max-old-space-size=1536', 'dist/src/main.js'],
      { cwd: process.cwd(), env, stdio: ['ignore', logFd, logFd] },
    );
    stopBackend = own(backend);
    const child = backend;
    let launchError: Error | undefined;
    child.once('error', (error) => {
      launchError = error;
    });
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      assert.equal(
        child.exitCode,
        null,
        'compiled backend exited; inspect private process log',
      );
      assert.equal(child.signalCode, null);
      try {
        ready = (
          await fetch(backendOrigin + '/api/health', {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        /* startup only */
      }
      if (ready) break;
      await delay(100);
    }
    assert.equal(ready, true, 'compiled backend health timeout');
    assert.ok(child.pid);
    expect(child.pid).not.toBe(process.pid);
    report.backendPid = child.pid;
    report.probePid = process.pid;
    report.pgStarted = started.toISOString();
    if (stage === 'prepare') saved.backendPid = child.pid;
    else {
      expect(child.pid).not.toBe(saved.backendPid);
      report.separateBackendProcess = true;
    }
  }, 60000);
  afterAll(async () => {
    try {
      await stopBrowser?.();
    } finally {
      try {
        await stopBackend?.();
        report.backendStopped = true;
      } finally {
        if (logFd !== undefined) fs.closeSync(logFd);
        await db?.close();
        process.off('SIGTERM', terminate);
        process.off('SIGINT', terminate);
        fs.writeFileSync(
          path.join(output, stage + '.json'),
          JSON.stringify(report, null, 2) + '\n',
          { mode: 0o600 },
        );
      }
    }
  });

  it('proves current React erasure and immutable replay across process/PG restart', async () => {
    try {
      if (stage === 'resume') {
        const login = await call('/auth/login', {
          tenantSlug: saved.tenant.slug,
          email: saved.user.email,
          password: saved.user.password,
        });
        expect(login.status).toBe(201);
        const token = json(login.body).access_token;
        assert.ok(typeof token === 'string');
        const replay = await call(
          `/privacy/conversations/${saved.conversationId}/erasure`,
          { requestId: saved.completion.requestId },
          token,
        );
        expect(replay.status).toBe(200);
        expect(replay.body).toEqual(saved.completion);
        expect(digest(await tombstones())).toBe(saved.tombstoneHash);
        await assertScope();
        report.persistedSameCompletionTimestamp = true;
        report.noAdditionalTombstonesOnReplay = true;
        // Real debug delivery keeps its existing rate-limit window across restart.
        const wait = saved.nextLoginAt - Date.now();
        assert.ok(wait < 90000, 'unexpected auth cooldown');
        if (wait > 0) await delay(wait);
      }
      const browserLog = fs.openSync(
        path.join(output, stage + '-browser.log'),
        'wx',
        0o600,
      );
      let completed: HistoryErasureCompletion | undefined;
      let nextLoginAt = 0;
      let rejected: ((reason: unknown) => void) | undefined;
      const browserDone = new Promise<void>((resolve, reject) => {
        rejected = reject;
        browser = spawn(
          process.execPath,
          [
            '--max-old-space-size=512',
            '../maya-carrier-react/test/history-erasure-browser-probe.mjs',
          ],
          {
            cwd: process.cwd(),
            env: {
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              TMPDIR: process.env.TMPDIR,
            },
            stdio: ['ignore', browserLog, browserLog, 'ipc'],
          },
        );
        stopBrowser = own(browser);
        browser.once('error', reject);
        browser.once('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `browser proof exited ${String(code)}; inspect browser log`,
                ),
              ),
        );
      });
      const child = browser!;
      child.on('message', (raw: unknown) => {
        void (async () => {
          const message = json(raw);
          if (message.type === 'ready') {
            child.send({
              type: 'start',
              stage,
              backendOrigin,
              output,
              email: saved.user.email,
              conversationId: saved.conversationId,
              erasedMarker: saved.erasedMarker,
              survivorMarker: saved.survivorMarker,
            });
            return;
          }
          if (message.type === 'owner-completion') return;
          assert.equal(message.type, 'checkpoint');
          if (message.name === 'uncertain' || message.name === 'completed') {
            const value = json(message.completed);
            expect(value).toMatchObject({
              contract: 'maya.privacy.history-erasure/1',
              outcome: 'COMPLETED',
              conversationId: saved.conversationId,
            });
            assert.equal(typeof value.requestId, 'string');
            assert.equal(typeof value.erasedAt, 'string');
            if (completed) expect(value).toEqual(completed);
            completed = value as unknown as HistoryErasureCompletion;
            await assertScope();
            const rows = await tombstones();
            expect(rows.length).toBe(1);
            expect(rows[0].erasedAt.toISOString()).toBe(completed.erasedAt);
            if (message.name === 'completed') {
              assert.ok(typeof message.nextLoginAt === 'number');
              nextLoginAt = message.nextLoginAt;
            }
          } else if (message.name === 'reloaded') {
            assert.ok(typeof message.nextLoginAt === 'number');
            nextLoginAt = message.nextLoginAt;
          } else assert.equal(message.name, 'resumed');
          child.send({ type: 'continue:' + String(message.name) });
        })().catch((error) => rejected?.(error));
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          browserDone,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error('browser proof timed out')),
              240000,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        await stopBrowser?.();
        fs.closeSync(browserLog);
      }
      await assertScope();
      const browserReport = JSON.parse(
        fs.readFileSync(
          path.join(output, stage + '-browser/report.json'),
          'utf8',
        ),
      ) as { status: string };
      expect(browserReport.status).toBe('passed');
      if (stage === 'prepare') {
        assert.ok(completed);
        assert.ok(nextLoginAt > 0);
        saved.completion = completed;
        saved.nextLoginAt = nextLoginAt;
        saved.tombstoneHash = digest(await tombstones());
        fs.writeFileSync(receiptPath, JSON.stringify(saved), {
          flag: 'wx',
          mode: 0o600,
        });
      }
      expect(
        await db.prisma.appointment.count({
          where: { tenantId: saved.tenant.id },
        }),
      ).toBe(0);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: saved.tenant.id },
        }),
      ).toBe(0);
      report.noCanonicalAppointmentOrActionCreated = true;
      report.otherConversationSurvives = true;
      report.status = 'passed';
    } catch (error) {
      report.status = 'failed';
      throw error;
    }
  }, 300000);
});
