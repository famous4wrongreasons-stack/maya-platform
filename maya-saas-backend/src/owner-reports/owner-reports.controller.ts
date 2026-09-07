import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { OwnerReportsService } from './owner-reports.service';

@Controller('internal/legacy/owner-reports')
export class OwnerReportsController {
  constructor(
    private readonly reports: OwnerReportsService,
    private readonly bridge: BridgeSourceService,
  ) {}
  @Public()
  @Post('daily-report')
  async daily(
    @Headers('x-maya-legacy-bridge') secret: string | undefined,
    @Body() raw: unknown,
  ) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'report_bridge_disabled',
        unauthorized: 'report_bridge_unauthorized',
      },
    );
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).sort().join(',') !== 'externalCompanyId,provider'
    )
      throw new BadRequestException('B36_REPORT_TRIGGER_ONLY');
    const input = raw as Record<string, unknown>;
    if (
      typeof input.provider !== 'string' ||
      typeof input.externalCompanyId !== 'string'
    )
      throw new BadRequestException('B36_INVALID_SOURCE');
    const source = this.bridge.assertBridgeIntegrationBinding(
      { provider: input.provider, externalCompanyId: input.externalCompanyId },
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'report_bridge_binding_disabled',
        mismatch: 'report_bridge_source_mismatch',
      },
    );
    const tenant = await this.bridge.resolveTenantByIntegration(
      source,
      'report_bridge_tenant_unresolved',
    );
    return this.reports.triggerDailyReport(tenant.tenantId);
  }
}
