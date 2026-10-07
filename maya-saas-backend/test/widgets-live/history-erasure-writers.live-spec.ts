// Synthetic owner-level PostgreSQL proof. No model/provider calls or AE dispatch.
import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { mintBookingCreateFactsRef } from '../../src/widgets/booking/booking-create-facts-ref';
import { WidgetConversationErasureJob } from '../../src/widgets/consent/erasure.job';
import type { MintRequest } from '../../src/widgets/emission/emitter.service';
import { TimelineStore } from '../../src/widgets/stores/timeline.store';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { closedFixtureComposerInput, Fixtures } from './support/fixtures';

const bounded = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          8_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

describe('history erasure — late store writers [synthetic PostgreSQL]', () => {
  let ctx: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(ctx, gw);
  });
  afterEach(async () => {
    await fx?.teardown();
    gw?.recorder.clear();
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  const setup = async (label: string) => {
    const tenant = await fx.tenant(label);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const principal = await fx.principalView(actor);
    const record = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    return { tenant, principal, record };
  };
  const erasureRequest = (built: Awaited<ReturnType<typeof setup>>) => ({
    tenantId: built.tenant.id,
    conversationId: built.record.conversationId,
    subjectPrincipalProofHash: built.principal.proofHash,
    erasureRequestRef: `writers-erase-${randomUUID()}`,
  });

  it('stores SQL NULL for a reference-only booking draft while preserving its retained facts witness', async () => {
    const built = await setup('history-writers-draft');
    const factsHash = 'b'.repeat(64);
    const draftRef = mintBookingCreateFactsRef(factsHash);
    const now = new Date();
    const row = await gw.stores.putDraft(
      {
        tenantId: built.tenant.id,
        draftRef,
        draftClass: 'task',
        ownerCapabilitySpace: 'C9',
        ownerCapabilityKey: 'c9.booking.propose',
        principalProofHash: built.principal.proofHash,
        diff: null,
        ttlSeconds: 900,
      },
      now,
    );
    const [stored] = await ctx.prisma.$queryRaw<
      Array<{
        sqlNull: boolean;
        draftRef: string;
        principalProofHash: string;
        expiresAt: Date;
      }>
    >`
      SELECT "diffJson" IS NULL AS "sqlNull", "draftRef", "principalProofHash", "expiresAt"
      FROM "WidgetDraft" WHERE "tenantId" = ${built.tenant.id} AND "id" = ${row.id}::uuid
    `;
    expect(stored).toEqual({
      sqlNull: true,
      draftRef,
      principalProofHash: built.principal.proofHash,
      expiresAt: new Date(now.getTime() + 900_000),
    });
    await expect(
      gw.stores.readBookingCreateFactsHash(
        built.tenant.id,
        draftRef,
        built.principal.proofHash,
        now,
      ),
    ).resolves.toBe(factsHash);
  });

  it('a C-bearing submission waiting on the observed erasure lock retains only A fields after erasure commits', async () => {
    const built = await setup('history-writers-submission');
    const job = new WidgetConversationErasureJob(ctx.prisma);
    let release!: () => void;
    let identify!: (pid: number) => void;
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<number>((resolve) => {
      identify = resolve;
    });
    const eraser = ctx.prisma.$transaction(
      async (tx) => {
        await TimelineStore.lockConversation(
          tx,
          built.tenant.id,
          built.record.conversationId,
        );
        const [{ pid }] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        identify(pid);
        await proceed;
        return job.runInTransaction(tx, erasureRequest(built), new Date());
      },
      { timeout: 15_000, isolationLevel: 'ReadCommitted' },
    );
    let writer:
      ReturnType<GatewayHarness['stores']['recordSubmission']> | undefined;
    try {
      const blockerPid = await bounded(
        Promise.race([
          locked,
          eraser.then(() => {
            throw new Error('eraser ended before writer lock observation');
          }),
        ]),
        'erasure lock',
      );
      const clientNonce = randomUUID();
      writer = gw.stores.recordSubmission({
        tenantId: built.tenant.id,
        widgetId: built.record.widgetId,
        intentTokenHash: built.record.intentTokenHash,
        clientNonce,
        profileId: 'synthetic-history-writers',
        readbackRef: 'synthetic-readback',
        readbackBodyHash: 'c'.repeat(64),
        inputsClosed: { period: ['current'] },
        readbackAffirmation: 'да',
        spokenTranscript: 'synthetic late affirmation',
      });
      // Attach failure observation immediately; no unhandled rejection if the
      // assertion fails while the real writer is still waiting on PostgreSQL.
      const finished = writer.then(
        () => {
          throw new Error('submission completed before its lock was observed');
        },
        (error: unknown) => {
          throw error;
        },
      );
      let stopObservation = false;
      const observeWaiting = async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (stopObservation) return false;
          const [row] = await ctx.prisma.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_locks
              WHERE locktype = 'advisory' AND NOT granted
                AND ${blockerPid} = ANY(pg_blocking_pids(pid))
            ) AS waiting
          `;
          if (row.waiting) return true;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(
          'submission never waited on the erasure conversation lock',
        );
      };
      const observation = observeWaiting();
      try {
        expect(
          await bounded(
            Promise.race([observation, finished]),
            'submission lock observation',
          ),
        ).toBe(true);
      } finally {
        stopObservation = true;
        await Promise.allSettled([observation]);
      }
      release();
      const [erased, saved] = await bounded(
        Promise.all([eraser, writer]),
        'erasure and late submission',
      );
      expect(erased.tombstonesWritten).toBeGreaterThanOrEqual(3);
      const row = await ctx.prisma.widgetIntentSubmissionAudit.findFirstOrThrow(
        {
          where: { tenantId: built.tenant.id, id: saved.id },
        },
      );
      expect(row).toMatchObject({
        widgetId: built.record.widgetId,
        intentTokenHash: built.record.intentTokenHash,
        clientNonce,
        profileId: 'synthetic-history-writers',
        readbackRef: 'synthetic-readback',
        readbackBodyHash: 'c'.repeat(64),
        inputsClosedJson: { period: ['current'] },
        inputsFreeTextJson: null,
        inputsPiiJson: null,
        readbackAffirmation: null,
        spokenTranscript: null,
      });
      expect(
        await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
          where: {
            tenantId: built.tenant.id,
            intentTokenHash: built.record.intentTokenHash,
          },
          select: { erasedAt: true },
        }),
      ).toMatchObject({ erasedAt: expect.any(Date) as unknown });
    } finally {
      release();
      await Promise.allSettled([eraser, ...(writer ? [writer] : [])]);
    }
  }, 60_000);

  it('keeps a late adjudication and AE reference after erasure without an utterance copy', async () => {
    const built = await setup('history-writers-receipt');
    // Storage-only synthetic eligibility, not evidence of admission/dispatch.
    await fx.synthetic(built.record, {
      effect: 'COMMIT',
      capabilitySpace: 'AE',
      capabilityKey: 'crm.appointment.create.v1',
    });
    await new WidgetConversationErasureJob(ctx.prisma).run(
      erasureRequest(built),
    );
    const receipt = await gw.stores.writeReceipt({
      tenantId: built.tenant.id,
      widgetId: built.record.widgetId,
      intentTokenHash: built.record.intentTokenHash,
      outcome: 'ACCEPTED',
      answeringChannel: 'pwa',
    });
    const actionReceiptRef = `synthetic-ae-reference-${randomUUID()}`;
    await expect(
      gw.stores.reconcileAcceptedReceipt({
        tenantId: built.tenant.id,
        intentTokenHash: built.record.intentTokenHash,
        actionReceiptRef,
      }),
    ).resolves.toBe(true);
    expect(
      await ctx.prisma.widgetIntentReceipt.findFirstOrThrow({
        where: { tenantId: built.tenant.id, id: receipt.id },
      }),
    ).toMatchObject({
      outcome: 'ACCEPTED',
      actionReceiptRef,
      utteranceEcho: null,
    });
    expect(
      await ctx.prisma.widgetEmission.findFirstOrThrow({
        where: { tenantId: built.tenant.id, widgetId: built.record.widgetId },
        select: { bodyJson: true, erasedAt: true },
      }),
    ).toMatchObject({ bodyJson: null, erasedAt: expect.any(Date) as unknown });
  });

  it('refuses generic append and assistant ensure after the same conversation was erased', async () => {
    const built = await setup('history-writers-turn');
    await new WidgetConversationErasureJob(ctx.prisma).run(
      erasureRequest(built),
    );
    const where = {
      tenantId: built.tenant.id,
      conversationId: built.record.conversationId,
    };
    const before = await ctx.prisma.widgetTimelineTurn.count({ where });
    const input = {
      ...where,
      turnIndex: 1,
      principalProofHash: built.principal.proofHash,
      channel: 'pwa',
      textContent: 'synthetic late reply',
    };
    await expect(
      gw.stores.appendTurn({ ...input, role: 'assistant' }),
    ).rejects.toThrow('conversation_scope_conflict');
    for (const turnIndex of [0, 1])
      await expect(
        gw.stores.ensureAssistantTurn({ ...input, turnIndex }),
      ).rejects.toThrow('conversation_scope_conflict');
    expect(await ctx.prisma.widgetTimelineTurn.count({ where })).toBe(before);
    expect(
      await ctx.prisma.widgetTimelineTurn.count({
        where: { ...where, textContent: { not: null } },
      }),
    ).toBe(0);
  });

  it('refuses a previously prepared emission request whose exact parent has been erased', async () => {
    const built = await setup('history-writers-emission');
    const request: MintRequest = {
      tenantId: built.tenant.id,
      conversationId: built.record.conversationId,
      turnId: built.record.turnId,
      kind: 'METRIC',
      principalProofHash: built.principal.proofHash,
      principal: built.principal,
      deliveryChannel: 'pwa',
      body: { value: 2 },
      ttlSeconds: 600,
      freshnessClass: 'live',
      composerInput: closedFixtureComposerInput({
        kind: 'METRIC',
        turnId: built.record.turnId,
        executionId: randomUUID(),
      }),
    };
    const where = { tenantId: built.tenant.id };
    const counts = async () =>
      Promise.all([
        ctx.prisma.widgetEmission.count({ where }),
        ctx.prisma.widgetIntentRecord.count({ where }),
        ctx.prisma.widgetRenderReceipt.count({ where }),
      ]);
    const before = await counts();
    await new WidgetConversationErasureJob(ctx.prisma).run(
      erasureRequest(built),
    );
    await expect(gw.emitter.emit(request)).rejects.toThrow(
      'emission_turn_unavailable',
    );
    expect(await counts()).toEqual(before);
    expect(
      await ctx.prisma.widgetEmission.count({
        where: { ...where, erasedAt: null },
      }),
    ).toBe(0);
  });
});
