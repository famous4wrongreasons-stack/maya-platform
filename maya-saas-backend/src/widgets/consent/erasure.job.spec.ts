import fs from 'node:fs';
import path from 'node:path';

import type { PrismaService } from '../../prisma/prisma.service';
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
  const transaction = jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
    work({ $executeRaw: execute }),
  );
  return {
    prisma: { $transaction: transaction } as unknown as PrismaService,
    execute,
    transaction,
  };
};

const statementOf = (execute: jest.Mock): string => {
  const [strings] = execute.mock.calls[0] as [
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

  it('RT6-ATOMIC-1 uses one statement under the exact Gate 9 lock and writes tombstones', async () => {
    const { prisma, execute, transaction } = mockPrisma(11);
    const job = new WidgetConversationErasureJob(prisma);
    const now = new Date('2026-09-23T09:00:00.000Z');

    await expect(job.run(REQUEST, now)).resolves.toEqual({
      tombstonesWritten: 11,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const sql = statementOf(execute);
    expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(?, 0))');
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
    expect(sql).toContain('"selectedLabels" = ARRAY[]::text[]');
  });

  it('RT6-SCOPE-1 carries exact tenant, conversation and subject qualifiers into the statement', async () => {
    const { prisma, execute } = mockPrisma();
    await new WidgetConversationErasureJob(prisma).run(REQUEST);
    const parameters = (
      execute.mock.calls[0] as unknown as readonly unknown[]
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
    expect(statementOf(execute).match(/"erasedAt" IS NULL/g)).toHaveLength(7);
  });
});
