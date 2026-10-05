import { randomUUID } from 'node:crypto';
import { TimelineStore } from '../stores/timeline.store';
import {
  lockUserTurn,
  readUserTurnBinding,
  writeUserTurnBinding,
  type UserTurnReference,
} from '../stores/user-turn-binding';
import type { UserTurnAuditPort } from '../owner-ports/user-turn-audit.port';
import { USER_TURN_AUDIT } from '../di-tokens';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

import type { AiTypedWidgetTriggerPort } from '../../ai-tools/ai-typed-widget-trigger.port';
import { PrismaService } from '../../prisma/prisma.service';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../dto/submit-intent.dto';
import { PRINCIPAL_RESOLVER } from '../di-tokens';
import type { PrincipalResolver, RequestTx } from '../authority/principal-view';
import { IntentGatewayService } from '../intent-gateway.service';
import {
  normaliseUtterance,
  routeUtterance,
  type RoutingCandidate,
} from '../routing/deterministic-router';
import { scoped } from '../stores/tenant-scope';
import { sha256Hex } from '../token.util';
import { CHAT_REPLY_CIPHER } from '../di-tokens';
import type { ChatReplyCipher } from '../owner-ports/chat-reply-cipher.port';

type TypedRoutingCandidate = RoutingCandidate & {
  readonly widgetId: string;
  readonly intentToken: string;
};

/**
 * P-TYPED. A typed sentence is only a carrier for an already-live server-minted intent. It never
 * derives a capability, target or authority from the sentence and it never asks an LLM to do so.
 */
@Injectable()
export class TypedStep0Service implements AiTypedWidgetTriggerPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntentGatewayService,
    @Inject(PRINCIPAL_RESOLVER)
    private readonly principals: PrincipalResolver,
    @Inject(USER_TURN_AUDIT) private readonly turnAudit: UserTurnAuditPort,
    @Inject(CHAT_REPLY_CIPHER) private readonly encryption: ChatReplyCipher,
  ) {}

  async persistAssistantReply(
    input: Parameters<AiTypedWidgetTriggerPort['persistAssistantReply']>[0],
  ): Promise<void> {
    const tenantId = input.actor.tenantId;
    if (tenantId === null)
      throw new ForbiddenException('conversation_principal_unavailable');
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        principal === null ||
        principal.authority.tenantId !== tenantId ||
        principal.authority.userId !== input.actor.userId
      )
        throw new ForbiddenException('conversation_principal_unavailable');
      const now = await TimelineStore.readDatabaseClock(tx);
      return TimelineStore.persistChatReply(
        tx,
        {
          ...input,
          tenantId,
          principalProofHash: principal.proofHash,
        },
        now,
        this.encryption,
      );
    });
  }

  async readConversationContext(
    actor: Parameters<AiTypedWidgetTriggerPort['readCurrentConversation']>[0],
    conversationId: string,
    beforeTurnId: string,
  ): Promise<unknown> {
    const tenantId = actor.tenantId;
    if (tenantId === null)
      throw new ForbiddenException('conversation_principal_unavailable');
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        !principal ||
        principal.authority.tenantId !== tenantId ||
        principal.authority.userId !== actor.userId
      )
        throw new ForbiddenException('conversation_principal_unavailable');
      const now = await TimelineStore.readDatabaseClock(tx);
      return TimelineStore.readChatContext(
        tx,
        tenantId,
        principal.proofHash,
        conversationId,
        now,
        this.encryption,
        beforeTurnId,
      );
    });
  }

  async readCurrentConversation(
    actor: Parameters<AiTypedWidgetTriggerPort['readCurrentConversation']>[0],
  ): ReturnType<AiTypedWidgetTriggerPort['readCurrentConversation']> {
    const tenantId = actor.tenantId;
    if (tenantId === null)
      throw new ForbiddenException('conversation_principal_unavailable');
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        principal === null ||
        principal.authority.tenantId !== tenantId ||
        principal.authority.userId !== actor.userId
      )
        throw new ForbiddenException('conversation_principal_unavailable');
      const now = await TimelineStore.readDatabaseClock(tx);
      return TimelineStore.readCurrentConversation(
        tx,
        tenantId,
        principal.proofHash,
        now,
        this.encryption,
      );
    });
  }

  async routeTypedUtterance(
    input: Parameters<AiTypedWidgetTriggerPort['routeTypedUtterance']>[0],
  ) {
    const tenantId = input.actor.tenantId;
    if (tenantId === null || input.surface !== 'web') return null;
    const routed = await this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        principal === null ||
        principal.authority.tenantId !== tenantId ||
        (principal.authority.userId !== null &&
          principal.authority.userId !== input.actor.userId)
      )
        return null;
      const correlation = {
        kind: 'chat' as const,
        requestId: input.requestId,
        actorUserId: input.actor.userId,
      };
      await lockUserTurn(tx, tenantId, correlation);
      const binding = await readUserTurnBinding(
        tx,
        tenantId,
        correlation,
        principal.proofHash,
        this.turnAudit,
      );
      if (binding !== null) {
        const turn = await TimelineStore.readUserTurn(
          tx,
          tenantId,
          binding.turnId,
        );
        if (
          turn === null ||
          turn.role !== 'user' ||
          turn.channel !== 'pwa' ||
          turn.erasedAt !== null ||
          turn.retentionUntil.getTime() <= Date.now() ||
          turn.principalProofHash !== principal.proofHash ||
          turn.conversationId !== binding.conversationId ||
          (input.conversationId !== undefined &&
            input.conversationId !== binding.conversationId) ||
          (binding.intentTokenHash === null
            ? turn.textContent !== input.utterance
            : normaliseUtterance(turn.textContent ?? '') !==
              normaliseUtterance(input.utterance))
        )
          throw new ConflictException('user_turn_replay_conflict');
        if (binding.intentTokenHash === null) return null;
      }
      const candidates = await this.typedCandidates(
        tx,
        tenantId,
        principal.proofHash,
        new Date(),
        input.conversationId,
        binding?.intentTokenHash ?? undefined,
      );
      const matched = routeUtterance(input.utterance, candidates);
      // A previously lowered widget request can never fall through to a new ordinary/model route.
      if (matched === null && binding !== null)
        return { matched: null, userTurn: binding };
      return matched === null ? null : { matched, userTurn: binding };
    });
    if (routed === null) return null;
    if (routed.matched === null)
      return Object.freeze({
        reply: 'Этот вариант больше недоступен. Проверьте состояние карточки.',
        action: Object.freeze({
          status: 'expired',
          code: null,
          stopped_at_gate: '0',
        }),
        userTurn: {
          turnId: routed.userTurn.turnId,
          conversationId: routed.userTurn.conversationId,
        },
      });
    const matched = routed.matched;

    const result = await this.gateway.submit({
      intentToken: matched.intentToken,
      tenantId,
      actor: input.actor,
      carrier: 'pwa',
      chatRequestId: input.requestId,
      submission: {
        contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
        widget_id: matched.widgetId,
        intent_token: matched.intentToken,
        inputs: typedInputsForUtterance(
          matched.utteranceTemplate,
          matched.selectionDomainLabelsJson,
          input.utterance,
        ),
        client_nonce: `typed_${input.requestId}`.slice(0, 128),
        profile_id: 'pwa.v1',
      },
    });
    const code = 'code' in result.verdict ? result.verdict.code : null;
    // The response reads the committed correlation through its owner. Gate facts remain
    // internal to their declared readers; no new consumer of loweredTurn is introduced.
    const committed = await this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        principal === null ||
        principal.authority.tenantId !== tenantId ||
        (principal.authority.userId !== null &&
          principal.authority.userId !== input.actor.userId)
      )
        return null;
      return readUserTurnBinding(
        tx,
        tenantId,
        {
          kind: 'chat',
          requestId: input.requestId,
          actorUserId: input.actor.userId,
        },
        principal.proofHash,
        this.turnAudit,
      );
    });
    const userTurn =
      committed === null
        ? undefined
        : {
            turnId: committed.turnId,
            conversationId: committed.conversationId,
          };
    return Object.freeze({
      ...(userTurn === undefined ? {} : { userTurn }),
      reply:
        code === null
          ? 'Готово.'
          : 'Не удалось выполнить этот вариант. Откройте карточку и проверьте её состояние.',
      action: Object.freeze({
        status: result.verdict.outcome,
        code,
        stopped_at_gate: result.stoppedAt,
      }),
    });
  }

  async persistTypedTurn(
    input: Parameters<AiTypedWidgetTriggerPort['persistTypedTurn']>[0],
  ): Promise<UserTurnReference | null> {
    const tenantId = input.actor.tenantId;
    if (tenantId === null || input.surface !== 'web') return null;
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        principal === null ||
        principal.authority.tenantId !== tenantId ||
        (principal.authority.userId !== null &&
          principal.authority.userId !== input.actor.userId)
      )
        throw new ForbiddenException('conversation_principal_unavailable');
      const correlation = {
        kind: 'chat' as const,
        requestId: input.requestId,
        actorUserId: input.actor.userId,
      };
      const turnId = await lockUserTurn(tx, tenantId, correlation);
      const binding = await readUserTurnBinding(
        tx,
        tenantId,
        correlation,
        principal.proofHash,
        this.turnAudit,
      );
      const prior = await TimelineStore.readUserTurn(tx, tenantId, turnId);
      if (
        (binding === null) !== (prior === null) ||
        (binding !== null && binding.intentTokenHash !== null)
      )
        throw new ConflictException('user_turn_binding_conflict');
      const conversationId =
        binding?.conversationId ?? input.conversationId ?? randomUUID();
      if (
        input.conversationId !== undefined &&
        input.conversationId !== conversationId
      )
        throw new ConflictException('conversation_scope_conflict');
      // Persist the turn age using the same authoritative clock that C9 uses
      // for admission; app/DB clock skew must not make a fresh turn future-dated.
      const now = await TimelineStore.readDatabaseClock(tx);
      await TimelineStore.lockConversation(tx, tenantId, conversationId);
      if (input.conversationId !== undefined)
        await TimelineStore.assertConversation(
          tx,
          tenantId,
          conversationId,
          principal.proofHash,
          now,
        );
      const turn = await TimelineStore.appendUserTurn(
        {
          id: turnId,
          tenantId,
          conversationId,
          principalProofHash: principal.proofHash,
          channel: 'pwa',
          textContent: input.utterance,
        },
        tx,
        now,
      );
      if (binding === null)
        await writeUserTurnBinding(this.turnAudit, tx, tenantId, correlation, {
          contract: 'maya.user-turn-binding/1',
          turnId: turn.id,
          conversationId,
          principalProofHash: principal.proofHash,
          intentTokenHash: null,
        });
      return { turnId: turn.id, conversationId };
    });
  }

  private async typedCandidates(
    tx: RequestTx,
    tenantId: string,
    principalProofHash: string,
    now: Date,
    conversationId?: string,
    boundIntentTokenHash?: string,
  ): Promise<readonly TypedRoutingCandidate[]> {
    const rows = await tx.widgetIntentRecord.findMany({
      where: scoped(tenantId, {
        principalProofHash,
        ...(boundIntentTokenHash === undefined
          ? { expiresAt: { gt: now }, consumedAt: null }
          : { intentTokenHash: boundIntentTokenHash }),
        ...(conversationId === undefined
          ? {}
          : { emission: { turn: { conversationId } } }),
      }),
      orderBy: [{ issuedAt: 'desc' }, { intentTokenHash: 'asc' }],
      select: {
        widgetId: true,
        intentTokenHash: true,
        effect: true,
        priority: true,
        capabilitySpace: true,
        capabilityKey: true,
        issuedAt: true,
        erasedAt: true,
        utteranceTemplate: true,
        selectionDomainLabelsJson: true,
        emission: {
          select: {
            renderReceipts: {
              where: { erasedAt: null },
              orderBy: { degradedAt: 'desc' },
              take: 1,
              select: { emittedEnvelopeJson: true },
            },
          },
        },
      },
    });
    return rows.flatMap((row) => {
      const token = tokenForHash(
        row.emission?.renderReceipts[0]?.emittedEnvelopeJson,
        row.intentTokenHash,
      );
      return token === null
        ? []
        : [Object.freeze({ ...row, intentToken: token })];
    });
  }
}

const tokenForHash = (
  envelope: unknown,
  expectedHash: string,
): string | null => {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    Array.isArray(envelope)
  )
    return null;
  const intents = (envelope as { intents?: unknown }).intents;
  if (!Array.isArray(intents)) return null;
  for (const intent of intents) {
    if (typeof intent !== 'object' || intent === null || Array.isArray(intent))
      continue;
    const token = (intent as { intent_token?: unknown }).intent_token;
    if (typeof token === 'string' && sha256Hex(token) === expectedHash)
      return token;
  }
  return null;
};

export const typedInputsForUtterance = (
  template: string | null,
  labelsValue: unknown,
  utterance: string,
): Readonly<Record<string, string>> | null => {
  if (template === null || !template.includes('{{selection}}')) return null;
  if (
    typeof labelsValue !== 'object' ||
    labelsValue === null ||
    Array.isArray(labelsValue)
  )
    return null;
  const entries: Array<readonly [string, string]> = [];
  for (const [field, labels] of Object.entries(
    labelsValue as Record<string, unknown>,
  )) {
    if (typeof labels !== 'object' || labels === null || Array.isArray(labels))
      continue;
    for (const [id, label] of Object.entries(labels))
      if (
        typeof label === 'string' &&
        normaliseUtterance(template.split('{{selection}}').join(label)) ===
          normaliseUtterance(utterance)
      )
        entries.push([field, id]);
  }
  return entries.length === 1
    ? Object.freeze({ [entries[0][0]]: entries[0][1] })
    : null;
};
