import { BadRequestException } from '@nestjs/common';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave2CanonicalCutoverService } from './package5-wave2-canonical-cutover.service';
import {
  Package5Wave2ExecutableService,
  Package5Wave2ShadowService,
} from './package5-wave2.service';

describe('Package5Wave2CanonicalCutoverService', () => {
  const buildService = () => {
    const build = jest.fn();
    const execute = jest.fn().mockResolvedValue({ actionExecutionId: 'ae-1' });
    const resume = jest.fn().mockResolvedValue({ actionExecutionId: 'ae-1' });
    const tenantContext = new TenantContextService();
    const service = new Package5Wave2CanonicalCutoverService(
      { build } as unknown as Package5Wave2ShadowService,
      { execute, resume } as unknown as Package5Wave2ExecutableService,
      tenantContext,
    );
    return { service, tenantContext, build, execute, resume };
  };

  it('crosses the execute planner using the bounded request identity', async () => {
    const fixture = buildService();
    const prepared = { existingExecution: null };
    fixture.build.mockResolvedValue(prepared);

    await fixture.tenantContext.run('request-wave2-cutover', () =>
      fixture.service.execute(
        'tenant-1',
        { userId: 'owner-1' },
        {
          operation: 'create_tenant_branch',
          branchId: 'branch-1',
          name: 'Branch',
        },
      ),
    );

    expect(fixture.build).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'owner-1' },
      expect.objectContaining({
        operation: 'create_tenant_branch',
        sourceIntentRef: 'request-wave2-cutover',
      }),
      'execute',
    );
    expect(fixture.execute).toHaveBeenCalledWith(prepared);
    expect(fixture.resume).not.toHaveBeenCalled();
  });

  it('resumes the same durable execution instead of starting another', async () => {
    const fixture = buildService();
    const prepared = { existingExecution: { id: 'ae-1' } };
    fixture.build.mockResolvedValue(prepared);

    await fixture.service.execute(
      'tenant-1',
      { userId: 'owner-1' },
      { operation: 'revoke_all_sessions', currentSessionId: 'session-1' },
      'stable-retry-identity',
    );

    expect(fixture.resume).toHaveBeenCalledWith(prepared);
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('fails closed when an initiator supplies no bounded identity', () => {
    const { service } = buildService();
    expect(() => service.intentRef()).toThrow(BadRequestException);
    expect(() => service.intentRef('short')).toThrow(BadRequestException);
  });

  it('derives stable tenant- and operation-qualified target identities', () => {
    const { service } = buildService();
    const first = service.deterministicTargetId(
      'create_tenant_user',
      'tenant-1',
      'stable-request-identity',
    );
    expect(
      service.deterministicTargetId(
        'create_tenant_user',
        'tenant-1',
        'stable-request-identity',
      ),
    ).toBe(first);
    expect(
      service.deterministicTargetId(
        'create_tenant_user',
        'tenant-2',
        'stable-request-identity',
      ),
    ).not.toBe(first);
    expect(
      service.deterministicTargetId(
        'create_provider_user',
        'tenant-1',
        'stable-request-identity',
      ),
    ).not.toBe(first);
  });
});
