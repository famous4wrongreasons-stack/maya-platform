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

const stage = process.env.JEST_OWN_SCHEDULE_STAGE;
const receipt = process.env.JEST_OWN_SCHEDULE_RECEIPT!;
const output = process.env.JEST_OWN_SCHEDULE_OUTPUT!;
if (!['prepare', 'resume'].includes(stage ?? '') || !receipt || !output)
  throw new Error('Use own-schedule-proof.mjs');
const database = assertProofDatabase();
if (!/^maya_widget_gate_proof_ownschedule_[a-f0-9]+$/.test(database.database))
  throw new Error('Fresh own-schedule database required');
const digest = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const PROMPTS = {
  tomorrow: 'Я завтра работаю?',
  after: 'А послезавтра?',
  ambiguous: 'Мой график не завтра, а в пятницу',
  incomplete: 'Какой у меня график сегодня?',
  unlinked: 'Покажи мой график завтра',
  revoked: 'Я завтра работаю?',
};
type Salon = {
  tenant: TenantFixture;
  employee: UserFixture;
  companyId: number;
  accessId: string;
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
  date: string;
};

describe('own schedule actual HTTP/auth/C9/PG/React [SCRIPTED MODEL, SYNTHETIC CRM]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  let incomplete = false;
  const reads: Array<{ company: string; date: string }> = [];
  const unexpected: string[] = [];
  const observations: Record<string, unknown> = {
    syntheticModel: true,
    syntheticCrm: true,
    realModelAcceptance: false,
  };
  const own = new Set<string>();
  let modelCalls = 0;
  function date(offset: number) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  beforeAll(async () => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'own-schedule-synthetic-no-credential';
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    // Literal belongs only to the source fixture: fetch is intercepted before any network I/O.
    process.env.YCLIENTS_PARTNER_TOKEN = 'own-schedule-synthetic-no-credential';
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (
        url.origin === 'http://127.0.0.1:9' &&
        init?.method === 'GET' &&
        /^\/synthetic\/company\/(99101|99102)\/staff$/.test(url.pathname)
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 71,
                  name: 'Synthetic employee',
                  specialization: 'Staff',
                  bookable: true,
                  fired: false,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      const match =
        /^\/synthetic\/schedule\/(99101|99102)\/71\/(\d{4}-\d{2}-\d{2})\/\2$/.exec(
          url.pathname,
        );
      if (
        url.origin !== 'http://127.0.0.1:9' ||
        init?.method !== 'GET' ||
        !match
      ) {
        unexpected.push(
          'unexpected_fetch:' + (init?.method ?? 'GET') + ':' + url.pathname,
        );
        throw new Error('External or mutation I/O forbidden');
      }
      reads.push({ company: match[1], date: match[2] });
      const working = match[2] !== date(2);
      const data = incomplete
        ? [{ date: match[2], is_working: true, slots: [{ from: '09:00' }] }]
        : [
            {
              date: match[2],
              is_working: working,
              slots: working
                ? [
                    {
                      from: match[1] === '99101' ? '09:00' : '11:00',
                      to: '18:00',
                    },
                  ]
                : [],
            },
          ];
      return Promise.resolve(
        new Response(JSON.stringify({ data }), { status: 200 }),
      );
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        const text = input.messages
          .filter((m) => m.role === 'user')
          .at(-1)?.content;
        if (!Object.values(PROMPTS).includes(text ?? '')) {
          unexpected.push('unexpected_model_turn');
          throw new Error('Unscripted turn forbidden');
        }
        return Promise.resolve({
          reply: '',
          toolCall: {
            name: 'staff.schedule.own.read',
            arguments: { date: '2099-01-01' },
          },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_OWN_SCHEDULE',
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
      'Own schedule synthetic',
      CalendarSource.EXTERNAL,
    );
    own.add(tenant.id);
    const employee = await fx.user(tenant, UserRole.EMPLOYEE);
    for (const feature of [
      'ai.consultant',
      'ai.admin',
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
          'own-schedule-synthetic-no-credential',
        ),
        baseUrl: 'http://127.0.0.1:9/synthetic',
        settingsJson: { companyId },
        status: 'active',
      },
    });
    const staff = await fx.staff(tenant, employee, 'Synthetic employee');
    await db.prisma.staffProviderLink.create({
      data: {
        tenantId: tenant.id,
        staffId: staff.id,
        provider: CrmProvider.YCLIENTS,
        externalId: '71',
      },
    });
    const access = await db.prisma.crmStaffAccess.create({
      data: {
        tenantId: tenant.id,
        userId: employee.id,
        externalStaffId: '71',
        staffId: staff.id,
        encryptedDisplayName: db.encryption.encrypt('Synthetic employee'),
        role: UserRole.EMPLOYEE,
        status: 'active',
      },
    });
    return { tenant, employee, companyId, accessId: access.id };
  }
  const login = (s: Salon) =>
    http.login(s.tenant.slug, s.employee.email, s.employee.password);
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
        taskKey: 'staff.schedule.own.read',
      });
      if (w.state !== 'SETTLED') continue;
      const r = w.resultJson as { executionId: string; sourceType: string };
      expect(r.sourceType).toBe('AiToolExecution');
      const execution = await db.prisma.aiToolExecution.findUniqueOrThrow({
        where: { id: r.executionId },
      });
      expect(execution).toMatchObject({
        tenantId: s.tenant.id,
        actorUserId: s.employee.id,
        toolName: 'staff.schedule.own.read',
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
      const a = await salon(99101),
        b = await salon(99102),
        token = await login(a),
        foreignToken = await login(b);
      const requestId = randomUUID();
      const first = await chat(token, PROMPTS.tomorrow, requestId);
      observations.firstStatus = {
        status: first.status,
        body: first.body as unknown,
      };
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        action: null,
        grounding: { status: 'verified' },
      });
      expect((first.body as Chat).reply).toContain('09:00–18:00');
      const beforeReplay = reads.length;
      const replay = await chat(token, PROMPTS.tomorrow, requestId);
      expect(replay.status).toBe(201);
      expect((replay.body as Chat).reply).toBe((first.body as Chat).reply);
      expect(reads).toHaveLength(beforeReplay);
      const second = await chat(
        token,
        PROMPTS.after,
        randomUUID(),
        [
          { role: 'user', content: PROMPTS.tomorrow },
          { role: 'assistant', content: (first.body as Chat).reply },
        ],
        (first.body as Chat).user_turn.conversationId,
      );
      expect(second.status).toBe(201);
      expect((second.body as Chat).reply).toContain('у вас выходной');
      expect((second.body as Chat).reply).not.toContain('09:00');
      const beforeAmbiguity = reads.length;
      const ambiguous = await chat(
        token,
        PROMPTS.ambiguous,
        randomUUID(),
        [],
        (first.body as Chat).user_turn.conversationId,
      );
      expect(ambiguous.status).toBe(201);
      expect((ambiguous.body as Chat).reply).toContain('На какую дату');
      expect(reads).toHaveLength(beforeAmbiguity);
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
      const bChat = await chat(foreignToken, PROMPTS.tomorrow);
      expect(bChat.status).toBe(201);
      expect((bChat.body as Chat).reply).toContain('11:00–18:00');
      expect((bChat.body as Chat).reply).not.toContain('09:00');
      const turns = await db.prisma.widgetTimelineTurn.findMany({
        where: { tenantId: a.tenant.id, role: 'assistant' },
        orderBy: { turnIndex: 'asc' },
      });
      const replies = turns.map((t) =>
        decodeChatReply(db.encryption, t.textContent!),
      );
      expect(replies).toContain((first.body as Chat).reply);
      expect(replies).toContain((second.body as Chat).reply);
      expect(turns.every((t) => !t.textContent?.includes('09:00'))).toBe(true);
      saved = {
        database: database.database,
        pid: process.pid,
        pgStarted: await pgStarted(),
        salon: a,
        foreign: b,
        replies: [(first.body as Chat).reply, (second.body as Chat).reply],
        graph: await graph(a.tenant.id),
        date: date(0),
      };
      writeFileSync(receipt, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
      observations.http = {
        first: first.body as unknown,
        replay: replay.body as unknown,
        followUp: second.body as unknown,
        ambiguous: ambiguous.body as unknown,
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
      expect(date(0)).toBe(saved.date); // Cross-midnight is a distinct run, not relabelled old evidence.
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
              '../maya-carrier-react/test/own-schedule-browser-probe.mjs',
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
          () => fail(new Error('Own schedule browser timeout')),
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
                  ownerEmail: saved.salon.employee.email,
                  output,
                  historyReplies: saved.replies,
                });
                return;
              }
              expect(m.type).toBe('checkpoint');
              expect(m.name).toBe(
                [
                  'history',
                  'tomorrow',
                  'after',
                  'ambiguous',
                  'incomplete',
                  'unlinked',
                  'revoked',
                ][completed.length],
              );
              if (m.name === 'history') {
                expect(reads).toEqual([]);
                expect(modelCalls).toBe(0);
              }
              if (m.name === 'tomorrow') {
                expect(m.body?.reply).toContain('09:00–18:00');
                expect(m.body?.grounding.status).toBe('verified');
              }
              if (m.name === 'after') {
                expect(m.body?.reply).toContain('у вас выходной');
                expect(m.body?.grounding.status).toBe('verified');
              }
              if (m.name === 'ambiguous') {
                expect(m.body?.reply).toContain('На какую дату');
                incomplete = true;
              }
              if (m.name === 'incomplete') {
                incomplete = false;
                await db.prisma.crmStaffAccess.update({
                  where: { id: saved.salon.accessId },
                  data: { userId: null, status: 'pending_contact' },
                });
              }
              if (m.name === 'unlinked') {
                expect(m.body?.reply).toContain('привязк');
                await db.prisma.membership.update({
                  where: {
                    userId_tenantId: {
                      userId: saved.salon.employee.id,
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
