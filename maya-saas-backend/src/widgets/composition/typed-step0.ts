import { goodsReceiptDecisionReply } from '../inventory/goods-receipt-terminal.presenter';
import { randomUUID } from 'node:crypto';
import { TimelineStore } from '../stores/timeline.store';
import { openWidgetNounHandle } from '../emission/seal.service';
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

  async readBookingSelection(
    actor: Parameters<AiTypedWidgetTriggerPort['readCurrentConversation']>[0],
    conversationId: string,
    beforeTurnId: string,
  ) {
    if (!actor.tenantId) return null;
    const tenantId = actor.tenantId;
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        !principal ||
        principal.authority.tenantId !== tenantId ||
        principal.authority.userId !== actor.userId ||
        principal.role !== 'client'
      )
        return null;
      const now = await TimelineStore.readDatabaseClock(tx);
      return TimelineStore.readBookingSelection(
        tx,
        tenantId,
        principal.proofHash,
        conversationId,
        beforeTurnId,
        now,
        openWidgetNounHandle,
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
    if (tenantId === null || !['web', 'native'].includes(input.surface))
      return null;
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
        const now = await TimelineStore.readDatabaseClock(tx);
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
          turn.retentionUntil <= now ||
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
        // Exact retained goods decision retries replay inert text before looking up
        // a consumed/erased intent. They cannot dispatch again or replace its outcome.
        if (
          ['подтвердить приход', 'отклонить приход'].includes(
            normaliseUtterance(input.utterance),
          )
        ) {
          const reply = await TimelineStore.readReplyForUserTurn(
            tx,
            tenantId,
            principal.proofHash,
            binding,
            now,
            this.encryption,
          );
          if (reply === null)
            throw new ConflictException('goods_receipt_history_unavailable');
          return { kind: 'replay' as const, reply, userTurn: binding };
        }
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
        return { kind: 'route' as const, matched: null, userTurn: binding };
      return matched === null
        ? null
        : { kind: 'route' as const, matched, userTurn: binding };
    });
    if (routed === null) return null;
    if (routed.kind === 'replay')
      return Object.freeze({
        reply: routed.reply,
        historyReplay: true as const,
        action: Object.freeze({
          status: 'terminate',
          code: null,
          stopped_at_gate: '13',
        }),
        userTurn: {
          turnId: routed.userTurn.turnId,
          conversationId: routed.userTurn.conversationId,
        },
      });
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
    const ownerDecision =
      result.verdict.outcome === 'terminate'
        ? (result.verdict.route?.owner_decision as
            { domain?: string; state?: string } | undefined)
        : undefined;
    const scheduleReply =
      ownerDecision?.domain === 'staff_schedule'
        ? ownerDecision.state === 'SUCCEEDED'
          ? 'График обновлён.'
          : ownerDecision.state === 'FAILED'
            ? 'Изменение графика не подтверждено. Проверьте актуальное расписание.'
            : 'Результат изменения графика пока не подтверждён. Повторная запись не выполнялась.'
        : null;
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
    const goodsReply =
      matched.effect === 'COMMIT' &&
      matched.capabilitySpace === 'AE' &&
      matched.capabilityKey === 'crm.goods.receipt.create.v1'
        ? goodsReceiptDecisionReply(
            result.verdict.outcome === 'terminate' &&
              result.verdict.route?.receipt_outcome === 'ACCEPTED'
              ? result.verdict.route.owner_decision
              : null,
          )
        : null;
    const priceReply =
      matched.effect === 'COMMIT' &&
      matched.capabilitySpace === 'AE' &&
      matched.capabilityKey === 'crm.service.fixed-price.update.v1'
        ? servicePriceDecisionReply(
            result.verdict.outcome === 'terminate' &&
              result.verdict.route?.receipt_outcome === 'ACCEPTED'
              ? result.verdict.route.owner_decision
              : null,
          )
        : null;
    const pending =
      result.verdict.outcome === 'terminate' &&
      result.verdict.route?.receipt_outcome === 'ACCEPTED'
        ? (result.verdict.route.owner_decision as {
            kind?: string;
            next?: string;
            reply?: string;
          } | null)
        : null;
    const bookingReply =
      pending?.kind === 'booking_selection_pending' &&
      pending.next === 'date' &&
      pending.reply === 'На какую дату проверить время у выбранного мастера?'
        ? pending.reply
        : null;
    return Object.freeze({
      ...(userTurn === undefined ? {} : { userTurn }),
      reply:
        bookingReply ??
        scheduleReply ??
        (code === null
          ? (goodsReply ?? priceReply ?? 'Готово.')
          : 'Не удалось выполнить этот вариант. Откройте карточку и проверьте её состояние.'),
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
    if (tenantId === null || !['web', 'native'].includes(input.surface))
      return null;
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

/** A gateway acknowledgement is not a provider write receipt. Only this named owner outcome
 * contains the already-verified YCLIENTS readback; typed chat never derives a price result. */
const servicePriceDecisionReply = (value: unknown): string => {
  const record = (input: unknown): Record<string, unknown> =>
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const decision = record(value);
  const outcome = record(decision.outcome);
  if (decision.state === 'REJECTED' && decision.status === 'rejected')
    return 'Предложение изменить цену отклонено.';
  if (
    decision.state === 'SUCCEEDED' &&
    decision.status === 'completed' &&
    outcome.verified === true &&
    outcome.source === 'yclients' &&
    outcome.currency === 'RUB' &&
    typeof outcome.action_execution_id === 'string' &&
    outcome.action_execution_id.length > 0 &&
    typeof outcome.revision === 'string' &&
    outcome.revision.length > 0 &&
    typeof outcome.price_rubles === 'number' &&
    Number.isFinite(outcome.price_rubles)
  )
    return 'Цена услуги обновлена в YCLIENTS. Результат подтверждён.';
  return 'Результат изменения цены пока не подтверждён. Не повторяйте действие до завершения проверки.';
};

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
