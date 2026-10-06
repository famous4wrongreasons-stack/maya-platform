import { localCalendarDate } from '../../src/owner-reports/owner-reports.time';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiMemoryService } from '../../src/ai-tools/ai-memory.service';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import captured from '../../src/ai-tools/fixtures/deepseek-v4-pro-bounded-recheck.json';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

// Explicitly scripted model transport + synthetic INTERNAL catalog. Not DeepSeek or provider acceptance.
describe('Natural booking catalog binding [HTTP] [PostgreSQL] [scripted model] [production carrier]', () => {
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
  it('preserves date/service, replaces staff, then reaches canonical preview and one AE receipt from the chat selector', async () => {
    const tenant = await fx.tenant(
      'Synthetic connected catalog proof',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    const source = await fx.bookingSource(tenant, user, true);
    await db.prisma.internalService.update({
      where: { id: source.serviceId },
      data: { name: 'Борода' },
    });
    await db.prisma.internalService.create({
      data: {
        tenantId: tenant.id,
        name: 'Стрижка',
        price: 2000,
        durationMinutes: 30,
      },
    });
    await db.prisma.internalProvider.update({
      where: { id: source.staffId },
      data: { displayName: 'Стас' },
    });
    const other = await db.prisma.internalProvider.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Александр',
        active: true,
        slotIntervalMinutes: 30,
      },
    });
    await db.prisma.internalProviderService.create({
      data: {
        tenantId: tenant.id,
        providerId: other.id,
        serviceId: source.serviceId,
      },
    });
    await db.prisma.internalAvailabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => [
        {
          tenantId: tenant.id,
          providerId: other.id,
          weekday,
          startMinute: 540,
          endMinute: 600,
        },
        {
          tenantId: tenant.id,
          providerId: other.id,
          weekday,
          startMinute: 1080,
          endMinute: 1140,
        },
      ]).flat(),
    });
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
        DEEPSEEK_API_KEY: 'offline-placeholder',
        DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
      }),
    );
    const day = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const tomorrow = localCalendarDate(
      'Europe/Moscow',
      new Date(Date.now() + 86_400_000),
    );
    const prompts: string[] = [];
    const plans: unknown[] = [];
    const serializedRequests: string[] = [];
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        prompts.push(JSON.stringify(input.messages));
        plans.push(input.conversationPlan);
        return model.decide(input);
      });
    let index = 0;
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      if (typeof init?.body !== 'string')
        throw new Error('Expected serialized body');
      serializedRequests.push(init.body);
      // Scripted variants use the saved live response shape and real parser; only
      // the separate raw-capture regression claims exact transcript replay.
      const output = JSON.parse(captured[index === 9 ? 1 : 0].content) as {
        semantic_plan: {
          tasks: { entities?: unknown; entities_json?: string }[];
        };
        tool_call: { arguments_json: string } | null;
      };
      const mentions =
        prompts.at(-1)!.match(/\[name removed\]@[a-f0-9]{32}_\d+/g) ?? [];
      const entities = [
        { employee: mentions[0], branch: 'private-branch-synthetic' },
        { date_or_period: day, services: ['борода'] },
        { employee: mentions[0] },
        { employee: mentions.at(-1) },
        {}, // self-name is deliberately NOT an employee selection
        { services: ['стрижка', 'борода'] },
        { services: ['борода'] },
        { date_or_period: tomorrow },
        { time_of_day: 'evening' },
        { time: '18:30' },
      ][index];
      const task = output.semantic_plan.tasks[0];
      delete task.entities;
      task.entities_json = JSON.stringify(entities);
      output.tool_call!.arguments_json = JSON.stringify(
        index === 9
          ? {
              staff_id: '[name removed]',
              service_ids: ['борода'],
              start: `${tomorrow}T18:30:00+03:00`,
            }
          : {
              staff_id: '[name removed]',
              service_ids: ['борода'],
              date: '2000-01-01T00:00:00+03:00', // deliberately stale tool day; semantic preference must win
            },
      );
      if (index === 0) output.tool_call = null;
      index++;
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
    const reads = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
    let conversationId: string | undefined;
    let envelope: unknown;
    const texts = [
      'Хочу у Стаса',
      `На бороду на ${day}`,
      'А у Александра?',
      'Не у Стаса, а у Александра',
      'Меня зовут Стас, мастер прежний',
      'Стрижка и борода',
      'Тогда только борода',
      'А завтра?',
      'Давай вечером',
      'В 18:30',
    ];
    for (const text of texts) {
      const response = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId: randomUUID(),
          messages: [{ role: 'user', content: text }],
          ...(conversationId ? { conversationId } : {}),
        });
      expect(response.status).toBe(201);
      const body = response.body as {
        reply: string;
        action: unknown;
        user_turn: { conversationId: string };
        resolution?: { receipt: { envelope: { kind: string } } };
      };
      conversationId = body.user_turn.conversationId;
      expect(body.action).toBeNull();
      if (index === 1 || index === 6 || index === 9) {
        expect(Boolean(body.resolution)).toBe(false);
        expect(body.reply).toContain(
          index === 1
            ? 'Какую услугу и на какую дату'
            : index === 6
              ? 'только на одну услугу'
              : 'Во сколько вам удобно?',
        );
      } else {
        expect(body.resolution?.receipt.envelope.kind).toBe(
          'TIME_SLOT_SELECTOR',
        );
        envelope = body.resolution?.receipt.envelope;
      }
    }
    expect(prompts.every((p) => !/Стас|Александр/.test(p))).toBe(true);
    expect(index).toBe(10);
    // Actual provider request bodies, not only the messages passed to decide.
    // Every turn resumes encrypted history, including negation, replacement,
    // self-name and a multi-service clarification. No network is used.
    expect(serializedRequests).toHaveLength(10);
    for (const body of serializedRequests) {
      const data = JSON.stringify(
        (JSON.parse(body) as { messages: { role: string }[] }).messages.filter(
          (m) => m.role !== 'system',
        ),
      );
      expect(/Стас|Стаса|Александр|Александра/.test(data)).toBe(false);
      expect(data.includes('private-branch-synthetic')).toBe(false);
      for (const id of [
        source.staffId,
        other.id,
        source.serviceId,
        tenant.id,
        user.id,
      ])
        expect(body).not.toContain(id);
    }
    const previousAliases = plans
      .slice(1)
      .map(
        (plan) =>
          (plan as { tasks: { entities: { employee: string } }[] }).tasks[0]
            .entities.employee,
      );
    expect(new Set(previousAliases).size).toBe(previousAliases.length);

    const branchAliases = plans
      .slice(1)
      .map(
        (plan) =>
          (plan as { tasks: { entities: { branch: string } }[] }).tasks[0]
            .entities.branch,
      );
    expect(
      branchAliases.every((alias) =>
        /^\[reference removed\]@[a-f0-9]{32}_\d+$/.test(alias),
      ),
    ).toBe(true);
    expect(new Set(branchAliases).size).toBe(branchAliases.length);
    expect(plans[2]).toMatchObject({
      tasks: [
        {
          entities: {
            date_or_period: day,
            services: ['Борода'],
          },
        },
      ],
    });
    expect(plans[6]).toMatchObject({
      tasks: [
        {
          entities: {
            date_or_period: day,
            services: ['Стрижка', 'Борода'],
          },
        },
      ],
    });
    expect(plans[9]).toMatchObject({
      tasks: [
        {
          entities: {
            date_or_period: tomorrow,
            services: ['Борода'],
            time_of_day: 'evening',
          },
        },
      ],
    });
    const availabilityCalls = reads.mock.calls.filter(
      (c) => c[0] === 'booking.availability.read',
    );
    expect(availabilityCalls.map((c) => c[2].staff_id)).toEqual([
      source.staffId,
      ...Array<string>(6).fill(other.id),
    ]);
    expect(
      availabilityCalls.every(
        (c) => (c[2].service_ids as string[])[0] === source.serviceId,
      ),
    ).toBe(true);
    expect(availabilityCalls.at(-1)?.[2].date).toContain(tomorrow);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: tenant.id, actionClass: 'create_appointment' },
      }),
    ).toBe(0);
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: tenant.id },
      }),
    ).toBe(0);
    const selectedStart = `${tomorrow}T18:30:00+03:00`;
    const baseUrl = await http.listenLoopback();
    const shell = await new Promise<{
      assistantLines: string[];
      selectedStart: string;
    }>((resolve, reject) => {
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
          ? resolve(
              JSON.parse(stdout) as {
                assistantLines: string[];
                selectedStart: string;
              },
            )
          : reject(new Error(`carrier ${code}: ${stderr}`)),
      );
      child.stdin.end(
        JSON.stringify({
          baseUrl,
          accessToken: token,
          tenantName: 'Synthetic catalog',
          envelope,
          selectedStart,
          expectedStaffLabel: 'Александр',
        }),
      );
    });
    expect(Date.parse(shell.selectedStart)).toBe(Date.parse(selectedStart));
    expect(shell.assistantLines).toContain('Запись подтверждена.');
    expect(
      await db.prisma.actionExecution.findMany({
        where: { tenantId: tenant.id, actionClass: 'create_appointment' },
        select: { state: true, executionAttemptCount: true },
      }),
    ).toEqual([{ state: 'SUCCEEDED', executionAttemptCount: 1 }]);
    const appointment = await db.prisma.appointment.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(appointment.staffExternalId).toBe(other.id);
    expect(appointment.serviceIds).toEqual([source.serviceId]);
    expect(appointment.startAt.toISOString()).toBe(
      new Date(selectedStart).toISOString(),
    );
    expect(appointment.mayaClientId).toEqual(expect.any(String));
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
  it('projects a known uncommon name inside a full resumed assistant transcript before serialization', async () => {
    const tenant = await fx.tenant(
      'Synthetic transcript privacy',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    const source = await fx.bookingSource(tenant, user, true);
    await db.prisma.internalService.update({
      where: { id: source.serviceId },
      data: { name: 'Моделирование бороды' },
    });
    await db.prisma.internalProvider.update({
      where: { id: source.staffId },
      data: { displayName: 'Рустам Ахметов' },
    });
    for (const feature of [
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const provider = new AiCoreModelService(
      new ConfigService({
        AI_CORE_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'offline-placeholder',
      }),
    );
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => provider.decide(input));
    const bodies: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      if (typeof init?.body !== 'string')
        throw new Error('Expected serialized body');
      bodies.push(init.body);
      const output = JSON.parse(captured[0].content) as {
        semantic_plan: { tasks: { entities_json: string }[] };
        tool_call: { arguments_json: string } | null;
      };
      // The scripted first selection establishes real encrypted server context;
      // it is not evidence that an actual model can infer an unseen staff name.
      output.semantic_plan.tasks[0].entities_json = JSON.stringify(
        bodies.length === 1
          ? { employee: 'Рустам Ахметов' }
          : { services: ['Моделирование бороды'], date_or_period: 'tomorrow' },
      );
      output.tool_call =
        bodies.length === 1
          ? null
          : {
              arguments_json: JSON.stringify({
                staff_id: '[name removed]',
                service_ids: ['Моделирование бороды'],
              }),
            };
      if (output.tool_call)
        Object.assign(output.tool_call, { name: 'booking.availability.read' });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: JSON.stringify(output) },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    const first = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Хочу к этому мастеру' }],
      });
    expect(first.status).toBe(201);
    const conversationId = (
      first.body as { user_turn: { conversationId: string } }
    ).user_turn.conversationId;
    jest
      .spyOn(http.app.get(AiMemoryService), 'listForModel')
      .mockResolvedValue(['Мастер Рустам Ахметов предпочитает утро']);
    const second = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        conversationId,
        messages: [
          {
            role: 'assistant',
            content: 'Рустам Ахметов: выберем услугу и время.',
          },
          { role: 'user', content: 'Борода завтра' },
        ],
      });
    expect(second.status).toBe(201);
    expect(bodies.length).toBe(2);
    for (const body of bodies) expect(/Рустам|Ахметов/.test(body)).toBe(false);
    const payload = JSON.parse(bodies[1]) as {
      messages: { content: string }[];
    };
    const data = JSON.parse(payload.messages.at(-1)!.content) as {
      conversation: { content: string }[];
    };
    expect(data.conversation[0].content).toMatch(
      /^\[name removed\]@[a-f0-9]{32}_\d+: выберем/,
    );
    expect(
      (
        second.body as {
          resolution?: { receipt: { envelope: { kind: string } } };
        }
      ).resolution?.receipt.envelope.kind,
    ).toBe('TIME_SLOT_SELECTOR');
  });

  it.each([
    'foreign_staff',
    'foreign_service',
    'duplicate_name',
    'stale_alias',
  ] as const)(
    'refuses %s before availability, approval or booking execution',
    async (scenario) => {
      const tenant = await fx.tenant(
        'Synthetic binding refusal',
        CalendarSource.INTERNAL,
      );
      const user = await fx.user(tenant, UserRole.CLIENT);
      const source = await fx.bookingSource(tenant, user, true);
      await db.prisma.internalProvider.update({
        where: { id: source.staffId },
        data: { displayName: 'Антон' },
      });
      await db.prisma.internalService.update({
        where: { id: source.serviceId },
        data: { name: 'Моделирование бороды' },
      });
      const foreignTenant = await fx.tenant(
        'Foreign synthetic catalog',
        CalendarSource.INTERNAL,
      );
      const foreignUser = await fx.user(foreignTenant, UserRole.CLIENT);
      const foreign = await fx.bookingSource(foreignTenant, foreignUser);
      if (scenario === 'duplicate_name')
        await db.prisma.internalProvider.create({
          data: { tenantId: tenant.id, displayName: 'Антон', active: true },
        });
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
          DEEPSEEK_API_KEY: 'offline-placeholder',
          DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
        }),
      );
      let currentMention = '';
      jest
        .spyOn(http.app.get(AiCoreModelService), 'decide')
        .mockImplementation((input) => {
          currentMention =
            JSON.stringify(input.messages).match(
              /\[name removed\]@[a-f0-9]{32}_\d+/,
            )?.[0] ?? '';
          return model.decide(input);
        });
      const employee =
        scenario === 'foreign_staff'
          ? foreign.staffId
          : scenario === 'stale_alias'
            ? '[name removed]@00000000000000000000000000000000_1'
            : '[name removed]';
      const services = [
        scenario === 'foreign_service'
          ? foreign.serviceId
          : 'моделирование бороды',
      ];
      const output = JSON.parse(captured[0].content) as {
        semantic_plan: { tasks: { entities_json: string }[] };
        tool_call: { arguments_json: string };
      };
      output.semantic_plan.tasks[0].entities_json = JSON.stringify({
        date_or_period: 'tomorrow',
        employee,
        services,
      });
      output.tool_call.arguments_json = JSON.stringify({
        date: '2026-10-06T00:00:00+03:00',
        staff_id: employee,
        service_ids: services,
      });
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        if (scenario !== 'foreign_staff' && scenario !== 'stale_alias')
          output.semantic_plan.tasks[0].entities_json = JSON.stringify({
            date_or_period: 'tomorrow',
            employee: currentMention,
            services,
          });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'stop',
                  message: { content: JSON.stringify(output) },
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
        );
      });
      const handler = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
      const response = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId: randomUUID(),
          messages: [
            {
              role: 'user',
              content:
                scenario === 'foreign_staff'
                  ? 'Покажи время у выбранного мастера завтра'
                  : 'Мастер Антон завтра',
            },
          ],
        });
      expect(response.status).toBe(201);
      expect((response.body as { reply: string }).reply).toContain(
        scenario === 'foreign_service'
          ? 'Уточните услугу'
          : 'Уточните точное имя мастера',
      );
      expect(
        handler.mock.calls.some((c) => c[0] === 'booking.availability.read'),
      ).toBe(false);
      expect(
        await db.prisma.aiApprovalRequest.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(0);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: tenant.id, actionClass: 'create_appointment' },
        }),
      ).toBe(0);
    },
  );
});
