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
});
