// K3 — the timeline store: conversation turns and emissions (§4.4.1, T_TIMELINE).
//
// A sub-store behind the `WidgetStoresService` facade (U0, D-6). Nothing outside `stores/` constructs
// it; callers reach it through the facade. The methods below were moved here unchanged from
// `widget-stores.service.ts`. Gate 9's `lowerToUserTurn` lands here with U9.

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
    const key = timelineLockKey(input.tenantId, input.conversationId);
    // PostgreSQL derives the signed bigint; application code defines only the collision-free tuple.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

    const record = await tx.widgetIntentRecord.updateMany({
      where: scoped(input.tenantId, {
        intentTokenHash: input.intentTokenHash,
        erasedAt: null,
      }),
      data: { renderedUtterance: input.renderedUtterance },
    });
    if (record.count !== 1) return null;

    const timeline = tx.widgetTimelineTurn;
    const latest = await timeline.aggregate({
      where: scoped(input.tenantId, { conversationId: input.conversationId }),
      _max: { turnIndex: true },
    });
    const turnIndex = (latest._max.turnIndex ?? -1) + 1;
    const row = await tx.widgetTimelineTurn.create({
      data: {
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
        textContent: input.renderedUtterance,
        spokenTranscript: null,
      },
      select: { id: true },
    });
    return { id: row.id, turnIndex };
  }

  private async insertTurn(
    client: Pick<TimelineClient, 'widgetTimelineTurn'>,
    input: TimelineTurnInput,
    now: Date,
  ): Promise<{ id: string }> {
    const row = await client.widgetTimelineTurn.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnIndex: input.turnIndex,
        role: input.role,
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
