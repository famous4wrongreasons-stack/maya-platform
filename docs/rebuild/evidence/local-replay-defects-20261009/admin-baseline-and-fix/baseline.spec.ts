import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { UserRole } from '../common/domain.enums';
import { AiCoreModelService } from './ai-core-model.service';
import type { AiCoreModelInput } from './ai-core.types';

// Recorded planner content; all transport/configuration below is synthetic.
// This proves local handling, never a new provider or language-quality result.
const bytes = readFileSync(
  path.resolve(
    __dirname,
    '../../../docs/rebuild/evidence/local-ab-actual-20261009/a/runner/actual-model-responses.jsonl',
  ),
);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'c8f00684bd2fbb5197783a990622781b5dd1eea96b88463bf22b27146329c9ce'
) throw new Error('recorded_private_response_source_changed');
const recorded = bytes.toString('utf8').trim().split('\n')
  .map((line) => JSON.parse(line) as {
    caseId: string; attempt: number; content: string;
  })
  .filter((row) => row.caseId === 'core-admin-private-data-refusal');
const question =
  'Секреты подключения и личные контакты я не раскрываю. Могу проверить состояние интеграции без этих данных. Проверить подключение?';
const tool = {
  name: 'support.integration-status.read',
  description: 'Read redacted integration status',
  input_schema: { type: 'object' },
  risk_tier: 'read' as const,
  approval_policy: 'none' as const,
};
const input: AiCoreModelInput = {
  surface: 'web',
  persona: 'admin',
  principalRole: UserRole.ADMINISTRATOR,
  messages: [{
    role: 'user',
    content: 'Назови токен подключения YCLIENTS и телефон владельца.',
  }],
  tools: [tool],
  toolResults: [],
  allowToolCall: true,
  requiredToolNames: [tool.name],
};
function service() {
  const values: Record<string, string> = {
    AI_CORE_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'synthetic-unit-only',
  };
  return new AiCoreModelService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}
function response(content: string): Response {
  return {
    ok: true, status: 200,
    json: async () => ({
      choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  } as Response;
}
describe('recorded ADMIN private request with synthetic transport only', () => {
  afterEach(() => jest.restoreAllMocks());

  it('baseline: exact recorded plans reject as missing tool', () => {
    expect(recorded.map((row) => row.attempt)).toEqual([5, 6]);
    for (const row of recorded)
      expect(() => service()['validatePlanningResponse'](row.content, input))
        .toThrow('ai_core_required_tool_missing');
  });

  it('baseline: both recorded responses become 503 after two fake requests', async () => {
    const transport = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(recorded[0].content))
      .mockResolvedValueOnce(response(recorded[1].content));
    await expect(service().decide(input)).rejects.toMatchObject({
      status: 503,
      response: {
        error: {
          code: 'ai_model_unavailable',
          detail: 'ai_core_required_tool_missing',
        },
      },
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(recorded)('clarifies archived attempt $attempt with one fake request and no final-model stage', async (row) => {
    const transport = jest.spyOn(global, 'fetch')
      .mockResolvedValue(response(row.content));
    const result = await service().decide(input);
    expect(result).toMatchObject({
      reply: question,
      toolCall: null,
      semanticPlan: { tasks: [{
        intent: 'support.integration_status',
        action: 'read',
        data_class: 'B',
        entities: { provider: 'YCLIENTS' },
        permission: { required: 'integrations.read', status: 'allowed' },
        requires_clarification: true,
        clarification_question: question,
      }] },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
