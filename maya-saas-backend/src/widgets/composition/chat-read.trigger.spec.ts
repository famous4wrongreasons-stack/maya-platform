import { UserRole } from '../../common/domain.enums';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WidgetEmitterService } from '../emission/emitter.service';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import type { PrincipalResolver } from '../authority/principal-view';
import type { WidgetProjectorService } from '../projection/widget-projector.service';
import type { WidgetStoresService } from '../stores/widget-stores.service';
import { ChatReadTriggerService } from './chat-read.trigger';

const actor = {
  userId: 'user-a',
  sessionId: 'session-a',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
  email: 'owner@example.test',
  branchId: null,
  membershipId: 'membership-a',
  membershipStatus: 'active',
};

const principal = {
  authority: {
    kind: 'USER',
    tenantId: 'tenant-a',
    userId: 'user-a',
    membershipId: 'membership-a',
    clientId: null,
    channelLinkId: null,
  },
  role: 'tenant_owner',
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'a'.repeat(64),
} as const;

const journal = () => ({
  date: '2026-09-24',
  timezone: 'Europe/Moscow',
  summary: { appointments: 1 },
  appointments: [],
});

const input = () => ({
  actor,
  toolName: 'operations.journal.read',
  surface: 'web' as const,
  arguments: { date: '2026-09-24' },
  inputHash: 'b'.repeat(64),
  executionId: '11111111-1111-4111-8111-111111111111',
  result: journal(),
  replayed: false,
  trigger: 'T-2b' as const,
  requestId: null,
});

describe('P-MT2a ChatReadTriggerService', () => {
  const harness = (entitled = true, previous: unknown = null) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      widgetEmission: { findFirst: jest.fn().mockResolvedValue(previous) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    } as unknown as PrismaService;
    const ensureAssistantTurn = jest.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      principalProofHash: principal.proofHash,
    });
    const stores = {
      ensureAssistantTurn,
    } as unknown as WidgetStoresService;
    const composeCompletedRead = jest.fn().mockReturnValue({
      kind: 'composer_input',
      input: {
        kind_proposal: 'SCHEDULE',
        capability: 'operations.journal.read',
        intent_proposals: [],
      },
      source: journal(),
    });
    const projector = {
      composeCompletedRead,
    } as unknown as WidgetProjectorService;
    const emit = jest.fn().mockResolvedValue({
      widgetId: '33333333-3333-4333-8333-333333333333',
      envelopeSeal: 'c'.repeat(64),
      intentTokenHashes: ['d'.repeat(64)],
      envelope: { contract: 'maya.widget.envelope/1' },
    });
    const emitter = {
      emit,
    } as unknown as WidgetEmitterService;
    const gate6 = {
      grantsRequiredFeatures: jest.fn().mockResolvedValue(entitled),
    } as unknown as Gate6Owners;
    const resolvePrincipal = jest.fn().mockResolvedValue(principal);
    const principals = {
      resolve: resolvePrincipal,
    } as unknown as PrincipalResolver;
    return {
      service: new ChatReadTriggerService(
        prisma,
        stores,
        projector,
        emitter,
        gate6,
        principals,
      ),
      tx,
      ensureAssistantTurn,
      composeCompletedRead,
      emit,
      resolvePrincipal,
    };
  };

  it('mints an entitled registered READ through the finite projector and retains only the validated journal date', async () => {
    const h = harness();
    const value = await h.service.afterCompletedRead(input());

    expect(value).toMatchObject({
      matched: true,
      receipt: {
        widget_id: '33333333-3333-4333-8333-333333333333',
        envelope_seal: 'c'.repeat(64),
      },
      dismiss_widget_id: null,
    });
    expect(h.composeCompletedRead).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'SCHEDULE',
        body: expect.objectContaining({
          timezone: 'Europe/Moscow',
          lanes: expect.any(Array),
          entries: expect.any(Array),
          detail_intent: 'i1',
        }),
        retainedQueryScalar: {
          type: 'local_business_date',
          value: '2026-09-24',
          provenance: 'server_validated',
        },
      }),
    );
  });

  it('writes nothing and leaves the canonical response unchanged when widgets.runtime is absent', async () => {
    const h = harness(false);
    await expect(h.service.afterCompletedRead(input())).resolves.toBeNull();
    expect(h.ensureAssistantTurn).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('replays the one sealed envelope for the same execution instead of minting again', async () => {
    const envelope = { contract: 'maya.widget.envelope/1', kind: 'SCHEDULE' };
    const h = harness(true, {
      widgetId: '44444444-4444-4444-8444-444444444444',
      envelopeSeal: 'e'.repeat(64),
      renderReceipts: [{ emittedEnvelopeJson: envelope }],
    });
    await expect(
      h.service.afterCompletedRead({ ...input(), replayed: true }),
    ).resolves.toMatchObject({
      receipt: {
        widget_id: '44444444-4444-4444-8444-444444444444',
        envelope,
      },
    });
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('fails closed before projection when the live principal no longer resolves', async () => {
    const h = harness();
    h.resolvePrincipal.mockResolvedValue(null);
    await expect(h.service.afterCompletedRead(input())).resolves.toBeNull();
    expect(h.composeCompletedRead).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('refuses an invalid date before retaining or minting it', async () => {
    const h = harness();
    await expect(
      h.service.afterCompletedRead({
        ...input(),
        arguments: { date: '2026-02-31' },
      }),
    ).rejects.toThrow('local_business_date_invalid');
    expect(h.emit).not.toHaveBeenCalled();
  });
});
