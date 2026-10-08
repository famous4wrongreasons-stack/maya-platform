import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrincipalResolver, RequestTx } from '../authority/principal-view';
import type { PrincipalView } from '../gate.types';
import { timelineLockKey } from '../stores/timeline.store';
import type { ConversationErasureRequest } from './erasure.job';
import { WidgetConversationErasureJob } from './erasure.job';
import { HistoryErasureOwner } from './history-erasure.owner';

const CONVERSATION = '5ff23cec-82f8-4ac7-a355-85ee06b40452';
const OTHER_CONVERSATION = '8536f753-9a2d-4485-8cfa-f908df4da3a7';
const REQUEST = 'afacbe78-0b7c-4911-9207-b8f2fd86191d';
const OTHER_REQUEST = '5db9e6a0-1100-4914-9d9d-faf7af60a3fd';
const NOW = new Date('2026-10-07T12:00:00.000Z');
const ACTOR = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  sessionId: 'session-a',
} as AuthenticatedUser;
const PRINCIPAL: PrincipalView = {
  authority: {
    kind: 'USER',
    tenantId: ACTOR.tenantId!,
    userId: ACTOR.userId,
    membershipId: 'membership-a',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'b'.repeat(64),
  },
  role: 'tenant_owner',
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'a'.repeat(64),
};

type Turn = {
  id: string;
  tenantId: string;
  conversationId: string;
  principalProofHash: string;
  erasedAt: Date | null;
  retentionUntil: Date;
};
type Tombstone = {
  tenantId: string;
  erasureRequestRef: string;
  erasedAt: Date;
  store: string;
  rowKey: string;
};

/** Synthetic persistence/lock ordering only. Real PG/HTTP qualification is separate. */
const fixture = () => {
  const turns: Turn[] = [CONVERSATION, OTHER_CONVERSATION].map(
    (conversationId, i) => ({
      id: `turn-${i}`,
      tenantId: ACTOR.tenantId!,
      conversationId,
      principalProofHash: PRINCIPAL.proofHash,
      erasedAt: null,
      retentionUntil: new Date('2027-01-01T00:00:00.000Z'),
    }),
  );
  const tombstones: Tombstone[] = [];
  const state = {
    now: NOW,
    principal: PRINCIPAL as PrincipalView | null,
    orphan: false,
    missingTurnTombstone: false,
  };
  const trace: string[] = [];
  const statements: { sql: string; values: unknown[] }[] = [];
  const lockTails = new Map<string, Promise<void>>();
  let transactionNumber = 0;
  const job = jest.fn(
    (tx: RequestTx, request: ConversationErasureRequest, now: Date) => {
      void tx;
      trace.push('job');
      const targets = turns.filter(
        (t) =>
          t.tenantId === request.tenantId &&
          t.conversationId === request.conversationId &&
          t.principalProofHash === request.subjectPrincipalProofHash &&
          t.erasedAt === null,
      );
      for (const turn of targets) {
        turn.erasedAt = now;
        tombstones.push({
          tenantId: request.tenantId,
          erasureRequestRef: request.erasureRequestRef,
          erasedAt: now,
          store: state.missingTurnTombstone ? 'intent_audit' : 'timeline',
          rowKey: state.missingTurnTombstone
            ? 'WidgetIntentRecord/other'
            : `WidgetTimelineTurn/${turn.id}`,
        });
      }
      return Promise.resolve({ tombstonesWritten: targets.length });
    },
  );
  const resolve = jest.fn((tx: RequestTx) => {
    void tx;
    trace.push('principal');
    return Promise.resolve(state.principal);
  });
  const findLive = jest.fn(({ where }: { where: Record<string, unknown> }) => {
    trace.push('live');
    return Promise.resolve(
      turns.find(
        (t) =>
          t.tenantId === where.tenantId &&
          t.conversationId === where.conversationId &&
          t.principalProofHash === where.principalProofHash &&
          t.erasedAt === null &&
          t.retentionUntil > (where.retentionUntil as { gt: Date }).gt,
      ) ?? null,
    );
  });
  const findCompleted = jest.fn(
    ({ where }: { where: Record<string, unknown> }) => {
      trace.push('completed');
      return Promise.resolve(
        tombstones.find((t) =>
          Object.entries(where).every(
            ([key, value]) => t[key as keyof Tombstone] === value,
          ),
        ) ?? null,
      );
    },
  );
  const transaction = jest.fn(
    async (work: (tx: RequestTx) => Promise<unknown>) => {
      const sequence = ++transactionNumber;
      const unlock: (() => void)[] = [];
      const held = new Set<string>();
      const tx = {
        $executeRaw: jest.fn(
          async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const key = values[0] as string;
            statements.push({ sql: strings.join('?'), values });
            if (!held.has(key)) {
              const previous = lockTails.get(key) ?? Promise.resolve();
              let release!: () => void;
              const tail = new Promise<void>((done) => {
                release = done;
              });
              lockTails.set(key, tail);
              await previous;
              held.add(key);
              unlock.push(() => {
                release();
                if (lockTails.get(key) === tail) lockTails.delete(key);
              });
            }
            trace.push(
              `${sequence}:${key.startsWith('maya.privacy.') ? 'request-lock' : 'conversation-lock'}`,
            );
            return 1;
          },
        ),
        $queryRaw: jest.fn(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?');
            statements.push({ sql, values });
            if (sql.includes('clock_timestamp()')) {
              trace.push('clock');
              return Promise.resolve([{ now: state.now }]);
            }
            if (sql.includes('FROM "WidgetErasureTombstone"')) {
              trace.push('replay');
              const prefix = (values[1] as string).slice(0, -1);
              const grouped = new Map<string, Date>();
              for (const row of tombstones) {
                if (
                  row.tenantId !== values[0] ||
                  !row.erasureRequestRef.startsWith(prefix)
                )
                  continue;
                if (
                  row.store !== 'timeline' ||
                  !row.rowKey.startsWith('WidgetTimelineTurn/')
                )
                  continue;
                const original = grouped.get(row.erasureRequestRef);
                if (!original || original > row.erasedAt)
                  grouped.set(row.erasureRequestRef, row.erasedAt);
              }
              return Promise.resolve(
                [...grouped]
                  .slice(0, 2)
                  .map(([erasureRequestRef, erasedAt]) => ({
                    erasureRequestRef,
                    erasedAt,
                  })),
              );
            }
            if (sql.includes('FROM "WidgetDraft"')) {
              trace.push('orphan');
              return Promise.resolve([{ hasUnlinkedContent: state.orphan }]);
            }
            throw new Error('unexpected synthetic query');
          },
        ),
        widgetTimelineTurn: { findFirst: findLive },
        widgetErasureTombstone: { findFirst: findCompleted },
      } as unknown as RequestTx;
      try {
        return await work(tx);
      } finally {
        for (const release of unlock.reverse()) release();
      }
    },
  );
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const principalResolver: PrincipalResolver = { resolve };
  const repair = jest.fn().mockResolvedValue(0);
  const erasure = {
    runInTransaction: job,
    repairRetainedTerminalContent: repair,
  } as unknown as WidgetConversationErasureJob;
  const makeOwner = () =>
    new HistoryErasureOwner(prisma, principalResolver, erasure);
  return {
    owner: makeOwner(),
    makeOwner,
    state,
    turns,
    tombstones,
    trace,
    statements,
    job,
    repair,
    resolve,
    transaction,
    findLive,
    findCompleted,
  };
};

describe('K12 authenticated history erasure owner — synthetic mechanics', () => {
  it('repairs only the completed exact request and keeps the original turn completion despite clock rollback', async () => {
    const f = fixture();
    const first = await f.owner.erase(ACTOR, CONVERSATION, {
      requestId: REQUEST,
    });
    const ref = f.tombstones[0].erasureRequestRef;
    f.tombstones.push({
      tenantId: ACTOR.tenantId!,
      erasureRequestRef: ref,
      erasedAt: new Date(NOW.getTime() - 1000),
      store: 'timeline',
      rowKey: 'WidgetEmission/legacy',
    });
    f.state.now = new Date(NOW.getTime() - 2000);
    expect(
      await f.makeOwner().erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).toEqual(first);
    expect(f.job).toHaveBeenCalledTimes(1);
    expect(f.repair).toHaveBeenCalledWith(
      expect.anything(),
      {
        tenantId: ACTOR.tenantId,
        conversationId: CONVERSATION,
        subjectPrincipalProofHash: PRINCIPAL.proofHash,
        erasureRequestRef: ref,
      },
      f.state.now,
    );
    expect(
      f.statements.some(
        ({ sql }) =>
          sql.includes('MIN("erasedAt") FILTER') &&
          sql.includes("'WidgetTimelineTurn/%'"),
      ),
    ).toBe(true);
  });

  it('first confirmation uses one ReadCommitted transaction, ordered locks, DB clock and an actual turn tombstone', async () => {
    const f = fixture();
    const result = await f.owner.erase(ACTOR, CONVERSATION, {
      requestId: REQUEST,
    });
    expect(result).toEqual({
      contract: 'maya.privacy.history-erasure/1',
      outcome: 'COMPLETED',
      requestId: REQUEST,
      conversationId: CONVERSATION,
      erasedAt: NOW.toISOString(),
    });
    expect(f.trace).toEqual([
      '1:request-lock',
      'principal',
      '1:conversation-lock',
      'principal',
      'clock',
      'replay',
      'live',
      'orphan',
      'job',
      'completed',
    ]);
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    expect(f.resolve.mock.calls[0][0]).toBe(f.job.mock.calls[0][0]);
    expect(f.job.mock.calls[0][1]).toMatchObject({
      tenantId: ACTOR.tenantId,
      conversationId: CONVERSATION,
      subjectPrincipalProofHash: PRINCIPAL.proofHash,
    });
    expect(f.job.mock.calls[0][1].erasureRequestRef).toMatch(
      /^maya\.privacy\.history-erasure\/1:[0-9a-f]{64}:[0-9a-f]{64}$/,
    );
    expect(f.job.mock.calls[0][2]).toEqual(NOW);
    expect(f.findCompleted).toHaveBeenCalledTimes(1);
    expect(f.findCompleted.mock.calls[0][0].where).toMatchObject({
      tenantId: ACTOR.tenantId,
      erasureRequestRef: f.job.mock.calls[0][1].erasureRequestRef,
      store: 'timeline',
      rowKey: 'WidgetTimelineTurn/turn-0',
    });
    expect(f.statements[1].values).toEqual([
      timelineLockKey(ACTOR.tenantId!, CONVERSATION),
    ]);
  });

  it('normalizes UUID aliases in both lock identities and replay', async () => {
    const f = fixture();
    const first = await f.owner.erase(ACTOR, CONVERSATION.toUpperCase(), {
      requestId: REQUEST.toUpperCase(),
    });
    expect(
      await f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).toEqual(first);
    expect(f.job).toHaveBeenCalledTimes(1);
    expect(f.resolve).toHaveBeenCalledTimes(4);
  });

  it('a new owner instance replays original persisted time without live/content reads or another erase', async () => {
    const f = fixture();
    const first = await f.owner.erase(ACTOR, CONVERSATION, {
      requestId: REQUEST,
    });
    f.state.now = new Date('2027-02-01T00:00:00.000Z');
    f.state.orphan = true;
    f.findLive.mockClear();
    f.trace.length = 0;
    expect(
      await f.makeOwner().erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).toEqual(first);
    expect(f.resolve).toHaveBeenCalledTimes(4);
    expect(f.job).toHaveBeenCalledTimes(1);
    expect(f.findLive).not.toHaveBeenCalled();
    expect(f.trace).not.toContain('orphan');
  });

  it('concurrent same-request confirmations serialize and invoke the job once', async () => {
    const f = fixture();
    const results = await Promise.all([
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
      f.makeOwner().erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(f.job).toHaveBeenCalledTimes(1);
    expect(f.resolve).toHaveBeenCalledTimes(4);
    expect(f.trace.indexOf('2:request-lock')).toBeGreaterThan(
      f.trace.indexOf('completed'),
    );
  });

  it('concurrent same request for a different conversation cannot erase both scopes', async () => {
    const f = fixture();
    const results = await Promise.allSettled([
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
      f.owner.erase(ACTOR, OTHER_CONVERSATION, { requestId: REQUEST }),
    ]);
    expect(results.map((x) => x.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(f.job).toHaveBeenCalledTimes(1);
    expect(f.turns[1].erasedAt).toBeNull();
  });

  it('rechecks revocation before replay and rejects a changed current proof', async () => {
    const f = fixture();
    await f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST });
    f.state.principal = null;
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.state.principal = { ...PRINCIPAL, proofHash: 'c'.repeat(64) };
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.job).toHaveBeenCalledTimes(1);
  });

  it.each(['revoked', 'changed-proof'])(
    'refuses %s authority observed after the conversation-lock wait',
    async (kind) => {
      const f = fixture();
      f.resolve
        .mockResolvedValueOnce(PRINCIPAL)
        .mockResolvedValueOnce(
          kind === 'revoked'
            ? null
            : { ...PRINCIPAL, proofHash: 'c'.repeat(64) },
        );
      await expect(
        f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.resolve).toHaveBeenCalledTimes(2);
      expect(f.trace).toContain('1:conversation-lock');
      expect(f.trace).not.toContain('clock');
      expect(f.findLive).not.toHaveBeenCalled();
      expect(f.job).not.toHaveBeenCalled();
      expect(f.tombstones).toHaveLength(0);
    },
  );

  it('does not hide a conflicting distinct ref behind many tombstones of the valid ref', async () => {
    const f = fixture();
    await f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST });
    const original = f.tombstones[0];
    f.tombstones.push(...Array.from({ length: 8 }, () => ({ ...original })));
    f.tombstones.push({
      ...original,
      erasureRequestRef:
        original.erasureRequestRef.slice(0, -64) + 'f'.repeat(64),
    });
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).rejects.toBeInstanceOf(ConflictException);
    const replaySql = f.statements.find((x) =>
      x.sql.includes('FROM "WidgetErasureTombstone"'),
    )!.sql;
    expect(replaySql).toContain('GROUP BY "erasureRequestRef"');
    expect(f.job).toHaveBeenCalledTimes(1);
  });

  it.each([
    'foreign-tenant',
    'foreign-principal',
    'unknown',
    'expired',
    'erased',
  ])(
    'first %s conversation has the same non-disclosing 404 and no job',
    async (kind) => {
      const f = fixture();
      if (kind === 'foreign-tenant') f.turns[0].tenantId = 'tenant-b';
      if (kind === 'foreign-principal')
        f.turns[0].principalProofHash = 'c'.repeat(64);
      if (kind === 'unknown') f.turns.splice(0, 1);
      if (kind === 'expired') f.turns[0].retentionUntil = NOW;
      if (kind === 'erased') f.turns[0].erasedAt = NOW;
      await expect(
        f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
      ).rejects.toThrow(
        new NotFoundException('history_erasure_conversation_unavailable'),
      );
      expect(f.job).not.toHaveBeenCalled();
    },
  );

  it('a fresh request cannot turn an already erased conversation into zero-write success', async () => {
    const f = fixture();
    await f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST });
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: OTHER_REQUEST }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.job).toHaveBeenCalledTimes(1);
  });

  it('first confirmation refuses content-bearing legacy orphans; query uses exact subject and retained provenance', async () => {
    const f = fixture();
    f.state.orphan = true;
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).rejects.toThrow('history_erasure_unlinked_draft_content');
    expect(f.job).not.toHaveBeenCalled();
    expect(f.turns[0].erasedAt).toBeNull();
    const query = f.statements.find((x) =>
      x.sql.includes('FROM "WidgetDraft"'),
    )!;
    expect(query.values).toEqual([ACTOR.tenantId, PRINCIPAL.proofHash]);
    expect(query.sql).toContain('JOIN "WidgetTimelineTurn"');
    expect(query.sql).toContain(
      't."principalProofHash" = d."principalProofHash"',
    );
    expect(query.sql).not.toContain('expiresAt');
    expect(query.sql).not.toContain('consumedAt');
    expect(query.sql).not.toContain('conversationId');
  });

  it.each([0, -1])(
    'refuses an impossible changed-row count %s',
    async (count) => {
      const f = fixture();
      f.job.mockResolvedValueOnce({ tombstonesWritten: count });
      await expect(
        f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    },
  );

  it('positive generic row count without an exact changed-turn tombstone is not success', async () => {
    const f = fixture();
    f.state.missingTurnTombstone = true;
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it.each(['tenant', 'user', 'floor', 'channel'])(
    'refuses a mismatching resolved %s authority',
    async (kind) => {
      const f = fixture();
      f.state.principal = {
        ...PRINCIPAL,
        ...(kind === 'floor'
          ? { verificationLevel: 'BOUND_CLIENT' as const }
          : {}),
        authority: {
          ...PRINCIPAL.authority,
          ...(kind === 'tenant' ? { tenantId: 'tenant-b' } : {}),
          ...(kind === 'user' ? { userId: 'user-b' } : {}),
          ...(kind === 'channel' ? { kind: 'CLIENT_CHANNEL' as const } : {}),
        },
      };
      await expect(
        f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.job).not.toHaveBeenCalled();
      expect(f.findLive).not.toHaveBeenCalled();
    },
  );

  it('refuses a missing session before a transaction and propagates resolver/store faults', async () => {
    const f = fixture();
    await expect(
      f.owner.erase({ ...ACTOR, sessionId: '' }, CONVERSATION, {
        requestId: REQUEST,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.transaction).not.toHaveBeenCalled();
    f.resolve.mockRejectedValueOnce(new Error('db-fault'));
    await expect(
      f.owner.erase(ACTOR, CONVERSATION, { requestId: REQUEST }),
    ).rejects.toThrow('db-fault');
    expect(f.job).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { requestId: 'bad' },
    { requestId: REQUEST, tenantId: 'tenant-b' },
    { requestId: REQUEST, principalProofHash: 'c'.repeat(64) },
    { requestId: REQUEST, erasedAt: NOW },
  ])(
    'refuses malformed or authority-bearing input %j before storage',
    async (body) => {
      const f = fixture();
      await expect(
        f.owner.erase(ACTOR, CONVERSATION, body),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );
});
