import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AiReadWidgetTriggerPort } from '../../ai-tools/ai-read-widget-trigger.port';
import type { AiToolSurface } from '../../ai-tools/ai-tool.types';
import type { FactUsed } from '../../widget-contract/envelope';
import type { ChannelId } from '../../widget-contract/lifecycle';
import { PrismaService } from '../../prisma/prisma.service';
import { GATE6_OWNERS, PRINCIPAL_RESOLVER } from '../di-tokens';
import { WidgetEmitterService } from '../emission/emitter.service';
import type { PrincipalResolver } from '../authority/principal-view';
import { TimelineStore } from '../stores/timeline.store';
import { WidgetStoresService } from '../stores/widget-stores.service';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import type { ProjectionPlan } from '../projection/canonical-read.port';
import { projectorRowForCompletedRead } from '../projection/projector.registry';
import { WidgetProjectorService } from '../projection/widget-projector.service';
import { validateLocalBusinessDate } from '../query-scalars/local-business-date';
import { sha256Hex } from '../token.util';

const provenance = new Logger('WidgetMintProvenance');

/**
 * P-MT2a. The canonical READ has already completed in AiToolRuntimeService.
 * This adapter checks the current widget entitlement and principal, projects
 * that exact result through the finite registry, and invokes the one minter.
 */
@Injectable()
export class ChatReadTriggerService implements AiReadWidgetTriggerPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: WidgetStoresService,
    private readonly projector: WidgetProjectorService,
    private readonly emitter: WidgetEmitterService,
    @Inject(GATE6_OWNERS) private readonly gate6: Gate6Owners,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
  ) {}

  async afterCompletedRead(
    input: Parameters<AiReadWidgetTriggerPort['afterCompletedRead']>[0],
  ) {
    const tenantId = input.actor.tenantId;
    if (tenantId === null) return null;
    const row = projectorRowForCompletedRead(`C9:${input.toolName}`);
    if (row === null) return null;
    if (
      !(await this.gate6.grantsRequiredFeatures(tenantId, ['widgets.runtime']))
    )
      return null;

    const principal = await this.prisma.$transaction((tx) =>
      this.principals.resolve(tx),
    );
    if (
      principal === null ||
      principal.authority.tenantId !== tenantId ||
      (principal.authority.userId !== null &&
        principal.authority.userId !== input.actor.userId)
    )
      return null;

    const channel = channelFor(input.surface);
    const turn = await this.stores.ensureAssistantTurn({
      tenantId,
      conversationId: input.executionId,
      turnIndex: 0,
      principalProofHash: principal.proofHash,
      channel,
      textContent: null,
      spokenTranscript: null,
    });
    // A replay under a different current authority cannot acquire the old turn.
    if (turn.principalProofHash !== principal.proofHash) return null;

    return this.prisma.$transaction(async (tx) => {
      await TimelineStore.lockConversation(tx, tenantId, input.executionId);
      const previous = await tx.widgetEmission.findFirst({
        where: {
          tenantId,
          turnId: turn.id,
          erasedAt: null,
          turn: { principalProofHash: principal.proofHash },
        },
        orderBy: { issuedAt: 'desc' },
        select: {
          widgetId: true,
          envelopeSeal: true,
          renderReceipts: {
            where: { erasedAt: null },
            orderBy: { degradedAt: 'desc' },
            take: 1,
            select: { emittedEnvelopeJson: true },
          },
        },
      });
      if (previous !== null) {
        const envelope = previous.renderReceipts[0]?.emittedEnvelopeJson;
        if (!isRecord(envelope)) return null;
        return resolution(previous.widgetId, previous.envelopeSeal, envelope);
      }

      const plan = this.plan(input, principal, row.result_kind, channel);
      const fact: FactUsed = {
        capability: input.toolName,
        status: 'measured',
        as_of: new Date().toISOString(),
        evidence_refs: [`h_${sha256Hex(`ai-tool:${input.executionId}`)}`],
        completeness: {
          status: 'PARTIAL',
          requestedScopeHash: input.inputHash,
          returnedCount: 1,
          totalCount: null,
          hasMore: true,
          cursorRef: null,
          truncated: false,
          reasonCodes: ['NOT_COLLECTED'],
        },
      };
      const projected = this.projector.composeCompletedRead(plan, {
        value: input.result,
        fact,
      });
      if (projected.kind !== 'composer_input' || !isRecord(input.result))
        return null;

      const minted = await this.emitter.emit({
        tenantId,
        conversationId: input.executionId,
        turnId: turn.id,
        kind: row.result_kind,
        principalProofHash: principal.proofHash,
        deliveryChannel: channel,
        body: input.result,
        ttlSeconds: 600,
        freshnessClass: 'live',
        composerInput: projected.input,
        principal,
        ...(input.toolName === 'operations.journal.read'
          ? {
              retainedQueryScalar: {
                type: 'local_business_date' as const,
                value: validateLocalBusinessDate(input.arguments.date),
                provenance: 'server_validated' as const,
              },
            }
          : {}),
      });
      const tokenHash = minted.intentTokenHashes[0];
      if (tokenHash !== undefined)
        provenance.log(
          JSON.stringify({
            contract: 'maya.widget-mint-provenance/1',
            trigger: input.trigger,
            route:
              input.trigger === 'T-2a'
                ? 'POST /api/ai/chat'
                : 'POST /api/ai/tools/:toolName/execute',
            request_id: input.requestId,
            intent_token_hash: tokenHash,
            widget_id: minted.widgetId,
          }),
        );
      return resolution(minted.widgetId, minted.envelopeSeal, minted.envelope);
    });
  }

  private plan(
    input: Parameters<AiReadWidgetTriggerPort['afterCompletedRead']>[0],
    principal: NonNullable<Awaited<ReturnType<PrincipalResolver['resolve']>>>,
    kind: string,
    channel: ChannelId,
  ): ProjectionPlan {
    return Object.freeze({
      widgetId: input.executionId,
      widgetKind: kind,
      effect: 'REFINE',
      capabilitySpace: 'C9',
      capabilityKey: input.toolName,
      targetJson: null,
      runId: null,
      revisionId: null,
      c9Domain: null,
      frozenNounsJson: null,
      requestedScopeHash: input.inputHash,
      retainedLocalBusinessDate:
        input.toolName === 'operations.journal.read'
          ? validateLocalBusinessDate(input.arguments.date)
          : null,
      authority: principal.authority,
      actor: input.actor,
      aiToolSurface: input.surface,
      answeringChannel: channel,
      resolvedNouns: null,
      closedInputs: null,
    });
  }
}

const channelFor = (surface: AiToolSurface): ChannelId => {
  switch (surface) {
    case 'native':
      return 'native-shell';
    case 'telegram':
      return 'telegram-bot';
    case 'voice':
      return 'realtime-voice';
    default:
      return 'pwa';
  }
};

const resolution = (
  widgetId: string,
  envelopeSeal: string,
  envelope: Readonly<Record<string, unknown>>,
) =>
  Object.freeze({
    matched: true as const,
    receipt: Object.freeze({
      widget_id: widgetId,
      envelope_seal: envelopeSeal,
      envelope,
    }),
    dismiss_widget_id: null,
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
