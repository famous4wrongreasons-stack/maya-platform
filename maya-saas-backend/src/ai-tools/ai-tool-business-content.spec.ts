import { BusinessStateService } from '../business-state/business-state.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { BusinessContentService } from '../business-content/business-content.service';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { CustomersService } from '../customers/customers.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AiToolHandlerService } from './ai-tool-handler.service';

describe('AiToolHandlerService extended business tools', () => {
  const principal = {
    tenantId: 'tenant-a',
    userId: 'owner-a',
    role: UserRole.TENANT_OWNER,
    surface: 'web' as const,
  };

  function createService(options: {
    appointments?: Partial<AppointmentsService>;
    businessContent?: Partial<BusinessContentService>;
  }) {
    return new AiToolHandlerService(
      {} as CrmService,
      (options.appointments ?? {}) as AppointmentsService,
      {} as LoyaltyService,
      {} as OperationsAnalyticsService,
      {} as ExpensesService,
      {} as PrismaService,
      {} as CustomersService,
      {} as StaffService,
      new BusinessStateService(
        {} as OperationsAnalyticsService,
        {} as PrismaService,
      ),
      // 🔴 Cycle 04 P6. Канонический читатель периода.
      new AppointmentPeriodReader({} as CrmService),
      new ClientRecencyFactsService({} as CrmService),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (options.businessContent ?? {}) as BusinessContentService,
    );
  }

  it('returns distinct simultaneous CRM slots without claiming atomic booking', async () => {
    const getAvailableSlots = jest.fn().mockResolvedValue([
      {
        start: '2026-08-20T10:00:00.000Z',
        end: '2026-08-20T11:00:00.000Z',
        staff_id: 'staff-a',
        branch_id: 'branch-a',
      },
      {
        start: '2026-08-20T10:00:00.000Z',
        end: '2026-08-20T10:45:00.000Z',
        staff_id: 'staff-b',
        branch_id: 'branch-a',
      },
      {
        start: '2026-08-20T10:00:00.000Z',
        end: '2026-08-20T10:30:00.000Z',
        staff_id: 'staff-a',
        branch_id: 'branch-a',
      },
    ]);
    const service = createService({ appointments: { getAvailableSlots } });

    const result = await service.execute(
      'booking.group-availability.read',
      principal,
      {
        date: '2026-08-20T00:00:00.000Z',
        party_size: 2,
        mode: 'simultaneous',
        max_gap_minutes: 0,
      },
      'group-read-a',
    );

    expect(getAvailableSlots).toHaveBeenCalledWith('tenant-a', {
      date: '2026-08-20T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      mode: 'simultaneous',
      party_size: 2,
      group_count: 1,
      atomic_booking_available: false,
      groups: [
        {
          branch_id: 'branch-a',
          slots: [{ staff_id: 'staff-a' }, { staff_id: 'staff-b' }],
        },
      ],
    });
  });

  it('delegates tenant-scoped catalog and review reads', async () => {
    const listCatalog = jest.fn().mockResolvedValue({ count: 1 });
    const reviewTrend = jest.fn().mockResolvedValue({ direction: 'improving' });
    const service = createService({
      businessContent: { listCatalog, reviewTrend },
    });

    await expect(
      service.execute(
        'inventory.stock.read',
        principal,
        { low_stock_only: true },
        'inventory-read-a',
      ),
    ).resolves.toEqual({ count: 1 });
    await expect(
      service.execute(
        'reviews.analyze',
        principal,
        { mode: 'trend', days: 90 },
        'reviews-read-a',
      ),
    ).resolves.toEqual({ direction: 'improving' });
    expect(listCatalog).toHaveBeenCalledWith('tenant-a', 'inventory', {
      lowStockOnly: true,
    });
    expect(reviewTrend).toHaveBeenCalledWith('tenant-a', { days: 90 });
  });
});
