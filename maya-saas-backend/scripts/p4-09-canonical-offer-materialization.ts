import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
  type Prisma,
} from '@prisma/client';

import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  P4_09_CANONICAL_OFFER_MATERIALIZATION_CONTRACT,
  p409CanonicalOfferMaterializationChecksum,
  p409CanonicalOfferMaterializationManifest,
  p409CanonicalOfferSourceManifestChecksum,
  type P409CanonicalOfferMaterializationOffer,
} from '../src/business-content/p4-09-canonical-offer-materialization.contract';
import { P409CanonicalOfferAuthorityService } from '../src/business-content/p4-09-canonical-offer-authority.service';
import { P409ValueConfigurationExecutableService } from '../src/business-content/p4-09-value-configuration-executable.service';
import { P409ValueConfigurationShadowService } from '../src/business-content/p4-09-value-configuration-shadow.service';
import { EntitlementsService } from '../src/entitlements/entitlements.service';
import { FeatureRegistryService } from '../src/entitlements/feature-registry.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';

const APPLY_CONFIRMATION = 'APPLY_APPROVED_9_CANONICAL_OFFERS';
const APPROVED_TEMPLATE_KEYS = p409CanonicalOfferMaterializationManifest().map(
  (offer) => offer.templateKey,
);

type Mode = 'dry-run' | 'apply';

interface Options {
  mode: Mode;
  expectedManifestChecksum: string | null;
  expectedStateChecksum: string | null;
}

interface TargetScope {
  tenantId: string;
  tenantFingerprint: string;
  actorUserId: string;
  facts: {
    activeTenants: 2;
    platformBootstrapTenants: 1;
    businessCandidates: 1;
    activeOwnerMemberships: 1;
    branches: number;
    clients: number;
    activeCrmIntegrations: 1;
    activeEntitlements: number;
    defaultCurrency: 'RUB';
  };
}

interface PlannedOffer {
  kind: 'membership' | 'certificate';
  templateKey: string;
  sourceCatalogVersion: string;
  denomination: 'fixed_money';
  name: string;
  priceKopecks: number;
  currency: 'RUB';
  offerId: string;
  versionId: string;
  valueSnapshotHash: string;
  actionIdentity: string;
  version: 1;
  supersedesOfferId: null;
  externalRef: null;
  currentState: 'ABSENT' | 'EXACT';
  wouldCreateOffer: 0 | 1;
  wouldCreateVersion: 0 | 1;
}

interface DurableSnapshot {
  counts: Record<string, number>;
  digest: string;
}

function parseOptions(argv: readonly string[]): Options {
  let mode: Mode | null = null;
  let expectedManifestChecksum: string | null = null;
  let expectedStateChecksum: string | null = null;
  for (const argument of argv) {
    if (argument === '--dry-run' || argument === '--apply') {
      const next = argument === '--apply' ? 'apply' : 'dry-run';
      if (mode && mode !== next) {
        throw new Error('Choose exactly one of --dry-run or --apply');
      }
      mode = next;
      continue;
    }
    if (argument.startsWith('--expected-manifest-checksum=')) {
      expectedManifestChecksum = argument.slice(argument.indexOf('=') + 1);
      continue;
    }
    if (argument.startsWith('--expected-state-checksum=')) {
      expectedStateChecksum = argument.slice(argument.indexOf('=') + 1);
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  if (!mode) throw new Error('Explicit --dry-run or --apply is required');
  if (
    mode === 'apply' &&
    (!/^[a-f0-9]{64}$/.test(expectedManifestChecksum ?? '') ||
      !/^[a-f0-9]{64}$/.test(expectedStateChecksum ?? ''))
  ) {
    throw new Error(
      'Apply requires exact --expected-manifest-checksum and --expected-state-checksum',
    );
  }
  return { mode, expectedManifestChecksum, expectedStateChecksum };
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function actionSecret(key: string): string {
  const value =
    process.env[key]?.trim() ?? process.env.CRM_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Canonical materialization request is malformed');
  }
  return value as Record<string, unknown>;
}

function isPlatformBootstrap(
  slug: string,
  themeJson: Prisma.JsonValue | null,
): boolean {
  if (slug.toLowerCase() === 'maya-os') return true;
  if (!themeJson || typeof themeJson !== 'object' || Array.isArray(themeJson)) {
    return false;
  }
  return themeJson.platform_bootstrap === true;
}

async function discoverTarget(prisma: PrismaClient): Promise<TargetScope> {
  const now = new Date();
  const active = await prisma.tenant.findMany({
    where: { status: TenantStatus.active },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      slug: true,
      defaultCurrency: true,
      planId: true,
      brandingSettings: { select: { themeJson: true } },
      memberships: {
        where: {
          status: MembershipStatus.active,
          role: { in: [UserRole.tenant_owner, UserRole.business_owner] },
        },
        select: { userId: true, role: true },
      },
      crmIntegration: { select: { status: true } },
      entitlements: {
        where: { enabled: true },
        select: { expiresAt: true },
      },
      _count: { select: { branches: true, clients: true } },
    },
  });
  const platform = active.filter((tenant) =>
    isPlatformBootstrap(
      tenant.slug,
      tenant.brandingSettings?.themeJson ?? null,
    ),
  );
  const business = active.filter((tenant) => {
    const activeEntitlements = tenant.entitlements.filter(
      (entitlement) =>
        entitlement.expiresAt === null || entitlement.expiresAt > now,
    ).length;
    return (
      !isPlatformBootstrap(
        tenant.slug,
        tenant.brandingSettings?.themeJson ?? null,
      ) &&
      tenant.planId !== null &&
      tenant.defaultCurrency === 'RUB' &&
      tenant.memberships.length === 1 &&
      tenant._count.branches > 0 &&
      tenant._count.clients > 0 &&
      tenant.crmIntegration?.status === 'active' &&
      activeEntitlements > 0
    );
  });
  if (active.length !== 2 || platform.length !== 1 || business.length !== 1) {
    throw new Error(
      'Production tenant topology changed; expected one platform shell and one exact business tenant',
    );
  }
  const target = business[0];
  const activeEntitlements = target.entitlements.filter(
    (entitlement) =>
      entitlement.expiresAt === null || entitlement.expiresAt > now,
  ).length;
  assert.equal(target.memberships.length, 1);
  return {
    tenantId: target.id,
    tenantFingerprint: fingerprint(target.id),
    actorUserId: target.memberships[0].userId,
    facts: {
      activeTenants: 2,
      platformBootstrapTenants: 1,
      businessCandidates: 1,
      activeOwnerMemberships: 1,
      branches: target._count.branches,
      clients: target._count.clients,
      activeCrmIntegrations: 1,
      activeEntitlements,
      defaultCurrency: 'RUB',
    },
  };
}

async function customerValueSnapshot(
  prisma: PrismaClient,
): Promise<DurableSnapshot> {
  const [
    subscriptions,
    usages,
    certificates,
    redemptions,
    rewardIssuances,
    rewards,
    rewardFulfillments,
    loyaltyAccounts,
    loyaltyTransactions,
  ] = await Promise.all([
    prisma.customerSubscription.findMany({ orderBy: { id: 'asc' } }),
    prisma.customerSubscriptionUsage.findMany({ orderBy: { id: 'asc' } }),
    prisma.giftCertificate.findMany({ orderBy: { id: 'asc' } }),
    prisma.giftCertificateRedemption.findMany({ orderBy: { id: 'asc' } }),
    prisma.referralRewardIssuance.findMany({ orderBy: { id: 'asc' } }),
    prisma.referralReward.findMany({ orderBy: { id: 'asc' } }),
    prisma.referralRewardFulfillment.findMany({ orderBy: { id: 'asc' } }),
    prisma.loyaltyAccount.findMany({ orderBy: { id: 'asc' } }),
    prisma.loyaltyTransaction.findMany({ orderBy: { id: 'asc' } }),
  ]);
  const rows = {
    subscriptions,
    usages,
    certificates,
    redemptions,
    rewardIssuances,
    rewards,
    rewardFulfillments,
    loyaltyAccounts,
    loyaltyTransactions,
  };
  return {
    counts: Object.fromEntries(
      Object.entries(rows).map(([key, values]) => [key, values.length]),
    ),
    digest: p409CanonicalOfferMaterializationChecksum(rows),
  };
}

async function paymentSnapshot(prisma: PrismaClient): Promise<DurableSnapshot> {
  const payments = await prisma.billingPayment.findMany({
    orderBy: { id: 'asc' },
  });
  return {
    counts: { billingPayments: payments.length },
    digest: p409CanonicalOfferMaterializationChecksum(payments),
  };
}

function createPlanner(prisma: PrismaClient) {
  const prismaService = prisma as unknown as PrismaService;
  const entitlements = new EntitlementsService(
    prismaService,
    new FeatureRegistryService(),
  );
  const engine = createStandaloneCanonicalActionEngine(
    prismaService,
    entitlements,
    {
      identitySecret: actionSecret('ACTION_ENGINE_IDENTITY_SECRET'),
      payloadEncryptionSecret: actionSecret(
        'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
      ),
      policyAttestationSecret: actionSecret(
        'ACTION_ENGINE_POLICY_ATTESTATION_SECRET',
      ),
    },
  );
  const tenantContext = {
    assertTenantId: (tenantId: string) => tenantId,
  } as TenantContextService;
  return {
    engine,
    planner: new P409ValueConfigurationShadowService(
      engine.runtime,
      prismaService,
      tenantContext,
    ),
    authority: new P409CanonicalOfferAuthorityService(
      prismaService,
      tenantContext,
    ),
  };
}

async function plannedOffers(
  prisma: PrismaClient,
  target: TargetScope,
  planner: P409ValueConfigurationShadowService,
): Promise<PlannedOffer[]> {
  const sourceOffers = p409CanonicalOfferMaterializationManifest();
  const relevantRows = await prisma.tenantCatalogItem.findMany({
    where: {
      canonicalTemplateKey: { in: [...APPROVED_TEMPLATE_KEYS] },
    },
    include: { currentValueVersion: true },
    orderBy: [{ tenantId: 'asc' }, { canonicalTemplateKey: 'asc' }],
  });
  if (relevantRows.some((offer) => offer.tenantId !== target.tenantId)) {
    throw new Error(
      'Approved template keys unexpectedly exist outside the exact business tenant',
    );
  }

  const plans: PlannedOffer[] = [];
  for (const source of sourceOffers) {
    const matching = relevantRows.filter(
      (offer) =>
        offer.tenantId === target.tenantId &&
        offer.kind === source.kind &&
        offer.canonicalTemplateKey === source.templateKey,
    );
    if (matching.length > 1) {
      throw new Error(`Ambiguous canonical mapping: ${source.templateKey}`);
    }
    if (
      relevantRows.some(
        (offer) =>
          offer.canonicalTemplateKey === source.templateKey &&
          offer.kind !== source.kind,
      )
    ) {
      throw new Error(`Canonical offer kind conflicts: ${source.templateKey}`);
    }
    const request = await planner.buildOfferRequest(
      target.tenantId,
      target.actorUserId,
      {
        sourceIntentRef: `p4-09:controlled-materialization:v1:${source.kind}:${source.templateKey}`,
        kind: source.kind,
        operation: 'create',
        templateKey: source.templateKey,
        name: source.name,
        description: source.description,
        priceKopecks: source.priceKopecks,
        currency: source.currency,
        active: true,
        externalRef: source.externalRef,
      },
      'execute',
    );
    const input = asRecord(request.input);
    assert.equal(input.offerKind, source.kind);
    assert.equal(input.templateKey, source.templateKey);
    assert.equal(input.priceKopecks, source.priceKopecks);
    assert.equal(input.currency, source.currency);
    assert.equal(input.availabilityState, 'ACTIVE');
    assert.equal(input.previousVersionId, null);
    assert.equal(input.nextVersion, 1);
    assert.equal(input.supersedesOfferId, null);
    assert.equal(input.externalRef, null);
    const offerId = String(input.offerId);
    const versionId = String(input.versionId);
    const valueSnapshotHash = String(input.valueSnapshotHash);
    const actionIdentity = request.callerIdempotency?.key;
    if (!actionIdentity) {
      throw new Error('Canonical materialization action identity is absent');
    }
    assert.equal(request.targetRef, `tenant-catalog-item:${offerId}`);
    const existing = matching[0] ?? null;
    if (existing) {
      const version = existing.currentValueVersion;
      if (
        existing.id !== offerId ||
        existing.source !== 'canonical_action_engine' ||
        existing.name !== source.name ||
        existing.description !== null ||
        existing.priceKopecks !== source.priceKopecks ||
        existing.currency !== source.currency ||
        !existing.active ||
        existing.externalRef !== null ||
        existing.supersedesOfferId !== null ||
        existing.currentValueVersionId !== versionId ||
        !version ||
        version.id !== versionId ||
        version.version !== 1 ||
        version.previousVersionId !== null ||
        version.templateKey !== source.templateKey ||
        version.offerKind !== source.kind ||
        version.priceKopecks !== source.priceKopecks ||
        version.currency !== source.currency ||
        version.availabilityState !== 'ACTIVE' ||
        version.valueSnapshotHash !== valueSnapshotHash
      ) {
        throw new Error(
          `Existing canonical offer differs from approved mapping: ${source.templateKey}`,
        );
      }
    }
    plans.push({
      kind: source.kind,
      templateKey: source.templateKey,
      sourceCatalogVersion: source.sourceCatalogVersion,
      denomination: 'fixed_money',
      name: source.name,
      priceKopecks: source.priceKopecks,
      currency: source.currency,
      offerId,
      versionId,
      valueSnapshotHash,
      actionIdentity,
      version: 1,
      supersedesOfferId: null,
      externalRef: null,
      currentState: existing ? 'EXACT' : 'ABSENT',
      wouldCreateOffer: existing ? 0 : 1,
      wouldCreateVersion: existing ? 0 : 1,
    });
  }
  assert.equal(plans.length, 9);
  assert.equal(new Set(plans.map((plan) => plan.offerId)).size, 9);
  assert.equal(new Set(plans.map((plan) => plan.versionId)).size, 9);
  return plans;
}

async function operationalState(
  prisma: PrismaClient,
  target: TargetScope,
  plans: readonly PlannedOffer[],
  customerValue: DurableSnapshot,
  payments: DurableSnapshot,
) {
  const targetRefs = plans.map((plan) => `tenant-catalog-item:${plan.offerId}`);
  const [catalogRows, versionRows, replacementRows, executions] =
    await Promise.all([
      prisma.tenantCatalogItem.count(),
      prisma.tenantCatalogItemValueVersion.count(),
      prisma.tenantCatalogItem.count({
        where: {
          OR: [
            { supersedesOfferId: { not: null } },
            { replacementOffer: { isNot: null } },
          ],
        },
      }),
      prisma.actionExecution.findMany({
        where: {
          capability: {
            in: [
              'value-configuration.membership.create.execute.v1',
              'value-configuration.certificate.create.execute.v1',
            ],
          },
        },
        select: {
          tenantId: true,
          targetRef: true,
          actionClass: true,
          state: true,
        },
        orderBy: [{ tenantId: 'asc' }, { targetRef: 'asc' }],
      }),
    ]);
  if (
    executions.some(
      (execution) =>
        execution.tenantId !== target.tenantId ||
        !targetRefs.includes(execution.targetRef) ||
        ![
          'create_customer_membership_offer',
          'create_gift_certificate_offer',
        ].includes(execution.actionClass),
    )
  ) {
    throw new Error('Unexpected canonical offer creation execution exists');
  }
  if (replacementRows !== 0) {
    throw new Error(
      'Replacement lineage must not be fabricated by establishment',
    );
  }
  return {
    tenantFingerprint: target.tenantFingerprint,
    tenantFacts: target.facts,
    offers: plans.map((plan) => ({
      templateKey: plan.templateKey,
      offerId: plan.offerId,
      versionId: plan.versionId,
      currentState: plan.currentState,
    })),
    catalogRows,
    versionRows,
    replacementRows,
    executions,
    customerValue,
    payments,
  };
}

async function verifyCoverage(
  authority: P409CanonicalOfferAuthorityService,
  target: TargetScope,
  plans: readonly PlannedOffer[],
): Promise<{ p405: string; p406: string }> {
  let p405 = 0;
  let p406 = 0;
  for (const plan of plans) {
    if (plan.kind === 'membership') {
      const offer = await authority.resolveMembershipOffer(
        target.tenantId,
        plan.offerId,
      );
      assert.equal(offer.offerValueVersionId, plan.versionId);
      assert.equal(offer.templateKey, plan.templateKey);
      assert.equal(offer.priceKopecks, plan.priceKopecks);
      p405 += 1;
    } else {
      const offer = await authority.resolveCertificateOffer(
        target.tenantId,
        plan.offerId,
      );
      assert.equal(offer.offerValueVersionId, plan.versionId);
      assert.equal(offer.templateKey, plan.templateKey);
      assert.equal(offer.nominalAmountKopecks, plan.priceKopecks);
      p406 += 1;
    }
  }
  return { p405: `${p405}/6`, p406: `${p406}/3` };
}

function sourceFor(
  offer: P409CanonicalOfferMaterializationOffer,
): Record<string, unknown> {
  if (offer.kind === 'membership') {
    return {
      planCode: offer.planCode,
      tier: offer.tier,
      visitsIncluded: offer.visitsIncluded,
      termDays: offer.termDays,
      serviceScopeRefs: offer.serviceScopeRefs,
    };
  }
  return {
    productCode: offer.productCode,
    denominationType: offer.denominationType,
    nominalAmountKopecks: offer.nominalAmountKopecks,
    expiryDays: offer.expiryDays,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const target = await discoverTarget(prisma);
    const { engine, planner, authority } = createPlanner(prisma);
    const customerValueBefore = await customerValueSnapshot(prisma);
    const paymentsBefore = await paymentSnapshot(prisma);
    const plans = await plannedOffers(prisma, target, planner);
    const sourceManifestChecksum = p409CanonicalOfferSourceManifestChecksum();
    const manifest = {
      contract: P4_09_CANONICAL_OFFER_MATERIALIZATION_CONTRACT,
      tenantFingerprint: target.tenantFingerprint,
      sourceManifestChecksum,
      mappings: plans.map((plan, index) => ({
        kind: plan.kind,
        templateKey: plan.templateKey,
        sourceCatalogVersion: plan.sourceCatalogVersion,
        denomination: plan.denomination,
        name: plan.name,
        priceKopecks: plan.priceKopecks,
        currency: plan.currency,
        offerId: plan.offerId,
        versionId: plan.versionId,
        valueSnapshotHash: plan.valueSnapshotHash,
        actionIdentity: plan.actionIdentity,
        version: plan.version,
        supersedesOfferId: plan.supersedesOfferId,
        externalRef: plan.externalRef,
        source: sourceFor(p409CanonicalOfferMaterializationManifest()[index]),
      })),
    };
    const manifestChecksum =
      p409CanonicalOfferMaterializationChecksum(manifest);
    const stateBefore = await operationalState(
      prisma,
      target,
      plans,
      customerValueBefore,
      paymentsBefore,
    );
    const stateChecksum =
      p409CanonicalOfferMaterializationChecksum(stateBefore);

    console.log(`MODE: ${options.mode}`);
    console.log(`TARGET TENANT FINGERPRINT: ${target.tenantFingerprint}`);
    console.log(`SOURCE MANIFEST CHECKSUM: ${sourceManifestChecksum}`);
    console.log(`MAPPING MANIFEST CHECKSUM: ${manifestChecksum}`);
    console.log(`PRE-APPLY STATE CHECKSUM: ${stateChecksum}`);
    console.log(`EXACT MAPPINGS: ${plans.length}/9`);
    console.log(
      `WOULD CREATE OFFERS: ${plans.reduce((sum, plan) => sum + plan.wouldCreateOffer, 0)}`,
    );
    console.log(
      `WOULD CREATE VERSIONS: ${plans.reduce((sum, plan) => sum + plan.wouldCreateVersion, 0)}`,
    );
    console.log(JSON.stringify(manifest, null, 2));

    if (options.mode === 'dry-run') {
      console.log('PRODUCTION CONFIGURATION WRITES: 0');
      console.log('CUSTOMER VALUE MUTATIONS: 0');
      console.log('PAYMENTS/PROVIDER WRITES: 0');
      return;
    }

    if (
      process.env.P409_CANONICAL_OFFER_MATERIALIZATION_CONFIRM !==
      APPLY_CONFIRMATION
    ) {
      throw new Error('Apply confirmation is absent or incorrect');
    }
    if (options.expectedManifestChecksum !== manifestChecksum) {
      throw new Error('Approved mapping manifest checksum changed; STOP');
    }
    if (options.expectedStateChecksum !== stateChecksum) {
      throw new Error('Production state changed after dry-run; STOP');
    }

    const executor = new P409ValueConfigurationExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
    );
    const executionResults = [];
    for (const source of p409CanonicalOfferMaterializationManifest()) {
      const request = await planner.buildOfferRequest(
        target.tenantId,
        target.actorUserId,
        {
          sourceIntentRef: `p4-09:controlled-materialization:v1:${source.kind}:${source.templateKey}`,
          kind: source.kind,
          operation: 'create',
          templateKey: source.templateKey,
          name: source.name,
          description: source.description,
          priceKopecks: source.priceKopecks,
          currency: source.currency,
          active: true,
          externalRef: source.externalRef,
        },
        'execute',
      );
      let execution = await engine.ingress.createExecution(request);
      if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
        execution = await engine.kernel.decideApproval({
          tenantId: target.tenantId,
          executionId: execution.id,
          approverUserId: target.actorUserId,
          decision: 'APPROVED',
        });
      }
      if (
        execution.state !== ActionExecutionState.READY &&
        execution.state !== ActionExecutionState.SUCCEEDED
      ) {
        throw new Error(
          `Canonical offer execution is not executable: ${execution.state}`,
        );
      }
      const result = await executor.execute(request);
      assert.equal(result.customerValueMutations, 0);
      assert.equal(result.providerWrites, 0);
      executionResults.push(result);
    }

    const customerValueAfter = await customerValueSnapshot(prisma);
    const paymentsAfter = await paymentSnapshot(prisma);
    assert.deepEqual(customerValueAfter, customerValueBefore);
    assert.deepEqual(paymentsAfter, paymentsBefore);
    const rerunPlans = await plannedOffers(prisma, target, planner);
    assert.equal(
      rerunPlans.reduce((sum, plan) => sum + plan.wouldCreateOffer, 0),
      0,
    );
    assert.equal(
      rerunPlans.reduce((sum, plan) => sum + plan.wouldCreateVersion, 0),
      0,
    );
    const coverage = await verifyCoverage(authority, target, rerunPlans);
    const [offers, versions, relevantOffers, replacements, expectedExecutions] =
      await Promise.all([
        prisma.tenantCatalogItem.count({
          where: {
            tenantId: target.tenantId,
            canonicalTemplateKey: { in: [...APPROVED_TEMPLATE_KEYS] },
          },
        }),
        prisma.tenantCatalogItemValueVersion.count({
          where: {
            tenantId: target.tenantId,
            templateKey: { in: [...APPROVED_TEMPLATE_KEYS] },
          },
        }),
        prisma.tenantCatalogItem.findMany({
          where: {
            canonicalTemplateKey: { in: [...APPROVED_TEMPLATE_KEYS] },
          },
          select: { tenantId: true, kind: true, canonicalTemplateKey: true },
        }),
        prisma.tenantCatalogItem.count({
          where: {
            tenantId: target.tenantId,
            OR: [
              { supersedesOfferId: { not: null } },
              { replacementOffer: { isNot: null } },
            ],
          },
        }),
        prisma.actionExecution.count({
          where: {
            tenantId: target.tenantId,
            targetRef: {
              in: rerunPlans.map(
                (plan) => `tenant-catalog-item:${plan.offerId}`,
              ),
            },
            state: ActionExecutionState.SUCCEEDED,
          },
        }),
      ]);
    assert.equal(offers, 9);
    assert.equal(versions, 9);
    const duplicateKeys = relevantOffers.map(
      (offer) =>
        `${offer.tenantId}:${offer.kind}:${offer.canonicalTemplateKey ?? ''}`,
    );
    assert.equal(new Set(duplicateKeys).size, duplicateKeys.length);
    assert.equal(replacements, 0);
    assert.equal(expectedExecutions, 9);
    assert.equal(executionResults.length, 9);

    const finalState = await operationalState(
      prisma,
      target,
      rerunPlans,
      customerValueAfter,
      paymentsAfter,
    );
    console.log(
      `POST-APPLY STATE CHECKSUM: ${p409CanonicalOfferMaterializationChecksum(finalState)}`,
    );
    console.log('CANONICAL OFFERS MATERIALIZED: 9/9');
    console.log('INITIAL OFFER VERSIONS MATERIALIZED: 9/9');
    console.log('DUPLICATES: 0');
    console.log('RE-RUN CREATES NEW ROWS: 0');
    console.log(
      `P4-05 OFFER COVERAGE: ${coverage.p405 === '6/6' ? '100%' : coverage.p405}`,
    );
    console.log(
      `P4-06 OFFER COVERAGE: ${coverage.p406 === '3/3' ? '100%' : coverage.p406}`,
    );
    console.log('HISTORICAL/FROZEN VALUE CHANGED: NO');
    console.log('REPLACEMENT LINEAGE FABRICATED: NO');
    console.log('CUSTOMER VALUE CREATED: 0');
    console.log('PAYMENTS/PROVIDER WRITES: 0');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`P4-09 canonical offer materialization stopped: ${message}`);
    process.exitCode = 1;
  });
}
