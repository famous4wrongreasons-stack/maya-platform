import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MeasurementService } from './measurement.service';
import {
  presentMeasurement,
  resultFromRevision,
} from './measurement.presentation';
import { normalizeMeasurement } from './measurement.contract';

/** Existing OwnerReportRun producer only; no delivery, recipients, cron or business writer. */
@Injectable()
export class MeasurementReportReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly measurement: MeasurementService,
  ) {}

  async snapshot(
    tenantId: string,
    reportIdentity: string,
    period: { from: string; to: string },
    asOf: Date,
  ) {
    const input = await this.input(tenantId, period, asOf);
    const row = await this.measurement.reportSnapshot(input, reportIdentity);
    return presentMeasurement(
      tenantId,
      { ...input, asOf: row.asOf },
      resultFromRevision(row),
      row,
    );
  }
  async observe(
    tenantId: string,
    period: { from: string; to: string },
    asOf: Date,
  ) {
    const input = await this.input(tenantId, period, asOf);
    return presentMeasurement(
      tenantId,
      input,
      await this.measurement.observe(input),
    );
  }
  private async input(
    tenantId: string,
    period: { from: string; to: string },
    asOf: Date,
  ) {
    if (this.context.get()?.source !== 'system' || this.context.get()?.userId)
      throw new Error('measurement_system_producer_required');
    this.context.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { calendarSource: true, defaultTimezone: true, status: true },
    });
    if (tenant?.status !== 'active')
      throw new Error('measurement_tenant_inactive');
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { id: true, provider: true },
    });
    return normalizeMeasurement({
      kind: 'business_period',
      periodFrom: new Date(period.from),
      periodTo: new Date(Date.parse(period.to) + 1),
      timezone: tenant.defaultTimezone,
      asOf,
      scope: {
        version: 1,
        branchIds: [],
        dimensions: {},
        capabilityKey: 'analytics.business.finance.read',
        sourceQuery: {
          provider:
            tenant.calendarSource === 'internal'
              ? 'internal'
              : (integration?.provider ?? 'unavailable'),
          ...(tenant.calendarSource !== 'internal' && integration
            ? { integrationId: integration.id }
            : {}),
          queryContract: 'c7.finance.read.v1',
        },
      },
    });
  }
}
