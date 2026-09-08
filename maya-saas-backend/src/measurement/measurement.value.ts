import { Prisma } from '@prisma/client';
import {
  measurementHash,
  MeasurementResult,
  MeasurementSource,
  NormalizedMeasurementIntent,
} from './measurement.contract';
import {
  financeMetric,
  type MeasurementValueRead,
} from './measurement.finance.facts';

/** Exact canonical Client account. There is deliberately no Maya User fallback. */
export async function readMeasurementValueAccount(
  db: Prisma.TransactionClient,
  tenantId: string,
  i: NormalizedMeasurementIntent,
) {
  const client = await db.client.findUnique({
    where: { id_tenantId: { id: i.clientId!, tenantId } },
    select: { mergedIntoClientId: true },
  });
  if (!client || client.mergedIntoClientId)
    throw new Error('measurement_client_not_canonical');
  const links = await db.crmClientLink.findMany({
    where: { tenantId, clientId: i.clientId!, unlinkedAt: null },
    select: {
      id: true,
      clientId: true,
      provider: true,
      externalId: true,
      updatedAt: true,
    },
    orderBy: { id: 'asc' },
    take: 101,
  });
  if (links.length > 100)
    throw new Error('measurement_value_binding_exceeds_bound');
  if (
    links.length &&
    (await db.unresolvedClientIdentityHold.findFirst({
      where: {
        tenantId,
        resolvedAt: null,
        OR: links.map(({ provider, externalId }) => ({ provider, externalId })),
      },
      select: { id: true },
    }))
  )
    throw new Error('measurement_client_identity_unresolved');
  const account = await db.loyaltyAccount.findUnique({
    where: { tenantId_clientId: { tenantId, clientId: i.clientId! } },
    select: {
      id: true,
      tenantId: true,
      clientId: true,
      balance: true,
      source: true,
      updatedAt: true,
      syncedAt: true,
    },
  });
  if (
    !account ||
    (i.scope.dimensions.accountId &&
      i.scope.dimensions.accountId !== account.id)
  )
    throw new Error('measurement_value_account_mismatch');
  const providerLinks = links.filter(
    (link) => link.provider === i.scope.sourceQuery.provider,
  );
  if (providerLinks.length !== 1)
    throw new Error('measurement_value_binding_ambiguous');
  const latest = await db.loyaltyTransaction.findMany({
    where: { tenantId, accountId: account.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
    select: {
      id: true,
      balanceAfter: true,
      createdAt: true,
      actionExecutionId: true,
    },
  });
  const count = await db.loyaltyTransaction.count({
    where: { tenantId, accountId: account.id },
  });
  return { account, link: providerLinks[0], latest, count };
}
export type MeasurementValueAccount = Awaited<
  ReturnType<typeof readMeasurementValueAccount>
>;

export function measurementValueFacts(
  tenantId: string,
  i: NormalizedMeasurementIntent,
  local: MeasurementValueAccount,
  provider: MeasurementValueRead | null,
  observedAt: string,
  binding: MeasurementSource,
): MeasurementResult {
  const { account, link, latest, count } = local;
  const accountCurrent = account.updatedAt <= i.asOf;
  const validAccount = Number.isSafeInteger(account.balance);
  const validCard =
    provider?.provider === i.scope.sourceQuery.provider &&
    provider.external_client_id === link.externalId &&
    !!provider.external_card_id &&
    Number.isSafeInteger(provider.balance) &&
    provider.balance >= 0;
  const normalizedCard = validCard
    ? {
        cardHash: measurementHash([
          tenantId,
          provider.provider,
          link.id,
          provider.external_card_id,
        ]),
        balance: String(provider.balance),
        unit: 'points',
      }
    : null;
  const sources: MeasurementSource[] = [
    binding,
    {
      owner: 'LoyaltyAccount',
      kind: 'canonical_value_account',
      tenantId,
      id: account.id,
      stateHash: measurementHash(account),
      observedAt,
      qualification: 'VERIFIED',
      coverage: 'canonical_client_account_current',
    },
    {
      owner: 'CrmClientLink',
      kind: 'canonical_value_binding',
      tenantId,
      id: link.id,
      stateHash: measurementHash(link),
      observedAt,
      qualification: 'VERIFIED',
      coverage: 'exact_active_canonical_client_link',
    },
    {
      owner: 'LoyaltyTransaction',
      kind: 'canonical_value_ledger_query',
      tenantId,
      id: measurementHash(['c7.value-ledger/1', tenantId, account.id]),
      stateHash: measurementHash({ latest, count }),
      observedAt,
      qualification: 'VERIFIED',
      coverage: 'latest_stored_ledger_balance_and_count',
    },
    {
      owner: 'ClientLoyaltySnapshot',
      kind: 'canonical_value_card_query',
      tenantId,
      id: measurementHash([
        'c7.value-card/1',
        tenantId,
        i.scope.sourceQuery,
        link.id,
      ]),
      stateHash: measurementHash(normalizedCard),
      observedAt,
      qualification: 'SOURCE_LABELLED',
      coverage: normalizedCard
        ? 'exact_provider_card_observation'
        : 'provider_card_unavailable',
    },
  ];
  // P4 defines these balances as points. A provider's display currency is no FX/value rule.
  const metrics = [
    financeMetric(
      'canonical_value_balance',
      validAccount ? String(account.balance) : null,
      'points',
      'canonical_loyalty_account',
      validAccount ? 'PARTIAL' : 'NOT_MEASURED',
      [1],
    ),
    financeMetric(
      'provider_value_balance',
      normalizedCard?.balance ?? null,
      'points',
      'provider_loyalty_card',
      normalizedCard ? 'PARTIAL' : 'NOT_MEASURED',
      [2, 4],
    ),
    financeMetric(
      'observed_value_difference',
      validAccount && normalizedCard && accountCurrent
        ? String(BigInt(normalizedCard.balance) - BigInt(account.balance))
        : null,
      'points',
      'provider_card_minus_canonical_account',
      validAccount && normalizedCard && accountCurrent
        ? 'PARTIAL'
        : 'NOT_MEASURED',
      [1, 2, 4],
    ),
    financeMetric(
      'stored_ledger_count',
      String(count),
      'count',
      'canonical_value_ledger',
      'COMPLETE',
      [3],
    ),
  ];
  const ledgerProven =
    latest.length > 0 &&
    (latest.length === 1 ||
      latest[0].createdAt.getTime() !== latest[1].createdAt.getTime()) &&
    Number.isSafeInteger(latest[0].balanceAfter) &&
    validAccount;
  metrics.push(
    financeMetric(
      'account_latest_ledger_difference',
      ledgerProven
        ? String(BigInt(account.balance) - BigInt(latest[0].balanceAfter))
        : null,
      'points',
      'account_minus_latest_stored_balance',
      ledgerProven ? 'PARTIAL' : 'NOT_MEASURED',
      [1, 3],
    ),
  );
  return {
    sources,
    dependencies: [],
    metrics,
    reasons: [
      'value_observations_are_not_historical_balance_reconstruction',
      'provider_card_observation_has_no_common_source_timestamp',
      ...(!accountCurrent ? ['source_observed_after_business_cutoff'] : []),
      ...(!normalizedCard ? ['provider_value_card_unavailable'] : []),
      ...(!ledgerProven ? ['latest_ledger_balance_unproven'] : []),
    ],
    completeness: 'PARTIAL',
    qualification: 'SOURCE_LABELLED',
    attributionStatus: 'NOT_APPLICABLE',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
}
