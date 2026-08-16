import { CrmProvider, UserRole } from '../common/domain.enums';
import type { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Отключение CRM — граница безопасности.
 *
 * 🔴 До cutover `disconnectIntegration` удалял ТОЛЬКО строку интеграции: гранты,
 * роли и живые сессии продолжали существовать со старыми внешними id.
 * Отключённая CRM оставляла активный доступ, который сама же и выдала.
 *
 * Здесь зафиксированы три утверждения, каждое из которых обязано пережить любую
 * последующую правку.
 */
describe('политика отключения CRM', () => {
  const integration = {
    id: 'crm-1',
    tenantId: 'tenant-1',
    provider: CrmProvider.YCLIENTS,
    encryptedApiToken: 'enc',
    baseUrl: null,
    status: 'active',
    settingsJson: {},
    verifiedAt: new Date(),
    lastCheckedAt: new Date(),
    lastSyncAt: null,
    lastErrorCode: null,
    lastErrorAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function build(
    accesses: Array<{ id: string; userId: string | null; role: UserRole }>,
  ) {
    type UpdateManyArgs = {
      where: Record<string, unknown>;
      data?: Record<string, unknown>;
    };
    type RevokeArgs = {
      where: { userId: { in: string[] } };
      data: { revokeReason: string };
    };
    const count = () => Promise.resolve({ count: 1 });

    const linkUpdateMany: jest.MockedFunction<
      (args: UpdateManyArgs) => Promise<{ count: number }>
    > = jest.fn(count);
    const accessUpdateMany: jest.MockedFunction<
      (args: UpdateManyArgs) => Promise<{ count: number }>
    > = jest.fn(count);
    const sessionUpdateMany: jest.MockedFunction<
      (args: RevokeArgs) => Promise<{ count: number }>
    > = jest.fn(count);
    const integrationDelete: jest.MockedFunction<
      (args: { where: { tenantId: string } }) => Promise<typeof integration>
    > = jest.fn(() => Promise.resolve(integration));

    const tx = {
      staffProviderLink: { updateMany: linkUpdateMany },
      crmStaffAccess: {
        findMany: jest.fn().mockResolvedValue(accesses),
        updateMany: accessUpdateMany,
      },
      authSession: { updateMany: sessionUpdateMany },
    };

    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue(integration),
          delete: integrationDelete,
        },
        $transaction: jest.fn((run: (t: unknown) => unknown) =>
          Promise.resolve(run(tx)),
        ),
      } as unknown as PrismaService,
      {
        decrypt: jest.fn(),
        encrypt: jest.fn(),
      } as unknown as EncryptionService,
      { create: jest.fn() } as unknown as CrmAdapterFactory,
      tenantContext,
      {} as never,
      {} as never,
    );

    return {
      service,
      tenantContext,
      linkUpdateMany,
      accessUpdateMany,
      sessionUpdateMany,
      integrationDelete,
    };
  }

  it('отзывает доступ, выданный этой CRM, и связанные с ним сессии', async () => {
    const t = build([
      { id: 'access-master', userId: 'user-master', role: UserRole.STAFF },
    ]);

    await t.tenantContext.runAsSystemTenant('tenant-1', () =>
      t.service.disconnectIntegration('tenant-1'),
    );

    // связи отвязаны — внешние карточки больше не разрешаются в StaffId
    const unlink = t.linkUpdateMany.mock.calls[0][0];
    expect(unlink.where).toMatchObject({
      tenantId: 'tenant-1',
      provider: CrmProvider.YCLIENTS,
      unlinkedAt: null,
    });
    expect(unlink.data?.unlinkedAt).toBeInstanceOf(Date);

    // грант погашен
    const disable = t.accessUpdateMany.mock.calls[0][0];
    expect(disable.where).toEqual({ id: { in: ['access-master'] } });
    expect(disable.data).toEqual({ status: 'disabled' });

    // сессии отозваны с явной причиной
    const revoke = t.sessionUpdateMany.mock.calls[0][0];
    expect(revoke.where.userId.in).toEqual(['user-master']);
    expect(revoke.data.revokeReason).toBe('crm_disconnected');
  });

  it('🔴 НЕ трогает владельца и администратора: их права не выдаёт CRM', async () => {
    const t = build([
      { id: 'access-owner', userId: 'user-owner', role: UserRole.TENANT_ADMIN },
      { id: 'access-biz', userId: 'user-biz', role: UserRole.BUSINESS_OWNER },
    ]);

    await t.tenantContext.runAsSystemTenant('tenant-1', () =>
      t.service.disconnectIntegration('tenant-1'),
    );

    // Отключение интеграции не должно запирать владельца снаружи кабинета.
    expect(t.accessUpdateMany).not.toHaveBeenCalled();
    expect(t.sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('гасит только мастеров, когда владелец и мастер идут вместе', async () => {
    const t = build([
      { id: 'access-owner', userId: 'user-owner', role: UserRole.TENANT_ADMIN },
      { id: 'access-master', userId: 'user-master', role: UserRole.PROVIDER },
    ]);

    await t.tenantContext.runAsSystemTenant('tenant-1', () =>
      t.service.disconnectIntegration('tenant-1'),
    );

    expect(t.accessUpdateMany.mock.calls[0][0].where).toEqual({
      id: { in: ['access-master'] },
    });
    const revoke = t.sessionUpdateMany.mock.calls[0][0];
    expect(revoke.where.userId.in).toEqual(['user-master']);
    expect(revoke.where.userId.in).not.toContain('user-owner');
  });

  it('строка интеграции удаляется в любом случае', async () => {
    const t = build([]);

    await t.tenantContext.runAsSystemTenant('tenant-1', () =>
      t.service.disconnectIntegration('tenant-1'),
    );

    expect(t.integrationDelete).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
  });
});
