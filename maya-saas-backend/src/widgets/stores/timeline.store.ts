import {
  bookingSelectionPreferences,
  type BookingNounOpener,
} from '../booking/booking-selection-preferences';
import { stableActionJson } from '../../action-engine/action-engine.identity';
import { sha256Hex } from '../token.util';
// K3 — the timeline store: conversation turns and emissions (§4.4.1, T_TIMELINE).
//
// A sub-store behind the `WidgetStoresService` facade (U0, D-6). Nothing outside `stores/` constructs
// it; callers reach it through the facade. The methods below were moved here unchanged from
// `widget-stores.service.ts`. Gate 9's `lowerToUserTurn` lands here with U9.

import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestTx } from '../authority/principal-view';
import type { LoweredUtterance } from '../lowering/lowering';
import { scoped } from './tenant-scope';
import type { ChatReplyCipher } from '../owner-ports/chat-reply-cipher.port';
import {
  chatReplyId,
  decodeChatReply,
  decodeChatCompletion,
  encodeChatReply,
  isChatReply,
} from './chat-reply-codec';

/** Retention windows from §5. Stated once so a store cannot invent its own. */
export const RETENTION = {
  /** T_TIMELINE — the conversation a person can see. */
  timelineDays: 180,
  /** Emission bodies are dropped well before the row is, which is why the two are separate. */
  emissionBodyDefaultSec: 7 * 24 * 60 * 60,
} as const;

export interface TimelineTurnInput {
  tenantId: string;
  conversationId: string;
  turnIndex: number;
  /** TurnRole — 'user' or 'assistant'. OWNER RULING, wave 2; the database CHECK admits no other. */
  role: 'user' | 'assistant';
  principalProofHash: string;
  channel: string;
  textContent?: string | null;
  spokenTranscript?: string | null;
}

/** Gate 9's write input. It carries transcript facts and record identity, never capability authority. */
export interface LowerToUserTurnInput {
  readonly tenantId: string;
  readonly intentTokenHash: string;
  readonly conversationId: string;
  readonly principalProofHash: string;
  readonly channel: string;
  readonly renderedUtterance: LoweredUtterance;
  readonly turnId?: string;
}

type TimelineClient = Pick<
  RequestTx,
  '$executeRaw' | 'widgetIntentRecord' | 'widgetTimelineTurn'
>;

const USER_TURN_ROLE: TimelineTurnInput['role'] = 'user';

/** One unambiguous advisory-lock identity per exact tenant/conversation tuple. */
export const timelineLockKey = (
  tenantId: string,
  conversationId: string,
): string =>
  `${Buffer.byteLength(tenantId, 'utf8')}:${tenantId}${Buffer.byteLength(conversationId, 'utf8')}:${conversationId}`;

export class TimelineStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption?: ChatReplyCipher,
  ) {}

  /** Retention/admission use the transaction's PostgreSQL clock, never the app clock. */
  static async readDatabaseClock(
    tx: Pick<RequestTx, '$queryRaw'>,
  ): Promise<Date> {
    const [{ now }] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return now;
  }

  /**
   * Serialise widget-store changes for one exact conversation without giving callers raw-SQL
   * authority. This remains a storage primitive: it reads no capability owner and decides no
   * business outcome.
   */
  static async lockConversation(
    tx: Pick<TimelineClient, '$executeRaw'>,
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    const key = timelineLockKey(tenantId, conversationId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  static async lockUserTurnIdentity(
    tx: Pick<TimelineClient, '$executeRaw'>,
    tenantId: string,
    id: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`user-turn:${tenantId}:${id}`}, 0))`;
  }

  /** Caller resolves the live principal; this owner alone reads/writes transcript rows. */
  static async persistChatReply(
    tx: TimelineClient,
    input: {
      tenantId: string;
      principalProofHash: string;
      userTurn: { turnId: string; conversationId: string };
      reply: string;
      completionHash: string;
      semanticContext?: unknown;
    },
    now: Date,
    encryption: ChatReplyCipher,
  ): Promise<void> {
    if (
      Buffer.byteLength(
        stableActionJson(input.semanticContext ?? null),
        'utf8',
      ) > 16_384
    )
      throw new ConflictException('conversation_context_too_large');
    const tenantId = input.tenantId;
    await TimelineStore.lockConversation(
      tx,
      tenantId,
      input.userTurn.conversationId,
    );
    const parent = await TimelineStore.readUserTurn(
      tx,
      tenantId,
      input.userTurn.turnId,
    );
    if (
      parent === null ||
      parent.role !== 'user' ||
      parent.channel !== 'pwa' ||
      parent.principalProofHash !== input.principalProofHash ||
      parent.conversationId !== input.userTurn.conversationId ||
      parent.erasedAt !== null ||
      parent.retentionUntil <= now
    )
      throw new ConflictException('conversation_scope_conflict');
    const id = chatReplyId(tenantId, `${parent.id}:${input.completionHash}`);
    const existing = await TimelineStore.readUserTurn(tx, tenantId, id);
    // Immutable completion revisions: identical retry dedupes; a reconciled
    // outcome appends its own text without rewriting an earlier UNKNOWN.
    if (existing !== null) {
      if (
        existing.role !== 'assistant' ||
        existing.channel !== 'pwa' ||
        existing.principalProofHash !== input.principalProofHash ||
        existing.conversationId !== parent.conversationId ||
        existing.erasedAt !== null ||
        existing.retentionUntil <= now ||
        existing.textContent === null ||
        !isChatReply(existing.textContent)
      )
        throw new ConflictException('conversation_reply_conflict');
      if (
        decodeChatCompletion(encryption, existing.textContent)
          .completionHash !== input.completionHash
      )
        throw new ConflictException('conversation_completion_conflict');
      return;
    }
    const latest = await tx.widgetTimelineTurn.aggregate({
      where: scoped(tenantId, { conversationId: parent.conversationId }),
      _max: { turnIndex: true },
    });
    const bounded =
      input.reply.length <= 32_000
        ? input.reply
        : `${input.reply.slice(0, 32_000)}\n[Длинный ответ сокращён в истории.]`;
    await tx.widgetTimelineTurn.create({
      data: {
        id,
        tenantId,
        conversationId: parent.conversationId,
        turnIndex: (latest._max.turnIndex ?? -1) + 1,
        role: 'assistant',
        principalProofHash: input.principalProofHash,
        channel: 'pwa',
        createdAt: now,
        retentionUntil: parent.retentionUntil,
        textContent: encodeChatReply(
          encryption,
          bounded,
          input.completionHash,
          parent.id,
          input.semanticContext,
        ),
      },
    });
    return;
  }

  static async readChatContext(
    tx: TimelineClient,
    tenantId: string,
    principalProofHash: string,
    conversationId: string,
    now: Date,
    encryption: ChatReplyCipher,
    beforeTurnId: string,
  ): Promise<unknown> {
    await TimelineStore.lockConversation(tx, tenantId, conversationId);
    const current = await TimelineStore.readUserTurn(
      tx,
      tenantId,
      beforeTurnId,
    );
    if (
      !current ||
      current.role !== 'user' ||
      current.channel !== 'pwa' ||
      current.conversationId !== conversationId ||
      current.principalProofHash !== principalProofHash ||
      current.erasedAt !== null ||
      current.retentionUntil <= now
    )
      return null;
    const row = await tx.widgetTimelineTurn.findFirst({
      where: scoped(tenantId, {
        conversationId,
        turnIndex: { lt: current.turnIndex },
        principalProofHash,
        role: 'assistant',
        channel: 'pwa',
        erasedAt: null,
        retentionUntil: { gt: now },
        textContent: { not: null },
      }),
      orderBy: { turnIndex: 'desc' },
      select: { textContent: true },
    });
    if (!row?.textContent || !isChatReply(row.textContent)) return null;
    return (
      decodeChatCompletion(encryption, row.textContent).semanticContext ?? null
    );
  }

  /** Retained closed choices for a NEW explicit chat turn. No live intent is restored. */
  static async readBookingSelection(
    tx: TimelineClient,
    tenantId: string,
    principalProofHash: string,
    conversationId: string,
    beforeTurnId: string,
    now: Date,
    openNoun: BookingNounOpener,
  ) {
    await TimelineStore.lockConversation(tx, tenantId, conversationId);
    const turn = await tx.widgetTimelineTurn.findFirst({
      where: scoped(tenantId, {
        id: beforeTurnId,
        tenantId,
        conversationId,
        principalProofHash: principalProofHash,
        role: 'user',
        erasedAt: null,
        retentionUntil: { gt: now },
      }),
      select: { turnIndex: true },
    });
    if (!turn) return null;
    const records = await tx.widgetIntentRecord.findMany({
      where: scoped(tenantId, {
        tenantId,
        principalProofHash: principalProofHash,
        erasedAt: null,
        expiresAt: { gt: now },
        OR: [
          {
            widgetKind: { in: ['SERVICE_SELECTOR', 'STAFF_SELECTOR'] },
            effect: 'REFINE',
          },
          { widgetKind: 'TIME_SLOT_SELECTOR', effect: 'DRAFT' },
          { widgetKind: 'BOOKING_CONFIRMATION', effect: 'COMMIT' },
        ],
        emission: {
          erasedAt: null,
          retentionUntil: { gt: now },
          turn: {
            tenantId,
            conversationId,
            principalProofHash: principalProofHash,
            erasedAt: null,
            retentionUntil: { gt: now },
            turnIndex: { lt: turn.turnIndex },
          },
        },
      }),
      orderBy: [{ issuedAt: 'desc' }, { intentTokenHash: 'desc' }],
      take: 33,
      select: {
        widgetKind: true,
        effect: true,
        capabilitySpace: true,
        capabilityKey: true,
        inputSchemaHash: true,
        singleUse: true,
        consumedAt: true,
        frozenNounsJson: true,
        selectionDomain: true,
        receipts: {
          select: {
            outcome: true,
            actionReceiptRef: true,
            submittedAt: true,
            erasedAt: true,
          },
        },
        submissionAudits: {
          orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
          take: 17,
          select: { inputsClosedJson: true, erasedAt: true },
        },
      },
    });
    return bookingSelectionPreferences(records, tenantId, openNoun);
  }

  /** Bounded history-only replay. The result is text, never a live intent or authority. */
  static async readReplyForUserTurn(
    tx: TimelineClient,
    tenantId: string,
    principalProofHash: string,
    userTurn: { turnId: string; conversationId: string },
    now: Date,
    encryption: ChatReplyCipher,
  ): Promise<string | null> {
    await TimelineStore.lockConversation(tx, tenantId, userTurn.conversationId);
    const parent = await TimelineStore.readUserTurn(
      tx,
      tenantId,
      userTurn.turnId,
    );
    if (
      !parent ||
      parent.role !== 'user' ||
      parent.channel !== 'pwa' ||
      parent.conversationId !== userTurn.conversationId ||
      parent.principalProofHash !== principalProofHash ||
      parent.erasedAt !== null ||
      parent.retentionUntil <= now
    )
      return null;
    const rows = await tx.widgetTimelineTurn.findMany({
      where: scoped(tenantId, {
        conversationId: userTurn.conversationId,
        principalProofHash,
        role: 'assistant',
        channel: 'pwa',
        erasedAt: null,
        retentionUntil: { gt: now },
        textContent: { not: null },
        turnIndex: { gt: parent.turnIndex },
      }),
      orderBy: { turnIndex: 'desc' },
      take: 51,
      select: { textContent: true },
    });
    for (const row of rows) {
      if (!row.textContent || !isChatReply(row.textContent)) continue;
      const completion = decodeChatCompletion(encryption, row.textContent);
      if (completion.parentId === userTurn.turnId) return completion.text;
    }
    // Missing, erased, expired or beyond the bounded history window: no replay.
    return null;
  }

  static async readCurrentConversation(
    tx: TimelineClient,
    tenantId: string,
    principalProofHash: string,
    now: Date,
    encryption: ChatReplyCipher,
  ) {
    const scope = {
      principalProofHash: principalProofHash,
      channel: 'pwa',
      erasedAt: null,
      retentionUntil: { gt: now },
    };
    const latest = await tx.widgetTimelineTurn.findFirst({
      where: scoped(tenantId, { ...scope, role: 'user' }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { conversationId: true },
    });
    if (latest === null)
      return {
        contract: 'maya.conversation-history/1' as const,
        conversationId: null,
        truncated: false,
        interrupted: false,
        turns: [],
      };
    await TimelineStore.lockConversation(tx, tenantId, latest.conversationId);
    const rows = await tx.widgetTimelineTurn.findMany({
      where: scoped(tenantId, {
        ...scope,
        conversationId: latest.conversationId,
        textContent: { not: null },
      }),
      orderBy: { turnIndex: 'desc' },
      take: 51,
      select: { id: true, role: true, textContent: true, createdAt: true },
    });
    const latestReplies = new Map<string, string>();
    const decodedReplies = new Map<
      string,
      ReturnType<typeof decodeChatCompletion>
    >();
    // Rows are newest first. Resume projects only the latest saved answer per
    // user turn; prior revisions remain audit history and never enter model context.
    for (const row of rows) {
      if (
        row.role !== 'assistant' ||
        row.textContent === null ||
        !isChatReply(row.textContent)
      )
        continue;
      const decoded = decodeChatCompletion(encryption, row.textContent);
      decodedReplies.set(row.id, decoded);
      if (!latestReplies.has(decoded.parentId))
        latestReplies.set(decoded.parentId, row.id);
    }
    const turns = rows
      .slice(0, 50)
      .reverse()
      .flatMap<{
        id: string;
        role: 'user' | 'assistant';
        text: string;
        createdAt: string;
        completed: boolean;
      }>((row) => {
        if (row.role !== 'user' && row.role !== 'assistant') return [];
        const text = row.textContent;
        if (text === null) return [];
        // Only this writer's encrypted replies are restored. A widget body,
        // receipt or legacy assistant placeholder is not a chat completion.
        if (row.role === 'assistant' && !isChatReply(text)) return [];
        const decoded = decodedReplies.get(row.id);
        if (decoded && latestReplies.get(decoded.parentId) !== row.id)
          return [];
        return [
          {
            id: row.id,
            role: row.role,
            text:
              row.role === 'assistant'
                ? decodeChatReply(encryption, text)
                : text,
            createdAt: row.createdAt.toISOString(),
            completed: row.role === 'assistant' || latestReplies.has(row.id),
          },
        ];
      });
    return {
      contract: 'maya.conversation-history/1' as const,
      conversationId: turns.length ? latest.conversationId : null,
      truncated: rows.length > 50,
      interrupted: turns.some((turn) => !turn.completed),
      turns,
    };
  }

  private plusDays(from: Date, days: number): Date {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // Gate 9 calls this: the lowered utterance is appended as a USER turn with authority NONE, and
  // "from here the path is byte-identical to a typed message". That is the point of the store —
  // a widget tap and a typed sentence become the same kind of row.

  async appendTurn(
    input: TimelineTurnInput,
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(
      async (tx) => {
        await TimelineStore.lockConversation(
          tx,
          input.tenantId,
          input.conversationId,
        );
        await TimelineStore.assertNotErased(tx, input);
        return this.insertTurn(tx, input, now);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /**
   * A completed tool execution has one assistant turn. Replay returns the same
   * row; it never allocates another timeline index or extends retention.
   */
  async ensureAssistantTurn(
    input: Omit<TimelineTurnInput, 'role'>,
    now = new Date(),
  ): Promise<{ id: string; principalProofHash: string }> {
    return this.prisma.$transaction(
      async (tx) => {
        await TimelineStore.lockConversation(
          tx,
          input.tenantId,
          input.conversationId,
        );
        await TimelineStore.assertNotErased(tx, input);
        const existing = await tx.widgetTimelineTurn.findFirst({
          where: scoped(input.tenantId, {
            conversationId: input.conversationId,
            turnIndex: input.turnIndex,
          }),
          select: {
            id: true,
            principalProofHash: true,
            erasedAt: true,
            retentionUntil: true,
          },
        });
        if (existing !== null) {
          if (existing.erasedAt !== null || existing.retentionUntil <= now)
            throw new ConflictException('conversation_scope_conflict');
          return {
            id: existing.id,
            principalProofHash: existing.principalProofHash,
          };
        }
        return tx.widgetTimelineTurn.create({
          data: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            turnIndex: input.turnIndex,
            role: 'assistant',
            principalProofHash: input.principalProofHash,
            channel: input.channel,
            createdAt: now,
            retentionUntil: this.plusDays(now, RETENTION.timelineDays),
            textContent: input.textContent ?? null,
            spokenTranscript: input.spokenTranscript ?? null,
          },
          select: { id: true, principalProofHash: true },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** After erasure, late generic producers cannot reopen the same principal's transcript. */
  private static async assertNotErased(
    tx: Pick<TimelineClient, 'widgetTimelineTurn'>,
    input: Pick<
      TimelineTurnInput,
      'tenantId' | 'conversationId' | 'principalProofHash'
    >,
  ): Promise<void> {
    const erased = await tx.widgetTimelineTurn.findFirst({
      where: scoped(input.tenantId, {
        conversationId: input.conversationId,
        principalProofHash: input.principalProofHash,
        erasedAt: { not: null },
      }),
      select: { id: true },
    });
    if (erased !== null)
      throw new ConflictException('conversation_scope_conflict');
  }

  /**
   * Gate 9's atomic write, inside the gateway's existing request transaction `T`.
   *
   * The advisory lock serialises index allocation with erasure. The conditional record update is the
   * erasure-race fence: when the source became unavailable after Gate 8 read it, no turn is inserted.
   */
  static async lowerToUserTurn(
    input: LowerToUserTurnInput,
    tx: TimelineClient,
    now = new Date(),
  ): Promise<{ id: string; turnIndex: number } | null> {
    // PostgreSQL derives the signed bigint; application code defines only the collision-free tuple.
    await TimelineStore.lockConversation(
      tx,
      input.tenantId,
      input.conversationId,
    );

    const record = await tx.widgetIntentRecord.updateMany({
      where: scoped(input.tenantId, {
        intentTokenHash: input.intentTokenHash,
        erasedAt: null,
      }),
      data: { renderedUtterance: input.renderedUtterance },
    });
    if (record.count !== 1) return null;

    return TimelineStore.appendUserTurn(
      {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        principalProofHash: input.principalProofHash,
        channel: input.channel,
        textContent: input.renderedUtterance,
        id: input.turnId,
      },
      tx,
      now,
    );
  }

  /** Single physical USER insert for ordinary typed ingress and Gate 9. Caller holds the identity/conversation locks. */
  static async appendUserTurn(
    input: Omit<TimelineTurnInput, 'role' | 'turnIndex'> & {
      id?: string;
      turnIndex?: number;
    },
    tx: Pick<TimelineClient, 'widgetTimelineTurn'>,
    now = new Date(),
  ): Promise<{ id: string; turnIndex: number }> {
    if (input.id !== undefined) {
      const existing = await TimelineStore.readUserTurn(
        tx,
        input.tenantId,
        input.id,
      );
      if (existing !== null) {
        if (
          existing.role !== USER_TURN_ROLE ||
          existing.conversationId !== input.conversationId ||
          existing.principalProofHash !== input.principalProofHash ||
          existing.channel !== input.channel ||
          existing.textContent !== (input.textContent ?? null) ||
          existing.spokenTranscript !== (input.spokenTranscript ?? null) ||
          existing.erasedAt !== null ||
          existing.retentionUntil.getTime() <= now.getTime()
        )
          throw new ConflictException('user_turn_replay_conflict');
        return { id: existing.id, turnIndex: existing.turnIndex };
      }
    }
    const timeline = tx.widgetTimelineTurn;
    const latest =
      input.turnIndex === undefined
        ? await timeline.aggregate({
            where: scoped(input.tenantId, {
              conversationId: input.conversationId,
            }),
            _max: { turnIndex: true },
          })
        : null;
    const turnIndex = input.turnIndex ?? (latest?._max.turnIndex ?? -1) + 1;
    const row = await tx.widgetTimelineTurn.create({
      data: {
        ...(input.id === undefined ? {} : { id: input.id }),
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnIndex,
        role: USER_TURN_ROLE,
        principalProofHash: input.principalProofHash,
        channel: input.channel,
        createdAt: now,
        retentionUntil: new Date(
          now.getTime() + RETENTION.timelineDays * 24 * 60 * 60 * 1000,
        ),
        textContent: input.textContent ?? null,
        spokenTranscript: input.spokenTranscript ?? null,
      },
      select: { id: true },
    });
    return { id: row.id, turnIndex };
  }

  /** C9 needs immutable event age and scope, never conversation content. */
  static readActiveUserTurnIdentity(
    tx: Pick<TimelineClient, 'widgetTimelineTurn'>,
    input: {
      tenantId: string;
      id: string;
      conversationId: string;
      principalProofHash: string;
    },
    now: Date,
  ) {
    return tx.widgetTimelineTurn.findFirst({
      where: scoped(input.tenantId, {
        id: input.id,
        conversationId: input.conversationId,
        principalProofHash: input.principalProofHash,
        role: 'user',
        channel: 'pwa',
        erasedAt: null,
        retentionUntil: { gt: now },
      }),
      select: { id: true, createdAt: true, retentionUntil: true },
    });
  }

  static readUserTurn(
    tx: Pick<TimelineClient, 'widgetTimelineTurn'>,
    tenantId: string,
    id: string,
  ) {
    return tx.widgetTimelineTurn.findFirst({
      where: scoped(tenantId, { id }),
      select: {
        id: true,
        conversationId: true,
        turnIndex: true,
        role: true,
        principalProofHash: true,
        channel: true,
        textContent: true,
        spokenTranscript: true,
        erasedAt: true,
        retentionUntil: true,
      },
    });
  }

  static async assertConversation(
    tx: Pick<TimelineClient, 'widgetTimelineTurn'>,
    tenantId: string,
    conversationId: string,
    principalProofHash: string,
    now: Date,
  ): Promise<void> {
    const row = await TimelineStore.readLiveConversationAnchor(
      tx,
      { tenantId, conversationId, principalProofHash },
      now,
    );
    if (row === null)
      throw new ConflictException('conversation_scope_conflict');
  }

  /** Caller owns authority and the conversation lock; only the exact live row identity escapes. */
  static readLiveConversationAnchor(
    tx: Pick<TimelineClient, 'widgetTimelineTurn'>,
    input: Pick<
      TimelineTurnInput,
      'tenantId' | 'conversationId' | 'principalProofHash'
    >,
    now: Date,
  ): Promise<{ id: string } | null> {
    return tx.widgetTimelineTurn.findFirst({
      where: scoped(input.tenantId, {
        conversationId: input.conversationId,
        principalProofHash: input.principalProofHash,
        erasedAt: null,
        retentionUntil: { gt: now },
      }),
      select: { id: true },
    });
  }

  static async ensureAssistantExecutionTurn(
    tx: TimelineClient,
    input: {
      tenantId: string;
      conversationId: string;
      parentUserTurnId: string;
      principalProofHash: string;
      channel: string;
      executionId: string;
    },
    now = new Date(),
  ): Promise<{ id: string; principalProofHash: string } | null> {
    await TimelineStore.lockConversation(
      tx,
      input.tenantId,
      input.conversationId,
    );
    const parent = await TimelineStore.readUserTurn(
      tx,
      input.tenantId,
      input.parentUserTurnId,
    );
    if (
      parent === null ||
      parent.role !== 'user' ||
      parent.conversationId !== input.conversationId ||
      parent.principalProofHash !== input.principalProofHash ||
      parent.erasedAt !== null ||
      parent.retentionUntil.getTime() <= now.getTime()
    )
      return null;
    const h = sha256Hex(
      stableActionJson([
        'maya.assistant-execution-turn/1',
        input.tenantId,
        input.conversationId,
        input.executionId,
      ]),
    );
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    const existing = await TimelineStore.readUserTurn(tx, input.tenantId, id);
    if (existing !== null)
      return existing.role === 'assistant' &&
        existing.principalProofHash === input.principalProofHash &&
        existing.conversationId === input.conversationId &&
        existing.erasedAt === null &&
        existing.retentionUntil.getTime() > now.getTime()
        ? { id, principalProofHash: existing.principalProofHash }
        : null;
    const latest = await tx.widgetTimelineTurn.aggregate({
      where: scoped(input.tenantId, { conversationId: input.conversationId }),
      _max: { turnIndex: true },
    });
    return tx.widgetTimelineTurn.create({
      data: {
        id,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnIndex: (latest._max.turnIndex ?? -1) + 1,
        role: 'assistant',
        principalProofHash: input.principalProofHash,
        channel: input.channel,
        createdAt: now,
        retentionUntil: new Date(
          now.getTime() + RETENTION.timelineDays * 86400000,
        ),
        textContent: null,
        spokenTranscript: null,
      },
      select: { id: true, principalProofHash: true },
    });
  }

  private async insertTurn(
    client: Pick<TimelineClient, 'widgetTimelineTurn'>,
    input: TimelineTurnInput,
    now: Date,
  ): Promise<{ id: string }> {
    if (input.role === 'user') {
      const row = await TimelineStore.appendUserTurn(input, client, now);
      return { id: row.id };
    }
    const row = await client.widgetTimelineTurn.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnIndex: input.turnIndex,
        role: 'assistant',
        principalProofHash: input.principalProofHash,
        channel: input.channel,
        createdAt: now,
        retentionUntil: this.plusDays(now, RETENTION.timelineDays),
        textContent: input.textContent ?? null,
        spokenTranscript: input.spokenTranscript ?? null,
      },
      select: { id: true },
    });
    return row;
  }

  /**
   * Reading the timeline reaches no capability owner — §3's exit requires zero capability calls on
   * this path, and the way to keep that true is for the read to be a plain select with nothing to
   * join to.
   */
  async readTimeline(tenantId: string, conversationId: string, limit = 50) {
    const rows = await this.prisma.widgetTimelineTurn.findMany({
      where: scoped(tenantId, { conversationId, erasedAt: null }),
      orderBy: { turnIndex: 'asc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        turnIndex: true,
        role: true,
        channel: true,
        createdAt: true,
        textContent: true,
        spokenTranscript: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      textContent:
        row.role === 'assistant' && row.textContent !== null
          ? decodeChatReply(this.encryption, row.textContent)
          : row.textContent,
    }));
  }
}
