import { MAYA_AI_TOOL_CATALOG } from '../ai-tools/ai-tool.catalog';
import { MAYA_CONVERSATION_TAXONOMY } from './conversation-taxonomy';

describe('conversation capability contract', () => {
  const tools = new Map(
    MAYA_AI_TOOL_CATALOG.map((tool) => [tool.name as string, tool]),
  );

  it('keeps every non-planned tool candidate registered', () => {
    for (const intent of MAYA_CONVERSATION_TAXONOMY) {
      if (intent.readiness === 'planned') {
        expect(intent.toolCandidates).toEqual([]);
        continue;
      }
      for (const toolName of intent.toolCandidates) {
        expect(tools.has(toolName)).toBe(true);
      }
    }
  });

  it('keeps the public MAYA OS conversation contract fully routable', () => {
    const incomplete = MAYA_CONVERSATION_TAXONOMY.filter(
      (intent) => intent.readiness !== 'ready',
    ).map((intent) => ({
      intent: intent.id,
      readiness: intent.readiness,
      note: intent.readinessNote,
    }));

    expect(incomplete).toEqual([]);
  });

  it('does not advertise an intent role unsupported by all candidate tools', () => {
    for (const intent of MAYA_CONVERSATION_TAXONOMY) {
      if (
        intent.readiness === 'planned' ||
        intent.toolCandidates.length === 0
      ) {
        continue;
      }
      const supportedRoles = new Set<string>(
        intent.toolCandidates.flatMap(
          (toolName) => tools.get(toolName)?.allowedRoles ?? [],
        ),
      );
      for (const role of intent.allowedRoles) {
        expect(supportedRoles.has(String(role))).toBe(true);
      }
    }
  });

  it('requires approval and idempotency for every executable capability', () => {
    for (const intent of MAYA_CONVERSATION_TAXONOMY) {
      if (
        intent.readiness === 'planned' ||
        !['write', 'execute'].includes(intent.action)
      ) {
        continue;
      }
      if (intent.id === 'finance.confirm_expenses_complete') {
        // Фраза владельца «дополнительных расходов нет» сама является явным
        // подтверждением. Второй approval ничего не защищает, но делает
        // расчёт прибыли раздражающе двухшаговым.
        expect(intent.risk).toBe('low');
        expect(intent.toolCandidates).toContain('expenses.period.complete');
        const declarationTool = tools.get('expenses.period.complete');
        expect(declarationTool?.approvalPolicy).toBe('none');
        expect(declarationTool?.idempotency).toBe('required');
        expect(declarationTool?.riskTier).toBe('low_write');
        continue;
      }
      if (intent.id === 'settings.update') {
        // Персональный переключатель аналитических подсказок затрагивает
        // только настройки самого вызывающего пользователя. Он не меняет
        // права, тариф, деньги или настройки бизнеса, поэтому отдельная
        // карточка подтверждения здесь была бы лишней.
        expect(intent.risk).toBe('medium');
        expect(intent.toolCandidates).toEqual(['settings.update']);
        const settingsTool = tools.get('settings.update');
        expect(settingsTool?.approvalPolicy).toBe('none');
        expect(settingsTool?.idempotency).toBe('required');
        expect(settingsTool?.riskTier).toBe('low_write');
        continue;
      }
      if (intent.id === 'tasks.complete') {
        // Сам запрос «отметь выполненной» уже выражает действие. Повторная
        // карточка подтверждения не нужна, но повтор запроса обязан быть
        // безопасным и не создавать второй побочный эффект.
        expect(intent.risk).toBe('low');
        expect(intent.toolCandidates).toEqual(['tasks.complete']);
        const taskTool = tools.get('tasks.complete');
        expect(taskTool?.approvalPolicy).toBe('none');
        expect(taskTool?.idempotency).toBe('required');
        expect(taskTool?.riskTier).toBe('low_write');
        continue;
      }
      expect(intent.risk).toBe('high');
      expect(intent.toolCandidates.length).toBeGreaterThan(0);
      for (const toolName of intent.toolCandidates) {
        const tool = tools.get(toolName);
        expect(tool?.approvalPolicy).not.toBe('none');
        expect(tool?.idempotency).toBe('required');
        expect(tool?.riskTier).not.toBe('read');
      }
    }
  });

  it('documents a precise boundary for every partial capability', () => {
    for (const intent of MAYA_CONVERSATION_TAXONOMY.filter(
      (item) => item.readiness === 'partial',
    )) {
      expect(intent.readinessNote).toEqual(expect.any(String));
      expect(intent.readinessNote?.length).toBeGreaterThan(20);
      expect(intent.toolCandidates.length).toBeGreaterThan(0);
    }
  });
});
