import { AI_GOODS_APPROVAL_WIDGET_TRIGGER } from '../ai-tools/ai-approval-widget-trigger.port';
import { GoodsReceiptApprovalTriggerService } from './inventory/goods-receipt-approval-trigger.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SelectorLifecycleService } from './rendering/selector-lifecycle.service';
import { SelectorDeliveryInterceptor } from './rendering/selector-delivery.interceptor';
import { Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { assertAllowlistAtRegistryLoad } from './authority/allowlist-startup.assert';
import { assertOwnerClassesResolve } from './authority/contract-bindings';
import { assertLedgersBindAtRegistryLoad } from './authority/ledger-startup.assert';
import { ControlRegistryService } from './control/control-registry.service';
import { WidgetConversationErasureJob } from './consent/erasure.job';
import { HistoryErasureOwner } from './consent/history-erasure.owner';
import {
  GATE10_STORE,
  GATE_8R_OWNERS,
  INPUT_BOUNDS_REGISTRY,
  INPUT_NORMALIZER_REGISTRY,
  INPUT_VALIDATION,
} from './di-tokens';
import { WidgetEmissionModule } from './emission/emission.module';
import { GATE_8R_OWNERS_UNRULED } from './gates/gate-8r.owners';
import { InputValidationGate } from './input-validation/input-validation.gate';
import { EMPTY_INPUT_BOUNDS_REGISTRY } from './input-validation/input-bounds.registry';
import { EMPTY_INPUT_NORMALIZER_REGISTRY } from './input-validation/input-normalizers.registry';
import { InputSchemaSourceReader } from './input-validation/input-schema-source';
import { IntentGatewayService } from './intent-gateway.service';
import { WidgetOwnerPortsModule } from './owner-ports/widget-owner-ports.module';
import { WidgetProjectorService } from './projection/widget-projector.service';
import { EffectRouterService } from './routing/effect-router.service';
import { Gate14DisagreementMetric } from './routing/gate14-disagreement.metric';
import { EFFECT_ROUTE_AUDIT } from './routing/effect-router.ports';
import { assertRoutingResolves } from './routing/deterministic-router';
import { LoweringSourceReader } from './stores/lowering-source.read';
import { WidgetStoresService } from './stores/widget-stores.service';
import {
  BOOKING_SELECTION_AUDIT,
  type BookingSelectionAuditPort,
} from './stores/booking-selection-audit.port';
import { sha256Hex } from './token.util';
import { WidgetsController } from './widgets.controller';
import { WidgetThreadPageService } from './resolve/thread-page.service';
import { ChatReadTriggerService } from './composition/chat-read.trigger';
import { AI_READ_WIDGET_TRIGGER } from '../ai-tools/ai-read-widget-trigger.port';
import { AI_APPROVAL_WIDGET_TRIGGER } from '../ai-tools/ai-approval-widget-trigger.port';
import { ServicePriceApprovalTriggerService } from './pricing/service-price-approval-trigger.service';
import { AI_TYPED_WIDGET_TRIGGER } from '../ai-tools/ai-typed-widget-trigger.port';
import { TypedStep0Service } from './composition/typed-step0';
import { C9_WIDGET_TRIGGER } from '../orchestration/c9-widget-trigger.port';
import { C9ComposeTriggerService } from './composition/c9-compose.trigger';
import { assertMomentRegistryLoads } from './proactive/moments';
import { MomentTriggerService } from './composition/moment.trigger';
import { OPERATIONAL_ALERT_WIDGET_TRIGGER } from '../operational-alerts/operational-alert-widget-trigger.port';

/**
 * K3 — the widget runtime.
 *
 * It imports PrismaModule and the widget layer's own owner-ports boundary, and nothing else. That is
 * deliberate and worth stating: a gateway that could import a capability module could reach a
 * canonical owner, and section 3 puts the whole of the authority in this component precisely so it
 * is the only thing that may consume an intent token. Every later package adds gates to the
 * pipeline, not paths around it.
 *
 * `WidgetOwnerPortsModule` (D-6) is the one place a non-widget module may ever be imported, so the
 * question "which owners can the widget layer reach?" has one file to answer it. In U0 it is empty:
 * it imports and provides nothing, so no owner is reachable through it.
 */
@Module({
  imports: [PrismaModule, WidgetOwnerPortsModule, WidgetEmissionModule],
  controllers: [WidgetsController],
  providers: [
    SelectorLifecycleService,
    { provide: APP_INTERCEPTOR, useClass: SelectorDeliveryInterceptor },
    IntentGatewayService,
    WidgetStoresService,
    { provide: GATE10_STORE, useExisting: WidgetStoresService },
    { provide: EFFECT_ROUTE_AUDIT, useExisting: WidgetStoresService },
    {
      provide: BOOKING_SELECTION_AUDIT,
      inject: [WidgetStoresService],
      // Wire metadata is forwarded only to the post-gateway audit owner. The
      // gate-facing ports never acquire this store facade or its profile input.
      useFactory: (stores: WidgetStoresService): BookingSelectionAuditPort => ({
        recordAcceptedBookingSelection: (dto, actor) => {
          if (!actor.tenantId) return Promise.resolve();
          return stores.recordAcceptedBookingSelection({
            tenantId: actor.tenantId,
            widgetId: dto.widget_id,
            intentTokenHash: sha256Hex(dto.intent_token),
            clientNonce: dto.client_nonce,
            profileId: dto.profile_id,
            clientEmittedAt: dto.client_emitted_at
              ? new Date(dto.client_emitted_at)
              : null,
            inputsClosed: dto.inputs,
          });
        },
      }),
    },
    ControlRegistryService,
    // K12 privacy confirmation reaches the existing atomic RT6 owner only.
    WidgetConversationErasureJob,
    HistoryErasureOwner,
    // P-MINT/B-22: WidgetEmissionModule owns the keyed seal and the single minter pipeline. This
    // module sees only its exported emitter and SEAL_VERIFIER port; it cannot inject a key holder.
    // U8a (IR-8a-1): slot 8's built gate, and the one store read its pass performs (D-2). Both are
    // widget-internal — no owner module is imported and no owner is reachable through them — so they
    // are bound here rather than at the D-6 boundary, and k3 check 9's owner enumeration is unchanged.
    LoweringSourceReader,
    InputSchemaSourceReader,
    { provide: INPUT_BOUNDS_REGISTRY, useValue: EMPTY_INPUT_BOUNDS_REGISTRY },
    {
      provide: INPUT_NORMALIZER_REGISTRY,
      useValue: EMPTY_INPUT_NORMALIZER_REGISTRY,
    },
    { provide: INPUT_VALIDATION, useClass: InputValidationGate },
    // U8R (R8R-1): slot 8-R's owner set, as a VALUE. `GATE_8R_OWNERS_UNRULED`'s vocabulary owner is
    // `null` (A1/A2 unruled, PKT:471), so a required readback refuses; the token exists so the day an
    // owner is ruled, the binding changes here and in no gate file.
    { provide: GATE_8R_OWNERS, useValue: GATE_8R_OWNERS_UNRULED },
    // U11a (IR-11a-3): Gate 11's ports, as the FROZEN ALL-NULL record. It is bound here rather than at
    // the D-6 boundary because it reaches no owner, so k3 check 9's owner enumeration does not change;
    // U11b replaces the `useValue` with its adapters and moves the binding to the boundary, with the
    // enumeration in that commit (§2.6 item 7). Row W refuses `superseded/handle_stale` with 0 calls
    // while it stands — an unbound port that REFUSES is the fail-closed half of AMB-01a.
    // U12b: the projector is deliberately NOT exported. Its only owner edge is the named
    // CANONICAL_READ port from WidgetOwnerPortsModule; the finite registry controls whether that
    // edge is reachable. Gate 13 remains the sole caller when its routing edges land.
    WidgetProjectorService,
    WidgetThreadPageService,
    ChatReadTriggerService,
    { provide: AI_READ_WIDGET_TRIGGER, useExisting: ChatReadTriggerService },
    GoodsReceiptApprovalTriggerService,
    {
      provide: AI_GOODS_APPROVAL_WIDGET_TRIGGER,
      useExisting: GoodsReceiptApprovalTriggerService,
    },
    ServicePriceApprovalTriggerService,
    {
      provide: AI_APPROVAL_WIDGET_TRIGGER,
      useExisting: ServicePriceApprovalTriggerService,
    },
    TypedStep0Service,
    { provide: AI_TYPED_WIDGET_TRIGGER, useExisting: TypedStep0Service },
    C9ComposeTriggerService,
    { provide: C9_WIDGET_TRIGGER, useExisting: C9ComposeTriggerService },
    MomentTriggerService,
    {
      provide: OPERATIONAL_ALERT_WIDGET_TRIGGER,
      useExisting: MomentTriggerService,
    },
    EffectRouterService,
    Gate14DisagreementMetric,
  ],
  exports: [
    IntentGatewayService,
    WidgetStoresService,
    ControlRegistryService,
    WidgetConversationErasureJob,
    HistoryErasureOwner,
    WidgetEmissionModule,
  ],
})
export class WidgetsModule implements OnModuleInit {
  /**
   * §2.4 EP-REGISTRY-LOAD: every owner class resolves in its space, or the process does not start.
   *
   * A2.4 (P-LEDGER, IR-LED-1) runs first: every `[ABSENT]` §A1 row must be bound to a gap key, or the
   * process does not start either. A ledger fault is then the first thing a failed boot reports, which
   * is what D-4's backstop rests on — the mechanism that says "not built" must exist before anything
   * may say "allowed".
   */
  onModuleInit(): void {
    assertLedgersBindAtRegistryLoad();
    assertAllowlistAtRegistryLoad();
    assertOwnerClassesResolve();
    // Decision Sheet 09 Option A: every K13 required fact resolves against a closed,
    // server-owned typed composition input before any proactive projector can run.
    assertMomentRegistryLoads();
    // U10a (IR-U10A-1): §3.12's router and `ownerSet` resolve against the live registries, or the
    // process does not start. A router that cannot answer Gate 10 is a divergence audit that silently
    // has nothing to compare, which is the one failure mode row 10 exists to prevent.
    assertRoutingResolves();
  }
}
