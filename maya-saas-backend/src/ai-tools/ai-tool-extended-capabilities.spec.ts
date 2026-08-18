import { BusinessStateService } from '../business-state/business-state.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { CustomersService } from '../customers/customers.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { ExpensesService } from '../expenses/expenses.service';
import { InboxService } from '../inbox/inbox.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

describe('AiTool extended capabilities', () => {
  const owner = {
    tenantId: 'tenant-a',
    userId: 'owner-a',
    role: UserRole.TENANT_OWNER,
    surface: 'ios' as const,
  };

  it('normalizes and protects the new tool contracts', () => {
    const registry = new AiToolRegistryService();

    expect(registry.validateArguments('clients.high-value.read', {})).toEqual({
      metric: 'lifetime_spend',
      limit: 10,
    });
    expect(
      registry.validateArguments('support.contact-admin.request', {
        reason: 'Нужна помощь с записью',
      }),
    ).toEqual({ reason: 'Нужна помощь с записью' });
    expect(() =>
      registry.validateArguments('support.contact-admin.request', {
        reason: 'Позвоните +7 999 123-45-67',
      }),
    ).toThrow();

    const definition = registry.get('support.contact-admin.request');
    expect(definition.approvalPolicy).toBe('actor');
    expect(definition.idempotency).toBe('required');

    expect(
      registry.validateArguments('settings.update', {
        capability: 'staff_performance',
        enabled: true,
      }),
    ).toEqual({ capability: 'staff_performance', enabled: true });
    expect(registry.validateArguments('tasks.list', {})).toEqual({
      status: 'active',
      period: 'all',
    });
    expect(
      registry.validateArguments('tasks.complete', {
        task_id: 'task-row-a',
      }),
    ).toEqual({ task_id: 'task-row-a' });
    expect(
      registry.validateArguments('analytics.branches.compare', {
        period: 'today',
      }),
    ).toEqual({
      period: 'today',
      metric: 'appointments_completed',
    });
    expect(() =>
      registry.validateArguments('tasks.create', {
        task: 'Позвонить по номеру +7 999 123-45-67',
        assignee: 'Антон',
      }),
    ).toThrow();
    expect(
      registry.validateArguments('marketing.audience.find', {
        inactive_days: 90,
      }),
    ).toEqual({
      inactive_days: 90,
      minimum_visits: 1,
      max_recipients: 100,
    });
    expect(
      registry.validateArguments('marketing.campaign.preview', {
        audience_id: 'audience-123',
        message: 'Будем рады видеть вас снова.',
      }),
    ).toEqual({
      audience_id: 'audience-123',
      message: 'Будем рады видеть вас снова.',
    });
    expect(() =>
      registry.validateArguments('marketing.campaign.preview', {
        audience_id: 'audience-123',
        message: 'Позвоните нам: +7 999 123-45-67',
      }),
    ).toThrow();
    expect(registry.get('marketing.campaign.send')).toMatchObject({
      approvalPolicy: 'actor',
      idempotency: 'required',
      riskTier: 'high_write',
    });
    expect(
      registry.buildApprovalPreview('marketing.campaign.send', {
        campaign_id: 'campaign-123',
      }),
    ).toEqual({
      summary: 'Отправить подтверждённую рассылку выбранной аудитории.',
      payload: {
        action: 'send_marketing_campaign',
        campaign_id: 'campaign-123',
      },
    });
    expect(
      registry.buildApprovalPreview('tasks.create', {
        task: 'Проверить отмены',
        assignee: 'Антон',
        due_date: '2026-08-15',
      }),
    ).toEqual({
      summary: 'Поставить задачу «Проверить отмены» со сроком 15.08.2026.',
      payload: {
        action: 'create_task',
        task: 'Проверить отмены',
        due_date: '2026-08-15',
      },
    });
  });

  it('ranks the complete CRM registry without exposing client identifiers', async () => {
    const getClientRegistry = jest.fn().mockResolvedValue({
      provider: 'yclients',
      generated_at: '2026-08-14T08:00:00.000Z',
      complete: true,
      clients: [
        {
          external_id: 'secret-client-low',
          visits_count: 3,
          sold_amount: 4_500,
          last_visit_date: '2026-06-01',
        },
        {
          external_id: 'secret-client-high',
          visits_count: 12,
          sold_amount: 48_000,
          last_visit_date: '2026-08-01',
        },
      ],
    });
    const service = createService({
      crmService: { getClientRegistry } as unknown as CrmService,
    });

    const result = await service.execute(
      'clients.high-value.read',
      owner,
      { metric: 'lifetime_spend', limit: 2 },
      'high-value-a',
    );

    expect(result).toMatchObject({
      verified: true,
      complete_registry: true,
      contains_personal_data: false,
      clients: [
        {
          alias: 'client_1',
          visits: 12,
          lifetime_spend_amount_major_units: 48_000,
        },
        {
          alias: 'client_2',
          visits: 3,
          lifetime_spend_amount_major_units: 4_500,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('secret-client');
  });

  it('compares branches with verified operations and never invents branch cash', async () => {
    const service = createService({
      prisma: {
        branch: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'branch-a-123',
              name: 'Центр',
              address: 'Улица 1',
            },
            {
              id: 'branch-b-456',
              name: 'Север',
              address: 'Улица 2',
            },
          ]),
        },
      } as unknown as PrismaService,
    });
    jest
      .spyOn(service as never, 'queryBusinessAnalytics' as never)
      .mockImplementation(
        (_principal: unknown, args: { branch_id: string }) =>
          Promise.resolve({
            verified: true,
            source: 'crm',
            resolved_period: { key: 'today' },
            metrics: {
              appointments_total: args.branch_id === 'branch-a-123' ? 8 : 6,
              appointments_active: args.branch_id === 'branch-a-123' ? 7 : 5,
              appointments_completed: args.branch_id === 'branch-a-123' ? 5 : 4,
              appointments_cancelled: 1,
              appointments_no_show: 0,
              unique_clients: args.branch_id === 'branch-a-123' ? 7 : 5,
              booked_minutes: args.branch_id === 'branch-a-123' ? 420 : 300,
            },
          }) as never,
      );

    const result = await service.execute(
      'analytics.branches.compare',
      owner,
      {
        period: 'today',
        metric: 'appointments_completed',
      },
      'branches-a',
    );

    expect(result).toMatchObject({
      available: true,
      verified: true,
      metric: 'appointments_completed',
      branch_count: 2,
      branches: [
        {
          branch: { id: 'branch-a-123', name: 'Центр' },
          selected_metric_value: 5,
        },
        {
          branch: { id: 'branch-b-456', name: 'Север' },
          selected_metric_value: 4,
        },
      ],
      limitations: [
        {
          key: 'branch_confirmed_revenue',
          reason: 'yclients_finance_is_company_scoped',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('revenue_amount');
    expect(JSON.stringify(result)).not.toContain('cash_amount');
  });

  it('reads only the signed-in employee schedule and hides the CRM staff id', async () => {
    const getStaffScheduleDay = jest.fn().mockResolvedValue({
      staff_id: 'secret-staff-id',
      date: '2026-08-15',
      is_working: true,
      slots: [{ from: '10:00', to: '20:00' }],
    });
    const service = createService({
      crmService: { getStaffScheduleDay } as unknown as CrmService,
      prisma: {
        crmStaffAccess: {
          findFirst: jest.fn().mockResolvedValue({
            externalStaffId: 'secret-staff-id',
          }),
        },
      } as unknown as PrismaService,
    });

    const result = await service.execute(
      'staff.schedule.own.read',
      { ...owner, userId: 'employee-a', role: UserRole.EMPLOYEE },
      { date: '2026-08-15' },
      'own-schedule-a',
    );

    expect(getStaffScheduleDay).toHaveBeenCalledWith('tenant-a', {
      staffId: 'secret-staff-id',
      date: '2026-08-15',
    });
    expect(result).toEqual({
      available: true,
      verified: true,
      source: 'external_crm',
      date: '2026-08-15',
      is_working: true,
      slots: [{ from: '10:00', to: '20:00' }],
    });
    expect(JSON.stringify(result)).not.toContain('secret-staff-id');
  });

  it('returns business hours and integration health without credentials', async () => {
    const service = createService({
      crmService: {
        getCompanyProfile: jest.fn().mockResolvedValue({
          id: 'secret-company-id',
          title: 'Мужская Эстетика',
          address: 'Ставрополь',
          timezone: 'Europe/Moscow',
          schedule: 'Пн-Вс 10:00-20:00',
        }),
        getIntegrationStatus: jest.fn().mockResolvedValue({
          configured: true,
          calendar_source: 'external',
          next_action: null,
          connection: {
            provider: 'yclients',
            status: 'active',
            verified: true,
            verified_at: '2026-08-14T08:00:00.000Z',
            settings: {
              token: 'secret-token',
              base_url: 'https://secret.example.test',
            },
          },
        }),
      } as unknown as CrmService,
    });

    const hours = await service.execute(
      'company.business-hours.read',
      owner,
      {},
      'hours-a',
    );
    const status = await service.execute(
      'support.integration-status.read',
      owner,
      {},
      'integration-a',
    );

    expect(hours).toMatchObject({
      verified: true,
      title: 'Мужская Эстетика',
      timezone: 'Europe/Moscow',
      schedule_available: true,
    });
    expect(status).toMatchObject({
      configured: true,
      connection: {
        provider: 'yclients',
        status: 'active',
        verified: true,
      },
      credentials_excluded: true,
    });
    expect(JSON.stringify(hours)).not.toContain('secret-company-id');
    expect(JSON.stringify(status)).not.toContain('secret-token');
    expect(JSON.stringify(status)).not.toContain('secret.example');
  });

  it('creates one persistent inbox request per active administrator', async () => {
    const publishForTenant = jest.fn().mockResolvedValue({
      stored: 2,
      user_ids: ['owner-a', 'admin-a'],
    });
    const service = createService({
      prisma: {
        membership: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { userId: 'owner-a' },
              { userId: 'admin-a' },
              { userId: 'admin-a' },
            ]),
        },
      } as unknown as PrismaService,
      inboxService: { publishForTenant } as unknown as InboxService,
    });

    const result = await service.execute(
      'support.contact-admin.request',
      { ...owner, userId: 'customer-a', role: UserRole.CUSTOMER },
      { reason: 'Нужна помощь с записью' },
      'contact-admin-a',
    );

    expect(result).toEqual({
      accepted: true,
      delivered_to_active_administrators: 2,
      channel: 'maya_inbox',
      persistent: true,
      push_announcement_requested: true,
    });
    expect(publishForTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        type: 'client_support_request',
        sourceEventId: 'maya-contact:contact-admin-a',
        userIds: ['owner-a', 'admin-a'],
        fanoutOwners: false,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('owner-a');
    expect(JSON.stringify(result)).not.toContain('admin-a');
  });

  it('updates only the authenticated team member assistant capabilities', async () => {
    const getAssistant = jest.fn().mockResolvedValue({
      config: { enabled_capabilities: ['business_analytics'] },
    });
    const updateAssistant = jest.fn().mockResolvedValue({
      config: {
        enabled_capabilities: ['business_analytics', 'staff_performance'],
      },
    });
    const service = createService({
      dashboardPreferencesService: {
        getAssistant,
        updateAssistant,
      } as unknown as DashboardPreferencesService,
    });

    const result = await service.execute(
      'settings.update',
      owner,
      { capability: 'staff_performance', enabled: true },
      'settings-a',
    );

    expect(getAssistant).toHaveBeenCalledWith('tenant-a', 'owner-a');
    expect(updateAssistant).toHaveBeenCalledWith('tenant-a', 'owner-a', {
      enabledCapabilities: ['business_analytics', 'staff_performance'],
    });
    expect(result).toEqual({
      updated: true,
      scope: 'authenticated_user',
      capability: 'staff_performance',
      enabled: true,
      enabled_capabilities: ['business_analytics', 'staff_performance'],
    });
  });

  it('assigns a persistent task to an active CRM team account without exposing identity', async () => {
    const publishForTenant = jest.fn().mockResolvedValue({
      stored: 1,
      user_ids: ['employee-secret'],
    });
    const audit = jest.fn().mockResolvedValue({ id: 'audit-a' });
    const service = createService({
      crmService: {
        getTeamMembers: jest.fn().mockResolvedValue([
          {
            id: 'crm-staff-secret',
            name: 'Антон',
            bookable: false,
            suggested_role: 'administrator',
          },
        ]),
      } as unknown as CrmService,
      prisma: {
        crmStaffAccess: {
          findFirst: jest.fn().mockResolvedValue({
            userId: 'employee-secret',
          }),
        },
      } as unknown as PrismaService,
      inboxService: { publishForTenant } as unknown as InboxService,
      auditLogService: { log: audit } as unknown as AuditLogService,
    });

    const result = await service.execute(
      'tasks.create',
      owner,
      {
        task: 'Проверить отмены на завтра',
        assignee: 'Антон',
        due_date: '2026-08-15',
      },
      'task-a',
    );

    expect(publishForTenant).toHaveBeenCalledWith('tenant-a', {
      type: 'maya_task',
      sourceEventId: 'maya-task:task-a',
      title: 'Поручение MAYA',
      bodyText: 'Проверить отмены на завтра',
      payload: {
        status: 'active',
        due_date: '2026-08-15',
        source: 'maya_chat',
      },
      deepLink: '/app/?panel=chat',
      userIds: ['employee-secret'],
      fanoutOwners: false,
    });
    expect(result).toEqual({
      accepted: true,
      delivered: true,
      persistent: true,
      push_announcement_requested: true,
      due_date: '2026-08-15',
    });
    expect(JSON.stringify(result)).not.toContain('employee-secret');
    expect(JSON.stringify(result)).not.toContain('crm-staff-secret');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maya.task.created' }),
    );
  });

  it('lists only the authenticated user persistent tasks', async () => {
    const service = createService({
      prisma: {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultTimezone: 'UTC',
          }),
        },
        inboxItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'task-row-a',
              bodyText: 'Проверить отмены',
              payloadJson: {
                status: 'active',
                due_date: '2026-08-15',
              },
              createdAt: new Date('2026-08-14T08:00:00.000Z'),
            },
          ]),
        },
      } as unknown as PrismaService,
    });

    const result = await service.execute(
      'tasks.list',
      owner,
      { status: 'active', period: 'all' },
      'tasks-list-a',
    );

    expect(result).toMatchObject({
      count: 1,
      scope: 'authenticated_user',
      tasks: [
        {
          id: 'task-row-a',
          task: 'Проверить отмены',
          status: 'active',
          due_date: '2026-08-15',
        },
      ],
    });
  });

  it('completes only a task assigned to the authenticated user', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'task-row-a',
      payloadJson: { status: 'active', due_date: '2026-08-15' },
      readAt: null,
      archivedAt: null,
    });
    type TaskUpdateInput = {
      where: { id: string };
      data: { payloadJson: { status: string } };
    };
    let taskUpdateInput: TaskUpdateInput | undefined;
    const update = jest.fn((input: TaskUpdateInput) => {
      taskUpdateInput = input;
      return Promise.resolve({ id: 'task-row-a' });
    });
    const service = createService({
      prisma: {
        inboxItem: { findFirst, update },
      } as unknown as PrismaService,
    });

    const result = await service.execute(
      'tasks.complete',
      owner,
      { task_id: 'task-row-a' },
      'task-complete-a',
    );

    expect(result).toEqual({
      completed: true,
      already_completed: false,
      task_id: 'task-row-a',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-row-a',
        tenantId: 'tenant-a',
        userId: 'owner-a',
        type: 'maya_task',
        deletedAt: null,
      },
    });
    expect(taskUpdateInput?.where).toEqual({ id: 'task-row-a' });
    expect(taskUpdateInput?.data.payloadJson).toMatchObject({
      status: 'completed',
    });
  });
});

function createService(overrides: {
  crmService?: CrmService;
  appointmentsService?: AppointmentsService;
  expensesService?: ExpensesService;
  loyaltyService?: LoyaltyService;
  analyticsService?: OperationsAnalyticsService;
  prisma?: PrismaService;
  customersService?: CustomersService;
  staffService?: StaffService;
  dashboardPreferencesService?: DashboardPreferencesService;
  inboxService?: InboxService;
  auditLogService?: AuditLogService;
}) {
  const prisma =
    overrides.prisma ??
    ({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService);
  return new AiToolHandlerService(
    overrides.crmService ?? ({} as CrmService),
    overrides.appointmentsService ?? ({} as AppointmentsService),
    overrides.loyaltyService ?? ({} as LoyaltyService),
    overrides.analyticsService ?? ({} as OperationsAnalyticsService),
    overrides.expensesService ?? ({} as ExpensesService),
    prisma,
    overrides.customersService ?? ({} as CustomersService),
    overrides.staffService ?? ({} as StaffService),
    new BusinessStateService(
      overrides.analyticsService ?? ({} as OperationsAnalyticsService),
      prisma,
    ),
    overrides.dashboardPreferencesService,
    overrides.inboxService,
    overrides.auditLogService,
  );
}
