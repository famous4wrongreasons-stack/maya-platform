import { staffTelegramEligible } from '../package5-wave1/governed-settings.read';
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
import { retryableBulkTransaction } from '../marketing/canonical-bulk.contract';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { localCalendarDate, dayIsoRange, localHour } from './owner-reports.time';
import {
  normalizeCanonicalOwnerReportPlan,
  MORNING_STAFF_ROLES,
  ownerReportFingerprint,
  ownerReportRequest,
  OWNER_REPORT_DAY,
  OWNER_REPORT_ROLES,
  type CanonicalOwnerReportPlan,
  type MorningReportRecipient,
  type CanonicalOwnerReportRecipient,
  type OwnerReportSlot,
  type OwnerReportChannel,
} from './owner-report.contract';

/** Persistence/authorization support for OwnerReportsService. No transport or job ownership. */
@Injectable()
export class OwnerReportStore {
  readonly identity: ActionIdentityService;
  private readonly cutoverAt: number;
  private readonly morningCutoverAt: number;
  private readonly morningHour: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService,
    config: ConfigService,
  ) {
    this.morningCutoverAt = Date.parse(config.get<string>('OWNER_REPORTS_MORNING_CANONICAL_CUTOVER_AT') ?? '');
    const hour = Number(config.get<string>('OWNER_REPORTS_MORNING_HOUR'));
    this.morningHour = Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.trunc(hour) : 8;
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
  find(tenantId: string, periodLocalDate: string, reportType: CanonicalOwnerReportPlan['reportType'] = 'daily_report') {
    this.context.assertTenantId(tenantId);
    return this.prisma.ownerReportRun.findUnique({
      where: {
        tenantId_reportType_periodLocalDate_reportVersion: {
          tenantId,
          reportType,
          periodLocalDate,
          reportVersion: 1,
        },
      },
    });
  }
  private normalize(candidate: CanonicalOwnerReportPlan) {
    const plan = normalizeCanonicalOwnerReportPlan(candidate);
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
      ) as CanonicalOwnerReportPlan,
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
  async admit(candidate: CanonicalOwnerReportPlan, now = new Date()) {
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
              !this.canAdmitPeriod(plan.timezone, plan.periodLocalDate, now, plan.reportType)
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
        const retry = retryableBulkTransaction(error);
        if (!retry || attempt === 4) throw error;
        const existing = await this.find(plan.tenantId, plan.periodLocalDate, plan.reportType);
        if (existing) return equivalent(existing);
      }
    }
    throw new ActionConflictError('B36 admission did not converge');
  }
  async authorize(
    plan: CanonicalOwnerReportPlan,
    recipient: CanonicalOwnerReportRecipient,
    slot?: OwnerReportSlot,
    db: Prisma.TransactionClient = this.prisma,
    purpose: 'delivery'|'snapshot' = 'delivery',
  ) {
    this.context.assertTenantId(plan.tenantId);
    const member = await db.membership.findFirst({
      where: {
        id: recipient.membershipId,
        tenantId: plan.tenantId,
        userId: recipient.userId,
        status: 'active',
        role: { in: [...(plan.reportType === 'morning_staff' ? MORNING_STAFF_ROLES : OWNER_REPORT_ROLES)] },
        user: { status: 'active' },
      },
      select: { id: true },
    });
    const enabled =
      member && purpose === 'delivery' &&
      (await filterAssistantCapability(
        db,
        plan.tenantId,
        [recipient.userId],
        'daily_brief',
      ));
    if (!member || (purpose === 'delivery' && (!enabled || !enabled.includes(recipient.userId))))
      throw new ForbiddenException('B36_REPORT_RECIPIENT_NOT_AUTHORIZED');
    if (plan.reportType === 'morning_staff') {
      const frozen = recipient as MorningReportRecipient;
      const binding = await this.staffBinding(plan.tenantId, recipient.userId, db);
      if (!binding || binding.staffId !== frozen.staffId || binding.evidenceHash !== frozen.staffBindingEvidenceHash)
        throw new ForbiddenException('R05_CANONICAL_STAFF_BINDING_REVOKED');
    }
    if (!slot || slot.channel === 'inbox') return;
    if (slot.channel === 'telegram' && !(await staffTelegramEligible(db,plan.tenantId,recipient.userId,recipient.membershipId))) throw new ForbiddenException('R11_STAFF_TELEGRAM_NOT_ELIGIBLE');
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
  async executions(run: OwnerReportRun, plan: CanonicalOwnerReportPlan) {
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
    plan: CanonicalOwnerReportPlan,
    recipient: CanonicalOwnerReportRecipient,
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
  canAdmitPeriod(timezone: string, localDate: string, now: Date, reportType: CanonicalOwnerReportPlan['reportType'] = 'daily_report') {
    const morning = reportType !== 'daily_report';
    const cutover = morning ? this.morningCutoverAt : this.cutoverAt;
    return Number.isFinite(cutover) && localDate === localCalendarDate(timezone, now) &&
      Date.parse(dayIsoRange(timezone, localDate).from) > cutover &&
      (!morning || localHour(timezone,now) >= this.morningHour);
  }
  /** Staff is the authority; legacy calendar projections only qualify the already-bound fact slice. */
  async staffBinding(tenantId: string, userId: string, db: Prisma.TransactionClient = this.prisma) {
    this.context.assertTenantId(tenantId);
    const [staff, tenant] = await Promise.all([
      db.staff.findFirst({where:{tenantId,userId,active:true,user:{status:'active'}},select:{id:true,branchId:true}}),
      db.tenant.findUnique({where:{id:tenantId},select:{calendarSource:true}}),
    ]);
    if (!staff || !tenant) return null;
    let evidence: Record<string, unknown>, externalRef: string;
    if (tenant.calendarSource === 'internal') {
      const projection = await db.internalProvider.findFirst({where:{id:staff.id,tenantId,userId,active:true},select:{id:true,branchId:true}});
      if (!projection || projection.branchId !== staff.branchId) return null;
      externalRef = projection.id;
      evidence = {calendar:'internal',projectionId:projection.id};
    } else {
      const integration = await db.crmIntegration.findFirst({where:{tenantId,status:'active'},select:{id:true,provider:true,settingsJson:true}});
      if (!integration) return null;
      const settings = integration.settingsJson as Record<string,unknown> | null;
      const company = settings?.companyId;
      if ((typeof company !== 'string' && typeof company !== 'number') || !String(company).trim()) return null;
      const [access, links] = await Promise.all([
        db.crmStaffAccess.findFirst({where:{tenantId,userId,staffId:staff.id,status:'active',role:{in:[...MORNING_STAFF_ROLES]}},select:{id:true,externalStaffId:true}}),
        db.staffProviderLink.findMany({where:{tenantId,staffId:staff.id,provider:integration.provider,unlinkedAt:null},select:{id:true,externalId:true}}),
      ]);
      if (!access || links.length !== 1 || links[0].externalId !== access.externalStaffId) return null;
      externalRef = links[0].externalId;
      evidence = {calendar:'external',integrationId:integration.id,provider:integration.provider,
        company:String(company).trim(),accessId:access.id,linkId:links[0].id,externalRef};
    }
    return {staffId:staff.id, externalRef,
      evidenceHash:this.identity.hmac('maya.owner-report-staff-binding/1',{tenantId,userId,staffId:staff.id,branchId:staff.branchId,...evidence})};
  }
  async snapshot(tenantId: string,userId: string,runId: string) {
    this.context.assertTenantId(tenantId);
    const run=await this.prisma.ownerReportRun.findUniqueOrThrow({where:{id_tenantId:{id:runId,tenantId}}});
    const plan=this.readPlan(run);
    const recipient=plan.recipients.find(r=>r.userId===userId);
    if(!recipient) throw new ForbiddenException('R05_SNAPSHOT_NOT_OWNED');
    await this.authorize(plan,recipient,undefined,this.prisma,'snapshot');
    const content=plan.reportType==='daily_report' ? plan.content : (recipient as MorningReportRecipient).content;
    return {contract:'maya.owner-report-snapshot/1',runId:run.id,reportType:run.reportType,
      periodLocalDate:run.periodLocalDate,timezone:run.timezone,content};
  }
  async snapshots(tenantId:string,userId:string) {
    this.context.assertTenantId(tenantId);
    const runs=await this.prisma.ownerReportRun.findMany({where:{tenantId,intentEncrypted:{not:null},payloadRetentionUntil:{gt:new Date()}},
      orderBy:[{periodLocalDate:'desc'},{id:'desc'}],take:100});
    const visible:Array<{runId:string;reportType:string;periodLocalDate:string;title:string}>=[];
    for(const run of runs) {
      const plan=this.readPlan(run);
      const recipient=plan.recipients.find(r=>r.userId===userId);
      if(!recipient) continue;
      try {await this.authorize(plan,recipient,undefined,this.prisma,'snapshot');}
      catch(error) {if(error instanceof ForbiddenException) continue;throw error;}
      const content=plan.reportType==='daily_report' ? plan.content : (recipient as MorningReportRecipient).content;
      visible.push({runId:run.id,reportType:run.reportType,periodLocalDate:run.periodLocalDate,title:content.title});
    }
    return {reports:visible};
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
