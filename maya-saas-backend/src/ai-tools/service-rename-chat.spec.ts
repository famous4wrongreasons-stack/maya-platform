import {
  bindServiceRenameChat,
  serviceRenameReply,
} from './service-rename-chat';

const catalog = {
  contract: 'maya.service-catalog.read/1',
  source: 'external_crm',
  services: [
    { id: '123', name: 'Стрижка' },
    { id: '124', name: 'Борода' },
  ],
};
const preview = {
  contract: 'maya.service-rename.preview/1',
  source: 'external_crm',
  scope: 'single_existing_service_title',
  as_of: '2026-10-08T12:00:00Z',
  company_id: '7',
  service_id: '123',
  old_title: 'Стрижка',
  new_title: 'Мужская стрижка 2026',
  booking_title: 'Стрижка онлайн',
  source_revision: 'a'.repeat(64),
  current_revision: 'b'.repeat(64),
  preserved_fields_hash: 'c'.repeat(64),
  blocked_reason: 'approval_lane_not_registered',
  preview_only: true,
  noSideEffects: true,
  limitations: [
    'print_title_effective_label_not_qualified',
    'future_write_not_qualified',
  ],
};

describe('explicit service rename READ binding and truthful presentation', () => {
  it.each([
    'Переименуй услугу «Стрижка» в «Мужская стрижка 2026»',
    'Пожалуйста, переименуйте услугу „Стрижка“ в „Мужская стрижка 2026“.',
    'Переименовать услугу №123 в "Мужская стрижка 2026" в YCLIENTS',
  ])('binds only exact current user literals: %s', (text) => {
    expect(bindServiceRenameChat(text, catalog)).toEqual({
      kind: 'resolved',
      arguments: { service_id: '123', new_title: 'Мужская стрижка 2026' },
    });
  });
  it.each([
    'Не переименуй услугу «Стрижка» в «Новое»',
    'Переименуй услугу «Стрижка» в «Новое» и измени цену',
    'Переименуй услуги «Стрижка» и «Борода» в «Новое»',
    'Переименуй услугу №123 в «Новое» или «Другое»',
    'да, подтверждаю',
    'назови её лучше',
    'Переименуй услугу «Стрижка» в « »',
    'Переименуй услугу «Стрижка» в «Новое\nназвание»',
    'Переименуй услугу «Стрижка» в «Новое\u202e»',
    `Переименуй услугу «Стрижка» в «${'я'.repeat(241)}»`,
  ])('does not infer target/text or accept compound intent: %s', (text) => {
    expect(bindServiceRenameChat(text, catalog).kind).toBe('clarify');
  });
  it('refuses duplicate names, foreign/absent IDs and duplicate source identities', () => {
    expect(
      bindServiceRenameChat('Переименуй услугу «Стрижка» в «Новая»', {
        ...catalog,
        services: [...catalog.services, { id: '125', name: 'СТРИЖКА' }],
      }),
    ).toEqual({ kind: 'clarify', reason: 'exact_service_required' });
    expect(
      bindServiceRenameChat('Переименуй услугу №125 в «Новая»', catalog),
    ).toEqual({ kind: 'clarify', reason: 'exact_service_required' });
    expect(
      bindServiceRenameChat('Переименуй услугу №123 в «Новая»', {
        ...catalog,
        services: [catalog.services[0], catalog.services[0]],
      }),
    ).toEqual({ kind: 'clarify', reason: 'source_unavailable' });
  });
  it.each([
    null,
    { ...catalog, stale: true },
    { ...catalog, source: 'internal_calendar' },
    { ...catalog, services: [] },
    { ...catalog, services: [{ id: '123', name: 'unsafe\nlabel' }] },
  ])('never silently selects a row from unqualified source %j', (value) => {
    expect(
      bindServiceRenameChat('Переименуй услугу «Стрижка» в «Новая»', value)
        .kind,
    ).toBe('clarify');
  });
  it('reports exact old/new and separate unchanged online name without a success or action', () => {
    const result = serviceRenameReply(preview);
    expect(result.status).toBe('verified');
    for (const value of [
      'Стрижка',
      'Мужская стрижка 2026',
      'Стрижка онлайн',
      '№123',
      '№7',
      'ещё не подключены',
      'ничего не изменено',
      'печатное',
    ])
      expect(result.reply).toContain(value);
    expect(result.reply).not.toContain('a'.repeat(64));
  });
  it.each([
    { stale: true },
    { preview_only: false },
    { noSideEffects: false },
    { contract: 'unknown' },
    { blocked_reason: null },
    { source: 'internal_calendar' },
    { source_revision: 'x' },
    { old_title: 'unsafe\nlabel' },
    { booking_title: '' },
  ])(
    'does not make partial/stale/mutating projection sound qualified: %j',
    (patch) => {
      expect(serviceRenameReply({ ...preview, ...patch }).status).toBe(
        'blocked',
      );
    },
  );
  it('preserves observed label whitespace while requiring an exact new title', () => {
    const result = serviceRenameReply({
      ...preview,
      old_title: '  Стрижка  ',
      booking_title: '  Keep verbatim  ',
    });
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('«  Стрижка  »');
    expect(result.reply).toContain('«  Keep verbatim  »');
    expect(
      serviceRenameReply({ ...preview, new_title: ' padded ' }).status,
    ).toBe('blocked');
  });
  it('never renders stale cached preview as current', () =>
    expect(serviceRenameReply(preview, true).status).toBe('blocked'));
});
