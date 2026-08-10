import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { ClientIntelligenceService } from './client-intelligence.service';

describe('ClientIntelligenceService', () => {
  const owner: AuthenticatedUser = {
    userId: 'owner-a',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  it('checks the real CRM read path instead of claiming access from a template', async () => {
    const { service, crm } = createService();
    crm.getClientReturnCandidates.mockResolvedValue([]);

    const result = await service.tryHandle(
      owner,
      dto('У тебя есть доступ к базе клиентов YClients?'),
    );

    expect(crm.getClientReturnCandidates).toHaveBeenCalledWith('tenant-a', 1, {
      lookbackDays: 90,
      futureDays: 14,
    });
    expect(result?.reply).toContain('Проверила YClients');
  });

  it('does not silently choose the first client when CRM search is ambiguous', async () => {
    const { service, crm } = createService();
    crm.searchClients.mockResolvedValue([
      { id: '1', name: 'Иван Петров', phone: '+79180001111' },
      { id: '2', name: 'Иван Сидоров', phone: '+79180002222' },
    ]);

    const result = await service.tryHandle(
      owner,
      dto('Расскажи про клиента Иван'),
    );

    expect(crm.getClientVisitHistory).not.toHaveBeenCalled();
    expect(result?.card).toMatchObject({
      widget: 'client_dossier',
      widget_data: { mode: 'ambiguous' },
    });
    expect(JSON.stringify(result)).not.toContain('+7918000');
  });

  it('labels booked service value honestly and includes no-shows and cancellations', async () => {
    const { service, crm } = createService();
    crm.searchClients.mockResolvedValue([
      { id: '1', name: 'Иван Петров', phone: '+79180001111' },
    ]);
    crm.getClientVisitHistory.mockResolvedValue([
      {
        start: '2026-05-01T09:00:00.000Z',
        status: 'completed',
        service_names: ['Стрижка'],
        booked_service_value: 2_000,
      },
      {
        start: '2026-06-01T09:00:00.000Z',
        status: 'completed',
        service_names: ['Стрижка'],
        booked_service_value: 2_000,
      },
      {
        start: '2026-07-01T09:00:00.000Z',
        status: 'no_show',
        service_names: ['Стрижка'],
        booked_service_value: 2_000,
      },
      {
        start: '2026-07-10T09:00:00.000Z',
        status: 'canceled',
        service_names: ['Стрижка'],
        booked_service_value: 2_000,
      },
    ]);

    const result = await service.tryHandle(owner, dto('Покажи клиента 1111'));

    expect(result?.reply).toContain('неявок — 1, отмен — 1');
    expect(result?.reply).toContain('не фактически оплаченная сумма');
    expect(result?.reply).not.toContain('потратил');
    expect(result?.card).toMatchObject({
      widget: 'client_dossier',
      widget_data: {
        completed_visits: 2,
        no_shows: 1,
        canceled_visits: 1,
        average_cycle_days: 31,
        booked_service_value_rub: 4_000,
      },
    });
  });

  it('understands a natural client question without a formal dossier command', async () => {
    const { service, crm } = createService();
    crm.searchClients.mockResolvedValue([
      { id: '1', name: 'Иван Петров', phone: '+79180001111' },
    ]);
    crm.getClientVisitHistory.mockResolvedValue([]);

    await service.tryHandle(owner, dto('Иван Петров, что он обычно берёт?'));

    expect(crm.searchClients).toHaveBeenCalledWith('tenant-a', 'Иван Петров');
  });

  it('returns a private, deduplicated CRM return queue without raw phones', async () => {
    const { service, crm } = createService();
    crm.getClientReturnCandidates.mockResolvedValue([
      {
        client_id: '1',
        name: 'Иван Петров',
        phone: '+79180001111',
        reason_code: 'no_show',
        last_completed_visit: '2026-06-01T09:00:00.000Z',
        last_event_at: '2026-08-01T09:00:00.000Z',
        average_cycle_days: 30,
        days_overdue: null,
      },
    ]);

    const result = await service.tryHandle(
      owner,
      dto('Кого из клиентов нужно вернуть?'),
    );

    expect(result?.card).toMatchObject({
      widget: 'client_return_candidates',
      widget_data: { total_count: 1, requires_confirmation: true },
    });
    expect(JSON.stringify(result)).not.toContain('+79180001111');
    expect(JSON.stringify(result)).toContain('1111');
    expect(result?.reply).toContain('Никакая рассылка не запущена');
  });

  it('routes an exact three-month inactivity request to the private CRM tool', async () => {
    const { service, crm } = createService();
    crm.getClientReturnCandidates.mockResolvedValue([
      {
        client_id: '1',
        name: 'Иван Петров',
        phone: '+79180001111',
        reason_code: 'inactive_period',
        last_completed_visit: '2026-04-01T09:00:00.000Z',
        last_event_at: '2026-04-01T09:00:00.000Z',
        average_cycle_days: 30,
        days_overdue: 41,
      },
    ]);

    const result = await service.tryHandle(
      owner,
      dto('Возьми из нашей базы тех кто не был у нас больше 3 месяцев'),
    );

    expect(crm.getClientReturnCandidates).toHaveBeenCalledWith('tenant-a', 50, {
      lookbackDays: 365,
      futureDays: 90,
      inactiveDays: 90,
    });
    expect(result?.card).toMatchObject({
      widget: 'client_return_candidates',
      widget_data: {
        total_count: 1,
        shown_count: 1,
        filter: {
          type: 'inactive_period',
          threshold_days: 90,
          lookback_days: 365,
        },
      },
    });
    expect(result?.reply).toContain('последний завершённый визит');
    expect(result?.reply).toContain('больше 90 дней назад');
    expect(result?.reply).not.toContain('новые');
    expect(result?.reply).toContain('Никакая рассылка не запущена');
  });

  it('understands a three-month inactivity period written in words', async () => {
    const { service, crm } = createService();
    crm.getClientReturnCandidates.mockResolvedValue([]);

    await service.tryHandle(
      owner,
      dto('Покажи, кто не приходил больше трёх месяцев'),
    );

    expect(crm.getClientReturnCandidates).toHaveBeenCalledWith('tenant-a', 50, {
      lookbackDays: 365,
      futureDays: 90,
      inactiveDays: 90,
    });
  });

  it('delegates a master dossier question to the redacted catalog tool', async () => {
    const { service, crm } = createService();

    const result = await service.tryHandle(
      { ...owner, role: UserRole.STAFF },
      dto('Расскажи про клиента Иван'),
    );

    expect(result).toBeNull();
    expect(crm.searchClients).not.toHaveBeenCalled();
    expect(crm.getClientReturnCandidates).not.toHaveBeenCalled();
  });

  it('does not expose the full return queue to a regular master', async () => {
    const { service, crm } = createService();

    const result = await service.tryHandle(
      { ...owner, role: UserRole.STAFF },
      dto('Кого из клиентов нужно вернуть?'),
    );

    expect(result?.toolUsage.status).toBe('denied');
    expect(crm.searchClients).not.toHaveBeenCalled();
    expect(crm.getClientReturnCandidates).not.toHaveBeenCalled();
  });

  it('does not expose an exact inactivity segment to a regular master', async () => {
    const { service, crm } = createService();

    const result = await service.tryHandle(
      { ...owner, role: UserRole.STAFF },
      dto('Возьми из нашей базы тех кто не был у нас больше 3 месяцев'),
    );

    expect(result?.toolUsage.status).toBe('denied');
    expect(crm.getClientReturnCandidates).not.toHaveBeenCalled();
  });

  function dto(content: string) {
    return {
      surface: 'native' as const,
      audience: 'owner' as const,
      requestId: 'request_client_123',
      messages: [{ role: 'user' as const, content }],
    };
  }

  function createService() {
    const crm = {
      searchClients: jest.fn(),
      getClientVisitHistory: jest.fn(),
      getClientReturnCandidates: jest.fn(),
    };
    return {
      crm,
      service: new ClientIntelligenceService(crm as unknown as CrmService),
    };
  }
});
