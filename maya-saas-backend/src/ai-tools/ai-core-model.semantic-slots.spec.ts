import { ConfigService } from '@nestjs/config';
import { AiCoreModelService } from './ai-core-model.service';
import type { AiCoreModelInput } from './ai-core.types';
import { UserRole } from '../common/domain.enums';
import captures from './fixtures/deepseek-v4-pro-semantic-slot-failures.json';

describe('real DeepSeek semantic slot captures (no provider calls)', () => {
  const service = new AiCoreModelService(new ConfigService());
  const input: AiCoreModelInput = {
    surface: 'web',
    persona: 'admin',
    principalRole: UserRole.CLIENT,
    messages: [{ role: 'user', content: 'Проверить свободное время' }],
    allowToolCall: true,
    requiredToolNames: [],
    toolResults: [],
    tools: [
      {
        name: 'booking.availability.read',
        description: 'Availability',
        input_schema: { type: 'object' },
        risk_tier: 'read',
        approval_policy: 'none',
      },
    ],
  };
  it.each(captures)(
    'accepts captured plan $request without changing its tool arguments',
    (capture) => {
      const raw = JSON.parse(capture.output) as {
        tool_call: { arguments_json: string };
        semantic_plan: { tasks: { entities_json: string }[] };
      };
      const originalEntities = JSON.parse(
        raw.semantic_plan.tasks[0].entities_json,
      ) as { date: string; service: string };
      const result = service['validatePlanningResponse'](capture.output, input);
      const task = result.semanticPlan.tasks[0];
      expect(task.requires_clarification).toBe(false);
      expect(task.entities.date_or_period).toBe(originalEntities.date);
      expect(task.entities).not.toHaveProperty('date');
      expect(task.entities).not.toHaveProperty('service');
      expect(Array.isArray(task.entities.services)).toBe(true);
      expect(result.toolCall?.arguments).toEqual(
        JSON.parse(raw.tool_call.arguments_json),
      );
      expect(result.toolCall?.name).toBe('booking.availability.read');
    },
  );
  it('still rejects missing, conflicting and fabricated entity keys before any tool', () => {
    for (const entities of [
      { service: 'Стрижка' },
      { date: '2026-10-05', date_or_period: '2026-10-06' },
      { day_guess: '2026-10-05' },
      { date: false },
    ]) {
      const raw = JSON.parse(captures[0].output) as {
        semantic_plan: { tasks: { entities_json: string }[] };
      };
      raw.semantic_plan.tasks[0].entities_json = JSON.stringify(entities);
      expect(() =>
        service['validatePlanningResponse'](JSON.stringify(raw), input),
      ).toThrow();
    }
  });
});
