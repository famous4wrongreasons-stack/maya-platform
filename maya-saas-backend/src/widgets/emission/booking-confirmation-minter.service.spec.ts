import type { FactUsed } from '../../widget-contract/envelope';
import type { BookingConfirmationPreview } from '../booking/booking-confirmation-minter.port';
import type { PrincipalView } from '../gate.types';
import { BookingConfirmationMinterService } from './booking-confirmation-minter.service';
import type { MintRequest } from './emitter.service';

const principal = (): PrincipalView => ({
  authority: {
    kind: 'USER',
    tenantId: 't1',
    userId: 'user-1',
    membershipId: 'membership-1',
    clientId: 'client-1',
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'p'.repeat(64),
  },
  role: null,
  presentationMode: 'client',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'p'.repeat(64),
});

const canonicalFact = (): FactUsed => ({
  capability: 'appointments.own.create',
  status: 'measured',
  as_of: '2026-09-25T12:00:00.000Z',
  evidence_refs: ['quote:canonical-owner'],
  completeness: {
    status: 'COMPLETE',
    requestedScopeHash: 's'.repeat(64),
    returnedCount: 1,
    totalCount: 1,
    hasMore: false,
    cursorRef: null,
    truncated: false,
    reasonCodes: [],
  },
});

const preview = (fact: FactUsed): BookingConfirmationPreview => ({
  subject: 'create',
  sourceCapabilityKey: 'appointments.own.create',
  frozenArgumentHandles: {
    service: 'service-handle',
    staff: 'staff-handle',
    slot: 'slot-handle',
  },
  draftRef: 'draft-1',
  appointmentRef: null,
  producingIntentTokenHash: null,
  when: '2026-09-26T10:00:00.000Z',
  whenPrevious: null,
  serviceLabel: 'Service',
  staffLabel: 'Staff',
  durationMinutes: 60,
  priceKopecks: 150000,
  currency: 'RUB',
  fact,
});

describe('P-MINT-BOOK confirmation minter', () => {
  it('FBE2E-2 links create confirmation to its selector while copying the exact canonical owner fact', async () => {
    const fact = canonicalFact();
    const emitBookingConfirmation = jest.fn(
      async (
        request: MintRequest,
        linkage: unknown,
        now: Date,
        supersedesWidgetId: string | null,
      ) => {
        void request;
        void linkage;
        void now;
        void supersedesWidgetId;
        return Promise.resolve({
          envelope: { contract: 'maya.widget.envelope/1' },
        } as never);
      },
    );
    const service = new BookingConfirmationMinterService(
      {
        widgetEmission: {
          findFirst: jest.fn().mockResolvedValue({
            turnId: 'turn-1',
            turn: { conversationId: 'conversation-1' },
          }),
        },
      } as never,
      { emitBookingConfirmation } as never,
    );

    await service.mint({
      tenantId: 't1',
      predecessorWidgetId: 'widget-1',
      principal: principal(),
      deliveryChannel: 'pwa',
      now: new Date('2026-09-25T12:00:00.000Z'),
      preview: preview(fact),
    });

    expect(emitBookingConfirmation).toHaveBeenCalledTimes(1);
    const request = emitBookingConfirmation.mock.calls[0]?.[0];
    expect(request.composerInput.facts).toEqual([fact]);
    expect(request.composerInput.facts[0]).toBe(fact);
    expect(request.composerInput.facts_origin).toEqual(['copied']);
    expect(request.composerInput.origin.emitter).toBe('capability_read');
    expect(emitBookingConfirmation.mock.calls[0]?.[3]).toBe('widget-1');
  });

  it('renders missing canonical price as not measured instead of inventing zero', async () => {
    const emitBookingConfirmation = jest.fn(
      async (
        request: MintRequest,
        linkage: unknown,
        now: Date,
        supersedesWidgetId: string | null,
      ) => {
        void request;
        void linkage;
        void now;
        void supersedesWidgetId;
        return Promise.resolve({ envelope: {} } as never);
      },
    );
    const service = new BookingConfirmationMinterService(
      {
        widgetEmission: {
          findFirst: jest.fn().mockResolvedValue({
            turnId: 'turn-1',
            turn: { conversationId: 'conversation-1' },
          }),
        },
      } as never,
      { emitBookingConfirmation } as never,
    );

    await service.mint({
      tenantId: 't1',
      predecessorWidgetId: 'widget-1',
      principal: principal(),
      deliveryChannel: 'pwa',
      now: new Date('2026-09-25T12:00:00.000Z'),
      preview: { ...preview(canonicalFact()), priceKopecks: null },
    });

    const request = emitBookingConfirmation.mock.calls[0]?.[0];
    expect(request.body.price_total).toEqual(
      expect.objectContaining({
        state: 'NOT_MEASURED',
        value: null,
        reason_code: 'NOT_COLLECTED',
      }),
    );
  });
});
