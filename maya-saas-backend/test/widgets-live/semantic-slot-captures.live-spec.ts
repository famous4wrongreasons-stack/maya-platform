import { spawn } from 'node:child_process';
import path from 'node:path';
import { TimelineStore } from '../../src/widgets/stores/timeline.store';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import captures from '../../src/ai-tools/fixtures/deepseek-v4-pro-semantic-slot-failures.json';
import bounded from '../../src/ai-tools/fixtures/deepseek-v4-pro-bounded-recheck.json';
import followups from '../../src/ai-tools/fixtures/deepseek-v4-pro-followup-failures.json';
import type {
  AiCoreModelInput,
  AiCoreModelDecision,
} from '../../src/ai-tools/ai-core.types';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

describe('Captured semantic aliases [HTTP] [PostgreSQL] [recorded model transport]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fx.teardown();
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });
  it('routes a captured date alias through actual parser/read owner and preserves conversation on date follow-up', async () => {
    const tenant = await fx.tenant(
      'Synthetic captured planner proof',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    await fx.bookingSource(tenant, user, true);
    for (const feature of [
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const model = new AiCoreModelService(
      new ConfigService({
        AI_CORE_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'captured-placeholder',
        DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
      }),
    );
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => model.decide(input));
    const captured = captures.find((c) => c.request === 5)!;
    let date = '2026-10-05';
    const transport = jest.spyOn(global, 'fetch').mockImplementation(() => {
      const output = JSON.parse(captured.output) as {
        semantic_plan: { tasks: { entities_json: string }[] };
        tool_call: { arguments_json: string };
      };
      if (date !== '2026-10-05') {
        const entities = JSON.parse(
          output.semantic_plan.tasks[0].entities_json,
        ) as Record<string, unknown>;
        entities.date = date;
        output.semantic_plan.tasks[0].entities_json = JSON.stringify(entities);
        output.tool_call.arguments_json = JSON.stringify({
          date: date + 'T00:00:00+03:00',
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: JSON.stringify(output) },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });
    const read = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    const chat = (text: string, conversationId?: string) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId: randomUUID(),
          messages: [{ role: 'user', content: text }],
          ...(conversationId ? { conversationId } : {}),
        });
    const first = await chat('Проверь свободное время на 2026-10-05');
    expect(first.status).toBe(201);
    const ref = (first.body as { user_turn: { conversationId: string } })
      .user_turn;
    expect(ref.conversationId).toBeTruthy();
    date = '2026-10-06';
    const second = await chat('А на 2026-10-06?', ref.conversationId);
    expect(second.status).toBe(201);
    expect(
      (second.body as { user_turn: { conversationId: string } }).user_turn
        .conversationId,
    ).toBe(ref.conversationId);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(read.mock.calls)).toContain('2026-10-05');
    expect(JSON.stringify(read.mock.calls)).toContain('2026-10-06');
    expect(
      await db.prisma.actionExecution.count({
        where: {
          tenantId: tenant.id,
          actionClass: {
            in: [
              'create_appointment',
              'cancel_appointment',
              'reschedule_appointment',
            ],
          },
        },
      }),
    ).toBe(0);
  });
  it('restores encrypted semantic context across HTTP turns and refuses captured confirmation language without receipt', async () => {
    const tenant = await fx.tenant(
      'Synthetic follow-up context',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    await fx.bookingSource(tenant, user, true);
    for (const feature of [
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const model = new AiCoreModelService(
      new ConfigService({
        AI_CORE_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'captured-placeholder',
        DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
      }),
    );
    const inputs: AiCoreModelInput[] = [],
      decisions: AiCoreModelDecision[] = [];
    const bindModel = () =>
      jest
        .spyOn(http.app.get(AiCoreModelService), 'decide')
        .mockImplementation(async (input) => {
          inputs.push(input);
          const decision = await model.decide(input);
          if (decision) decisions.push(decision);
          return decision;
        });
    bindModel();
    let index = 0;
    const selected = [23, 24, 25].map((n) =>
      followups.find((c) => c.request === n)!,
    );
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: selected[index++].content },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    let conversationId: string | undefined;
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    const replies: string[] = [];
    const userTurnIds: string[] = [];
    for (const text of [
      'По актуальным данным, есть окна к Антону завтра на моделирование бороды. Покажи главный вывод первым.',
      'Запиши меня на 17:00',
      'Подтверждаю эту запись',
    ]) {
      if (index === 1) {
        await http.close();
        http = await bootHttp();
        bindModel();
      }
      messages.push({ role: 'user', content: text });
      const response = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId: randomUUID(),
          messages,
          ...(conversationId ? { conversationId } : {}),
        });
      expect(response.status).toBe(201);
      const body = response.body as {
        reply: string;
        action: unknown;
        user_turn: { conversationId: string; turnId: string };
      };
      conversationId = body.user_turn.conversationId;
      userTurnIds.push(body.user_turn.turnId);
      expect(body.action).toBeNull();
      replies.push(body.reply);
      messages.push({ role: 'assistant', content: body.reply });
    }
    expect(inputs[1].conversationPlan?.tasks[0].entities.date_or_period).toBe(
      'tomorrow',
    );
    expect(decisions[1].semanticPlan?.tasks[0].entities).toMatchObject({
      date: 'tomorrow',
      time: '17:00',
      services: ['моделирование бороды'],
    });
    expect(replies[2]).toContain(
      'Подтверждённого результата выполнения пока нет.',
    );
    expect(replies[2]).not.toContain('Подтверждаю запись');
    expect(
      await db.prisma.actionExecution.count({
        where: {
          tenantId: tenant.id,
          actionClass: {
            in: [
              'create_appointment',
              'cancel_appointment',
              'reschedule_appointment',
            ],
          },
        },
      }),
    ).toBe(0);
    const stored = await db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId: tenant.id, role: 'assistant' },
      select: { textContent: true, principalProofHash: true },
    });
    expect(stored.length).toBe(3);
    // Later replies cannot become context for an earlier/concurrent request.
    expect(
      await db.prisma.$transaction((tx) =>
        TimelineStore.readChatContext(
          tx,
          tenant.id,
          stored[0].principalProofHash,
          conversationId!,
          new Date(),
          db.encryption,
          userTurnIds[0],
        ),
      ),
    ).toBeNull();

    const readContext = (proofHash: string, now: Date) =>
      db.prisma.$transaction((tx) =>
        TimelineStore.readChatContext(
          tx,
          tenant.id,
          proofHash,
          conversationId!,
          now,
          db.encryption,
          userTurnIds[2],
        ),
      );
    expect(await readContext(randomUUID(), new Date())).toBeNull();
    expect(
      await readContext(stored[0].principalProofHash, new Date('2200-01-01')),
    ).toBeNull();
    expect(
      await readContext(stored[0].principalProofHash, new Date()),
    ).toMatchObject({ version: 'maya.chat-semantic-context/1' });
    expect(JSON.stringify(stored)).not.toContain('tomorrow');
    const history = await request(http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(JSON.stringify(history.body)).not.toContain('semanticContext');
    expect(inputs[0].messages[0].content).toContain('[name removed]');
    expect(inputs[0].messages[0].content).not.toContain('Антон');
    // The failed free-text read is not repaired by inventing fixture IDs. The user
    // explicitly reselects actual catalog entries through the production carrier.
    jest.restoreAllMocks();
    const catalog = await http.executeTool(
      token,
      'catalog.services.read',
      { arguments: {}, surface: 'web' },
      randomUUID(),
    );
    expect([200, 201]).toContain(catalog.status);
    const envelope = (
      catalog.body as {
        resolution: { receipt: { envelope: Record<string, unknown> } };
      }
    ).resolution.receipt.envelope;
    const payload = {
      baseUrl: await http.listenLoopback(),
      accessToken: token,
      tenantName: 'Synthetic follow-up',
      envelope,
    };
    const shell = await new Promise<{ assistantLines: string[] }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          [path.resolve('test/widgets-live/support/shell-booking-flow.mjs')],
          {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );
        let stdout = '',
          stderr = '';
        child.stdout.on('data', (b) => {
          stdout += String(b);
        });
        child.stderr.on('data', (b) => {
          stderr += String(b);
        });
        child.once('error', reject);
        child.once('close', (code) =>
          code === 0
            ? resolve(JSON.parse(stdout) as { assistantLines: string[] })
            : reject(new Error(`carrier failed ${code}: ${stderr}`)),
        );
        child.stdin.end(JSON.stringify(payload));
      },
    );
    expect(shell.assistantLines).toContain('Запись подтверждена.');
    const executions = await db.prisma.actionExecution.findMany({
      where: { tenantId: tenant.id, actionClass: 'create_appointment' },
      select: { state: true, executionAttemptCount: true },
    });
    expect(executions).toEqual([
      { state: 'SUCCEEDED', executionAttemptCount: 1 },
    ]);
    const resolved = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    const widgets = (
      resolved.body as {
        widgets: {
          terminal_lines?: { outcome: string; action_receipt_ref: string }[];
        }[];
      }
    ).widgets;
    expect(
      widgets.some((w) =>
        w.terminal_lines?.some(
          (line) =>
            line.outcome === 'CONFIRMED' &&
            typeof line.action_receipt_ref === 'string' &&
            line.action_receipt_ref.length > 0,
        ),
      ),
    ).toBe(true);
  });
  it('clarifies the exact bounded-live references absent from this synthetic catalog before any mutation receipt', async () => {
    const tenant = await fx.tenant(
      'Synthetic bounded invalid references',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    await fx.bookingSource(tenant, user, true);
    for (const feature of [
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const model = new AiCoreModelService(
      new ConfigService({
        AI_CORE_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'captured-placeholder',
        DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
      }),
    );
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => model.decide(input));
    let index = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: bounded[index++].content },
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const first = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        messages: [
          {
            role: 'user',
            content: 'Есть окна к Антону завтра на моделирование бороды?',
          },
        ],
      });
    expect(first.status).toBe(201);
    const original = first.body as {
      reply: string;
      user_turn: { conversationId: string };
    };
    const second = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        conversationId: original.user_turn.conversationId,
        messages: [
          {
            role: 'user',
            content: 'Есть окна к Антону завтра на моделирование бороды?',
          },
          { role: 'assistant', content: original.reply },
          { role: 'user', content: 'Запиши меня на 17:00' },
        ],
      });
    expect(second.status).toBe(201);
    expect(JSON.stringify(second.body)).toContain(
      'Уточните точное имя мастера',
    );
    expect((second.body as { action: unknown }).action).toBeNull();
    expect(index).toBe(2);
    expect(
      await db.prisma.actionExecution.count({
        where: {
          tenantId: tenant.id,
          actionClass: {
            in: [
              'create_appointment',
              'cancel_appointment',
              'reschedule_appointment',
            ],
          },
        },
      }),
    ).toBe(0);
  });
});
