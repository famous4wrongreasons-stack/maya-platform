import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientChannelLinkService } from '../crm/client-channel-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmService } from '../crm/crm.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { OwnerReportStore } from '../owner-reports/owner-report.store';
import {
  localDateMinuteToUtc,
  localWeekday,
  parseTimeToMinute,
} from '../internal-calendar/internal-calendar.utils';
import { normalizeScheduleSlots } from '../crm/staff-schedule.utils';
import { OperationalAlertStore } from './operational-alert.store';
import {
  SHIFT_ROLES,
  ALERT_DAY,
  type ShiftSource,
  type InterestSource,
} from './operational-alert.contract';
@Injectable()
export class OperationalAlertSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly crm: CrmService,
    private readonly internal: InternalCalendarService,
    private readonly bindings: OwnerReportStore,
    private readonly store: OperationalAlertStore,
  ) {}
  async shift(
    tenantId: string,
    staffId: string,
    localDate: string,
    leadMinutes: 30 | 60,
  ) {
    this.context.assertTenantId(tenantId);
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, active: true, branchId: { not: null } },
      include: { branch: true, tenant: true },
    });
    if (!staff?.userId || !staff.branch)
      throw new ForbiddenException('R06 canonical Staff/branch/User required');
    const member = await this.prisma.membership.findFirst({
        where: {
          tenantId,
          userId: staff.userId,
          status: 'active',
          role: { in: [...SHIFT_ROLES] },
          user: { status: 'active' },
        },
      }),
      binding = await this.bindings.staffBinding(tenantId, staff.userId);
    if (
      !member ||
      !binding ||
      (member.branchId && member.branchId !== staff.branchId)
    )
      throw new ForbiddenException(
        'R06 verified current Staff membership required',
      );
    const timezone = staff.branch.timezone || staff.tenant.defaultTimezone;
    let slots: Array<{ from: string; to: string }>,
      revision: string,
      integrationId: string | null = null,
      staffProviderLinkId: string | null = null;
    if (staff.tenant.calendarSource === 'internal') {
      const day = await this.internal.getProviderSchedule(
          tenantId,
          binding.externalRef,
        ),
        weekday = localWeekday(localDate);
      const spans = day.rules
        .filter((r) => r.weekday === weekday)
        .flatMap((rule) => {
          let windows = [
            {
              from: localDateMinuteToUtc(
                localDate,
                parseTimeToMinute(rule.start_time),
                timezone,
              ).getTime(),
              to: localDateMinuteToUtc(
                localDate,
                rule.end_time === '24:00'
                  ? 1440
                  : parseTimeToMinute(rule.end_time),
                timezone,
              ).getTime(),
            },
          ];
          for (const excluded of day.time_off) {
            const a = new Date(excluded.start_at).getTime(),
              b = new Date(excluded.end_at).getTime();
            windows = windows.flatMap((w) =>
              b <= w.from || a >= w.to
                ? [w]
                : [
                    ...(a > w.from ? [{ from: w.from, to: a }] : []),
                    ...(b < w.to ? [{ from: b, to: w.to }] : []),
                  ],
            );
          }
          return windows;
        })
        .sort((a, b) => a.from - b.from);
      if (!spans.length) throw new ForbiddenException('R06 no working shift');
      const observedStart = new Date(spans[0].from).toISOString();
      revision = this.store.identity.hmac(
        'maya.operational-internal-schedule/1',
        { staffId, localDate, spans },
      );
      const source: ShiftSource = {
        staffId,
        branchId: staff.branch.id,
        calendarSource: 'internal',
        integrationId: null,
        staffProviderLinkId: null,
        localDate,
        timezone,
        leadMinutes,
        scheduledStartAt: observedStart,
        scheduleEvidenceHash: this.store.identity.hmac(
          'maya.operational-shift-source/1',
          {
            tenantId,
            staffId,
            branchId: staff.branch.id,
            binding: binding.evidenceHash,
            localDate,
            timezone,
            revision,
          },
        ),
      };
      return {
        source,
        member,
        occurredAt: new Date(Date.parse(observedStart) - leadMinutes * 60000),
        expiresAt: new Date(observedStart),
      };
    } else {
      const integration = await this.prisma.crmIntegration.findFirstOrThrow({
          where: { tenantId, status: 'active' },
        }),
        link = await this.prisma.staffProviderLink.findFirstOrThrow({
          where: {
            tenantId,
            staffId,
            provider: integration.provider,
            externalId: binding.externalRef,
            unlinkedAt: null,
          },
        });
      integrationId = integration.id;
      staffProviderLinkId = link.id;
      const day = await this.crm.getStaffScheduleDay(tenantId, {
        staffId: binding.externalRef,
        date: localDate,
      });
      if (
        day.date !== localDate ||
        day.staff_id !== binding.externalRef ||
        !day.is_working
      )
        throw new ForbiddenException('R06 exact current schedule required');
      slots = normalizeScheduleSlots(day.slots);
      revision = day.revision;
    }
    if (!slots.length) throw new ForbiddenException('R06 no working shift');
    const scheduledStartAt = localDateMinuteToUtc(
      localDate,
      parseTimeToMinute(slots[0].from),
      timezone,
    ).toISOString();
    const source: ShiftSource = {
      staffId,
      branchId: staff.branch.id,
      calendarSource: 'external',
      integrationId,
      staffProviderLinkId,
      localDate,
      timezone,
      leadMinutes,
      scheduledStartAt,
      scheduleEvidenceHash: this.store.identity.hmac(
        'maya.operational-shift-source/1',
        {
          tenantId,
          staffId,
          branchId: staff.branch.id,
          binding: binding.evidenceHash,
          localDate,
          timezone,
          slots,
          revision,
        },
      ),
    };
    return {
      source,
      member,
      occurredAt: new Date(Date.parse(scheduledStartAt) - leadMinutes * 60000),
      expiresAt: new Date(scheduledStartAt),
    };
  }
  async interest(
    tenantId: string,
    interestId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    this.context.assertTenantId(tenantId);
    const row = await tx.clientWantedSlotInterest.findFirst({
      where: { id: interestId, tenantId },
      include: {
        client: true,
        staff: true,
        sourceChannelLink: true,
        createdByExecution: true,
      },
    });
    if (
      !row ||
      row.status !== 'ACTIVE' ||
      row.expiresAt <= new Date() ||
      row.sourceChannelLink.revokedAt ||
      row.client.mergedIntoClientId ||
      !row.staff.active ||
      row.createdByExecution.state !== 'SUCCEEDED' ||
      row.createdByExecution.dryRun ||
      row.createdByExecution.actionClass !== 'add_client_wanted_slot' ||
      row.sourceChannelLink.clientId !== row.clientId
    )
      throw new ForbiddenException(
        'R06 canonical confirmed wanted interest required',
      );
    await new ClientChannelLinkService(this.prisma, this.context, {
      verifyLink: () =>
        Promise.reject(new ForbiddenException('No link mutation')),
      verifyRevocation: () =>
        Promise.reject(new ForbiddenException('No revocation')),
    }).assertClientEligible(tx, tenantId, row.clientId);
    const source: InterestSource = {
      interestId: row.id,
      clientId: row.clientId,
      branchId: row.branchId,
      staffId: row.staffId,
      createdByActionExecutionId: row.createdByActionExecutionId,
      sourceChannelLinkId: row.sourceChannelLinkId,
      desiredStartAt: row.desiredStartAt.toISOString(),
      interestExpiresAt: row.expiresAt.toISOString(),
      creationEvidenceHash: this.store.identity.hmac(
        'maya.operational-interest-source/1',
        {
          tenantId,
          interestId: row.id,
          executionId: row.createdByExecution.id,
          inputHash: row.createdByExecution.normalizedInputHash,
          linkId: row.sourceChannelLink.id,
          clientId: row.clientId,
        },
      ),
    };
    return {
      source,
      occurredAt: row.createdAt,
      expiresAt: new Date(
        Math.min(row.expiresAt.getTime(), row.createdAt.getTime() + ALERT_DAY),
      ),
    };
  }
}
