import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { Package5Wave1CanonicalCutoverService } from '../package5-wave1/package5-wave1-canonical-cutover.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { DashboardPreferencesService } from './dashboard-preferences.service';

describe('DashboardPreferencesService', () => {
  const createService = (
    savedConfig: Record<string, unknown> | null = null,
  ) => {
    const tenantContext = new TenantContextService();
    const updatedAt = new Date('2026-08-02T12:00:00.000Z');
    let storedConfig = savedConfig;
    const findUnique = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          storedConfig
            ? { id: 'pref-a', configJson: storedConfig, updatedAt }
            : null,
        ),
      );
    const prisma = {
      dashboardPreference: {
        findUnique,
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const updateFinance = jest.fn(
      (
        _tenantId: string,
        _userId: string,
        command: {
          enabledWidgets: string[];
          monthlyTargetRub: number | null;
          staffTargetsRub: Record<string, number>;
        },
      ) => {
        storedConfig = {
          schema_version: 1,
          enabled_widgets: command.enabledWidgets,
          monthly_target_rub: command.monthlyTargetRub,
          staff_targets_rub: command.staffTargetsRub,
        };
        return Promise.resolve();
      },
    );
    const updateAssistant = jest.fn(
      (
        _tenantId: string,
        _userId: string,
        command: { enabledCapabilities: string[] },
      ) => {
        storedConfig = {
          schema_version: 1,
          enabled_capabilities: command.enabledCapabilities,
        };
        return Promise.resolve();
      },
    );
    const canonical = {
      updateFinance,
      updateAssistant,
    } as unknown as Package5Wave1CanonicalCutoverService;

    return {
      tenantContext,
      findUnique,
      updateFinance,
      updateAssistant,
      service: new DashboardPreferencesService(
        prisma,
        tenantContext,
        canonical,
      ),
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
    expect(setup.updateFinance).not.toHaveBeenCalled();
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
    expect(setup.updateFinance).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      {
        enabledWidgets: ['summary', 'staff_results', 'plans'],
        monthlyTargetRub: 1_500_000,
        staffTargetsRub: { 'staff-42': 300_000 },
      },
      undefined,
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
    expect(setup.updateAssistant).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      {
        enabledCapabilities: ['business_analytics', 'staff_performance'],
      },
      undefined,
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
