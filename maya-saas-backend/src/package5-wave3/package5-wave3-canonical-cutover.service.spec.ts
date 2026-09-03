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
    const service = new Package5Wave3CanonicalCutoverService(
      { build } as unknown as Package5Wave3ShadowService,
      { execute, resume } as unknown as Package5Wave3ExecutableService,
      tenantContext,
      {
        crmIntegration: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      encryption as never,
      crm as never,
      {} as Package5Wave3ProductionGatewayService,
    );
    return { service, tenantContext, build, execute, resume, crm, encryption };
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
