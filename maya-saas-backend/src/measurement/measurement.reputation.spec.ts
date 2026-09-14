import { Prisma } from '@prisma/client';
import {
  normalizeMeasurement,
  MeasurementScope,
  NormalizedMeasurementIntent,
} from './measurement.contract';
import {
  MeasurementReputationReader,
  REPUTATION_SCALE,
  ReputationObservation,
  reputationPeriod,
  reputationResult,
} from './measurement.reputation';

const intent = (delta: Partial<NormalizedMeasurementIntent> = {}) =>
  normalizeMeasurement({
    kind: 'reputation_period',
    periodFrom: new Date('2026-07-31T21:00:00Z'),
    periodTo: new Date('2026-08-31T21:00:00Z'),
    timezone: 'Europe/Moscow',
    asOf: new Date('2026-09-01T00:00:00Z'),
    scope: {
      version: 1,
      capabilityKey: 'measurement.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {},
    },
    ...delta,
  });
const facts = (
  delta: Partial<ReputationObservation> = {},
): ReputationObservation => ({
  observedAt: new Date('2026-09-02T00:00:00Z'),
  reviewUpdatedAt: null,
  nativeUpdatedAt: null,
  nativeVersionTotal: '0',
  withdrawn: '0',
  expired: '0',
  invalidNative: '0',
  invalidReview: '0',
  buckets: [],
  ...delta,
});
const nativeIntent = (delta: Partial<NormalizedMeasurementIntent> = {}) =>
  intent({
    ...delta,
    scope: {
      ...intent().scope,
      dimensions: { source: 'native_feedback' },
      ...delta.scope,
    },
  });
const metric = (
  r: ReturnType<typeof reputationResult>,
  key: string,
  source = 'native_feedback',
) => r.metrics.find((m) => m.key === key && m.dimensions.source === source)!;

describe('C7 P05 reputation period facts', () => {
  it('uses exact local calendar months including the prior December and DST', () => {
    expect(reputationPeriod(intent()).previousFrom.toISOString()).toBe(
      '2026-06-30T21:00:00.000Z',
    );
    expect(
      reputationPeriod(
        intent({
          periodFrom: new Date('2025-12-31T21:00:00Z'),
          periodTo: new Date('2026-01-31T21:00:00Z'),
        }),
      ).previousFrom.toISOString(),
    ).toBe('2025-11-30T21:00:00.000Z');
    expect(
      reputationPeriod(
        intent({
          timezone: 'Europe/Berlin',
          periodFrom: new Date('2026-02-28T23:00:00Z'),
          periodTo: new Date('2026-03-31T22:00:00Z'),
        }),
      ).previousFrom.toISOString(),
    ).toBe('2026-01-31T23:00:00.000Z');
  });
  it.each([
    { periodFrom: new Date('2026-08-01T00:00:00Z') },
    { periodTo: new Date('2026-09-01T00:00:00Z') },
    { periodTo: new Date('2026-09-30T21:00:00Z') },
    { asOf: new Date('2026-07-31T20:59:59Z') },
  ])(
    'rejects ambiguous partial date range instead of silently changing it: %p',
    (delta) => {
      expect(() => reputationPeriod(intent(delta))).toThrow(
        'calendar_month_required',
      );
    },
  );
  it.each<Partial<MeasurementScope>>([
    { dimensions: { scale: 'ten_point' } },
    { dimensions: { currency: 'RUB' } },
    { dimensions: { source: 'anonymous_community' } },
    { sourceQuery: { provider: 'yclients' } },
  ])('rejects unsupported dimensions and provider scope: %p', (scope) => {
    expect(() =>
      reputationPeriod(intent({ scope: { ...intent().scope, ...scope } })),
    ).toThrow('scope_not_supported');
  });
  it.each(['staffId', 'clientId', 'configurationUserId'] as const)(
    'does not broaden unproved legacy %s scope',
    (key) => {
      expect(() => reputationPeriod(intent({ [key]: 'exact-id' }))).toThrow(
        'scope_not_supported',
      );
    },
  );
  it('accepts exact canonical native Staff and Client scope without a User', () => {
    expect(
      reputationPeriod(nativeIntent({ staffId: 'staff', clientId: 'client' }))
        .nativeOnly,
    ).toBe(true);
  });
  it('rejects explicit branch outside the permitted branch set', () => {
    expect(() =>
      reputationPeriod(
        intent({
          branchId: 'branch-2',
          scope: { ...intent().scope, branchIds: ['branch-1'] },
        }),
      ),
    ).toThrow('branch_scope_conflict');
  });
  it('separates native and source-labelled reviews, each with its own denominator', () => {
    const result = reputationResult(
      'tenant',
      intent(),
      facts({
        buckets: [
          {
            source: 'business_review/yandex',
            period: 'current',
            count: '2',
            sum: '7',
          },
          {
            source: 'business_review/manual',
            period: 'current',
            count: '1',
            sum: '1',
          },
          {
            source: 'native_feedback',
            period: 'current',
            count: '3',
            sum: '13',
          },
          {
            source: 'native_feedback',
            period: 'previous',
            count: '2',
            sum: '7',
          },
        ],
      }),
    );
    expect(result.sources).toHaveLength(2);
    expect(result.qualification).toBe('SOURCE_LABELLED');
    expect(metric(result, 'average_rating').value).toBe('4.333333');
    expect(metric(result, 'rating_denominator').value).toBe('3');
    expect(metric(result, 'observed_count_delta').value).toBe('1');
    expect(metric(result, 'observed_average_delta').value).toBe('0.833333');
    expect(metric(result, 'observed_average_delta_numerator').value).toBe('5');
    expect(metric(result, 'observed_average_delta_denominator').value).toBe(
      '6',
    );
    expect(metric(result, 'average_rounding').value).toBe(
      'half_away_from_zero_6dp',
    );
    expect(
      metric(result, 'average_rating', 'business_review/yandex').value,
    ).toBe('3.5');
    expect(metric(result, 'verified_client_author_count').value).toBe('3');
    expect(
      metric(result, 'verified_client_author_count', 'business_review/yandex')
        .value,
    ).toBeNull();
    expect(
      metric(result, 'verified_appointment_count', 'business_review/yandex')
        .state,
    ).toBe('NOT_MEASURED');
    expect(
      result.metrics.every((m) => m.dimensions.scale === REPUTATION_SCALE),
    ).toBe(true);
    expect(result.attributionStatus).toBe('NOT_APPLICABLE');
    expect(result.creditedExecutionId).toBeNull();
  });
  it('never claims a verified author because a legacy source calls itself native_feedback', () => {
    const result = reputationResult(
      'tenant',
      intent(),
      facts({
        buckets: [
          {
            source: 'business_review/native_feedback',
            period: 'current',
            count: '1',
            sum: '5',
          },
        ],
      }),
    );
    expect(
      metric(
        result,
        'verified_client_author_count',
        'business_review/native_feedback',
      ).value,
    ).toBeNull();
    expect(metric(result, 'observed_review_count').value).toBe('0');
  });
  it('empty known source has zero observed count but no invented average or average delta', () => {
    const result = reputationResult('tenant', nativeIntent(), facts());
    expect(metric(result, 'observed_review_count').value).toBe('0');
    expect(metric(result, 'average_rating').value).toBeNull();
    expect(metric(result, 'observed_average_delta').value).toBeNull();
    expect(result.completeness).toBe('PARTIAL');
    expect(result.qualification).toBe('VERIFIED');
  });
  it('marks partial months and suppresses non-comparable deltas', () => {
    const result = reputationResult(
      'tenant',
      nativeIntent({ asOf: new Date('2026-08-15T00:00:00Z') }),
      facts({
        buckets: [
          {
            source: 'native_feedback',
            period: 'current',
            count: '2',
            sum: '10',
          },
          {
            source: 'native_feedback',
            period: 'previous',
            count: '4',
            sum: '12',
          },
        ],
      }),
    );
    expect(metric(result, 'average_rating').value).toBe('5');
    expect(metric(result, 'observed_count_delta').value).toBeNull();
    expect(metric(result, 'observed_average_delta').value).toBeNull();
    expect(result.reasons).toContain(
      'partial_calendar_month_comparison_not_measured',
    );
  });
  it('does not fabricate historical state after a latest withdrawal or erasure', () => {
    const result = reputationResult(
      'tenant',
      nativeIntent(),
      facts({
        withdrawn: '1',
        expired: '1',
        nativeVersionTotal: '5',
        nativeUpdatedAt: new Date('2026-09-01T04:00:00Z'),
      }),
    );
    expect(metric(result, 'observed_review_count').value).toBe('0');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'native_withdrawn_responses_excluded',
        'native_expired_or_erased_responses_excluded',
        'source_observed_after_business_cutoff',
      ]),
    );
    expect(result.sources[0].stateHash).not.toBe(
      reputationResult('tenant', nativeIntent(), facts()).sources[0].stateHash,
    );
  });
  it('uses integer arithmetic for large denominators and negative observed deltas', () => {
    const result = reputationResult(
      'tenant',
      nativeIntent(),
      facts({
        buckets: [
          {
            source: 'native_feedback',
            period: 'current',
            count: '9007199254740993',
            sum: '18014398509481986',
          },
          {
            source: 'native_feedback',
            period: 'previous',
            count: '3',
            sum: '10',
          },
        ],
      }),
    );
    expect(metric(result, 'observed_count_delta').value).toBe(
      '9007199254740990',
    );
    expect(metric(result, 'observed_average_delta').value).toBe('-1.333333');
  });
  it('rejects future asOf and out of scale or duplicate query aggregates', () => {
    expect(() =>
      reputationResult(
        'tenant',
        nativeIntent({ asOf: new Date('2027-01-01') }),
        facts(),
      ),
    ).toThrow('as_of_in_future');
    const bucket = {
      source: 'native_feedback',
      period: 'current' as const,
      count: '1',
      sum: '6',
    };
    expect(() =>
      reputationResult('tenant', nativeIntent(), facts({ buckets: [bucket] })),
    ).toThrow('rating_invalid');
    expect(() =>
      reputationResult(
        'tenant',
        nativeIntent(),
        facts({
          buckets: [
            { ...bucket, sum: '5' },
            { ...bucket, sum: '5' },
          ],
        }),
      ),
    ).toThrow('duplicate_bucket');
  });
  it('bounds aggregate receipts and rejects overflow without source truncation', () => {
    const buckets = Array.from({ length: 16 }, (_, n) => ({
      source: `business_review/source_${n}`,
      period: 'current' as const,
      count: '999999',
      sum: '3999996',
    }));
    expect(() =>
      reputationResult('tenant', intent(), facts({ buckets })),
    ).toThrow('source_bound_exceeded');
    const result = reputationResult(
      'tenant',
      intent(),
      facts({ buckets: buckets.slice(0, 15) }),
    );
    expect(result.sources).toHaveLength(2);
    expect(result.metrics).toHaveLength(240);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(262144);
  });
});

describe('C7 P05 exact read authority and query', () => {
  const reader = new MeasurementReputationReader();
  function fixture() {
    return {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'active',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      branch: { count: jest.fn().mockResolvedValue(1) },
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff' }) },
      client: {
        findUnique: jest
          .fn<
            Promise<{ mergedIntoClientId: string | null } | null>,
            [Prisma.ClientFindUniqueArgs]
          >()
          .mockResolvedValue({ mergedIntoClientId: null }),
      },
      appointment: {
        findFirst: jest
          .fn<
            Promise<{ id: string } | null>,
            [Prisma.AppointmentFindFirstArgs]
          >()
          .mockResolvedValue({ id: 'appointment' }),
      },
      $queryRaw: jest
        .fn<Promise<ReputationObservation[]>, [Prisma.Sql]>()
        .mockResolvedValue([facts()]),
    };
  }
  it('rejects tenant timezone mismatch and inactive or unknown tenant', async () => {
    const tx = fixture();
    await expect(
      reader.read(
        'tenant',
        intent({
          timezone: 'UTC',
          periodFrom: new Date('2026-08-01'),
          periodTo: new Date('2026-09-01'),
        }),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('tenant_timezone_required');
    tx.tenant.findUnique.mockResolvedValue(null);
    await expect(
      reader.read(
        'tenant',
        intent(),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('tenant_inactive');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('closes deterministic source overflow as unavailable without truncated facts', async () => {
    const tx = fixture();
    tx.$queryRaw.mockResolvedValue([
      facts({
        buckets: Array.from({ length: 17 }, (_, n) => ({
          source: `business_review/source_${n}`,
          period: 'current' as const,
          count: '1',
          sum: '5',
        })),
      }),
    ]);
    const result = await reader.read(
      'tenant',
      intent(),
      tx as unknown as Prisma.TransactionClient,
    );
    expect(result.completeness).toBe('UNAVAILABLE');
    expect(result.qualification).toBe('UNQUALIFIED');
    expect(result.metrics).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.reasons).toEqual(['reputation_source_bound_exceeded']);
    tx.$queryRaw.mockRejectedValue(Error('infrastructure_unavailable'));
    await expect(
      reader.read(
        'tenant',
        intent(),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('infrastructure_unavailable');
  });
  it('rejects missing branch, merged Client, and inaccessible Staff before reading aggregates', async () => {
    const tx = fixture();
    tx.branch.count.mockResolvedValue(0);
    await expect(
      reader.read(
        'tenant',
        nativeIntent({ branchId: 'foreign' }),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('branch_mismatch');
    tx.client.findUnique.mockResolvedValue({ mergedIntoClientId: 'other' });
    await expect(
      reader.read(
        'tenant',
        nativeIntent({ clientId: 'merged' }),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('client_not_canonical');
    tx.staff.findFirst.mockResolvedValue(null);
    await expect(
      reader.read(
        'tenant',
        nativeIntent({ staffId: 'foreign' }),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('staff_mismatch');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not broaden branch and Staff/Client/Appointment scope; selects current R08 pointer atomically', async () => {
    const tx = fixture();
    await reader.read(
      'tenant',
      nativeIntent({
        branchId: 'branch',
        staffId: 'staff',
        clientId: 'client',
        appointmentId: 'appointment',
        scope: { ...nativeIntent().scope, branchIds: ['branch'] },
      }),
      tx as unknown as Prisma.TransactionClient,
    );
    expect(tx.client.findUnique.mock.calls[0][0].select).toEqual({
      mergedIntoClientId: true,
    });
    expect(tx.appointment.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'appointment',
      tenantId: 'tenant',
      staffId: 'staff',
      branchId: 'branch',
    });
    expect(tx.appointment.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      'mayaClientId',
    );
    const query = tx.$queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('latest.version=q."latestResponseVersion"');
    expect(query.sql).toContain('first.version=1');
    expect(query.sql).toContain('a."mayaClientId"=q."clientId"');
    expect(query.sql).toContain('c."tenantId"=q."tenantId"');
    expect(query.sql).toContain('WHERE valid AND NOT expired');
    expect(query.sql).toContain('LIMIT 34');
    expect(query.sql).not.toMatch(
      /PublicCommunityComment|commentEncrypted|encryptedText|userId|staffExternalId/,
    );
    expect(query.values).toEqual(
      expect.arrayContaining([
        'tenant',
        'branch',
        'staff',
        'client',
        'appointment',
      ]),
    );
  });
});
