import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientHabitsService } from './client-habits.service';
import {
  exactPreferenceKeys,
  preferenceObject,
} from '../action-engine/client-preferences.contract';

function proof(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer '))
    throw new BadRequestException('Maya session required');
  return JSON.stringify({
    type: 'maya_jwt',
    credential: authorization.slice(7),
  });
}
@Controller('client-habits')
@TenantScoped()
export class ClientHabitsController {
  constructor(private readonly preferences: ClientHabitsService) {}
  @Get()
  read(@Headers('authorization') authorization: string | undefined) {
    return this.preferences.read(proof(authorization));
  }
  @Post('add')
  add(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.preferences.add(proof(authorization), body);
  }
}

@Controller('internal/legacy/client-habits')
export class LegacyClientHabitsController {
  constructor(
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
    private readonly preferences: ClientHabitsService,
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
        disabled: 'preference_bridge_disabled',
        unauthorized: 'preference_bridge_unauthorized',
      },
    );
    let input: Record<string, unknown>;
    try {
      input = preferenceObject(value);
      exactPreferenceKeys(input, [
        'provider',
        'externalCompanyId',
        'channelProof',
        'payload',
      ]);
    } catch {
      throw new BadRequestException('Invalid preference bridge envelope');
    }
    if (typeof input.channelProof !== 'string')
      throw new BadRequestException('Channel proof required');
    const source = this.bridge.assertBridgeIntegrationBinding(
      input,
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'preference_bridge_binding_disabled',
        mismatch: 'preference_bridge_source_mismatch',
      },
    );
    const tenant = await this.bridge.resolveTenantByIntegration(
      source,
      'preference_bridge_tenant_unresolved',
    );
    return this.context.runAsPublicTenant(tenant.tenantId, async () => {
      if (operation === 'read' || operation === 'binding') {
        if (JSON.stringify(input.payload) !== '{}')
          throw new BadRequestException('No identity may be supplied');
        return operation === 'binding'
          ? this.preferences.binding(input.channelProof as string)
          : this.preferences.read(input.channelProof as string);
      }
      if (operation === 'add')
        return this.preferences.add(
          input.channelProof as string,
          input.payload,
        );
      throw new BadRequestException('Unsupported preference operation');
    });
  }
}
