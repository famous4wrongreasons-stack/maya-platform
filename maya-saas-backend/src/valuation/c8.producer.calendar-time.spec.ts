import type { C8ResultRevision, Prisma } from '@prisma/client';
import { C8Producer } from './c8.producer';
import type { C8Lease, C8Store } from './c8.store';
import type { C8DeterministicOutput } from './c8.deterministic';
import type { C8Ref } from './c8.contract';
import { C8CalendarInstantUnavailable } from './c8.time';

// Actual resume, deterministic computation, policy parser and calendar helper.
// Source/store ports model one admitted row and its existing lease only. This
// does not prove SQL fences, transaction durability or process restart.
function fixture(lastVisit = '2026-01-08T07:30:45.123Z') {
  const at = new Date('2026-11-02T12:00:00.000Z');
  const ref = {
    owner: 'MeasurementRevision',
    tenantId: 'tenant',
    id: 'measurement',
    revisionOrStateHash: 'a'.repeat(64),
    observedAt: at.toISOString(),
    asOf: at.toISOString(),
    qualification: 'VERIFIED',
    coverage: 'PARTIAL',
    expiresAt: '2099-01-01T00:00:00.000Z',
  } satisfies C8Ref;
  let current: C8ResultRevision = {
    id: 'result',
    tenantId: 'tenant',
    kind: 'POLICY_SIGNAL',
    subjectKind: 'client',
    subjectId: 'synthetic-client',
    identityHash: 'd'.repeat(64),
    revision: 1,
    intentHash: 'e'.repeat(64),
    contractVersion: 1,
    ruleKey: 'c8.dormancy/two_months',
    ruleVersion: 1,
    modelVersionId: null,
    modelManifestHash: null,
    policyRevisionId: 'policy',
    policyContentHash: 'b'.repeat(64),
    t0: at,
    horizonEnd: null,
    periodFrom: new Date(lastVisit),
    periodTo: at,
    timezone: 'America/New_York',
    scopeJson: { branchIds: [], serviceScope: [] },
    basis: 'proven_attendance_policy',
    currency: null,
    completeness: 'PARTIAL',
    qualification: 'VERIFIED',
    eligibility: 'ELIGIBLE',
    admittedAt: at,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    state: 'PENDING',
    leaseGeneration: 7,
    leaseTokenHash: 'f'.repeat(64),
    leaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    publishedAt: null,
    snapshotHash: null,
    inputHash: '1'.repeat(64),
    evidenceRefsJson: [ref],
    valuesJson: null,
    uncertaintyJson: null,
    reasonsJson: null,
    rankingJson: null,
    inputSnapshotJson: {
      version: 1,
      features: [
        {
          key: 'last_proven_visit_at',
          value: lastVisit,
          unit: 'instant',
          basis: 'proven_attendance',
          currency: null,
          sourceRefs: [ref],
        },
      ],
      missingness: [],
      coverage: 'PARTIAL',
      dependencies: [],
    },
  };
  const policy = {
    id: current.policyRevisionId,
    hash: current.policyContentHash,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    content: {
      version: 1,
      valueMeasures: [],
      predictionTargets: [],
      dormancyRules: [
        {
          ruleKey: 'two_months',
          serviceScope: [],
          elapsed: { unit: 'calendar_month', count: 2 },
          comparison: 'gt',
          evidence: 'proven_attendance',
          minimumCoverage: 'PARTIAL',
        },
      ],
      rankingObjectives: [],
      minimumEvidence: [],
      exclusions: {
        serviceScope: [],
        branchIds: [],
        subjectStates: [],
        requiredFeatures: [],
      },
      opportunityAdmission: { enabled: false, rules: [] },
      modelUse: [],
    },
  };
  const lease: C8Lease = {
    table: 'C8ResultRevision',
    id: current.id,
    tenantId: current.tenantId,
    generation: 7,
    token: 'synthetic-lease-token',
  };
  const tx = {} as Prisma.TransactionClient;
  const computeErrors: unknown[] = [];
  const computed: C8DeterministicOutput[] = [];
  const sources = {
    policy: jest
      .fn<Promise<typeof policy>, [Prisma.TransactionClient]>()
      .mockResolvedValue(policy),
  };
  const store = {
    result: jest
      .fn<ReturnType<C8Store['result']>, Parameters<C8Store['result']>>()
      .mockImplementation((id) => {
        expect(id).toBe(current.id);
        return Promise.resolve(current);
      }),
    claim: jest
      .fn<ReturnType<C8Store['claim']>, Parameters<C8Store['claim']>>()
      .mockResolvedValue(lease),
    publishResult: jest
      .fn<
        ReturnType<C8Store['publishResult']>,
        Parameters<C8Store['publishResult']>
      >()
      .mockImplementation(async (ownedLease, compute) => {
        expect(ownedLease).toBe(lease);
        // A rejected callback leaves the synthetic row PENDING, as a rolled
        // back publication transaction would. Do not synthesize success here.
        let output: C8DeterministicOutput;
        try {
          output = await compute(current, tx);
        } catch (error) {
          computeErrors.push(error);
          throw error;
        }
        computed.push(output);
        current = { ...current, state: 'PUBLISHED' };
      }),
    publishUnavailable: jest
      .fn<
        ReturnType<C8Store['publishUnavailable']>,
        Parameters<C8Store['publishUnavailable']>
      >()
      .mockImplementation((ownedLease, reasons) => {
        expect(ownedLease).toBe(lease);
        current = {
          ...current,
          state: 'UNAVAILABLE',
          valuesJson: null,
          reasonsJson: reasons.map((code) => ({
            code,
            featureRefs: [],
            evidenceRefs: [],
            parameters: {},
          })),
        };
        return Promise.resolve();
      }),
  };
  const producer = new C8Producer(
    store as never,
    sources as never,
    {} as never,
    {} as never,
  );
  return {
    producer,
    store,
    sources,
    lease,
    tx,
    policy,
    computeErrors,
    computed,
    row: () => current,
    resume: () => producer.resume('result'),
  };
}

describe('C8 producer calendar ambiguity becomes an unavailable result', () => {
  it.each([
    ['1880-01-01T12:00:45.123Z', 'Europe/Paris'],
    ['0099-12-31T12:34:56.789Z', 'UTC'],
  ])(
    'version 1 does not publish a corrected historical deadline as newly usable (%s)',
    async (visit, timezone) => {
      const f = fixture(visit);
      f.row().timezone = timezone;
      expect((await f.resume()).state).toBe('UNAVAILABLE');
      expect(f.computeErrors[0]).toBeInstanceOf(C8CalendarInstantUnavailable);
      expect(f.store.publishUnavailable).toHaveBeenCalledWith(f.lease, [
        'calendar_instant_unavailable',
      ]);
      expect(f.computed).toEqual([]);
    },
  );
  it.each([
    ['spring gap', '2026-01-08T07:30:45.123Z'],
    ['fall fold', '2026-09-01T05:30:45.123Z'],
  ])(
    'actual deterministic %s refusal publishes unavailable under the same lease',
    async (_label, lastVisit) => {
      const f = fixture(lastVisit);
      const result = await f.resume();
      expect(f.computeErrors).toHaveLength(1);
      expect(f.computeErrors[0]).toBeInstanceOf(C8CalendarInstantUnavailable);
      expect(f.store.claim).toHaveBeenCalledTimes(1);
      expect(f.store.claim).toHaveBeenCalledWith('C8ResultRevision', 'result');
      expect(f.store.publishResult).toHaveBeenCalledTimes(1);
      expect(f.sources.policy).toHaveBeenCalledTimes(1);
      expect(f.sources.policy).toHaveBeenCalledWith(f.tx);
      expect(f.computed).toEqual([]);
      expect(f.store.publishUnavailable).toHaveBeenCalledTimes(1);
      expect(f.store.publishUnavailable).toHaveBeenCalledWith(f.lease, [
        'calendar_instant_unavailable',
      ]);
      expect(f.store.publishUnavailable.mock.calls[0][0]).toBe(f.lease);
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.valuesJson).toBeNull();
      expect(result.reasonsJson).toEqual([
        {
          code: 'calendar_instant_unavailable',
          featureRefs: [],
          evidenceRefs: [],
          parameters: {},
        },
      ]);
    },
  );

  it('replays an already unavailable terminal row without another claim, source read or publication', async () => {
    const f = fixture();
    const first = await f.resume();
    const repeated = await f.resume();
    expect(repeated).toBe(first);
    expect(repeated.state).toBe('UNAVAILABLE');
    expect(f.store.claim).toHaveBeenCalledTimes(1);
    expect(f.sources.policy).toHaveBeenCalledTimes(1);
    expect(f.store.publishResult).toHaveBeenCalledTimes(1);
    expect(f.store.publishUnavailable).toHaveBeenCalledTimes(1);
  });

  it('keeps a unique calendar deadline on the existing successful publication path', async () => {
    const f = fixture('2026-01-08T17:30:45.123Z');
    const result = await f.resume();
    expect(result.state).toBe('PUBLISHED');
    expect(f.computeErrors).toEqual([]);
    expect(f.computed).toHaveLength(1);
    expect(f.computed[0].valuesJson.values).toEqual([
      {
        key: 'two_months',
        type: 'policy',
        value: true,
        unit: 'boolean',
        basis: 'proven_attendance_policy',
        currency: null,
      },
    ]);
    expect(f.store.publishUnavailable).not.toHaveBeenCalled();
    await f.resume();
    expect(f.store.claim).toHaveBeenCalledTimes(1);
    expect(f.store.publishResult).toHaveBeenCalledTimes(1);
  });

  it('propagates unrelated actual deterministic failure rather than converting it to a calendar refusal', async () => {
    const f = fixture();
    f.row().inputSnapshotJson = {
      version: 1,
      features: [],
      missingness: [],
      coverage: 'PARTIAL',
      dependencies: [],
    };
    await expect(f.resume()).rejects.toThrow('c8_required_fact_unavailable');
    expect(f.computeErrors).toHaveLength(1);
    expect(f.computeErrors[0]).not.toBeInstanceOf(C8CalendarInstantUnavailable);
    expect(f.store.publishUnavailable).not.toHaveBeenCalled();
    expect(f.row().state).toBe('PENDING');
  });

  it.each([
    'c8_confirmed_policy_unavailable',
    'c8_calendar_instant_unavailable',
  ])(
    'propagates plain policy Error %s without a message-only downgrade',
    async (code) => {
      const f = fixture();
      const error = new Error(code);
      f.sources.policy.mockRejectedValue(error);
      await expect(f.resume()).rejects.toBe(error);
      expect(f.computeErrors).toEqual([error]);
      expect(f.store.publishUnavailable).not.toHaveBeenCalled();
      expect(f.row().state).toBe('PENDING');
    },
  );

  it.each(['database_unavailable', 'c8_publication_fenced'])(
    'propagates publication %s without an unavailable publication or new lease',
    async (code) => {
      const f = fixture();
      const error = new Error(code);
      f.store.publishResult.mockRejectedValue(error);
      await expect(f.resume()).rejects.toBe(error);
      expect(f.store.claim).toHaveBeenCalledTimes(1);
      expect(f.sources.policy).not.toHaveBeenCalled();
      expect(f.store.publishUnavailable).not.toHaveBeenCalled();
      expect(f.row().state).toBe('PENDING');
    },
  );

  it('propagates failure to publish unavailable instead of returning a fabricated terminal result', async () => {
    const f = fixture();
    const error = new Error('c8_publication_fenced');
    f.store.publishUnavailable.mockRejectedValue(error);
    await expect(f.resume()).rejects.toBe(error);
    expect(f.computeErrors[0]).toBeInstanceOf(C8CalendarInstantUnavailable);
    expect(f.store.publishUnavailable).toHaveBeenCalledTimes(1);
    expect(f.store.publishUnavailable).toHaveBeenCalledWith(f.lease, [
      'calendar_instant_unavailable',
    ]);
    expect(f.store.claim).toHaveBeenCalledTimes(1);
    expect(f.store.result).toHaveBeenCalledTimes(1);
    expect(f.row().state).toBe('PENDING');
  });

  it('does not compute or publish when the existing claim is unavailable', async () => {
    const f = fixture();
    f.store.claim.mockResolvedValue(null);
    const result = await f.resume();
    expect(result.state).toBe('PENDING');
    expect(f.store.result).toHaveBeenCalledTimes(2);
    expect(f.store.claim).toHaveBeenCalledTimes(1);
    expect(f.sources.policy).not.toHaveBeenCalled();
    expect(f.store.publishResult).not.toHaveBeenCalled();
    expect(f.store.publishUnavailable).not.toHaveBeenCalled();
  });
});
