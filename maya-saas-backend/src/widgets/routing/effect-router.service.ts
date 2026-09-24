import { Inject, Injectable } from '@nestjs/common';

import type { EffectClass } from '../../widget-contract/intent';
import type { GateContext, GateVerdict, RouteResult } from '../gate.types';
import { ControlRegistryService } from '../control/control-registry.service';
import {
  C9_CANCEL_OWNER,
  HANDOFF_SIGNER,
  SUCCESSOR_MINTER,
} from '../di-tokens';
import type { SuccessorMinterPort } from '../emission/successor-minter.service';
import { subjectOf } from '../gates/subject';
import { routingInputOf } from './routing-input';
import {
  EFFECT_ROUTE_AUDIT,
  type EffectRouteAuditPort,
  type EffectRouteOutcome,
  type C9CancelOwnerPort,
  type HandoffSignerPort,
} from './effect-router.ports';

type Destination = () => Promise<EffectRouteOutcome>;
type RoutableEffect = Exclude<EffectClass, 'NONE'>;

export const ROUTABLE_EFFECTS: readonly RoutableEffect[] = Object.freeze([
  'NAVIGATE',
  'REFINE',
  'CONTROL',
  'DRAFT',
  'REQUEST_APPROVAL',
  'HANDOFF',
  'COMMIT',
]);

const admitted = (
  partial: Partial<EffectRouteOutcome> = {},
): EffectRouteOutcome => ({
  receiptOutcome: 'ACCEPTED',
  refusalCode: null,
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: null,
  ...partial,
});

/**
 * U13a — the closed effect router.
 *
 * It has no catch-all destination and no edge from CONTROL to Action Engine. Later units bind owner
 * destinations; until then those effect classes fail closed before the single-use claim. This is the
 * clause-level NORMATIVE-PENDING rule, rather than a whole-gate bypass or a pretend success.
 */
@Injectable()
export class EffectRouterService {
  constructor(
    @Inject(EFFECT_ROUTE_AUDIT)
    private readonly stores: EffectRouteAuditPort,
    private readonly controls: ControlRegistryService,
    @Inject(SUCCESSOR_MINTER)
    private readonly successors: SuccessorMinterPort,
    @Inject(C9_CANCEL_OWNER)
    private readonly c9Cancel: C9CancelOwnerPort,
    @Inject(HANDOFF_SIGNER)
    private readonly handoffs: HandoffSignerPort,
  ) {}

  async route(ctx: GateContext): Promise<GateVerdict> {
    const record = ctx.record;
    if (record === null)
      return { outcome: 'refuse', code: 'effect_not_admissible' };

    if (record.effect === 'NONE' || !isRoutableEffect(record.effect))
      return { outcome: 'refuse', code: 'effect_not_admissible' };

    // AMB-54: resolve the destination first. A missing owner must not consume the token.
    const destination = this.destination(ctx, record.effect);
    if (destination === null)
      return { outcome: 'refuse', code: 'effect_not_admissible' };

    const claimed = await this.stores.claimIntentRecord({
      tenantId: ctx.tenantId,
      intentTokenHash: record.intentTokenHash,
      singleUse: record.singleUse,
      now: ctx.now,
    });
    if (!claimed) return { outcome: 'expired' };

    const routed = await destination();
    await this.stores.writeReceipt(
      {
        tenantId: ctx.tenantId,
        widgetId: record.widgetId,
        intentTokenHash: record.intentTokenHash,
        outcome: routed.receiptOutcome,
        refusalCode: routed.refusalCode,
        answeringChannel: ctx.carrier,
        actionReceiptRef: routed.actionReceiptRef,
      },
      ctx.now,
    );

    const route: RouteResult = {
      receipt_outcome: routed.receiptOutcome,
      next_envelope: routed.nextEnvelope,
      resolved_widget: routed.resolvedWidget,
      owner_decision: routed.ownerDecision,
    };
    return {
      outcome: 'terminate',
      why: `effect ${record.effect} routed`,
      route,
    };
  }

  reconcileAcceptedReceipt(input: {
    tenantId: string;
    intentTokenHash: string;
    actionReceiptRef: string;
  }): Promise<boolean> {
    return this.stores.reconcileAcceptedReceipt(input);
  }

  /** Exactly seven reachable effect literals. `NONE` has no destination and no token. */
  private destination(
    ctx: GateContext,
    effect: RoutableEffect,
  ): Destination | null {
    switch (effect) {
      case 'NAVIGATE':
        return async () => admitted({ resolvedWidget: { degraded: 'navigate_interim' } });
      case 'REFINE':
        return this.refine(ctx);
      case 'CONTROL':
        return this.control(ctx);
      case 'DRAFT':
        return null;
      case 'REQUEST_APPROVAL':
        return null;
      case 'HANDOFF':
        return this.handoff(ctx);
      case 'COMMIT':
        return null;
    }
  }

  private control(ctx: GateContext): Destination | null {
    const input = routingInputOf(ctx);
    if (input === null) return null;
    const subject = subjectOf(input.record);
    if (input.principalProofHash.length === 0 || subject?.space !== 'CONTROL')
      return null;

    if (subject.key === 'control.run.cancel')
      return async () =>
        (await this.c9Cancel.cancel(input))
          ? admitted({ resolvedWidget: { control: 'run_cancelled' } })
          : admitted({
              receiptOutcome: 'REFUSED',
              refusalCode: 'effect_not_admissible',
              resolvedWidget: { control: 'forbidden' },
            });

    if (
      subject.key !== 'control.widget.dismiss' ||
      !this.controls.isRegistered(subject.key)
    )
      return null;

    return async () => {
      const result = await this.controls.dismiss({
        tenantId: input.tenantId,
        widgetId: input.record.widgetId,
        principalProofHash: input.principalProofHash,
        now: input.now,
      });
      return result.handled
        ? admitted({ resolvedWidget: { control: result.code } })
        : admitted({
            receiptOutcome: 'REFUSED',
            refusalCode: 'effect_not_admissible',
            resolvedWidget: { control: result.code },
          });
    };
  }

  private refine(ctx: GateContext): Destination | null {
    const input = routingInputOf(ctx);
    if (input === null || ctx.principal === null) return null;
    return async () => {
      const successor = await this.successors.mint({
        tenantId: input.tenantId,
        predecessorWidgetId: input.record.widgetId,
        predecessorIntentTokenHash: input.record.intentTokenHash,
        principal: ctx.principal!,
        now: input.now,
      });
      return successor === null
        ? admitted({
            receiptOutcome: 'REFUSED',
            refusalCode: 'effect_not_admissible',
          })
        : admitted({ nextEnvelope: successor.envelope });
    };
  }

  private handoff(ctx: GateContext): Destination | null {
    const input = routingInputOf(ctx);
    if (input === null || input.principalProofHash.length === 0) return null;
    const target = this.handoffs.sign({
      tenantId: input.tenantId,
      principalProofHash: input.principalProofHash,
      widgetId: input.record.widgetId,
      intentTokenHash: input.record.intentTokenHash,
      target: input.record.targetJson,
      issuedAt: input.now,
      expiresAt: input.record.expiresAt,
    });
    return target === null
      ? null
      : async () => admitted({ resolvedWidget: target });
  }
}

const isRoutableEffect = (value: string): value is RoutableEffect =>
  (ROUTABLE_EFFECTS as readonly string[]).includes(value);
