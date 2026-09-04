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
import { ClientPreferencesService } from './client-preferences.service';
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
@Controller('client-preferences')
@TenantScoped()
export class ClientPreferencesController {
  constructor(private readonly preferences: ClientPreferencesService) {}
  @Get()
  read(@Headers('authorization') authorization: string | undefined) {
    return this.preferences.read(proof(authorization));
  }
  @Post('notifications')
  notifications(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.preferences.update(proof(authorization), 'notifications', body);
  }
  @Post('visit-mood')
  mood(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.preferences.update(proof(authorization), 'visit_mood', body);
  }
}

@Controller('internal/legacy/client-preferences')
export class LegacyClientPreferencesController {
  constructor(
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
    private readonly preferences: ClientPreferencesService,
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
      if (operation === 'read') {
        if (JSON.stringify(input.payload) !== '{}')
          throw new BadRequestException('No identity may be supplied');
        return this.preferences.read(input.channelProof as string);
      }
      if (operation === 'notifications' || operation === 'visit-mood')
        return this.preferences.update(
          input.channelProof as string,
          operation === 'notifications' ? 'notifications' : 'visit_mood',
          input.payload,
        );
      if (operation === 'delivery-read') {
        const payload = preferenceObject(input.payload);
        exactPreferenceKeys(payload, ['telegramSubject']);
        if (typeof payload.telegramSubject !== 'string')
          throw new BadRequestException('Recipient required');
        return this.preferences.deliveryRead(payload.telegramSubject);
      }
      if (operation === 'visit-projection') {
        const payload = preferenceObject(input.payload);
        exactPreferenceKeys(payload, ['recordIds']);
        return this.preferences.visitProjection(
          source.provider,
          payload.recordIds as string[],
        );
      }
      throw new BadRequestException('Unsupported preference operation');
    });
  }
}
