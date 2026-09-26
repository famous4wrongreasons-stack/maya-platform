import {
  BOOKING_INTENT_TEMPLATE_REGISTRY,
  resolveBookingTemplateForSynthesis,
} from './booking-intent-template.registry';

const proposal = (
  key: keyof typeof BOOKING_INTENT_TEMPLATE_REGISTRY,
  handles: Record<string, string>,
) => {
  const row = BOOKING_INTENT_TEMPLATE_REGISTRY[key];
  return {
    intent_template_key: key,
    capability: row.subject,
    role: row.role,
    argument_handles: handles,
  } as const;
};

describe('P-MINT-BOOK closed booking intent templates', () => {
  it('owns typed selector progression, three propose edges and three typed COMMIT recipes', () => {
    expect(
      Object.values(BOOKING_INTENT_TEMPLATE_REGISTRY).map((row) => [
        row.effect,
        row.subject.key,
      ]),
    ).toEqual([
      ['REFINE', 'catalog.services.read'],
      ['REFINE', 'catalog.staff.read'],
      ['DRAFT', 'appointments.own.create'],
      ['DRAFT', 'appointments.own.create'],
      ['REFINE', 'appointments.own.reschedule'],
      ['REFINE', 'appointments.own.cancel'],
      ['COMMIT', 'crm.appointment.create.v1'],
      ['COMMIT', 'crm.appointment.reschedule.v1'],
      ['COMMIT', 'crm.appointment.cancel.v1'],
    ]);
  });

  it('resolves a server-owned exact recipe', () => {
    expect(
      resolveBookingTemplateForSynthesis({
        proposal: proposal('commit.booking.create@1', {
          service: 'h1',
          staff: 'h2',
          slot: 'h3',
        }),
        widgetKind: 'BOOKING_CONFIRMATION',
        deliveryChannel: 'pwa',
      }).effect,
    ).toBe('COMMIT');
  });

  it('refuses a HANDOFF-only capability member in the booking mint registry', () => {
    expect(() =>
      resolveBookingTemplateForSynthesis({
        proposal: {
          ...proposal('commit.booking.create@1', {
            service: 'h1',
            staff: 'h2',
            slot: 'h3',
          }),
          handoff_capability_ref: {
            space: 'C9',
            key: 'appointments.own.create',
          },
        },
        widgetKind: 'BOOKING_CONFIRMATION',
        deliveryChannel: 'pwa',
      }),
    ).toThrow('capability_mismatch');
  });

  it.each([
    ['unknown@1', { service: 'h1', staff: 'h2', slot: 'h3' }],
    ['commit.booking.create@1', { service: 'h1' }],
    [
      'commit.booking.create@1',
      { service: 'h1', staff: 'h2', slot: 'h3', endpoint: '/crm' },
    ],
  ])('fails closed for unknown or non-exact recipe %s', (key, values) => {
    expect(() =>
      resolveBookingTemplateForSynthesis({
        proposal: {
          intent_template_key: key,
          capability: { space: 'AE', key: 'crm.appointment.create.v1' },
          role: 'primary',
          argument_handles: values,
        },
        widgetKind: 'BOOKING_CONFIRMATION',
        deliveryChannel: 'pwa',
      }),
    ).toThrow();
  });
});
