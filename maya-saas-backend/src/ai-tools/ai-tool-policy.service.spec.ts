import { ForbiddenException } from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

describe('AiToolPolicyService', () => {
  const createService = (enabled: Record<string, boolean>) => {
    const entitlements = {
      getEffectiveEntitlements: jest.fn().mockResolvedValue({
        tenantId: 'tenant-a',
        planId: 'max',
        features: enabled,
        featureKeys: Object.keys(enabled),
      }),
      assertFeature: jest.fn((_tenantId: string, feature: string) => {
        if (enabled[feature] !== true) {
          throw new ForbiddenException('feature locked');
        }
        return Promise.resolve();
      }),
    } as unknown as EntitlementsService;
    const tenantContext = new TenantContextService();
    return {
      service: new AiToolPolicyService(
        tenantContext,
        entitlements,
        new AiToolRegistryService(),
      ),
      tenantContext,
    };
  };

  it('exposes only customer tools to a customer', async () => {
    const { service, tenantContext } = createService({
      'ai.consultant': true,
      booking: true,
      'booking.customer_app': true,
      loyalty: true,
    });
    const tools = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.listAllowed(
        'tenant-a',
        'customer-a',
        UserRole.CUSTOMER,
        'native',
      ),
    );

    expect(tools.map((tool) => tool.name)).toEqual([
      'catalog.services.read',
      'booking.availability.read',
      'booking.group-availability.read',
      'appointments.own.list',
      'loyalty.own.read',
      // Список мастеров гостю нужен: вся аналитика для клиентских ролей
      // закрыта, и без него вопрос «какие у вас мастера» не заземляется ничем.
      // Имён он не отдаёт — только ярлыки specialist_N и специализацию.
      'catalog.staff.read',
      'booking.upsell.suggest',
      'appointments.own.cancel',
      'appointments.own.create',
      'appointments.own.reschedule',
      'company.business-hours.read',
    ]);
    expect(tools.some((tool) => tool.name === 'analytics.business.query')).toBe(
      false,
    );
  });

  it('returns no tools when the role AI profile is not entitled', async () => {
    const { service, tenantContext } = createService({ booking: true });
    const tools = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.listAllowed('tenant-a', 'customer-a', UserRole.CUSTOMER, 'web'),
    );
    expect(tools).toEqual([]);
  });

  it('requires the requester for actor approval and an owner for owner approval', () => {
    const { service } = createService({});
    const registry = new AiToolRegistryService();
    const actorApproval = registry.get('appointments.own.cancel');
    const ownerApproval = registry.get('loyalty.internal.adjust');

    expect(
      service.canDecide(actorApproval, 'customer-a', {
        tenantId: 'tenant-a',
        userId: 'customer-a',
        role: UserRole.CUSTOMER,
        surface: 'web',
      }),
    ).toBe(true);
    expect(
      service.canDecide(actorApproval, 'customer-a', {
        tenantId: 'tenant-a',
        userId: 'customer-b',
        role: UserRole.CUSTOMER,
        surface: 'web',
      }),
    ).toBe(false);
    expect(
      service.canDecide(ownerApproval, 'admin-a', {
        tenantId: 'tenant-a',
        userId: 'owner-a',
        role: UserRole.TENANT_OWNER,
        surface: 'web',
      }),
    ).toBe(true);
    expect(
      service.canDecide(ownerApproval, 'admin-a', {
        tenantId: 'tenant-a',
        userId: 'admin-b',
        role: UserRole.ADMINISTRATOR,
        surface: 'web',
      }),
    ).toBe(false);
  });

  it('rejects cross-tenant execution before entitlement lookup', async () => {
    const { service, tenantContext } = createService({
      'ai.consultant': true,
      booking: true,
    });
    const definition = new AiToolRegistryService().get('catalog.services.read');

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.assertCanExecute(
          {
            tenantId: 'tenant-b',
            userId: 'customer-b',
            role: UserRole.CUSTOMER,
            surface: 'web',
          },
          definition,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
