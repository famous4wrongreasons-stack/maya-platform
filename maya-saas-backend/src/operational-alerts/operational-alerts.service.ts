import {
  Injectable,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Prisma, Membership, OperationalAlertRun } from '@prisma/client';
import { stableActionJson } from '../action-engine/action-engine.identity';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CommunicationDeliveryService } from '../communication-delivery';
import { localCalendarDate } from '../owner-reports/owner-reports.time';
import {
  ALERT_CONTRACT,
  ALERT_ADMIN_ROLES,
  ALERT_DAY,
  alertPolicy,
  type AlertPlan,
  type AlertRecipient,
  type ShiftSource,
  type InterestSource,
} from './operational-alert.contract';
import { OperationalAlertStore } from './operational-alert.store';
import { OperationalAlertSourceService } from './operational-alert-source.service';
import {
  OPERATIONAL_ALERT_WIDGET_TRIGGER,
  type OperationalAlertWidgetTriggerPort,
} from './operational-alert-widget-trigger.port';
@Injectable()
export class OperationalAlertsService {
  private readonly logger = new Logger(OperationalAlertsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly store: OperationalAlertStore,
    private readonly sources: OperationalAlertSourceService,
    private readonly delivery: CommunicationDeliveryService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * Optional presentation edge. The admitted alert remains the only source fact;
   * a missing/refusing projector cannot alter admission or delivery.
   */
  private async projectShiftMoment(
    root: OperationalAlertRun,
    plan: AlertPlan,
  ): Promise<void> {
    if (plan.alertType !== 'staff_shift_reminder') return;
    const source = plan.source as ShiftSource;
    const trigger = this.moduleRef?.get<OperationalAlertWidgetTriggerPort>(
      OPERATIONAL_ALERT_WIDGET_TRIGGER,
      { strict: false },
    );
    const recipient = plan.recipients[0];
    if (!trigger || !recipient) return;
    try {
      await this.context.runAsAuthPrincipal(
        {
          tenantId: plan.tenantId,
          userId: recipient.userId,
          role: recipient.role,
        },
        () =>
          trigger.afterShiftAdmitted({
            tenantId: plan.tenantId,
            runId: root.id,
            occurrenceRef: plan.occurrenceRef,
            occurredAt: plan.occurredAt,
            admittedAt: root.admittedAt.toISOString(),
            expiresAt: plan.expiresAt,
            recipient: {
              userId: recipient.userId,
              role: recipient.role,
              title: recipient.content.title,
              bodyText: recipient.content.bodyText,
            },
            source: {
              localDate: source.localDate,
              timezone: source.timezone,
              scheduledStartAt: source.scheduledStartAt,
              scheduleEvidenceHash: source.scheduleEvidenceHash,
            },
          }),
      );
    } catch (error) {
      this.logger.warn(
        `R06 shift widget projection refused: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
  private system(tenantId: string) {
    const ctx = this.context.get();
    if (ctx?.source !== 'system' || ctx.userId || ctx.tenantId !== tenantId)
      throw new ForbiddenException('R06 exact system tenant builder required');
  }
  private recipient(
    tenantId: string,
    occurrenceRef: string,
    member: Membership,
    content: AlertRecipient['content'],
  ): AlertRecipient {
    return {
      userId: member.userId,
      membershipId: member.id,
      role: member.role,
      branchScope: member.branchId ? 'branch:' + member.branchId : 'tenant',
      content,
      slot: {
        channel: 'inbox',
        routeId: member.id,
        destination: member.userId,
        key: this.store.identity.hmac('maya.operational-alert-slot/1', {
          tenantId,
          occurrenceRef,
          userId: member.userId,
          membershipId: member.id,
          channel: 'inbox',
        }),
      },
    };
  }
  private async verify(plan: AlertPlan, tx?: Prisma.TransactionClient) {
    const frozen = plan.source;
    const current =
      plan.alertType === 'staff_shift_reminder'
        ? await this.sources.shift(
            plan.tenantId,
            frozen.staffId,
            (frozen as ShiftSource).localDate,
            (frozen as ShiftSource).leadMinutes,
          )
        : await this.sources.interest(
            plan.tenantId,
            (frozen as InterestSource).interestId,
            tx,
          );
    if (stableActionJson(current.source) !== stableActionJson(frozen))
      throw new ForbiddenException(
        'R06 source changed since immutable admission',
      );
  }
  async shift(
    tenantId: string,
    staffId: string,
    localDate: string,
    lead: 30 | 60,
    now = new Date(),
  ) {
    this.system(tenantId);
    if (![30, 60].includes(lead))
      throw new ForbiddenException('R06 lead invalid');
    const fact = await this.sources.shift(tenantId, staffId, localDate, lead);
    const occurrenceRef = this.store.identity.hmac(
      'maya.operational-shift-occurrence/1',
      {
        tenantId,
        staffId,
        branchId: fact.source.branchId,
        localDate,
        leadMinutes: lead,
      },
    );
    const existing = await this.store.find(
      tenantId,
      'staff_shift_reminder',
      occurrenceRef,
    );
    if (existing) {
      const plan = this.store.read(existing);
      if (plan.alertType === 'staff_shift_reminder')
        await this.projectShiftMoment(existing, plan);
      return this.resume(existing);
    }
    const plan: AlertPlan = {
      contract: ALERT_CONTRACT,
      tenantId,
      alertType: 'staff_shift_reminder',
      occurrenceRef,
      contractVersion: 1,
      occurredAt: fact.occurredAt.toISOString(),
      expiresAt: fact.expiresAt.toISOString(),
      source: fact.source,
      policy: alertPolicy('staff_shift_reminder'),
      recipients: [
        this.recipient(tenantId, occurrenceRef, fact.member, {
          title: 'Скоро начало смены',
          bodyText: `Ваша смена начинается ${fact.source.scheduledStartAt}. Напоминание за ${lead} мин.`,
          deepLink: '/app/?panel=schedule',
          payload: {
            staff_id: staffId,
            branch_id: fact.source.branchId,
            scheduled_start_at: fact.source.scheduledStartAt,
          },
        }),
      ],
    };
    const root = await this.store.admit(plan, () => this.verify(plan), now);
    await this.projectShiftMoment(root, plan);
    return this.resume(root);
  }
  async wanted(tenantId: string, interestId: string, now = new Date()) {
    this.system(tenantId);
    const fact = await this.sources.interest(tenantId, interestId),
      occurrenceRef = this.store.identity.hmac(
        'maya.operational-interest-occurrence/1',
        {
          tenantId,
          interestId,
          creationExecutionId: fact.source.createdByActionExecutionId,
          kind: 'wanted_slot_admin_notice',
        },
      );
    const existing = await this.store.find(
      tenantId,
      'wanted_slot_admin_notice',
      occurrenceRef,
    );
    if (existing) return this.resume(existing);
    const members = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        user: { status: 'active' },
        role: { in: [...ALERT_ADMIN_ROLES] },
        OR: [{ branchId: null }, { branchId: fact.source.branchId }],
      },
      orderBy: { userId: 'asc' },
    });
    if (!members.length)
      return { admitted: false, reason: 'no_canonical_recipient' };
    const plan: AlertPlan = {
      contract: ALERT_CONTRACT,
      tenantId,
      alertType: 'wanted_slot_admin_notice',
      occurrenceRef,
      contractVersion: 1,
      occurredAt: fact.occurredAt.toISOString(),
      expiresAt: fact.expiresAt.toISOString(),
      source: fact.source,
      policy: alertPolicy('wanted_slot_admin_notice'),
      recipients: members.map((member) =>
        this.recipient(tenantId, occurrenceRef, member, {
          title: 'Запрос на желаемое время',
          bodyText: `Клиент оставил подтверждённый запрос на ${fact.source.desiredStartAt}.`,
          deepLink: '/app/?panel=schedule',
          payload: {
            interest_id: interestId,
            branch_id: fact.source.branchId,
            staff_id: fact.source.staffId,
            desired_start_at: fact.source.desiredStartAt,
          },
        }),
      ),
    };
    return this.resume(
      await this.store.admit(plan, (tx) => this.verify(plan, tx), now),
    );
  }
  async resume(root: OperationalAlertRun) {
    this.system(root.tenantId);
    const plan = this.store.read(root),
      executions = await this.store.executions(root, plan),
      results: Array<{ slotKey: string; state: string }> = [];
    for (const recipient of plan.recipients) {
      const existing = executions.find(
        (row) => row.operationalAlertSlotKey === recipient.slot.key,
      )!;
      if (['SUCCEEDED', 'FAILED', 'NOT_EXECUTED'].includes(existing.state)) {
        results.push({ slotKey: recipient.slot.key, state: existing.state });
        continue;
      }
      try {
        await this.delivery.deliverOperationalAlert(
          await this.store.dispatch(root, recipient, () => this.verify(plan)),
        );
      } catch {
        /* Each recipient keeps its canonical AE/CD outcome; no fake delivery or new slot. */
      }
      const current = await this.prisma.actionExecution.findUniqueOrThrow({
        where: { id_tenantId: { id: existing.id, tenantId: root.tenantId } },
      });
      results.push({ slotKey: recipient.slot.key, state: current.state });
    }
    return { admitted: true, runId: root.id, results };
  }
  async tickTenant(tenantId: string, now = new Date()) {
    this.system(tenantId);
    if (
      !Number.isFinite(this.store.cutoverAt) ||
      now.getTime() <= this.store.cutoverAt
    )
      return { disabled: true };
    let cursor: string | undefined,
      resumed = 0;
    for (;;) {
      const roots = await this.prisma.operationalAlertRun.findMany({
        where: {
          tenantId,
          intentEncrypted: { not: null },
          executions: { some: { state: { in: ['READY', 'UNKNOWN'] } } },
        },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!roots.length) break;
      for (const root of roots)
        try {
          await this.resume(root);
          resumed++;
        } catch {
          /* durable record is retained for resolution */
        }
      cursor = roots.at(-1)!.id;
    }
    cursor = undefined;
    for (;;) {
      const interests: Array<{ id: string }> =
        await this.prisma.clientWantedSlotInterest.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            createdAt: {
              gt: new Date(
                Math.max(this.store.cutoverAt, now.getTime() - ALERT_DAY),
              ),
            },
            expiresAt: { gt: now },
          },
          orderBy: { id: 'asc' },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
      if (!interests.length) break;
      for (const row of interests)
        try {
          await this.wanted(tenantId, row.id, now);
        } catch {
          /* no source authority/freshness => no effect */
        }
      cursor = interests.at(-1)!.id;
    }
    cursor = undefined;
    for (;;) {
      const staff: Prisma.StaffGetPayload<{
        include: { branch: true; tenant: true };
      }>[] = await this.prisma.staff.findMany({
        where: {
          tenantId,
          active: true,
          userId: { not: null },
          branchId: { not: null },
        },
        include: { branch: true, tenant: true },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!staff.length) break;
      for (const row of staff) {
        const timezone = row.branch?.timezone || row.tenant.defaultTimezone;
        // A midnight shift can be due on the previous local day. Dates are still
        // canonical schedule dates; the source's five-minute admission window wins.
        const dates = new Set([
          localCalendarDate(timezone, now),
          localCalendarDate(timezone, new Date(now.getTime() + 60 * 60000)),
        ]);
        for (const date of dates)
          for (const lead of [60, 30] as const)
            try {
              await this.shift(tenantId, row.id, date, lead, now);
            } catch {
              /* only due canonical shifts are admitted */
            }
      }
      cursor = staff.at(-1)!.id;
    }
    return { resumed };
  }
}
