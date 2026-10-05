import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import captures from '../../src/ai-tools/fixtures/deepseek-v4-pro-semantic-slot-failures.json';
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
});
