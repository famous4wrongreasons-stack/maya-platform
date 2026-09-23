import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WidgetConversationErasureJob } from '../../src/widgets/consent/erasure.job';
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
    await ctx.prisma.widgetDraft.create({
      data: {
        tenantId,
        draftRef: `rt6-${randomUUID()}`,
        draftClass: 'task',
        ownerCapabilitySpace: 'AE',
        ownerCapabilityKey: 'appointments.own.create',
        principalProofHash: built.principalProofHash,
        diffJson: { note: 'erase me' },
        createdAt: startAt,
        expiresAt: new Date(startAt.getTime() + 600_000),
      },
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
});
