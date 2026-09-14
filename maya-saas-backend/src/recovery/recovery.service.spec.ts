import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Package5Wave5RecoveryFactPlaneService } from '../package5-wave5/package5-wave5.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { BridgeSourceService } from '../tenancy/bridge-source.service';
import { RecoveryService } from './recovery.service';

describe('RecoveryService', () => {
  const secret = 'recovery-test-secret-at-least-32-characters';

  function createService(prisma: object, crm: object = {}, facts: object = {}) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MAYA_INBOX_BRIDGE_TOKEN') return secret;
        return undefined;
      }),
    } as unknown as ConfigService;
    // 🔴 Разрешение арендатора живёт в общем резолвере мостов и проверяется
    // отдельно (`tenancy/bridge-source.service.spec.ts`). Здесь важно, что
    // сервис им ПОЛЬЗУЕТСЯ, а не ищет арендатора по слагу сам.
    const resolveTenantMock: jest.MockedFunction<
      BridgeSourceService['resolveTenant']
    > = jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'muzhskaya-estetika-3',
      resolvedBy: 'integration',
    });
    const bridgeSource: Pick<
      BridgeSourceService,
      'resolveTenant' | 'assertBridgeSecret'
    > = {
      resolveTenant: resolveTenantMock,
      assertBridgeSecret: jest.fn(),
    };
    return new RecoveryService(
      prisma as PrismaService,
      crm as CrmService,
      config,
      bridgeSource as BridgeSourceService,
      facts as Package5Wave5RecoveryFactPlaneService,
      new TenantContextService(),
    );
  }

  it('delegates bridge facts under the resolved tenant without a direct writer', async () => {
    const acceptTouchpoint = jest
      .fn()
      .mockResolvedValue({ touchpointId: 'touchpoint-1' });
    const service = createService({}, {}, { acceptTouchpoint });
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
    const result = await service.ingestTouchpoint(dto);
    expect(result).toMatchObject({
      accepted: true,
      touchpoint_id: 'touchpoint-1',
    });
    expect(acceptTouchpoint).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      externalEventId: dto.external_event_id,
      subjectRef: dto.subject_ref,
      kind: dto.kind,
      channel: dto.channel,
      status: dto.status,
      occurredAt: new Date(dto.occurred_at),
      attributionWindowDays: 21,
      source: 'legacy_bot',
      ingestionMethod: 'webhook',
    });
  });

  it('passes only HMAC booking evidence to the canonical fact plane', async () => {
    const acceptBooking = jest
      .fn()
      .mockResolvedValue({ outcome: 'created', conversionId: 'conversion-1' });
    const service = createService({}, {}, { acceptBooking });
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
    expect(acceptBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        subjectRef: expectedSubject,
        bookedValueKopecks: 250_000,
      }),
    );
    expect(JSON.stringify(acceptBooking.mock.calls)).not.toContain(
      '79991234567',
    );
    expect(JSON.stringify(acceptBooking.mock.calls)).not.toContain('phone');
  });

  it('does not invent a status event for a booking without recovery attribution', async () => {
    const acceptBookingStatus = jest.fn();
    const service = createService(
      { recoveryConversion: { findUnique: jest.fn().mockResolvedValue(null) } },
      {},
      { acceptBookingStatus },
    );
    await service.markBookingStatus(
      'tenant-1',
      'booking-unattributed',
      'canceled',
    );
    expect(acceptBookingStatus).not.toHaveBeenCalled();
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
    expect(update).not.toHaveBeenCalled();
  });
});
