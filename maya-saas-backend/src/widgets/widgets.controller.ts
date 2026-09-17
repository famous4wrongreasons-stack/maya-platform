// K3 — the programme's only two new routes.
//
// §3 P-01 fixes them: `POST /api/widgets/resolve` and `POST /api/widgets/intent`. Two, and no more.
// Every widget interaction in the product, on every carrier, arrives through these — which is what
// makes "one ordered gate pipeline is the single ingress for all five carriers" (FR-5) a structural
// property rather than a convention.
//
// Both are behind `widgets.runtime`, which no plan grants. In wave 2 the runtime composes, seals
// and refuses, and delivers to nobody.

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { IntentGatewayService } from './intent-gateway.service';
import { SubmitIntentDto } from './dto/submit-intent.dto';
import { ResolveWidgetDto } from './dto/resolve-widget.dto';
import { resolveVerificationLevel } from './authority/authority-resolver';
import { principalProofHash } from './principal.util';

@ApiTags('widgets')
@ApiBearerAuth()
@Controller('widgets')
@TenantScoped()
@RequiresFeature('widgets.runtime')
export class WidgetsController {
  constructor(private readonly gateway: IntentGatewayService) {}

  /**
   * Resolve — read a widget's current state. Read-only by construction in wave 2: it reaches no
   * capability owner, and §3 requires zero capability calls on the timeline read path.
   */
  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve the current envelope for a widget' })
  resolve(
    @Body() dto: ResolveWidgetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    // Deliberately not implemented in this commit rather than stubbed as success: an emitter is
    // K3's second half, and a route that answered 200 with nothing would be indistinguishable from
    // one that worked.
    return {
      contract: 'maya.widget.resolve/1',
      widget_id: dto.widget_id,
      state: 'not_emitted',
      reason: 'the emitter is not built; wave 2 emits to nobody',
      tenant_bound: actor.tenantId !== null,
    };
  }

  /**
   * Intent — submit a typed intent. The body carries an opaque token the client did not author and
   * values from a server-declared closed domain. It carries no endpoint, no URL, no capability
   * name, no table, no provider, no tenant and no role: see `SubmitIntentDto`, where the absence is
   * the guarantee.
   */
  @Post('intent')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a typed widget intent through the gate pipeline',
  })
  async intent(
    @Body() dto: SubmitIntentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    // `v` is derived HERE, from what the server established about this caller — never sent, never
    // read back from the record. FR-3 forbids caller-supplied authority outright, so every input
    // to the resolver is an answer from a mechanism that already ran.
    const verificationLevel = resolveVerificationLevel({
      membershipResolved: Boolean(actor.tenantId) && Boolean(actor.userId),
      channelLinkActive: false,
      channelSubject: Boolean(actor.userId),
      roles: [],
    });

    const result = await this.gateway.submit({
      intentToken: dto.intent_token,
      // The tenant comes from the authenticated principal, never from the body. A body-supplied
      // tenant is the shape of every tenant-confusion bug, and the DTO has no field for one.
      tenantId: actor.tenantId ?? '',
      // The JWT-validated user, as `@CurrentUser()` delivers it (D-9). Nothing here reads its role or
      // builds a principal from it (K5): which read supplies the live principal's role is AMB-03's.
      actor,
      principalProofHash: principalProofHash(actor),
      submission: dto,
      verificationLevel,
      // The carrier of an HTTP submission. A carrier is a ceiling, not a claim: `channelMaxLevel`
      // caps whatever the session says.
      carrier: 'pwa',
    });

    return {
      contract: 'maya.widget.intent/1',
      outcome: result.verdict.outcome,
      code: 'code' in result.verdict ? result.verdict.code : null,
      stopped_at_gate: result.stoppedAt,
      gates_run: result.ran,
      gates_total: this.gateway.gateCount,
    };
  }
}
