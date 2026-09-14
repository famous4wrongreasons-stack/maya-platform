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

const NOW = new Date('2026-09-02T20:00:00.000Z');

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p409_offer_')) {
    throw new Error(
      'P4-09 offer proof refuses non-disposable databases; expected maya_c06_p409_offer_*',
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
  const tenantId = `tenant_p409_${label}_${suffix}`;
  const ownerId = `owner_p409_${label}_${suffix}`;
  const adminId = `admin_p409_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-09 offer proof ${label}`,
      slug: `p4-09-offer-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
      users: {
        create: [
          {
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
          {
            id: adminId,
            email: `${adminId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.tenant_admin,
            memberships: {
              create: {
                tenantId,
                role: UserRole.tenant_admin,
                status: MembershipStatus.active,
              },
            },
          },
        ],
      },
    },
  });
  const client = await prisma.client.create({ data: { tenantId } });
  const secondClient = await prisma.client.create({ data: { tenantId } });
  return { tenantId, ownerId, adminId, client, secondClient };
}

async function createApprovedExecution(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    approverUserId: string;
    actionClass: string;
    targetKind: string;
    targetRef: string;
    label: string;
  },
) {
  const executionId = `exec_p409_${randomUUID()}`;
  const normalizedInputHash = hash(`input:${input.label}:${executionId}`);
  return prisma.actionExecution.create({
    data: {
      id: executionId,
      tenantId: input.tenantId,
      identityVersion: 1,
      identityFingerprint: hash(`identity:${executionId}`),
      idempotencyScope: 'p4-09.offer-value-version.v1',
      requestIdempotencyKeyHash: hash(`idempotency:${input.label}`),
      sourceType: 'authenticated_request',
      sourceRef: `proof:${input.label}`,
      actorUserId: input.approverUserId,
      actionClass: input.actionClass,
      capability: `p4-09.${input.actionClass}.execute.v1`,
      capabilityVersion: 1,
      targetKind: input.targetKind,
      targetRef: input.targetRef,
      normalizedInputContract: 'maya.p4-09-value-configuration-input/1',
      normalizedInputHash,
      evidenceRefsJson: [`proof:${hash(input.label)}`],
      riskProfileVersion: 1,
      riskFacetsJson: ['customer_value_configuration', 'single_target'],
      policyKey: 'p4-09.owner-approved-value-change.v1',
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'L2_OWNER_APPROVED',
      policyDecidedBy: 'p4-09-schema-proof',
      policyContextContract: 'maya.action-policy-context/1',
      policyContextHash: hash(`policy-context:${executionId}`),
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
      approvalBindingHash: hash(`approval:${executionId}`),
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
      transportIdempotencyKey: `p4-09:${executionId}`,
      finalOutcomeCode: 'proof_action_succeeded',
      firstAttemptedAt: NOW,
      finalizedAt: NOW,
    },
  });
}

type OfferVersionInput = {
  id: string;
  tenantId: string;
  offerId: string;
  actionExecutionId: string;
  previousVersionId: string | null;
  version: number;
  templateKey: string;
  offerKind: 'membership' | 'certificate';
  priceKopecks: number;
  availabilityState: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
  valueSnapshotHash: string;
};

async function appendOfferVersion(
  prisma: PrismaClient,
  input: OfferVersionInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const version = await tx.tenantCatalogItemValueVersion.create({
        data: { ...input, currency: 'RUB' },
      });
      await tx.tenantCatalogItem.update({
        where: { id: input.offerId },
        data: {
          currentValueVersionId: input.id,
          priceKopecks: input.priceKopecks,
          currency: 'RUB',
          active: input.availabilityState === 'ACTIVE',
        },
      });
      return version;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function materializeOffer(
  prisma: PrismaClient,
  input: OfferVersionInput & { externalRef: string },
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.tenantCatalogItem.create({
        data: {
          id: input.offerId,
          tenantId: input.tenantId,
          kind: input.offerKind,
          name: `P4-09 ${input.offerKind} proof`,
          priceKopecks: input.priceKopecks,
          currency: 'RUB',
          active: input.availabilityState === 'ACTIVE',
          source: 'p4-09-schema-proof',
          externalRef: input.externalRef,
          canonicalTemplateKey: input.templateKey,
        },
      });
      const version = await tx.tenantCatalogItemValueVersion.create({
        data: {
          id: input.id,
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
        data: { currentValueVersionId: input.id },
      });
      return version;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

type ReferralVersionInput = {
  id: string;
  tenantId: string;
  programId: string;
  actionExecutionId: string;
  previousVersionId: string | null;
  version: number;
  enabled: boolean;
  inviterRewardKopecks: number | null;
  inviteeRewardKopecks: number | null;
  inviterRewardPercentBasisPoints: number | null;
  inviteeRewardPercentBasisPoints: number | null;
  inviterRewardLiabilityCapKopecks: number | null;
  inviteeRewardLiabilityCapKopecks: number | null;
  valueSnapshotHash: string;
};

async function appendReferralVersion(
  prisma: PrismaClient,
  input: ReferralVersionInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const version = await tx.referralProgramValueVersion.create({
        data: { ...input, currency: 'RUB' },
      });
      await tx.referralProgram.update({
        where: { id: input.programId },
        data: {
          currentValueVersionId: input.id,
          enabled: input.enabled,
          inviterRewardKopecks: input.inviterRewardKopecks,
          inviteeRewardKopecks: input.inviteeRewardKopecks,
          inviterRewardPercentBasisPoints:
            input.inviterRewardPercentBasisPoints,
          inviteeRewardPercentBasisPoints:
            input.inviteeRewardPercentBasisPoints,
          inviterRewardLiabilityCapKopecks:
            input.inviterRewardLiabilityCapKopecks,
          inviteeRewardLiabilityCapKopecks:
            input.inviteeRewardLiabilityCapKopecks,
          currency: 'RUB',
        },
      });
      return version;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const primary = await createScope(prisma, 'primary');
    const foreign = await createScope(prisma, 'foreign');

    const historicalOffer = await prisma.tenantCatalogItem.create({
      data: {
        tenantId: primary.tenantId,
        kind: 'membership',
        name: 'Historical unversioned offer',
        priceKopecks: 100_000,
        externalRef: `historical-${randomUUID()}`,
      },
    });
    const historicalProgram = await prisma.referralProgram.create({
      data: {
        tenantId: foreign.tenantId,
        enabled: false,
      },
    });
    assert.equal(historicalOffer.currentValueVersionId, null);
    assert.equal(historicalOffer.canonicalTemplateKey, null);
    assert.equal(historicalProgram.currentValueVersionId, null);
    assert.equal(await prisma.tenantCatalogItemValueVersion.count(), 0);
    assert.equal(await prisma.referralProgramValueVersion.count(), 0);

    const membershipOfferId = `offer_membership_${randomUUID()}`;
    const membershipV1Id = `offer_version_${randomUUID()}`;
    const membershipV1Hash = hash('membership-v1');
    const membershipCreateExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_customer_membership_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${membershipOfferId}`,
      label: 'membership-create',
    });
    await materializeOffer(prisma, {
      id: membershipV1Id,
      tenantId: primary.tenantId,
      offerId: membershipOfferId,
      actionExecutionId: membershipCreateExecution.id,
      previousVersionId: null,
      version: 1,
      templateKey: 'complex.senior',
      offerKind: 'membership',
      priceKopecks: 520_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: membershipV1Hash,
      externalRef: 'integration.membership.old',
    });

    const membershipProjection =
      await prisma.tenantCatalogItem.findUniqueOrThrow({
        where: { id: membershipOfferId },
      });
    assert.equal(membershipProjection.id, membershipOfferId);
    assert.equal(membershipProjection.currentValueVersionId, membershipV1Id);

    await prisma.tenantCatalogItem.update({
      where: { id: membershipOfferId },
      data: { externalRef: 'integration.membership.rotated' },
    });
    const afterAliasChange = await prisma.tenantCatalogItem.findUniqueOrThrow({
      where: { id: membershipOfferId },
    });
    assert.equal(afterAliasChange.id, membershipOfferId);
    assert.equal(afterAliasChange.currentValueVersionId, membershipV1Id);
    assert.equal(
      await prisma.tenantCatalogItemValueVersion.count({
        where: { offerId: membershipOfferId },
      }),
      1,
    );

    await expectRejected(
      () =>
        prisma.tenantCatalogItem.update({
          where: { id: membershipOfferId },
          data: { priceKopecks: 510_000 },
        }),
      'unversioned canonical offer value overwrite',
    );
    await expectRejected(
      () =>
        prisma.tenantCatalogItem.update({
          where: { id: membershipOfferId },
          data: { id: `forged_offer_${randomUUID()}` },
        }),
      'canonical offer identity rewrite',
    );

    const subscription = await prisma.customerSubscription.create({
      data: {
        tenantId: primary.tenantId,
        clientId: primary.client.id,
        termIdentityHash: hash('frozen-subscription-term'),
        planCode: 'complex',
        planSnapshotHash: membershipV1Hash,
        serviceScopeHash: hash('complex-service-scope'),
        priceKopecks: 520_000,
        currency: 'RUB',
        visitsIncluded: 2,
        status: 'active',
        activatedAt: NOW,
        termStartsAt: NOW,
        termEndsAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
        legacySourceRef: `p4-09-proof-subscription-${randomUUID()}`,
      },
    });

    const membershipV2Id = `offer_version_${randomUUID()}`;
    const membershipV2Execution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'update_customer_membership_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${membershipOfferId}`,
      label: 'membership-v2',
    });
    await appendOfferVersion(prisma, {
      id: membershipV2Id,
      tenantId: primary.tenantId,
      offerId: membershipOfferId,
      actionExecutionId: membershipV2Execution.id,
      previousVersionId: membershipV1Id,
      version: 2,
      templateKey: 'complex.senior',
      offerKind: 'membership',
      priceKopecks: 530_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: hash('membership-v2'),
    });

    const subscriptionAfterOfferChange =
      await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
    assert.equal(subscriptionAfterOfferChange.priceKopecks, 520_000);
    assert.equal(
      subscriptionAfterOfferChange.planSnapshotHash,
      membershipV1Hash,
    );
    assert.equal(
      (
        await prisma.tenantCatalogItemValueVersion.findUniqueOrThrow({
          where: { id: membershipV1Id },
        })
      ).priceKopecks,
      520_000,
    );

    await expectRejected(
      () =>
        prisma.tenantCatalogItemValueVersion.update({
          where: { id: membershipV1Id },
          data: { priceKopecks: 1 },
        }),
      'historical offer version overwrite',
    );
    await expectRejected(
      () =>
        prisma.tenantCatalogItemValueVersion.create({
          data: {
            id: `duplicate_version_${randomUUID()}`,
            tenantId: primary.tenantId,
            offerId: membershipOfferId,
            actionExecutionId: membershipV2Execution.id,
            previousVersionId: membershipV1Id,
            version: 2,
            templateKey: 'complex.senior',
            offerKind: 'membership',
            priceKopecks: 530_000,
            currency: 'RUB',
            availabilityState: 'ACTIVE',
            valueSnapshotHash: hash('membership-v2'),
          },
        }),
      'retry creating a second logical version',
    );
    assert.equal(
      await prisma.tenantCatalogItemValueVersion.count({
        where: { offerId: membershipOfferId },
      }),
      2,
    );

    const nonOwnerExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.adminId,
      actionClass: 'update_customer_membership_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${membershipOfferId}`,
      label: 'non-owner-v3',
    });
    await expectRejected(
      () =>
        appendOfferVersion(prisma, {
          id: `offer_version_${randomUUID()}`,
          tenantId: primary.tenantId,
          offerId: membershipOfferId,
          actionExecutionId: nonOwnerExecution.id,
          previousVersionId: membershipV2Id,
          version: 3,
          templateKey: 'complex.senior',
          offerKind: 'membership',
          priceKopecks: 540_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('non-owner-v3'),
        }),
      'non-owner-approved value version',
    );

    const forgedVersionExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'update_customer_membership_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${membershipOfferId}`,
      label: 'forged-version',
    });
    await expectRejected(
      () =>
        appendOfferVersion(prisma, {
          id: `offer_version_${randomUUID()}`,
          tenantId: primary.tenantId,
          offerId: membershipOfferId,
          actionExecutionId: forgedVersionExecution.id,
          previousVersionId: membershipV2Id,
          version: 99,
          templateKey: 'complex.senior',
          offerKind: 'membership',
          priceKopecks: 540_000,
          availabilityState: 'ACTIVE',
          valueSnapshotHash: hash('forged-version'),
        }),
      'forged offer version generation',
    );

    const foreignExecution = await createApprovedExecution(prisma, {
      tenantId: foreign.tenantId,
      approverUserId: foreign.ownerId,
      actionClass: 'update_customer_membership_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${membershipOfferId}`,
      label: 'cross-tenant',
    });
    await expectRejected(
      () =>
        prisma.tenantCatalogItemValueVersion.create({
          data: {
            id: `offer_version_${randomUUID()}`,
            tenantId: foreign.tenantId,
            offerId: membershipOfferId,
            actionExecutionId: foreignExecution.id,
            previousVersionId: null,
            version: 1,
            templateKey: 'complex.senior',
            offerKind: 'membership',
            priceKopecks: 520_000,
            currency: 'RUB',
            availabilityState: 'ACTIVE',
            valueSnapshotHash: hash('cross-tenant'),
          },
        }),
      'cross-tenant offer version binding',
    );

    const raceExecutions = await Promise.all([
      createApprovedExecution(prisma, {
        tenantId: primary.tenantId,
        approverUserId: primary.ownerId,
        actionClass: 'update_customer_membership_offer',
        targetKind: 'tenant_catalog_item',
        targetRef: `tenant-catalog-item:${membershipOfferId}`,
        label: 'membership-race-a',
      }),
      createApprovedExecution(prisma, {
        tenantId: primary.tenantId,
        approverUserId: primary.ownerId,
        actionClass: 'update_customer_membership_offer',
        targetKind: 'tenant_catalog_item',
        targetRef: `tenant-catalog-item:${membershipOfferId}`,
        label: 'membership-race-b',
      }),
    ]);
    const raceInputs = raceExecutions.map((execution, index) => ({
      id: `offer_version_${randomUUID()}`,
      tenantId: primary.tenantId,
      offerId: membershipOfferId,
      actionExecutionId: execution.id,
      previousVersionId: membershipV2Id,
      version: 3,
      templateKey: 'complex.senior',
      offerKind: 'membership' as const,
      priceKopecks: 540_000 + index * 10_000,
      availabilityState: 'ACTIVE' as const,
      valueSnapshotHash: hash(`membership-race-${index}`),
    }));
    const race = await Promise.allSettled(
      raceInputs.map((input) => appendOfferVersion(prisma, input)),
    );
    assert.equal(
      race.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      race.filter((result) => result.status === 'rejected').length,
      1,
    );
    assert.equal(
      await prisma.tenantCatalogItemValueVersion.count({
        where: { offerId: membershipOfferId },
      }),
      3,
    );

    const certificateOfferId = `offer_certificate_${randomUUID()}`;
    const certificateV1Id = `offer_version_${randomUUID()}`;
    const certificateV1Hash = hash('certificate-v1');
    const certificateExecution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'create_gift_certificate_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${certificateOfferId}`,
      label: 'certificate-create',
    });
    await materializeOffer(prisma, {
      id: certificateV1Id,
      tenantId: primary.tenantId,
      offerId: certificateOfferId,
      actionExecutionId: certificateExecution.id,
      previousVersionId: null,
      version: 1,
      templateKey: 'gift-certificate.5000',
      offerKind: 'certificate',
      priceKopecks: 500_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: certificateV1Hash,
      externalRef: 'integration.certificate.5000',
    });
    const certificate = await prisma.giftCertificate.create({
      data: {
        tenantId: primary.tenantId,
        issuanceIdentityHash: hash('issued-certificate'),
        codeHash: hash('certificate-code'),
        presentationKeyVersion: 'p4-09-proof-key-v1',
        recipientSubjectHash: hash('recipient'),
        offerSnapshotHash: certificateV1Hash,
        nominalAmountKopecks: 500_000,
        currency: 'RUB',
        paymentStatus: 'paid',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
        paidAt: NOW,
        legacySourceRef: `p4-09-proof-certificate-${randomUUID()}`,
      },
    });
    const certificateV2Execution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'update_gift_certificate_offer',
      targetKind: 'tenant_catalog_item',
      targetRef: `tenant-catalog-item:${certificateOfferId}`,
      label: 'certificate-v2',
    });
    await appendOfferVersion(prisma, {
      id: `offer_version_${randomUUID()}`,
      tenantId: primary.tenantId,
      offerId: certificateOfferId,
      actionExecutionId: certificateV2Execution.id,
      previousVersionId: certificateV1Id,
      version: 2,
      templateKey: 'gift-certificate.5000',
      offerKind: 'certificate',
      priceKopecks: 490_000,
      availabilityState: 'ACTIVE',
      valueSnapshotHash: hash('certificate-v2'),
    });
    const certificateAfterOfferChange =
      await prisma.giftCertificate.findUniqueOrThrow({
        where: { id: certificate.id },
      });
    assert.equal(certificateAfterOfferChange.nominalAmountKopecks, 500_000);
    assert.equal(
      certificateAfterOfferChange.offerSnapshotHash,
      certificateV1Hash,
    );

    const program = await prisma.referralProgram.create({
      data: {
        tenantId: primary.tenantId,
        enabled: true,
        inviterRewardKopecks: 30_000,
        inviteeRewardKopecks: 20_000,
        currency: 'RUB',
      },
    });
    const referralV1Id = `referral_version_${randomUUID()}`;
    const referralV1Hash = hash('referral-policy-v1');
    const referralV1Execution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'update_referral_reward_policy',
      targetKind: 'referral_program',
      targetRef: `referral-program:${program.id}`,
      label: 'referral-policy-v1',
    });
    await appendReferralVersion(prisma, {
      id: referralV1Id,
      tenantId: primary.tenantId,
      programId: program.id,
      actionExecutionId: referralV1Execution.id,
      previousVersionId: null,
      version: 1,
      enabled: true,
      inviterRewardKopecks: 30_000,
      inviteeRewardKopecks: 20_000,
      inviterRewardPercentBasisPoints: null,
      inviteeRewardPercentBasisPoints: null,
      inviterRewardLiabilityCapKopecks: null,
      inviteeRewardLiabilityCapKopecks: null,
      valueSnapshotHash: referralV1Hash,
    });

    const referral = await prisma.customerReferral.create({
      data: {
        tenantId: primary.tenantId,
        referrerClientId: primary.client.id,
        referredClientId: primary.secondClient.id,
        identityHash: hash('referral-identity'),
        referredSubjectHash: hash('referred-subject'),
        referralCodeHash: hash('referral-code'),
        status: 'qualified',
        joinedAt: NOW,
        resolvedAt: NOW,
        legacySourceRef: `p4-09-proof-referral-${randomUUID()}`,
      },
    });
    const issuance = await prisma.referralRewardIssuance.create({
      data: {
        tenantId: primary.tenantId,
        referralId: referral.id,
        policySnapshotHash: referralV1Hash,
        issuedAt: NOW,
        legacySourceRef: `p4-09-proof-issuance-${randomUUID()}`,
      },
    });
    const reward = await prisma.referralReward.create({
      data: {
        tenantId: primary.tenantId,
        issuanceId: issuance.id,
        recipientClientId: primary.client.id,
        rewardSlot: 'inviter',
        codeHash: hash('referral-reward-code'),
        amountKopecks: 30_000,
        currency: 'RUB',
        liabilityCapKopecks: 30_000,
        liabilityCurrency: 'RUB',
        presentationKeyVersion: 'p4-09-proof-key-v1',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000),
      },
    });
    const referralV2Execution = await createApprovedExecution(prisma, {
      tenantId: primary.tenantId,
      approverUserId: primary.ownerId,
      actionClass: 'update_referral_reward_policy',
      targetKind: 'referral_program',
      targetRef: `referral-program:${program.id}`,
      label: 'referral-policy-v2',
    });
    await appendReferralVersion(prisma, {
      id: `referral_version_${randomUUID()}`,
      tenantId: primary.tenantId,
      programId: program.id,
      actionExecutionId: referralV2Execution.id,
      previousVersionId: referralV1Id,
      version: 2,
      enabled: true,
      inviterRewardKopecks: 40_000,
      inviteeRewardKopecks: 10_000,
      inviterRewardPercentBasisPoints: null,
      inviteeRewardPercentBasisPoints: null,
      inviterRewardLiabilityCapKopecks: null,
      inviteeRewardLiabilityCapKopecks: null,
      valueSnapshotHash: hash('referral-policy-v2'),
    });
    const rewardAfterPolicyChange =
      await prisma.referralReward.findUniqueOrThrow({
        where: { id: reward.id },
      });
    const issuanceAfterPolicyChange =
      await prisma.referralRewardIssuance.findUniqueOrThrow({
        where: { id: issuance.id },
      });
    assert.equal(rewardAfterPolicyChange.amountKopecks, 30_000);
    assert.equal(issuanceAfterPolicyChange.policySnapshotHash, referralV1Hash);

    const finalMembershipVersions =
      await prisma.tenantCatalogItemValueVersion.findMany({
        where: { offerId: membershipOfferId },
        orderBy: { version: 'asc' },
      });
    assert.deepEqual(
      finalMembershipVersions.map((version) => version.version),
      [1, 2, 3],
    );
    assert.equal(
      new Set(
        finalMembershipVersions.map((version) => version.actionExecutionId),
      ).size,
      3,
    );

    console.log(
      JSON.stringify(
        {
          immutableOfferIdentity: true,
          externalRefIsIdentity: false,
          historicalNullCompatibility: true,
          offerVersions: finalMembershipVersions.length,
          concurrentVersionWinners: 1,
          subscriptionSnapshotPreserved: true,
          certificateSnapshotPreserved: true,
          referralRewardSnapshotPreserved: true,
          crossTenantBindingRejected: true,
          nonOwnerApprovalRejected: true,
          fakeHistoricalBackfill: 0,
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

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
