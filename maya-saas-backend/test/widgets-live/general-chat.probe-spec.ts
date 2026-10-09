/** Actual auth/chat/history/PG; scripted semantics through the real parser.
 * No CRM or model transport is allowed. This is not language acceptance. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolRuntimeService } from '../../src/ai-tools/ai-tool-runtime.service';
import { C9Orchestrator } from '../../src/orchestration/c9.orchestrator';
import { UserRole, CalendarSource } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';
import { object } from './support/release-booking-flow';

assertProofDatabase();
const output = process.env.JEST_GENERAL_CHAT_OUTPUT;
assert.ok(
  output && path.isAbsolute(output),
  'Use the owned general-chat proof driver',
);
const corpus = readFileSync(
  path.resolve(
    __dirname,
    '../../datasets/conversation-intelligence/utterances.jsonl',
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map(
    (line) =>
      JSON.parse(line) as {
        id: string;
        utterance: string;
        intent: string;
        entities: Record<string, string>;
      },
  );
const corpusRow = corpus.find(
  (row) => row.id === 'utt-general.explain_term-016',
)!;
const explanation =
  'Средний чек — сумма продаж, разделённая на количество чеков. Здесь я объясняю термин без расчёта данных салона.';

describe('General explanation with unavailable analytics [HTTP PG / SCRIPTED]', () => {
  let db: FixtureContext, http: HttpHarness;
  let token: string, foreignToken: string, tenantId: string, userId: string;
  let conversationId: string;
  let modelCalls = 0,
    completed = false;
  let nextTasks: unknown[] = [];
  const transcripts: unknown[] = [];
  let runtime: jest.SpyInstance,
    c9: jest.SpyInstance,
    fetchGuard: jest.SpyInstance;
  const general = {
    intent: corpusRow.intent,
    entities_json: JSON.stringify(corpusRow.entities),
    confidence: 1,
  };
  const finance = {
    intent: 'finance.revenue',
    entities_json: JSON.stringify({ period: 'this_month' }),
    confidence: 1,
  };
  beforeAll(async () => {
    fetchGuard = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error(
        'General chat proof forbids all model/provider/outbound fetch',
      );
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant('general-chat', CalendarSource.INTERNAL);
    const user = await fx.user(tenant, UserRole.EMPLOYEE);
    tenantId = tenant.id;
    userId = user.id;
    for (const feature of [
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    token = await http.login(tenant.slug, user.email, user.password);
    const foreign = await fx.tenant(
      'general-chat-foreign',
      CalendarSource.INTERNAL,
    );
    const outsider = await fx.user(foreign, UserRole.EMPLOYEE);
    for (const feature of [
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(foreign, feature);
    foreignToken = await http.login(
      foreign.slug,
      outsider.email,
      outsider.password,
    );
    runtime = jest.spyOn(http.app.get(AiToolRuntimeService), 'execute');
    c9 = jest.spyOn(http.app.get(C9Orchestrator), 'conversationRead');
    const model = http.app.get(AiCoreModelService);
    jest.spyOn(model, 'decide').mockImplementation((input) => {
      modelCalls++;
      expect(modelCalls).toBeLessThanOrEqual(5);
      expect(input.principalRole).toBe(UserRole.EMPLOYEE);
      expect(input.tools.length).toBeGreaterThan(0);
      expect(input.tools.map((tool) => tool.name)).not.toContain(
        'analytics.business.query',
      );
      expect(input.toolResults).toEqual([]);
      expect(input.messages.every((message) => message.role === 'user')).toBe(
        true,
      );
      const parsed = model['validatePlanningResponse'](
        JSON.stringify({
          semantic_plan: { dialogue_act: 'question', tasks: nextTasks },
          tool_call: null,
        }),
        input,
      );
      return Promise.resolve({
        ...parsed,
        reply:
          nextTasks.length === 1 && nextTasks[0] === general
            ? explanation
            : 'UNSOURCED_REVENUE_999999',
        provider: 'openai',
        model: 'SCRIPTED_GENERAL_CHAT',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
  });
  afterAll(async () => {
    try {
      writeFileSync(
        path.join(output, 'conversation.json'),
        JSON.stringify(
          {
            qualification: 'ACTUAL_HTTP_AUTH_HISTORY_PG_SCRIPTED_SEMANTICS',
            status: completed ? 'passed' : 'failed',
            corpusSource: corpusRow.id,
            transcripts,
            modelDecisions: modelCalls,
            runtimeExecutions: runtime?.mock.calls.length,
            c9Reads: c9?.mock.calls.length,
            outboundFetches: fetchGuard?.mock.calls.length,
            realModelAcceptance: false,
            realProviderAcceptance: false,
            browserAcceptance: false,
            restartClaim: false,
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      jest.restoreAllMocks();
      await http?.close();
      await db?.close();
    }
  });
  async function chat(
    content: string,
    tasks: unknown[],
    access = token,
    conversation = conversationId,
  ) {
    nextTasks = tasks;
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('authorization', 'Bearer ' + access)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        ...(conversation ? { conversationId: conversation } : {}),
        messages: [{ role: 'user', content }],
      });
    const body = object(response.body);
    transcripts.push({ content, status: response.status, body });
    return { status: response.status, body };
  }
  function noReads() {
    expect(runtime).not.toHaveBeenCalled();
    expect(c9).not.toHaveBeenCalled();
    expect(fetchGuard).not.toHaveBeenCalled();
  }
  it('answers the exact existing corpus question, then refuses facts and returns to explanation in the same persisted chat', async () => {
    const first = await chat(corpusRow.utterance, [general]);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      reply: explanation,
      action: null,
      tools_used: [],
      grounding: { status: 'not_required' },
    });
    conversationId = String(object(first.body.user_turn).conversationId);
    expect(conversationId).not.toBe('undefined');
    const denied = await chat('Какая выручка бизнеса за этот месяц?', [
      finance,
    ]);
    expect(denied.status).toBe(201);
    expect(denied.body).toMatchObject({
      action: null,
      tools_used: [],
      grounding: { status: 'blocked' },
    });
    expect(denied.body.reply).not.toContain('999999');
    expect(denied.body.reply).toContain('недоступен');
    const third = await chat('Объясни средний чек простыми словами', [general]);
    expect(third.status).toBe(201);
    expect(third.body.reply).toBe(explanation);
    expect(object(third.body.user_turn).conversationId).toBe(conversationId);
    const saved = await request(http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('authorization', 'Bearer ' + token);
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).toContain(explanation);
    expect(JSON.stringify(saved.body)).not.toContain('999999');
    transcripts.push({ history: object(saved.body) });
    expect(modelCalls).toBe(3);
    noReads();
  });
  it('does not let a compound general plus closed-data plan bypass the source boundary', async () => {
    const response = await chat(
      'Объясни выручку и покажи выручку бизнеса за этот месяц',
      [general, finance],
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      action: null,
      tools_used: [],
      grounding: { status: 'blocked' },
    });
    expect(response.body.reply).not.toContain('999999');
    noReads();
  });
  it('rejects a foreign conversation and current membership revocation before model work', async () => {
    const before = modelCalls;
    const foreign = await chat(corpusRow.utterance, [general], foreignToken);
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    await db.prisma.membership.updateMany({
      where: { tenantId, userId },
      data: { status: 'suspended' },
    });
    const revoked = await chat(corpusRow.utterance, [general]);
    expect(revoked.status).toBeGreaterThanOrEqual(400);
    expect(modelCalls).toBe(before);
    noReads();
    expect(await db.prisma.actionExecution.count()).toBe(0);
    expect(await db.prisma.aiToolExecution.count()).toBe(0);
    expect(await db.prisma.marketingDeliveryAttempt.count()).toBe(0);
    completed = true;
  });
});
