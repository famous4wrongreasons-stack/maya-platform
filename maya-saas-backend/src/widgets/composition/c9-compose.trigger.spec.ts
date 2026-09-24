import type { PrismaService } from '../../prisma/prisma.service';
import type { WidgetEmitterService } from '../emission/emitter.service';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import type { WidgetStoresService } from '../stores/widget-stores.service';
import { C9ComposeTriggerService } from './c9-compose.trigger';

const principal = {
  authority: {
    kind: 'USER',
    tenantId: 'tenant-a',
    userId: 'user-a',
    membershipId: 'member-a',
    clientId: null,
    channelLinkId: null,
  },
  role: 'tenant_owner',
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'a'.repeat(64),
} as const;

describe('P-MT1 C9ComposeTriggerService', () => {
  const harness = (entitled = true) => {
    const emit = jest.fn() as jest.MockedFunction<WidgetEmitterService['emit']>;
    emit.mockResolvedValue({ widgetId: 'widget-a' } as never);
    const ensureAssistantTurn = jest.fn().mockResolvedValue({ id: 'turn-a' });
    const service = new C9ComposeTriggerService(
      {
        $transaction: jest
          .fn()
          .mockImplementation((callback: (tx: unknown) => unknown) =>
            callback({}),
          ),
      } as unknown as PrismaService,
      { emit } as unknown as WidgetEmitterService,
      { ensureAssistantTurn } as unknown as WidgetStoresService,
      {
        grantsRequiredFeatures: jest.fn().mockResolvedValue(entitled),
      } as unknown as Gate6Owners,
      { resolve: jest.fn().mockResolvedValue(principal) },
    );
    return { service, emit, ensureAssistantTurn };
  };

  it('mints one run-bearing single-use cancel intent with exact witness metadata', async () => {
    const h = harness();
    await h.service.afterRun({
      runId: 'run-a',
      revisionId: 'revision-a',
      domain: 'BUSINESS_INTELLIGENCE',
      state: 'running',
    });
    expect(h.emit).toHaveBeenCalledTimes(1);
    const request = h.emit.mock.calls[0]?.[0];
    expect(request.kind).toBe('PROGRESS');
    expect(request.runWitness).toEqual({
      revisionId: 'revision-a',
      c9Domain: 'BUSINESS_INTELLIGENCE',
    });
    expect(request.composerInput.correlation_refs).toEqual({ run_id: 'run-a' });
    expect(request.composerInput.intent_proposals[0]?.intent_template_key).toBe(
      'control.run.cancel@1',
    );
  });

  it('writes nothing for a tenant without widgets.runtime', async () => {
    const h = harness(false);
    await expect(
      h.service.afterRun({
        runId: 'run-a',
        revisionId: 'revision-a',
        domain: 'BUSINESS_INTELLIGENCE',
        state: 'done',
      }),
    ).resolves.toBeNull();
    expect(h.ensureAssistantTurn).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });
});
