/** Owned actual HTTP/PG/current React READ. Synthetic task contents and scripted
 * tool selection only; no provider/model/network acceptance or restart claim. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { object, list } from './support/release-booking-flow';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { InboxService } from '../../src/inbox/inbox.service';
import { localCalendarDate } from '../../src/owner-reports/owner-reports.time';

const output = process.env.JEST_OWN_TASKS_OUTPUT;
assert.ok(
  output && path.isAbsolute(output),
  'Use the owned own-tasks proof driver',
);
assertProofDatabase();
const PROMPTS = {
  all: 'Покажи все мои задачи',
  active: 'Покажи мои активные задачи',
  today: 'Покажи мои задачи на сегодня',
  overdue: 'Покажи мои просроченные задачи',
  revoked: 'Какие у меня задачи?',
};
type FilterKey = Exclude<keyof typeof PROMPTS, 'revoked'>;
const FILTERS: Record<FilterKey, { status: string; period: string }> = {
  all: { status: 'all', period: 'all' },
  active: { status: 'active', period: 'all' },
  today: { status: 'all', period: 'today' },
  overdue: { status: 'all', period: 'overdue' },
};
const TEXT = {
  stale: 'Синтетическая задача PRIVATE_TASK_FIXTURE_STALE',
  archived: 'Синтетическая задача PRIVATE_TASK_FIXTURE_ARCHIVED',
  missing: 'Синтетическая задача PRIVATE_TASK_FIXTURE_MISSING',
  today: 'Синтетическая задача PRIVATE_TASK_FIXTURE_TODAY',
  overdue: 'Синтетическая задача PRIVATE_TASK_FIXTURE_OVERDUE',
  historicalActive: 'Историческая запись PRIVATE_TASK_FIXTURE_OLD_ACTIVE',
  historicalCompleted: 'Историческая запись PRIVATE_TASK_FIXTURE_OLD_DONE',
  teammate: 'Чужая задача PRIVATE_TASK_FIXTURE_TEAMMATE',
  foreign: 'Чужой салон PRIVATE_TASK_FIXTURE_FOREIGN',
};
const HISTORY_LABEL =
  'Исторические записи — текущий статус не подтверждён. Они показаны отдельно, без фильтра по статусу и сроку.';
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Actor = { tenant: TenantFixture; user: UserFixture };

describe('Own tasks canonical READ [ACTUAL HTTP PG REACT / SYNTHETIC CONTENT]', () => {
  let db: FixtureContext, http: HttpHarness, own: Actor, foreign: Actor;
  let snapshotHash: string, mark: number;
  let modelCalls = 0;
  const unexpected: string[] = [],
    checkpoints: string[] = [];
  const observations: Record<string, unknown> = {
    contract: 'maya.own-tasks-http-react-proof/1',
    status: 'running',
    scriptedModel: true,
    realModelAcceptance: false,
    realProviderAcceptance: false,
    setup:
      'ACTUAL_A23_HTTP_CREATE_COMPLETE_PLUS_EXPLICIT_SYNTHETIC_INBOX_DIVERGENCE',
    missingInboxSeam:
      'SYNTHETIC_PROJECTION_FAILURE_AFTER_REAL_CANONICAL_CREATE',
    businessEffectsScope: 'READ_PHASE_AFTER_SETUP_BASELINE',
    restartClaim: false,
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      unexpected.push('external_fetch');
      throw new Error('All provider/model/outbound fetch forbidden');
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        expect(modelCalls).toBeLessThanOrEqual(5);
        expect(input.toolResults).toEqual([]);
        const serialized = JSON.stringify(input);
        expect(serialized).not.toContain('PRIVATE_TASK_FIXTURE_');
        expect(input.messages.every((message) => message.role === 'user')).toBe(
          true,
        );
        const prompt = input.messages.at(-1)?.content;
        const key = (Object.keys(FILTERS) as FilterKey[]).find(
          (name) => PROMPTS[name] === prompt,
        );
        assert.ok(
          key,
          'Only finite explicit task requests reach the synthetic model',
        );
        return Promise.resolve({
          reply: '',
          toolCall: { name: 'tasks.list', arguments: FILTERS[key] },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_OWN_TASKS',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });
  afterAll(async () => {
    if (observations.status === 'running') observations.status = 'failed';
    observations.modelCalls = modelCalls;
    observations.realModelCalls = 0;
    observations.unexpected = unexpected;
    observations.checkpoints = checkpoints;
    if (db && own && foreign) {
      observations.setupActionExecutions =
        await db.prisma.actionExecution.count({
          where: { tenantId: { in: [own.tenant.id, foreign.tenant.id] } },
        });
      observations.devicePushTokens = await db.prisma.devicePushToken.count({
        where: { tenantId: { in: [own.tenant.id, foreign.tenant.id] } },
      });
    }
    writeFileSync(
      path.join(output, 'own-tasks-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  const post = (token: string, route: string, body: object) =>
    request(http.app.getHttpServer())
      .post('/api/' + route)
      .set('authorization', 'Bearer ' + token)
      .set('idempotency-key', randomUUID())
      .send(body);
  async function actor(label: string): Promise<Actor> {
    const fx = fixturesForHttp(db, http),
      tenant = await fx.tenant(label, CalendarSource.INTERNAL);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
      'notifications.core',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'Europe/Moscow' },
    });
    return { tenant, user };
  }
  const login = (value: Actor) =>
    http.login(value.tenant.slug, value.user.email, value.user.password);
  async function createTask(
    value: Actor,
    token: string,
    body: string,
    dueAt: string | null,
    assigneeUserId = value.user.id,
    missing = false,
  ) {
    const hold = missing
      ? jest
          .spyOn(http.app.get(InboxService), 'publishForTenant')
          .mockRejectedValueOnce(new Error('Synthetic missing projection'))
      : undefined;
    let response;
    try {
      response = await post(token, 'operational-work/create', {
        assigneeUserId,
        title: 'Синтетическая задача',
        bodyText: body,
        dueAt,
      });
    } finally {
      hold?.mockRestore();
    }
    expect(response.status).toBe(201);
    const row = await db.prisma.operationalWorkItem.findFirstOrThrow({
      where: { tenantId: value.tenant.id, bodyText: body, assigneeUserId },
      include: { createExecution: true, inboxItems: true },
    });
    expect(row.createExecution).toMatchObject({
      state: 'SUCCEEDED',
      dryRun: false,
      actionClass: 'create_operational_task',
    });
    expect(row.status).toBe('OPEN');
    expect(row.inboxItems).toHaveLength(missing ? 0 : 1);
    if (missing) expect(object(response.body).projectionPending).toBe(true);
    return row;
  }
  async function businessSnapshot() {
    const where = { tenantId: { in: [own.tenant.id, foreign.tenant.id] } },
      orderBy = { id: 'asc' as const };
    return digest({
      actions: await db.prisma.actionExecution.findMany({ where, orderBy }),
      tasks: await db.prisma.operationalWorkItem.findMany({ where, orderBy }),
      inbox: await db.prisma.inboxItem.findMany({ where, orderBy }),
      appointments: await db.prisma.appointment.count({ where }),
      deliveryAttempts: await db.prisma.marketingDeliveryAttempt.count({
        where,
      }),
    });
  }
  async function noEffects() {
    expect(await businessSnapshot()).toBe(snapshotHash);
    const family =
      'Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalWorkItem|OperationalAlert|ExpenseReminder';
    const writes = http.recorder
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
      );
    expect(writes).toEqual([]);
    expect(unexpected).toEqual([]);
  }
  const expectedBodies = (key: FilterKey) =>
    key === 'all'
      ? [TEXT.stale, TEXT.archived, TEXT.missing, TEXT.today, TEXT.overdue]
      : key === 'active'
        ? [TEXT.missing, TEXT.today, TEXT.overdue]
        : key === 'today'
          ? [TEXT.stale, TEXT.today]
          : [TEXT.archived, TEXT.overdue];
  function assertReply(value: unknown, key: FilterKey) {
    const body = object(value);
    expect(body.action).toBeNull();
    expect(body.resolution).toBeUndefined();
    expect(object(body.grounding).status).toBe('verified');
    expect(object(body.coordination).state).toBe('COMPLETED');
    expect(typeof body.reply).toBe('string');
    const [canonical, historical] = (body.reply as string).split(HISTORY_LABEL);
    expect(historical).toBeDefined();
    for (const text of expectedBodies(key)) expect(canonical).toContain(text);
    for (const text of expectedBodies('all').filter(
      (text) => !expectedBodies(key).includes(text),
    ))
      expect(canonical).not.toContain(text);
    for (const text of [TEXT.historicalActive, TEXT.historicalCompleted])
      expect(historical).toContain(text);
    expect(historical).not.toMatch(/— (?:активна|выполнена)/);
    for (const text of [TEXT.foreign, TEXT.teammate])
      expect(body.reply).not.toContain(text);
    if (key === 'all')
      for (const text of [TEXT.stale, TEXT.archived])
        expect(canonical).toContain(`«${text}» — выполнена`);
    return body.reply as string;
  }
  async function c9Count(expected: number) {
    const rows = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId: own.tenant.id },
    });
    expect(rows).toHaveLength(expected);
    for (const row of rows)
      expect(row).toMatchObject({
        kind: 'TOOL_READ',
        taskKey: 'tasks.list',
        domain: 'ADMIN',
        state: 'SETTLED',
      });
    expect(
      await db.prisma.c9Run.count({
        where: { tenantId: own.tenant.id, state: 'COMPLETED' },
      }),
    ).toBe(expected);
  }
  it('reads canonical state despite stale/missing Inbox, retains one reply, and rejects revoked authority without effects', async () => {
    own = await actor('Own tasks synthetic');
    foreign = await actor('Foreign tasks synthetic');
    const token = await login(own),
      foreignToken = await login(foreign);
    const teammate = await fixturesForHttp(db, http).user(
      own.tenant,
      UserRole.TENANT_OWNER,
    );
    const today = localCalendarDate('Europe/Moscow', new Date());
    const yesterday = new Date(
      new Date(today + 'T00:00:00Z').getTime() - 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const todayDue = today + 'T09:00:00.000Z',
      overdueDue = yesterday + 'T09:00:00.000Z';
    for (const [body, dueAt, archived] of [
      [TEXT.stale, todayDue, false],
      [TEXT.archived, overdueDue, true],
    ] as const) {
      const task = await createTask(own, token, body, dueAt);
      const complete = await post(token, 'operational-work/complete', {
        inboxItemId: task.inboxItems[0].id,
      });
      expect(complete.status).toBe(201);
      const canonical = await db.prisma.operationalWorkItem.findUniqueOrThrow({
        where: { id: task.id },
        include: { completeExecution: true },
      });
      expect(canonical.status).toBe('COMPLETED');
      expect(canonical.completeExecution?.state).toBe('SUCCEEDED');
      // Explicit synthetic projection divergence; the canonical A23 result is untouched.
      await db.prisma.inboxItem.update({
        where: { id: task.inboxItems[0].id },
        data: {
          archivedAt: archived ? new Date() : null,
          payloadJson: { status: 'active', due_date: dueAt.slice(0, 10) },
        },
      });
    }
    await createTask(own, token, TEXT.missing, null, own.user.id, true);
    await createTask(own, token, TEXT.today, todayDue);
    await createTask(own, token, TEXT.overdue, overdueDue);
    await createTask(own, token, TEXT.teammate, todayDue, teammate.id);
    await createTask(foreign, foreignToken, TEXT.foreign, todayDue);
    for (const [body, status] of [
      [TEXT.historicalActive, 'active'],
      [TEXT.historicalCompleted, 'completed'],
    ] as const)
      await db.prisma.inboxItem.create({
        data: {
          tenantId: own.tenant.id,
          userId: own.user.id,
          type: 'maya_task',
          sourceEventId: 'synthetic-history:' + randomUUID(),
          title: 'Синтетическая история',
          bodyText: body,
          payloadJson: { status, due_date: '2035-01-01' },
          operationalWorkItemId: null,
        },
      });
    snapshotHash = await businessSnapshot();
    mark = http.recorder.mark();
    observations.businessSnapshotSha256 = snapshotHash;
    for (const key of Object.keys(FILTERS) as FilterKey[]) {
      const response = await http.executeTool(
        token,
        'tasks.list',
        { surface: 'web', arguments: FILTERS[key] },
        randomUUID(),
      );
      expect(response.status).toBe(201);
      const result = object(object(response.body).result),
        tasks = list(result.tasks).map(object),
        history = list(result.historical_tasks).map(object);
      expect(result).toMatchObject({
        contract: 'maya.own-operational-tasks/1',
        source: 'OperationalWorkItem',
        scope: 'authenticated_user',
        timezone: 'Europe/Moscow',
        filters: FILTERS[key],
        count: expectedBodies(key).length,
        historical_count: 2,
        historical_scope: 'unfiltered_retained_history',
        truncated: false,
      });
      expect(tasks.map((task) => task.task).sort()).toEqual(
        [...expectedBodies(key)].sort(),
      );
      for (const task of tasks)
        expect(task.status).toBe(
          [TEXT.stale, TEXT.archived].includes(task.task as string)
            ? 'completed'
            : 'active',
        );
      if (key === 'all')
        expect(tasks.find((task) => task.task === TEXT.missing)?.id).toBeNull();
      for (const row of history)
        expect(row).toMatchObject({
          canonical: false,
          read_only: true,
          status: 'unverified',
        });
      observations['http-' + key] = {
        count: tasks.length,
        historicalCount: history.length,
        canonicalStatuses: tasks.map((task) => task.status),
        noForeignAssigneeOrTenant: true,
      };
      await noEffects();
    }
    const chat = await post(token, 'ai/chat', {
      surface: 'web',
      requestId: randomUUID(),
      messages: [{ role: 'user', content: PROMPTS.all }],
    });
    expect(chat.status).toBe(201);
    const retainedReply = assertReply(chat.body, 'all');
    expect(modelCalls).toBe(1);
    await c9Count(1);
    await noEffects();
    const history = await request(http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('authorization', 'Bearer ' + token);
    expect(history.status).toBe(200);
    expect(JSON.stringify(history.body)).toContain(
      JSON.stringify(retainedReply).slice(1, -1),
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/own-tasks-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let pending = Promise.resolve(),
        failure: Error | undefined,
        stderr = '',
        killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded own tasks browser timeout')),
        300000,
      );
      child.stderr!.on('data', (buffer: Buffer) => {
        stderr += buffer.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = object(raw);
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output,
                email: own.user.email,
                retainedReply,
                historyLabel: HISTORY_LABEL,
                expected: Object.fromEntries(
                  (Object.keys(FILTERS) as FilterKey[]).map((key) => [
                    key,
                    {
                      present: expectedBodies(key),
                      absent: expectedBodies('all').filter(
                        (text) => !expectedBodies(key).includes(text),
                      ),
                    },
                  ]),
                ),
                historicalBodies: [
                  TEXT.historicalActive,
                  TEXT.historicalCompleted,
                ],
                completedBodies: [TEXT.stale, TEXT.archived],
                missingInboxBody: TEXT.missing,
                excludedBodies: [TEXT.foreign, TEXT.teammate],
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            const name = String(message.name);
            expect(name).toBe(
              [
                'history',
                'active',
                'all',
                'today',
                'overdue',
                'reload',
                'revoked',
              ][checkpoints.length],
            );
            if (name in FILTERS) assertReply(message.body, name as FilterKey);
            const expectedReads =
              name === 'history'
                ? 1
                : name === 'active'
                  ? 2
                  : name === 'all'
                    ? 3
                    : name === 'today'
                      ? 4
                      : 5;
            expect(modelCalls).toBe(expectedReads);
            await c9Count(expectedReads);
            await noEffects();
            if (name === 'reload')
              await db.prisma.membership.update({
                where: {
                  userId_tenantId: {
                    userId: own.user.id,
                    tenantId: own.tenant.id,
                  },
                },
                data: { status: 'suspended' },
              });
            if (name === 'revoked')
              expect([401, 403]).toContain(message.status);
            observations[name] = {
              modelCalls,
              exactC9TaskReadReceipts: expectedReads,
              businessSnapshotUnchanged: true,
              ...(name === 'revoked' ? { status: message.status } : {}),
            };
            checkpoints.push(name);
            child.send({ type: 'continue:' + name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(
                  new Error(
                    `Own tasks browser ${code}: ${stderr.slice(-2000)}`,
                  ),
                ),
        );
      });
    });
    expect(checkpoints).toHaveLength(7);
    await noEffects();
    observations.status = 'passed';
    observations.businessEffectsAfterSetup = 0;
    observations.providerFetches = 0;
  }, 360000);
});
