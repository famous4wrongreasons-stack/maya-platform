import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OwnerReportRun } from '@prisma/client';
import {
  ActionConflictError,
  ActionContractError,
} from '../action-engine/action-engine.errors';
import {
  ActionIdentityService,
  stableActionJson,
} from '../action-engine/action-engine.identity';
import { CanonicalActionIngressService } from '../action-engine/action-engine.ingress';
import { filterAssistantCapability } from '../dashboard-preferences/assistant-preferences.read';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { localCalendarDate, dayIsoRange } from './owner-reports.time';
import {
  normalizeOwnerReportPlan,
  ownerReportFingerprint,
  ownerReportRequest,
  OWNER_REPORT_DAY,
  OWNER_REPORT_ROLES,
  type OwnerReportPlan,
  type OwnerReportRecipient,
  type OwnerReportSlot,
  type OwnerReportChannel,
} from './owner-report.contract';

/** Persistence/authorization support for OwnerReportsService. No transport or job ownership. */
@Injectable()
export class OwnerReportStore {
  readonly identity: ActionIdentityService;
  private readonly cutoverAt: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService,
    config: ConfigService,
  ) {
    this.cutoverAt = Date.parse(
      config.get<string>('OWNER_REPORTS_CANONICAL_CUTOVER_AT') ?? '',
    );
    this.identity = new ActionIdentityService(
      config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
      config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
    );
  }
  slot(
    tenantId: string,
    userId: string,
    channel: OwnerReportChannel,
    routeId: string,
    destination: string,
  ): OwnerReportSlot {
    const routeHash = this.identity.hmac('maya.owner-report-route/1', {
      tenantId,
      userId,
      channel,
      routeId,
      destination,
    });
    return {
      channel,
      routeId,
      destination,
      routeHash,
      key: this.identity.hmac('maya.owner-report-slot/1', {
        tenantId,
        userId,
        channel,
        routeId,
        routeHash,
      }),
    };
  }
  find(tenantId: string, periodLocalDate: string) {
    this.context.assertTenantId(tenantId);
    return this.prisma.ownerReportRun.findUnique({
      where: {
        tenantId_reportType_periodLocalDate_reportVersion: {
          tenantId,
          reportType: 'daily_report',
          periodLocalDate,
          reportVersion: 1,
        },
      },
    });
  }
  private normalize(candidate: OwnerReportPlan) {
    const plan = normalizeOwnerReportPlan(candidate);
    for (const recipient of plan.recipients)
      for (const slot of recipient.slots) {
        const expected = this.slot(
          plan.tenantId,
          recipient.userId,
          slot.channel,
          slot.routeId,
          slot.destination,
        );
        if (expected.key !== slot.key || expected.routeHash !== slot.routeHash)
          throw new ActionContractError(
            'Owner report route evidence does not match immutable destination',
          );
      }
    return plan;
  }
  readPlan(run: OwnerReportRun, now = new Date()) {
    this.context.assertTenantId(run.tenantId);
    if (!run.intentEncrypted || run.payloadRetentionUntil <= now)
      throw new ActionContractError('B36_REPORT_PAYLOAD_EXPIRED');
    const plan = this.normalize(
      JSON.parse(
        this.identity.decryptNormalizedPayload(run.intentEncrypted),
      ) as OwnerReportPlan,
    );
    if (
      ownerReportFingerprint(this.identity, plan) !== run.intentHash ||
      plan.tenantId !== run.tenantId ||
      plan.reportType !== run.reportType ||
      plan.periodLocalDate !== run.periodLocalDate ||
      plan.reportVersion !== run.reportVersion ||
      plan.timezone !== run.timezone ||
      plan.expiresAt !== run.expiresAt.toISOString()
    )
      throw new ActionContractError('B36_REPORT_MANIFEST_MISMATCH');
    return plan;
  }
  async admit(candidate: OwnerReportPlan, now = new Date()) {
    this.context.assertTenantId(candidate.tenantId);
    const plan = this.normalize(candidate);
    const intentHash = ownerReportFingerprint(this.identity, plan);
    if (Date.parse(plan.expiresAt) <= now.getTime())
      throw new ActionContractError('B36_REPORT_EXPIRED');
    const equivalent = (run: OwnerReportRun) => {
      if (run.intentHash !== intentHash)
        throw new ActionConflictError(
          'B36 report identity has a different immutable plan',
        );
      return run;
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const previous = await tx.ownerReportRun.findUnique({
              where: {
                tenantId_reportType_periodLocalDate_reportVersion: {
                  tenantId: plan.tenantId,
                  reportType: plan.reportType,
                  periodLocalDate: plan.periodLocalDate,
                  reportVersion: plan.reportVersion,
                },
              },
            });
            if (previous) return equivalent(previous);
            if (
              !Number.isFinite(this.cutoverAt) ||
              Date.parse(plan.periodStart) <= this.cutoverAt ||
              plan.periodLocalDate !== localCalendarDate(plan.timezone, now)
            )
              throw new ActionContractError(
                'B36_PROSPECTIVE_CURRENT_PERIOD_REQUIRED',
              );
            for (const recipient of plan.recipients) {
              await this.authorize(plan, recipient, undefined, tx);
              for (const slot of recipient.slots)
                await this.authorize(plan, recipient, slot, tx);
            }
            const run = await tx.ownerReportRun.create({
              data: {
                tenantId: plan.tenantId,
                reportType: plan.reportType,
                periodLocalDate: plan.periodLocalDate,
                reportVersion: plan.reportVersion,
                timezone: plan.timezone,
                intentHash,
                intentEncrypted: this.identity.encryptNormalizedPayload(
                  stableActionJson(plan),
                ),
                admittedAt: now,
                expiresAt: new Date(plan.expiresAt),
                payloadRetentionUntil: new Date(
                  now.getTime() + 7 * OWNER_REPORT_DAY,
                ),
                auditRetentionUntil: new Date(
                  now.getTime() + 365 * OWNER_REPORT_DAY,
                ),
              },
            });
            for (const recipient of plan.recipients)
              for (const slot of recipient.slots) {
                const execution = await this.ingress.createExecution(
                  ownerReportRequest(
                    run.id,
                    this.identity,
                    plan,
                    recipient,
                    slot,
                  ),
                  tx,
                );
                if (
                  execution.state !== 'READY' ||
                  execution.ownerReportRunId !== run.id ||
                  execution.ownerReportSlotKey !== slot.key
                )
                  throw new ActionContractError(
                    'B36_ALL_SLOTS_MUST_BE_ADMITTED',
                  );
              }
            return run;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 30000,
            maxWait: 10000,
          },
        );
      } catch (error) {
        const retry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code);
        if (!retry || attempt === 4) throw error;
        const existing = await this.find(plan.tenantId, plan.periodLocalDate);
        if (existing) return equivalent(existing);
      }
    }
    throw new ActionConflictError('B36 admission did not converge');
  }
  async authorize(
    plan: OwnerReportPlan,
    recipient: OwnerReportRecipient,
    slot?: OwnerReportSlot,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    this.context.assertTenantId(plan.tenantId);
    const member = await db.membership.findFirst({
      where: {
        id: recipient.membershipId,
        tenantId: plan.tenantId,
        userId: recipient.userId,
        status: 'active',
        role: { in: [...OWNER_REPORT_ROLES] },
        user: { status: 'active' },
      },
      select: { id: true },
    });
    const enabled =
      member &&
      (await filterAssistantCapability(
        db,
        plan.tenantId,
        [recipient.userId],
        'daily_brief',
      ));
    if (!member || !enabled?.includes(recipient.userId))
      throw new ForbiddenException('B36_REPORT_RECIPIENT_NOT_AUTHORIZED');
    if (!slot || slot.channel === 'inbox') return;
    const binding =
      slot.channel === 'telegram'
        ? await db.authIdentity.findFirst({
            where: {
              id: slot.routeId,
              tenantId: plan.tenantId,
              userId: recipient.userId,
              provider: 'telegram',
              providerUserId: slot.destination,
            },
            select: { id: true },
          })
        : await db.devicePushToken.findFirst({
            where: {
              id: slot.routeId,
              tenantId: plan.tenantId,
              userId: recipient.userId,
              platform: 'ios',
              token: slot.destination,
            },
            select: { id: true },
          });
    if (!binding) throw new ForbiddenException('B36_REPORT_ROUTE_REVOKED');
  }
  async executions(run: OwnerReportRun, plan: OwnerReportPlan) {
    this.context.assertTenantId(run.tenantId);
    const executions = await this.prisma.actionExecution.findMany({
      where: { tenantId: run.tenantId, ownerReportRunId: run.id },
    });
    const expected = plan.recipients
      .flatMap((r) => r.slots.map((s) => s.key))
      .sort();
    if (
      stableActionJson(executions.map((e) => e.ownerReportSlotKey).sort()) !==
      stableActionJson(expected)
    )
      throw new ActionContractError('B36_REPORT_SLOT_SET_MISMATCH');
    return executions;
  }
  async assertDispatchAllowed(
    run: OwnerReportRun,
    plan: OwnerReportPlan,
    recipient: OwnerReportRecipient,
    slot: OwnerReportSlot,
  ) {
    const current = await this.prisma.ownerReportRun.findUniqueOrThrow({
      where: { id_tenantId: { id: run.id, tenantId: run.tenantId } },
    });
    const now = new Date();
    if (
      current.expiresAt <= now ||
      current.payloadRetentionUntil <= now ||
      !current.intentEncrypted ||
      current.intentHash !== run.intentHash
    )
      throw new ForbiddenException('B36_REPORT_EXPIRED');
    const immutable = this.readPlan(current);
    const canonicalRecipient = immutable.recipients.find(
      (r) => r.userId === recipient.userId,
    );
    const canonicalSlot = canonicalRecipient?.slots.find(
      (s) => s.key === slot.key,
    );
    if (
      stableActionJson(immutable) !== stableActionJson(plan) ||
      !canonicalRecipient ||
      !canonicalSlot ||
      stableActionJson(canonicalRecipient) !== stableActionJson(recipient) ||
      stableActionJson(canonicalSlot) !== stableActionJson(slot)
    )
      throw new ForbiddenException('B36_REPORT_DISPATCH_MANIFEST_MISMATCH');
    const executions = await this.executions(current, plan);
    for (const predecessor of recipient.slots.slice(
      0,
      recipient.slots.findIndex((s) => s.key === slot.key),
    )) {
      if (
        executions.find((e) => e.ownerReportSlotKey === predecessor.key)
          ?.state !== 'SUCCEEDED'
      )
        throw new ForbiddenException('B36_PREVIOUS_SLOT_NOT_SUCCESSFUL');
    }
    await this.authorize(plan, recipient, slot);
    const preview = await this.ingress.preview(
      ownerReportRequest(run.id, this.identity, plan, recipient, slot),
    );
    if (preview.policyDecision !== 'ALLOW')
      throw new ForbiddenException('B36_CURRENT_POLICY_DENIED');
  }
  /** Resolve an admitted slot from durable evidence, never from caller route/content. */
  async dispatch(tenantId: string, runId: string, slotKey: string) {
    this.context.assertTenantId(tenantId);
    const run = await this.prisma.ownerReportRun.findUniqueOrThrow({
      where: { id_tenantId: { id: runId, tenantId } },
    });
    const plan = this.readPlan(run);
    const recipient = plan.recipients.find((r) =>
      r.slots.some((s) => s.key === slotKey),
    );
    const slot = recipient?.slots.find((s) => s.key === slotKey);
    if (!recipient || !slot)
      throw new ActionContractError('B36_SLOT_NOT_IN_ADMITTED_PLAN');
    await this.executions(run, plan);
    return {
      request: ownerReportRequest(run.id, this.identity, plan, recipient, slot),
      authorize: () => this.assertDispatchAllowed(run, plan, recipient, slot),
    };
  }
  canAdmitPeriod(timezone: string, localDate: string, now: Date) {
    return (
      Number.isFinite(this.cutoverAt) &&
      localDate === localCalendarDate(timezone, now) &&
      Date.parse(dayIsoRange(timezone, localDate).from) > this.cutoverAt
    );
  }
  async purgeExpiredPayloads(tenantId: string, now = new Date()) {
    this.context.assertTenantId(tenantId);
    return this.prisma.ownerReportRun.updateMany({
      where: {
        tenantId,
        payloadRetentionUntil: { lte: now },
        intentEncrypted: { not: null },
      },
      data: { intentEncrypted: null },
    });
  }
}
