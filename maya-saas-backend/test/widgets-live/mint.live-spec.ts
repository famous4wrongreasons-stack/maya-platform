// P-MINT — PostgreSQL proof of the closed Option-A mint pipeline.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { C9_REGISTRY_HASH } from '../../src/orchestration/c9.registry';
import type { WidgetComposerInput } from '../../src/widget-contract/envelope';
import type { PrincipalView } from '../../src/widgets/gate.types';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures } from './support/fixtures';

const input = (
  proposals: WidgetComposerInput['intent_proposals'],
): WidgetComposerInput => ({
  kind_proposal: 'METRIC',
  capability: 'c7.measurement.read',
  capability_version: C9_REGISTRY_HASH,
  source: { from: 'action_execution', execution_id: randomUUID() },
  correlation_refs: { turn_id: randomUUID() },
  origin: {
    trigger: 'system_reply',
    emitter: 'capability_read',
    moment_key: null,
    proactive_provenance: null,
  },
  facts: [],
  facts_origin: [],
  slots: {},
  limitation_codes: [],
  intent_proposals: proposals,
  locale: 'en',
});

describe('P-MINT — canonical writer [GW, PostgreSQL]', () => {
  let gw: GatewayHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;

  beforeAll(async () => {
    gw = await bootGateway();
    ctx = await bootFixtureContext();
    fx = new Fixtures(ctx, gw);
  });
  afterEach(async () => {
    if (fx) await fx.teardown();
    gw?.recorder.clear();
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  const setup = async (marker: string) => {
    const tenant = await fx.tenant(marker);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    await fx.staff(tenant, user, marker);
    const actor = await fx.actor(tenant, user);
    const proofHash = await fx.principalProofHash(actor);
    const conversationId = randomUUID();
    const turn = await gw.stores.appendTurn({
      tenantId: tenant.id,
      conversationId,
      turnIndex: 0,
      role: 'assistant',
      principalProofHash: proofHash,
      channel: 'pwa',
    });
    const principal: PrincipalView = {
      authority: {
        kind: 'USER',
        tenantId: tenant.id,
        userId: actor.userId,
        membershipId: actor.membershipId,
        clientId: null,
        channelLinkId: null,
        branchRefs: actor.branchId ? [actor.branchId] : [],
        staffRef: null,
        proofHash,
      },
      role: actor.role,
      presentationMode: 'staff',
      verificationLevel: 'SESSION_VERIFIED',
      proofHash,
    };
    return { tenant, conversationId, turn, proofHash, principal };
  };

  it('MINT-1/MINT-4/MINT-5 stores exact typed records, one receipt and a verifiable keyed seal', async () => {
    const s = await setup('P-MINT-1');
    const composerInput = input([
      {
        intent_template_key: 'refine.measurement.period@1',
        capability: { space: 'C9', key: 'c7.measurement.read' },
        role: 'primary',
      },
      {
        intent_template_key: 'control.dismiss@1',
        capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
        role: 'escape',
      },
    ]);
    const minted = await gw.emitter.emit({
      tenantId: s.tenant.id,
      conversationId: s.conversationId,
      turnId: s.turn.id,
      kind: 'METRIC',
      principalProofHash: s.proofHash,
      deliveryChannel: 'pwa',
      body: { metric: 'revenue', value: 42 },
      ttlSeconds: 600,
      freshnessClass: 'live',
      composerInput,
      principal: s.principal,
    });

    const records = await ctx.prisma.widgetIntentRecord.findMany({
      where: { tenantId: s.tenant.id, widgetId: minted.widgetId },
      orderBy: { priority: 'desc' },
    });
    const receipts = await ctx.prisma.widgetRenderReceipt.findMany({
      where: { tenantId: s.tenant.id, widgetId: minted.widgetId },
    });
    expect(records).toHaveLength(2);
    expect(receipts).toHaveLength(1);
    expect(records.find((r) => r.effect === 'REFINE')).toEqual(
      expect.objectContaining({
        capabilitySpace: 'C9',
        capabilityKey: 'c7.measurement.read',
        widgetKind: 'METRIC',
        selectionDomain: '{"period":["current","previous"]}',
        principalProofHash: s.proofHash,
      }),
    );
    expect(JSON.stringify(records)).not.toContain('readback_text');
    expect(await gw.emitter.verifySeal(s.tenant.id, minted.widgetId)).toBe(
      true,
    );
  });

  it('MINT-2 stores an emission and receipt for NONE but no token or record', async () => {
    const s = await setup('P-MINT-2');
    const minted = await gw.emitter.emit({
      tenantId: s.tenant.id,
      conversationId: s.conversationId,
      turnId: s.turn.id,
      kind: 'METRIC',
      principalProofHash: s.proofHash,
      deliveryChannel: 'pwa',
      body: { metric: 'none' },
      ttlSeconds: 600,
      freshnessClass: 'live',
      composerInput: input([
        { intent_template_key: 'none.passive@1', role: 'secondary' },
      ]),
      principal: s.principal,
    });
    expect(minted.intentTokens).toEqual([]);
    expect(
      await ctx.prisma.widgetIntentRecord.count({
        where: { tenantId: s.tenant.id, widgetId: minted.widgetId },
      }),
    ).toBe(0);
  });

  it('MINT-3 converts an actuating key to MG-P01 LIMITATION with no token or record', async () => {
    const s = await setup('P-MINT-3');
    const minted = await gw.emitter.emit({
      tenantId: s.tenant.id,
      conversationId: s.conversationId,
      turnId: s.turn.id,
      kind: 'METRIC',
      principalProofHash: s.proofHash,
      deliveryChannel: 'pwa',
      body: { hostile: 'not persisted' },
      ttlSeconds: 600,
      freshnessClass: 'live',
      composerInput: input([
        { intent_template_key: 'commit.blocked@1', role: 'primary' },
      ]),
      principal: s.principal,
    });
    expect(minted).toEqual(
      expect.objectContaining({ kind: 'LIMITATION', a2Limited: true }),
    );
    expect(
      await ctx.prisma.widgetIntentRecord.count({
        where: { tenantId: s.tenant.id, widgetId: minted.widgetId },
      }),
    ).toBe(0);
    const emission = await ctx.prisma.widgetEmission.findUniqueOrThrow({
      where: {
        widgetId_tenantId: {
          widgetId: minted.widgetId,
          tenantId: s.tenant.id,
        },
      },
      select: { bodyJson: true },
    });
    expect(emission.bodyJson).toEqual(
      expect.objectContaining({ capability_gap_ref: 'MG-P01' }),
    );
  });

  it('MINT-6 stores no interpolated label template for client-identified content', async () => {
    const s = await setup('P-MINT-6');
    const minted = await gw.emitter.emit({
      tenantId: s.tenant.id,
      conversationId: s.conversationId,
      turnId: s.turn.id,
      kind: 'METRIC',
      principalProofHash: s.proofHash,
      deliveryChannel: 'pwa',
      body: { client: 'not copied into routing content' },
      ttlSeconds: 600,
      freshnessClass: 'live',
      piiClass: 'client_identified',
      composerInput: input([
        {
          intent_template_key: 'refine.measurement.period@1',
          capability: { space: 'C9', key: 'c7.measurement.read' },
          role: 'primary',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ]),
      principal: s.principal,
    });
    const record = await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: s.tenant.id,
        widgetId: minted.widgetId,
        effect: 'REFINE',
      },
    });
    expect(record.utteranceTemplate).toBe('Change period');
    expect(record.selectionDomainLabelsJson).toBeNull();
  });

  it('MINT-8 links a same-turn, same-channel successor only from LIVE', async () => {
    const s = await setup('P-MINT-8');
    const predecessor = await gw.emitter.emit({
      tenantId: s.tenant.id,
      conversationId: s.conversationId,
      turnId: s.turn.id,
      kind: 'METRIC',
      principalProofHash: s.proofHash,
      deliveryChannel: 'pwa',
      body: { metric: 'predecessor' },
      ttlSeconds: 600,
      freshnessClass: 'live',
      composerInput: input([
        {
          intent_template_key: 'refine.measurement@1',
          capability: { space: 'C9', key: 'c7.measurement.read' },
          role: 'primary',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ]),
      principal: s.principal,
    });
    await ctx.prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: predecessor.widgetId,
          tenantId: s.tenant.id,
        },
      },
      data: {
        lifecycleState: 'LIVE',
        textEquivalentJson: { headline: 'Frozen', body: 'Frozen body' },
      },
    });

    const successor = await gw.successor.mint({
      tenantId: s.tenant.id,
      predecessorWidgetId: predecessor.widgetId,
      principal: s.principal,
    });
    expect(successor).not.toBeNull();
    const rows = await ctx.prisma.widgetEmission.findMany({
      where: {
        tenantId: s.tenant.id,
        widgetId: { in: [predecessor.widgetId, successor!.widgetId] },
      },
      orderBy: { issuedAt: 'asc' },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          widgetId: predecessor.widgetId,
          lifecycleState: 'SUPERSEDED',
          supersededByWidgetId: successor!.widgetId,
        }),
        expect.objectContaining({
          widgetId: successor!.widgetId,
          turnId: s.turn.id,
          deliveryChannel: 'pwa',
          supersedesWidgetId: predecessor.widgetId,
        }),
      ]),
    );

    const countBeforeRetry = await ctx.prisma.widgetEmission.count({
      where: { tenantId: s.tenant.id },
    });
    await expect(
      gw.successor.mint({
        tenantId: s.tenant.id,
        predecessorWidgetId: predecessor.widgetId,
        principal: s.principal,
      }),
    ).resolves.toBeNull();
    expect(
      await ctx.prisma.widgetEmission.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(countBeforeRetry);
  });
});
