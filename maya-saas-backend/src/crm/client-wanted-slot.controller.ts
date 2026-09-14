import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';

import { Public } from '../decorators/public.decorator';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientWantedSlotService } from './client-wanted-slot.service';

@Controller('internal/legacy/client-wanted-slot')
export class LegacyClientWantedSlotController {
  constructor(
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
    private readonly service: ClientWantedSlotService,
  ) {}

  @Public()
  @Post(':operation')
  async command(
    @Headers('x-maya-legacy-bridge') secret: string | undefined,
    @Param('operation') operation: string,
    @Body() value: unknown,
  ) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'wanted_slot_bridge_disabled',
        unauthorized: 'wanted_slot_bridge_unauthorized',
      },
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid wanted-slot bridge envelope');
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).sort().join(',') !==
        'channelProof,externalCompanyId,payload,provider' ||
      typeof input.channelProof !== 'string'
    )
      throw new BadRequestException(
        'Exact wanted-slot bridge envelope required',
      );
    const source = this.bridge.assertBridgeIntegrationBinding(
      {
        provider:
          typeof input.provider === 'string' ? input.provider : undefined,
        externalCompanyId:
          typeof input.externalCompanyId === 'string'
            ? input.externalCompanyId
            : undefined,
      },
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'wanted_slot_bridge_binding_disabled',
        mismatch: 'wanted_slot_bridge_source_mismatch',
      },
    );
    const tenant = await this.bridge.resolveTenantByIntegration(
      source,
      'wanted_slot_bridge_tenant_unresolved',
    );
    return this.context.runAsPublicTenant(tenant.tenantId, () => {
      if (operation === 'add')
        return this.service.add(input.channelProof as string, input.payload);
      if (operation === 'referral-read') {
        if (JSON.stringify(input.payload) !== '{}')
          throw new BadRequestException('Referral read accepts no identity');
        return this.service.referralRead(input.channelProof as string);
      }
      if (operation === 'match') {
        if (input.channelProof !== '')
          throw new BadRequestException(
            'Provider match accepts no Client proof',
          );
        return this.service.matchAvailable(input.payload);
      }
      throw new BadRequestException('Unsupported wanted-slot operation');
    });
  }
}
