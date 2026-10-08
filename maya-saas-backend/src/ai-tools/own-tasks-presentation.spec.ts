import { ownTasksReply } from './own-tasks-presentation';

describe('own operational tasks source reply', () => {
  const completed = {
    id: 'private-inbox-id',
    canonical: true,
    task: 'Проверить отчёт',
    content_truncated: false,
    status: 'completed',
    due_at: '2026-10-07T22:00:00.000Z',
    due_date: '2026-10-08',
    created_at: '2026-10-06T12:00:00.000Z',
  };
  const history = {
    id: 'private-history-id',
    canonical: false,
    read_only: true,
    task: 'Историческое поручение',
    content_truncated: false,
    status: 'unverified',
    recorded_status: 'active',
    due_date: '2026-10-01',
    created_at: '2026-10-01T12:00:00.000Z',
  };
  const payload = {
    contract: 'maya.own-operational-tasks/1',
    source: 'OperationalWorkItem',
    scope: 'authenticated_user',
    timezone: 'Europe/Moscow',
    as_of: '2026-10-08T09:00:00.000Z',
    as_of_date: '2026-10-08',
    filters: { status: 'all', period: 'today' },
    tasks: [completed],
    count: 1,
    historical_tasks: [history],
    historical_count: 1,
    historical_scope: 'unfiltered_retained_history',
    canonical_truncated: false,
    historical_truncated: false,
    truncated: false,
  };
  it('reports canonical completion and tenant-local due date, without treating historical payload as current status', () => {
    const result = ownTasksReply(payload);
    expect(result.status).toBe('verified');
    expect(result.reply).toContain(
      '«Проверить отчёт» — выполнена; срок 2026-10-08',
    );
    expect(result.reply).toContain(
      'Исторические записи — текущий статус не подтверждён',
    );
    expect(result.reply).toContain('без фильтра по статусу и сроку');
    expect(result.reply).not.toMatch(
      /private-|OperationalWorkItem|«Историческое поручение» — активна/,
    );
  });
  it.each([
    ['stale', { ...payload, stale: true }],
    ['missing', {}],
    ['wrong owner', { ...payload, source: 'InboxItem' }],
    ['foreign scope', { ...payload, scope: 'tenant' }],
    ['bad timezone', { ...payload, timezone: 'unknown' }],
    ['false today', { ...payload, as_of_date: '2026-10-07' }],
    ['count mismatch', { ...payload, count: 0 }],
    [
      'wrong filter',
      { ...payload, filters: { status: 'active', period: 'all' } },
    ],
    [
      'wrong due day',
      { ...payload, tasks: [{ ...completed, due_date: '2026-10-07' }] },
    ],
    [
      'invented status',
      { ...payload, tasks: [{ ...completed, status: 'cancelled' }] },
    ],
    [
      'history as current',
      { ...payload, historical_tasks: [{ ...history, status: 'active' }] },
    ],
    ['unreadable body', { ...payload, tasks: [{ ...completed, task: '' }] }],
  ])('blocks %s without claiming empty or complete tasks', (_name, data) => {
    const result = ownTasksReply(data);
    expect(result.status).toBe('blocked');
    expect(result.reply).toContain('нельзя считать, что задач нет');
    expect(result.reply).not.toContain('Проверить отчёт');
  });
  it('respects stale execution even when the source object looks valid', () => {
    expect(ownTasksReply(payload, true).status).toBe('blocked');
  });
  it('qualifies canonical and historical limits separately and removes control characters', () => {
    const tasks = Array.from({ length: 11 }, (_, i) => ({
      ...completed,
      task: i === 0 ? 'x'.repeat(241) + '\n\u202e' : `Task ${i}`,
    }));
    const result = ownTasksReply({
      ...payload,
      tasks,
      count: 11,
      historical_tasks: Array.from({ length: 6 }, () => history),
      historical_count: 6,
    });
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('Показана часть задач');
    expect(result.reply).toContain('Показана часть исторических записей');
    expect(result.reply).toContain('Длинные описания сокращены');
    expect(result.reply).not.toMatch(/Task 10|\u202e/);
    expect(result.reply.length).toBeLessThan(2500);
  });
  it('reports no canonical matches independently of unverified history', () => {
    const result = ownTasksReply({ ...payload, tasks: [], count: 0 });
    expect(result.status).toBe('verified');
    expect(result.reply).toContain(
      'Задач с подтверждённым текущим статусом по этим фильтрам нет',
    );
    expect(result.reply).toContain('Историческое поручение');
  });
});
