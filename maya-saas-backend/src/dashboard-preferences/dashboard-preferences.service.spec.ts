import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { DashboardPreferencesService } from './dashboard-preferences.service';

describe('DashboardPreferencesService', () => {
  const createService = (
    savedConfig: Record<string, unknown> | null = null,
  ) => {
    const tenantContext = new TenantContextService();
    const updatedAt = new Date('2026-08-02T12:00:00.000Z');
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        savedConfig
          ? { id: 'pref-a', configJson: savedConfig, updatedAt }
          : null,
      );
    const upsert = jest.fn((args: { create: { configJson: unknown } }) =>
      Promise.resolve({
        id: 'pref-a',
        configJson: args.create.configJson,
        updatedAt,
      }),
    );
    const prisma = {
      dashboardPreference: {
        findUnique,
        findMany: jest.fn().mockResolvedValue([]),
        upsert,
      },
    } as unknown as PrismaService;
    const auditLogWrite = jest.fn().mockResolvedValue(undefined);
    const auditLog = { log: auditLogWrite } as unknown as AuditLogService;

    return {
      tenantContext,
      findUnique,
      upsert,
      auditLogWrite,
      service: new DashboardPreferencesService(prisma, tenantContext, auditLog),
    };
  };

  it('returns safe defaults without creating a preference row', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getFinance('tenant-a', 'owner-a'),
    );

    expect(result.config.enabled_widgets).toEqual([
      'summary',
      'cash_accounts',
      'sales_types',
      'daily',
      'staff_results',
      'payroll',
      'plans',
    ]);
    expect(result.config.monthly_target_rub).toBeNull();
    expect(result.config.staff_targets_rub).toEqual({});
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  it('persists only supported widgets and finite tenant staff targets', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.updateFinance('tenant-a', 'owner-a', {
        enabledWidgets: ['summary', 'staff_results', 'plans'],
        monthlyTargetRub: 1_500_000,
        staffTargetsRub: { 'staff-42': 300_000 },
      }),
    );

    expect(result.config).toMatchObject({
      enabled_widgets: ['summary', 'staff_results', 'plans'],
      monthly_target_rub: 1_500_000,
      staff_targets_rub: { 'staff-42': 300_000 },
    });
    expect(setup.upsert).toHaveBeenCalled();
    expect(setup.upsert.mock.calls[0]?.[0].create).toMatchObject({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      section: 'finance',
    });
    expect(setup.auditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'owner-a',
        action: 'dashboard.finance.updated',
      }),
    );
  });

  it('ignores invalid values from an older saved preference', async () => {
    const setup = createService({
      enabled_widgets: ['summary', 'plans'],
      monthly_target_rub: 'not-a-number',
      staff_targets_rub: {
        'staff-valid': 120_000,
        '../unsafe': 50_000,
        'staff-invalid': -1,
      },
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getFinance('tenant-a', 'owner-a'),
    );

    expect(result.config).toMatchObject({
      enabled_widgets: ['summary', 'plans'],
      monthly_target_rub: null,
      staff_targets_rub: { 'staff-valid': 120_000 },
    });
  });

  it('rejects unsafe staff target ids and cross-tenant access', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.updateFinance('tenant-a', 'owner-a', {
          staffTargetsRub: { '../other-tenant': 100 },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.getFinance('tenant-b', 'owner-a'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores tenant-scoped MAYA capability preferences', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.updateAssistant('tenant-a', 'owner-a', {
        enabledCapabilities: ['business_analytics', 'staff_performance'],
      }),
    );

    expect(result.config.enabled_capabilities).toEqual([
      'business_analytics',
      'staff_performance',
    ]);
    expect(result.catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'staff_performance' }),
      ]),
    );
    expect(setup.upsert.mock.calls[0]?.[0].create).toMatchObject({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      section: 'assistant',
    });
    expect(setup.auditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'assistant.preferences.updated' }),
    );
  });

  it('enables the daily brief by default for each tenant member', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getAssistant('tenant-a', 'owner-a'),
    );

    expect(result.config.enabled_capabilities).toEqual(
      expect.arrayContaining(['daily_brief', 'business_analytics']),
    );
  });
});
