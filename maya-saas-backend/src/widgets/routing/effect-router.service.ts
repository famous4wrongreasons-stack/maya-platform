import { Inject, Injectable } from '@nestjs/common';

import type { EffectClass } from '../../widget-contract/intent';
import type {
  GateContext,
  GateVerdict,
  ResolvedNouns,
  RouteResult,
} from '../gate.types';
import { ControlRegistryService } from '../control/control-registry.service';
import {
  APPROVAL_REQUEST_OWNER,
  C9_CANCEL_OWNER,
  COMMIT_BOOKING_OWNER,
  BOOKING_PROPOSE_OWNER,
  BOOKING_CONFIRMATION_MINTER,
  NAVIGATE_WIDGET_MINTER,
  DRAFT_OWNER_REGISTRY,
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
  type ApprovalRequestOwnerPort,
  type CommitBookingOwnerPort,
  type BookingProposeOwnerPort,
  type NavigateWidgetMinterPort,
  bookingPreviewOf,
  type DraftOwnerRegistryPort,
  type HandoffSignerPort,
} from './effect-router.ports';
import {
  approvalDecisionDestination,
  approvalPairClaimOf,
} from './edges/approval-decision.edge';
import { bookingCommitDestination } from './edges/commit.edge';
import { approvalRequestDestination } from './edges/request-approval.edge';
import { Gate14DisagreementMetric } from './gate14-disagreement.metric';
import { WidgetProjectorService } from '../projection/widget-projector.service';
import type { ProjectionPlan } from '../projection/canonical-read.port';
import { WidgetThreadPageService } from '../resolve/thread-page.service';
import { actuatingInputOf } from './edges/actuating-input';
import type { BookingConfirmationMinterPort } from '../booking/booking-confirmation-minter.port';

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
    private readonly destinationSigner: HandoffSignerPort,
    @Inject(DRAFT_OWNER_REGISTRY)
    private readonly drafts: DraftOwnerRegistryPort,
    @Inject(APPROVAL_REQUEST_OWNER)
    private readonly approvals: ApprovalRequestOwnerPort,
    @Inject(COMMIT_BOOKING_OWNER)
    private readonly bookingCommit: CommitBookingOwnerPort,
    @Inject(BOOKING_PROPOSE_OWNER)
    private readonly bookingPropose: BookingProposeOwnerPort,
    @Inject(BOOKING_CONFIRMATION_MINTER)
    private readonly bookingMinter: BookingConfirmationMinterPort,
    private readonly gate14Disagreements: Gate14DisagreementMetric,
    private readonly projector: WidgetProjectorService,
    @Inject(NAVIGATE_WIDGET_MINTER)
    private readonly emitter: NavigateWidgetMinterPort,
    private readonly threadPage: WidgetThreadPageService,
  ) {}

  async route(
    ctx: GateContext,
    resolvedNouns: ResolvedNouns | undefined,
  ): Promise<GateVerdict> {
    const record = ctx.record;
    if (record === null)
      return { outcome: 'refuse', code: 'effect_not_admissible' };

    if (record.effect === 'NONE' || !isRoutableEffect(record.effect))
      return { outcome: 'refuse', code: 'effect_not_admissible' };

    // AMB-54: resolve the destination first. A missing owner must not consume the token.
    const destination = this.destination(ctx, record.effect, resolvedNouns);
    if (destination === null)
      return { outcome: 'refuse', code: 'effect_not_admissible' };

    const claimed = await this.stores.claimIntentRecord({
      tenantId: ctx.tenantId,
      intentTokenHash: record.intentTokenHash,
      singleUse: record.singleUse,
      now: ctx.now,
      ...(approvalPairClaimOf(record)
        ? { approvalPair: approvalPairClaimOf(record)! }
        : {}),
    });
    if (!claimed) return { outcome: 'expired' };

    const routed = await destination();
    if (routed.gate14RefusalReason)
      this.gate14Disagreements.increment(routed.gate14RefusalReason);
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
    resolvedNouns: ResolvedNouns | undefined,
  ): Destination | null {
    switch (effect) {
      case 'NAVIGATE':
        return this.navigate(ctx);
      case 'REFINE':
        return this.refine(ctx, resolvedNouns);
      case 'CONTROL':
        return this.control(ctx);
      case 'DRAFT':
        return this.draft(ctx, resolvedNouns);
      case 'REQUEST_APPROVAL':
        return approvalRequestDestination(ctx, resolvedNouns, this.approvals);
      case 'HANDOFF':
        return this.signedDestination(ctx);
      case 'COMMIT':
        return ctx.record?.widgetKind === 'APPROVAL'
          ? approvalDecisionDestination(ctx, resolvedNouns, this.approvals)
          : bookingCommitDestination(ctx, resolvedNouns, this.bookingCommit);
    }
  }

  private navigate(ctx: GateContext): Destination | null {
    const input = routingInputOf(ctx);
    const principal = ctx.principal;
    if (input === null || principal === null) return null;
    const target = navigationTarget(input.record.targetJson);
    if (target === null) return null;

    if (target.class === 'w')
      return async () => {
        const stored = await this.threadPage.resolveForNavigate({
          tenantId: input.tenantId,
          widgetId: target.ref,
          principalProofHash: principal.proofHash,
        });
        return stored === null
          ? admitted({
              receiptOutcome: 'REFUSED',
              refusalCode: 'effect_not_admissible',
            })
          : admitted({ resolvedWidget: stored.envelope });
      };

    return async () => {
      const source = await this.threadPage.resolveForNavigate({
        tenantId: input.tenantId,
        widgetId: input.record.widgetId,
        principalProofHash: principal.proofHash,
      });
      if (source === null)
        return admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
        });
      const projected = await this.projector.composeNavigate(
        projectionPlan(ctx, input.record),
      );
      if (projected.kind !== 'composer_input' || !isRecord(projected.source))
        return admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
          resolvedWidget:
            projected.kind === 'degraded' ? { degraded: projected.why } : null,
        });
      const minted = await this.emitter.emit(
        {
          tenantId: input.tenantId,
          conversationId: source.conversationId,
          turnId: source.turnId,
          kind: projected.input.kind_proposal,
          principalProofHash: principal.proofHash,
          deliveryChannel: input.answeringChannel,
          body: { ...projected.source },
          ttlSeconds: 600,
          freshnessClass: 'live',
          composerInput: projected.input,
          principal,
        },
        input.now,
      );
      return admitted({ nextEnvelope: minted.envelope });
    };
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

  private refine(
    ctx: GateContext,
    resolvedNouns: ResolvedNouns | undefined,
  ): Destination | null {
    const input = routingInputOf(ctx);
    if (input === null || ctx.principal === null) return null;
    const subject = subjectOf(input.record);
    if (
      subject?.space === 'C9' &&
      (subject.key === 'appointments.own.reschedule' ||
        subject.key === 'appointments.own.cancel')
    ) {
      const actuating = actuatingInputOf(ctx, resolvedNouns);
      return actuating === null
        ? null
        : async () =>
            this.completeBookingPreview(
              actuating,
              await this.bookingPropose.propose(actuating),
            );
    }
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

  private draft(
    ctx: GateContext,
    resolvedNouns: ResolvedNouns | undefined,
  ): Destination | null {
    const actuating = actuatingInputOf(ctx, resolvedNouns);
    if (actuating === null) return null;
    const pending = this.drafts.route(actuating);
    return pending === null
      ? null
      : async () => this.completeBookingPreview(actuating, await pending);
  }

  private async completeBookingPreview(
    input: import('./effect-router.ports').ActuatingRoutingInput,
    outcome: EffectRouteOutcome,
  ): Promise<EffectRouteOutcome> {
    const preview = bookingPreviewOf(outcome.ownerDecision);
    if (outcome.receiptOutcome !== 'ACCEPTED' || preview === null)
      return outcome;
    if (preview.subject === 'create' && preview.draftRef !== null) {
      await this.stores.putDraft(
        {
          tenantId: input.routing.tenantId,
          draftRef: preview.draftRef,
          draftClass: 'task',
          ownerCapabilitySpace: 'C9',
          ownerCapabilityKey: 'c9.booking.propose',
          principalProofHash: input.routing.principalProofHash,
          diff: {
            service: input.resolvedNouns.values.get('service'),
            staff: input.resolvedNouns.values.get('staff'),
            slot: input.resolvedNouns.values.get('slot'),
          },
          ttlSeconds: 900,
        },
        input.routing.now,
      );
    }
    const envelope = await this.bookingMinter.mint({
      tenantId: input.routing.tenantId,
      predecessorWidgetId: input.routing.record.widgetId,
      principal: input.principal,
      deliveryChannel: input.routing.answeringChannel,
      now: input.routing.now,
      preview,
    });
    return { ...outcome, nextEnvelope: envelope };
  }

  private signedDestination(ctx: GateContext): Destination | null {
    const input = routingInputOf(ctx);
    if (input === null || input.principalProofHash.length === 0) return null;
    const target = this.destinationSigner.sign({
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
      : () => Promise.resolve(admitted({ resolvedWidget: target }));
  }
}

const navigationTarget = (
  value: unknown,
):
  | { readonly class: 'detail'; readonly ref: unknown }
  | {
      readonly class: 'w';
      readonly ref: string;
    }
  | null => {
  if (!isRecord(value)) return null;
  if (value.class === 'detail') return { class: 'detail', ref: value.ref };
  if (value.class === 'w' && typeof value.ref === 'string')
    return { class: 'w', ref: value.ref };
  return null;
};

const projectionPlan = (
  ctx: GateContext,
  record: NonNullable<GateContext['record']>,
): ProjectionPlan => ({
  widgetId: record.widgetId,
  widgetKind: record.widgetKind,
  effect: record.effect,
  capabilitySpace: record.capabilitySpace,
  capabilityKey: record.capabilityKey,
  sourceCapabilitySpace: record.sourceCapabilitySpace,
  sourceCapabilityKey: record.sourceCapabilityKey,
  targetJson: record.targetJson,
  runId: record.runId,
  revisionId: record.revisionId,
  c9Domain: record.c9Domain,
  frozenNounsJson: record.frozenNounsJson,
  requestedScopeHash: record.requestedScopeHash,
  retainedLocalBusinessDate: record.retainedLocalBusinessDate,
  authority: ctx.principal?.authority ?? null,
  actor: ctx.actor,
  aiToolSurface: 'web',
  answeringChannel: ctx.carrier,
  resolvedNouns: ctx.facts.resolvedNouns ?? null,
  closedInputs: ctx.facts.validatedInputs?.closed ?? null,
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRoutableEffect = (value: string): value is RoutableEffect =>
  (ROUTABLE_EFFECTS as readonly string[]).includes(value);
