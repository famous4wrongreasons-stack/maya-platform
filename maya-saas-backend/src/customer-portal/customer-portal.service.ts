import { Injectable } from '@nestjs/common';

import { AppointmentsService } from '../appointments/appointments.service';
import { CustomersService } from '../customers/customers.service';
import { unavailableAuthorityView } from '../domain';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly usersService: UsersService,
    private readonly customersService: CustomersService,
    private readonly appointmentsService: AppointmentsService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async getOverview(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const [user, profile] = await Promise.all([
      this.usersService.getTenantUserOrThrow(userId, scopedTenantId),
      this.customersService.getOwnProfile(scopedTenantId, userId),
    ]);
    const [appointments, loyalty] = await Promise.allSettled([
      this.appointmentsService.listClientAppointments(scopedTenantId, userId),
      this.loyaltyService.getForUser(scopedTenantId, userId),
    ]);

    return {
      tenant_id: scopedTenantId,
      generated_at: new Date(),
      customer: this.usersService.serializeUser(user),
      profile,
      appointments:
        appointments.status === 'fulfilled'
          ? {
              sync_status: 'current',
              items: appointments.value,
            }
          : {
              sync_status: 'unavailable',
              items: [],
              error: { code: 'appointments_temporarily_unavailable' },
            },
      loyalty:
        loyalty.status === 'fulfilled'
          ? loyalty.value
          : {
              account_id: null,
              balance: null,
              currency: 'RUB',
              source: null,
              /**
               * 🔴 Здесь синтезировался владелец `crm`. Это была выдумка:
               * при внутреннем календаре владелец — `maya`, при включённом
               * внешнем журнале — `legacy_bot`, а когда граница не ответила,
               * не известно вообще ничего. Незнание называется незнанием.
               */
              ...unavailableAuthorityView(),
              authoritative: null,
              synced_at: null,
              error: { code: 'loyalty_temporarily_unavailable' },
            },
    };
  }
}
