import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  CalendarSource,
  MembershipStatus,
  Prisma,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

const NOW = new Date('2026-09-03T00:00:00.000Z');

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p409_lineage_')) {
    throw new Error(
      'P4-09 lineage proof refuses non-disposable databases; expected maya_c06_p409_lineage_*',
    );
  }
  return value;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function expectRejected(run: () => Promise<unknown>, label: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${label} must be rejected`);
}

async function createScope(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p409_lineage_${label}_${suffix}`;
  const ownerId = `owner_p409_lineage_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-09 lineage proof ${label}`,
      slug: `p4-09-lineage-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
      users: {
        create: {
          id: ownerId,
          email: `${ownerId}@proof.invalid`,
          passwordHash: 'not-real',
          role: UserRole.tenant_owner,
          memberships: {
            create: {
              tenantId,
              role: UserRole.tenant_owner,
              status: MembershipStatus.active,
            },
          },
        },
      },
    },
  });
  const firstClient = await prisma.client.create({ data: { tenantId } });
  const secondClient = await prisma.client.create({ data: { tenantId } });
  return { tenantId, ownerId, firstClient, secondClient };
}

async function createApprovedExecution(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    approverUserId: string;
    actionClass: string;
    offerId: string;
    label: string;
    identityMaterial?: string;
  },
) {
  const executionId = `exec_p409_lineage_${randomUUID()}`;
  const identityMaterial = input.identityMaterial ?? input.label;
  const normalizedInputHash = hash(`input:${identityMaterial}`);
  return prisma.actionExecution.create({
    data: {
      id: executionId,
      tenantId: input.tenantId,
      identityVersion: 1,
      identityFingerprint: hash(`identity:${identityMaterial}`),
      idempotencyScope: 'p4-09.offer-replacement-lineage.v1',
      requestIdempotencyKeyHash: hash(`idempotency:${identityMaterial}`),
      sourceType: 'authenticated_request',
      sourceRef: `proof:${input.label}`,
      actorUserId: input.approverUserId,
      actionClass: input.actionClass,
      capability: `p4-09.${input.actionClass}.execute.v1`,
      capabilityVersion: 1,
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${input.offerId}`,
      normalizedInputContract: 'maya.p4-09-offer-replacement-input/1',
      normalizedInputHash,
      evidenceRefsJson: [`proof:${hash(identityMaterial)}`],
      riskProfileVersion: 1,
      riskFacetsJson: ['customer_value_configuration', 'single_target'],
      policyKey: 'p4-09.owner-approved-value-change.v1',
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'L2_OWNER_APPROVED',
      policyDecidedBy: 'p4-09-lineage-schema-proof',
      policyContextContract: 'maya.action-policy-context/1',
      policyContextHash: hash(`policy:${identityMaterial}`),
      policyEvidenceJson: {
        tenantId: input.tenantId,
        singleTarget: true,
        ownerApprovalRequired: true,
      },
      policyEvaluatedAt: NOW,
      policyValidUntil: new Date(NOW.getTime() + 60 * 60 * 1000),
      approvalRequirement: 'REQUIRED',
      approvalDecision: ActionApprovalDecision.APPROVED,
      approvalInputHash: normalizedInputHash,
      approvalBindingHash: hash(`approval:${identityMaterial}`),
      approvalRequestedAt: new Date(NOW.getTime() - 1000),
      approvalExpiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      approvalDecidedAt: NOW,
      approvalDecidedByUserId: input.approverUserId,
      state: ActionExecutionState.SUCCEEDED,
      retryPolicyKey: 'local-postgres-no-blind-retry.v1',
      retryPolicyVersion: 1,
      maxExecutionAttempts: 1,
      executionAttemptCount: 1,
      reconciliationPolicyKey: 'local-postgres-read-committed-result.v1',
      reconciliationPolicyVersion: 1,
      reconciliationState: ActionReconciliationState.NOT_REQUIRED,
      transportIdentityVersion: 1,
      transportIdempotencyKey: `p4-09:${hash(identityMaterial)}`,
      finalOutcomeCode: 'proof_action_succeeded',
      firstAttemptedAt: NOW,
      finalizedAt: NOW,
    },
  });
}

type OfferKind = 'membership' | 'certificate';
type Availability = 'ACTIVE' | 'INACTIVE' | 'RETIRED';

type MaterializeInput = {
  tenantId: string;
  offerId: string;
  versionId: string;
  actionExecutionId: string;
  templateKey: string;
  offerKind: OfferKind;
  priceKopecks: number;
  availabilityState: Exclude<Availability, 'RETIRED'>;
  valueSnapshotHash: string;
  externalRef: string;
  supersedesOfferId?: string | null;
};

async function materializeOffer(prisma: PrismaClient, input: MaterializeInput) {
  return prisma.$transaction(
    async (tx) => {
      const offer = await tx.tenantCatalogItem.create({
        data: {
          id: input.offerId,
          tenantId: input.tenantId,
          kind: input.offerKind,
          name: `P4-09 ${input.offerKind} lineage proof`,
          priceKopecks: input.priceKopecks,
          currency: 'RUB',
          active: input.availabilityState === 'ACTIVE',
          source: 'p4-09-lineage-schema-proof',
          externalRef: input.externalRef,
          canonicalTemplateKey: input.templateKey,
          supersedesOfferId: input.supersedesOfferId ?? null,
        },
      });
      await tx.tenantCatalogItemValueVersion.create({
        data: {
          id: input.versionId,
          tenantId: input.tenantId,
          offerId: input.offerId,
          actionExecutionId: input.actionExecutionId,
          previousVersionId: null,
          version: 1,
          templateKey: input.templateKey,
          offerKind: input.offerKind,
          priceKopecks: input.priceKopecks,
          currency: 'RUB',
          availabilityState: input.availabilityState,
          valueSnapshotHash: input.valueSnapshotHash,
        },
      });
      await tx.tenantCatalogItem.update({
        where: { id: input.offerId },
        data: { currentValueVersionId: input.versionId },
      });
      return offer;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function appendOfferVersion(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    offerId: string;
    versionId: string;
    actionExecutionId: string;
    previousVersionId: string;
    version: number;
    templateKey: string;
    offerKind: OfferKind;
    priceKopecks: number;
    availabilityState: Availability;
    valueSnapshotHash: string;
  },
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.tenantCatalogItemValueVersion.create({
        data: {
          id: input.versionId,
          tenantId: input.tenantId,
          offerId: input.offerId,
          actionExecutionId: input.actionExecutionId,
          previousVersionId: input.previousVersionId,
          version: input.version,
          templateKey: input.templateKey,
          offerKind: input.offerKind,
          priceKopecks: input.priceKopecks,
          currency: 'RUB',
          availabilityState: input.availabilityState,
          valueSnapshotHash: input.valueSnapshotHash,
        },
      });
      await tx.tenantCatalogItem.update({
        where: { id: input.offerId },
        data: {
          currentValueVersionId: input.versionId,
          priceKopecks: input.priceKopecks,
          active: input.availabilityState === 'ACTIVE',
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function retireOffer(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    ownerId: string;
    offerId: string;
    currentVersionId: string;
    currentVersion: number;
    templateKey: string;
    offerKind: OfferKind;
    priceKopecks: number;
    label: string;
  },
) {
  const versionId = `offer_version_${randomUUID()}`;
  const execution = await createApprovedExecution(prisma, {
    tenantId: input.tenantId,
    approverUserId: input.ownerId,
    actionClass:
      input.offerKind === 'membership'
        ? 'delete_customer_membership_offer'
        : 'delete_gift_certificate_offer',
    offerId: input.offerId,
    label: input.label,
    identityMaterial: `${input.label}:${input.offerId}:${input.currentVersionId}`,
  });
  await appendOfferVersion(prisma, {
    tenantId: input.tenantId,
    offerId: input.offerId,
    versionId,
    actionExecutionId: execution.id,
    previousVersionId: input.currentVersionId,
    version: input.currentVersion + 1,
    templateKey: input.templateKey,
    offerKind: input.offerKind,
    priceKopecks: input.priceKopecks,
    availabilityState: 'RETIRED',
    valueSnapshotHash: hash(`${input.label}:retired`),
  });
  return { versionId, executionId: execution.id };
}

async function countLiveAuthorities(
  prisma: PrismaClient,
  tenantId: string,
  kind: string,
  templateKey: string,
) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS count
    FROM "TenantCatalogItem" AS offer
    JOIN "TenantCatalogItemValueVersion" AS version
      ON version."id" = offer."currentValueVersionId"
     AND version."tenantId" = offer."tenantId"
    WHERE offer."tenantId" = ${tenantId}
      AND offer."kind" = ${kind}
      AND offer."canonicalTemplateKey" = ${templateKey}
      AND version."availabilityState" <> 'RETIRED'
  `);
  return Number(rows[0]?.count ?? 0n);
}

async function main() {
  const url = databaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const primary = await createScope(prisma, 'primary');
    const foreign = await createScope(prisma, 'foreign');

    const historical = await prisma.tenantCatalogItem.create({
      data: {
        tenantId: primary.tenantId,
        kind: 'membership',
        name: 'Historical unversioned offer',
        priceKopecks: 100_000,
        externalRef: `historical-${randomUUID()}`,
      },
    });
    assert.equal(historical.canonicalTemplateKey, null);
    assert.equal(historical.supersedesOfferId, null);

    const templateKey = 'complex.senior';
    const offerAId = `offer_a_${randomUUID()}`;
    const offerAV1Id = `offer_version_${randomUUID()}`;
    const offerAV1Hash = hash('offer-a-v1');
    const createA = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: offerAId,
      label: 'offer-a-create',
    });
    await materializeOffer(prisma, {
      tenantId: primary.tenantId,
      offerId: offerAId,
      versionId: offerAV1Id,
      actionExecutionId: createA.id,
      templateKey,
      offerKind: 'membership',
      priceKopecks: 520_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: offerAV1Hash,
      externalRef: 'integration.membership.a',
    });

    const subscription = await prisma.customerSubscription.create({
      data: {
        tenantId: primary.tenantId,
        clientId: primary.firstClient.id,
        termIdentityHash: hash('frozen-subscription-term'),
        planCode: 'complex',
        planSnapshotHash: offerAV1Hash,
        serviceScopeHash: hash('frozen-service-scope'),
        priceKopecks: 520_000,
        currency: 'RUB',
        visitsIncluded: 2,
        status: 'active',
        activatedAt: NOW,
        termStartsAt: NOW,
        termEndsAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
        legacySourceRef: `lineage-subscription-${randomUUID()}`,
      },
    });
    const certificate = await prisma.giftCertificate.create({
      data: {
        tenantId: primary.tenantId,
        issuanceIdentityHash: hash('lineage-certificate'),
        codeHash: hash('lineage-certificate-code'),
        presentationKeyVersion: 'lineage-proof-v1',
        recipientSubjectHash: hash('lineage-recipient'),
        offerSnapshotHash: hash('frozen-certificate-offer'),
        nominalAmountKopecks: 500_000,
        currency: 'RUB',
        paymentStatus: 'paid',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
        paidAt: NOW,
        legacySourceRef: `lineage-certificate-${randomUUID()}`,
      },
    });
    const referral = await prisma.customerReferral.create({
      data: {
        tenantId: primary.tenantId,
        referrerClientId: primary.firstClient.id,
        referredClientId: primary.secondClient.id,
        identityHash: hash('lineage-referral'),
        referredSubjectHash: hash('lineage-referred-subject'),
        referralCodeHash: hash('lineage-referral-code'),
        status: 'qualified',
        joinedAt: NOW,
        resolvedAt: NOW,
        legacySourceRef: `lineage-referral-${randomUUID()}`,
      },
    });
    const issuance = await prisma.referralRewardIssuance.create({
      data: {
        tenantId: primary.tenantId,
        referralId: referral.id,
        policySnapshotHash: hash('frozen-referral-policy'),
        issuedAt: NOW,
        legacySourceRef: `lineage-issuance-${randomUUID()}`,
      },
    });
    const reward = await prisma.referralReward.create({
      data: {
        tenantId: primary.tenantId,
        issuanceId: issuance.id,
        recipientClientId: primary.firstClient.id,
        rewardSlot: 'inviter',
        codeHash: hash('lineage-referral-reward-code'),
        amountKopecks: 30_000,
        currency: 'RUB',
        liabilityCapKopecks: 30_000,
        liabilityCurrency: 'RUB',
        presentationKeyVersion: 'lineage-proof-v1',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    await expectRejected(
      () =>
        prisma.tenantCatalogItem.update({
          where: { id: offerAId },
          data: { id: `mutated_${randomUUID()}` },
        }),
      'active offer immutable identity rewrite',
    );

    const prematureId = `offer_premature_${randomUUID()}`;
    const prematureExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: prematureId,
      label: 'premature-replacement',
      identityMaterial: `replace:${offerAId}:${offerAV1Id}:premature`,
    });
    await expectRejected(
      () =>
        materializeOffer(prisma, {
          tenantId: primary.tenantId,
          offerId: prematureId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: prematureExecution.id,
          templateKey,
          offerKind: 'membership',
          priceKopecks: 530_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('premature-replacement'),
          externalRef: 'integration.membership.premature',
          supersedesOfferId: offerAId,
        }),
      'replacement before predecessor retirement',
    );

    const retiredA = await retireOffer(prisma, {
      tenantId: primary.tenantId,
      ownerId: primary.ownerId,
      offerId: offerAId,
      currentVersionId: offerAV1Id,
      currentVersion: 1,
      templateKey,
      offerKind: 'membership',
      priceKopecks: 520_000,
      label: 'offer-a-retire',
    });
    assert.equal(
      (
        await prisma.tenantCatalogItem.findUniqueOrThrow({
          where: { id: offerAId },
        })
      ).id,
      offerAId,
    );

    const offerBId = `offer_b_${randomUUID()}`;
    const offerBV1Id = `offer_version_${randomUUID()}`;
    const replacementIdentity = `replace:${offerAId}:${retiredA.versionId}:offer-b`;
    const createB = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: offerBId,
      label: 'offer-b-create',
      identityMaterial: replacementIdentity,
    });
    await materializeOffer(prisma, {
      tenantId: primary.tenantId,
      offerId: offerBId,
      versionId: offerBV1Id,
      actionExecutionId: createB.id,
      templateKey,
      offerKind: 'membership',
      priceKopecks: 530_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: hash('offer-b-v1'),
      externalRef: 'integration.membership.b',
      supersedesOfferId: offerAId,
    });
    const offerB = await prisma.tenantCatalogItem.findUniqueOrThrow({
      where: { id: offerBId },
    });
    assert.notEqual(offerB.id, offerAId);
    assert.equal(offerB.supersedesOfferId, offerAId);
    assert.equal(
      await countLiveAuthorities(
        prisma,
        primary.tenantId,
        'membership',
        templateKey,
      ),
      1,
    );
    await expectRejected(
      () =>
        prisma.tenantCatalogItemValueVersion.update({
          where: { id: offerAV1Id },
          data: { priceKopecks: 1 },
        }),
      'historical predecessor version overwrite',
    );

    await prisma.tenantCatalogItem.update({
      where: { id: offerBId },
      data: { externalRef: 'integration.membership.b.rotated' },
    });
    assert.equal(
      (
        await prisma.tenantCatalogItem.findUniqueOrThrow({
          where: { id: offerBId },
        })
      ).supersedesOfferId,
      offerAId,
    );
    await expectRejected(
      () =>
        prisma.tenantCatalogItem.update({
          where: { id: offerBId },
          data: { supersedesOfferId: null },
        }),
      'clearing established lineage',
    );

    const forkId = `offer_fork_${randomUUID()}`;
    const forkExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: forkId,
      label: 'offer-a-conflicting-fork',
      identityMaterial: `replace:${offerAId}:${retiredA.versionId}:fork`,
    });
    await expectRejected(
      () =>
        materializeOffer(prisma, {
          tenantId: primary.tenantId,
          offerId: forkId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: forkExecution.id,
          templateKey,
          offerKind: 'membership',
          priceKopecks: 540_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('offer-a-conflicting-fork'),
          externalRef: 'integration.membership.fork',
          supersedesOfferId: offerAId,
        }),
      'second replacement for one retired predecessor',
    );

    const duplicateRootId = `offer_duplicate_root_${randomUUID()}`;
    const duplicateRootExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: duplicateRootId,
      label: 'duplicate-root',
    });
    await expectRejected(
      () =>
        materializeOffer(prisma, {
          tenantId: primary.tenantId,
          offerId: duplicateRootId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: duplicateRootExecution.id,
          templateKey,
          offerKind: 'membership',
          priceKopecks: 540_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('duplicate-root'),
          externalRef: 'integration.membership.duplicate-root',
        }),
      'second live root for canonical template',
    );

    const foreignReplacementId = `offer_foreign_${randomUUID()}`;
    const foreignExecution = await createApprovedExecution(prisma, {
      tenantId: foreign.tenantId,
      approverUserId: foreign.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: foreignReplacementId,
      label: 'foreign-replacement',
      identityMaterial: `foreign-replace:${offerAId}`,
    });
    await expectRejected(
      () =>
        materializeOffer(prisma, {
          tenantId: foreign.tenantId,
          offerId: foreignReplacementId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: foreignExecution.id,
          templateKey,
          offerKind: 'membership',
          priceKopecks: 530_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('foreign-replacement'),
          externalRef: 'integration.membership.foreign',
          supersedesOfferId: offerAId,
        }),
      'cross-tenant replacement lineage',
    );

    const inactiveTemplate = 'beard.senior';
    const inactiveOfferId = `offer_inactive_${randomUUID()}`;
    const inactiveVersionId = `offer_version_${randomUUID()}`;
    const inactiveExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: inactiveOfferId,
      label: 'inactive-offer-create',
    });
    await materializeOffer(prisma, {
      tenantId: primary.tenantId,
      offerId: inactiveOfferId,
      versionId: inactiveVersionId,
      actionExecutionId: inactiveExecution.id,
      templateKey: inactiveTemplate,
      offerKind: 'membership',
      priceKopecks: 280_000,
      availabilityState: 'INACTIVE',
      valueSnapshotHash: hash('inactive-offer-v1'),
      externalRef: 'integration.membership.inactive',
    });
    const inactiveReplacementId = `offer_inactive_replacement_${randomUUID()}`;
    const inactiveReplacementExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: inactiveReplacementId,
      label: 'inactive-offer-replacement',
      identityMaterial: `replace:${inactiveOfferId}:${inactiveVersionId}`,
    });
    await expectRejected(
      () =>
        materializeOffer(prisma, {
          tenantId: primary.tenantId,
          offerId: inactiveReplacementId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: inactiveReplacementExecution.id,
          templateKey: inactiveTemplate,
          offerKind: 'membership',
          priceKopecks: 290_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('inactive-offer-replacement'),
          externalRef: 'integration.membership.inactive-replacement',
          supersedesOfferId: inactiveOfferId,
        }),
      'replacement of inactive authority',
    );
    assert.equal(
      await countLiveAuthorities(
        prisma,
        primary.tenantId,
        'membership',
        inactiveTemplate,
      ),
      1,
    );

    const retiredB = await retireOffer(prisma, {
      tenantId: primary.tenantId,
      ownerId: primary.ownerId,
      offerId: offerBId,
      currentVersionId: offerBV1Id,
      currentVersion: 1,
      templateKey,
      offerKind: 'membership',
      priceKopecks: 530_000,
      label: 'offer-b-retire',
    });
    const offerCId = `offer_c_${randomUUID()}`;
    const offerCV1Id = `offer_version_${randomUUID()}`;
    const createC = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: offerCId,
      label: 'offer-c-create',
      identityMaterial: `replace:${offerBId}:${retiredB.versionId}:offer-c`,
    });
    await materializeOffer(prisma, {
      tenantId: primary.tenantId,
      offerId: offerCId,
      versionId: offerCV1Id,
      actionExecutionId: createC.id,
      templateKey,
      offerKind: 'membership',
      priceKopecks: 540_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: hash('offer-c-v1'),
      externalRef: 'integration.membership.c',
      supersedesOfferId: offerBId,
    });
    assert.equal(
      (
        await prisma.tenantCatalogItem.findUniqueOrThrow({
          where: { id: offerCId },
        })
      ).supersedesOfferId,
      offerBId,
    );
    assert.equal(
      await countLiveAuthorities(
        prisma,
        primary.tenantId,
        'membership',
        templateKey,
      ),
      1,
    );

    const restartPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    try {
      const retryResolved =
        await restartPrisma.tenantCatalogItem.findFirstOrThrow({
          where: {
            tenantId: primary.tenantId,
            supersedesOfferId: offerBId,
          },
        });
      assert.equal(retryResolved.id, offerCId);
      assert.equal(
        await restartPrisma.tenantCatalogItem.count({
          where: {
            tenantId: primary.tenantId,
            supersedesOfferId: offerBId,
          },
        }),
        1,
      );
    } finally {
      await restartPrisma.$disconnect();
    }

    const raceTemplate = 'beard.top';
    const racePredecessorId = `offer_race_predecessor_${randomUUID()}`;
    const racePredecessorV1 = `offer_version_${randomUUID()}`;
    const racePredecessorExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      offerId: racePredecessorId,
      label: 'race-predecessor-create',
    });
    await materializeOffer(prisma, {
      tenantId: primary.tenantId,
      offerId: racePredecessorId,
      versionId: racePredecessorV1,
      actionExecutionId: racePredecessorExecution.id,
      templateKey: raceTemplate,
      offerKind: 'membership',
      priceKopecks: 300_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: hash('race-predecessor-v1'),
      externalRef: 'integration.membership.race-predecessor',
    });
    const retiredRacePredecessor = await retireOffer(prisma, {
      tenantId: primary.tenantId,
      ownerId: primary.ownerId,
      offerId: racePredecessorId,
      currentVersionId: racePredecessorV1,
      currentVersion: 1,
      templateKey: raceTemplate,
      offerKind: 'membership',
      priceKopecks: 300_000,
      label: 'race-predecessor-retire',
    });
    const raceInputs = await Promise.all(
      ['a', 'b'].map(async (suffix) => {
        const offerId = `offer_race_${suffix}_${randomUUID()}`;
        const execution = await createApprovedExecution(prisma, {
          tenantId: primary.tenantId,
          approverUserId: primary.ownerId,
          actionClass: 'create_customer_membership_offer',
          offerId,
          label: `race-replacement-${suffix}`,
          identityMaterial: `race:${racePredecessorId}:${retiredRacePredecessor.versionId}:${suffix}`,
        });
        return {
          tenantId: primary.tenantId,
          offerId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: execution.id,
          templateKey: raceTemplate,
          offerKind: 'membership' as const,
          priceKopecks: 310_000,
          availabilityState: 'ACTIVE' as const,
          valueSnapshotHash: hash(`race-replacement-${suffix}`),
          externalRef: `integration.membership.race-${suffix}`,
          supersedesOfferId: racePredecessorId,
        };
      }),
    );
    const replacementRace = await Promise.allSettled(
      raceInputs.map((input) => materializeOffer(prisma, input)),
    );
    assert.equal(
      replacementRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      replacementRace.filter((result) => result.status === 'rejected').length,
      1,
    );
    assert.equal(
      await prisma.tenantCatalogItem.count({
        where: {
          tenantId: primary.tenantId,
          supersedesOfferId: racePredecessorId,
        },
      }),
      1,
    );

    const firstRaceTemplate = 'haircut.top';
    const firstRaceInputs = await Promise.all(
      ['a', 'b'].map(async (suffix) => {
        const offerId = `offer_first_race_${suffix}_${randomUUID()}`;
        const execution = await createApprovedExecution(prisma, {
          tenantId: primary.tenantId,
          approverUserId: primary.ownerId,
          actionClass: 'create_customer_membership_offer',
          offerId,
          label: `first-identity-race-${suffix}`,
        });
        return {
          tenantId: primary.tenantId,
          offerId,
          versionId: `offer_version_${randomUUID()}`,
          actionExecutionId: execution.id,
          templateKey: firstRaceTemplate,
          offerKind: 'membership' as const,
          priceKopecks: 250_000,
          availabilityState: 'ACTIVE' as const,
          valueSnapshotHash: hash(`first-identity-race-${suffix}`),
          externalRef: `integration.membership.first-race-${suffix}`,
        };
      }),
    );
    const firstIdentityRace = await Promise.allSettled(
      firstRaceInputs.map((input) => materializeOffer(prisma, input)),
    );
    assert.equal(
      firstIdentityRace.filter((result) => result.status === 'fulfilled')
        .length,
      1,
    );
    assert.equal(
      firstIdentityRace.filter((result) => result.status === 'rejected').length,
      1,
    );
    assert.equal(
      await countLiveAuthorities(
        prisma,
        primary.tenantId,
        'membership',
        firstRaceTemplate,
      ),
      1,
    );

    const frozenSubscription =
      await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
    const frozenCertificate = await prisma.giftCertificate.findUniqueOrThrow({
      where: { id: certificate.id },
    });
    const frozenIssuance =
      await prisma.referralRewardIssuance.findUniqueOrThrow({
        where: { id: issuance.id },
      });
    const frozenReward = await prisma.referralReward.findUniqueOrThrow({
      where: { id: reward.id },
    });
    assert.equal(frozenSubscription.planSnapshotHash, offerAV1Hash);
    assert.equal(frozenSubscription.priceKopecks, 520_000);
    assert.equal(
      frozenCertificate.offerSnapshotHash,
      hash('frozen-certificate-offer'),
    );
    assert.equal(frozenCertificate.nominalAmountKopecks, 500_000);
    assert.equal(
      frozenIssuance.policySnapshotHash,
      hash('frozen-referral-policy'),
    );
    assert.equal(frozenReward.amountKopecks, 30_000);
    assert.equal(
      await prisma.tenantCatalogItem.count({
        where: {
          canonicalTemplateKey: null,
          supersedesOfferId: { not: null },
        },
      }),
      0,
    );

    console.log(
      JSON.stringify(
        {
          immutableActiveIdentity: true,
          retiredOfferPreserved: true,
          replacementGetsNewIdentity: offerBId !== offerAId,
          replacementLineage: [offerAId, offerBId, offerCId],
          activeTemplateAuthorities: await countLiveAuthorities(
            prisma,
            primary.tenantId,
            'membership',
            templateKey,
          ),
          concurrentReplacementWinners: replacementRace.filter(
            (result) => result.status === 'fulfilled',
          ).length,
          concurrentFirstIdentityWinners: firstIdentityRace.filter(
            (result) => result.status === 'fulfilled',
          ).length,
          frozenSubscriptionPreserved: true,
          frozenCertificatePreserved: true,
          frozenReferralRewardPreserved: true,
          crossTenantLineageRejected: true,
          externalRefIsIdentity: false,
          fakeHistoricalReplacementBackfill: 0,
          productionWrites: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
