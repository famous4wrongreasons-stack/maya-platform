import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave3CanonicalCutoverService } from './package5-wave3-canonical-cutover.service';
import { Package5Wave3ProductionGatewayService } from './package5-wave3-production-gateway.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3Command,
  type StaffDaySlot,
  wave3Hash,
} from './package5-wave3.service';

describe('Package5Wave3CanonicalCutoverService', () => {
  const buildService = () => {
    const build = jest.fn();
    const execute = jest.fn().mockResolvedValue({ actionExecutionId: 'ae-1' });
    const resume = jest.fn().mockResolvedValue({ actionExecutionId: 'ae-1' });
    const tenantContext = new TenantContextService();
    const crm = {
      previewCredentials: jest.fn().mockResolvedValue({ team: { items: [] } }),
      getIntegrationStatus: jest.fn().mockResolvedValue({
        connection: { id: 'crm-1', provider: 'yclients' },
      }),
      getStaffScheduleDay: jest
        .fn()
        .mockRejectedValue(new Error('CRM unavailable')),
    };
    const encryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
      opaqueReference: jest.fn(() => 'a'.repeat(64)),
    };
    const branchFindFirst = jest.fn().mockResolvedValue({ id: 'branch-1' });
    const integrationFindUnique = jest.fn().mockResolvedValue(null);
    const staffLinksFindMany = jest
      .fn()
      .mockResolvedValue([{ staffId: 'staff-1' }]);
    const service = new Package5Wave3CanonicalCutoverService(
      { build } as unknown as Package5Wave3ShadowService,
      { execute, resume } as unknown as Package5Wave3ExecutableService,
      tenantContext,
      {
        crmIntegration: { findUnique: integrationFindUnique },
        branch: { findFirst: branchFindFirst },
        staffProviderLink: { findMany: staffLinksFindMany },
      } as never,
      encryption as never,
      crm as never,
      {} as Package5Wave3ProductionGatewayService,
    );
    return {
      service,
      tenantContext,
      build,
      execute,
      resume,
      crm,
      encryption,
      branchFindFirst,
      integrationFindUnique,
      staffLinksFindMany,
    };
  };

  // Real replay planner/executor with a stored successful receipt. Any fresh
  // source lookup is a failure, rather than a permissive empty mock response.
  const scheduleReplay = (slots: StaffDaySlot[]) => {
    const fixture = buildService();
    const command: Package5Wave3Command = {
      operation: 'update_staff_schedule_day',
      sourceIntentRef: 'schedule-replay-one',
      staffId: 'staff-1',
      localDate: '2026-10-10',
      expectedProviderRevision: 'a'.repeat(64),
      slots,
    };
    const value = {
      actionClass: 'update_external_staff_schedule_day',
      actionExecutionId: 'ae-1',
      targetRef: 'staff-1:2026-10-10',
      targetGeneration: 1,
      businessMutations: 1,
      providerWrites: 1,
      unknownApplicable: true,
    };
    const stored = {
      id: 'ae-1',
      tenantId: 'tenant-1',
      state: 'SUCCEEDED',
      targetRef: value.targetRef,
      safeResultSummaryJson: value,
    };
    const db = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          role: 'tenant_owner',
          status: 'active',
          user: { status: 'active' },
        }),
      },
      actionExecution: { findMany: jest.fn().mockResolvedValue([stored]) },
      staffProviderLink: {
        findFirst: jest
          .fn()
          .mockRejectedValue(new Error('Current link unavailable')),
      },
    };
    const material = {
      operation: command.operation,
      staffId: command.staffId,
      localDate: command.localDate,
      expectedProviderRevision: command.expectedProviderRevision,
      slots: command.slots,
    };
    const kernel = {
      readTrustedNormalizedInput: jest.fn().mockResolvedValue({
        operation: command.operation,
        targetGeneration: 1,
        requestMaterialHash: wave3Hash(material),
        actorIdentityHash: wave3Hash({
          tenantId: 'tenant-1',
          userId: 'owner-1',
          role: 'tenant_owner',
        }),
        sourceIdentityHash: 'b'.repeat(64),
      }),
    };
    const provider = {
      readStaffDay: jest
        .fn()
        .mockRejectedValue(new Error('Current source unavailable')),
      replaceStaffDay: jest.fn().mockRejectedValue(new Error('No redispatch')),
    };
    const runtime = {
      execute: jest.fn().mockRejectedValue(new Error('No execution attempt')),
    };
    const planner = new Package5Wave3ShadowService(
      {} as never,
      db as never,
      fixture.tenantContext,
      kernel as never,
      provider as never,
    );
    const executor = new Package5Wave3ExecutableService(
      db as never,
      {} as never,
      kernel as never,
      runtime as never,
      planner,
      provider as never,
    );
    fixture.build.mockImplementation(planner.build.bind(planner));
    fixture.resume.mockImplementation(executor.resume.bind(executor));
    fixture.integrationFindUnique.mockRejectedValue(
      new Error('Current integration unavailable'),
    );
    fixture.staffLinksFindMany.mockRejectedValue(
      new Error('Current link unavailable'),
    );
    const input = {
      externalStaffId: 'provider-staff-1',
      localStaffId: command.staffId,
      localDate: command.localDate,
      expectedProviderRevision: command.expectedProviderRevision,
      slots,
    };
    const run = () =>
      fixture.tenantContext.runAsSystemTenant('tenant-1', () =>
        fixture.service.updateExternalStaffScheduleDay(
          'tenant-1',
          { userId: 'owner-1' },
          input,
          command.sourceIntentRef,
        ),
      );
    return {
      ...fixture,
      db,
      kernel,
      provider,
      runtime,
      input,
      stored,
      value,
      run,
    };
  };

  it.each([
    { slots: [] as StaffDaySlot[], normalized: [] as StaffDaySlot[] },
    {
      slots: [
        { from: '13:00', to: '17:00' },
        { from: '09:00', to: '12:00' },
      ],
      normalized: [
        { from: '09:00', to: '12:00' },
        { from: '13:00', to: '17:00' },
      ],
    },
  ])(
    'replays confirmed schedule material without current CRM dependencies: %j',
    async ({ slots, normalized }) => {
      const f = scheduleReplay(slots);
      await expect(f.run()).resolves.toEqual({
        result: f.value,
        verified: {
          date: '2026-10-10',
          is_working: normalized.length > 0,
          slots: normalized,
          verification_basis: 'confirmed_execution',
        },
      });
      expect(f.resume).toHaveBeenCalledWith(
        expect.objectContaining({ existingExecution: f.stored }),
      );
      expect(f.kernel.readTrustedNormalizedInput).toHaveBeenCalledWith(
        'tenant-1',
        'ae-1',
      );
      expect(f.db.membership.findUnique).toHaveBeenCalledTimes(1);
      expect(f.integrationFindUnique).not.toHaveBeenCalled();
      expect(f.staffLinksFindMany).not.toHaveBeenCalled();
      expect(f.db.staffProviderLink.findFirst).not.toHaveBeenCalled();
      expect(f.crm.getStaffScheduleDay).not.toHaveBeenCalled();
      expect(f.provider.readStaffDay).not.toHaveBeenCalled();
      expect(f.provider.replaceStaffDay).not.toHaveBeenCalled();
      expect(f.runtime.execute).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  it('keeps the existing planner refusal for changed slots on the same successful source', async () => {
    const f = scheduleReplay([{ from: '09:00', to: '12:00' }]);
    f.input.slots = [{ from: '10:00', to: '12:00' }];
    await expect(f.run()).rejects.toThrow(
      'Source identity reused with changed material',
    );
    expect(f.resume).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.crm.getStaffScheduleDay).not.toHaveBeenCalled();
    expect(f.runtime.execute).not.toHaveBeenCalled();
  });

  it('rechecks current account authority before returning the successful replay', async () => {
    const f = scheduleReplay([]);
    f.db.membership.findUnique.mockResolvedValue(null);
    await expect(f.run()).rejects.toThrow('Active tenant membership required');
    expect(f.db.actionExecution.findMany).not.toHaveBeenCalled();
    expect(f.resume).not.toHaveBeenCalled();
    expect(f.integrationFindUnique).not.toHaveBeenCalled();
  });

  it('never projects confirmed slots when the existing owner leaves the outcome unknown', async () => {
    const f = scheduleReplay([]);
    f.stored.state = 'UNKNOWN';
    f.resume.mockRejectedValue(new Error('staff_day_dispatch_ambiguous'));
    await expect(f.run()).rejects.toThrow('staff_day_dispatch_ambiguous');
    expect(f.resume).toHaveBeenCalledTimes(1);
    expect(f.crm.getStaffScheduleDay).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('preserves bounded legacy identity lookup only when original local identity is absent', async () => {
    const f = buildService();
    f.integrationFindUnique.mockResolvedValue({ provider: 'yclients' });
    f.build.mockResolvedValue({ existingExecution: null });
    const observed = await f.service.updateExternalStaffScheduleDay(
      'tenant-1',
      { userId: 'owner-1' },
      {
        externalStaffId: 'provider-staff-1',
        localDate: '2026-10-10',
        expectedProviderRevision: 'a'.repeat(64),
        slots: [],
      },
      'legacy-schedule-one',
    );
    expect(f.staffLinksFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        provider: 'yclients',
        externalId: 'provider-staff-1',
        unlinkedAt: null,
      },
      take: 2,
      select: { staffId: true },
    });
    expect(observed.verified.verification_basis).toBe('confirmed_execution');
    expect(f.crm.getStaffScheduleDay).not.toHaveBeenCalled();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['', ' staff-1', 'staff/1', 'staff-1\n', 'a'.repeat(129)])(
    'does not fall back to current identity for malformed original local ID %j',
    async (localStaffId) => {
      const f = scheduleReplay([]);
      f.input.localStaffId = localStaffId;
      await expect(f.run()).rejects.toThrow(
        'Exact local staff identity required',
      );
      expect(f.integrationFindUnique).not.toHaveBeenCalled();
      expect(f.build).not.toHaveBeenCalled();
    },
  );

  it('crosses canonical ingress and resumes the same execution', async () => {
    const fixture = buildService();
    const prepared = { existingExecution: { id: 'ae-1' } };
    fixture.build.mockResolvedValue(prepared);

    await fixture.service.execute(
      'tenant-1',
      { userId: 'owner-1' },
      { operation: 'disconnect_crm_integration' },
      'stable-wave3-request',
    );

    expect(fixture.build).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'owner-1' },
      {
        operation: 'disconnect_crm_integration',
        sourceIntentRef: 'stable-wave3-request',
      },
      'execute',
    );
    expect(fixture.resume).toHaveBeenCalledWith(prepared);
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('verifies credentials read-only before planning encrypted install material', async () => {
    const fixture = buildService();
    fixture.build.mockResolvedValue({ existingExecution: null });

    await fixture.service.installCrmCredentials(
      'tenant-1',
      { userId: 'owner-1' },
      {
        provider: 'yclients' as never,
        apiToken: 'raw-secret',
        settingsJson: { companyId: 42 },
      },
      'stable-install-request',
    );

    expect(fixture.crm.previewCredentials).toHaveBeenCalledWith(
      'yclients',
      'raw-secret',
      { companyId: 42 },
      null,
    );
    const calls = fixture.build.mock.calls as unknown as Array<
      [string, unknown, Record<string, unknown>, string]
    >;
    const planned = calls[0][2];
    expect(planned.encryptedApiToken).toBe('encrypted:raw-secret');
    expect(planned.credentialFingerprint).toBe('a'.repeat(64));
    expect(planned).not.toHaveProperty('apiToken');
    expect(fixture.execute).toHaveBeenCalled();
  });

  it.each([false, true])(
    'checks exact tenant branch before preview; foreign=%s',
    async (foreign) => {
      const f = buildService();
      f.build.mockResolvedValue({ existingExecution: null });
      f.branchFindFirst.mockResolvedValue(foreign ? null : { id: 'branch-1' });
      const binding = {
        contract: 'maya.crm-branch-binding/1',
        branchId: 'branch-1',
        companyId: 42,
      };
      const result = f.service.installCrmCredentials(
        'tenant-1',
        { userId: 'owner-1' },
        {
          provider: 'yclients' as never,
          apiToken: 'synthetic',
          settingsJson: { companyId: 42, branchBinding: binding },
        },
        'binding-request-one',
      );
      if (foreign) {
        await expect(result).rejects.toThrow('binding target not found');
        expect(f.crm.previewCredentials).not.toHaveBeenCalled();
        expect(f.build).not.toHaveBeenCalled();
      } else {
        await result;
        expect(f.build).toHaveBeenCalledWith(
          'tenant-1',
          { userId: 'owner-1' },
          expect.objectContaining({
            settingsJson: { companyId: 42, branchBinding: binding },
          }),
          'execute',
        );
      }
      expect(f.branchFindFirst).toHaveBeenCalledWith({
        where: { id: 'branch-1', tenantId: 'tenant-1' },
        select: { id: true },
      });
    },
  );

  it('company change cannot silently inherit a former branch binding', async () => {
    const f = buildService();
    f.integrationFindUnique.mockResolvedValue({
      provider: 'yclients',
      encryptedApiToken: 'encrypted:synthetic',
      settingsJson: {
        companyId: 42,
        branchBinding: {
          contract: 'maya.crm-branch-binding/1',
          branchId: 'branch-1',
          companyId: 42,
        },
      },
    });
    await expect(
      f.service.installCrmCredentials(
        'tenant-1',
        { userId: 'owner-1' },
        { settingsJson: { companyId: 43 } },
        'change-company-one',
      ),
    ).rejects.toThrow('Exact CRM company/branch binding required');
    expect(f.crm.previewCredentials).not.toHaveBeenCalled();
    expect(f.build).not.toHaveBeenCalled();
  });

  it('rejects missing bounded idempotency identity', () => {
    const fixture = buildService();
    expect(() => fixture.service.intentRef('short')).toThrow();
  });
});

describe('Package5Wave3ProductionGatewayService', () => {
  it('does not call a provider again while reconciliation is still ambiguous', async () => {
    const crm = {
      resolveStaffScheduleSource: jest.fn().mockResolvedValue({
        provider: 'yclients',
        staffId: 'staff-1',
        externalStaffId: 'provider-staff-1',
        branchId: 'branch-1',
        timezone: 'Europe/Moscow',
        sourceHash: 'e'.repeat(64),
      }),
      getStaffScheduleDay: jest.fn().mockResolvedValue({
        revision: 'c'.repeat(64),
        slots: [{ from: '11:00', to: '12:00' }],
      }),
    };
    const gateway = new Package5Wave3ProductionGatewayService(
      crm as never,
      {} as never,
    );
    await expect(
      gateway.reconcileStaffDay({
        tenantId: 'tenant-1',
        provider: 'yclients',
        staffId: 'staff-1',
        branchId: 'branch-1',
        externalStaffId: 'provider-staff-1',
        localDate: '2026-09-03',
        desiredStateHash: 'a'.repeat(64),
        expectedProviderRevision: 'd'.repeat(64),
        requestIdentityHash: 'b'.repeat(64),
        sourceIdentityHash: 'e'.repeat(64),
      }),
    ).resolves.toBe('STILL_UNKNOWN');
    expect(crm.getStaffScheduleDay).toHaveBeenCalledTimes(1);
    expect(crm.resolveStaffScheduleSource).toHaveBeenCalledWith(
      'tenant-1',
      'provider-staff-1',
      {
        provider: 'yclients',
        staffId: 'staff-1',
        branchId: 'branch-1',
        sourceHash: 'e'.repeat(64),
      },
    );
  });
});
