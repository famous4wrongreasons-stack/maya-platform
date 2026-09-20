// P-MINT / R3.9.4 — the widget-store-only successor minter.
//
// It never invokes a projector or canonical owner. The only values it may reuse are the frozen
// predecessor text, turn, channel and already-sealed C9 subject in WidgetIntentRecord. A stale or
// unsupported predecessor produces no successor.

import { Injectable } from '@nestjs/common';

import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import { PrismaService } from '../../prisma/prisma.service';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { PrincipalView } from '../gate.types';
import { type SealedEmission, WidgetEmitterService } from './emitter.service';

export interface SuccessorMintRequest {
  readonly tenantId: string;
  readonly predecessorWidgetId: string;
  readonly principal: PrincipalView;
  readonly now?: Date;
}

class SuccessorLinkConflict extends Error {}

@Injectable()
export class SuccessorMinterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
  ) {}

  async mint(request: SuccessorMintRequest): Promise<SealedEmission | null> {
    if (
      request.principal.authority.tenantId !== request.tenantId ||
      request.principal.proofHash !== request.principal.authority.proofHash
    )
      return null;

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
        deliveryChannel: true,
        textEquivalentJson: true,
        turn: { select: { conversationId: true } },
        intentRecords: {
          where: {
            principalProofHash: request.principal.proofHash,
            capabilitySpace: 'C9',
            capabilityKey: 'c7.measurement.read',
          },
          select: { capabilityKey: true },
          take: 1,
        },
      },
    });
    if (
      predecessor === null ||
      predecessor.lifecycleState !== 'LIVE' ||
      predecessor.kind !== 'METRIC' ||
      predecessor.textEquivalentJson === null ||
      predecessor.intentRecords[0]?.capabilityKey !== 'c7.measurement.read'
    )
      return null;

    const composerFactsKey = 'facts' as const;
    const input: WidgetComposerInput = {
      kind_proposal: 'METRIC',
      capability: 'c7.measurement.read',
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
          intent_template_key: 'refine.measurement@1',
          capability: { space: 'C9', key: 'c7.measurement.read' },
          role: 'remedy',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ],
      locale: 'en',
    };
    const body = asFrozenBody(predecessor.textEquivalentJson);
    if (body === null) return null;
    const successor = await this.emitter.emit(
      {
        tenantId: request.tenantId,
        conversationId: predecessor.turn.conversationId,
        turnId: predecessor.turnId,
        kind: 'METRIC',
        principalProofHash: request.principal.proofHash,
        deliveryChannel: predecessor.deliveryChannel,
        body,
        ttlSeconds: 600,
        freshnessClass: 'live',
        piiClass: 'client_identified',
        composerInput: input,
        principal: request.principal,
      },
      request.now,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const closed = await tx.widgetEmission.updateMany({
          where: {
            tenantId: request.tenantId,
            widgetId: predecessor.widgetId,
            lifecycleState: 'LIVE',
            supersededByWidgetId: null,
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
      if (error instanceof SuccessorLinkConflict) return null;
      throw error;
    }
    return successor;
  }
}

const asFrozenBody = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
