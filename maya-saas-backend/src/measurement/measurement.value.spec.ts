import {
  measurementHash,
  normalizeMeasurement,
  validateMeasurementResult,
  MeasurementSource,
} from './measurement.contract';
import {
  measurementValueFacts,
  MeasurementValueAccount,
  readMeasurementValueAccount,
} from './measurement.value';
const i = () =>
  normalizeMeasurement({
    kind: 'value_discrepancy',
    clientId: 'client-a',
    periodFrom: new Date('2026-09-01Z'),
    periodTo: new Date('2026-10-01Z'),
    asOf: new Date('2026-09-08Z'),
    timezone: 'UTC',
    scope: {
      version: 1,
      capabilityKey: 'clients.dossier.read',
      branchIds: [],
      dimensions: { accountId: 'account-a' },
      sourceQuery: {
        provider: 'yclients',
        integrationId: 'integration-a',
        queryContract: 'c7.value.read.v1',
      },
    },
  });
const local = (): MeasurementValueAccount => ({
  account: {
    id: 'account-a',
    tenantId: 'tenant-a',
    clientId: 'client-a',
    balance: 300,
    source: 'maya',
    updatedAt: new Date('2026-09-01Z'),
    syncedAt: null,
  },
  link: {
    id: 'link-a',
    clientId: 'client-a',
    provider: 'yclients',
    externalId: 'external-a',
    updatedAt: new Date('2026-09-01Z'),
  },
  latest: [
    {
      id: 'tx-a',
      balanceAfter: 300,
      createdAt: new Date('2026-09-01Z'),
      actionExecutionId: 'action-a',
    },
  ],
  count: 1,
});
const binding: MeasurementSource = {
  owner: 'CrmIntegration',
  kind: 'value_query_binding',
  tenantId: 'tenant-a',
  id: 'integration-a',
  stateHash: measurementHash('binding'),
  qualification: 'VERIFIED',
  observedAt: '2026-09-08T00:01:00Z',
  coverage: 'server_bound_query_authority',
};
const card = () => ({
  provider: 'yclients',
  external_client_id: 'external-a',
  external_card_id: 'card-a',
  balance: 450,
  currency: 'EUR',
  sold_amount: 900,
});
describe('C7 P02 value observation discrepancy', () => {
  it('keeps two observed points balances and their difference, without a money valuation', () => {
    const result = measurementValueFacts(
      'tenant-a',
      i(),
      local(),
      card(),
      binding.observedAt,
      binding,
    );
    validateMeasurementResult(result, 'tenant-a');
    expect(
      result.metrics.find((m) => m.key === 'observed_value_difference'),
    ).toMatchObject({
      value: '150',
      state: 'PARTIAL',
      unit: 'points',
      currency: null,
    });
    expect(
      result.metrics.find((m) => m.key === 'account_latest_ledger_difference')
        ?.value,
    ).toBe('0');
    expect(result.reasons).toContain(
      'provider_card_observation_has_no_common_source_timestamp',
    );
    expect(JSON.stringify(result)).not.toContain('external-a');
    expect(JSON.stringify(result)).not.toContain('card-a');
    expect(result.metrics.some((m) => m.unit === 'money_minor')).toBe(false);
  });
  it.each([
    'missing',
    'wrong_client',
    'wrong_provider',
    'missing_card',
    'fractional',
  ])('leaves %s provider value unknown', (condition) => {
    const dto = card();
    if (condition === 'wrong_client') dto.external_client_id = 'other';
    if (condition === 'wrong_provider') dto.provider = 'other';
    if (condition === 'missing_card') dto.external_card_id = '';
    if (condition === 'fractional') dto.balance = 0.5;
    const result = measurementValueFacts(
      'tenant-a',
      i(),
      local(),
      condition === 'missing' ? null : dto,
      binding.observedAt,
      binding,
    );
    expect(
      result.metrics.find((m) => m.key === 'provider_value_balance')?.value,
    ).toBeNull();
    expect(
      result.metrics.find((m) => m.key === 'observed_value_difference')?.value,
    ).toBeNull();
  });
  it('refuses historical discrepancy when the account changed after cutoff', () => {
    const facts = local();
    facts.account.updatedAt = new Date('2026-09-09Z');
    const result = measurementValueFacts(
      'tenant-a',
      i(),
      facts,
      card(),
      binding.observedAt,
      binding,
    );
    expect(
      result.metrics.find((m) => m.key === 'observed_value_difference')?.value,
    ).toBeNull();
    expect(result.reasons).toContain('source_observed_after_business_cutoff');
  });
  it('does not reconstruct a ledger from missing or ambiguously tied rows', () => {
    const facts = local();
    facts.latest.push({ ...facts.latest[0], id: 'tx-b', balanceAfter: 900 });
    const result = measurementValueFacts(
      'tenant-a',
      i(),
      facts,
      card(),
      binding.observedAt,
      binding,
    );
    expect(
      result.metrics.find((m) => m.key === 'account_latest_ledger_difference')
        ?.value,
    ).toBeNull();
  });
  it('queries exact canonical Client and rejects unresolved holds/multiple active links before value reads', async () => {
    const facts = local();
    const db = {
      client: {
        findUnique: jest.fn(() =>
          Promise.resolve({ mergedIntoClientId: null }),
        ),
      },
      crmClientLink: { findMany: jest.fn(() => Promise.resolve([facts.link])) },
      unresolvedClientIdentityHold: {
        findFirst: jest.fn(() => Promise.resolve<{ id: string } | null>(null)),
      },
      loyaltyAccount: {
        findUnique: jest.fn(() => Promise.resolve(facts.account)),
      },
      loyaltyTransaction: {
        findMany: jest.fn(() => Promise.resolve(facts.latest)),
        count: jest.fn(() => Promise.resolve(1)),
      },
    };
    await readMeasurementValueAccount(db as never, 'tenant-a', i());
    expect(db.loyaltyAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_clientId: { tenantId: 'tenant-a', clientId: 'client-a' },
        },
      }),
    );
    db.unresolvedClientIdentityHold.findFirst.mockResolvedValue({ id: 'hold' });
    await expect(
      readMeasurementValueAccount(db as never, 'tenant-a', i()),
    ).rejects.toThrow('measurement_client_identity_unresolved');
    db.unresolvedClientIdentityHold.findFirst.mockResolvedValue(null);
    db.crmClientLink.findMany.mockResolvedValue([
      facts.link,
      { ...facts.link, id: 'second' },
    ]);
    await expect(
      readMeasurementValueAccount(db as never, 'tenant-a', i()),
    ).rejects.toThrow('measurement_value_binding_ambiguous');
  });
});
