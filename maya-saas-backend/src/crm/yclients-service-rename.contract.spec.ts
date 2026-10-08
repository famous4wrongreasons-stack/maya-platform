import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SERVICE_RENAME_SOURCE_MAX_BYTES,
  serviceRenameId,
  serviceRenamePermissions,
  serviceRenamePreview,
  serviceRenameRevision,
  serviceRenameSnapshot,
  serviceRenameTitle,
} from './yclients-service-rename.contract';

const source = (): Record<string, unknown> => ({
  id: 201,
  company_id: 123,
  title: 'Synthetic cut',
  booking_title: 'Online booking label',
  category_id: 1,
  price_min: 2000,
  price_max: 2000,
  duration: 1800,
  is_multi: false,
  tax_variant: 1,
  vat_id: 2,
  is_need_limit_date: false,
  seance_search_start: 0,
  seance_search_finish: 86400,
  step: 900,
  seance_search_step: 900,
  technical_break_duration: 300,
  staff: [{ id: 101, seance_length: 1800 }],
  active: 1,
  is_chain: false,
  is_price_managed_only_in_chain: false,
  comment: 'PRIVATE_SOURCE_NOTE',
  print_title: '',
});
const snapshot = (row: unknown = source(), currency = 'RUB') =>
  serviceRenameSnapshot(row, '123', '201', currency);

describe('service rename bounded READ projection (synthetic)', () => {
  it('changes current revision for the primary title while protecting every non-title field including prices', () => {
    const original = snapshot();
    const renamed = snapshot({ ...source(), title: 'New cut' });
    expect(renamed.revision).not.toBe(original.revision);
    expect(renamed.preservedFieldsHash).toBe(original.preservedFieldsHash);
    for (const change of [
      { price_min: 2100, price_max: 2100 },
      { booking_title: 'Other booking label' },
      { duration: 2700 },
      { technical_break_duration: 600 },
      { staff: [{ id: 101, seance_length: 2700 }] },
      { dates: ['2026-10-08'] },
      { comment: 'Other source note' },
      { print_title: 'Explicit printed label' },
      { provider_extension: { unknown_fact: true } },
    ])
      expect(snapshot({ ...source(), ...change }).preservedFieldsHash).not.toBe(
        original.preservedFieldsHash,
      );
  });
  it('returns only the closed non-money preview with explicit unqualified print/write limitations', () => {
    const result = serviceRenamePreview(
      snapshot(),
      '  New cut  ',
      'a'.repeat(64),
    );
    expect(result).toMatchObject({
      contract: 'maya.service-rename.preview/1',
      source: 'external_crm',
      scope: 'single_existing_service_title',
      company_id: '123',
      service_id: '201',
      old_title: 'Synthetic cut',
      new_title: 'New cut',
      booking_title: 'Online booking label',
      source_revision: 'a'.repeat(64),
      blocked_reason: 'approval_lane_not_registered',
      preview_only: true,
      noSideEffects: true,
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        'contract',
        'source',
        'scope',
        'as_of',
        'company_id',
        'service_id',
        'old_title',
        'new_title',
        'booking_title',
        'source_revision',
        'current_revision',
        'preserved_fields_hash',
        'blocked_reason',
        'preview_only',
        'noSideEffects',
        'limitations',
      ].sort(),
    );
    expect(result.limitations).toEqual(
      expect.arrayContaining([
        'print_title_effective_label_not_qualified',
        'future_write_preservation_not_qualified',
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE_SOURCE_NOTE|preservedPayload|price_min|staff|print_title":/,
    );
    expect(result.current_revision).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isFinite(Date.parse(result.as_of))).toBe(true);
  });
  it.each([
    { id: 999 },
    { company_id: 999 },
    { active: false },
    { is_chain: true },
    { is_price_managed_only_in_chain: true },
    { is_multi: true },
    { price_max: 2100 },
    { duration: undefined },
    { technical_break_duration: undefined },
    { booking_title: '' },
    { booking_title: 'x'.repeat(241) },
    { title: 'Invisible\u202e label' },
    { staff: [{ id: 101, seance_length: 1800, technological_card_id: 7 }] },
  ])('refuses unqualified source %j', (patch) => {
    expect(() => snapshot({ ...source(), ...patch })).toThrow(
      ServiceUnavailableException,
    );
  });
  it('bounds source bytes and refuses non-RUB or an incomplete date window', () => {
    expect(() =>
      snapshot({
        ...source(),
        extra: 'x'.repeat(SERVICE_RENAME_SOURCE_MAX_BYTES),
      }),
    ).toThrow(ServiceUnavailableException);
    expect(() => snapshot(source(), 'USD')).toThrow(
      ServiceUnavailableException,
    );
    expect(() => snapshot({ ...source(), is_need_limit_date: true })).toThrow(
      ServiceUnavailableException,
    );
    expect(
      snapshot({ ...source(), booking_title: '  Keep verbatim  ' })
        .bookingTitle,
    ).toBe('  Keep verbatim  ');
  });
  it.each([
    '',
    '   ',
    'x'.repeat(241),
    'a\nb',
    'a\u0000b',
    'a\u202eb',
    'a\u2066b',
    123,
    null,
  ])(
    'rejects invalid title %j as input, not a successful empty preview',
    (value) => {
      expect(() => serviceRenameTitle(value)).toThrow(BadRequestException);
    },
  );
  it('validates selection/revision and refuses an already current title', () => {
    expect(serviceRenameTitle(' x ')).toBe('x');
    expect(serviceRenameTitle('x'.repeat(240))).toHaveLength(240);
    expect(serviceRenameId('201')).toBe('201');
    for (const value of ['0', '-1', '2/3', '1e2', '1'.repeat(16)])
      expect(() => serviceRenameId(value)).toThrow(BadRequestException);
    expect(() => serviceRenameRevision('A'.repeat(64))).toThrow(
      BadRequestException,
    );
    expect(() =>
      serviceRenamePreview(snapshot(), 'Synthetic cut', 'a'.repeat(64)),
    ).toThrow(ConflictException);
  });
  it('requires exact title permissions independently of price editing', () => {
    const settings = {
      settings_services_access: true,
      services_edit: true,
      settings_services_edit_title_access: true,
      settings_services_edit_price_access: false,
    };
    expect(serviceRenamePermissions({ settings })).toBe(
      serviceRenamePermissions({
        settings: { ...settings, settings_services_edit_price_access: true },
      }),
    );
    for (const field of [
      'settings_services_access',
      'services_edit',
      'settings_services_edit_title_access',
    ]) {
      for (const value of [false, undefined, 1, 'true'])
        expect(() =>
          serviceRenamePermissions({
            settings: { ...settings, [field]: value },
          }),
        ).toThrow(ServiceUnavailableException);
    }
  });
});
