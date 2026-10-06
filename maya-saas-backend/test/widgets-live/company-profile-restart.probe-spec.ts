import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { decodeChatReply } from '../../src/widgets/stores/chat-reply-codec';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_COMPANY_PROFILE_STAGE;
const receipt = process.env.JEST_COMPANY_PROFILE_RECEIPT!;
const output = process.env.JEST_COMPANY_PROFILE_OUTPUT!;
if (!['prepare', 'resume'].includes(stage ?? '') || !receipt || !output)
  throw new Error('Use company-profile-proof.mjs');
const database = assertProofDatabase();
if (
  !/^maya_widget_gate_proof_companyprofile_[a-f0-9]+$/.test(database.database)
)
  throw new Error('Fresh company-profile database required');
const digest = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const PROMPTS = {
  profile: 'Где вы находитесь и во сколько открываетесь?',
  changed: 'А адрес?',
  missing: 'Какой у вас график работы?',
  city: 'Как к вам добраться?',
  unavailable: 'Где находится ваш салон?',
  revoked: 'Ваш адрес?',
};
type Salon = {
  tenant: TenantFixture;
  client: UserFixture;
  companyId: number;
};
type Chat = {
  reply: string;
  grounding: { status: string };
  action: unknown;
  user_turn: { conversationId: string; turnId: string };
};
type Saved = {
  database: string;
  pid: number;
  pgStarted: string;
  salon: Salon;
  foreign: Salon;
  replies: string[];
  graph: string;
};

describe('company profile actual HTTP/auth/C9/PG/React [SCRIPTED MODEL, SYNTHETIC CRM]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  let mode: 'full' | 'changed' | 'missing' | 'city' | 'unavailable' = 'full';
  const reads: Array<{ company: string; mode: string }> = [];
  const unexpected: string[] = [];
  const observations: Record<string, unknown> = {
    syntheticModel: true,
    syntheticCrm: true,
    realModelAcceptance: false,
  };
  const own = new Set<string>();
  let modelCalls = 0;
  beforeAll(async () => {
    process.env.YCLIENTS_PARTNER_TOKEN =
      'company-profile-synthetic-no-credential';
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    // Literal belongs only to the source fixture: fetch is intercepted before any network I/O.
    process.env.YCLIENTS_PARTNER_TOKEN =
      'company-profile-synthetic-no-credential';
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const profile = /^\/synthetic\/company\/(99201|99202)$/.exec(
        url.pathname,
      );
      const discovery =
        url.pathname === '/synthetic/companies' && url.search === '?my=1';
      if (
        url.origin !== 'http://127.0.0.1:9' ||
        init?.method !== 'GET' ||
        (!profile && !discovery)
      ) {
        unexpected.push(
          'unexpected_fetch:' + (init?.method ?? 'GET') + ':' + url.pathname,
        );
        throw new Error('External or mutation I/O forbidden');
      }
      reads.push({ company: profile?.[1] ?? 'discovery', mode });
      if (mode === 'unavailable')
        return Promise.resolve(new Response('{}', { status: 503 }));
      if (!profile) throw new Error('Unexpected profile discovery');
      const data = {
        id: Number(profile[1]),
        title: 'Synthetic public salon',
        address:
          mode === 'city'
            ? null
            : profile[1] === '99202'
              ? 'Чужая улица, 2'
              : mode === 'full'
                ? 'Тестовая улица, 7'
                : 'Новая улица, 8',
        city: 'Москва',
        timezone_name: mode === 'city' ? null : 'Europe/Moscow',
        timezone: null,
        schedule: mode === 'missing' ? null : 'Пн–Вс 10:00–20:00',
      };
      return Promise.resolve(
        new Response(JSON.stringify({ data }), { status: 200 }),
      );
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        if (input.toolResults.length)
          throw new Error('Unexpected final model call');
        const text = input.messages
          .filter((m) => m.role === 'user')
          .at(-1)?.content;
        if (!Object.values(PROMPTS).includes(text ?? '')) {
          unexpected.push('unexpected_model_turn');
          throw new Error('Unscripted turn forbidden');
        }
        return Promise.resolve({
          reply: null,
          toolCall: {
            name: 'company.business-hours.read',
            arguments: {},
          },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_COMPANY_PROFILE',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });
  afterAll(async () => {
    observations.reads = reads;
    observations.modelCalls = modelCalls;
    observations.unexpected = unexpected;
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    delete process.env.YCLIENTS_PARTNER_TOKEN;
    if (stage === 'resume')
      for (const id of own)
        await db.prisma.tenant.update({
          where: { id },
          data: { status: 'cancelled' },
        });
    await http?.close();
    await db?.close();
  });
  async function salon(companyId: number): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Company profile synthetic',
      CalendarSource.EXTERNAL,
    );
    own.add(tenant.id);
    const client = await fx.user(tenant, UserRole.CLIENT);
    for (const feature of [
      'ai.consultant',
      'booking',
      'crm.integration',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'Europe/Moscow' },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        encryptedApiToken: db.encryption.encrypt(
          'company-profile-synthetic-no-credential',
        ),
        baseUrl: 'http://127.0.0.1:9/synthetic',
        settingsJson: { companyId },
        status: 'active',
      },
    });
    return { tenant, client, companyId };
  }
  const login = (s: Salon) =>
    http.login(s.tenant.slug, s.client.email, s.client.password);
  const chat = (
    token: string,
    text: string,
    requestId = randomUUID(),
    messages: Array<{ role: string; content: string }> = [],
    conversationId?: string,
  ) =>
    request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId,
        ...(conversationId ? { conversationId } : {}),
        messages: [...messages, { role: 'user', content: text }],
      });
  const pgStarted = async () =>
    (
      await db.prisma.$queryRaw<
        Array<{ value: string }>
      >`SELECT pg_postmaster_start_time()::text AS value`
    )[0].value;
  async function graph(tenantId: string) {
    return digest({
      runs: await db.prisma.c9Run.findMany({
        where: { tenantId },
        orderBy: { id: 'asc' },
      }),
      work: await db.prisma.c9WorkReceipt.findMany({
        where: { tenantId },
        orderBy: { id: 'asc' },
      }),
    });
  }
  async function noBusinessEffects(mark: number) {
    const family =
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder';
    expect(
      http.recorder
        .since(mark)
        .filter(
          (op) =>
            op.write &&
            (op.model
              ? new RegExp('^(' + family + ')').test(op.model)
              : new RegExp(
                  '\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(?:' +
                    family +
                    ')',
                  'i',
                ).test(op.sql ?? '')),
        ),
    ).toEqual([]);
    for (const tenantId of own) {
      expect(
        await db.prisma.actionExecution.count({ where: { tenantId } }),
      ).toBe(0);
      expect(await db.prisma.appointment.count({ where: { tenantId } })).toBe(
        0,
      );
      expect(await db.prisma.inboxItem.count({ where: { tenantId } })).toBe(0);
      expect(
        await db.prisma.marketingDeliveryAttempt.count({ where: { tenantId } }),
      ).toBe(0);
    }
    expect(unexpected).toEqual([]);
  }
  async function sourceReceipt(s: Salon) {
    const work = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: s.tenant.id },
      orderBy: { admittedAt: 'asc' },
    });
    expect(work.length).toBeGreaterThan(0);
    for (const w of work) {
      expect(w).toMatchObject({
        domain: 'OCCUPANCY',
        kind: 'TOOL_READ',
        taskKey: 'company.business-hours.read',
      });
      if (w.state !== 'SETTLED') continue;
      const r = w.resultJson as { executionId: string; sourceType: string };
      expect(r.sourceType).toBe('AiToolExecution');
      const execution = await db.prisma.aiToolExecution.findUniqueOrThrow({
        where: { id: r.executionId },
      });
      expect(execution).toMatchObject({
        tenantId: s.tenant.id,
        actorUserId: s.client.id,
        toolName: 'company.business-hours.read',
        status: 'completed',
      });
    }
    return work.map((w) => ({
      id: w.id,
      runId: w.runId,
      state: w.state,
      result: w.resultJson,
    }));
  }
  it('executes the owned stage and preserves canonical source/history boundaries', async () => {
    const mark = http.recorder.mark();
    if (stage === 'prepare') {
      const a = await salon(99201),
        b = await salon(99202),
        token = await login(a),
        foreignToken = await login(b);
      const requestId = randomUUID();
      const first = await chat(token, PROMPTS.profile, requestId);
      observations.firstStatus = {
        status: first.status,
        body: first.body as unknown,
      };
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        action: null,
        grounding: { status: 'verified' },
      });
      expect((first.body as Chat).reply).toContain('Тестовая улица, 7');
      const beforeReplay = reads.length;
      const replay = await chat(token, PROMPTS.profile, requestId);
      expect(replay.status).toBe(201);
      expect((replay.body as Chat).reply).toBe((first.body as Chat).reply);
      expect(reads).toHaveLength(beforeReplay);
      mode = 'changed';
      const second = await chat(
        token,
        PROMPTS.changed,
        randomUUID(),
        [
          { role: 'user', content: PROMPTS.profile },
          { role: 'assistant', content: (first.body as Chat).reply },
        ],
        (first.body as Chat).user_turn.conversationId,
      );
      expect(second.status).toBe(201);
      expect((second.body as Chat).reply).toContain('Новая улица, 8');
      expect((second.body as Chat).reply).not.toContain('Тестовая улица');
      const work = await sourceReceipt(a);
      const foreign = await request(http.app.getHttpServer())
        .get('/api/orchestration/runs/' + work[0].runId)
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreign.status).toBe(400);
      expect((foreign.body as { message: string }).message).toBe(
        'c9_run_authority',
      );
      const foreignHistory = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(foreignHistory.status).toBe(200);
      expect(JSON.stringify(foreignHistory.body)).not.toContain(
        (first.body as Chat).reply,
      );
      const bChat = await chat(foreignToken, PROMPTS.profile);
      expect(bChat.status).toBe(201);
      expect((bChat.body as Chat).reply).toContain('Чужая улица, 2');
      expect((bChat.body as Chat).reply).not.toContain('Тестовая улица');
      const turns = await db.prisma.widgetTimelineTurn.findMany({
        where: { tenantId: a.tenant.id, role: 'assistant' },
        orderBy: { turnIndex: 'asc' },
      });
      const replies = turns.map((t) =>
        decodeChatReply(db.encryption, t.textContent!),
      );
      expect(replies).toContain((first.body as Chat).reply);
      expect(replies).toContain((second.body as Chat).reply);
      expect(
        turns.every((t) => !t.textContent?.includes('Тестовая улица')),
      ).toBe(true);
      saved = {
        database: database.database,
        pid: process.pid,
        pgStarted: await pgStarted(),
        salon: a,
        foreign: b,
        replies: [(first.body as Chat).reply, (second.body as Chat).reply],
        graph: await graph(a.tenant.id),
      };
      writeFileSync(receipt, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
      observations.http = {
        first: first.body as unknown,
        replay: replay.body as unknown,
        followUp: second.body as unknown,
        foreignRun: foreign.status,
        foreignHistory: foreignHistory.status,
        otherTenantReply: (bChat.body as Chat).reply,
        receipts: work,
        encryptedHistory: true,
      };
    } else {
      saved = JSON.parse(readFileSync(receipt, 'utf8')) as Saved;
      own.add(saved.salon.tenant.id);
      own.add(saved.foreign.tenant.id);
      expect(saved.database).toBe(database.database);
      expect(saved.pid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(await pgStarted());
      expect(await graph(saved.salon.tenant.id)).toBe(saved.graph);
      observations.restart = {
        applicationPidChanged: true,
        postgresStartedChanged: true,
        graphHashUnchanged: saved.graph,
      };
      const completed: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.resolve(
              '../maya-carrier-react/test/company-profile-browser-probe.mjs',
            ),
          ],
          { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
        );
        let failure: Error | undefined,
          stderr = '',
          pending = Promise.resolve();
        const fail = (e: unknown) => {
          failure ??= e instanceof Error ? e : new Error(String(e));
          child.kill('SIGTERM');
        };
        const timer = setTimeout(
          () => fail(new Error('Company profile browser timeout')),
          150_000,
        );
        child.stderr!.on('data', (b: Buffer) => {
          stderr += b.toString();
        });
        child.on('message', (raw: unknown) => {
          pending = pending
            .then(async () => {
              const m = raw as { type: string; name: string; body?: Chat };
              if (m.type === 'ready') {
                child.send({
                  type: 'start',
                  backendOrigin: await http.listenLoopback(),
                  clientEmail: saved.salon.client.email,
                  output,
                  historyReplies: saved.replies,
                });
                return;
              }
              expect(m.type).toBe('checkpoint');
              expect(m.name).toBe(
                [
                  'history',
                  'profile',
                  'changed',
                  'missing',
                  'city',
                  'unavailable',
                  'revoked',
                ][completed.length],
              );
              if (m.name === 'history') {
                expect(reads).toEqual([]);
                expect(modelCalls).toBe(0);
              }
              if (m.name === 'profile') {
                expect(m.body?.reply).toContain('Тестовая улица, 7');
                expect(m.body?.grounding.status).toBe('verified');
                mode = 'changed';
              }
              if (m.name === 'changed') {
                expect(m.body?.reply).toContain('Новая улица, 8');
                expect(m.body?.grounding.status).toBe('verified');
                mode = 'missing';
              }
              if (m.name === 'missing') {
                expect(m.body?.reply).toContain('График работы не указан');
                mode = 'city';
              }
              if (m.name === 'city') {
                expect(m.body?.reply).toContain('Адрес не указан');
                mode = 'unavailable';
              }
              if (m.name === 'unavailable') {
                await db.prisma.membership.update({
                  where: {
                    userId_tenantId: {
                      userId: saved.salon.client.id,
                      tenantId: saved.salon.tenant.id,
                    },
                  },
                  data: { status: 'suspended' },
                });
              }
              await noBusinessEffects(mark);
              completed.push(m.name);
              child.send({ type: 'continue:' + m.name });
            })
            .catch(fail);
        });
        child.once('error', fail);
        child.once('close', (code) => {
          clearTimeout(timer);
          void pending.then(() =>
            failure
              ? reject(failure)
              : code !== 0
                ? reject(
                    new Error(`Browser exited ${code}: ${stderr.slice(-2000)}`),
                  )
                : resolve(),
          );
        });
      });
      expect(completed).toHaveLength(7);
      observations.browserCheckpoints = completed;
      observations.receipts = await sourceReceipt(saved.salon);
    }
    await noBusinessEffects(mark);
  }, 180_000);
});
