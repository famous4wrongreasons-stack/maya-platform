// K3 — the timeline store: conversation turns and emissions (§4.4.1, T_TIMELINE).
//
// A sub-store behind the `WidgetStoresService` facade (U0, D-6). Nothing outside `stores/` constructs
// it; callers reach it through the facade. The methods below were moved here unchanged from
// `widget-stores.service.ts`. Gate 9's `lowerToUserTurn` lands here with U9.

import { PrismaService } from '../../prisma/prisma.service';
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

export class TimelineStore {
  constructor(private readonly prisma: PrismaService) {}

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
    const row = await this.prisma.widgetTimelineTurn.create({
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
