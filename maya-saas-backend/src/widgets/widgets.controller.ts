import {
  BOOKING_SELECTION_AUDIT,
  type BookingSelectionAuditPort,
} from './stores/booking-selection-audit.port';
// K3 — the programme's two widget routes.
//
// §3 P-01 fixes them: `POST /api/widgets/resolve` and `POST /api/widgets/intent`. Two, and no more.
// Every widget interaction in the product, on every carrier, arrives through these — which is what
// makes "one ordered gate pipeline is the single ingress for all five carriers" (FR-5) a structural
// property rather than a convention.
//
// Both are behind `widgets.runtime`, which no plan grants. In wave 2 the runtime composes, seals
// and refuses, and delivers to nobody.

import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Optional,
  Inject,
} from '@nestjs/common';
import { SelectorLifecycleService } from './rendering/selector-lifecycle.service';
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
import { reasonTextOrNull } from './rendering/reason-text';
import { WidgetThreadPageService } from './resolve/thread-page.service';

@ApiTags('widgets')
@ApiBearerAuth()
@Controller('widgets')
@TenantScoped()
@RequiresFeature('widgets.runtime')
export class WidgetsController {
  constructor(
    private readonly gateway: IntentGatewayService,
    private readonly threadPage: WidgetThreadPageService,
    private readonly lifecycle: SelectorLifecycleService,
    @Optional()
    @Inject(BOOKING_SELECTION_AUDIT)
    private readonly selectionAudit?: BookingSelectionAuditPort,
  ) {}

  /**
   * Resolve — read current state. L25 optionally records a mounted-selector observation through
   * the lifecycle/audit owners. An explicit booking_receipt check reads the original
   * accepted action through its owner; it never dispatches a mutation.
   */
  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve the current envelope for a widget' })
  async resolve(
    @Body() dto: ResolveWidgetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (dto.rendered && !(await this.lifecycle.rendered(dto.rendered)))
      throw new ForbiddenException('widget_render_evidence_refused');
    if (dto.booking_receipt)
      await this.threadPage.refreshBookingReceipt(
        dto.booking_receipt.widget_id,
      );
    const widgets = await this.threadPage.read(dto.thread_page);
    return {
      contract: 'maya.widget.resolve/1',
      widgets,
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
    const route =
      result.verdict.outcome === 'terminate' ? result.verdict.route : undefined;
    if (route?.receipt_outcome === 'ACCEPTED' && actor.tenantId) {
      await this.selectionAudit?.recordAcceptedBookingSelection(dto, actor);
    }
    const code =
      'code' in result.verdict
        ? result.verdict.code
        : route?.receipt_outcome === 'REFUSED'
          ? (route.refusal_code ?? null)
          : null;
    const reasonKey =
      code ??
      (result.verdict.outcome === 'expired'
        ? 'EXPIRED'
        : result.verdict.outcome === 'superseded'
          ? 'SUPERSEDED'
          : null);
    return {
      contract: 'maya.widget.intent/1',
      outcome: result.verdict.outcome,
      code,
      // R3.9.3 (P-RENDER, IR-REN-1): every refusal renders as `reason_text`, server-minted from the
      // one table. The SIGNATURE is the fence — `reasonText` takes a code and returns a `Phrase`, so
      // free text is unrepresentable here and an exception's message cannot become the reason.
      // SH-22 admits this member on R3.9.3; no other member may be added to this response.
      // P-G15a: when EXPIRED/SUPERSEDED become response OUTCOMES with no code (L8, D-10), this
      // expression widens by one line to mint from `result.verdict.outcome`. The table already
      // carries those keys.
      // CKPT-W1 review fix: `reasonTextOrNull`, not `reasonText`. Null outcomes carry no invented
      // reason. REN-1/REN-3 independently require every non-null refusal code to have a canonical row;
      // REN-3 is the ratchet that keeps "nothing" from covering a second code. See `reason-text.ts`.
      reason_text: reasonTextOrNull(reasonKey),
      stopped_at_gate: result.stoppedAt,
      gates_run: result.ran,
      gates_total: this.gateway.gateCount,
      next_envelope: result.nextEnvelope ?? route?.next_envelope ?? null,
      resolved_widget: route?.resolved_widget ?? null,
      owner_decision: route?.owner_decision ?? null,
      receipt_outcome: route?.receipt_outcome ?? null,
    };
  }
}
