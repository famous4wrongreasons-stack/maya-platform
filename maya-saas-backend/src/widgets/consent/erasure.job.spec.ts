import fs from 'node:fs';
import path from 'node:path';

import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestTx } from '../authority/principal-view';
import { timelineLockKey } from '../stores/timeline.store';
import {
  WidgetConversationErasureJob,
  WIDGET_ERASURE_CLASS_MAP,
} from './erasure.job';

const REQUEST = Object.freeze({
  tenantId: 'tenant-a',
  conversationId: '5ff23cec-82f8-4ac7-a355-85ee06b40452',
  erasureRequestRef: 'erase-1',
  subjectPrincipalProofHash: 'a'.repeat(64),
});

const schemaErasableFields = (): Readonly<
  Record<string, Readonly<Record<string, string>>>
> => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );
  const out: Record<string, Record<string, string>> = {};
  for (const match of schema.matchAll(
    /model\s+(Widget\w+)\s*\{([\s\S]*?)\n\}/g,
  )) {
    const fields: Record<string, string> = {};
    for (const line of match[2].split('\n')) {
      const field = line.match(/^\s*(\w+)\s+.*\/\/\s*([CX])(?:\s|$)/);
      if (!field) continue;
      fields[field[1]] =
        field[2] === 'C' ? 'CONVERSATION_CONTENT' : 'CANONICAL_ELSEWHERE';
    }
    if (Object.keys(fields).length > 0) out[match[1]] = fields;
  }
  return out;
};

const mockPrisma = (changed = 7) => {
  const execute = jest.fn().mockResolvedValue(changed);
  const transaction = jest.fn(
    async (work: (tx: unknown) => Promise<unknown>, _options?: unknown) =>
      work({ $executeRaw: execute }),
  );
  return {
    prisma: { $transaction: transaction } as unknown as PrismaService,
    execute,
    transaction,
  };
};

const statementOf = (execute: jest.Mock): string => {
  const [strings] = execute.mock.calls.at(-1) as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return strings.join('?');
};

describe('P-RT6 — conversation erasure job', () => {
  it('RT6-MAP-1 exactly maps every schema C/X field and no A field', () => {
    expect(WIDGET_ERASURE_CLASS_MAP).toEqual(schemaErasableFields());
  });

  it('RT6-MAP-2 refuses an unqualified request before opening a transaction', async () => {
    const { prisma, transaction } = mockPrisma();
    const job = new WidgetConversationErasureJob(prisma);

    for (const member of Object.keys(REQUEST))
      await expect(job.run({ ...REQUEST, [member]: '' })).rejects.toThrow(
        `${member} is required`,
      );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('RT6-ATOMIC-1 takes the exact Gate 9 lock before the data statement in one transaction', async () => {
    const { prisma, execute, transaction } = mockPrisma(11);
    const job = new WidgetConversationErasureJob(prisma);
    const now = new Date('2026-09-23T09:00:00.000Z');

    await expect(job.run(REQUEST, now)).resolves.toEqual({
      tombstonesWritten: 11,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'ReadCommitted',
    });
    expect(execute).toHaveBeenCalledTimes(2);
    const sql = statementOf(execute);
    expect(execute.mock.calls[0][0].join('?')).toBe(
      'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
    );
    expect(sql).not.toContain('pg_advisory_xact_lock');
    expect(execute.mock.calls[0]).toContain(
      timelineLockKey(REQUEST.tenantId, REQUEST.conversationId),
    );
    expect(sql).toContain('INSERT INTO "WidgetErasureTombstone"');
    expect(sql).toContain('        FROM changed\n      ');
  });

  it('RT6-ATOMIC-2 clears each mapped field and stamps only the seven erasable models', async () => {
    const { prisma, execute } = mockPrisma();
    await new WidgetConversationErasureJob(prisma).run(REQUEST);
    const sql = statementOf(execute);

    for (const [model, fields] of Object.entries(WIDGET_ERASURE_CLASS_MAP)) {
      expect(sql).toContain(`UPDATE "${model}"`);
      for (const field of Object.keys(fields))
        expect(sql).toContain(
          field === 'selectedLabels'
            ? '"selectedLabels" = ARRAY[]::text[]'
            : `"${field}" = NULL`,
        );
    }
    expect(sql.match(/UPDATE "Widget/g)).toHaveLength(7);
    expect(sql.match(/"erasedAt" = \?/g)).toHaveLength(7);
    // Different conversation locks can overlap a shared draft. Re-check the row after its lock,
    // so a concurrent eraser cannot re-stamp it or append a second tombstone.
    expect(
      sql.match(/AND [terad]\."erasedAt" IS NULL\s+RETURNING/g),
    ).toHaveLength(7);
    expect(sql).toContain('"selectedLabels" = ARRAY[]::text[]');
  });

  it('RT6-SCOPE-1 carries exact tenant, conversation and subject qualifiers into the statement', async () => {
    const { prisma, execute } = mockPrisma();
    await new WidgetConversationErasureJob(prisma).run(REQUEST);
    const parameters = (
      execute.mock.calls.at(-1) as unknown as readonly unknown[]
    ).slice(1);

    expect(parameters).toContain(REQUEST.tenantId);
    expect(parameters).toContain(REQUEST.conversationId);
    expect(parameters).toContain(REQUEST.subjectPrincipalProofHash);
    expect(parameters).toContain(REQUEST.erasureRequestRef);
    const sql = statementOf(execute);
    expect(sql).toContain('t."tenantId" = ?');
    expect(sql).toContain('t."conversationId" = ?::uuid');
    expect(sql).toContain('t."principalProofHash" = ?');
    expect(sql).toContain('r."principalProofHash" = ?');
    expect(sql).toContain('d."principalProofHash" = ?');
  });

  it('RT6-RETRY-1 selects only non-erased rows, so retry cannot duplicate a tombstone', async () => {
    const { prisma, execute } = mockPrisma(0);
    await expect(
      new WidgetConversationErasureJob(prisma).run(REQUEST),
    ).resolves.toEqual({ tombstonesWritten: 0 });
    expect(statementOf(execute).match(/"erasedAt" IS NULL/g)).toHaveLength(14);
  });

  it('does not take an erasure snapshot while the lock is still waiting', async () => {
    let unlock!: () => void;
    const lock = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const execute = jest
      .fn()
      .mockImplementationOnce(() => lock)
      .mockResolvedValue(3);
    const tx = { $executeRaw: execute } as unknown as RequestTx;
    const { prisma, transaction } = mockPrisma();
    const pending = new WidgetConversationErasureJob(prisma).runInTransaction(
      tx,
      REQUEST,
      new Date(),
    );
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    unlock();
    await expect(pending).resolves.toEqual({ tombstonesWritten: 3 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('never enters the target statement after a lock failure', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('lock failed'));
    const { prisma } = mockPrisma();
    await expect(
      new WidgetConversationErasureJob(prisma).runInTransaction(
        { $executeRaw: execute } as unknown as RequestTx,
        REQUEST,
        new Date(),
      ),
    ).rejects.toThrow('lock failed');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('selects drafts only through conversation-bound audit references, never their content', async () => {
    const { prisma, execute } = mockPrisma();
    await new WidgetConversationErasureJob(prisma).run(REQUEST);
    const sql = statementOf(execute);
    const scope = sql.slice(
      sql.indexOf('draft_targets AS'),
      sql.indexOf('erased_turns AS'),
    );
    expect(scope).toContain('SELECT 1 FROM record_scope r');
    expect(scope).toContain('r."confirmationOfKind" = \'draft\'');
    expect(scope).toContain('r."confirmationOfRef" = d."draftRef"');
    expect(scope).not.toContain('diffJson');
  });

  it('retains erased parent identity in scope so a retry can clear late children', async () => {
    const { prisma, execute } = mockPrisma();
    await new WidgetConversationErasureJob(prisma).run(REQUEST);
    const sql = statementOf(execute);
    for (const [scope, target] of [
      ['turn_scope', 'turn_targets'],
      ['emission_scope', 'emission_targets'],
      ['record_scope', 'record_targets'],
    ]) {
      const query = sql.slice(
        sql.indexOf(`${scope} AS`),
        sql.indexOf(`${target} AS`),
      );
      expect(query).not.toContain('"erasedAt" IS NULL');
    }
    expect(sql).toContain(
      'JOIN record_scope r ON r."intentTokenHash" = a."intentTokenHash"',
    );
    expect(sql).toContain(
      'JOIN record_scope i ON i."intentTokenHash" = r."intentTokenHash"',
    );
    expect(sql).toContain(
      'JOIN emission_scope e ON e."widgetId" = r."widgetId"',
    );
  });

  it.each([
    '5FF23CEC-82F8-4AC7-A355-85EE06B40452',
    '{5ff23cec-82f8-4ac7-a355-85ee06b40452}',
    'not-a-uuid',
  ])(
    'refuses UUID aliases before they can acquire a different lock: %s',
    async (conversationId) => {
      const { prisma, transaction } = mockPrisma();
      await expect(
        new WidgetConversationErasureJob(prisma).run({
          ...REQUEST,
          conversationId,
        }),
      ).rejects.toThrow('canonical UUID');
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
