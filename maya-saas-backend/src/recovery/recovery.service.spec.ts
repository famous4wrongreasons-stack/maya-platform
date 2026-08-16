import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryService } from './recovery.service';

type RecoveryConversionCreateInput = {
  data: {
    subjectRef: string;
    filledWindow: boolean;
    bookedValueKopecks: number;
    status: string;
  };
  select: { id: boolean };
};

describe('RecoveryService', () => {
  const secret = 'recovery-test-secret-at-least-32-characters';

  function createService(prisma: object, crm: object = {}) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MAYA_INBOX_BRIDGE_TOKEN') return secret;
        return undefined;
      }),
    } as unknown as ConfigService;
    return new RecoveryService(
      prisma as PrismaService,
      crm as CrmService,
      config,
    );
  }

  it('ingests the same external event idempotently', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'touchpoint-1',
      status: 'sent',
      occurredAt: new Date('2026-08-14T08:00:00.000Z'),
    });
    const service = createService({
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      recoveryTouchpoint: { upsert },
    });
    const dto = {
      tenant_slug: 'Muzhskaya-Estetika',
      external_event_id: 'cycle:stable-event',
      subject_ref: 'a'.repeat(64),
      kind: 'cycle' as const,
      channel: 'telegram' as const,
      status: 'sent' as const,
      occurred_at: '2026-08-14T08:00:00.000Z',
      attribution_window_days: 21,
    };

    await service.ingestTouchpoint(dto);
    await service.ingestTouchpoint(dto);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          tenantId_externalEventId: {
            tenantId: 'tenant-1',
            externalEventId: 'cycle:stable-event',
          },
        },
      }),
    );
    expect(JSON.stringify(upsert.mock.calls)).not.toContain('+7');
  });

  it('attributes a booking to the latest eligible freed slot without storing a phone', async () => {
    let conversionCreateInput: RecoveryConversionCreateInput | undefined;
    const create = jest.fn((input: RecoveryConversionCreateInput) => {
      conversionCreateInput = input;
      return Promise.resolve({ id: 'conversion-1' });
    });
    const service = createService({
      recoveryConversion: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
      recoveryTouchpoint: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'touchpoint-1',
            kind: 'freed_slot',
            occurredAt: new Date('2026-08-14T08:00:00.000Z'),
            attributionWindowDays: 7,
          },
        ]),
      },
    });

    const result = await service.recordBooking({
      tenantId: 'tenant-1',
      phone: '8 (999) 123-45-67',
      externalBookingRef: 'maya-booking-1',
      crmExternalId: 'crm-record-1',
      bookedAt: new Date('2026-08-14T10:00:00.000Z'),
      visitAt: new Date('2026-08-15T10:00:00.000Z'),
      bookedValueKopecks: 250_000,
      currency: 'RUB',
    });

    const expectedSubject = createHmac('sha256', secret)
      .update('maya-recovery-subject:v1:79991234567')
      .digest('hex');
    expect(result).toEqual({
      attributed: true,
      conversion_id: 'conversion-1',
      duplicate: false,
    });
    expect(conversionCreateInput?.data).toMatchObject({
      subjectRef: expectedSubject,
      filledWindow: true,
      bookedValueKopecks: 250_000,
      status: 'booked',
    });
    expect(conversionCreateInput?.select).toEqual({ id: true });
    expect(JSON.stringify(create.mock.calls)).not.toContain('79991234567');
  });

  it('keeps booked value separate from CRM-confirmed revenue', async () => {
    const confirmed = {
      id: 'conversion-confirmed',
      tenantId: 'tenant-1',
      touchpointId: 'touchpoint-cycle',
      externalBookingRef: 'booking-confirmed',
      crmExternalId: 'crm-confirmed',
      subjectRef: 'a'.repeat(64),
      bookedAt: new Date('2026-08-02T08:00:00.000Z'),
      visitAt: new Date('2026-08-03T08:00:00.000Z'),
      status: 'booked',
      filledWindow: false,
      bookedValueKopecks: 200_000,
      confirmedRevenueKopecks: null,
      currency: 'RUB',
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      touchpoint: { kind: 'cycle' },
    };
    const pending = {
      ...confirmed,
      id: 'conversion-pending',
      externalBookingRef: 'booking-pending',
      crmExternalId: 'crm-pending',
      bookedValueKopecks: 150_000,
    };
    const canceled = {
      ...confirmed,
      id: 'conversion-canceled',
      externalBookingRef: 'booking-canceled',
      crmExternalId: 'crm-canceled',
      status: 'canceled',
      bookedValueKopecks: 300_000,
    };
    const update = jest.fn().mockResolvedValue({});
    const service = createService(
      {
        recoveryTouchpoint: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'touchpoint-cycle', kind: 'cycle', status: 'sent' },
            ]),
        },
        recoveryConversion: {
          findMany: jest.fn().mockResolvedValue([confirmed, pending, canceled]),
          update,
        },
      },
      {
        getAppointmentRevenue: jest.fn().mockResolvedValue({
          provider: 'yclients',
          verified: true,
          currency: 'RUB',
          records: [
            {
              external_id: 'crm-confirmed',
              amount_kopecks: 200_000,
              transaction_count: 1,
            },
          ],
        }),
      },
    );

    const result = await service.report(
      'tenant-1',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(result).toMatchObject({
      verified: false,
      booked_after_outreach: 2,
      canceled_after_outreach: 1,
      recovered_visits: 1,
      booked_value: { amount_kopecks: 350_000 },
      confirmed_revenue: { amount_kopecks: 200_000 },
      confirmed_revenue_status: 'partial',
      unconfirmed_booking_count: 1,
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
