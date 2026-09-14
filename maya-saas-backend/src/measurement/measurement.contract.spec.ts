import {
  measurementHash,
  normalizeMeasurement,
  MeasurementIntent,
  selectMeasurementAttribution,
  currentMeasurementOutcomes,
  validateMeasurementResult,
  MeasurementResult,
  normalizeMeasurementResult,
  MEASUREMENT_RETENTION_MS,
} from './measurement.contract';
const intent = (): MeasurementIntent => ({
  kind: 'appointment_outcome',
  clientId: 'c1',
  appointmentId: 'a1',
  periodFrom: new Date('2026-09-01Z'),
  periodTo: new Date('2026-10-01Z'),
  asOf: new Date('2026-09-08Z'),
  timezone: 'UTC',
  scope: {
    version: 1,
    capabilityKey: 'measurement.read',
    branchIds: [],
    dimensions: {},
    sourceQuery: {},
  },
});
const result = (): MeasurementResult => ({
  sources: [],
  dependencies: [],
  metrics: [],
  reasons: [],
  completeness: 'NOT_MEASURED',
  qualification: 'UNQUALIFIED',
  attributionStatus: 'UNATTRIBUTED',
  creditedExecutionId: null,
  creditedAttemptId: null,
});
describe('C7 deterministic measurement contract', () => {
  it('normalizes only set-like branch ordering', () => {
    const a = intent(),
      b = intent();
    a.scope.branchIds = ['b2', 'b1', 'b2'];
    b.scope.branchIds = ['b1', 'b2'];
    expect(normalizeMeasurement(a)).toEqual(normalizeMeasurement(b));
  });
  it('key order does not change hash; array order does', () => {
    expect(measurementHash({ a: 1, b: 2 })).toBe(
      measurementHash({ b: 2, a: 1 }),
    );
    expect(measurementHash([1, 2])).not.toBe(measurementHash([2, 1]));
  });
  it('null is not zero or false', () => {
    expect(new Set([null, 0, false].map(measurementHash)).size).toBe(3);
  });
  it.each([undefined, NaN, Infinity, 0.5])(
    'rejects noncanonical scalar %s',
    (value) => expect(() => measurementHash(value)).toThrow(),
  );
  it('needs canonical Client even with an Appointment', () => {
    const i = intent();
    delete i.clientId;
    expect(() => normalizeMeasurement(i)).toThrow();
  });
  it('does not need a Maya User', () =>
    expect(normalizeMeasurement(intent()).clientId).toBe('c1'));
  it('rejects transport authority overrides', () =>
    expect(() =>
      normalizeMeasurement({
        ...intent(),
        userId: 'fake',
      } as MeasurementIntent),
    ).toThrow());
  it.each(['phone', 'chat_id', 'sql', 'prompt'])(
    'rejects %s in source query',
    (key) => {
      const i = intent();
      i.scope.sourceQuery[key] = 'unsafe';
      expect(() => normalizeMeasurement(i)).toThrow();
    },
  );
  it('rejects invalid timezone', () => {
    const i = intent();
    i.timezone = 'fake-zone';
    expect(() => normalizeMeasurement(i)).toThrow();
  });
  it('rejects reversed periods', () => {
    const i = intent();
    i.periodTo = i.periodFrom;
    expect(() => normalizeMeasurement(i)).toThrow();
  });
  it('retention is exactly 365 days', () =>
    expect(MEASUREMENT_RETENTION_MS).toBe(31_536_000_000));
  it.each(['time_only', 'phone_only', 'legacy_bridge'] as const)(
    'does not credit %s',
    (lineage) =>
      expect(
        selectMeasurementAttribution([
          { executionId: 'e', attemptId: 'a', lineage, confirmed: true },
        ]).attributionStatus,
      ).toBe('UNATTRIBUTED'),
  );
  it('UNKNOWN/nonconfirmed receipt has no credit', () =>
    expect(
      selectMeasurementAttribution([
        {
          executionId: 'e',
          attemptId: 'a',
          lineage: 'exact_receipt',
          confirmed: false,
        },
      ]).creditedExecutionId,
    ).toBeNull());
  it('deduplicates one exact candidate and rejects competing candidates', () => {
    const a = {
      executionId: 'e1',
      attemptId: 'a1',
      lineage: 'exact_receipt' as const,
      confirmed: true,
    };
    expect(selectMeasurementAttribution([a, a]).creditedExecutionId).toBe('e1');
    expect(
      selectMeasurementAttribution([a, { ...a, executionId: 'e2' }]),
    ).toEqual({
      attributionStatus: 'AMBIGUOUS',
      creditedExecutionId: null,
      creditedAttemptId: null,
    });
  });
  it('counts one current outcome despite historical revisions', () => {
    const rows = [
      { tenantId: 't', identityHash: 'i', revision: 1, value: 100 },
      { tenantId: 't', identityHash: 'i', revision: 2, value: 0 },
    ];
    expect(currentMeasurementOutcomes([...rows, rows[1]])).toEqual([rows[1]]);
  });
  it('cannot turn not-measured into zero', () => {
    const r = result();
    r.metrics = [
      {
        key: 'cash',
        dimensions: {},
        unit: 'money_minor',
        currency: 'RUB',
        basis: 'cash',
        state: 'NOT_MEASURED',
        value: '0',
        sourceRefs: [],
      },
    ];
    expect(() => validateMeasurementResult(r, 't')).toThrow();
  });
  it('money requires explicit currency', () => {
    const r = result();
    r.metrics = [
      {
        key: 'cash',
        dimensions: {},
        unit: 'money_minor',
        currency: null,
        basis: 'cash',
        state: 'COMPLETE',
        value: '1',
        sourceRefs: [],
      },
    ];
    expect(() => validateMeasurementResult(r, 't')).toThrow();
  });
  it('cross-tenant evidence cannot publish', () => {
    const r = result();
    r.sources = [
      {
        owner: 'Appointment',
        kind: 'canonical_appointment',
        tenantId: 'other',
        id: 'a',
        stateHash: 'a'.repeat(64),
        observedAt: new Date().toISOString(),
        qualification: 'VERIFIED',
        coverage: 'exact',
      },
    ];
    expect(() => validateMeasurementResult(r, 't')).toThrow();
  });
  it('attribution requires an exact pair', () => {
    const r = result();
    r.attributionStatus = 'ATTRIBUTED';
    expect(() => validateMeasurementResult(r, 't')).toThrow();
  });
  it('ambiguous result cannot carry a credit', () => {
    const r = result();
    r.attributionStatus = 'AMBIGUOUS';
    r.creditedExecutionId = 'e';
    r.creditedAttemptId = 'a';
    expect(() => validateMeasurementResult(r, 't')).toThrow();
  });
});

describe('C7 closed evidence contract', () => {
  const source = (id: string) => ({
    owner: 'Appointment',
    kind: 'canonical_appointment',
    tenantId: 't',
    id,
    stateHash: 'a'.repeat(64),
    observedAt: '2026-09-08T00:00:00.000Z',
    qualification: 'VERIFIED' as const,
    coverage: 'exact',
  });
  it('denies unknown source owner even with a matching tenant', () => {
    expect(() =>
      validateMeasurementResult(
        { ...result(), sources: [{ ...source('a'), owner: 'LLM' }] },
        't',
      ),
    ).toThrow();
  });
  it('does not upgrade source qualification', () => {
    expect(() =>
      validateMeasurementResult(
        {
          ...result(),
          qualification: 'VERIFIED',
          sources: [{ ...source('a'), qualification: 'UNQUALIFIED' }],
        },
        't',
      ),
    ).toThrow();
  });
  it('rejects arbitrary raw evidence payload', () => {
    expect(() =>
      validateMeasurementResult(
        {
          ...result(),
          sources: [{ ...source('a'), rawPayload: 'unsafe' }],
        } as MeasurementResult,
        't',
      ),
    ).toThrow();
  });
  it('evidence order normalizes with metric references intact', () => {
    const metric = {
      key: 'observed_bookings',
      dimensions: {},
      unit: 'count',
      basis: 'canonical_appointment',
      currency: null,
      state: 'PARTIAL' as const,
      value: '1',
      sourceRefs: [0],
    };
    const a = {
      ...result(),
      sources: [source('a'), source('b')],
      metrics: [metric],
    };
    const b = {
      ...a,
      sources: [...a.sources].reverse(),
      metrics: [{ ...metric, sourceRefs: [1] }],
    };
    expect(normalizeMeasurementResult(a, 't')).toEqual(
      normalizeMeasurementResult(b, 't'),
    );
  });
});
