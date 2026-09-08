import { NativeFeedbackService } from '../native-feedback/native-feedback.service';
import { ClientProfileReadService } from './client-profile-read.service';
import { ClientLoyaltyReadService } from './client-loyalty-read.service';
import { ClientAppointmentReadService } from './client-appointment-read.service';
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
import { ClientChannelRuntimeService } from './client-channel-runtime.service';

function mayaProof(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer '))
    throw new BadRequestException('Maya session required');
  return JSON.stringify({
    type: 'maya_jwt',
    credential: authorization.slice(7),
  });
}
function onlyToken(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).join(',') !== 'token' ||
    !('token' in value) ||
    typeof value.token !== 'string'
  )
    throw new BadRequestException('Only challenge token is accepted');
  return value.token;
}
function empty(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length
  )
    throw new BadRequestException('No Client identity may be supplied');
}

@Controller('client-channel')
@TenantScoped()
export class ClientChannelController {
  constructor(
    private readonly runtime: ClientChannelRuntimeService,
    private readonly appointments: ClientAppointmentReadService,
    private readonly loyalty?: ClientLoyaltyReadService,
    private readonly profiles?: ClientProfileReadService,
    private readonly feedback?: NativeFeedbackService,
  ) {}

  @Get('feedback')
  feedbackRead(@Headers('authorization') authorization: string | undefined) {
    if (!this.feedback) throw new Error('Native feedback owner required');
    return this.feedback.readOwn(mayaProof(authorization));
  }
  @Post('feedback/:operation')
  feedbackResponse(@Headers('authorization') authorization: string | undefined, @Param('operation') operation: string, @Body() value: unknown, @Headers('idempotency-key') key: string | undefined) {
    if (!this.feedback || !['response', 'withdraw'].includes(operation)) throw new BadRequestException('Native feedback operation required');
    return this.feedback.respond(mayaProof(authorization), operation as 'response' | 'withdraw', value, key);
  }
  @Get('profile')
  async profileProjection(
    @Headers('authorization') authorization: string | undefined,
  ) {
    if (!this.profiles)
      throw new Error('Verified Client profile reader required');
    return (await this.profiles.forChannel(mayaProof(authorization))).profile;
  }

  @Get('loyalty')
  loyaltyProjection(
    @Headers('authorization') authorization: string | undefined,
  ) {
    if (!this.loyalty) throw new Error('Verified loyalty reader required');
    return this.loyalty.forChannel(mayaProof(authorization));
  }

  @Get('appointments')
  appointmentsProjection(
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.appointments.forChannel(mayaProof(authorization));
  }
  @Post('challenges')
  issue(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    empty(body);
    return this.runtime.issue(mayaProof(authorization));
  }
  @Post('consume')
  consume(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.runtime.consume(mayaProof(authorization), onlyToken(body));
  }
  @Post('consent')
  consent(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.runtime.submitConsent(mayaProof(authorization), body);
  }
  @Post('delivery-endpoint/refresh')
  refreshDeliveryEndpoint(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    empty(body);
    return this.runtime.refreshDeliveryAddress(mayaProof(authorization));
  }
  @Get('status')
  status(@Headers('authorization') authorization: string | undefined) {
    return this.runtime.status(mayaProof(authorization));
  }
}

/** The transport credential binds the integration/tenant only. The raw channel
 * credential is independently authenticated; neither credential is Client authority.
 */
@Controller('internal/legacy/client-commands')
export class LegacyClientChannelController {
  constructor(
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
    private readonly runtime: ClientChannelRuntimeService,
    private readonly appointments: ClientAppointmentReadService,
    private readonly loyalty?: ClientLoyaltyReadService,
    private readonly profiles?: ClientProfileReadService,
    private readonly feedback?: NativeFeedbackService,
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
        disabled: 'client_bridge_disabled',
        unauthorized: 'client_bridge_unauthorized',
      },
    );
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !==
        'channelProof,externalCompanyId,payload,provider'
    )
      throw new BadRequestException('Invalid channel bridge envelope');
    const input = value as {
      channelProof: string;
      externalCompanyId: string;
      payload: unknown;
      provider: string;
    };
    if (typeof input.channelProof !== 'string')
      throw new BadRequestException('Channel proof required');
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
      if (operation === 'feedback-projection') {
        empty(input.payload);
        if (!this.feedback) throw new Error('Native feedback owner required');
        return this.feedback.readOwn(input.channelProof);
      }
      if (operation === 'feedback-response' || operation === 'feedback-withdraw') {
        if (!this.feedback || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload) || Object.keys(input.payload).sort().join(',') !== 'command,idempotencyKey') throw new BadRequestException('Exact feedback command envelope required');
        const payload = input.payload as { command: unknown; idempotencyKey: unknown };
        return this.feedback.respond(input.channelProof, operation === 'feedback-response' ? 'response' : 'withdraw', payload.command, payload.idempotencyKey);
      }
      if (operation === 'delivery-consent') {
        const payload = input.payload;
        if (
          !payload ||
          typeof payload !== 'object' ||
          Array.isArray(payload) ||
          Object.keys(payload).join(',') !== 'telegramSubject' ||
          !('telegramSubject' in payload) ||
          typeof payload.telegramSubject !== 'string'
        )
          throw new BadRequestException(
            'Only the exact delivery recipient is accepted',
          );
        return this.runtime.telegramDeliveryConsent(payload.telegramSubject);
      }
      if (operation === 'issue') {
        empty(input.payload);
        return this.runtime.issue(input.channelProof);
      }
      if (operation === 'consume')
        return this.runtime.consume(
          input.channelProof,
          onlyToken(input.payload),
        );
      if (operation === 'consent')
        return this.runtime.submitConsent(input.channelProof, input.payload);
      if (operation === 'refresh-delivery') {
        empty(input.payload);
        return this.runtime.refreshDeliveryAddress(input.channelProof);
      }
      if (operation === 'status') {
        empty(input.payload);
        return this.runtime.status(input.channelProof);
      }
      if (operation === 'booking-prefill') {
        empty(input.payload);
        return this.runtime.bookingPrefill(input.channelProof);
      }
      if (operation === 'profile-projection') {
        empty(input.payload);
        if (!this.profiles)
          throw new Error('Verified Client profile reader required');
        return this.profiles
          .forChannel(input.channelProof)
          .then((result) => result.profile);
      }
      if (operation === 'loyalty-projection') {
        empty(input.payload);
        if (!this.loyalty) throw new Error('Verified loyalty reader required');
        return this.loyalty.forChannel(input.channelProof);
      }
      if (operation === 'appointments-projection') {
        empty(input.payload);
        return this.appointments.forChannel(input.channelProof);
      }
      if (operation === 'cabinet-projection') {
        empty(input.payload);
        return this.runtime.cabinetProjection(input.channelProof);
      }
      if (operation === 'realtime-authority')
        return this.runtime.realtimeAuthority(
          input.channelProof,
          input.payload,
        );
      if (operation === 'booking-confirmation')
        return this.runtime.acceptBookingConfirmation(
          input.channelProof,
          input.payload,
        );
      if (operation === 'chat-appointment-create')
        return this.runtime.createConfirmedChatAppointment(
          input.channelProof,
          input.payload,
        );
      if (operation === 'appointment-create')
        return this.runtime.createClientAppointment(
          input.channelProof,
          input.payload,
        );
      if (operation === 'appointment-cancel')
        return this.runtime.cancelClientAppointment(
          input.channelProof,
          input.payload,
        );
      if (operation === 'appointment-reschedule')
        return this.runtime.rescheduleClientAppointment(
          input.channelProof,
          input.payload,
        );
      if (operation === 'appointment-services')
        return this.runtime.setClientAppointmentServices(
          input.channelProof,
          input.payload,
        );
      throw new BadRequestException('Unsupported client command');
    });
  }
}
