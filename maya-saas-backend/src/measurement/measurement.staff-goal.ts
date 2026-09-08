import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { package5Wave1Hash } from '../package5-wave1/package5-wave1.service';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import {
  measurementLocalDay,
  measurementReadWindow,
} from './measurement.period';
import {
  financeMetric,
  type MeasurementFinancialRead,
} from './measurement.finance.facts';
import {
  staffGoalFacts,
  staffGoalTargetMinor,
} from './measurement.staff-goal.facts';
import {
  measurementHash,
  type MeasurementResult,
  type MeasurementSource,
  type NormalizedMeasurementIntent,
} from './measurement.contract';

export const STAFF_GOAL_QUERY = 'c7.staff-goal.read.v1';
const FINANCE_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'accountant',
]);
const OWN_ROLES = new Set([
  ...FINANCE_ROLES,
  'manager',
  'branch_manager',
  'provider',
  'employee',
  'staff',
]);

/** C7 read-only payroll and private A22 goal observation; no source or configuration writer. */
@Injectable()
export class MeasurementStaffGoalReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly context: TenantContextService,
  ) {}
  supports(kind: string) {
    return kind === 'staff_goal';
  }
  async authorize(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    this.context.assertTenantId(tenantId);
    if (this.context.get()?.source !== 'system' || this.context.get()?.userId)
      throw new Error('measurement_system_producer_required');
    const own = i.scope.capabilityKey === 'analytics.employee.read';
    if (
      !this.supports(i.kind) ||
      !i.staffId ||
      !i.configurationUserId ||
      i.clientId ||
      i.appointmentId ||
      i.branchId ||
      i.scope.branchIds.length ||
      Object.keys(i.scope.dimensions).length ||
      (!own && i.scope.capabilityKey !== 'analytics.business.finance.read') ||
      Object.keys(i.scope.sourceQuery).some(
        (key) => !['provider', 'integrationId', 'queryContract'].includes(key),
      ) ||
      i.scope.sourceQuery.queryContract !== STAFF_GOAL_QUERY
    )
      throw new Error('measurement_staff_goal_scope_unsupported');
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        defaultTimezone: true,
        calendarSource: true,
      },
    });
    if (tenant?.status !== 'active')
      throw new Error('measurement_tenant_inactive');
    if (
      !tenant.defaultTimezone ||
      new Intl.DateTimeFormat('en', {
        timeZone: tenant.defaultTimezone,
      }).resolvedOptions().timeZone !== i.timezone
    )
      throw new Error('measurement_staff_goal_timezone_mismatch');
    staffGoalMonth(i);
    const membership = await db.membership.findUnique({
      where: { userId_tenantId: { userId: i.configurationUserId, tenantId } },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        role: true,
        status: true,
        branchId: true,
        updatedAt: true,
        user: { select: { status: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active' ||
      !(own ? OWN_ROLES : FINANCE_ROLES).has(membership.role)
    )
      throw new Error('measurement_staff_goal_viewer_revoked');
    const staff = await db.staff.findUnique({
      where: { id_tenantId: { id: i.staffId, tenantId } },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        branchId: true,
        active: true,
        updatedAt: true,
      },
    });
    if (
      !staff?.active ||
      (membership.branchId && membership.branchId !== staff.branchId) ||
      (own && staff.userId !== i.configurationUserId)
    )
      throw new Error('measurement_staff_goal_subject_mismatch');
    const integration = await db.crmIntegration.findUnique({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        status: true,
        updatedAt: true,
      },
    });
    const internal = tenant.calendarSource === 'internal';
    if (internal) {
      if (
        i.scope.sourceQuery.provider !== 'internal' ||
        i.scope.sourceQuery.integrationId
      )
        throw new Error('measurement_staff_goal_integration_mismatch');
      return {
        tenant,
        membership,
        staff,
        integration: null,
        link: null,
        access: null,
        own,
      };
    }
    if (
      !integration ||
      integration.status !== 'active' ||
      integration.provider !== 'yclients' ||
      i.scope.sourceQuery.provider !== integration.provider ||
      i.scope.sourceQuery.integrationId !== integration.id
    )
      throw new Error('measurement_staff_goal_integration_mismatch');
    const links = await db.staffProviderLink.findMany({
      where: {
        tenantId,
        staffId: staff.id,
        provider: integration.provider,
        unlinkedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        staffId: true,
        provider: true,
        externalId: true,
        updatedAt: true,
      },
      take: 2,
    });
    if (links.length !== 1 || !links[0].externalId)
      throw new Error('measurement_staff_goal_provider_binding_missing');
    const access = own
      ? await db.crmStaffAccess.findUnique({
          where: {
            tenantId_userId: { tenantId, userId: i.configurationUserId },
          },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            staffId: true,
            externalStaffId: true,
            status: true,
            role: true,
            updatedAt: true,
          },
        })
      : null;
    if (
      own &&
      (!access ||
        access.status !== 'active' ||
        access.staffId !== staff.id ||
        access.externalStaffId !== links[0].externalId ||
        access.role !== membership.role)
    )
      throw new Error('measurement_staff_goal_own_access_revoked');
    return {
      tenant,
      membership,
      staff,
      integration,
      link: links[0],
      access,
      own,
    };
  }
  private async configuration(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    db: Prisma.TransactionClient,
  ) {
    const targetRef = `dashboard-preference:${i.configurationUserId}:finance`;
    const preference = await db.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          tenantId,
          userId: i.configurationUserId!,
          section: 'finance',
        },
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        configJson: true,
        updatedAt: true,
      },
    });
    const mutation = await db.actionTargetMutation.findFirst({
      where: { tenantId, targetKind: 'setting', targetRef },
      orderBy: { targetGeneration: 'desc' },
      select: {
        id: true,
        tenantId: true,
        actionExecutionId: true,
        targetKind: true,
        targetRef: true,
        mutationKind: true,
        targetGeneration: true,
        afterStateHash: true,
        createdAt: true,
      },
    });
    const execution = mutation
      ? await db.actionExecution.findFirst({
          where: { id: mutation.actionExecutionId, tenantId },
          select: {
            id: true,
            tenantId: true,
            actorUserId: true,
            state: true,
            dryRun: true,
            actionClass: true,
            capability: true,
            policyDecision: true,
            targetKind: true,
            targetRef: true,
            normalizedInputHash: true,
          },
        })
      : null;
    const proven =
      !!preference &&
      !!mutation &&
      !!execution &&
      mutation.mutationKind === 'finance_preferences' &&
      mutation.afterStateHash === package5Wave1Hash(preference.configJson) &&
      mutation.targetGeneration >= 0 &&
      execution.actorUserId === i.configurationUserId &&
      execution.state === 'SUCCEEDED' &&
      !execution.dryRun &&
      execution.policyDecision === 'ALLOW' &&
      execution.actionClass === 'update_finance_dashboard_preferences' &&
      execution.capability === 'package5.settings.finance.execute.v1' &&
      execution.targetKind === 'setting' &&
      execution.targetRef === targetRef &&
      preference.updatedAt <= i.asOf &&
      mutation.createdAt <= i.asOf;
    return { preference, mutation, execution, proven };
  }
  async read(
    tenantId: string,
    i: NormalizedMeasurementIntent,
  ): Promise<MeasurementResult> {
    const local = await canonicalUtcTransaction(
      this.prisma,
      async (tx) => ({
        authority: await this.authorize(tenantId, i, tx),
        configuration: await this.configuration(tenantId, i, tx),
      }),
      {
        readOnly: true,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
    const window = measurementReadWindow(i);
    let summary: MeasurementFinancialRead | null = null;
    const reasons = [
      'staff_goal_configuration_is_private_to_its_owner',
      'source_observations_are_not_historical_reconstruction',
    ];
    if (
      window.nonempty &&
      window.wholeLocalDays &&
      local.authority.integration
    ) {
      try {
        summary = await this.crm.getFinancialSummary(tenantId, {
          from: window.from.toISOString(),
          to: new Date(window.to.getTime() - 1).toISOString(),
        });
      } catch {
        reasons.push('staff_financial_reader_unavailable');
      }
      if (
        summary &&
        (summary.provider !== local.authority.integration.provider ||
          summary.source !== 'external_crm' ||
          !sameTimezone(summary.period.timezone, i.timezone) ||
          summary.period.from !== window.fromDay ||
          summary.period.to !== window.toDay)
      ) {
        summary = null;
        reasons.push('staff_financial_reader_scope_mismatch');
      }
    }
    const observedAt = new Date().toISOString();
    const sources: MeasurementSource[] = [];
    const source = (
      owner: string,
      kind: string,
      id: string,
      data: unknown,
      coverage: string,
      qualification: MeasurementSource['qualification'] = 'VERIFIED',
    ) => {
      sources.push({
        owner,
        kind,
        tenantId,
        id,
        stateHash: measurementHash(data),
        observedAt,
        qualification,
        coverage,
      });
      return sources.length - 1;
    };
    source(
      'CrmIntegration',
      'staff_finance_query_binding',
      local.authority.integration?.id ??
        measurementHash(['internal-staff-finance', tenantId]),
      local.authority,
      'exact_staff_configuration_query_authority',
    );
    source(
      'Staff',
      'canonical_staff_goal_subject',
      local.authority.staff.id,
      local.authority.staff,
      'active_canonical_staff',
    );
    source(
      'Membership',
      'staff_goal_configuration_membership',
      local.authority.membership.id,
      local.authority.membership,
      'current_private_configuration_owner',
    );
    if (local.authority.link)
      source(
        'StaffProviderLink',
        'staff_goal_provider_binding',
        local.authority.link.id,
        local.authority.link,
        'exact_active_provider_staff',
      );
    if (local.authority.access)
      source(
        'CrmStaffAccess',
        'staff_goal_own_access',
        local.authority.access.id,
        local.authority.access,
        'current_own_staff_access',
      );
    const configurationRef = source(
      'DashboardPreference',
      'a22_private_finance_preference',
      local.configuration.preference?.id ??
        measurementHash([tenantId, i.configurationUserId, 'finance']),
      local.configuration,
      local.configuration.proven
        ? 'a22_exact_current_finance_generation'
        : 'private_goal_configuration_unproved',
    );
    const goalRefs = [configurationRef];
    if (local.configuration.mutation)
      goalRefs.push(
        source(
          'ActionTargetMutation',
          'a22_finance_generation',
          local.configuration.mutation.id,
          local.configuration.mutation,
          'exact_latest_finance_target_generation',
        ),
      );
    if (local.configuration.execution)
      goalRefs.push(
        source(
          'ActionExecution',
          'a22_finance_configuration_execution',
          local.configuration.execution.id,
          local.configuration.execution,
          'a22_configuration_execution_evidence',
        ),
      );
    const config = local.configuration.preference?.configJson;
    const targets =
      config &&
      typeof config === 'object' &&
      !Array.isArray(config) &&
      config.schema_version === 1
        ? config.staff_targets_rub
        : null;
    const rawTarget =
      targets &&
      typeof targets === 'object' &&
      !Array.isArray(targets) &&
      local.authority.link
        ? targets[local.authority.link.externalId]
        : null;
    const facts = staffGoalFacts({
      summary,
      externalStaffId: local.authority.link?.externalId ?? null,
      targetMinor: staffGoalTargetMinor(rawTarget),
      targetProven: local.configuration.proven,
      exactWindow: window.nonempty && window.wholeLocalDays,
      financeRef: sources.length,
      goalRefs,
    });
    source(
      'CrmFinancialSummary',
      'canonical_staff_financial_query',
      measurementHash([
        'c7.staff-finance-query/1',
        tenantId,
        i.staffId,
        i.scope.sourceQuery,
        window.from,
        window.to,
      ]),
      facts.metrics.filter((m) => m.sourceRefs.includes(sources.length)),
      'selected_staff_only_provider_observation',
      summary ? 'SOURCE_LABELLED' : 'UNQUALIFIED',
    );
    if (!local.configuration.proven)
      reasons.push('private_goal_a22_revision_unproved');
    if (window.open) reasons.push('staff_goal_month_in_progress');
    const metrics = [
      ...facts.metrics,
      financeMetric(
        'observed_period_from',
        window.from.toISOString(),
        'instant',
        'canonical_half_open_window',
        'COMPLETE',
        [],
      ),
      financeMetric(
        'observed_period_to_exclusive',
        window.to.toISOString(),
        'instant',
        'canonical_half_open_window',
        'COMPLETE',
        [],
      ),
    ];
    const measured = facts.metrics.some(
      (m) => m.key !== 'goal_progress_rounding' && m.value !== null,
    );
    return {
      sources,
      dependencies: [],
      metrics,
      reasons: [...new Set([...reasons, ...facts.reasons])].sort(),
      completeness: measured ? 'PARTIAL' : 'UNAVAILABLE',
      qualification: summary ? 'SOURCE_LABELLED' : 'UNQUALIFIED',
      attributionStatus: 'NOT_APPLICABLE',
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
  }
  async assertPreparedCurrent(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    result: MeasurementResult,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const targetRef = `dashboard-preference:${i.configurationUserId}:finance`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`${tenantId}:p5-wave1:setting:${targetRef}`},0))::text`;
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${i.configurationUserId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${tenantId} AND "userId"=${i.configurationUserId} FOR SHARE`;
    // FOR UPDATE also conflicts with a new provider link's FK key-share lock.
    // It fences ambiguous-link insertion without writing the Staff owner.
    await tx.$queryRaw`SELECT id FROM "Staff" WHERE "tenantId"=${tenantId} AND id=${i.staffId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "CrmIntegration" WHERE "tenantId"=${tenantId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "StaffProviderLink" WHERE "tenantId"=${tenantId} AND "staffId"=${i.staffId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "CrmStaffAccess" WHERE "tenantId"=${tenantId} AND "userId"=${i.configurationUserId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "DashboardPreference" WHERE "tenantId"=${tenantId} AND "userId"=${i.configurationUserId} AND section='finance' FOR SHARE`;
    const mutationId =
      result.sources.find((s) => s.owner === 'ActionTargetMutation')?.id ??
      null;
    const executionId =
      result.sources.find((s) => s.owner === 'ActionExecution')?.id ?? null;
    await tx.$queryRaw`SELECT id FROM "ActionTargetMutation" WHERE "tenantId"=${tenantId} AND id=${mutationId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "ActionExecution" WHERE "tenantId"=${tenantId} AND id=${executionId} FOR SHARE`;
    const authority = await this.authorize(tenantId, i, tx);
    const configuration = await this.configuration(tenantId, i, tx);
    if (
      result.sources.find((s) => s.owner === 'CrmIntegration')?.stateHash !==
      measurementHash(authority)
    )
      throw new Error('measurement_staff_goal_authority_changed');
    if (
      result.sources.find((s) => s.owner === 'DashboardPreference')
        ?.stateHash !== measurementHash(configuration)
    )
      throw new Error('measurement_staff_goal_configuration_changed');
  }
}
export function staffGoalMonth(i: NormalizedMeasurementIntent): void {
  const fromDay = measurementLocalDay(i.periodFrom, i.timezone);
  const [year, month] = fromDay.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  if (
    !fromDay.endsWith('-01') ||
    localDateMinuteToUtc(fromDay, 0, i.timezone).getTime() !==
      i.periodFrom.getTime() ||
    localDateMinuteToUtc(nextDay, 0, i.timezone).getTime() !==
      i.periodTo.getTime() ||
    i.asOf <= i.periodFrom
  )
    throw new Error('measurement_staff_goal_calendar_month_required');
}
function sameTimezone(source: string, target: string) {
  try {
    return (
      new Intl.DateTimeFormat('en', { timeZone: source }).resolvedOptions()
        .timeZone === target
    );
  } catch {
    return false;
  }
}
