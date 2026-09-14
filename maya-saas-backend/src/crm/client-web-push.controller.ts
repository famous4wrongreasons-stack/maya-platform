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
import { ClientWebPushService } from './client-web-push.service';
import { webPushObject } from './client-web-push.policy';

function proof(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer '))
    throw new BadRequestException('Verified Maya session required');
  return JSON.stringify({
    type: 'maya_jwt',
    credential: authorization.slice(7),
  });
}
@Controller('client-web-push')
@TenantScoped()
export class ClientWebPushController {
  constructor(private readonly endpoints: ClientWebPushService) {}
  @Post('subscribe')
  register(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.endpoints.register(proof(authorization), body);
  }
  @Post('unsubscribe')
  unsubscribe(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.endpoints.unsubscribe(proof(authorization), body);
  }
}

@Controller('internal/legacy/client-web-push')
export class LegacyClientWebPushController {
  constructor(
    private readonly endpoints: ClientWebPushService,
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
  ) {}
  @Public()
  @Post(':operation')
  async command(
    @Headers('x-maya-legacy-bridge') secret: string | undefined,
    @Param('operation') operation: string,
    @Body() body: unknown,
  ) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'client_bridge_disabled',
        unauthorized: 'client_bridge_unauthorized',
      },
    );
    const input = webPushObject(body, [
      'provider',
      'externalCompanyId',
      'channelProof',
      'payload',
    ]);
    if (
      Object.keys(input).length !== 4 ||
      typeof input.channelProof !== 'string'
    )
      throw new BadRequestException('Invalid bridge envelope');
    const source = this.bridge.assertBridgeIntegrationBinding(
      input,
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'client_bridge_binding_disabled',
        mismatch: 'client_bridge_source_mismatch',
      },
    );
    const tenant = await this.bridge.resolveTenantByIntegration(
      source,
      'client_bridge_tenant_unresolved',
    );
    return this.context.runAsPublicTenant(tenant.tenantId, () => {
      if (operation === 'subscribe')
        return this.endpoints.register(
          input.channelProof as string,
          input.payload,
        );
      if (operation === 'unsubscribe')
        return this.endpoints.unsubscribe(
          input.channelProof as string,
          input.payload,
        );
      throw new BadRequestException('Unsupported Web Push operation');
    });
  }
}
