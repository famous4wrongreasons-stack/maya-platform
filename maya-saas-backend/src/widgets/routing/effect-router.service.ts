import type { PersonalSchedulePort } from '../owner-ports/personal-schedule.port';
import { PERSONAL_SCHEDULE_SOURCE } from '../di-tokens';
import { SCHEDULE_APPROVAL_OWNER } from '../di-tokens';
import type { ScheduleApprovalAdapter } from '../owner-ports/schedule-approval.adapter';
import { WIDGET_RELEASE_ACCESS } from '../di-tokens';
import { presentJournalSchedule } from '../composition/journal-schedule.presenter';
import type { WidgetReleaseAccessPort } from '../owner-ports/release-access.port';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { IntentTemplateRefusal } from '../emission/intent-template.registry';
import {
  SERVICE_PRICE_APPROVAL_OWNER,
  parseServicePriceApprovalRef,
  type ServicePriceApprovalOwnerPort,
} from '../pricing/service-price-approval.port';
import { servicePriceApprovalMintRequest } from '../pricing/service-price-approval.presenter';

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
  BOOKING_SELECTOR_OWNER,
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
  type BookingSelectorOwnerPort,
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
    @Inject(BOOKING_SELECTOR_OWNER)
    private readonly bookingSelectors: BookingSelectorOwnerPort,
    @Inject(BOOKING_CONFIRMATION_MINTER)
    private readonly bookingMinter: BookingConfirmationMinterPort,
    private readonly gate14Disagreements: Gate14DisagreementMetric,
    private readonly projector: WidgetProjectorService,
    @Inject(NAVIGATE_WIDGET_MINTER)
    private readonly emitter: NavigateWidgetMinterPort,
    private readonly threadPage: WidgetThreadPageService,
    @Inject(WIDGET_RELEASE_ACCESS)
    private readonly releaseAccess: WidgetReleaseAccessPort,
    @Optional()
    @Inject(SERVICE_PRICE_APPROVAL_OWNER)
    private readonly priceApprovals?: ServicePriceApprovalOwnerPort,
    @Optional()
    @Inject(SCHEDULE_APPROVAL_OWNER)
    private readonly schedule?: ScheduleApprovalAdapter,
    @Optional()
    @Inject(PERSONAL_SCHEDULE_SOURCE)
    private readonly personalSchedules?: PersonalSchedulePort,
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

    // A direct/internal dispatch cannot bypass the same current signed release owner.
    // This happens before destination resolution (which can sign), claim or owner invocation.
    if (!(await this.releaseAccess.admits(ctx.tenantId, record)))
      return { outcome: 'refuse', code: 'insufficient_authority' };

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
        return this.navigate(ctx, resolvedNouns);
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
        if (ctx.record?.widgetKind === 'SETTINGS_DRAFT') {
          const input = actuatingInputOf(ctx, resolvedNouns);
          return input && this.schedule
            ? () => this.schedule!.commit(input)
            : null;
        }
        return ctx.record?.widgetKind === 'APPROVAL'
          ? approvalDecisionDestination(ctx, resolvedNouns, this.approvals)
          : bookingCommitDestination(
              ctx,
              resolvedNouns,
              this.bookingCommit,
              this.stores,
            );
    }
  }

  private navigate(
    ctx: GateContext,
    resolvedNouns?: ResolvedNouns,
  ): Destination | null {
    const input = routingInputOf(ctx);
    const principal = ctx.principal;
    if (input === null || principal === null) return null;
    const target = navigationTarget(input.record.targetJson);
    if (target === null) return null;

    if (target.class === 'w')
      return async () => {
        if (input.record.sourceCapabilityKey === 'operations.journal.read') {
          const child = await this.threadPage.resolveForNavigate({
            tenantId: input.tenantId,
            widgetId: input.record.widgetId,
            principalProofHash: principal.proofHash,
          });
          const correlation = child?.envelope.correlation;
          if (
            !isRecord(correlation) ||
            correlation.parent_widget_id !== target.ref
          )
            return admitted({
              receiptOutcome: 'REFUSED',
              refusalCode: 'effect_not_admissible',
            });
        }
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
      if (input.record.sourceCapabilityKey === 'operations.journal.read') {
        const provenance = source.envelope.provenance;
        const body = source.envelope.body;
        const range = isRecord(body) ? body.range : null;
        const date = input.record.retainedLocalBusinessDate;
        // Validate retained query integrity against the sealed source; never derive a query
        // from historical display text or use it as a substitute for the retained scalar.
        if (
          input.record.sourceCapabilitySpace !== 'C9' ||
          target.class !== 'detail' ||
          target.ref !== 'fs.calendar' ||
          date === null ||
          !isRecord(provenance) ||
          provenance.source_capability !== 'operations.journal.read' ||
          !isRecord(range) ||
          typeof range.from !== 'string' ||
          !range.from.startsWith(date + 'T')
        )
          return admitted({
            receiptOutcome: 'REFUSED',
            refusalCode: 'effect_not_admissible',
          });
      }
      // A detail is a separately sealed child of this exact card, not a copy of the parent
      // returned as though it were a child. The canonical owner remains the source of the diff.
      if (
        input.record.sourceCapabilitySpace === 'C9' &&
        input.record.sourceCapabilityKey === 'catalog.service.price.update'
      ) {
        const approvalRef = resolvedNouns?.values.get('approval');
        const parsed =
          typeof approvalRef === 'string'
            ? parseServicePriceApprovalRef(approvalRef)
            : null;
        const owner = this.priceApprovals;
        if (
          input.record.widgetKind !== 'APPROVAL' ||
          resolvedNouns?.values.size !== 1 ||
          !parsed ||
          !approvalRef ||
          !owner ||
          target.class !== 'detail' ||
          target.ref !== 'fs.catalogue'
        )
          return admitted({
            receiptOutcome: 'REFUSED',
            refusalCode: 'effect_not_admissible',
          });
        const actor = { tenantId: input.tenantId, userId: ctx.actor.userId };
        const snapshot = await owner.read(
          actor,
          approvalRef,
          principal.proofHash,
          true,
        );
        const ttlSeconds = Math.floor(
          (snapshot.expiresAt.getTime() - input.now.getTime()) / 1000,
        );
        if (
          snapshot.id !== parsed.id ||
          snapshot.payloadHash !== parsed.hash ||
          snapshot.origin.conversationId !== source.conversationId ||
          snapshot.origin.principalProofHash !== principal.proofHash ||
          ttlSeconds <= 0
        )
          return admitted({
            receiptOutcome: 'REFUSED',
            refusalCode: 'effect_not_admissible',
          });
        const request = servicePriceApprovalMintRequest(
          snapshot,
          principal,
          source.turnId,
          ttlSeconds,
          input.answeringChannel,
        );
        request.composerInput = {
          ...request.composerInput,
          correlation_refs: {
            ...request.composerInput.correlation_refs,
            parent_id: input.record.widgetId,
          },
        };
        const minted = await this.emitter.emitServicePriceDetail(
          request,
          {
            approvalId: snapshot.id,
            payloadHash: snapshot.payloadHash,
            revalidate: async () => {
              const current = await owner.read(
                actor,
                approvalRef,
                principal.proofHash,
                false,
              );
              if (
                current.origin.conversationId !== source.conversationId ||
                current.payloadHash !== snapshot.payloadHash
              )
                throw new Error('service_price_detail_source_changed');
            },
          },
          input.record.widgetId,
          input.now,
        );
        return admitted({ nextEnvelope: minted.envelope });
      }
      const personal =
        input.record.sourceCapabilitySpace === 'C9' &&
        input.record.sourceCapabilityKey === 'appointments.own.list';
      const personalCatalog =
        input.record.sourceCapabilitySpace === 'C9' &&
        input.record.sourceCapabilityKey === 'catalog.services.read' &&
        target.class === 'detail' &&
        target.ref === 'fs.booking';
      if (
        personalCatalog &&
        (input.record.widgetKind !== 'SERVICE_SELECTOR' ||
          !this.personalSchedules)
      )
        return admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
        });
      if (
        personal &&
        (target.class !== 'detail' ||
          target.ref !== 'fs.booking' ||
          input.record.widgetKind !== 'SCHEDULE' ||
          !this.personalSchedules)
      )
        return admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
        });
      let personalContext: Awaited<
        ReturnType<PersonalSchedulePort['prepare']>
      > | null = null;
      if (personalCatalog) {
        try {
          personalContext = await this.personalSchedules!.prepare(ctx.actor);
        } catch (error) {
          if (!(error instanceof ForbiddenException)) throw error;
          return admitted({
            receiptOutcome: 'REFUSED',
            refusalCode: 'insufficient_authority',
          });
        }
      }
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
      const journal =
        input.record.sourceCapabilitySpace === 'C9' &&
        input.record.sourceCapabilityKey === 'operations.journal.read';
      const date = input.record.retainedLocalBusinessDate;
      // Composer provenance is not AdmissionFacts; keep its typed container explicit.
      const composerFactsKey: keyof typeof projected.input = 'facts';
      const body =
        journal && date !== null
          ? presentJournalSchedule(
              projected.source,
              projected.input[composerFactsKey][0],
              date,
            )
          : journal
            ? null
            : projected.source;
      if (body === null)
        return admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
        });
      const request = {
        tenantId: input.tenantId,
        conversationId: source.conversationId,
        turnId: source.turnId,
        kind: projected.input.kind_proposal,
        principalProofHash: principal.proofHash,
        deliveryChannel: input.answeringChannel,
        body: {
          ...body,
          ...(journal
            ? {
                detail_intent: `i${projected.input.intent_proposals.length + 1}`,
              }
            : {}),
        },
        ttlSeconds: 600,
        freshnessClass: 'live' as const,
        composerInput: journal
          ? {
              ...projected.input,
              intent_proposals: [
                ...projected.input.intent_proposals,
                {
                  intent_template_key: 'navigate.journal.parent@1',
                  role: 'secondary' as const,
                },
              ],
            }
          : projected.input,
        principal,
        ...(journal && date !== null
          ? {
              retainedQueryScalar: {
                type: 'local_business_date' as const,
                value: date,
                provenance: 'server_validated' as const,
              },
            }
          : {}),
      };
      const personalSource = personal
        ? await this.personalSchedules!.resolve(ctx.actor, projected.source)
        : null;
      if (personal && personalSource === null)
        return admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
        });
      if (personalContext !== null) {
        try {
          const minted = await this.emitter.emitPersonalCatalogDetail(
            request,
            personalContext,
            input.record.widgetId,
            input.now,
          );
          return admitted({ nextEnvelope: minted.envelope });
        } catch (error) {
          if (error instanceof ForbiddenException)
            return admitted({
              receiptOutcome: 'REFUSED',
              refusalCode: 'insufficient_authority',
            });
          if (
            error instanceof IntentTemplateRefusal &&
            [
              'personal_parent_unavailable',
              'booking_selector_source_unavailable',
            ].includes(error.code)
          )
            return admitted({
              receiptOutcome: 'REFUSED',
              refusalCode: 'effect_not_admissible',
            });
          throw error;
        }
      }
      const minted =
        personalSource !== null
          ? await this.emitter.emitPersonalSchedule(
              request,
              personalSource,
              input.now,
              input.record.widgetId,
            )
          : journal
            ? await this.emitter.emitJournalDetail(
                request,
                input.record.widgetId,
                input.now,
              )
            : await this.emitter.emit(request, input.now);
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
      ((input.record.widgetKind === 'SERVICE_SELECTOR' &&
        subject.key === 'catalog.services.read') ||
        (input.record.widgetKind === 'STAFF_SELECTOR' &&
          subject.key === 'catalog.staff.read'))
    )
      return () => this.advanceBookingSelector(ctx, input);
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
    const input = routingInputOf(ctx);
    const subject = ctx.record === null ? null : subjectOf(ctx.record);
    if (
      input !== null &&
      ctx.principal !== null &&
      input.record.widgetKind === 'TIME_SLOT_SELECTOR' &&
      subject?.space === 'C9' &&
      subject.key === 'appointments.own.create'
    )
      return () => this.completeBookingSelection(ctx, input);
    const actuating = actuatingInputOf(ctx, resolvedNouns);
    if (actuating === null) return null;
    const pending = this.drafts.route(actuating);
    return pending === null
      ? null
      : async () => this.completeBookingPreview(actuating, await pending);
  }

  private async advanceBookingSelector(
    ctx: GateContext,
    input: import('./routing-input').RoutingInput,
  ): Promise<EffectRouteOutcome> {
    const serviceStep = input.record.widgetKind === 'SERVICE_SELECTOR';
    const selected = selectedClosedInput(
      ctx,
      serviceStep ? 'service_ref' : 'staff_ref',
    );
    const inherited = frozenHandles(
      input.record.frozenNounsJson,
      serviceStep ? [] : ['service'],
    );
    if (selected === null || inherited === null)
      return admitted({
        receiptOutcome: 'REFUSED',
        refusalCode: 'effect_not_admissible',
      });
    const handles = Object.freeze({
      ...inherited,
      [serviceStep ? 'service' : 'staff']: selected,
    });
    const advanced = await this.bookingSelectors.advance({
      routing: input,
      actor: ctx.actor,
      step: serviceStep ? 'service' : 'staff',
      handles,
    });
    if (advanced === null)
      return admitted({
        receiptOutcome: 'REFUSED',
        refusalCode: 'effect_not_admissible',
      });
    const projected = this.projector.composeCompletedRead(
      {
        ...projectionPlan(ctx, input.record),
        widgetKind: advanced.nextKind,
        capabilitySpace: 'C9',
        capabilityKey: advanced.capabilityKey,
        frozenNounsJson: advanced.inheritedHandles,
      },
      { value: advanced.source, fact: advanced.fact },
    );
    if (projected.kind !== 'composer_input')
      return admitted({
        receiptOutcome: 'REFUSED',
        refusalCode: 'effect_not_admissible',
      });
    const minted = await this.successors.mintBookingSelector({
      tenantId: input.tenantId,
      predecessorWidgetId: input.record.widgetId,
      predecessorIntentTokenHash: input.record.intentTokenHash,
      principal: ctx.principal!,
      now: input.now,
      kind: advanced.nextKind,
      composerInput: projected.input,
      source: advanced.source,
      inheritedHandles: advanced.inheritedHandles,
    });
    return minted === null
      ? admitted({
          receiptOutcome: 'REFUSED',
          refusalCode: 'effect_not_admissible',
        })
      : admitted({ nextEnvelope: minted.envelope });
  }

  private async completeBookingSelection(
    ctx: GateContext,
    input: import('./routing-input').RoutingInput,
  ): Promise<EffectRouteOutcome> {
    const slot = selectedClosedInput(ctx, 'slot_ref');
    const inherited = frozenHandles(input.record.frozenNounsJson, [
      'service',
      'staff',
    ]);
    const authority = ctx.principal?.authority;
    if (
      slot === null ||
      inherited === null ||
      ctx.principal === null ||
      authority?.tenantId !== ctx.tenantId ||
      authority.userId !== ctx.actor.userId ||
      ctx.actor.tenantId !== ctx.tenantId
    )
      return admitted({
        receiptOutcome: 'REFUSED',
        refusalCode: 'effect_not_admissible',
      });
    const handles = Object.freeze({
      service: inherited.service,
      staff: inherited.staff,
      slot,
    });
    const proposed = await this.bookingPropose.proposeCreateSelection({
      routing: input,
      actorUserId: ctx.actor.userId,
      principal: ctx.principal,
      handles,
    });
    return this.completeBookingPreview(
      {
        routing: input,
        actorUserId: ctx.actor.userId,
        principal: ctx.principal,
        // These values were opened by the booking owner; Gate 11 deferred this
        // read. Do not claim an A1 row or a divergence verdict that never ran.
        resolvedNouns: { values: proposed.values },
      },
      proposed.outcome,
    );
  }

  private async completeBookingPreview(
    input: Pick<
      import('./effect-router.ports').ActuatingRoutingInput,
      'routing' | 'actorUserId' | 'principal'
    > & {
      resolvedNouns: Pick<ResolvedNouns, 'values'>;
    },
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

const selectedClosedInput = (
  ctx: GateContext,
  field: 'service_ref' | 'staff_ref' | 'slot_ref',
): string | null => {
  const values = ctx.facts.validatedInputs?.closed.get(field);
  return values?.length === 1 && typeof values[0] === 'string'
    ? values[0]
    : null;
};

const frozenHandles = (
  value: unknown,
  expected: readonly string[],
): Readonly<Record<string, string>> | null => {
  if (!isRecord(value)) return expected.length === 0 ? Object.freeze({}) : null;
  const keys = Object.keys(value).sort();
  const exact = [...expected].sort();
  if (
    keys.length !== exact.length ||
    !keys.every((key, index) => key === exact[index]) ||
    keys.some(
      (key) => typeof value[key] !== 'string' || value[key].length === 0,
    )
  )
    return null;
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, value[key] as string])),
  );
};

const isRoutableEffect = (value: string): value is RoutableEffect =>
  (ROUTABLE_EFFECTS as readonly string[]).includes(value);
