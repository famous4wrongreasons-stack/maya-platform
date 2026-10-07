import { publicConsultationReply } from './public-consultation-presentation';

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
