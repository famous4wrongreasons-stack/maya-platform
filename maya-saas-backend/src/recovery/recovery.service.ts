import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizePhoneE164 } from '../common/phone.util';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import type { IngestRecoveryTouchpointDto } from './dto/recovery.dto';

const SUBJECT_DOMAIN = 'maya-recovery-subject:v1:';
const MAX_ATTRIBUTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1_000;

type RecordBookingInput = {
  tenantId: string;
  phone: string;
  externalBookingRef: string;
  crmExternalId?: string | null;
  bookedAt: Date;
  visitAt?: Date | null;
  bookedValueKopecks?: number | null;
  currency?: string | null;
  filledWindow?: boolean;
};

type RecordConsentSafeTouchpointInput = {
  tenantId: string;
  phone: string;
  externalEventId: string;
  kind: string;
  channel: string;
  occurredAt: Date;
  attributionWindowDays: number;
};

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly config: ConfigService,
  ) {}

  assertBridgeToken(header: string | undefined): void {
    const expected = String(
      this.config.get<string>('MAYA_INBOX_BRIDGE_TOKEN') || '',
    ).trim();
    const supplied = String(header || '').trim();
    if (!expected || expected.length < 24) {
      throw new UnauthorizedException({
        message: 'Recovery bridge is not configured.',
        error: { code: 'recovery_bridge_disabled' },
      });
    }
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (
      expectedBuffer.length !== suppliedBuffer.length ||
      !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      throw new UnauthorizedException({
        message: 'Invalid recovery bridge token.',
        error: { code: 'recovery_bridge_unauthorized' },
      });
    }
  }

  async ingestTouchpoint(dto: IngestRecoveryTouchpointDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenant_slug.trim().toLowerCase() },
      select: { id: true },
    });
    if (!tenant) {
      throw new ForbiddenException({
        message: 'Tenant not found for recovery ingest.',
        error: { code: 'recovery_tenant_not_found' },
      });
    }
    const occurredAt = new Date(dto.occurred_at);
    const touchpoint = await this.prisma.recoveryTouchpoint.upsert({
      where: {
        tenantId_externalEventId: {
          tenantId: tenant.id,
          externalEventId: dto.external_event_id,
        },
      },
      create: {
        tenantId: tenant.id,
        externalEventId: dto.external_event_id,
        subjectRef: dto.subject_ref,
        kind: dto.kind,
        channel: dto.channel,
        status: dto.status,
        occurredAt,
        attributionWindowDays: dto.attribution_window_days ?? 30,
      },
      update: {
        status: dto.status,
        channel: dto.channel,
        occurredAt,
        attributionWindowDays: dto.attribution_window_days ?? 30,
      },
      select: { id: true, status: true, occurredAt: true },
    });
    return {
      accepted: true,
      touchpoint_id: touchpoint.id,
      status: touchpoint.status,
      occurred_at: touchpoint.occurredAt.toISOString(),
    };
  }

  /**
   * In-process equivalent of the legacy bridge. Raw contact data is accepted
   * only long enough to compute the HMAC subject and is never persisted.
   */
  async recordConsentSafeTouchpoint(input: RecordConsentSafeTouchpointInput) {
    const subjectRef = this.subjectRefForPhone(input.phone);
    if (!subjectRef) {
      return { accepted: false, reason: 'touchpoint_phone_unavailable' };
    }
    const attributionWindowDays = Math.max(
      1,
      Math.min(MAX_ATTRIBUTION_DAYS, input.attributionWindowDays),
    );
    const touchpoint = await this.prisma.recoveryTouchpoint.upsert({
      where: {
        tenantId_externalEventId: {
          tenantId: input.tenantId,
          externalEventId: input.externalEventId,
        },
      },
      create: {
        tenantId: input.tenantId,
        externalEventId: input.externalEventId,
        subjectRef,
        kind: input.kind,
        channel: input.channel,
        status: 'sent',
        occurredAt: input.occurredAt,
        attributionWindowDays,
      },
      update: {
        status: 'sent',
        channel: input.channel,
        occurredAt: input.occurredAt,
        attributionWindowDays,
      },
      select: { id: true, status: true },
    });
    return {
      accepted: true,
      touchpoint_id: touchpoint.id,
      status: touchpoint.status,
    };
  }

  async recordBooking(input: RecordBookingInput) {
    const subjectRef = this.subjectRefForPhone(input.phone);
    if (!subjectRef) {
      return { attributed: false, reason: 'booking_phone_unavailable' };
    }

    const existing = await this.prisma.recoveryConversion.findUnique({
      where: {
        tenantId_externalBookingRef: {
          tenantId: input.tenantId,
          externalBookingRef: input.externalBookingRef,
        },
      },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.recoveryConversion.update({
        where: { id: existing.id },
        data: {
          crmExternalId: input.crmExternalId ?? undefined,
          visitAt: input.visitAt ?? undefined,
          bookedValueKopecks: input.bookedValueKopecks ?? undefined,
          currency: input.currency || undefined,
          filledWindow: input.filledWindow ?? undefined,
        },
      });
      return { attributed: true, conversion_id: existing.id, duplicate: true };
    }

    const oldestEligible = new Date(
      input.bookedAt.getTime() - MAX_ATTRIBUTION_DAYS * DAY_MS,
    );
    const candidates = await this.prisma.recoveryTouchpoint.findMany({
      where: {
        tenantId: input.tenantId,
        subjectRef,
        status: { in: ['sent', 'delivered'] },
        occurredAt: { gte: oldestEligible, lte: input.bookedAt },
      },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: {
        id: true,
        kind: true,
        occurredAt: true,
        attributionWindowDays: true,
      },
    });
    const touchpoint = candidates.find(
      (candidate) =>
        input.bookedAt.getTime() - candidate.occurredAt.getTime() <=
        candidate.attributionWindowDays * DAY_MS,
    );
    if (!touchpoint) {
      return { attributed: false, reason: 'eligible_touchpoint_not_found' };
    }

    const conversion = await this.prisma.recoveryConversion.create({
      data: {
        tenantId: input.tenantId,
        touchpointId: touchpoint.id,
        externalBookingRef: input.externalBookingRef,
        crmExternalId: input.crmExternalId ?? null,
        subjectRef,
        bookedAt: input.bookedAt,
        visitAt: input.visitAt ?? null,
        status: 'booked',
        filledWindow: input.filledWindow ?? touchpoint.kind === 'freed_slot',
        bookedValueKopecks: input.bookedValueKopecks ?? null,
        currency: input.currency || 'RUB',
      },
      select: { id: true },
    });
    return { attributed: true, conversion_id: conversion.id, duplicate: false };
  }

  async markBookingStatus(
    tenantId: string,
    externalBookingRef: string,
    status: 'booked' | 'canceled',
  ): Promise<void> {
    await this.prisma.recoveryConversion.updateMany({
      where: { tenantId, externalBookingRef },
      data: { status },
    });
  }

  async report(tenantId: string, from: Date, to: Date) {
    this.assertReportRange(from, to);
    const [touchpoints, conversions] = await Promise.all([
      this.prisma.recoveryTouchpoint.findMany({
        where: { tenantId, occurredAt: { gte: from, lte: to } },
        select: { id: true, kind: true, status: true },
      }),
      this.prisma.recoveryConversion.findMany({
        where: { tenantId, bookedAt: { gte: from, lte: to } },
        include: { touchpoint: { select: { kind: true } } },
        orderBy: { bookedAt: 'asc' },
      }),
    ]);

    let verificationStatus:
      'available' | 'partial' | 'unavailable' | 'not_applicable' =
      conversions.length === 0 ? 'not_applicable' : 'unavailable';
    let verificationReason: string | null =
      conversions.length === 0 ? 'no_attributed_bookings_in_period' : null;
    const crmIds = [
      ...new Set(
        conversions
          .map((conversion) => conversion.crmExternalId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    if (crmIds.length > 0) {
      const reconciliationTo = new Date(
        Math.min(
          Math.max(to.getTime(), Date.now()),
          from.getTime() + 366 * DAY_MS,
        ),
      );
      try {
        const snapshot = await this.crmService.getAppointmentRevenue(tenantId, {
          from: from.toISOString(),
          to: reconciliationTo.toISOString(),
          externalIds: crmIds,
        });
        const confirmed = new Map(
          snapshot.records.map((record) => [record.external_id, record]),
        );
        await Promise.all(
          conversions.map((conversion) => {
            if (!conversion.crmExternalId) return Promise.resolve();
            const record = confirmed.get(conversion.crmExternalId);
            if (!record) return Promise.resolve();
            conversion.confirmedRevenueKopecks = record.amount_kopecks;
            conversion.confirmedAt = new Date();
            conversion.currency = snapshot.currency;
            return this.prisma.recoveryConversion
              .update({
                where: { id: conversion.id },
                data: {
                  confirmedRevenueKopecks: record.amount_kopecks,
                  confirmedAt: conversion.confirmedAt,
                  currency: snapshot.currency,
                  status: 'confirmed',
                },
              })
              .then(() => undefined);
          }),
        );
        const unconfirmed = conversions.filter(
          (conversion) => !conversion.confirmedRevenueKopecks,
        ).length;
        verificationStatus = unconfirmed === 0 ? 'available' : 'partial';
        verificationReason =
          unconfirmed === 0
            ? null
            : 'some_bookings_have_no_matching_positive_service_transaction';
      } catch {
        verificationStatus = 'unavailable';
        verificationReason = 'crm_appointment_revenue_unavailable';
      }
    } else if (conversions.length > 0) {
      verificationStatus = 'unavailable';
      verificationReason = 'attributed_bookings_have_no_external_crm_record_id';
    }

    const activeConversions = conversions.filter(
      (conversion) => conversion.status !== 'canceled',
    );
    const confirmedConversions = activeConversions.filter(
      (conversion) => (conversion.confirmedRevenueKopecks ?? 0) > 0,
    );
    const kinds = new Set([
      ...touchpoints.map((touchpoint) => touchpoint.kind),
      ...conversions.map((conversion) => conversion.touchpoint.kind),
    ]);

    return {
      source: 'maya_recovery_attribution',
      verified: verificationStatus === 'available',
      period: { from: from.toISOString(), to: to.toISOString() },
      touchpoints_sent: touchpoints.filter((item) => item.status !== 'failed')
        .length,
      booked_after_outreach: activeConversions.length,
      canceled_after_outreach: conversions.length - activeConversions.length,
      recovered_visits: confirmedConversions.length,
      filled_windows: activeConversions.filter((item) => item.filledWindow)
        .length,
      booked_value: this.money(
        activeConversions.reduce(
          (sum, item) => sum + (item.bookedValueKopecks ?? 0),
          0,
        ),
        this.reportCurrency(conversions),
      ),
      confirmed_revenue: this.money(
        confirmedConversions.reduce(
          (sum, item) => sum + (item.confirmedRevenueKopecks ?? 0),
          0,
        ),
        this.reportCurrency(conversions),
      ),
      confirmed_revenue_status: verificationStatus,
      confirmed_revenue_reason: verificationReason,
      unconfirmed_booking_count:
        activeConversions.length - confirmedConversions.length,
      by_kind: [...kinds].sort().map((kind) => {
        const kindTouchpoints = touchpoints.filter(
          (item) => item.kind === kind,
        );
        const kindConversions = activeConversions.filter(
          (item) => item.touchpoint.kind === kind,
        );
        return {
          kind,
          touchpoints_sent: kindTouchpoints.filter(
            (item) => item.status !== 'failed',
          ).length,
          booked_after_outreach: kindConversions.length,
          recovered_visits: kindConversions.filter(
            (item) => (item.confirmedRevenueKopecks ?? 0) > 0,
          ).length,
          confirmed_revenue_kopecks: kindConversions.reduce(
            (sum, item) => sum + (item.confirmedRevenueKopecks ?? 0),
            0,
          ),
        };
      }),
      safeguards: {
        pii_stored: false,
        booked_value_is_not_confirmed_revenue: true,
        only_positive_service_transactions_confirm_revenue: true,
      },
    };
  }

  private subjectRefForPhone(phone: string): string | null {
    const normalized = normalizePhoneE164(phone);
    if (!normalized) return null;
    const secret = this.attributionSecret();
    return createHmac('sha256', secret)
      .update(`${SUBJECT_DOMAIN}${normalized.replace(/\D/g, '')}`)
      .digest('hex');
  }

  private attributionSecret(): string {
    const value = String(
      this.config.get<string>('MAYA_RECOVERY_ATTRIBUTION_SECRET') ||
        this.config.get<string>('MAYA_INBOX_BRIDGE_TOKEN') ||
        this.config.get<string>('AUTH_SESSION_METADATA_SECRET') ||
        '',
    ).trim();
    if (value.length < 32) {
      throw new InternalServerErrorException({
        message: 'Recovery attribution secret is not configured.',
        error: { code: 'recovery_attribution_disabled' },
      });
    }
    return value;
  }

  private assertReportRange(from: Date, to: Date): void {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime() ||
      to.getTime() - from.getTime() > 366 * DAY_MS
    ) {
      throw new BadRequestException({
        message: 'Recovery report range is invalid.',
        error: { code: 'recovery_report_range_invalid' },
      });
    }
  }

  private reportCurrency(rows: Array<{ currency: string }>): string {
    return rows.find((row) => row.currency)?.currency || 'RUB';
  }

  private money(amountKopecks: number, currency: string) {
    return {
      currency,
      amount_kopecks: amountKopecks,
      amount_major_units: Number((amountKopecks / 100).toFixed(2)),
    };
  }
}
