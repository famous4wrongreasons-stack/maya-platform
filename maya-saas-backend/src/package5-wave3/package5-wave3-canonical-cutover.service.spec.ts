import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave3CanonicalCutoverService } from './package5-wave3-canonical-cutover.service';
import { Package5Wave3ProductionGatewayService } from './package5-wave3-production-gateway.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
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
    };
    const encryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
      opaqueReference: jest.fn(() => 'a'.repeat(64)),
    };
    const branchFindFirst = jest.fn().mockResolvedValue({ id: 'branch-1' });
    const integrationFindUnique = jest.fn().mockResolvedValue(null);
    const service = new Package5Wave3CanonicalCutoverService(
      { build } as unknown as Package5Wave3ShadowService,
      { execute, resume } as unknown as Package5Wave3ExecutableService,
      tenantContext,
      {
        crmIntegration: { findUnique: integrationFindUnique },
        branch: { findFirst: branchFindFirst },
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
    };
  };

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
      getStaffScheduleDay: jest.fn().mockResolvedValue({
        revision: 'changed-revision',
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
        expectedProviderRevision: 'expected-revision',
        requestIdentityHash: 'b'.repeat(64),
      }),
    ).resolves.toBe('STILL_UNKNOWN');
    expect(crm.getStaffScheduleDay).toHaveBeenCalledTimes(1);
  });
});
