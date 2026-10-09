import {
  publicConsultationReply,
  publicCompanyProfileReply,
  publicCompanyField,
} from './public-consultation-presentation';

describe('public consultation from synthetic existing catalog fields', () => {
  const source = {
    salon: { name: 'Мужская Эстетика', about: [], founded_hint: null },
    staff: [
      {
        id: 'private-ref',
        name: 'Тестовый мастер',
        title: 'Барбер',
        specialization: null,
        rating: 5,
        email: 'private@example.test',
      },
    ],
  };
  it('keeps unknown salon history and address unknown even for a familiar brand', () => {
    const out = publicConsultationReply(source, 'salon');
    expect(out.status).toBe('verified');
    expect(out.reply).toContain('Название в профиле: Мужская Эстетика');
    expect(out.reply).not.toMatch(
      /Ставропол|Лермонтов|2020|шест|премиальн|стабильн/,
    );
  });
  it('presents configured profile facts without deriving age or adding links', () => {
    const out = publicConsultationReply(
      {
        salon: {
          city: 'Тестовый город',
          address: 'Улица 1',
          phone: '+70000000000',
          about: ['Текст профиля'],
          founded_hint: '2018',
          rating: 5,
          website: 'https://private.invalid',
        },
      },
      'salon',
    );
    expect(out.reply).toContain('Город в профиле: Тестовый город');
    expect(out.reply).toContain(
      'Из сохранённого описания салона:\nТекст профиля',
    );
    expect(out.reply).toContain('Год основания в профиле: 2018');
    expect(out.reply).not.toMatch(/лет|rating|https/);
  });
  it('keeps staff usable with missing profile and never turns staff labels into booking facts', () => {
    const out = publicConsultationReply({ staff: source.staff }, 'staff');
    expect(out.status).toBe('verified');
    expect(out.reply).toContain('Тестовый мастер — Барбер');
    expect(out.reply).toContain(
      'свободное время этим списком не подтверждаются',
    );
    expect(out.reply).not.toMatch(/private-ref|private@example|рейтинг|лучший/);
  });
  it.each([null, {}, { staff: null }, { staff: [null, { name: '' }] }])(
    'blocks unknown staff rather than claiming an empty team: %j',
    (value) => {
      expect(publicConsultationReply(value, 'staff').status).toBe('blocked');
    },
  );
  it('distinguishes a known empty catalog from missing data', () => {
    const out = publicConsultationReply({ staff: [] }, 'staff');
    expect(out.status).toBe('verified');
    expect(out.reply).toContain('В полученном публичном каталоге нет записей');
  });
  it.each([
    null,
    {},
    { salon: [] },
    { salon: { about: [1], founded_hint: 'около 2020 (более 6 лет)' } },
  ])('does not fill an incomplete profile: %j', (value) => {
    expect(publicConsultationReply(value, 'salon').status).toBe('blocked');
  });
  it.each(['staff', 'salon'] as const)(
    'withholds stale %s source labels',
    (mode) => {
      for (const out of [
        publicConsultationReply(source, mode, true),
        publicConsultationReply({ ...source, stale: true }, mode),
      ]) {
        expect(out.status).toBe('blocked');
        expect(out.reply).not.toMatch(/Эстетика|Тестовый мастер/);
      }
    },
  );
  it('bounds the public list and labels omitted/invalid rows without inventing a full population', () => {
    const staff = Array.from({ length: 23 }, (_, i) => ({
      name: `Мастер ${i}`,
    }));
    const out = publicConsultationReply({ staff }, 'staff');
    expect(out.reply).toContain('Мастер 19');
    expect(out.reply).not.toContain('Мастер 20');
    expect(out.reply).toContain('Показана часть полученного каталога');
    expect(
      publicConsultationReply(
        { staff: [{ name: 'a'.repeat(241) }, source.staff[0]] },
        'staff',
      ).reply,
    ).toContain('Тестовый мастер');
  });
});

describe('source-qualified public company presentation', () => {
  const scope = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
  const source = () => ({
    status: 'completed',
    result: {
      salon: { name: 'Public CRM name', address: 'Public street 1' },
      public_scope: {
        contract: 'maya.company-public-profile.read/1',
        projection: 'company_profile',
        branch_id: scope.branchId,
        source_revision: scope.sourceRevision,
        company_id: '101',
      },
    },
  });
  it('shows only profile title/address and distinguishes saved replay', () => {
    const out = publicCompanyProfileReply(
      { ...source(), replayed: true },
      scope,
      'profile',
    );
    expect(out.status).toBe('verified');
    expect(out.reply).toContain('Сохранённый результат');
    expect(out.reply).toContain('Public CRM name');
    expect(out.reply).toContain('Public street 1');
    expect(out.reply).not.toContain('101');
  });
  it.each([
    'foreign-branch',
    'old-revision',
    'old-branding',
    'wrong-marker',
    'array-address',
    'stale',
    'failed',
    'extra-roster',
  ])('withholds %s instead of blessing old or malformed facts', (kind) => {
    const value: Record<string, unknown> = source();
    const result = value.result as ReturnType<typeof source>['result'];
    if (kind === 'foreign-branch') result.public_scope.branch_id = 'foreign';
    if (kind === 'old-revision')
      result.public_scope.source_revision = 'b'.repeat(64);
    if (kind === 'old-branding')
      value.result = { salon: result.salon, staff: [] };
    if (kind === 'wrong-marker') result.public_scope.projection = 'roster';
    if (kind === 'array-address')
      Object.assign(result.salon, { address: ['PRIVATE_VALUE'] });
    if (kind === 'stale') value.stale = true;
    if (kind === 'failed') value.status = 'failed';
    if (kind === 'extra-roster')
      Object.assign(result, { staff: [{ name: 'PRIVATE_VALUE' }] });
    const out = publicCompanyProfileReply(value, scope, 'address');
    expect(out.status).toBe('blocked');
    expect(out.reply).not.toContain('Public street');
    expect(out.reply).not.toContain('PRIVATE_VALUE');
  });
  it('cannot answer an address request merely from a known title', () => {
    const value = source();
    Object.assign(value.result.salon, { address: null });
    expect(publicCompanyProfileReply(value, scope, 'address')).toEqual({
      reply: 'В прочитанном профиле CRM этого филиала адрес не указан.',
      status: 'verified',
    });
    expect(publicCompanyProfileReply(value, scope, 'name').status).toBe(
      'verified',
    );
  });
  it.each(['address', 'name', 'profile'] as const)(
    'labels saved qualified missing %s fields without claiming current CRM-wide absence',
    (field) => {
      const value = source();
      Object.assign(value, { replayed: true });
      Object.assign(value.result.salon, { name: '', address: null });
      const out = publicCompanyProfileReply(value, scope, field);
      expect(out.status).toBe('verified');
      expect(out.reply).toMatch(
        /^Сохранённый результат проверки\.\nВ прочитанном профиле CRM/,
      );
      expect(out.reply).not.toContain('Адрес в профиле:');
    },
  );
  it('keeps unsupported fields explicit, without inventing phone or hours', () => {
    expect(publicCompanyField('phone')).toBeNull();
    expect(publicCompanyField('hours')).toBeNull();
    expect(publicCompanyField([])).toBeNull();
    expect(publicCompanyField('адрес')).toBe('address');
    expect(publicCompanyField(undefined)).toBe('profile');
  });
});
