// K3 — the lowering-source reader: the one read of what Gate 9 lowers (plan §2.5, D-2; U8a).
//
// The reader exists so that a token refused at Gates 1–8 never brings a template, a label or a turn
// join into memory. `findRecord` selects AUDIT_RETAINED columns only (S-ROW); `utteranceTemplate` is
// class C, so it is read HERE, once, lazily, after Gate 8's validation has passed — and on a refusal it
// is not read at all. That ordering is the whole point of the file: a class-C column loaded before the
// gate that would refuse the submission is a class-C column loaded for a refused submission.
//
// What it returns is exactly `AdmissionFacts.loweringSource`: the template, the record's erasure stamp,
// and the conversation the emission's turn belongs to. It answers what the row SAYS and judges none of
// it: an absent or blank template and an erased record are Gate 9's to answer (DS-03 A ⇒
// `superseded/handle_stale`, D-11), not Gate 8's to refuse. The one thing it refuses to do is invent —
// a row that is not there raises, exactly as `findRecord` raises for a record without its emission,
// because a record that vanished under an open request is a store that has stopped meaning what the
// schema says. R3.9.3 admits that: only a genuine fault may look like a fault.

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { scoped } from './tenant-scope';

/** `AdmissionFacts.loweringSource`, as the store answers it. */
export interface LoweringSourceRow {
  readonly utteranceTemplate: string | null;
  readonly erasedAt: Date | null;
  readonly conversationId: string;
}

/**
 * What slot 8 needs of this store. A port, so the gate file names no store client (GATE-FILE).
 *
 * CKPT-W1 review fix (finding 4): `client` is on the PORT, not only on the class. Slot 8 runs inside
 * the request transaction `T` (D-1) and must read through it; a port that could not carry `T` forced
 * the caller to reach past the port for the concrete reader, which is the seam this file exists to
 * close. It stays optional, and `LoweringSourceClient` is a delegate shape rather than a transaction
 * type, so naming it commits no caller to a store client (FR-1, D-6).
 */
export interface LoweringSourcePort {
  read(
    tenantId: string,
    intentTokenHash: string,
    client?: LoweringSourceClient,
  ): Promise<LoweringSourceRow>;
}

/**
 * The narrow view of the store client the read needs: one delegate. The request transaction `T` (D-1)
 * satisfies it too, which is how the integrator can pass `T` here without this file naming a
 * transaction type.
 */
export type LoweringSourceClient = Pick<PrismaService, 'widgetIntentRecord'>;

/** A record that was read at Gate 1 and is gone at Gate 8: a fault, never a verdict. */
export class LoweringSourceUnreadable extends Error {
  constructor(message: string) {
    super(`lowering source: ${message}`);
    this.name = 'LoweringSourceUnreadable';
  }
}

@Injectable()
export class LoweringSourceReader implements LoweringSourcePort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One query, tenant-fenced through `scoped()` like every other store read. The conversation id comes
   * from the emission's turn rather than from a column on the record, because the record has none: the
   * turn is where a conversation is stated, and copying it onto the record would be a second answer to
   * the same question.
   */
  async read(
    tenantId: string,
    intentTokenHash: string,
    client: LoweringSourceClient = this.prisma,
  ): Promise<LoweringSourceRow> {
    const row = await client.widgetIntentRecord.findFirst({
      where: scoped(tenantId, { intentTokenHash }),
      select: {
        utteranceTemplate: true,
        erasedAt: true,
        emission: { select: { turn: { select: { conversationId: true } } } },
      },
    });
    if (!row)
      throw new LoweringSourceUnreadable(
        'the record Gate 1 admitted is no longer readable in this request',
      );
    const conversationId = row.emission?.turn?.conversationId;
    if (typeof conversationId !== 'string' || conversationId.length === 0)
      throw new LoweringSourceUnreadable(
        'the record was read without the conversation of its emission’s turn',
      );
    return Object.freeze({
      utteranceTemplate: row.utteranceTemplate,
      erasedAt: row.erasedAt,
      conversationId,
    });
  }
}
