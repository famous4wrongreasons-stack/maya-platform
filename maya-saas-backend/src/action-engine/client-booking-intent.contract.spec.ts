import { ActionCapabilityRegistry } from './action-engine.registry';
import { ActionIdentityService } from './action-engine.identity';
import {
  CLIENT_BOOKING_INTENT_CONTRACT,
  normalizeClientBookingIntent,
  type ClientBookingIntentContext,
} from './client-booking-intent.contract';

const identity = new ActionIdentityService(
  'synthetic-b31-fingerprint'.repeat(3),
  'synthetic-b31-payload'.repeat(3),
);
const registry = new ActionCapabilityRegistry();
const input = {
  clientId: 'client-a',
  clientName: 'Canonical Client',
  clientPhone: '+79990001122',
  staffId: 'staff-a',
  serviceIds: ['service-a', 'service-b'],
  start: '2099-09-20T10:00:00.000Z',
  creationMode: 'client',
  allowBusy: false,
  notifyBySmsHours: 0,
};
const context: ClientBookingIntentContext = {
  contract: CLIENT_BOOKING_INTENT_CONTRACT,
  calendarTarget: { source: 'internal', provider: null, companyId: null },
  timezone: 'Europe/Moscow',
};
function fingerprint(
  raw: Record<string, unknown> = input,
  tenant = 'tenant-a',
  resolution = context,
) {
  const normalized = registry
    .get('crm.appointment.create.v1')
    .normalizeInput(raw);
  const snapshot = normalizeClientBookingIntent(tenant, normalized, resolution);
  return identity.hmac(CLIENT_BOOKING_INTENT_CONTRACT, snapshot.descriptor);
}

describe('B31 canonical booking fingerprint', () => {
  it('converges service order/duplicates, phone presentation, UTC offsets and optional defaults', () => {
    expect(
      fingerprint({
        ...input,
        serviceIds: ['service-b', 'service-a', 'service-b'],
        clientPhone: '8 (999) 000-11-22',
        clientName: ' Canonical Client ',
        start: '2099-09-20T13:00:00+03:00',
        branchId: null,
        notes: '',
      }),
    ).toBe(fingerprint());
  });
  it('excludes transport details and resolution timezone when the instant is unchanged', () => {
    expect(
      fingerprint(
        {
          ...input,
          traceId: 'new-trace',
          requestTimestamp: Date.now(),
          headers: { unrelated: 'value' },
          sourceRef: 'ai:new-message',
        },
        'tenant-a',
        { ...context, timezone: 'UTC' },
      ),
    ).toBe(fingerprint());
  });
  it.each([
    { clientId: 'client-b' },
    { branchId: 'branch-b' },
    { staffId: 'staff-b' },
    { serviceIds: ['service-a'] },
    { start: '2099-09-20T11:00:00Z' },
    { durationMinutes: 45 },
    { clientName: 'Changed name' },
    { clientPhone: '+79990002233' },
    { notes: 'Changed booking instruction' },
  ])('retains each changed business term %j', (change) => {
    expect(fingerprint({ ...input, ...change })).not.toBe(fingerprint());
  });
  it('qualifies by canonical tenant and booking provider/company', () => {
    expect(fingerprint(input, 'tenant-b')).not.toBe(fingerprint());
    const external: ClientBookingIntentContext = {
      ...context,
      calendarTarget: {
        source: 'external',
        provider: 'yclients',
        companyId: '42',
      },
    };
    expect(fingerprint(input, 'tenant-a', external)).not.toBe(fingerprint());
    expect(
      fingerprint(input, 'tenant-a', {
        ...external,
        calendarTarget: { ...external.calendarTarget, companyId: '43' },
      }),
    ).not.toBe(fingerprint(input, 'tenant-a', external));
  });
  it('rejects unsupported version/target/options instead of hashing raw request shapes', () => {
    expect(() =>
      fingerprint(input, 'tenant-a', {
        ...context,
        contract: 'unapproved/2' as never,
      }),
    ).toThrow();
    expect(() =>
      fingerprint(input, 'tenant-a', {
        ...context,
        calendarTarget: {
          source: 'external',
          provider: 'yclients',
          companyId: null,
        },
      }),
    ).toThrow();
    expect(() => fingerprint({ ...input, creationMode: 'admin' })).toThrow();
    expect(() => fingerprint({ ...input, allowBusy: true })).toThrow();
    expect(() => fingerprint({ ...input, notifyBySmsHours: 3 })).toThrow();
  });
});
