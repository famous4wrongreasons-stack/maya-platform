import { UserRole } from '../common/domain.enums';
import { Package5Wave3ExecutableService } from '../package5-wave3/package5-wave3.service';

/**
 * CRM disconnect is a Package 5 Wave 3 canonical mutation. These tests keep
 * the access-revocation policy pinned to the canonical executor after the
 * legacy CrmService mutation owner has been removed.
 */
describe('canonical CRM disconnect policy', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');

  function build(
    accesses: Array<{ id: string; userId: string | null; role: UserRole }>,
  ) {
    const crmDerived = accesses.filter(
      (access) =>
        ![
          UserRole.TENANT_OWNER,
          UserRole.BUSINESS_OWNER,
          UserRole.TENANT_ADMIN,
          UserRole.ADMINISTRATOR,
        ].includes(access.role),
    );
    const staffProviderLinkUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    const crmStaffAccessFindMany = jest.fn().mockResolvedValue(crmDerived);
    const crmStaffAccessUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const authSessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const crmIntegrationDelete = jest.fn().mockResolvedValue({ id: 'crm-1' });
    const tx = {
      crmIntegration: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ provider: 'yclients' }),
        delete: crmIntegrationDelete,
      },
      staffProviderLink: { updateMany: staffProviderLinkUpdateMany },
      crmStaffAccess: {
        findMany: crmStaffAccessFindMany,
        updateMany: crmStaffAccessUpdateMany,
      },
      authSession: { updateMany: authSessionUpdateMany },
    };
    const service = new Package5Wave3ExecutableService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      () => now,
    );
    const mutate = (
      service as unknown as {
        mutate(
          tx: unknown,
          execution: { tenantId: string },
          command: {
            operation: 'disconnect_crm_integration';
            sourceIntentRef: string;
          },
          input: Record<string, unknown>,
        ): Promise<void>;
      }
    ).mutate.bind(service);

    return {
      run: () =>
        mutate(
          tx,
          { tenantId: 'tenant-1' },
          {
            operation: 'disconnect_crm_integration',
            sourceIntentRef: 'stable-disconnect-request',
          },
          {},
        ),
      staffProviderLinkUpdateMany,
      crmStaffAccessFindMany,
      crmStaffAccessUpdateMany,
      authSessionUpdateMany,
      crmIntegrationDelete,
    };
  }

  it('revokes CRM-derived staff access and linked live sessions', async () => {
    const fixture = build([
      { id: 'access-master', userId: 'user-master', role: UserRole.STAFF },
    ]);

    await fixture.run();

    expect(fixture.staffProviderLinkUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        provider: 'yclients',
        unlinkedAt: null,
      },
      data: { unlinkedAt: now },
    });
    expect(fixture.crmStaffAccessUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['access-master'] } },
      data: { status: 'disabled' },
    });
    expect(fixture.authSessionUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: { in: ['user-master'] },
        revokedAt: null,
      },
      data: { revokedAt: now, revokeReason: 'crm_disconnected' },
    });
  });

  it('does not revoke tenant-owner or administrator access', async () => {
    const fixture = build([
      {
        id: 'access-owner',
        userId: 'user-owner',
        role: UserRole.TENANT_ADMIN,
      },
      {
        id: 'access-admin',
        userId: 'user-admin',
        role: UserRole.ADMINISTRATOR,
      },
      {
        id: 'access-tenant-owner',
        userId: 'user-tenant-owner',
        role: UserRole.TENANT_OWNER,
      },
      {
        id: 'access-business-owner',
        userId: 'user-business-owner',
        role: UserRole.BUSINESS_OWNER,
      },
    ]);

    await fixture.run();

    expect(fixture.crmStaffAccessFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        status: { not: 'disabled' },
        role: {
          notIn: [
            'tenant_owner',
            'business_owner',
            'tenant_admin',
            'administrator',
          ],
        },
      },
      select: { id: true, userId: true },
    });
    expect(fixture.crmStaffAccessUpdateMany).not.toHaveBeenCalled();
    expect(fixture.authSessionUpdateMany).not.toHaveBeenCalled();
  });

  it('revokes only CRM-derived staff when owner and staff coexist', async () => {
    const fixture = build([
      {
        id: 'access-owner',
        userId: 'user-owner',
        role: UserRole.TENANT_ADMIN,
      },
      {
        id: 'access-master',
        userId: 'user-master',
        role: UserRole.PROVIDER,
      },
    ]);

    await fixture.run();

    expect(fixture.crmStaffAccessUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['access-master'] } },
      data: { status: 'disabled' },
    });
    expect(fixture.authSessionUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: { in: ['user-master'] },
        revokedAt: null,
      },
      data: { revokedAt: now, revokeReason: 'crm_disconnected' },
    });
  });

  it('removes the credential-bearing integration record', async () => {
    const fixture = build([]);

    await fixture.run();

    expect(fixture.crmIntegrationDelete).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
  });
});
