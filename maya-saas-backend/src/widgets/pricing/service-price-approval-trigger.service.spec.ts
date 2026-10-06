import type { ServicePriceApprovalSnapshot } from '../../ai-tools/ai-approval-widget-trigger.port';
import type { ApprovalBody } from '../../widget-contract/kinds';
import type { RequestTx, PrincipalResolver } from '../authority/principal-view';
import type {
  WidgetEmitterService,
  SealedEmission,
} from '../emission/emitter.service';
import type { PrincipalView } from '../gate.types';
import type { ServicePriceApprovalOwnerPort } from './service-price-approval.port';
import { UserRole } from '../../common/domain.enums';
import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import { TimelineStore } from '../stores/timeline.store';
import { ServicePriceApprovalTriggerService } from './service-price-approval-trigger.service';
import type { UserTurnAuditPort } from '../owner-ports/user-turn-audit.port';

const actor = {
  userId: 'owner-a',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
  sessionId: 'session-a',
  email: '',
  branchId: null,
};
const principal: PrincipalView = {
  authority: {
    kind: 'USER',
    tenantId: 'tenant-a',
    userId: 'owner-a',
    membershipId: 'membership-a',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'a'.repeat(64),
  },
  role: 'tenant_owner',
  proofHash: 'a'.repeat(64),
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
};
const input = {
  actor,
  approvalId: 'approval-a',
  payloadHash: 'b'.repeat(64),
  userTurn: { turnId: 'original-turn', conversationId: 'conversation-a' },
};
const envelope = {
  contract: 'maya.widget.envelope/1',
  kind: 'APPROVAL',
  widget_id: 'widget-a',
  integrity: { envelope_seal: 'c'.repeat(64) },
  correlation: { parent_widget_id: null },
};
const snapshot = (): ServicePriceApprovalSnapshot => ({
  id: input.approvalId,
  payloadHash: input.payloadHash,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 600_000),
  summary: 'Source summary',
  serviceId: '201',
  serviceName: 'Стрижка',
  companyId: '101',
  currentPrice: 2000,
  proposedPrice: 2500,
  origin: {
    contract: 'maya.service-price-chat-approval/1',
    approvalId: input.approvalId,
    payloadHash: input.payloadHash,
    userTurnId: 'original-turn',
    conversationId: 'conversation-a',
    principalProofHash: principal.proofHash,
  },
});
type EmissionQuery = NonNullable<
  Parameters<RequestTx['widgetEmission']['findMany']>[0]
>;
type StoredReceipt = { emittedEnvelopeJson: unknown };
type RootEmission = {
  widgetId: string;
  envelopeSeal: string;
  lifecycleState: string;
  expiresAt: Date;
  renderReceipts: StoredReceipt[];
};
type CandidateEmission = {
  widgetId: string;
  renderReceipts: StoredReceipt[];
  intentRecords: Array<{ confirmationOfRef: string | null }>;
};
type ApprovalEmission = Pick<
  SealedEmission,
  'widgetId' | 'envelopeSeal' | 'envelope'
>;
const previous = (): RootEmission => ({
  widgetId: 'widget-a',
  envelopeSeal: 'c'.repeat(64),
  lifecycleState: 'MINTED',
  expiresAt: new Date(Date.now() + 600_000),
  renderReceipts: [{ emittedEnvelopeJson: envelope }],
});

describe('YC-SP1 approval trigger: local owner/store doubles, no provider authority', () => {
  const harness = () => {
    const ensureTurn = jest
      .spyOn(TimelineStore, 'ensureAssistantExecutionTurn')
      .mockResolvedValue({
        id: 'assistant-turn',
        principalProofHash: principal.proofHash,
      });
    const lock = jest
      .spyOn(TimelineStore, 'lockConversation')
      .mockResolvedValue(undefined);
    const rootEmissions = jest
      .fn<Promise<RootEmission[]>, [EmissionQuery]>()
      .mockResolvedValue([]);
    const candidates = jest
      .fn<Promise<CandidateEmission[]>, [EmissionQuery]>()
      .mockResolvedValue([]);
    const tx = {
      widgetEmission: {
        findMany: jest
          .fn<Promise<RootEmission[] | CandidateEmission[]>, [EmissionQuery]>()
          .mockImplementation((query) =>
            query.where?.turnId ? rootEmissions(query) : candidates(query),
          ),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const source = {
      read: jest
        .fn<
          ReturnType<ServicePriceApprovalOwnerPort['read']>,
          Parameters<ServicePriceApprovalOwnerPort['read']>
        >()
        .mockResolvedValue(snapshot()),
      sameServiceApproval: jest
        .fn<
          ReturnType<ServicePriceApprovalOwnerPort['sameServiceApproval']>,
          Parameters<ServicePriceApprovalOwnerPort['sameServiceApproval']>
        >()
        .mockResolvedValue(true),
    };
    const principals = {
      resolve: jest
        .fn<
          ReturnType<PrincipalResolver['resolve']>,
          Parameters<PrincipalResolver['resolve']>
        >()
        .mockResolvedValue(principal),
    };
    const gate6 = { grantsRequiredFeatures: jest.fn().mockResolvedValue(true) };
    const releaseAccess = { canProject: jest.fn().mockResolvedValue(true) };
    const emitter = {
      emitServicePriceApproval: jest
        .fn<
          Promise<ApprovalEmission>,
          Parameters<WidgetEmitterService['emitServicePriceApproval']>
        >()
        .mockImplementation(async (_request, linkage) => {
          await linkage.revalidate();
          return {
            widgetId: 'widget-a',
            envelopeSeal: 'c'.repeat(64),
            envelope,
          };
        }),
    };
    const turnAudit = {
      read: jest
        .fn<
          ReturnType<UserTurnAuditPort['read']>,
          Parameters<UserTurnAuditPort['read']>
        >()
        .mockResolvedValue([]),
      append: jest
        .fn<
          ReturnType<UserTurnAuditPort['append']>,
          Parameters<UserTurnAuditPort['append']>
        >()
        .mockResolvedValue(undefined),
    };
    const service = new ServicePriceApprovalTriggerService(
      prisma as never,
      emitter as never,
      source as never,
      principals,
      gate6 as never,
      releaseAccess as never,
      turnAudit,
    );
    return {
      service,
      turnAudit,
      ensureTurn,
      lock,
      tx,
      rootEmissions,
      candidates,
      prisma,
      source,
      principals,
      gate6,
      releaseAccess,
      emitter,
    };
  };
  afterEach(() => jest.restoreAllMocks());

  it('reads only one closed durable user-turn proof through its existing audit owner and transaction', async () => {
    const h = harness();
    const proof = {
      contract: 'maya.user-turn-binding/1',
      turnId: input.userTurn.turnId,
      conversationId: input.userTurn.conversationId,
      principalProofHash: principal.proofHash,
      intentTokenHash: null,
    };
    const request = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...input.userTurn,
      principalProofHash: principal.proofHash,
    };
    h.turnAudit.read.mockResolvedValue([proof]);
    await expect(
      h.service.readServicePriceUserTurnBinding(request, h.tx as never),
    ).resolves.toEqual({
      turnId: proof.turnId,
      conversationId: proof.conversationId,
      principalProofHash: proof.principalProofHash,
    });
    expect(h.turnAudit.read).toHaveBeenLastCalledWith(
      actor.tenantId,
      actor.userId,
      proof.turnId,
      h.tx,
    );
    for (const invalid of [
      [],
      [proof, proof],
      [{ ...proof, contract: 'other' }],
      [{ ...proof, turnId: 'foreign' }],
      [{ ...proof, conversationId: 'foreign' }],
      [{ ...proof, principalProofHash: 'f'.repeat(64) }],
      [{ ...proof, intentTokenHash: 'a'.repeat(64) }],
      [{ ...proof, text: 'must never enter canonical proof' }],
    ]) {
      h.turnAudit.read.mockResolvedValue(invalid);
      await expect(
        h.service.readServicePriceUserTurnBinding(request, h.tx as never),
      ).resolves.toBeNull();
    }
    expect(h.turnAudit.append).not.toHaveBeenCalled();
    expect(h.source.read).not.toHaveBeenCalled();
    expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
    expect(h.principals.resolve).not.toHaveBeenCalled();
  });

  it('uses canonical source, original chat turn, exact source facts and standard persisted envelope', async () => {
    const h = harness();
    const result = await h.service.afterPendingServicePriceApproval(input);
    expect(h.source.read).toHaveBeenNthCalledWith(
      1,
      { tenantId: actor.tenantId, userId: actor.userId },
      `v1:${input.approvalId}:${input.payloadHash}`,
      principal.proofHash,
      true,
    );
    expect(h.source.read).toHaveBeenNthCalledWith(
      2,
      { tenantId: actor.tenantId, userId: actor.userId },
      `v1:${input.approvalId}:${input.payloadHash}`,
      principal.proofHash,
      false,
    );
    expect(h.ensureTurn).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        parentUserTurnId: 'original-turn',
        conversationId: 'conversation-a',
        executionId: 'service-price-approval:approval-a',
        principalProofHash: principal.proofHash,
      }),
      expect.any(Date),
    );
    const [request, linkage] = h.emitter.emitServicePriceApproval.mock.calls[0];
    expect(request).toMatchObject({
      kind: 'APPROVAL',
      turnId: 'assistant-turn',
      tenantId: 'tenant-a',
      deliveryChannel: 'pwa',
      composerInput: {
        capability: 'catalog.service.price.update',
        capability_version: C9_REGISTRY_HASH,
        facts_origin: ['copied'],
      },
    });
    expect(request.ttlSeconds).toBeGreaterThan(0);
    expect(request.ttlSeconds).toBeLessThanOrEqual(600);
    const body = request.body as unknown as ApprovalBody;
    const effects = Object.fromEntries(
      body.effect_preview.map((item) => [item.label.rendered, item.value]),
    );
    expect(effects).toMatchObject({
      'Компания YCLIENTS': { value: '101' },
      Услуга: { value: '201' },
      'Текущая цена': { value: 2000, currency: 'RUB', unit: 'RUB' },
      'Новая цена': { value: 2500, currency: 'RUB', unit: 'RUB' },
    });
    expect(request.body).toMatchObject({
      subject: { value: 'Стрижка' },
      requested_by_label: { value: 'Вы' },
      state: { value: 'PENDING' },
      blocked_reason: null,
      approve_intent: 'i1',
      reject_intent: 'i2',
      detail_intent: 'i3',
    });
    expect(linkage).toMatchObject({
      approvalId: input.approvalId,
      payloadHash: input.payloadHash,
    });
    expect(result?.receipt.envelope).toBe(envelope);
  });

  it.each(['tenant', 'user', 'client', 'role', 'feature'] as const)(
    'refuses %s mismatch before reading approval facts',
    async (denial) => {
      const h = harness();
      if (denial === 'feature')
        h.gate6.grantsRequiredFeatures.mockResolvedValue(false);
      else
        h.principals.resolve.mockResolvedValue({
          ...principal,
          ...(denial === 'role' ? { role: 'staff' } : {}),
          authority: {
            ...principal.authority,
            ...(denial === 'tenant' ? { tenantId: 'foreign' } : {}),
            ...(denial === 'user' ? { userId: 'foreign' } : {}),
            ...(denial === 'client' ? { kind: 'CLIENT_CHANNEL' } : {}),
          },
        });
      expect(
        await h.service.afterPendingServicePriceApproval(input),
      ).toBeNull();
      expect(h.source.read).not.toHaveBeenCalled();
      expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
    },
  );

  it('refuses another conversation or changed origin principal without creating an assistant turn', async () => {
    const h = harness();
    h.source.read.mockResolvedValue({
      ...snapshot(),
      origin: { ...snapshot().origin, conversationId: 'foreign' },
    });
    expect(await h.service.afterPendingServicePriceApproval(input)).toBeNull();
    h.source.read.mockResolvedValue({
      ...snapshot(),
      origin: { ...snapshot().origin, principalProofHash: 'foreign' },
    });
    expect(await h.service.afterPendingServicePriceApproval(input)).toBeNull();
    expect(h.ensureTurn).not.toHaveBeenCalled();
  });

  it('never fabricates an assistant turn if the original parent has gone', async () => {
    const h = harness();
    h.ensureTurn.mockResolvedValue(null);
    expect(await h.service.afterPendingServicePriceApproval(input)).toBeNull();
    expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
  });

  it('replays the exact saved envelope without minting or rewriting its original turn binding', async () => {
    const h = harness();
    h.rootEmissions.mockResolvedValue([previous()]);
    const result = await h.service.afterPendingServicePriceApproval({
      ...input,
      userTurn: { ...input.userTurn, turnId: 'later-turn' },
    });
    expect(result?.receipt.envelope).toBe(envelope);
    expect(h.ensureTurn).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ parentUserTurnId: 'original-turn' }),
      expect.any(Date),
    );
    expect(h.releaseAccess.canProject).toHaveBeenCalledWith(
      'tenant-a',
      'widget-a',
      h.tx,
    );
    expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
  });

  it.each(['release', 'expired', 'superseded', 'wrong-seal'] as const)(
    'does not remint a refused %s replay',
    async (denial) => {
      const h = harness();
      const saved = previous();
      if (denial === 'release')
        h.releaseAccess.canProject.mockResolvedValue(false);
      if (denial === 'expired') saved.expiresAt = new Date(0);
      if (denial === 'superseded') saved.lifecycleState = 'SUPERSEDED';
      if (denial === 'wrong-seal') saved.envelopeSeal = 'wrong';
      h.rootEmissions.mockResolvedValue([saved]);
      expect(
        await h.service.afterPendingServicePriceApproval(input),
      ).toBeNull();
      expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
    },
  );

  it('replays the saved root card after a later detail child shares its assistant turn', async () => {
    const h = harness();
    const child = {
      ...previous(),
      widgetId: 'child',
      renderReceipts: [
        {
          emittedEnvelopeJson: {
            ...envelope,
            widget_id: 'child',
            correlation: { parent_widget_id: 'widget-a' },
          },
        },
      ],
    };
    h.rootEmissions.mockResolvedValue([child, previous()]);
    const result = await h.service.afterPendingServicePriceApproval(input);
    expect(result?.receipt.envelope).toBe(envelope);
    expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
    h.rootEmissions.mockResolvedValue([child]);
    expect(await h.service.afterPendingServicePriceApproval(input)).toBeNull();
    expect(h.emitter.emitServicePriceApproval).not.toHaveBeenCalled();
  });

  it('supersedes only a prior pricing approval in this owner conversation', async () => {
    const h = harness();
    h.candidates.mockResolvedValue([
      {
        widgetId: 'old-pricing',
        renderReceipts: previous().renderReceipts,
        intentRecords: [{ confirmationOfRef: 'old-approval' }],
      },
    ]);
    await h.service.afterPendingServicePriceApproval(input);
    expect(h.candidates.mock.calls[0][0].where).toMatchObject({
      tenantId: 'tenant-a',
      kind: 'APPROVAL',
      lifecycleState: { in: ['MINTED', 'DELIVERED', 'LIVE'] },
      turn: {
        conversationId: 'conversation-a',
        principalProofHash: principal.proofHash,
      },
      intentRecords: {
        some: {
          capabilitySpace: 'AE',
          capabilityKey: 'crm.service.fixed-price.update.v1',
          confirmationOfKind: 'approval',
          effect: 'COMMIT',
          consumedAt: null,
        },
      },
    });
    expect(h.emitter.emitServicePriceApproval.mock.calls[0][3]).toBe(
      'old-pricing',
    );
    expect(h.source.sameServiceApproval).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', userId: 'owner-a' },
      'old-approval',
      'approval-a',
    );
    expect(h.candidates.mock.calls[0][0].take).toBe(20);
  });

  it('skips unrelated service cards and supersedes only a canonical owner-equivalent predecessor', async () => {
    const h = harness();
    h.candidates.mockResolvedValue([
      {
        widgetId: 'detail-child',
        intentRecords: [{ confirmationOfRef: 'same-approval' }],
        renderReceipts: [
          {
            emittedEnvelopeJson: {
              ...envelope,
              correlation: { parent_widget_id: 'old-root' },
            },
          },
        ],
      },
      {
        widgetId: 'other-service',
        renderReceipts: previous().renderReceipts,
        intentRecords: [{ confirmationOfRef: 'other-approval' }],
      },
      {
        widgetId: 'same-service',
        renderReceipts: previous().renderReceipts,
        intentRecords: [{ confirmationOfRef: 'same-approval' }],
      },
    ]);
    h.source.sameServiceApproval
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await h.service.afterPendingServicePriceApproval(input);
    expect(h.emitter.emitServicePriceApproval.mock.calls[0][3]).toBe(
      'same-service',
    );
    expect(h.source.sameServiceApproval).toHaveBeenCalledTimes(2);
  });

  it('mints without supersession when no candidate has canonical service equivalence', async () => {
    const h = harness();
    h.candidates.mockResolvedValue([
      {
        widgetId: 'unbound',
        renderReceipts: previous().renderReceipts,
        intentRecords: [],
      },
      {
        widgetId: 'other-service',
        renderReceipts: previous().renderReceipts,
        intentRecords: [{ confirmationOfRef: 'other-approval' }],
      },
    ]);
    h.source.sameServiceApproval.mockResolvedValue(false);
    await h.service.afterPendingServicePriceApproval(input);
    expect(h.emitter.emitServicePriceApproval.mock.calls[0][3]).toBeUndefined();
    expect(h.source.sameServiceApproval).toHaveBeenCalledTimes(1);
  });

  it('owner revocation before mint propagates and never returns an approval envelope', async () => {
    const h = harness();
    h.source.read
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new Error('approval no longer pending'));
    await expect(
      h.service.afterPendingServicePriceApproval(input),
    ).rejects.toThrow('approval no longer pending');
  });
});
