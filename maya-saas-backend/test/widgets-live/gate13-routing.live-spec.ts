// U13a — the Gate 13 router over the real PostgreSQL widget stores.
//
// The direct router cases are U proofs: every claim, receipt and dismiss is made by production code
// against the proof database. The gateway case remains [XF→U10b], exactly as the recovered unit card
// requires: Gate 10 still fails closed before a submission can reach the router.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { ControlRegistryService } from '../../src/widgets/control/control-registry.service';
import type { PrincipalView } from '../../src/widgets/gate.types';
import {
  ctx as gateContext,
  rec,
} from '../../src/widgets/gates/gate-fixtures.spec-helper.spec';
import { EffectRouterService } from '../../src/widgets/routing/effect-router.service';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { SealService } from '../../src/widgets/emission/seal.service';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures } from './support/fixtures';

describe('Gate 13 — PostgreSQL claim, receipt and CONTROL routing (U13a)', () => {
  let db: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;
  let router: EffectRouterService;

  beforeAll(async () => {
    db = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(db, gw);
    router = gw.moduleRef.get(EffectRouterService);
  });

  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
  });

  afterAll(async () => {
    await gw?.close();
    await db?.close();
  });

  const control = async (label: string) => {
    const tenant = await fx.tenant(label);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const widget = await fx.widget({
      tenant,
      actor,
      kind: 'LIMITATION',
      body: { control: 'dismiss' },
    });
    await fx.synthetic(widget, {
      effect: 'CONTROL',
      capabilitySpace: 'CONTROL',
      capabilityKey: 'control.widget.dismiss',
      singleUse: true,
    });
    // `[synthetic record]`: the pre-P-MINT fixture stops at MINTED; U13a's dismiss contract is
    // specifically LIVE → CANCELLED, so the proof promotes only presentation lifecycle state.
    await db.prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          tenantId: tenant.id,
          widgetId: widget.widgetId,
        },
      },
      data: { lifecycleState: 'LIVE' },
    });
    const stored = await db.prisma.widgetIntentRecord.findUniqueOrThrow({
      where: {
        intentTokenHash_tenantId: {
          tenantId: tenant.id,
          intentTokenHash: widget.intentTokenHash,
        },
      },
      select: { principalProofHash: true },
    });
    const principal: PrincipalView = {
      authority: {
        kind: 'USER',
        tenantId: tenant.id,
        userId: user.id,
        membershipId: actor.membershipId,
        clientId: null,
        channelLinkId: null,
        branchRefs: [],
        staffRef: null,
        proofHash: stored.principalProofHash,
      },
      role: 'administrator',
      presentationMode: 'owner',
      verificationLevel: 'SESSION_VERIFIED',
      proofHash: stored.principalProofHash,
    };
    const context = gateContext(
      rec({
        tenantId: tenant.id,
        widgetId: widget.widgetId,
        intentTokenHash: widget.intentTokenHash,
        widgetKind: 'LIMITATION',
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
        principalProofHash: stored.principalProofHash,
      }),
      {
        tenantId: tenant.id,
        actor,
        principal,
        principalProofHash: stored.principalProofHash,
        now: new Date('2026-09-20T00:00:00.000Z'),
      },
    );
    return { tenant, user, actor, widget, principal, context };
  };

  it('G13-R5/N06/N10 [U] claims the exact record, cancels the live widget and writes one echo-free B-29 receipt', async () => {
    const built = await control('G13-R5');
    await expect(router.route(built.context)).resolves.toMatchObject({
      outcome: 'terminate',
      route: {
        receipt_outcome: 'ACCEPTED',
        resolved_widget: { control: 'dismissed' },
      },
    });

    const [record, emission, receipts] = await Promise.all([
      db.prisma.widgetIntentRecord.findUniqueOrThrow({
        where: {
          intentTokenHash_tenantId: {
            tenantId: built.tenant.id,
            intentTokenHash: built.widget.intentTokenHash,
          },
        },
        select: { consumedAt: true },
      }),
      db.prisma.widgetEmission.findUniqueOrThrow({
        where: {
          widgetId_tenantId: {
            tenantId: built.tenant.id,
            widgetId: built.widget.widgetId,
          },
        },
        select: { lifecycleState: true, deliveryStateJson: true },
      }),
      db.prisma.widgetIntentReceipt.findMany({
        where: {
          tenantId: built.tenant.id,
          intentTokenHash: built.widget.intentTokenHash,
        },
      }),
    ]);
    expect(record.consumedAt).toEqual(built.context.now);
    expect(emission).toEqual({
      lifecycleState: 'CANCELLED',
      deliveryStateJson: {
        state: 'cancelled',
        at: built.context.now.toISOString(),
      },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      outcome: 'ACCEPTED',
      refusalCode: null,
      actionReceiptRef: null,
      utteranceEcho: null,
    });
  }, 60_000);

  it('G1-d/AMB-54 [U] concurrent single-use routing has one winner, one expired result and one receipt', async () => {
    const built = await control('AMB-54');
    const outcomes = await Promise.all([
      router.route(built.context),
      router.route(built.context),
    ]);
    expect(outcomes.map((v) => v.outcome).sort()).toEqual([
      'expired',
      'terminate',
    ]);
    expect(
      await db.prisma.widgetIntentReceipt.count({
        where: {
          tenantId: built.tenant.id,
          intentTokenHash: built.widget.intentTokenHash,
        },
      }),
    ).toBe(1);
  }, 60_000);

  it('N-CTRL-FOREIGN-P/T [U] a foreign principal or tenant receives the same neutral refusal and cannot mutate the target widget', async () => {
    const foreignPrincipal = await control('N-CTRL-FOREIGN-P');
    const otherTenant = await fx.tenant('N-CTRL-FOREIGN-T');

    const foreignByPrincipal = gateContext(foreignPrincipal.context.record!, {
      ...foreignPrincipal.context,
      principal: {
        ...foreignPrincipal.principal,
        proofHash: 'f'.repeat(64),
      },
      principalProofHash: 'f'.repeat(64),
    });
    await expect(router.route(foreignByPrincipal)).resolves.toMatchObject({
      outcome: 'terminate',
      route: {
        receipt_outcome: 'REFUSED',
        resolved_widget: { control: 'not_found' },
      },
    });
    const controls = gw.moduleRef.get(ControlRegistryService);
    await expect(
      controls.dismiss({
        tenantId: otherTenant.id,
        widgetId: foreignPrincipal.widget.widgetId,
        principalProofHash: foreignPrincipal.principal.proofHash,
      }),
    ).resolves.toEqual({ handled: false, code: 'not_found' });
    await expect(
      db.prisma.widgetEmission.findUniqueOrThrow({
        where: {
          widgetId_tenantId: {
            tenantId: foreignPrincipal.tenant.id,
            widgetId: foreignPrincipal.widget.widgetId,
          },
        },
        select: { lifecycleState: true },
      }),
    ).resolves.toEqual({ lifecycleState: 'LIVE' });
  }, 60_000);

  it('B-29 [U] reconciles the same ACCEPTED receipt once instead of creating a second adjudication', async () => {
    const built = await control('B-29');
    await router.route(built.context);
    await expect(
      router.reconcileAcceptedReceipt({
        tenantId: built.tenant.id,
        intentTokenHash: built.widget.intentTokenHash,
        actionReceiptRef: 'action-receipt-1',
      }),
    ).resolves.toBe(true);
    await expect(
      router.reconcileAcceptedReceipt({
        tenantId: built.tenant.id,
        intentTokenHash: built.widget.intentTokenHash,
        actionReceiptRef: 'action-receipt-2',
      }),
    ).resolves.toBe(false);
    await expect(
      db.prisma.widgetIntentReceipt.findUniqueOrThrow({
        where: {
          tenantId_intentTokenHash: {
            tenantId: built.tenant.id,
            intentTokenHash: built.widget.intentTokenHash,
          },
        },
        select: { actionReceiptRef: true },
      }),
    ).resolves.toEqual({ actionReceiptRef: 'action-receipt-1' });
  }, 60_000);

  it('N09/F75 [U] atomically consumes an exact approve/reject sibling pair with one concurrent winner', async () => {
    const built = await control('F75-SIBLINGS');
    const confirmationRef = randomUUID();
    const approveHash = built.widget.intentTokenHash;
    const rejectHash = 'b'.repeat(64);
    const updated = await db.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          tenantId: built.tenant.id,
          intentTokenHash: approveHash,
        },
      },
      data: {
        widgetKind: 'APPROVAL',
        effect: 'COMMIT',
        capabilitySpace: 'AE',
        capabilityKey: 'communication.bulk-campaign.admit.v2',
        confirmationOfKind: 'approval',
        confirmationOfRef: confirmationRef,
        approvalDecision: 'approve',
        singleUse: true,
        consumedAt: null,
      },
    });
    await db.prisma.widgetIntentRecord.create({
      data: {
        ...updated,
        id: randomUUID(),
        intentTokenHash: rejectHash,
        approvalDecision: 'reject',
      } as never,
    });

    // The decision belongs to the tapped server record. Merely naming its
    // sibling's decision cannot claim either token.
    await expect(
      gw.stores.claimIntentRecord({
        tenantId: built.tenant.id,
        intentTokenHash: approveHash,
        singleUse: true,
        now: new Date('2026-09-20T01:00:00.000Z'),
        approvalPair: {
          widgetId: built.widget.widgetId,
          capabilityKey: 'communication.bulk-campaign.admit.v2',
          confirmationRef,
          decision: 'reject',
        },
      }),
    ).resolves.toBe(false);

    const approveAt = new Date('2026-09-20T01:01:00.000Z');
    const rejectAt = new Date('2026-09-20T01:02:00.000Z');
    const outcomes = await Promise.all([
      gw.stores.claimIntentRecord({
        tenantId: built.tenant.id,
        intentTokenHash: approveHash,
        singleUse: true,
        now: approveAt,
        approvalPair: {
          widgetId: built.widget.widgetId,
          capabilityKey: 'communication.bulk-campaign.admit.v2',
          confirmationRef,
          decision: 'approve',
        },
      }),
      gw.stores.claimIntentRecord({
        tenantId: built.tenant.id,
        intentTokenHash: rejectHash,
        singleUse: true,
        now: rejectAt,
        approvalPair: {
          widgetId: built.widget.widgetId,
          capabilityKey: 'communication.bulk-campaign.admit.v2',
          confirmationRef,
          decision: 'reject',
        },
      }),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);

    const siblings = await db.prisma.widgetIntentRecord.findMany({
      where: {
        tenantId: built.tenant.id,
        intentTokenHash: { in: [approveHash, rejectHash] },
      },
      orderBy: { approvalDecision: 'asc' },
      select: { approvalDecision: true, consumedAt: true },
    });
    expect(siblings).toHaveLength(2);
    expect(siblings[0].consumedAt).not.toBeNull();
    expect(siblings[1].consumedAt).toEqual(siblings[0].consumedAt);
    expect([approveAt, rejectAt]).toContainEqual(siblings[0].consumedAt);
  }, 60_000);

  it.failing(
    'G13-P01/N02/N03/N05 [GW][G-SYNTH][XF→U10b] reaches the closed router only after Gate 10 is built',
    async () => {
      const built = await control('G13-XF');
      const emission = await db.prisma.widgetEmission.findUniqueOrThrow({
        where: {
          widgetId_tenantId: {
            tenantId: built.tenant.id,
            widgetId: built.widget.widgetId,
          },
        },
        select: {
          bodyHash: true,
          widgetId: true,
          tenantId: true,
          issuedAt: true,
          expiresAt: true,
        },
      });
      await db.prisma.widgetIntentRecord.update({
        where: {
          intentTokenHash_tenantId: {
            tenantId: built.tenant.id,
            intentTokenHash: built.widget.intentTokenHash,
          },
        },
        data: { utteranceTemplate: 'Скрыть карточку' },
      });
      const seal = gw.moduleRef.get(SealService);
      await db.prisma.widgetEmission.update({
        where: {
          widgetId_tenantId: {
            tenantId: built.tenant.id,
            widgetId: built.widget.widgetId,
          },
        },
        data: {
          envelopeSeal: seal.seal({
            ...emission,
            principalProofHash: built.principal.proofHash,
            profileId: null,
          }),
        },
      });
      const result = await gw.intent(
        built.actor,
        {
          contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
          widget_id: built.widget.widgetId,
          intent_token: built.widget.intentToken,
          inputs: null,
          client_nonce: randomUUID(),
          profile_id: 'widgets-live-gate13',
        },
        'G13-XF',
      );
      expect(result).toMatchObject({
        outcome: 'terminate',
        stopped_at_gate: '13',
        receipt_outcome: 'ACCEPTED',
        resolved_widget: { control: 'dismissed' },
      });
    },
    60_000,
  );
});
