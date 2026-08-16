import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService tenant isolation', () => {
  const createService = () => {
    const auditCreateMock = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const prisma = {
      auditLog: {
        create: auditCreateMock,
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();

    return {
      service: new AuditLogService(prisma, tenantContext),
      tenantContext,
      auditCreateMock,
    };
  };

  it('injects the tenant confirmed by context', async () => {
    const { service, tenantContext, auditCreateMock } = createService();

    await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.log({
        tenantId: 'tenant-a',
        action: 'entity.updated',
        entityType: 'entity',
        entityId: 'entity-1',
      }),
    );

    expect(auditCreateMock).toHaveBeenCalledWith({
      data: {
        scope: 'tenant',
        tenantId: 'tenant-a',
        userId: null,
        action: 'entity.updated',
        entityType: 'entity',
        entityId: 'entity-1',
        metadataJson: undefined,
      },
    });
  });

  it('rejects a foreign audit tenant before persistence', async () => {
    const { service, tenantContext, auditCreateMock } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.log({
          tenantId: 'tenant-b',
          action: 'blocked',
          entityType: 'entity',
          entityId: 'known-foreign-id',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('fails closed without tenant context', async () => {
    const { service, auditCreateMock } = createService();

    await expect(
      service.log({
        tenantId: 'tenant-a',
        action: 'blocked',
        entityType: 'entity',
        entityId: 'entity-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('writes a platform action without inventing a tenant', async () => {
    // Служебного арендатора для платформенных действий не существует: он
    // положил бы вход владельца платформы в историю чужого салона.
    const { service, auditCreateMock } = createService();

    await service.logPlatformAction({
      userId: 'platform-owner-1',
      action: 'auth.login_succeeded',
      entityType: 'auth_session',
      entityId: 'session-1',
    });

    expect(auditCreateMock).toHaveBeenCalledWith({
      data: {
        scope: 'platform',
        tenantId: null,
        userId: 'platform-owner-1',
        action: 'auth.login_succeeded',
        entityType: 'auth_session',
        entityId: 'session-1',
        metadataJson: undefined,
      },
    });
  });

  it('needs no tenant context for a platform action', async () => {
    // Владелец платформы не состоит ни в одном арендаторе, поэтому требовать
    // контекст здесь означало бы не записать эти события никогда.
    const { service, auditCreateMock } = createService();

    await expect(
      service.logPlatformAction({
        action: 'tenant.deleted',
        entityType: 'tenant',
        entityId: 'tenant-a',
      }),
    ).resolves.toBeDefined();
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
  });

  it('never lets a failed audit write break the action it describes', async () => {
    const { service, tenantContext, auditCreateMock } = createService();
    auditCreateMock.mockRejectedValueOnce(new Error('database is gone'));

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.tryLog({
          tenantId: 'tenant-a',
          action: 'entity.updated',
          entityType: 'entity',
          entityId: 'entity-1',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('still refuses a foreign tenant when the write is best-effort', async () => {
    // Мягкая запись не должна становиться лазейкой мимо проверки арендатора.
    const { service, tenantContext, auditCreateMock } = createService();

    await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.tryLog({
        tenantId: 'tenant-b',
        action: 'blocked',
        entityType: 'entity',
        entityId: 'known-foreign-id',
      }),
    );

    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});
