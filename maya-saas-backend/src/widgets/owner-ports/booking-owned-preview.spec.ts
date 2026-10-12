import { BookingPreviewAdapter } from './booking-preview.adapter';
import type { ActuatingRoutingInput } from '../routing/effect-router.ports';

const appointment = () => ({
  id: 'appointment-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  staffExternalId: 'staff-opaque',
  serviceIds: ['service-opaque'],
  startAt: new Date('2026-10-13T14:00:00Z'),
  endAt: new Date('2026-10-13T14:30:00Z'),
  updatedAt: new Date('2026-10-12T12:00:00Z'),
  status: 'confirmed',
  source: 'external',
  crmExternalId: 'record-1',
  totalPriceKopecks: 150000,
  currency: 'RUB',
});
function harness(operation: 'cancel' | 'reschedule') {
  const row = appointment();
  const target = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    linkId: 'link-1',
    branchSourceRevision: 'revision-1',
    appointment: row,
  };
  const cancelQuote = { target, alreadyCancelled: false };
  const moveQuote = {
    target,
    prepared: {
      start: '2026-10-13T14:30:00.000Z',
      staffId: 'staff-opaque',
      serviceIds: ['service-opaque'],
      timezone: 'Europe/Moscow',
      branchSourceRevision: 'revision-1',
    },
  };
  const cancel = {
    readOwnedCancelTarget: jest.fn().mockResolvedValue(cancelQuote),
  };
  const reschedule = {
    quoteOwnedReschedule: jest.fn().mockResolvedValue(moveQuote),
  };
  const display = {
    id: row.id,
    tenant_id: row.tenantId,
    branch_id: row.branchId,
    staff_external_id: row.staffExternalId,
    service_ids: row.serviceIds,
    start_at: row.startAt,
    end_at: row.endAt,
    updated_at: row.updatedAt,
    status: row.status,
    source: row.source,
    crm_external_id: row.crmExternalId,
    staff: { id: row.staffExternalId, name: 'Артём' },
    services: [{ id: 'service-opaque', name: 'Мужская стрижка' }],
    branch: { id: row.branchId, timezone: 'Europe/Moscow' },
  };
  const read = { forAccount: jest.fn().mockResolvedValue([display]) };
  // Exercise both the historical three-owner adapter and the new read dependency.
  const adapter = Reflect.construct(BookingPreviewAdapter, [
    {},
    reschedule,
    cancel,
    read,
  ]) as BookingPreviewAdapter;
  const input = {
    routing: {
      tenantId: 'tenant-1',
      now: new Date('2026-10-12T12:00:00Z'),
      record: {
        capabilitySpace: 'C9',
        capabilityKey: `appointments.own.${operation}`,
        requestedScopeHash: 'scope',
        intentTokenHash: 'token-hash',
        frozenNounsJson:
          operation === 'cancel'
            ? { appointment: 'opaque-appointment' }
            : {
                appointment: 'opaque-appointment',
                service: 'opaque-service',
                staff: 'opaque-staff',
                slot: 'opaque-slot',
              },
      },
    },
    actorUserId: 'user-1',
    resolvedNouns: {
      values: new Map([
        ['appointment', row.id],
        ['service', 'service-opaque'],
        ['staff', 'staff-opaque'],
        ['slot', '2026-10-13T14:30:00.000Z'],
      ]),
    },
  } as unknown as ActuatingRoutingInput;
  return {
    adapter,
    input,
    row,
    target,
    cancelQuote,
    moveQuote,
    cancel,
    reschedule,
    read,
    display,
  };
}

describe('own booking confirmation uses canonical display without label authority', () => {
  it.each(['cancel', 'reschedule'] as const)(
    '%s shows names and local time, keeping opaque handles and canonical instants',
    async (operation) => {
      const h = harness(operation);
      const result = await h.adapter.propose(h.input);
      expect(result).toMatchObject({
        receiptOutcome: 'ACCEPTED',
        ownerDecision: {
          kind: 'booking_preview',
          preview: {
            subject: operation,
            serviceLabel: 'Мужская стрижка',
            staffLabel: 'Артём',
            when:
              operation === 'cancel'
                ? '2026-10-13T14:00:00.000Z'
                : '2026-10-13T14:30:00.000Z',
            whenFormatted: expect.stringContaining(
              operation === 'cancel' ? '17:00' : '17:30',
            ) as string,
            ...(operation === 'reschedule'
              ? {
                  whenPreviousFormatted: expect.stringContaining(
                    '17:00',
                  ) as string,
                }
              : {}),
            frozenArgumentHandles: h.input.routing.record.frozenNounsJson,
            priceKopecks: 150000,
            currency: 'RUB',
          },
        },
      });
      expect(h.read.forAccount).toHaveBeenCalledWith('tenant-1', 'user-1');
    },
  );

  it.each(['cancel', 'reschedule'] as const)(
    '%s preserves access with unavailable catalogue labels and never displays IDs as names',
    async (operation) => {
      const h = harness(operation);
      h.read.forAccount.mockResolvedValue([
        { ...h.display, staff: { id: 'staff-opaque' }, services: [] },
      ]);
      expect(await h.adapter.propose(h.input)).toMatchObject({
        receiptOutcome: 'ACCEPTED',
        ownerDecision: {
          preview: {
            serviceLabel: 'Название услуги недоступно',
            staffLabel: 'Имя мастера недоступно',
          },
        },
      });
    },
  );

  it('does not mislabel a changed service or staff with the original appointment labels', async () => {
    const h = harness('reschedule');
    h.moveQuote.prepared.serviceIds = ['other-service'];
    h.moveQuote.prepared.staffId = 'other-staff';
    expect(await h.adapter.propose(h.input)).toMatchObject({
      receiptOutcome: 'ACCEPTED',
      ownerDecision: {
        preview: {
          serviceLabel: 'Название услуги недоступно',
          staffLabel: 'Имя мастера недоступно',
        },
      },
    });
  });

  it.each([
    { tenant_id: 'foreign-tenant' },
    { id: 'foreign-appointment' },
    { branch_id: 'foreign-branch' },
    { staff_external_id: 'substituted' },
    { service_ids: ['substituted'] },
    { start_at: new Date('2027-01-01Z') },
    { end_at: new Date('2027-01-01Z') },
    { updated_at: new Date('2027-01-01Z') },
    { status: 'canceled' },
    { source: 'internal' },
    { crm_external_id: 'foreign-record' },
  ])('refuses substituted/stale display projection %j', async (change) => {
    for (const operation of ['cancel', 'reschedule'] as const) {
      const h = harness(operation);
      h.read.forAccount.mockResolvedValue([{ ...h.display, ...change }]);
      expect(await h.adapter.propose(h.input)).toMatchObject({
        receiptOutcome: 'REFUSED',
        ownerDecision: null,
      });
    }
  });

  it.each(['cancel', 'reschedule'] as const)(
    '%s refuses revocation during awaited public-label read',
    async (operation) => {
      const h = harness(operation);
      h.read.forAccount.mockImplementation(() => {
        h.cancel.readOwnedCancelTarget.mockRejectedValue(
          new Error('client_link_required'),
        );
        return Promise.resolve([h.display]);
      });
      await expect(h.adapter.propose(h.input)).resolves.toMatchObject({
        receiptOutcome: 'REFUSED',
        ownerDecision: null,
      });
    },
  );

  it.each(['client', 'link', 'source', 'appointment'] as const)(
    'refuses %s drift while resolving display',
    async (drift) => {
      for (const operation of ['cancel', 'reschedule'] as const) {
        const h = harness(operation);
        h.read.forAccount.mockImplementation(() => {
          const fresh = structuredClone(h.cancelQuote);
          if (drift === 'client') fresh.target.clientId = 'another-client';
          if (drift === 'link') fresh.target.linkId = 'successor-link';
          if (drift === 'source')
            fresh.target.branchSourceRevision = 'revision-2';
          if (drift === 'appointment')
            fresh.target.appointment.totalPriceKopecks++;
          h.cancel.readOwnedCancelTarget.mockResolvedValue(fresh);
          return Promise.resolve([h.display]);
        });
        expect(await h.adapter.propose(h.input)).toMatchObject({
          receiptOutcome: 'REFUSED',
          ownerDecision: null,
        });
      }
    },
  );

  it('returns ordinary refusal when the existing personal read owner rejects', async () => {
    const h = harness('reschedule');
    h.read.forAccount.mockRejectedValue(
      new Error('client_identity_unresolved'),
    );
    await expect(h.adapter.propose(h.input)).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
    });
    expect(h.cancel.readOwnedCancelTarget).not.toHaveBeenCalled();
  });

  it.each([
    ['America/Los_Angeles', '07:00'],
    ['Asia/Tokyo', '23:00'],
    ['Pacific/Kiritimati', '04:00'],
    ['Invalid/Zone', '14:00'],
  ])(
    'formats display in %s without changing canonical time',
    async (timezone, time) => {
      const h = harness('cancel');
      h.display.branch.timezone = timezone;
      const result = await h.adapter.propose(h.input);
      expect(result).toMatchObject({
        ownerDecision: {
          preview: {
            when: '2026-10-13T14:00:00.000Z',
            whenFormatted: expect.stringContaining(time) as string,
          },
        },
      });
      if (timezone === 'Invalid/Zone')
        expect(JSON.stringify(result.ownerDecision)).toContain('(UTC)');
      if (timezone === 'Pacific/Kiritimati')
        expect(JSON.stringify(result.ownerDecision)).toContain('14 окт.');
    },
  );
});
