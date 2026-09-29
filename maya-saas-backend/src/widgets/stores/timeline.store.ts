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
  constructor(private readonly prisma: PrismaService | TimelineClient) {}

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
    return this.insertTurn(this.prisma, input, now);
  }

  /**
   * A completed tool execution has one assistant turn. Replay returns the same
   * row; it never allocates another timeline index or extends retention.
   */
  async ensureAssistantTurn(
    input: Omit<TimelineTurnInput, 'role'>,
    now = new Date(),
  ): Promise<{ id: string; principalProofHash: string }> {
    const existing = await this.prisma.widgetTimelineTurn.findFirst({
      where: scoped(input.tenantId, {
        conversationId: input.conversationId,
        turnIndex: input.turnIndex,
      }),
      select: { id: true, principalProofHash: true },
    });
    if (existing !== null) return existing;
    try {
      return await this.prisma.widgetTimelineTurn.create({
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
    } catch (error) {
      // A concurrent producer may win the unique tenant/conversation/index
      // constraint. Read that exact tenant-fenced winner; every other failure
      // remains a real store fault.
      if (!isUniqueConstraint(error)) throw error;
      const winner = await this.prisma.widgetTimelineTurn.findFirst({
        where: scoped(input.tenantId, {
          conversationId: input.conversationId,
          turnIndex: input.turnIndex,
        }),
        select: { id: true, principalProofHash: true },
      });
      if (winner === null) throw error;
      return winner;
    }
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
    const row = await tx.widgetTimelineTurn.findFirst({
      where: scoped(tenantId, {
        conversationId,
        principalProofHash,
        erasedAt: null,
        retentionUntil: { gt: now },
      }),
      select: { id: true },
    });
    if (row === null)
      throw new ConflictException('conversation_scope_conflict');
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
    return this.prisma.widgetTimelineTurn.findMany({
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
  }
}

const isUniqueConstraint = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'P2002';
