import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
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
      data: { name: 'Моделирование бороды' },
    });
    await db.prisma.internalProvider.update({
      where: { id: source.staffId },
      data: { displayName: 'Антон' },
    });
    const other = await db.prisma.internalProvider.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Илья',
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
      data: Array.from({ length: 7 }, (_, weekday) => ({
        tenantId: tenant.id,
        providerId: other.id,
        weekday,
        startMinute: 1020,
        endMinute: 1080,
      })),
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
    const prompts: string[] = [];
    const plans: unknown[] = [];
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        prompts.push(JSON.stringify(input.messages));
        plans.push(input.conversationPlan);
        return model.decide(input);
      });
    let index = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      // Scripted variants use the saved live response shape and real parser; only
      // the separate raw-capture regression claims exact transcript replay.
      const output = JSON.parse(captured[index === 2 ? 1 : 0].content) as {
        semantic_plan: {
          tasks: { entities?: unknown; entities_json?: string }[];
        };
        tool_call: { arguments_json: string };
      };
      const task = output.semantic_plan.tasks[0];
      delete task.entities;
      task.entities_json = JSON.stringify(
        index === 0
          ? {
              date_or_period: day,
              employee: '[name removed]',
              services: ['моделирование бороды'],
            }
          : index === 1
            ? { employee: '[name removed]' }
            : { time: '17:00' },
      );
      output.tool_call.arguments_json = JSON.stringify(
        index === 2
          ? {
              staff_id: '[name removed]',
              service_ids: ['моделирование бороды'],
              start: `${day}T17:00:00+03:00`,
            }
          : {
              staff_id: '[name removed]',
              service_ids: ['моделирование бороды'],
              date: `${day}T00:00:00+03:00`,
            },
      );
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
      `Мастер Антон, моделирование бороды на ${day}`,
      'Теперь мастер Илья',
      'Запиши меня на 17:00',
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
      expect(body.resolution?.receipt.envelope.kind).toBe('TIME_SLOT_SELECTOR');
      envelope = body.resolution?.receipt.envelope;
    }
    expect(
      prompts.every((p) => !p.includes('Антон') && !p.includes('Илья')),
    ).toBe(true);
    expect(index).toBe(3);
    expect(plans[1]).toMatchObject({
      tasks: [
        {
          entities: {
            date_or_period: day,
            services: ['Моделирование бороды'],
            employee: 'Антон',
          },
        },
      ],
    });
    expect(plans[2]).toMatchObject({
      tasks: [
        {
          entities: {
            date_or_period: day,
            services: ['Моделирование бороды'],
            employee: 'Илья',
          },
        },
      ],
    });
    const availabilityCalls = reads.mock.calls.filter(
      (c) => c[0] === 'booking.availability.read',
    );
    expect(availabilityCalls.map((c) => c[2].staff_id)).toEqual([
      source.staffId,
      other.id,
      other.id,
    ]);
    expect(
      availabilityCalls.every(
        (c) => (c[2].service_ids as string[])[0] === source.serviceId,
      ),
    ).toBe(true);
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
    const selectedStart = `${day}T17:00:00+03:00`;
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
  it.each(['foreign_staff', 'foreign_service', 'duplicate_name'] as const)(
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
      jest
        .spyOn(http.app.get(AiCoreModelService), 'decide')
        .mockImplementation((input) => model.decide(input));
      const employee =
        scenario === 'foreign_staff' ? foreign.staffId : '[name removed]';
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
      jest.spyOn(global, 'fetch').mockResolvedValue(
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
        'Уточните точное имя мастера',
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
