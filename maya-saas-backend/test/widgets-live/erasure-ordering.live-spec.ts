import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WidgetConversationErasureJob } from '../../src/widgets/consent/erasure.job';
import { TimelineStore } from '../../src/widgets/stores/timeline.store';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import {
  Fixtures,
  type TenantFixture,
  type WidgetFixture,
} from './support/fixtures';

const submission = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-rt6',
});

describe('P-RT6 — erasure ordering with Gate 9', () => {
  let ctx: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;
  const ownedTenantIds = new Set<string>();

  beforeAll(async () => {
    ctx = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(ctx, gw);
  });

  afterEach(async () => {
    for (const tenantId of ownedTenantIds) {
      const where = { tenantId };
      await ctx.prisma.clientConsentInvalidation.deleteMany({ where });
      await ctx.prisma.loyaltyTransaction.deleteMany({ where });
      await ctx.prisma.loyaltyAccount.deleteMany({ where });
      await ctx.prisma.appointment.deleteMany({ where });
    }
    await fx.teardown();
    ownedTenantIds.clear();
    gw.recorder.clear();
  });

  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  const record = async (
    label: string,
  ): Promise<{
    tenant: TenantFixture;
    actor: Readonly<AuthenticatedUser>;
    record: WidgetFixture;
    principalProofHash: string;
  }> => {
    const tenant = await fx.tenant(label);
    ownedTenantIds.add(tenant.id);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const principalProofHash = await fx.principalProofHash(actor);
    const minted = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    await ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: minted.intentTokenHash,
          tenantId: minted.tenantId,
        },
      },
      data: {
        utteranceTemplate: 'Покажи показатели',
        renderedUtterance: 'Покажи показатели',
        selectedLabels: ['Показатели'],
        selectionDomainLabelsJson: { metric: 'Показатели' },
        spokenTranscript: 'покажи показатели',
      },
    });
    return { tenant, actor, record: minted, principalProofHash };
  };

  const erase = (
    built: Awaited<ReturnType<typeof record>>,
    ref = `erase-${randomUUID()}`,
  ) =>
    new WidgetConversationErasureJob(ctx.prisma).run({
      tenantId: built.tenant.id,
      conversationId: built.record.conversationId,
      erasureRequestRef: ref,
      subjectPrincipalProofHash: built.principalProofHash,
    });

  it('RT6-1 [GW/PG] serialises erasure with lowering and never leaves a readable user turn', async () => {
    const built = await record('RT6-1');
    const [lowered, erased] = await Promise.all([
      gw.submit(built.actor, submission(built.record), 'RT6-1'),
      erase(built),
    ]);

    expect(
      lowered.stoppedAt === '13' ||
        (lowered.stoppedAt === '9' &&
          lowered.verdict.outcome === 'superseded' &&
          lowered.verdict.code === 'handle_stale'),
    ).toBe(true);
    expect(erased.tombstonesWritten).toBeGreaterThanOrEqual(3);
    const turns = await ctx.prisma.widgetTimelineTurn.findMany({
      where: {
        tenantId: built.tenant.id,
        conversationId: built.record.conversationId,
      },
      orderBy: { turnIndex: 'asc' },
      select: {
        role: true,
        textContent: true,
        spokenTranscript: true,
        erasedAt: true,
      },
    });
    expect(
      turns.every(
        (turn) =>
          turn.erasedAt !== null &&
          turn.textContent === null &&
          turn.spokenTranscript === null,
      ),
    ).toBe(true);
    if (lowered.stoppedAt === '9')
      expect(turns.filter((turn) => turn.role === 'user')).toHaveLength(0);
  }, 60_000);

  it('RT6-2 [PG] erases every C/X store field while canonical booking, consent and loyalty reads remain byte-identical', async () => {
    const built = await record('RT6-2');
    const tenantId = built.tenant.id;
    const user = await ctx.prisma.user.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });
    const client = await ctx.prisma.client.create({
      data: { tenantId, userId: user.id },
      select: { id: true },
    });
    const startAt = new Date('2026-09-23T10:00:00.000Z');
    const appointment = await ctx.prisma.appointment.create({
      data: {
        tenantId,
        clientId: user.id,
        mayaClientId: client.id,
        source: 'widgets-live-proof',
        staffExternalId: 'rt6-staff',
        serviceIds: ['rt6-service'],
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
        blockedStartAt: startAt,
        blockedEndAt: new Date(startAt.getTime() + 3_600_000),
        status: 'confirmed',
      },
      select: { id: true },
    });
    const loyalty = await ctx.prisma.loyaltyAccount.create({
      data: {
        tenantId,
        clientId: client.id,
        source: 'widgets-live-proof',
        balance: 25,
      },
      select: { id: true },
    });

    await ctx.prisma.widgetIntentSubmissionAudit.create({
      data: {
        tenantId,
        widgetId: built.record.widgetId,
        intentTokenHash: built.record.intentTokenHash,
        clientNonce: randomUUID(),
        profileId: 'widgets-live-rt6',
        receivedAt: startAt,
        inputsFreeTextJson: { note: 'erase me' },
        inputsPiiJson: { phone: '+70000000000' },
        readbackAffirmation: 'да',
        spokenTranscript: 'erase me',
      },
    });
    await ctx.prisma.widgetIntentReceipt.create({
      data: {
        tenantId,
        widgetId: built.record.widgetId,
        intentTokenHash: built.record.intentTokenHash,
        submittedAt: startAt,
        outcome: 'REFUSED',
        refusalCode: 'proof_only',
        answeringChannel: 'pwa',
        utteranceEcho: 'erase me',
      },
    });
    const draftRef = `rt6-${randomUUID()}`;
    await ctx.prisma.widgetDraft.create({
      data: {
        tenantId,
        draftRef,
        draftClass: 'task',
        ownerCapabilitySpace: 'AE',
        ownerCapabilityKey: 'appointments.own.create',
        principalProofHash: built.principalProofHash,
        diffJson: { note: 'erase me' },
        createdAt: startAt,
        expiresAt: new Date(startAt.getTime() + 600_000),
      },
    });
    // Synthetic retained linkage for the erasure fixture, not a minted COMMIT or authority.
    await ctx.prisma.widgetIntentRecord.updateMany({
      where: { tenantId, intentTokenHash: built.record.intentTokenHash },
      data: { confirmationOfKind: 'draft', confirmationOfRef: draftRef },
    });
    await ctx.prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: built.record.widgetId,
          tenantId,
        },
      },
      data: {
        textEquivalentJson: { text: 'erase me' },
        a11yJson: { label: 'erase me' },
        speechJson: { text: 'erase me' },
      },
    });

    const canonicalRead = () =>
      Promise.all([
        ctx.prisma.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        }),
        ctx.prisma.clientConsentFact.findMany({
          where: { tenantId },
          orderBy: { id: 'asc' },
        }),
        ctx.prisma.loyaltyAccount.findUniqueOrThrow({
          where: { id: loyalty.id },
        }),
      ]).then((rows) => JSON.stringify(rows));
    const before = await canonicalRead();
    const requestRef = `erase-${randomUUID()}`;
    const first = await erase(built, requestRef);
    const second = await erase(built, requestRef);

    expect(first.tombstonesWritten).toBe(7);
    expect(second.tombstonesWritten).toBe(0);
    expect(await canonicalRead()).toBe(before);
    expect(
      await ctx.prisma.widgetErasureTombstone.count({
        where: { tenantId, erasureRequestRef: requestRef },
      }),
    ).toBe(7);
    expect(
      await ctx.prisma.widgetErasureTombstone.groupBy({
        by: ['store'],
        where: { tenantId, erasureRequestRef: requestRef },
        _count: true,
        orderBy: { store: 'asc' },
      }),
    ).toEqual([
      { store: 'intent_audit', _count: 5 },
      { store: 'timeline', _count: 2 },
    ]);

    const [turn, emission, intent, audit, receipt, render, draft] =
      await Promise.all([
        ctx.prisma.widgetTimelineTurn.findFirstOrThrow({ where: { tenantId } }),
        ctx.prisma.widgetEmission.findFirstOrThrow({ where: { tenantId } }),
        ctx.prisma.widgetIntentRecord.findFirstOrThrow({ where: { tenantId } }),
        ctx.prisma.widgetIntentSubmissionAudit.findFirstOrThrow({
          where: { tenantId },
        }),
        ctx.prisma.widgetIntentReceipt.findFirstOrThrow({
          where: { tenantId },
        }),
        ctx.prisma.widgetRenderReceipt.findFirstOrThrow({
          where: { tenantId },
        }),
        ctx.prisma.widgetDraft.findFirstOrThrow({ where: { tenantId } }),
      ]);
    expect({
      turn: [turn.textContent, turn.spokenTranscript],
      emission: [
        emission.bodyJson,
        emission.textEquivalentJson,
        emission.a11yJson,
        emission.speechJson,
      ],
      intent: [
        intent.utteranceTemplate,
        intent.renderedUtterance,
        intent.selectedLabels,
        intent.selectionDomainLabelsJson,
        intent.spokenTranscript,
      ],
      audit: [
        audit.inputsFreeTextJson,
        audit.inputsPiiJson,
        audit.readbackAffirmation,
        audit.spokenTranscript,
      ],
      receipt: receipt.utteranceEcho,
      render: [render.composedEnvelopeJson, render.emittedEnvelopeJson],
      draft: draft.diffJson,
    }).toEqual({
      turn: [null, null],
      emission: [null, null, null, null],
      intent: [null, null, [], null, null],
      audit: [null, null, null, null],
      receipt: null,
      render: [null, null],
      draft: null,
    });

    await ctx.prisma.appointment.delete({ where: { id: appointment.id } });
    await ctx.prisma.loyaltyAccount.delete({ where: { id: loyalty.id } });
    await ctx.prisma.client.delete({ where: { id: client.id } });
  }, 60_000);

  it('RT6-3 [GW/PG] an erased predecessor yields code alone until P-G15b', async () => {
    const built = await record('RT6-3');
    await erase(built);

    const result = await gw.submit(
      built.actor,
      submission(built.record),
      'RT6-3',
    );
    expect(result).toMatchObject({
      stoppedAt: '9',
      verdict: { outcome: 'superseded', code: 'handle_stale' },
    });
    expect(result).not.toHaveProperty('nextEnvelope');
  }, 60_000);

  it('RT6-4 [PG] preserves sibling, foreign-principal, foreign-tenant and unlinked drafts', async () => {
    const built = await record('RT6-4');
    const sibling = await fx.widget({
      tenant: built.tenant,
      actor: built.actor,
      kind: 'METRIC',
      body: { value: 2 },
    });
    const foreignUser = await fx.user(built.tenant, UserRole.ADMINISTRATOR);
    const foreignActor = await fx.actor(built.tenant, foreignUser);
    const foreignProof = await fx.principalProofHash(foreignActor);
    const foreign = await record('RT6-4-foreign');
    const create = async (
      tenantId: string,
      proof: string,
      widget: WidgetFixture | null,
    ) => {
      const draftRef = `rt6-${randomUUID()}`;
      const row = await ctx.prisma.widgetDraft.create({
        data: {
          tenantId,
          draftRef,
          draftClass: 'task',
          ownerCapabilitySpace: 'C9',
          ownerCapabilityKey: 'c9.booking.propose',
          principalProofHash: proof,
          diffJson: { note: 'synthetic scoped draft' },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      if (widget)
        await ctx.prisma.widgetIntentRecord.updateMany({
          where: { tenantId, intentTokenHash: widget.intentTokenHash },
          data: { confirmationOfKind: 'draft', confirmationOfRef: draftRef },
        });
      return row;
    };
    const target = await create(
      built.tenant.id,
      built.principalProofHash,
      built.record,
    );
    const foreignDraftLink = await fx.widget({
      tenant: built.tenant,
      actor: built.actor,
      kind: 'METRIC',
      body: { value: 3 },
    });
    // Synthetic cross-principal reference inside the target scope. This makes the draft's
    // own principal predicate load-bearing, independently of the record-scope predicate.
    await ctx.prisma.widgetTimelineTurn.update({
      where: { id: foreignDraftLink.turnId },
      data: { conversationId: built.record.conversationId, turnIndex: 99 },
    });
    const retained = [
      await create(built.tenant.id, built.principalProofHash, sibling),
      await create(built.tenant.id, foreignProof, foreignDraftLink),
      await create(
        foreign.tenant.id,
        foreign.principalProofHash,
        foreign.record,
      ),
      await create(built.tenant.id, built.principalProofHash, null),
    ];
    await erase(built);
    expect(
      await ctx.prisma.widgetDraft.findUniqueOrThrow({
        where: { id: target.id },
      }),
    ).toMatchObject({
      diffJson: null,
      erasedAt: expect.any(Date),
    });
    for (const row of retained)
      expect(
        await ctx.prisma.widgetDraft.findUniqueOrThrow({
          where: { id: row.id },
        }),
      ).toEqual(row);
    expect(
      await ctx.prisma.widgetTimelineTurn.findUniqueOrThrow({
        where: { id: sibling.turnId },
      }),
    ).toMatchObject({ erasedAt: null });
  }, 60_000);

  it('RT6-5 [PG] retry clears a late child through erased parent identity without repeating tombstones', async () => {
    const built = await record('RT6-5');
    const ref = `erase-${randomUUID()}`;
    await erase(built, ref);
    // Deliberately simulate a writer which has not yet joined the erasure lock protocol.
    const receipt = await ctx.prisma.widgetIntentReceipt.create({
      data: {
        tenantId: built.tenant.id,
        widgetId: built.record.widgetId,
        intentTokenHash: built.record.intentTokenHash,
        submittedAt: new Date(),
        outcome: 'REFUSED',
        refusalCode: 'proof_only',
        answeringChannel: 'pwa',
        utteranceEcho: 'synthetic late content',
      },
    });
    expect(await erase(built, ref)).toEqual({ tombstonesWritten: 1 });
    expect(await erase(built, ref)).toEqual({ tombstonesWritten: 0 });
    expect(
      await ctx.prisma.widgetIntentReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      }),
    ).toMatchObject({
      utteranceEcho: null,
      erasedAt: expect.any(Date),
      refusalCode: 'proof_only',
    });
  }, 60_000);

  it('RT6-6 [PG] takes a fresh snapshot after waiting for a held writer lock', async () => {
    const built = await record('RT6-6');
    let release!: () => void;
    let acquired!: () => void;
    let identify!: (pid: number) => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const backend = new Promise<number>((resolve) => {
      identify = resolve;
    });
    const writer = ctx.prisma.$transaction(
      async (tx) => {
        await TimelineStore.lockConversation(
          tx,
          built.tenant.id,
          built.record.conversationId,
        );
        const row = await TimelineStore.appendUserTurn(
          {
            tenantId: built.tenant.id,
            conversationId: built.record.conversationId,
            principalProofHash: built.principalProofHash,
            channel: 'pwa',
            textContent: 'synthetic concurrent turn',
          },
          tx,
        );
        acquired();
        await held;
        return row;
      },
      { timeout: 15_000, isolationLevel: 'ReadCommitted' },
    );
    await Promise.race([
      locked,
      writer.then(() => {
        throw new Error('writer ended before lock barrier');
      }),
    ]);
    const job = new WidgetConversationErasureJob(ctx.prisma);
    const eraser = ctx.prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        identify(pid);
        return job.runInTransaction(
          tx,
          {
            tenantId: built.tenant.id,
            conversationId: built.record.conversationId,
            subjectPrincipalProofHash: built.principalProofHash,
            erasureRequestRef: `erase-${randomUUID()}`,
          },
          new Date(),
        );
      },
      { timeout: 15_000, isolationLevel: 'ReadCommitted' },
    );
    try {
      const pid = await Promise.race([
        backend,
        eraser.then(() => {
          throw new Error('eraser ended before lock barrier');
        }),
      ]);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await ctx.prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = ${pid} AND locktype = 'advisory' AND NOT granted) AS waiting
        `;
        if (rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      release();
      const [row] = await Promise.all([writer, eraser]);
      expect(
        await ctx.prisma.widgetTimelineTurn.findUniqueOrThrow({
          where: { id: row.id },
        }),
      ).toMatchObject({
        textContent: null,
        erasedAt: expect.any(Date),
      });
    } finally {
      release();
      await Promise.allSettled([writer, eraser]);
    }
  }, 60_000);
});
