import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { measurementLocalDay } from './measurement.period';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import type { MayaFeatureKey } from '../common/feature-catalog';
import { MeasurementService } from './measurement.service';
import { MeasurementSources } from './measurement.sources';
import {
  MeasurementIntent,
  MeasurementKind,
  normalizeMeasurement,
  measurementId,
} from './measurement.contract';
import {
  presentMeasurement,
  resultFromRevision,
} from './measurement.presentation';

const BUSINESS = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'accountant',
];
const FINANCE = BUSINESS.filter((role) => role !== 'manager');
const OWN = [...BUSINESS, 'branch_manager', 'provider', 'employee', 'staff'];
export type MeasurementReadQuery = {
  kind: MeasurementKind;
  from: string;
  to: string;
  branchId?: string;
  clientId?: string;
  appointmentId?: string;
  staffId?: string;
  accountId?: string;
};

/** Authenticated projection, never an admission endpoint. Rules and sources are server-selected. */
@Injectable()
export class MeasurementReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly entitlements: EntitlementsService,
    private readonly measurement: MeasurementService,
    private readonly sources: MeasurementSources,
  ) {}

  private async member(tenantId: string, userId: string) {
    const ctx = this.context.get();
    if (
      !ctx ||
      ctx.tenantId !== tenantId ||
      ctx.userId !== userId ||
      !['membership', 'auth_session'].includes(ctx.source ?? '')
    )
      throw new ForbiddenException(
        'measurement_authenticated_principal_required',
      );
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        id: true,
        role: true,
        status: true,
        branchId: true,
        user: { select: { status: true } },
        tenant: {
          select: { status: true, calendarSource: true, defaultTimezone: true },
        },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active' ||
      membership.tenant.status !== 'active' ||
      membership.role !== ctx.role ||
      (ctx.membershipId && membership.id !== ctx.membershipId)
    )
      throw new ForbiddenException('measurement_membership_revoked');
    return membership;
  }

  async viewer(tenantId: string, userId: string, kind: MeasurementKind) {
    const membership = await this.member(tenantId, userId);
    const finance = [
      'business_period',
      'value_discrepancy',
      'appointment_outcome',
      'execution_funnel',
    ].includes(kind);
    if (
      !(
        ['staff_goal', 'reputation_period'].includes(kind)
          ? OWN
          : kind === 'client_history'
            ? [...BUSINESS, 'branch_manager']
            : finance
              ? FINANCE
              : BUSINESS
      ).includes(membership.role)
    )
      throw new ForbiddenException('measurement_capability_denied');
    if (
      kind === 'client_history' &&
      membership.role === 'branch_manager' &&
      !membership.branchId
    )
      throw new ForbiddenException('measurement_branch_scope_denied');
    const feature: MayaFeatureKey =
      kind === 'staff_goal'
        ? FINANCE.includes(membership.role)
          ? 'analytics.business'
          : 'analytics.employee'
        : kind === 'reputation_period'
          ? 'reviews.core'
          : 'analytics.business';
    const decision = await this.entitlements.resolveFeatureRequirements(
      tenantId,
      [feature],
    );
    if (!decision.allowed)
      throw new ForbiddenException('measurement_feature_denied');
    return membership;
  }

  private async scope(
    tenantId: string,
    userId: string,
    i: MeasurementIntent,
    member: Awaited<ReturnType<MeasurementReadService['viewer']>>,
  ) {
    if (
      i.kind !== 'staff_goal' &&
      member.branchId &&
      (i.branchId !== member.branchId ||
        i.scope.branchIds.some((id) => id !== member.branchId))
    )
      throw new ForbiddenException('measurement_branch_scope_denied');
    if (i.configurationUserId && i.configurationUserId !== userId)
      throw new ForbiddenException('measurement_private_configuration_denied');
    if (i.kind === 'reputation_period' && !BUSINESS.includes(member.role)) {
      if (i.scope.dimensions.source !== 'native_feedback')
        throw new ForbiddenException(
          'measurement_reputation_staff_scope_denied',
        );
      if (member.role === 'branch_manager') {
        if (!member.branchId || i.branchId !== member.branchId)
          throw new ForbiddenException('measurement_branch_scope_denied');
      } else {
        if (!i.staffId)
          throw new ForbiddenException('measurement_staff_scope_denied');
        const own = await this.prisma.staff.findFirst({
          where: {
            id: i.staffId,
            tenantId,
            userId,
            active: true,
            ...(member.branchId ? { branchId: member.branchId } : {}),
          },
          select: { id: true },
        });
        if (!own)
          throw new ForbiddenException('measurement_staff_scope_denied');
      }
    }
    if (i.kind === 'staff_goal') {
      if (i.configurationUserId !== userId || !i.staffId)
        throw new ForbiddenException('measurement_staff_scope_denied');
      const staff = await this.prisma.staff.findUnique({
        where: { id_tenantId: { id: i.staffId, tenantId } },
        select: { userId: true, branchId: true, active: true },
      });
      if (
        !staff?.active ||
        (!FINANCE.includes(member.role) && staff.userId !== userId) ||
        (member.branchId && staff.branchId !== member.branchId)
      )
        throw new ForbiddenException('measurement_staff_scope_denied');
    }
    if (i.appointmentId) {
      const found = await this.prisma.appointment.findFirst({
        where: {
          id: i.appointmentId,
          tenantId,
          ...(i.branchId ? { branchId: i.branchId } : {}),
        },
        select: { id: true },
      });
      if (!found)
        throw new ForbiddenException('measurement_appointment_scope_denied');
    }
  }

  async read(tenantId: string, userId: string, query: MeasurementReadQuery) {
    const member = await this.viewer(tenantId, userId, query.kind);
    if (
      Object.keys(query).some(
        (key) =>
          ![
            'kind',
            'from',
            'to',
            'branchId',
            'clientId',
            'appointmentId',
            'staffId',
            'accountId',
          ].includes(key),
      )
    )
      throw new BadRequestException('measurement_read_query_invalid');
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { id: true, provider: true },
    });
    const sourceQuery: Record<string, string> = {};
    const dimensions: Record<string, string> = {};
    const ownStaff =
      (query.kind === 'staff_goal' ||
        (query.kind === 'reputation_period' &&
          ['staff', 'employee', 'provider'].includes(member.role))) &&
      !query.staffId
        ? await this.prisma.staff.findMany({
            where: { tenantId, userId, active: true },
            select: { id: true },
            take: 2,
          })
        : [];
    if (
      (query.kind === 'staff_goal' ||
        (query.kind === 'reputation_period' &&
          ['staff', 'employee', 'provider'].includes(member.role))) &&
      !query.staffId &&
      ownStaff.length !== 1
    )
      throw new ForbiddenException('measurement_own_staff_not_exact');
    const finance = [
      'business_period',
      'value_discrepancy',
      'staff_goal',
    ].includes(query.kind);
    if (finance) {
      sourceQuery.provider =
        member.tenant.calendarSource === 'internal'
          ? 'internal'
          : (integration?.provider ?? 'unavailable');
      if (member.tenant.calendarSource !== 'internal' && integration)
        sourceQuery.integrationId = integration.id;
      sourceQuery.queryContract =
        query.kind === 'staff_goal'
          ? 'c7.staff-goal.read.v1'
          : query.kind === 'value_discrepancy'
            ? 'c7.value.read.v1'
            : 'c7.finance.read.v1';
    }
    if (query.kind === 'reputation_period' && !BUSINESS.includes(member.role))
      dimensions.source = 'native_feedback';
    if (query.accountId) {
      if (query.kind !== 'value_discrepancy')
        throw new BadRequestException('measurement_account_scope_invalid');
      dimensions.accountId = query.accountId;
    }
    let intent: MeasurementIntent;
    try {
      intent = normalizeMeasurement({
        kind: query.kind,
        clientId: query.clientId,
        appointmentId: query.appointmentId,
        staffId: query.staffId ?? ownStaff[0]?.id,
        configurationUserId: query.kind === 'staff_goal' ? userId : null,
        branchId:
          query.kind === 'staff_goal'
            ? null
            : (query.branchId ?? member.branchId),
        periodFrom: new Date(query.from),
        periodTo: new Date(query.to),
        asOf: new Date(),
        timezone: member.tenant.defaultTimezone,
        scope: {
          version: 1,
          branchIds: [],
          dimensions,
          sourceQuery,
          capabilityKey:
            query.kind === 'staff_goal'
              ? query.staffId && FINANCE.includes(member.role)
                ? 'analytics.business.finance.read'
                : 'analytics.employee.read'
              : query.kind === 'business_period'
                ? 'analytics.business.finance.read'
                : query.kind === 'value_discrepancy'
                  ? 'clients.dossier.read'
                  : 'measurement.read',
        },
      });
    } catch {
      throw new BadRequestException('measurement_read_intent_invalid');
    }
    await this.scope(tenantId, userId, intent, member);
    const result = await this.context.runAsSystemTenant(tenantId, () =>
      this.measurement.observe(intent),
    );
    const current = await this.viewer(tenantId, userId, query.kind);
    await this.scope(tenantId, userId, intent, current);
    return presentMeasurement(tenantId, intent, result);
  }

  /** Adapter for the existing inclusive analytics window; core windows stay half-open. */
  readPeriod(
    tenantId: string,
    userId: string,
    kind: MeasurementKind,
    query: { from: string; to: string; branchId?: string },
    extra: Partial<
      Pick<
        MeasurementReadQuery,
        'staffId' | 'clientId' | 'appointmentId' | 'accountId'
      >
    > = {},
  ) {
    const end = new Date(query.to);
    if (!Number.isFinite(end.getTime()))
      throw new BadRequestException('measurement_period_invalid');
    return this.read(tenantId, userId, {
      ...extra,
      kind,
      from: query.from,
      to: new Date(end.getTime() + 1).toISOString(),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    });
  }

  async teamGoals(
    tenantId: string,
    userId: string,
    query: { from: string; to: string; branchId?: string },
  ) {
    const member = await this.viewer(tenantId, userId, 'staff_goal');
    if (!FINANCE.includes(member.role) || member.branchId || query.branchId)
      throw new ForbiddenException(
        'measurement_team_goal_finance_scope_required',
      );
    // A22 targets are calendar-month contracts. Preserve the requested window;
    // an open month reads the same monthly goal with current asOf, never a new goal.
    const from = new Date(query.from);
    const day = measurementLocalDay(from, member.tenant.defaultTimezone);
    const [year, month] = day.split('-').map(Number);
    const nextDay = new Date(Date.UTC(year, month, 1))
      .toISOString()
      .slice(0, 10);
    const monthEnd = localDateMinuteToUtc(
      nextDay,
      0,
      member.tenant.defaultTimezone,
    );
    const fullMonthStart = localDateMinuteToUtc(
      day,
      0,
      member.tenant.defaultTimezone,
    );
    if (
      !day.endsWith('-01') ||
      from.getTime() !== fullMonthStart.getTime() ||
      new Date(query.to).getTime() < from.getTime() ||
      new Date(query.to).getTime() >= monthEnd.getTime()
    )
      return {
        items: [],
        truncated: false,
        scope: 'current_owner_private_staff_targets',
        requestedWindow: query,
        limitations: ['staff_goal_requires_single_local_calendar_month'],
      };
    const goalWindow = {
      from: query.from,
      to: new Date(monthEnd.getTime() - 1).toISOString(),
    };
    const staff = await this.prisma.staff.findMany({
      where: { tenantId, active: true },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 51,
    });
    const items = [];
    for (const subject of staff.slice(0, 50)) {
      items.push(
        await this.readPeriod(tenantId, userId, 'staff_goal', goalWindow, {
          staffId: subject.id,
        }),
      );
    }
    await this.viewer(tenantId, userId, 'staff_goal');
    return {
      items,
      requestedWindow: query,
      goalWindow,
      truncated: staff.length > 50,
      scope: 'current_owner_private_staff_targets',
      limitations: [
        'staff_revenue_target_is_not_salary_target',
        'no_target_no_progress',
        ...(staff.length > 50 ? ['team_measurement_bound_50'] : []),
      ],
    };
  }

  async reviewScope(tenantId: string, userId: string, branchId?: string) {
    const member = await this.viewer(tenantId, userId, 'reputation_period');
    if (member.branchId && branchId && branchId !== member.branchId)
      throw new ForbiddenException('measurement_branch_scope_denied');
    return {
      branchId: branchId ?? member.branchId ?? undefined,
      registryAllowed:
        BUSINESS.includes(member.role) ||
        (member.role === 'branch_manager' && !!member.branchId),
    };
  }

  async reputationMonths(
    tenantId: string,
    userId: string,
    days = 365,
    branchId?: string,
  ) {
    const member = await this.viewer(tenantId, userId, 'reputation_period');
    if (!Number.isInteger(days) || days < 1 || days > 3650)
      throw new BadRequestException('measurement_reputation_window_invalid');
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 86400000);
    const localDay = measurementLocalDay(now, member.tenant.defaultTimezone);
    const [year, month] = localDay.split('-').map(Number);
    const items = [];
    let start = now;
    for (let offset = 0; offset < 12 && start > cutoff; offset++) {
      const fromDay = new Date(Date.UTC(year, month - 1 - offset, 1))
        .toISOString()
        .slice(0, 10);
      const toDay = new Date(Date.UTC(year, month - offset, 1))
        .toISOString()
        .slice(0, 10);
      start = localDateMinuteToUtc(fromDay, 0, member.tenant.defaultTimezone);
      const to = localDateMinuteToUtc(toDay, 0, member.tenant.defaultTimezone);
      items.push(
        await this.read(tenantId, userId, {
          kind: 'reputation_period',
          from: start.toISOString(),
          to: to.toISOString(),
          ...(branchId ? { branchId } : {}),
        }),
      );
    }
    await this.viewer(tenantId, userId, 'reputation_period');
    return {
      contract: 'c7.reputation-months/1',
      items,
      requestedDays: days,
      truncated: start > cutoff,
      limitations: [
        'local_calendar_months_intersect_requested_window',
        'sources_and_scales_are_not_pooled',
        'observed_change_is_not_causal_or_reputation_score',
      ],
    };
  }

  async snapshot(tenantId: string, userId: string, id: string) {
    measurementId(id);
    await this.member(tenantId, userId);
    const kind = await canonicalUtcTransaction(
      this.prisma,
      (tx) =>
        tx.measurementRevision.findFirst({
          where: {
            id,
            tenantId,
            state: 'PUBLISHED',
            expiresAt: { gt: new Date() },
          },
          select: { kind: true },
        }),
      { readOnly: true },
    );
    if (!kind) throw new NotFoundException('measurement_snapshot_unavailable');
    await this.viewer(tenantId, userId, kind.kind as MeasurementKind);
    // Tenant-qualified opaque lookup cannot be used to read another tenant's record.
    const row = await canonicalUtcTransaction(
      this.prisma,
      (tx) =>
        tx.measurementRevision.findFirst({
          where: {
            id,
            tenantId,
            state: 'PUBLISHED',
            expiresAt: { gt: new Date() },
          },
        }),
      { readOnly: true },
    );
    if (!row) throw new NotFoundException('measurement_snapshot_unavailable');
    const intent = normalizeMeasurement({
      kind: row.kind as MeasurementKind,
      clientId: row.clientId,
      appointmentId: row.appointmentId,
      staffId: row.staffId,
      branchId: row.branchId,
      configurationUserId: row.configurationUserId,
      periodFrom: row.periodFrom,
      periodTo: row.periodTo,
      timezone: row.timezone,
      asOf: row.asOf,
      scope: row.scopeJson as unknown as MeasurementIntent['scope'],
    });
    const member = await this.viewer(tenantId, userId, intent.kind);
    await this.scope(tenantId, userId, intent, member);
    await this.context.runAsSystemTenant(tenantId, () =>
      this.sources.authorizeReceipt(tenantId, normalizeMeasurement(intent)),
    );
    const current = await this.viewer(tenantId, userId, intent.kind);
    await this.scope(tenantId, userId, intent, current);
    if (row.expiresAt <= new Date())
      throw new NotFoundException('measurement_snapshot_unavailable');
    // This exact historical address is never substituted with a newer current revision.
    return presentMeasurement(tenantId, intent, resultFromRevision(row), row);
  }
}
