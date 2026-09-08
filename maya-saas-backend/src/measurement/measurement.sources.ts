import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  measurementHash,
  MeasurementResult,
  MeasurementMetric,
  MeasurementSource,
  NormalizedMeasurementIntent,
} from './measurement.contract';

/** Source readers only. No business executor, AI, delivery gateway or source writer. */
@Injectable()
export class MeasurementSources {
  constructor(private readonly prisma: PrismaService) {}

  supports(kind: string): boolean {
    return ['appointment_outcome', 'client_history'].includes(kind);
  }

  async authorize(
    tenantId: string,
    i: NormalizedMeasurementIntent,
  ): Promise<void> {
    if (
      ['appointment_outcome', 'client_history'].includes(i.kind) &&
      (Object.keys(i.scope.dimensions).length ||
        Object.keys(i.scope.sourceQuery).length)
    )
      throw new Error('measurement_scope_not_supported_by_rule');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant?.status !== 'active')
      throw new Error('measurement_tenant_inactive');
    if (i.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id_tenantId: { id: i.clientId, tenantId } },
        select: { mergedIntoClientId: true },
      });
      if (!client || client.mergedIntoClientId)
        throw new Error('measurement_client_not_canonical');
    }
    if (
      i.appointmentId &&
      !(await this.prisma.appointment.findFirst({
        where: { id: i.appointmentId, tenantId, mayaClientId: i.clientId },
      }))
    )
      throw new Error('measurement_appointment_client_mismatch');
    const branches = [
      ...new Set([...i.scope.branchIds, ...(i.branchId ? [i.branchId] : [])]),
    ];
    if (
      branches.length &&
      (await this.prisma.branch.count({
        where: { tenantId, id: { in: branches } },
      })) !== branches.length
    )
      throw new Error('measurement_branch_mismatch');
    if (
      i.staffId &&
      !(await this.prisma.staff.findFirst({
        where: {
          id: i.staffId,
          tenantId,
          active: true,
          ...(i.branchId ? { branchId: i.branchId } : {}),
        },
      }))
    )
      throw new Error('measurement_staff_mismatch');
    if (
      i.configurationUserId &&
      !(await this.prisma.membership.findFirst({
        where: { userId: i.configurationUserId, tenantId, status: 'active' },
      }))
    )
      throw new Error('measurement_configuration_owner_revoked');
  }

  async read(
    tenantId: string,
    i: NormalizedMeasurementIntent,
  ): Promise<MeasurementResult> {
    if (!this.supports(i.kind)) throw new Error('measurement_rule_not_enabled');
    await this.authorize(tenantId, i);
    if (i.kind === 'client_history') return this.history(tenantId, i);
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        mayaClientId: i.clientId,
        ...(i.appointmentId
          ? { id: i.appointmentId }
          : { startAt: { gte: i.periodFrom, lt: i.periodTo, lte: i.asOf } }),
        ...(i.branchId ? { branchId: i.branchId } : {}),
        ...(i.scope.branchIds.length
          ? { branchId: { in: i.scope.branchIds } }
          : {}),
        ...(i.staffId ? { staffId: i.staffId } : {}),
      },
      select: {
        id: true,
        mayaClientId: true,
        source: true,
        status: true,
        attendance: true,
        startAt: true,
        endAt: true,
        totalPriceKopecks: true,
        currency: true,
        updatedAt: true,
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: 1,
    });
    if (i.appointmentId && !rows.length)
      throw new Error('measurement_appointment_scope_mismatch');
    const observedAt = new Date().toISOString();
    const sources: MeasurementSource[] = rows.map((row) => ({
      owner: 'Appointment',
      kind: 'canonical_appointment',
      tenantId,
      id: row.id,
      stateHash: measurementHash(row),
      observedAt,
      qualification: 'VERIFIED',
      coverage: 'canonical_stored_appointment',
    }));
    const metrics: MeasurementMetric[] = [];
    const metric = (
      key: string,
      value: MeasurementMetric['value'],
      unit = 'count',
      currency: string | null = null,
      basis = 'canonical_appointment',
      state: MeasurementMetric['state'] = 'COMPLETE',
    ) =>
      metrics.push({
        key,
        value,
        unit,
        currency,
        basis,
        state,
        dimensions: {},
        sourceRefs: rows.map((_, n) => n),
      });
    const reasons: string[] = [];
    if (i.kind === 'appointment_outcome') {
      const row = rows[0];
      metric('appointment_status', row.status, 'status');
      metric(
        'attendance',
        row.attendance,
        'status',
        null,
        'attendance_fact',
        row.attendance === null ? 'NOT_MEASURED' : 'COMPLETE',
      );
      metric(
        'booked_value',
        row.totalPriceKopecks === null ? null : String(row.totalPriceKopecks),
        'money_minor',
        row.currency,
        'appointment_booked_value',
        row.totalPriceKopecks === null ? 'NOT_MEASURED' : 'COMPLETE',
      );
      metric(
        'confirmed_cash',
        null,
        'money_minor',
        row.currency,
        'confirmed_cash',
        'NOT_MEASURED',
      );
      metric(
        'confirmed_refunds',
        null,
        'money_minor',
        row.currency,
        'confirmed_refund',
        'NOT_MEASURED',
      );
      reasons.push(
        'cash_and_refund_require_qualified_financial_evidence',
        'attribution_requires_exact_effect_lineage',
      );
    }
    if (rows.some((row) => row.updatedAt > i.asOf))
      reasons.push('source_observed_after_business_cutoff');
    return {
      sources,
      dependencies: [],
      metrics,
      reasons,
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      attributionStatus:
        i.kind === 'appointment_outcome' ? 'UNATTRIBUTED' : 'NOT_APPLICABLE',
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
  }

  private async history(
    tenantId: string,
    i: NormalizedMeasurementIntent,
  ): Promise<MeasurementResult> {
    // One bounded receipt for the aggregate query, not one retained copy per visit.
    // The source owner still owns each appointment and its history.
    const fact = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      const [value] = await tx.$queryRaw<
        Array<{
          bookings: string;
          arrived: string;
          noShow: string;
          cancelled: string;
          lastVisit: Date | null;
          updatedAt: Date | null;
          observedAt: Date;
        }>
      >(Prisma.sql`SELECT count(*)::text AS bookings,
        count(*) FILTER (WHERE attendance='arrived')::text AS arrived,
        count(*) FILTER (WHERE attendance='no_show')::text AS "noShow",
        count(*) FILTER (WHERE status='cancelled')::text AS cancelled,
        max("startAt") FILTER (WHERE attendance='arrived') AS "lastVisit",
        max("updatedAt") AS "updatedAt", clock_timestamp() AS "observedAt"
        FROM "Appointment" WHERE "tenantId"=${tenantId} AND "mayaClientId"=${i.clientId}
        AND "startAt">=${i.periodFrom} AND "startAt"<${i.periodTo} AND "startAt"<=${i.asOf}
        ${i.branchId ? Prisma.sql`AND "branchId"=${i.branchId}` : Prisma.empty}
        ${i.scope.branchIds.length ? Prisma.sql`AND "branchId" IN (${Prisma.join(i.scope.branchIds)})` : Prisma.empty}
        ${i.staffId ? Prisma.sql`AND "staffId"=${i.staffId}` : Prisma.empty}`);
      return value;
    });
    const metric = (
      key: string,
      value: string | null,
      unit = 'count',
    ): MeasurementMetric => ({
      key,
      value,
      unit,
      currency: null,
      basis: 'known_canonical_visit_coverage',
      state: value === null ? 'NOT_MEASURED' : 'PARTIAL',
      dimensions: {},
      sourceRefs: [0],
    });
    return {
      sources: [
        {
          owner: 'Appointment',
          kind: 'canonical_history_query',
          tenantId,
          id: measurementHash(['c7.canonical-history-query/1', tenantId, i]),
          stateHash: measurementHash(fact),
          observedAt: fact.observedAt.toISOString(),
          qualification: 'VERIFIED',
          coverage: 'canonical_stored_history_query_v1',
        },
      ],
      dependencies: [],
      metrics: [
        metric('observed_bookings', fact.bookings),
        metric('observed_attended_visits', fact.arrived),
        metric('observed_no_shows', fact.noShow),
        metric('observed_cancellations', fact.cancelled),
        metric(
          'last_proven_visit',
          fact.lastVisit?.toISOString() ?? null,
          'instant',
        ),
      ],
      reasons: [
        'canonical_mirror_history_coverage_not_proven_complete',
        ...(fact.updatedAt && fact.updatedAt > i.asOf
          ? ['source_observed_after_business_cutoff']
          : []),
      ],
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      attributionStatus: 'NOT_APPLICABLE',
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
  }
}
