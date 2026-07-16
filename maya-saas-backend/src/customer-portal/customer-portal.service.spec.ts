import { ForbiddenException } from '@nestjs/common';

import { AppointmentsService } from '../appointments/appointments.service';
import { CustomersService } from '../customers/customers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { CustomerPortalService } from './customer-portal.service';

describe('CustomerPortalService', () => {
  const createService = () => {
    const tenantContext = new TenantContextService();
    const getTenantUserOrThrowMock = jest.fn().mockResolvedValue({
      id: 'user-a',
      tenantId: 'tenant-a',
    });
    const listClientAppointmentsMock = jest
      .fn()
      .mockResolvedValue([{ id: 'appointment-a' }]);
    const getLoyaltyForUserMock = jest.fn().mockResolvedValue({
      balance: 2133,
      authoritative: 'crm',
    });
    const usersService = {
      getTenantUserOrThrow: getTenantUserOrThrowMock,
      serializeUser: jest.fn().mockReturnValue({
        id: 'user-a',
        tenant_id: 'tenant-a',
      }),
    } as unknown as UsersService;
    const customersService = {
      getOwnProfile: jest.fn().mockResolvedValue({ profile_id: 'profile-a' }),
    } as unknown as CustomersService;
    const appointmentsService = {
      listClientAppointments: listClientAppointmentsMock,
    } as unknown as AppointmentsService;
    const loyaltyService = {
      getForUser: getLoyaltyForUserMock,
    } as unknown as LoyaltyService;

    return {
      tenantContext,
      usersService,
      customersService,
      appointmentsService,
      loyaltyService,
      getTenantUserOrThrowMock,
      listClientAppointmentsMock,
      getLoyaltyForUserMock,
      service: new CustomerPortalService(
        tenantContext,
        usersService,
        customersService,
        appointmentsService,
        loyaltyService,
      ),
    };
  };

  it('returns CRM loyalty and appointments inside the current tenant', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getOverview('tenant-a', 'user-a'),
    );

    expect(result).toMatchObject({
      tenant_id: 'tenant-a',
      customer: { id: 'user-a', tenant_id: 'tenant-a' },
      appointments: {
        sync_status: 'current',
        items: [{ id: 'appointment-a' }],
      },
      loyalty: { balance: 2133, authoritative: 'crm' },
    });
    expect(setup.listClientAppointmentsMock).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
    expect(setup.getLoyaltyForUserMock).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
  });

  it('keeps the cabinet available when external sections fail', async () => {
    const setup = createService();
    setup.listClientAppointmentsMock.mockRejectedValueOnce(
      new Error('CRM timeout'),
    );
    setup.getLoyaltyForUserMock.mockRejectedValueOnce(new Error('CRM timeout'));

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getOverview('tenant-a', 'user-a'),
    );

    expect(result.appointments).toMatchObject({
      sync_status: 'unavailable',
      items: [],
      error: { code: 'appointments_temporarily_unavailable' },
    });
    expect(result.loyalty).toMatchObject({
      balance: null,
      sync_status: 'temporarily_unavailable',
      stale: true,
    });
  });

  it('rejects a tenant mismatch before reading any customer data', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.getOverview('tenant-b', 'user-a'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.getTenantUserOrThrowMock).not.toHaveBeenCalled();
  });
});
