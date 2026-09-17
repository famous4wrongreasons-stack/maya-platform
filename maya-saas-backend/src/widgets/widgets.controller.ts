// K3 — the programme's two widget routes.
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
import { F88SubmissionPipe } from './validation/f88-walk';
import { ResolveWidgetDto } from './dto/resolve-widget.dto';
import { intentSubmitArgs } from './intent-submit-args';

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
    // P-F88, IR-F88-1. Defence in depth, not the mechanism: the SAME `assertNoForbiddenKeys` already
    // runs inside the global `ValidationPipe` through the DTO's whole-body constraint, and both throw
    // the same `SubmissionShapeRejection`, so the route's answer is byte-identical with or without this
    // pipe. It exists for a body that reaches the handler by any path other than the global pipe.
    @Body(new F88SubmissionPipe()) dto: SubmitIntentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    // Every argument, including the tenant (from the actor, never the body) and `v`, is derived in
    // `intentSubmitArgs`, the one derivation the live-path harness also uses.
    const result = await this.gateway.submit(intentSubmitArgs(dto, actor));

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
