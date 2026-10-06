import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { decodeChatReply } from '../../src/widgets/stores/chat-reply-codec';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_PERSONAL_DATES_STAGE;
const receipt = process.env.JEST_PERSONAL_DATES_RECEIPT!;
const output = process.env.JEST_PERSONAL_DATES_OUTPUT!;
if (!['prepare', 'resume'].includes(stage ?? '') || !receipt || !output)
  throw new Error('Use personal-dates-proof.mjs');
const database = assertProofDatabase();
if (!/^maya_widget_gate_proof_personaldates_[a-f0-9]+$/.test(database.database))
  throw new Error('Fresh personal-dates database required');
const digest = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const PROMPTS = {
  upcoming: 'Когда моя ближайшая личная запись?',
  changed: 'Проверь мои личные записи ещё раз',
  incomplete: 'Какое время у моей личной записи?',
  cancelled: 'Остались ли у меня личные записи?',
  unlinked: 'Покажи мои личные записи как клиента',
  revoked: 'Когда я записан?',
};
type Salon = {
  tenant: TenantFixture;
  client: UserFixture;
  branchId: string;
  appointmentId: string;
  linkId: string;
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

describe('personal appointment dates actual HTTP/auth/C9/PG/React [SCRIPTED MODEL, SYNTHETIC CANONICAL APPOINTMENTS/A18]', () => {
  let db: FixtureContext, http: HttpHarness, saved: Saved;
  type Mode = 'full' | 'changed' | 'incomplete' | 'cancelled' | 'unlinked';
  const reads: string[] = [];
  const unexpected: string[] = [];
  const observations: Record<string, unknown> = {
    syntheticModel: true,
    syntheticCanonicalAppointments: true,
    syntheticA18Verifier: true,
    externalProviderAcceptance: false,
    realModelAcceptance: false,
  };
  const own = new Set<string>();
  let modelCalls = 0;
  const serializedModelRequests: string[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    config.set('AI_CORE_PROVIDER', 'openai');
    config.set('OPENAI_API_KEY', 'synthetic-transport-no-credential');
    config.set('OPENAI_AI_CORE_MODEL', 'SCRIPTED_LOCAL_SERIALIZATION_PROOF');
    // Actual provider serializer, intercepted before all network I/O. Only the
    // serialized request body is retained; no headers/credentials are recorded.
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (
        input !== 'https://api.openai.com/v1/responses' ||
        init?.method !== 'POST' ||
        typeof init.body !== 'string'
      ) {
        unexpected.push('external_fetch_forbidden');
        throw new Error('Only intercepted synthetic model transport admitted');
      }
      modelCalls++;
      const serialized = init.body;
      serializedModelRequests.push(serialized);
      expect(serialized).not.toMatch(
        /PRIVATE_VISIT|PRIVATE_BRANCH|2099-07-20|20\.07\.2099|16:17|17:23|Предстоящих: 1/,
      );
      const body = JSON.parse(serialized) as { input: string };
      const request = JSON.parse(body.input) as {
        phase: string;
        conversation: Array<{ role: string; content: string }>;
        tool_results: unknown[];
      };
      expect(request.phase).toBe('tool_planning');
      expect(request.tool_results).toEqual([]);
      expect(request.conversation.every((m) => m.role === 'user')).toBe(true);
      const text = request.conversation.at(-1)?.content;
      expect(Object.values(PROMPTS)).toContain(text);
      const plan = {
        semantic_plan: {
          parent_request: 'Покажи мои личные записи',
          language: 'ru',
          dialogue_act: 'question',
          tasks: [
            {
              id: 'own',
              intent: 'booking.list_own',
              entities_json: '{}',
              depends_on: [],
              confidence: 1,
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
        tool_call: { name: 'appointments.own.list', arguments_json: '{}' },
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [{ type: 'output_text', text: JSON.stringify(plan) }],
              },
            ],
            usage: {},
          }),
          { status: 200 },
        ),
      );
    });
    const handler = http.app.get(AiToolHandlerService);
    const execute = handler.execute.bind(handler);
    jest.spyOn(handler, 'execute').mockImplementation((...args) => {
      reads.push(args[0]);
      return execute(...args);
    });
  });
  afterAll(async () => {
    observations.reads = reads;
    observations.modelCalls = modelCalls;
    writeFileSync(
      path.join(output, stage + '-serialized-model-requests.json'),
      JSON.stringify(
        {
          syntheticTransportOnly: true,
          externalNetworkCalls: 0,
          requests: serializedModelRequests,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    observations.unexpected = unexpected;
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    if (stage === 'resume')
      for (const id of own)
        await db.prisma.tenant.update({
          where: { id },
          data: { status: 'cancelled' },
        });
    await http?.close();
    await db?.close();
  });
  async function salon(variant: number): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Personal dates synthetic',
      CalendarSource.INTERNAL,
    );
    own.add(tenant.id);
    const client = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.consultant',
      'ai.owner',
      'ai.admin',
      'booking',
      'booking.customer_app',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const linked = await fx.client(tenant, client);
    await db.prisma.client.update({
      where: { id: linked.clientId },
      data: { userId: null },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'PRIVATE_BRANCH_' + variant,
        timezone: 'Asia/Novosibirsk',
      },
    });
    const services = await Promise.all(
      [1, 2].map((n) =>
        db.prisma.internalService.create({
          data: {
            tenantId: tenant.id,
            name: 'PRIVATE_VISIT_' + variant + '_' + n,
            price: 1500,
            durationMinutes: 30,
          },
        }),
      ),
    );
    const provider = await db.prisma.internalProvider.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        displayName: 'Synthetic provider',
        active: true,
        slotIntervalMinutes: 30,
      },
    });
    await db.prisma.internalProviderService.createMany({
      data: services.map((service) => ({
        tenantId: tenant.id,
        providerId: provider.id,
        serviceId: service.id,
      })),
    });
    const start = new Date('2099-07-20T09:17:23Z'),
      end = new Date('2099-07-20T10:23:00Z');
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        mayaClientId: linked.clientId,
        clientId: null,
        branchId: branch.id,
        source: 'internal',
        staffExternalId: provider.id,
        serviceIds: services.map((s) => s.id),
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        status: 'confirmed',
      },
    });
    return {
      tenant,
      client,
      branchId: branch.id,
      appointmentId: appointment.id,
      linkId: linked.linkId,
    };
  }
  async function sourceState(s: Salon, mode: Mode) {
    if (mode === 'unlinked') {
      const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
        where: { id: s.linkId },
      });
      const token = randomUUID();
      const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
        verifyLink: () => Promise.reject(new Error('Creation not admitted')),
        verifyRevocation: (provided) =>
          provided === token
            ? Promise.resolve({
                tenantId: s.tenant.id,
                provider: 'maya_user',
                providerSubjectHash: link.providerSubjectHash,
                linkId: link.id,
                revocationIdentityHash: digest(token),
                actorProofHash: digest('synthetic-actor:' + token),
                reason: 'synthetic-personal-proof',
                validUntil: new Date(Date.now() + 600000),
              })
            : Promise.reject(new Error('Unknown proof')),
      });
      await db.tenantContext.runAsSystemTenant(s.tenant.id, () =>
        owner.revoke({ proof: token }),
      );
      return;
    }
    const start = new Date(
      mode === 'full' ? '2099-07-20T09:17:23Z' : '2099-07-20T10:23:00Z',
    );
    const end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.update({
      where: { id: s.appointmentId },
      data: {
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        status: mode === 'cancelled' ? 'canceled' : 'confirmed',
      },
    });
    await db.prisma.branch.update({
      where: { id: s.branchId },
      data: { timezone: mode === 'incomplete' ? null : 'Asia/Novosibirsk' },
    });
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
        1,
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
        domain: 'ADMIN',
        kind: 'TOOL_READ',
        taskKey: 'appointments.own.list',
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
        toolName: 'appointments.own.list',
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
      const first = await chat(token, PROMPTS.upcoming, requestId);
      observations.firstStatus = {
        status: first.status,
        body: first.body as unknown,
      };
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        action: null,
        grounding: { status: 'verified' },
      });
      expect((first.body as Chat).reply).toContain('20.07.2099, 16:17');
      const beforeReplay = reads.length;
      const replay = await chat(token, PROMPTS.upcoming, requestId);
      expect(replay.status).toBe(201);
      expect((replay.body as Chat).reply).toBe((first.body as Chat).reply);
      expect(reads).toHaveLength(beforeReplay);
      await sourceState(a, 'changed');
      const second = await chat(
        token,
        PROMPTS.changed,
        randomUUID(),
        [
          { role: 'user', content: PROMPTS.upcoming },
          { role: 'assistant', content: (first.body as Chat).reply },
        ],
        (first.body as Chat).user_turn.conversationId,
      );
      expect(second.status).toBe(201);
      expect((second.body as Chat).reply).toContain('20.07.2099, 17:23');
      expect((second.body as Chat).reply).not.toContain('16:17');
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
      const bChat = await chat(foreignToken, PROMPTS.upcoming);
      expect(bChat.status).toBe(201);
      expect((bChat.body as Chat).reply).toContain('PRIVATE_VISIT_99202');
      expect((bChat.body as Chat).reply).not.toContain('PRIVATE_VISIT_99201');
      const turns = await db.prisma.widgetTimelineTurn.findMany({
        where: {
          tenantId: a.tenant.id,
          role: 'assistant',
          textContent: { not: null },
        },
        orderBy: { turnIndex: 'asc' },
      });
      const replies = turns.map((t) =>
        decodeChatReply(db.encryption, t.textContent!),
      );
      expect(replies).toContain((first.body as Chat).reply);
      expect(replies).toContain((second.body as Chat).reply);
      expect(
        turns.every((t) => !t.textContent?.includes('PRIVATE_VISIT')),
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
      await sourceState(saved.salon, 'full');
      observations.restart = {
        applicationPidChanged: true,
        postgresStartedChanged: true,
        graphHashUnchanged: saved.graph,
      };
      const completed: string[] = [];
      let previousModelRequestCount = 0;
      const wireCheckpoints: Array<Record<string, unknown>> = [];
      observations.wireCheckpoints = wireCheckpoints;
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.resolve(
              '../maya-carrier-react/test/personal-dates-browser-probe.mjs',
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
          () => fail(new Error('Personal dates browser timeout')),
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
                  'upcoming',
                  'changed',
                  'incomplete',
                  'cancelled',
                  'unlinked',
                  'revoked',
                ][completed.length],
              );
              const expectsModelRequest = !['history', 'revoked'].includes(
                m.name,
              );
              expect(modelCalls).toBe(
                previousModelRequestCount + (expectsModelRequest ? 1 : 0),
              );
              expect(serializedModelRequests).toHaveLength(modelCalls);
              if (expectsModelRequest) {
                const wire = JSON.parse(serializedModelRequests.at(-1)!) as {
                  input: string;
                };
                const projected = JSON.parse(wire.input) as {
                  conversation: Array<{ role: string; content: string }>;
                };
                expect(projected.conversation.at(-1)?.content).toBe(
                  PROMPTS[m.name as keyof typeof PROMPTS],
                );
              }
              wireCheckpoints.push({
                checkpoint: m.name,
                requestCount: modelCalls,
                addedRequests: modelCalls - previousModelRequestCount,
                requestIndex: expectsModelRequest ? modelCalls - 1 : null,
                prompt: expectsModelRequest
                  ? PROMPTS[m.name as keyof typeof PROMPTS]
                  : null,
              });
              previousModelRequestCount = modelCalls;
              if (m.name === 'history') {
                expect(reads).toEqual([]);
                expect(modelCalls).toBe(0);
              }
              if (m.name === 'upcoming') {
                expect(m.body?.reply).toContain('20.07.2099, 16:17');
                expect(m.body?.grounding.status).toBe('verified');
                await sourceState(saved.salon, 'changed');
              }
              if (m.name === 'changed') {
                expect(m.body?.reply).toContain('20.07.2099, 17:23');
                expect(m.body?.grounding.status).toBe('verified');
                await sourceState(saved.salon, 'incomplete');
              }
              if (m.name === 'incomplete') {
                expect(m.body?.grounding.status).toBe('blocked');
                expect(m.body?.reply).not.toMatch(/16:17|17:23/);
                await sourceState(saved.salon, 'cancelled');
              }
              if (m.name === 'cancelled') {
                expect(m.body?.reply).toContain('Предстоящих: 0');
                await sourceState(saved.salon, 'unlinked');
              }
              if (m.name === 'unlinked') {
                expect(m.body?.grounding.status).toBe('blocked');
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
