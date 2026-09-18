// U8a — the lowering-source read, at function level.
//
// The store client is a recording double here: [U] proves the QUERY (which columns, which fence, which
// join) and the two faults. That the read happens once, and only after Gate 8 passes, is the gate's
// property and is proved on the live path (`test/widgets-live/gate8-input.live-spec.ts`, T-READ-ONCE).

import { PrismaService } from '../../prisma/prisma.service';
import {
  LoweringSourceReader,
  LoweringSourceUnreadable,
} from './lowering-source.read';

type Row = {
  utteranceTemplate: string | null;
  erasedAt: Date | null;
  emission: { turn: { conversationId: string } | null } | null;
} | null;

const clientReturning = (row: Row) => {
  const calls: unknown[] = [];
  const client = {
    widgetIntentRecord: {
      findFirst: (args: unknown) => {
        calls.push(args);
        return Promise.resolve(row);
      },
    },
  } as unknown as PrismaService;
  return { client, calls };
};

const reader = (row: Row) => {
  const { client, calls } = clientReturning(row);
  return { reader: new LoweringSourceReader(client), calls };
};

const ROW = {
  utteranceTemplate: 'show me {{selection}}',
  erasedAt: null,
  emission: { turn: { conversationId: 'c1' } },
};

describe('U8a — LoweringSourceReader [U]', () => {
  it('G8a-R1: one query, tenant-fenced, selecting the three members of the fact and nothing else', async () => {
    const r = reader(ROW);
    const source = await r.reader.read('t1', 'h'.repeat(64));

    expect(source).toEqual({
      utteranceTemplate: 'show me {{selection}}',
      erasedAt: null,
      conversationId: 'c1',
    });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toEqual({
      where: { intentTokenHash: 'h'.repeat(64), tenantId: 't1' },
      select: {
        utteranceTemplate: true,
        erasedAt: true,
        emission: { select: { turn: { select: { conversationId: true } } } },
      },
    });
  });

  it('G8a-R2: the fact is frozen — a later slot reads what Gate 8 read', async () => {
    const source = await reader(ROW).reader.read('t1', 'h'.repeat(64));
    expect(Object.isFrozen(source)).toBe(true);
  });

  it('G8a-R3: an erased record and a blank template are REPORTED, not judged (DS-03 A is Gate 9’s)', async () => {
    const erasedAt = new Date('2026-06-01T00:00:00.000Z');
    const source = await reader({
      utteranceTemplate: null,
      erasedAt,
      emission: { turn: { conversationId: 'c1' } },
    }).reader.read('t1', 'h'.repeat(64));
    expect(source).toEqual({
      utteranceTemplate: null,
      erasedAt,
      conversationId: 'c1',
    });

    const blank = await reader({
      utteranceTemplate: '   ',
      erasedAt: null,
      emission: { turn: { conversationId: 'c1' } },
    }).reader.read('t1', 'h'.repeat(64));
    expect(blank.utteranceTemplate).toBe('   ');
  });

  it('G8a-R4: a record that vanished under the request is a FAULT (R3.9.3), never a verdict', async () => {
    await expect(
      reader(null).reader.read('t1', 'h'.repeat(64)),
    ).rejects.toThrow(LoweringSourceUnreadable);
  });

  it('G8a-R5: a row without its emission’s turn is the same fault — no conversation is invented', async () => {
    await expect(
      reader({
        utteranceTemplate: 't',
        erasedAt: null,
        emission: null,
      }).reader.read('t1', 'h'.repeat(64)),
    ).rejects.toThrow(LoweringSourceUnreadable);
    await expect(
      reader({
        utteranceTemplate: 't',
        erasedAt: null,
        emission: { turn: null },
      }).reader.read('t1', 'h'.repeat(64)),
    ).rejects.toThrow(LoweringSourceUnreadable);
  });

  it('G8a-R6: an unscoped read is refused before a query is built (`scoped()`)', async () => {
    const r = reader(ROW);
    await expect(r.reader.read('', 'h'.repeat(64))).rejects.toThrow(
      /refusing an unscoped query/,
    );
    expect(r.calls).toEqual([]);
  });

  it('G8a-R7: the read can be given another client — the request transaction `T` (D-1)', async () => {
    const injected = clientReturning(ROW);
    const other = clientReturning({
      utteranceTemplate: 'from T',
      erasedAt: null,
      emission: { turn: { conversationId: 'c-T' } },
    });
    const source = await new LoweringSourceReader(injected.client).read(
      't1',
      'h'.repeat(64),
      other.client,
    );
    expect(source.conversationId).toBe('c-T');
    expect(injected.calls).toEqual([]);
    expect(other.calls).toHaveLength(1);
  });
});
