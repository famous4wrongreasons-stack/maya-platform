/** Pure recovery seams with synthetic sealed nouns and explicit record snapshots.
 * These tests do not qualify HTTP admission, persistence, provider or model behavior. */
import { SealService } from '../emission/seal.service';
import { encodeSelectionDomain } from '../input-schema/codec';
import type { OwnerNounIdentity } from '../noun-resolution/noun-handle.codec';
import {
  BOOKING_NOUN_OWNERS,
  encodeBookingCatalogOwnerRef,
  type BookingSlotScope,
} from './booking-noun-identity';
import {
  bookingClosedSelection,
  bookingSelectionPreferences,
  type BookingPreferenceRecord,
} from './booking-selection-preferences';

const TENANT = 'synthetic-tenant-a';
const SCOPE: BookingSlotScope = {
  branchId: 'synthetic-branch-a',
  sourceRevision: 'a'.repeat(64),
};
const SERVICE_AT = new Date('2035-10-01T09:00:00.000Z');
const STAFF_AT = new Date('2035-10-01T09:01:00.000Z');
const domain = (value: Record<string, string[]>): string => {
  const encoded = encodeSelectionDomain(value);
  if (!encoded.ok) throw new Error('Invalid synthetic selection domain');
  return encoded.value;
};
const audit = (noun: 'service' | 'staff', handle: string) => ({
  inputsClosedJson: { [`${noun}_ref`]: [handle] },
  erasedAt: null,
});
const handle = (
  noun: 'service' | 'staff',
  id: string,
  scope: BookingSlotScope | null = SCOPE,
  overrides: Partial<OwnerNounIdentity> = {},
) => {
  const ownerRef = encodeBookingCatalogOwnerRef(id, scope);
  if (!ownerRef) throw new Error('Invalid synthetic catalog reference');
  const identity = {
    tenantId: TENANT,
    noun,
    ownerKind: BOOKING_NOUN_OWNERS[noun],
    ownerRef,
    ...overrides,
  };
  return new SealService().mintNounHandles([identity])[identity.noun];
};
const accepted = (
  noun: 'service' | 'staff',
  choice: string,
  inheritedService?: string,
): BookingPreferenceRecord => ({
  widgetKind: noun === 'service' ? 'SERVICE_SELECTOR' : 'STAFF_SELECTOR',
  effect: 'REFINE',
  capabilitySpace: 'C9',
  capabilityKey:
    noun === 'service' ? 'catalog.services.read' : 'catalog.staff.read',
  inputSchemaHash: 'f'.repeat(64),
  singleUse: true,
  consumedAt: noun === 'service' ? SERVICE_AT : STAFF_AT,
  frozenNounsJson: inheritedService ? { service: inheritedService } : {},
  selectionDomain: domain({ [`${noun}_ref`]: [choice] }),
  receipts: [
    {
      outcome: 'ACCEPTED',
      actionReceiptRef: null,
      submittedAt: noun === 'service' ? SERVICE_AT : STAFF_AT,
      erasedAt: null,
    },
  ],
  submissionAudits: [audit(noun, choice)],
});
const unconsumedStaff = (service: string): BookingPreferenceRecord => ({
  ...accepted('staff', handle('staff', '71'), service),
  consumedAt: null,
  receipts: [],
  submissionAudits: [],
});
const expectedService = {
  selectedAt: SERVICE_AT.toISOString(),
  services: ['81'],
  branch: SCOPE.branchId,
  sourceRevision: SCOPE.sourceRevision,
};

describe('Booking selection preferences — pure synthetic evidence seams', () => {
  const originalIdentity = process.env.ACTION_ENGINE_IDENTITY_SECRET;
  const originalPayload = process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET;
  beforeAll(() => {
    process.env.ACTION_ENGINE_IDENTITY_SECRET = 'i'.repeat(64);
    process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = 'p'.repeat(64);
  });
  afterAll(() => {
    if (originalIdentity === undefined)
      delete process.env.ACTION_ENGINE_IDENTITY_SECRET;
    else process.env.ACTION_ENGINE_IDENTITY_SECRET = originalIdentity;
    if (originalPayload === undefined)
      delete process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET;
    else process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = originalPayload;
  });

  it('recovers a service preference only from its accepted closed selection', () => {
    const record = accepted('service', handle('service', '81'));
    expect(bookingSelectionPreferences([record], TENANT)).toEqual(
      expectedService,
    );
  });

  it('recovers service and staff with the exact same original branch/source scope', () => {
    const service = handle('service', '81');
    const staff = accepted('staff', handle('staff', '71'), service);
    expect(bookingSelectionPreferences([staff], TENANT)).toEqual({
      ...expectedService,
      selectedAt: STAFF_AT.toISOString(),
      employee: '71',
    });
  });

  it('keeps legacy unscoped choices unscoped without inventing a branch', () => {
    const service = handle('service', '81', null);
    expect(
      bookingSelectionPreferences(
        [accepted('staff', handle('staff', '71', null), service)],
        TENANT,
      ),
    ).toEqual({
      selectedAt: STAFF_AT.toISOString(),
      services: ['81'],
      employee: '71',
    });
  });

  it('uses receipt time and admits sixteen identical retries without changing preference', () => {
    const service = handle('service', '81');
    const record = accepted('service', service);
    record.consumedAt = new Date('2035-10-01T10:00:00.000Z');
    record.submissionAudits = Array.from({ length: 16 }, () =>
      audit('service', service),
    );
    expect(bookingSelectionPreferences([record], TENANT)).toEqual(
      expectedService,
    );
  });

  it.each(['service', 'staff'] as const)(
    'refuses distinct %s choices in replay/concurrent audit snapshots',
    (noun) => {
      const a = handle(noun, noun === 'service' ? '81' : '71');
      const b = handle(noun, noun === 'service' ? '82' : '72');
      const record = accepted(
        noun,
        a,
        noun === 'staff' ? handle('service', '81') : undefined,
      );
      record.selectionDomain = domain({ [`${noun}_ref`]: [a, b] });
      for (const choices of [
        [a, b],
        [b, a],
        [a, a, b],
      ]) {
        record.submissionAudits = choices.map((choice) => audit(noun, choice));
        expect(bookingSelectionPreferences([record], TENANT)).toBeNull();
      }
    },
  );

  it.each(['absent', 'erased', 'overflow', 'malformed'] as const)(
    'refuses %s selection evidence instead of falling back to an older selection',
    (failure) => {
      const service = handle('service', '81');
      const previous = accepted('service', service);
      const latest = accepted('staff', handle('staff', '71'), service);
      if (failure === 'absent') latest.submissionAudits = [];
      if (failure === 'erased') latest.submissionAudits[0].erasedAt = STAFF_AT;
      if (failure === 'overflow')
        latest.submissionAudits = Array.from({ length: 17 }, () =>
          audit('staff', handle('staff', '71')),
        );
      if (failure === 'malformed')
        latest.submissionAudits[0].inputsClosedJson = { staff_ref: ['71'] };
      expect(
        bookingSelectionPreferences([latest, previous], TENANT),
      ).toBeNull();
    },
  );

  it.each([
    'missing',
    'multiple',
    'refused',
    'erased',
    'business-receipt',
  ] as const)(
    'requires one retained non-business ACCEPTED receipt: %s',
    (failure) => {
      const record = accepted('service', handle('service', '81'));
      if (failure === 'missing') record.receipts = [];
      if (failure === 'multiple')
        record.receipts.push({ ...record.receipts[0] });
      if (failure === 'refused') record.receipts[0].outcome = 'REFUSED';
      if (failure === 'erased') record.receipts[0].erasedAt = SERVICE_AT;
      if (failure === 'business-receipt')
        record.receipts[0].actionReceiptRef = 'action-execution:synthetic';
      expect(bookingSelectionPreferences([record], TENANT)).toBeNull();
    },
  );

  it.each<Partial<BookingPreferenceRecord>>([
    { effect: 'DRAFT' },
    { capabilitySpace: 'AE' },
    { capabilityKey: 'catalog.staff.read' },
    { inputSchemaHash: null },
    { singleUse: false },
    { consumedAt: null },
  ])(
    'refuses records that cannot establish an accepted service selection: %p',
    (change) => {
      const record = accepted('service', handle('service', '81'));
      expect(
        bookingSelectionPreferences([{ ...record, ...change }], TENANT),
      ).toBeNull();
    },
  );

  it('rejects raw, corrupted, foreign-tenant, wrong-owner, wrong-noun and malformed scoped handles', () => {
    const service = handle('service', '81');
    const corrupted =
      service.slice(0, -1) + (service.endsWith('0') ? '1' : '0');
    const invalid = [
      '81',
      corrupted,
      handle('service', '81', SCOPE, { tenantId: 'synthetic-tenant-b' }),
      handle('service', '81', SCOPE, { ownerKind: 'unrelated_owner' }),
      handle('staff', '81'),
      handle('service', '81', SCOPE, { ownerRef: 'catalog_v2:broken' }),
    ];
    for (const choice of invalid) {
      expect(
        bookingSelectionPreferences([accepted('service', choice)], TENANT),
      ).toBeNull();
      expect(
        bookingSelectionPreferences(
          [accepted('staff', handle('staff', '71'), choice)],
          TENANT,
        ),
      ).toBeNull();
    }
    expect(
      bookingSelectionPreferences(
        [accepted('service', service)],
        'synthetic-tenant-b',
      ),
    ).toBeNull();
  });

  it.each([
    { ...SCOPE, branchId: 'synthetic-branch-b' },
    { ...SCOPE, sourceRevision: 'b'.repeat(64) },
    null,
  ])('refuses mixed service/staff scope: %p', (staffScope) => {
    const service = handle('service', '81');
    expect(
      bookingSelectionPreferences(
        [accepted('staff', handle('staff', '71', staffScope), service)],
        TENANT,
      ),
    ).toBeNull();
  });

  it('refuses a foreign or wrong-owner staff even when the service handle is valid', () => {
    const service = handle('service', '81');
    for (const staff of [
      handle('staff', '71', SCOPE, { tenantId: 'synthetic-tenant-b' }),
      handle('staff', '71', SCOPE, { ownerKind: 'catalog_service' }),
      handle('service', '71'),
    ])
      expect(
        bookingSelectionPreferences(
          [accepted('staff', staff, service)],
          TENANT,
        ),
      ).toBeNull();
  });

  it.each([null, {}, { service: 81 }, { service: '81', staff: '71' }])(
    'refuses malformed inherited service context: %p',
    (frozenNounsJson) => {
      const record = accepted(
        'staff',
        handle('staff', '71'),
        handle('service', '81'),
      );
      expect(
        bookingSelectionPreferences([{ ...record, frozenNounsJson }], TENANT),
      ).toBeNull();
    },
  );

  it('restores only service from an unconsumed staff successor with the exact accepted predecessor', () => {
    const service = handle('service', '81');
    const latest = unconsumedStaff(service),
      previous = accepted('service', service);
    expect(bookingSelectionPreferences([latest, previous], TENANT)).toEqual(
      expectedService,
    );
    expect(bookingSelectionPreferences([latest], TENANT)).toBeNull();
    expect(
      bookingSelectionPreferences(
        [latest, accepted('service', handle('service', '82'))],
        TENANT,
      ),
    ).toBeNull();
    expect(
      bookingSelectionPreferences(
        [
          latest,
          accepted(
            'service',
            handle('service', '81', {
              ...SCOPE,
              sourceRevision: 'b'.repeat(64),
            }),
          ),
        ],
        TENANT,
      ),
    ).toBeNull();
    expect(
      bookingSelectionPreferences(
        [latest, { ...previous, receipts: [] }],
        TENANT,
      ),
    ).toBeNull();
  });

  it.each([
    { widgetKind: 'SERVICE_SELECTOR', effect: 'REFINE', consumedAt: null },
    { widgetKind: 'TIME_SLOT_SELECTOR', effect: 'DRAFT', consumedAt: null },
    { widgetKind: 'TIME_SLOT_SELECTOR', effect: 'DRAFT', consumedAt: STAFF_AT },
    { widgetKind: 'BOOKING_CONFIRMATION', effect: 'COMMIT', consumedAt: null },
    {
      widgetKind: 'BOOKING_CONFIRMATION',
      effect: 'COMMIT',
      consumedAt: STAFF_AT,
    },
  ])(
    'does not resurrect an older service behind a newer unfinished/terminal flow: %p',
    (newer) => {
      const previous = accepted('service', handle('service', '81'));
      expect(
        bookingSelectionPreferences(
          [{ ...previous, ...newer }, previous],
          TENANT,
        ),
      ).toBeNull();
    },
  );

  it.each([
    { widgetKind: 'TIME_SLOT_SELECTOR', effect: 'DRAFT', consumedAt: STAFF_AT },
    {
      widgetKind: 'BOOKING_CONFIRMATION',
      effect: 'COMMIT',
      consumedAt: STAFF_AT,
    },
    { widgetKind: 'SERVICE_SELECTOR', effect: 'REFINE', consumedAt: null },
  ])(
    'does not cross an intervening terminal or new-selection barrier to recover older preferences: %p',
    (barrier) => {
      const service = handle('service', '81');
      const previous = accepted('service', service);
      expect(
        bookingSelectionPreferences(
          [unconsumedStaff(service), { ...previous, ...barrier }, previous],
          TENANT,
        ),
      ).toBeNull();
    },
  );

  it('does not skip a more recent accepted different service to find an older matching handle', () => {
    const service = handle('service', '81');
    expect(
      bookingSelectionPreferences(
        [
          unconsumedStaff(service),
          accepted('service', handle('service', '82')),
          accepted('service', service),
        ],
        TENANT,
      ),
    ).toBeNull();
  });

  it('refuses missing and overflow history, while accepting the bounded latest-first history', () => {
    const latest = accepted('service', handle('service', '81'));
    expect(bookingSelectionPreferences([], TENANT)).toBeNull();
    expect(
      bookingSelectionPreferences(
        Array.from({ length: 32 }, () => latest),
        TENANT,
      ),
    ).toEqual(expectedService);
    expect(
      bookingSelectionPreferences(
        Array.from({ length: 33 }, () => latest),
        TENANT,
      ),
    ).toBeNull();
  });
});

describe('Closed booking selection — pure domain validation', () => {
  const encoded = domain({ service_ref: ['synthetic-a', 'synthetic-b'] });
  it('accepts exactly one opaque member of the exact single-field canonical domain', () => {
    expect(
      bookingClosedSelection(
        { service_ref: ['synthetic-a'] },
        'service_ref',
        encoded,
      ),
    ).toBe('synthetic-a');
  });
  it.each([
    null,
    undefined,
    [],
    'synthetic-a',
    {},
    { service_ref: 'synthetic-a' },
    { service_ref: [] },
    { service_ref: ['synthetic-a', 'synthetic-b'] },
    { service_ref: ['synthetic-a', 'synthetic-a'] },
    { service_ref: [81] },
    { staff_ref: ['synthetic-a'] },
    { service_ref: ['foreign-choice'] },
    { service_ref: ['synthetic-a'], label: 'Synthetic' },
  ])('rejects malformed, ambiguous or out-of-domain input: %p', (value) => {
    expect(bookingClosedSelection(value, 'service_ref', encoded)).toBeNull();
  });
  it.each([
    'not-json',
    '[]',
    '{}',
    '{"service_ref":["synthetic-b","synthetic-a"]}',
    domain({ service_ref: ['synthetic-a'], staff_ref: ['synthetic-a'] }),
    domain({ staff_ref: ['synthetic-a'] }),
  ])('refuses noncanonical, missing or multi-field domain: %s', (value) => {
    expect(
      bookingClosedSelection(
        { service_ref: ['synthetic-a'] },
        'service_ref',
        value,
      ),
    ).toBeNull();
  });
});
