import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CanonicalBulkService } from './canonical-bulk.service';
import { bulkObject } from './canonical-bulk.contract';

export function bulkOperation(
  service: CanonicalBulkService,
  operation: string,
  proof: string,
  payload: unknown,
) {
  if (operation === 'preview') return service.preview(proof, payload);
  if (operation === 'confirm') return service.confirm(proof, payload);
  if (operation === 'resume') return service.resume(proof, payload);
  if (operation === 'status') return service.status(proof, payload);
  throw new BadRequestException('B35_OPERATION_UNSUPPORTED');
}
@Controller('marketing/bulk')
@TenantScoped()
export class CanonicalBulkController {
  constructor(private readonly bulk: CanonicalBulkService) {}
  @Post(':operation')
  command(
    @Param('operation') operation: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() payload: unknown,
  ) {
    if (!authorization?.startsWith('Bearer '))
      throw new BadRequestException('B35_CANONICAL_OWNER_SESSION_REQUIRED');
    return bulkOperation(
      this.bulk,
      operation,
      JSON.stringify({ type: 'maya_jwt', credential: authorization.slice(7) }),
      payload,
    );
  }
}
@Controller('internal/legacy/marketing-bulk')
export class LegacyCanonicalBulkController {
  constructor(
    private readonly bulk: CanonicalBulkService,
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
  ) {}
  @Public()
  @Post(':operation')
  async command(
    @Param('operation') operation: string,
    @Headers('x-maya-legacy-bridge') secret: string | undefined,
    @Body() raw: unknown,
  ) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'bulk_bridge_disabled',
        unauthorized: 'bulk_bridge_unauthorized',
      },
    );
    const input = bulkObject(raw, [
      'provider',
      'externalCompanyId',
      'channelProof',
      'payload',
    ]);
    if (
      Object.keys(input).length !== 4 ||
      typeof input.channelProof !== 'string'
    )
      throw new BadRequestException('B35_INVALID_BRIDGE_ENVELOPE');
    const source = this.bridge.assertBridgeIntegrationBinding(
      input,
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'bulk_bridge_binding_disabled',
        mismatch: 'bulk_bridge_source_mismatch',
      },
    );
    const tenant = await this.bridge.resolveTenantByIntegration(
      source,
      'bulk_bridge_tenant_unresolved',
    );
    return this.context.runAsPublicTenant(tenant.tenantId, () =>
      bulkOperation(
        this.bulk,
        operation,
        input.channelProof as string,
        input.payload,
      ),
    );
  }
}
