import { reviewsReply, reviewsCalendarReply } from './reviews-presentation';

const row = () => ({
  id: 'review-private-ref',
  source: 'provider-label',
  rating: 2,
  occurred_at: new Date('2026-09-20T12:00:00.000Z'),
  topics: ['wait', 'staff'],
  branch_id: 'private-branch',
  staff_external_id: 'private-staff',
  has_private_text: true,
  text: 'SECRET_SENTINEL',
  encryptedText: 'SECRET_CIPHER',
});
const value = (rows = [row()]) => ({
  configured: rows.length > 0,
  source: rows.length > 0 ? 'tenant_review_registry' : 'not_configured',
  count: rows.length,
  reviews: rows,
  privacy: 'review_text_redacted_from_ai',
  read_scope: {
    contract: 'maya.review-registry-query/1',
    from_inclusive: '2026-07-11T12:00:00.000Z' as string | null,
    to_exclusive: null as string | null,
    rating_exact: null as number | null,
    scope: 'tenant',
    order: 'occurred_at_desc',
    limit: 20,
    returned_count: rows.length,
    limit_reached: false,
    configuration_status: 'not_observed',
  },
});

describe('source-scoped review presentation', () => {
  it('empty filtered query never diagnoses absent configuration or absence of bad reviews', () => {
    const data = value([]);
    const result = reviewsReply(data);
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('По выполненным фильтрам отзывы не найдены');
    expect(result.reply).toContain('не доказывает отсутствие настройки');
    expect(result.reply).not.toMatch(/не настроен|плохих отзывов нет/);
    expect(result.reply).toContain(
      'Точный календарный период и полный набор низких оценок этой выборкой не подтверждены',
    );
    expect(result.reply).toContain('11.07.2026, 12:00');
    expect(result.reply).toContain('верхняя граница не задана');
    expect(result.reply).toContain('Фильтр по оценке не задан');
    expect(result.reply).toContain('Лимит чтения: 20');
    // Old consumers retain their historical flag. Presentation does not use it
    // as an independent integration/configuration fact in either direction.
    data.configured = true;
    expect(reviewsReply(data)).toEqual(result);
  });
  it('shows only permitted rating/date/topic facts, never original text, IDs or arbitrary provider labels', () => {
    const result = reviewsReply(value());
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('Получено отзывов: 1');
    expect(result.reply).toContain('20.09.2026, 12:00');
    expect(result.reply).toContain(
      'оценка 2 из 5; темы: ожидание, работа мастера',
    );
    expect(result.reply).not.toMatch(
      /SECRET|private|provider-label|has_private/,
    );
    const serialized: unknown = JSON.parse(JSON.stringify(value()));
    expect(reviewsReply(serialized)).toEqual(result);
  });
  it('describes exact single rating and branch scope without interpreting it as all low ratings', () => {
    const data = value();
    data.read_scope.rating_exact = 2;
    data.read_scope.scope = 'one_branch';
    const result = reviewsReply(data);
    expect(result.reply).toContain('в доступном филиале');
    expect(result.reply).toContain('ровно 2 из 5');
    expect(result.reply).toContain(
      'полный набор низких оценок этой выборкой не подтверждены',
    );
    expect(result.reply).not.toMatch(/все плохие|по всему бизнесу/);
  });
  it('distinguishes limit reached from known truncation and bounds the display to five received rows', () => {
    const data = value(
      Array.from({ length: 6 }, (_, i) => ({ ...row(), id: `private-${i}` })),
    );
    data.read_scope.limit = 6;
    data.read_scope.limit_reached = true;
    const result = reviewsReply(data);
    expect(result.status).toBe('verified');
    expect(result.reply.match(/оценка 2 из 5/g)).toHaveLength(5);
    expect(result.reply).toContain('Показаны первые пять полученных отзывов');
    expect(result.reply).toContain('наличие остальных отзывов не проверено');
    expect(result.reply).not.toContain('остальные отзывы есть');
  });
  it('does not invent a lower date bound for the unfiltered owner route', () => {
    const data = value();
    data.read_scope.from_inclusive = null;
    expect(reviewsReply(data).reply).toContain(
      'Нижняя и верхняя временные границы не заданы',
    );
  });
  it.each([
    [
      'contract',
      (d: ReturnType<typeof value>) => (d.read_scope.contract = 'unknown'),
    ],
    [
      'configuration claim',
      (d: ReturnType<typeof value>) =>
        (d.read_scope.configuration_status = 'not_configured'),
    ],
    [
      'unapproved upper bound',
      (d: ReturnType<typeof value>) =>
        (d.read_scope.to_exclusive = '2026-10-01T00:00:00.000Z'),
    ],
    [
      'invalid date',
      (d: ReturnType<typeof value>) =>
        (d.read_scope.from_inclusive = '2026-02-30T00:00:00Z'),
    ],
    [
      'wrong scope',
      (d: ReturnType<typeof value>) => (d.read_scope.scope = 'all_tenants'),
    ],
    [
      'order',
      (d: ReturnType<typeof value>) => (d.read_scope.order = 'rating_desc'),
    ],
    [
      'oversized limit',
      (d: ReturnType<typeof value>) => (d.read_scope.limit = 51),
    ],
    ['count mismatch', (d: ReturnType<typeof value>) => (d.count = 0)],
    [
      'metadata count mismatch',
      (d: ReturnType<typeof value>) => (d.read_scope.returned_count = 0),
    ],
    [
      'claimed truncation',
      (d: ReturnType<typeof value>) => (d.read_scope.limit_reached = true),
    ],
    [
      'out-of-range rating',
      (d: ReturnType<typeof value>) => (d.reviews[0].rating = 0),
    ],
    [
      'rating mismatch',
      (d: ReturnType<typeof value>) => (d.read_scope.rating_exact = 1),
    ],
    [
      'date outside filter',
      (d: ReturnType<typeof value>) =>
        (d.read_scope.from_inclusive = '2026-10-01T00:00:00.000Z'),
    ],
    [
      'invalid occurrence',
      (d: ReturnType<typeof value>) =>
        (d.reviews[0].occurred_at = new Date(NaN)),
    ],
    [
      'private topics',
      (d: ReturnType<typeof value>) =>
        (d.reviews[0].topics = ['SECRET_SENTINEL']),
    ],
    [
      'privacy missing',
      (d: ReturnType<typeof value>) => (d.privacy = 'raw_text'),
    ],
  ])('blocks %s without disclosing payload', (_name, mutate) => {
    const data = value();
    mutate(data);
    const result = reviewsReply(data);
    expect(result.status).toBe('blocked');
    expect(result.reply).not.toMatch(/SECRET|оценка 2|настроены/);
  });
  it('rejects stale, legacy/unreadable and staff-unavailable results rather than deriving a missing configuration', () => {
    for (const data of [
      null,
      [],
      {},
      { configured: false, source: 'not_configured', reviews: [] },
      {
        configured: false,
        source: 'not_measured',
        reviews: [],
        limitation: 'review_registry_has_no_exact_staff_subject',
      },
      { ...value(), stale: true },
    ]) {
      expect(reviewsReply(data).status).toBe('blocked');
      expect(reviewsReply(data).reply).not.toContain('не настроен');
    }
    expect(reviewsReply(value(), true).status).toBe('blocked');
  });
  it('rejects array enum values instead of coercing them into approved strings', () => {
    expect(
      reviewsReply({ ...value(), source: ['tenant_review_registry'] }).status,
    ).toBe('blocked');
    expect(
      reviewsReply({
        ...value(),
        read_scope: { ...value().read_scope, scope: ['tenant'] },
      }).status,
    ).toBe('blocked');
    expect(
      reviewsReply({
        ...value(),
        read_scope: {
          ...value().read_scope,
          configuration_status: ['not_observed'],
        },
      }).status,
    ).toBe('blocked');
  });
  it('refuses inconsistent descending source order', () => {
    const data = value([
      row(),
      { ...row(), occurred_at: new Date('2026-09-21T12:00:00.000Z') },
    ]);
    expect(reviewsReply(data).status).toBe('blocked');
  });
});

describe('exact calendar reviews presentation', () => {
  const scope = {
    branchId: 'branch-current',
    timezone: 'Europe/Moscow',
    period: 'named_month' as const,
    month: '2026-09',
    fromInclusive: '2026-08-31T21:00:00.000Z',
    toExclusive: '2026-09-30T21:00:00.000Z',
    rating: 2,
    limit: 20,
  };
  function fixture() {
    return {
      status: 'completed',
      replayed: false,
      result: {
        source: 'tenant_review_registry',
        privacy: 'review_text_redacted_from_ai',
        count: 1,
        reviews: [
          {
            rating: 2,
            occurred_at: '2026-09-04T10:00:00.000Z',
            topics: ['wait'],
          },
        ],
        read_scope: {
          contract: 'maya.review-registry-query/2',
          month: scope.month,
          timezone: scope.timezone,
          from_inclusive: scope.fromInclusive,
          to_exclusive: scope.toExclusive,
          branch_id: scope.branchId,
          rating_mode: 'exact',
          rating_exact: 2,
          scope: 'one_branch',
          order: 'occurred_at_desc',
          limit: 20,
          returned_count: 1,
          has_more: false,
          configuration_status: 'not_observed',
          observed_at: '2026-10-09T12:00:00.000Z',
        },
      },
    };
  }
  it('shows exact interval, rating, source and saved qualification without low-rating inference', () => {
    const x = fixture();
    x.replayed = true;
    const result = reviewsCalendarReply(x, scope);
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('Сохранённый');
    expect(result.reply).toContain('2026-09');
    expect(result.reply).toContain('ровно 2');
    expect(result.reply).toContain(scope.toExclusive);
    expect(result.reply).not.toMatch(/плох|низк|branch-current/);
  });
  it('qualifies observed empty as verified local-registry evidence', () => {
    const x = fixture();
    x.result.reviews = [];
    x.result.count = 0;
    x.result.read_scope.returned_count = 0;
    const result = reviewsCalendarReply(x, scope);
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('в локальном реестре отзывы не найдены');
    expect(result.reply).not.toContain('не настроен');
  });
  it.each([
    'stale',
    'scope',
    'upper',
    'rating',
    'pii',
    'array',
    'malformed-date',
    'more-without-sentinel',
    'order',
  ])('withholds malformed/current source %s', (kind) => {
    const x = fixture();
    if (kind === 'stale') Object.assign(x, { stale: 'false' });
    if (kind === 'scope') x.result.read_scope.branch_id = 'foreign';
    if (kind === 'upper') x.result.reviews[0].occurred_at = scope.toExclusive;
    if (kind === 'rating') x.result.reviews[0].rating = 1;
    if (kind === 'pii')
      Object.assign(x.result.reviews[0], { text: 'PRIVATE_REVIEW' });
    if (kind === 'array')
      Object.assign(x.result.read_scope, { rating_mode: ['exact'] });
    if (kind === 'malformed-date')
      x.result.read_scope.observed_at = '2026-02-30T00:00:00.000Z';
    if (kind === 'more-without-sentinel') x.result.read_scope.has_more = true;
    if (kind === 'order') {
      x.result.reviews.push({
        rating: 2,
        occurred_at: '2026-09-05T00:00:00.000Z',
        topics: [],
      });
      x.result.count = 2;
      x.result.read_scope.returned_count = 2;
    }
    const result = reviewsCalendarReply(x, scope);
    expect(result.status).toBe('blocked');
    expect(result.reply).not.toContain('PRIVATE_REVIEW');
  });
  it('keeps explicit all and visible read/display truncation distinct', () => {
    const x = fixture();
    x.result.reviews = Array.from({ length: 20 }, () => ({
      rating: 5,
      occurred_at: '2026-09-04T10:00:00.000Z',
      topics: [],
    }));
    x.result.count = 20;
    x.result.read_scope.returned_count = 20;
    x.result.read_scope.has_more = true;
    x.result.read_scope.rating_mode = 'all';
    Object.assign(x.result.read_scope, { rating_exact: null });
    const result = reviewsCalendarReply(x, { ...scope, rating: null });
    expect(result.status).toBe('verified');
    expect(result.reply).toContain('все оценки');
    expect(result.reply).toContain('первые 5 из 20');
    expect(result.reply).toContain('дополнительные отзывы');
  });
});
