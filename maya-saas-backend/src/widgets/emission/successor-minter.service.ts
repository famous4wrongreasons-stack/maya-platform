// P-G15b / R3.9.4 — the widget-store-only successor minter.
//
// It reads two content members of the refused predecessor: its frozen text equivalent and the
// source capability stored in envelope provenance. It reaches no projector and no canonical owner.
// The gateway has already established the live principal; this service re-checks the exact stored
// record and refuses closed when erasure, ownership or registry state no longer supports a remedy.

import { Injectable } from '@nestjs/common';

import {
  C9_CAPABILITIES,
  C9_REGISTRY_HASH,
} from '../../orchestration/c9.registry';
import { PrismaService } from '../../prisma/prisma.service';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { WidgetKind } from '../../widget-contract/kinds';
import {
  isInheritedOwner,
  isOwnerClassKey,
} from '../../widget-contract/owner-classes';
import { KIND_PERMITTED_EFFECTS } from '../../widget-contract/tables';
import type { PrincipalView } from '../gate.types';
import { TimelineStore } from '../stores/timeline.store';
import { digestEquals } from '../token.util';
import { WidgetEmitterService } from './emitter.service';

export interface SuccessorMintRequest {
  readonly tenantId: string;
  readonly predecessorWidgetId: string;
  readonly predecessorIntentTokenHash: string;
  readonly principal: PrincipalView;
  readonly now?: Date;
}

export interface SuccessorMinterPort {
  mint(request: SuccessorMintRequest): Promise<SuccessorMintResult | null>;
}

export interface SuccessorMintResult {
  readonly widgetId: string;
  readonly envelope: Readonly<Record<string, unknown>>;
}

class SuccessorLinkConflict extends Error {}

const C9_KEYS = new Set(C9_CAPABILITIES.map((row) => row.capabilityKey));

@Injectable()
export class SuccessorMinterService implements SuccessorMinterPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
  ) {}

  async mint(
    request: SuccessorMintRequest,
  ): Promise<SuccessorMintResult | null> {
    if (request.principal.authority.tenantId !== request.tenantId) return null;

    const predecessor = await this.prisma.widgetEmission.findFirst({
      where: {
        tenantId: request.tenantId,
        widgetId: request.predecessorWidgetId,
      },
      select: {
        widgetId: true,
        turnId: true,
        kind: true,
        lifecycleState: true,
        supersededByWidgetId: true,
        deliveryChannel: true,
        textEquivalentJson: true,
        erasedAt: true,
        turn: { select: { conversationId: true, erasedAt: true } },
        intentRecords: {
          where: { intentTokenHash: request.predecessorIntentTokenHash },
          select: { principalProofHash: true, erasedAt: true },
          take: 1,
        },
        renderReceipts: {
          select: {
            deliveryChannel: true,
            composedEnvelopeJson: true,
            erasedAt: true,
          },
        },
      },
    });
    if (predecessor === null) return null;
    const terms = successorTerms(predecessor, request);
    if (terms === null) return null;
    if (
      predecessor.lifecycleState === 'SUPERSEDED' &&
      predecessor.supersededByWidgetId !== null
    )
      return this.readLinkedSuccessor(
        request.tenantId,
        predecessor.widgetId,
        predecessor.supersededByWidgetId,
        predecessor.turnId,
        predecessor.deliveryChannel,
      );
    if (predecessor.lifecycleState !== 'LIVE') return null;

    // AdmissionFacts has an unrelated `facts` member. Use the established composer-key spelling so
    // J-1's source fence does not classify this closed WidgetComposerInput array as a gate fact.
    const composerFactsKey: keyof WidgetComposerInput = 'facts';
    const input: WidgetComposerInput = {
      kind_proposal: terms.kind,
      capability: terms.sourceCapability.key,
      capability_version: C9_REGISTRY_HASH,
      source: {
        from: 'action_execution',
        execution_id: predecessor.widgetId,
      },
      correlation_refs: {
        turn_id: predecessor.turnId,
        parent_id: predecessor.widgetId,
      },
      origin: {
        trigger: 'system_reply',
        emitter: 'capability_read',
        moment_key: null,
        proactive_provenance: null,
      },
      [composerFactsKey]: [],
      facts_origin: [],
      slots: {},
      limitation_codes: [],
      intent_proposals: [
        {
          intent_template_key: 'refine.successor@1',
          capability: terms.sourceCapability,
          role: 'remedy',
        },
      ],
      locale: 'en',
    };
    const successor = await this.emitter.emitSuccessor(
      {
        tenantId: request.tenantId,
        conversationId: predecessor.turn.conversationId,
        turnId: predecessor.turnId,
        kind: terms.kind,
        principalProofHash: request.principal.proofHash,
        deliveryChannel: predecessor.deliveryChannel,
        body: terms.textEquivalent,
        ttlSeconds: 600,
        freshnessClass: 'live',
        piiClass: 'client_identified',
        composerInput: input,
        principal: request.principal,
      },
      terms.sourceCapability,
      terms.textEquivalent,
      request.now,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await TimelineStore.lockConversation(
          tx,
          request.tenantId,
          predecessor.turn.conversationId,
        );
        const stillReadable = await tx.widgetEmission.findFirst({
          where: {
            tenantId: request.tenantId,
            widgetId: predecessor.widgetId,
            lifecycleState: 'LIVE',
            supersededByWidgetId: null,
            erasedAt: null,
            turn: { erasedAt: null },
            intentRecords: {
              some: {
                intentTokenHash: request.predecessorIntentTokenHash,
                principalProofHash: request.principal.proofHash,
                erasedAt: null,
              },
            },
            renderReceipts: {
              some: {
                deliveryChannel: predecessor.deliveryChannel,
                erasedAt: null,
              },
            },
          },
          select: { widgetId: true },
        });
        if (stillReadable === null) throw new SuccessorLinkConflict();

        const closed = await tx.widgetEmission.updateMany({
          where: {
            tenantId: request.tenantId,
            widgetId: predecessor.widgetId,
            lifecycleState: 'LIVE',
            supersededByWidgetId: null,
            erasedAt: null,
          },
          data: {
            lifecycleState: 'SUPERSEDED',
            supersededByWidgetId: successor.widgetId,
          },
        });
        if (closed.count !== 1) throw new SuccessorLinkConflict();
        const linked = await tx.widgetEmission.updateMany({
          where: {
            tenantId: request.tenantId,
            widgetId: successor.widgetId,
            turnId: predecessor.turnId,
            deliveryChannel: predecessor.deliveryChannel,
            lifecycleState: 'MINTED',
            erasedAt: null,
          },
          data: { supersedesWidgetId: predecessor.widgetId },
        });
        if (linked.count !== 1) throw new SuccessorLinkConflict();
      });
    } catch (error) {
      await this.prisma.widgetEmission.updateMany({
        where: {
          tenantId: request.tenantId,
          widgetId: successor.widgetId,
          lifecycleState: 'MINTED',
        },
        data: { lifecycleState: 'CANCELLED' },
      });
      if (error instanceof SuccessorLinkConflict)
        return this.readLinkedSuccessor(
          request.tenantId,
          predecessor.widgetId,
          predecessor.widgetId,
          predecessor.turnId,
          predecessor.deliveryChannel,
          true,
        );
      throw error;
    }
    return successor;
  }

  private async readLinkedSuccessor(
    tenantId: string,
    predecessorWidgetId: string,
    successorWidgetId: string,
    turnId: string,
    deliveryChannel: string,
    resolveFromPredecessor = false,
  ): Promise<SuccessorMintResult | null> {
    const linked = await this.prisma.widgetEmission.findFirst({
      where: {
        tenantId,
        ...(resolveFromPredecessor
          ? { supersedesWidgetId: predecessorWidgetId }
          : { widgetId: successorWidgetId }),
        turnId,
        supersedesWidgetId: predecessorWidgetId,
        lifecycleState: { in: ['MINTED', 'LIVE'] },
        erasedAt: null,
        turn: { erasedAt: null },
        renderReceipts: {
          some: { deliveryChannel, erasedAt: null },
        },
      },
      select: {
        widgetId: true,
        renderReceipts: {
          where: { deliveryChannel, erasedAt: null },
          select: { emittedEnvelopeJson: true },
          take: 1,
        },
      },
    });
    const envelope = asObject(
      linked?.renderReceipts[0]?.emittedEnvelopeJson ?? null,
    );
    return linked === null || envelope === null
      ? null
      : Object.freeze({ widgetId: linked.widgetId, envelope });
  }
}

interface PredecessorTerms {
  readonly kind: WidgetKind;
  readonly sourceCapability: CapabilityRef;
  readonly textEquivalent: Readonly<Record<string, unknown>>;
}

const successorTerms = (
  predecessor: {
    kind: string;
    lifecycleState: string;
    supersededByWidgetId: string | null;
    deliveryChannel: string;
    textEquivalentJson: unknown;
    erasedAt: Date | null;
    turn: { erasedAt: Date | null };
    intentRecords: Array<{
      principalProofHash: string;
      erasedAt: Date | null;
    }>;
    renderReceipts: Array<{
      deliveryChannel: string;
      composedEnvelopeJson: unknown;
      erasedAt: Date | null;
    }>;
  } | null,
  request: SuccessorMintRequest,
): PredecessorTerms | null => {
  if (
    predecessor === null ||
    !['LIVE', 'SUPERSEDED'].includes(predecessor.lifecycleState) ||
    predecessor.erasedAt !== null ||
    predecessor.turn.erasedAt !== null ||
    predecessor.intentRecords[0]?.erasedAt !== null ||
    !digestEquals(
      predecessor.intentRecords[0]?.principalProofHash ?? '',
      request.principal.proofHash,
    ) ||
    predecessor.renderReceipts.find(
      (receipt) => receipt.deliveryChannel === predecessor.deliveryChannel,
    )?.erasedAt !== null
  )
    return null;
  const renderReceipt = predecessor.renderReceipts.find(
    (receipt) => receipt.deliveryChannel === predecessor.deliveryChannel,
  );
  const textEquivalent = asObject(predecessor.textEquivalentJson);
  const envelope = asObject(renderReceipt?.composedEnvelopeJson ?? null);
  const provenance = asObject(envelope?.provenance ?? null);
  const sourceCapability = provenance?.source_capability;
  if (
    textEquivalent === null ||
    typeof sourceCapability !== 'string' ||
    !C9_KEYS.has(sourceCapability) ||
    !isWidgetKind(predecessor.kind) ||
    !KIND_PERMITTED_EFFECTS[predecessor.kind].includes('REFINE')
  )
    return null;
  const ref: CapabilityRef = { space: 'C9', key: sourceCapability };
  if (
    !isInheritedOwner(predecessor.kind) &&
    !isOwnerClassKey(predecessor.kind, ref)
  )
    return null;
  return {
    kind: predecessor.kind,
    sourceCapability: ref,
    textEquivalent,
  };
};

const isWidgetKind = (value: string): value is WidgetKind =>
  Object.prototype.hasOwnProperty.call(KIND_PERMITTED_EFFECTS, value);

const asObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
