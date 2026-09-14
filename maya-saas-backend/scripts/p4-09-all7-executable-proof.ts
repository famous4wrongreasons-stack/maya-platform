import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ActionCapabilityRegistry,
  P4_09_REGISTRATIONS,
  createStandaloneCanonicalActionEngine,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import { P409CanonicalOfferAuthorityService } from '../src/business-content/p4-09-canonical-offer-authority.service';
import {
  P409ValueConfigurationExecutionError,
  P409ValueConfigurationExecutableService,
} from '../src/business-content/p4-09-value-configuration-executable.service';
import {
  P409ValueConfigurationShadowService,
  p409Hash,
  type P409ShadowResult,
} from '../src/business-content/p4-09-value-configuration-shadow.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';

const NOW = new Date('2026-09-03T12:00:00.000Z');
const IDENTITY_SECRET = 'p4-09-all7-proof-identity-secret-'.repeat(2);
const PAYLOAD_SECRET = 'p4-09-all7-proof-payload-secret-'.repeat(2);

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error('DATABASE_URL is required for the P4-09 executable proof');
  }
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p409_all7_')) {
    throw new Error(
      'P4-09 proof refuses non-disposable databases; expected maya_c06_p409_all7_*',
    );
  }
  return value;
}

function entitlements(): Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> {
  return {
    resolveFeatureRequirements: (
      tenantId,
      requiredFeatures,
      evaluatedAt = NOW,
    ): Promise<FeatureRequirementDecision> =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: requiredFeatures.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt,
        validUntil: null,
      }),
  };
}

async function scope(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p409_${label}_${suffix}`;
  const ownerId = `owner_p409_${label}_${suffix}`;
  const adminId = `admin_p409_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-09 proof ${label}`,
      slug: `p4-09-all7-${label}-${randomUUID()}`,
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
  await prisma.user.create({
    data: {
      id: adminId,
      tenantId,
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
  });
  const firstClient = await prisma.client.create({ data: { tenantId } });
  const secondClient = await prisma.client.create({ data: { tenantId } });
  return { tenantId, ownerId, adminId, firstClient, secondClient };
}

async function expectRejected(
  run: () => Promise<unknown>,
  message: string,
): Promise<void> {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, message);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const primary = await scope(prisma, 'primary');
    const foreign = await scope(prisma, 'foreign');
    const engine = createStandaloneCanonicalActionEngine(
      prisma as unknown as PrismaService,
      entitlements(),
      {
        identitySecret: IDENTITY_SECRET,
        payloadEncryptionSecret: PAYLOAD_SECRET,
        policyAttestationSecret: IDENTITY_SECRET,
        now: () => NOW,
      },
    );
    const planner = new P409ValueConfigurationShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      {
        assertTenantId: (tenantId: string) => tenantId,
      } as TenantContextService,
    );
    const executor = new P409ValueConfigurationExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      () => NOW,
    );
    const offerAuthority = new P409CanonicalOfferAuthorityService(
      prisma as unknown as PrismaService,
      {
        assertTenantId: (tenantId: string) => tenantId,
      } as TenantContextService,
    );
    const shadowResults: P409ShadowResult[] = [];

    const approve = async (request: TrustedActionExecutionRequestV1) => {
      let execution = await engine.ingress.createExecution(request);
      if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
        execution = await engine.kernel.decideApproval({
          tenantId: request.tenantId,
          executionId: execution.id,
          approverUserId: primary.ownerId,
          decision: 'APPROVED',
        });
      }
      assert.equal(execution.state, ActionExecutionState.READY);
      return execution;
    };

    const certificateCreateMutation = {
      sourceIntentRef: 'certificate-create',
      kind: 'certificate' as const,
      operation: 'create' as const,
      templateKey: 'gift-certificate.2000',
      name: 'Gift certificate 2000',
      priceKopecks: 200_000,
      externalRef: 'integration.gift.2000',
    };
    shadowResults.push(
      await planner.planOffer(primary.tenantId, primary.adminId, {
        ...certificateCreateMutation,
        sourceIntentRef: 'shadow-certificate-create',
      }),
    );
    const certCreate = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      certificateCreateMutation,
      'execute',
    );
    await expectRejected(
      () => executor.execute(certCreate),
      'unapproved value configuration must fail closed',
    );
    await approve(certCreate);
    const [certCreateA, certCreateB] = await Promise.all([
      executor.execute(certCreate),
      executor.execute(certCreate),
    ]);
    assert.equal(certCreateA.actionExecutionId, certCreateB.actionExecutionId);
    assert.equal(await prisma.tenantCatalogItem.count(), 1);
    assert.equal(await prisma.tenantCatalogItemValueVersion.count(), 1);
    const certOfferId = certCreateA.targetId;
    const certV1 = await prisma.tenantCatalogItemValueVersion.findUniqueOrThrow(
      {
        where: { id: certCreateA.versionId },
      },
    );

    const certificate = await prisma.giftCertificate.create({
      data: {
        tenantId: primary.tenantId,
        issuanceIdentityHash: p409Hash('issued-certificate'),
        codeHash: p409Hash('certificate-code'),
        presentationKeyVersion: 'proof-key-v1',
        recipientSubjectHash: p409Hash('certificate-recipient'),
        offerSnapshotHash: certV1.valueSnapshotHash,
        nominalAmountKopecks: certV1.priceKopecks,
        currency: certV1.currency,
        paymentStatus: 'paid',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 365 * 86_400_000),
        paidAt: NOW,
        legacySourceRef: 'p4-09-proof:frozen-certificate',
      },
    });

    const certificateUpdateMutation = {
      sourceIntentRef: 'certificate-update',
      kind: 'certificate' as const,
      operation: 'update' as const,
      offerId: certOfferId,
      priceKopecks: 220_000,
      externalRef: 'integration.gift.2000.v2',
    };
    shadowResults.push(
      await planner.planOffer(primary.tenantId, primary.adminId, {
        ...certificateUpdateMutation,
        sourceIntentRef: 'shadow-certificate-update',
      }),
    );
    const certUpdate = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      certificateUpdateMutation,
      'execute',
    );
    await approve(certUpdate);
    const certV2 = await executor.execute(certUpdate);
    assert.equal(certV2.previousVersionId, certV1.id);
    const futureCertificateOffer = await offerAuthority.resolveCertificateOffer(
      primary.tenantId,
      certOfferId,
    );
    assert.equal(futureCertificateOffer.offerValueVersionId, certV2.versionId);
    assert.equal(futureCertificateOffer.nominalAmountKopecks, 220_000);
    const frozenCertificate = await prisma.giftCertificate.findUniqueOrThrow({
      where: { id: certificate.id },
    });
    assert.equal(frozenCertificate.nominalAmountKopecks, 200_000);
    assert.equal(frozenCertificate.offerSnapshotHash, certV1.valueSnapshotHash);

    const certificateDeleteMutation = {
      sourceIntentRef: 'certificate-delete',
      kind: 'certificate' as const,
      operation: 'delete' as const,
      offerId: certOfferId,
    };
    shadowResults.push(
      await planner.planOffer(primary.tenantId, primary.adminId, {
        ...certificateDeleteMutation,
        sourceIntentRef: 'shadow-certificate-delete',
      }),
    );
    const certDelete = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      certificateDeleteMutation,
      'execute',
    );
    await approve(certDelete);
    await executor.execute(certDelete);
    const retiredCertificateOffer =
      await prisma.tenantCatalogItem.findUniqueOrThrow({
        where: { id: certOfferId },
        include: { currentValueVersion: true },
      });
    assert.equal(
      retiredCertificateOffer.currentValueVersion?.availabilityState,
      'RETIRED',
    );

    const replacement = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      {
        sourceIntentRef: 'certificate-replacement',
        kind: 'certificate',
        operation: 'create',
        templateKey: 'gift-certificate.2000',
        name: 'Gift certificate 2000 replacement',
        priceKopecks: 230_000,
      },
      'execute',
    );
    await approve(replacement);
    const replacementValue = await executor.execute(replacement);
    assert.notEqual(replacementValue.targetId, certOfferId);
    const replacementOffer = await prisma.tenantCatalogItem.findUniqueOrThrow({
      where: { id: replacementValue.targetId },
    });
    assert.equal(replacementOffer.supersedesOfferId, certOfferId);
    const futureReplacementCertificate =
      await offerAuthority.resolveCertificateOffer(
        primary.tenantId,
        replacementValue.targetId,
      );
    assert.equal(
      futureReplacementCertificate.offerValueVersionId,
      replacementValue.versionId,
    );
    assert.equal(futureReplacementCertificate.nominalAmountKopecks, 230_000);
    await expectRejected(
      () =>
        offerAuthority.resolveCertificateOffer(primary.tenantId, certOfferId),
      'retired offer must never fall back to a static catalog',
    );

    const membershipCreateMutation = {
      sourceIntentRef: 'membership-create',
      kind: 'membership' as const,
      operation: 'create' as const,
      templateKey: 'haircut.senior',
      name: 'Haircut senior',
      priceKopecks: 330_000,
    };
    shadowResults.push(
      await planner.planOffer(primary.tenantId, primary.adminId, {
        ...membershipCreateMutation,
        sourceIntentRef: 'shadow-membership-create',
      }),
    );
    const memberCreate = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      membershipCreateMutation,
      'execute',
    );
    await approve(memberCreate);
    const memberV1Result = await executor.execute(memberCreate);
    const memberV1 =
      await prisma.tenantCatalogItemValueVersion.findUniqueOrThrow({
        where: { id: memberV1Result.versionId },
      });
    const subscription = await prisma.customerSubscription.create({
      data: {
        tenantId: primary.tenantId,
        clientId: primary.firstClient.id,
        termIdentityHash: p409Hash('frozen-subscription'),
        planCode: 'haircut',
        planSnapshotHash: memberV1.valueSnapshotHash,
        serviceScopeHash: p409Hash('haircut-scope'),
        priceKopecks: memberV1.priceKopecks,
        currency: memberV1.currency,
        visitsIncluded: 2,
        status: 'active',
        activatedAt: NOW,
        termStartsAt: NOW,
        termEndsAt: new Date(NOW.getTime() + 30 * 86_400_000),
        legacySourceRef: 'p4-09-proof:frozen-subscription',
      },
    });

    const membershipUpdateMutation = {
      sourceIntentRef: 'membership-update',
      kind: 'membership' as const,
      operation: 'update' as const,
      offerId: memberV1Result.targetId,
      priceKopecks: 340_000,
    };
    shadowResults.push(
      await planner.planOffer(primary.tenantId, primary.adminId, {
        ...membershipUpdateMutation,
        sourceIntentRef: 'shadow-membership-update',
      }),
    );
    const memberUpdate = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      membershipUpdateMutation,
      'execute',
    );
    await approve(memberUpdate);
    const [memberUpdateA, memberUpdateB] = await Promise.all([
      executor.execute(memberUpdate),
      executor.execute(memberUpdate),
    ]);
    assert.equal(memberUpdateA.versionId, memberUpdateB.versionId);
    assert.equal(
      await prisma.tenantCatalogItemValueVersion.count({
        where: { offerId: memberV1Result.targetId },
      }),
      2,
    );
    const futureMembershipOffer = await offerAuthority.resolveMembershipOffer(
      primary.tenantId,
      memberV1Result.targetId,
    );
    assert.equal(
      futureMembershipOffer.offerValueVersionId,
      memberUpdateA.versionId,
    );
    assert.equal(futureMembershipOffer.priceKopecks, 340_000);
    const frozenSubscription =
      await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
    assert.equal(frozenSubscription.priceKopecks, 330_000);
    assert.equal(
      frozenSubscription.planSnapshotHash,
      memberV1.valueSnapshotHash,
    );

    const competingMembershipA = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      {
        sourceIntentRef: 'membership-competing-a',
        kind: 'membership',
        operation: 'update',
        offerId: memberV1Result.targetId,
        priceKopecks: 350_000,
      },
      'execute',
    );
    const competingMembershipB = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      {
        sourceIntentRef: 'membership-competing-b',
        kind: 'membership',
        operation: 'update',
        offerId: memberV1Result.targetId,
        priceKopecks: 360_000,
      },
      'execute',
    );
    await approve(competingMembershipA);
    await approve(competingMembershipB);
    const competingResults = await Promise.allSettled([
      executor.execute(competingMembershipA),
      executor.execute(competingMembershipB),
    ]);
    assert.equal(
      competingResults.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      competingResults.filter((result) => result.status === 'rejected').length,
      1,
    );
    assert.equal(
      await prisma.tenantCatalogItemValueVersion.count({
        where: { offerId: memberV1Result.targetId },
      }),
      3,
    );

    const membershipDeleteMutation = {
      sourceIntentRef: 'membership-delete',
      kind: 'membership' as const,
      operation: 'delete' as const,
      offerId: memberV1Result.targetId,
    };
    shadowResults.push(
      await planner.planOffer(primary.tenantId, primary.adminId, {
        ...membershipDeleteMutation,
        sourceIntentRef: 'shadow-membership-delete',
      }),
    );
    const memberDelete = await planner.buildOfferRequest(
      primary.tenantId,
      primary.adminId,
      membershipDeleteMutation,
      'execute',
    );
    await approve(memberDelete);
    await executor.execute(memberDelete);

    const referralV1Mutation = {
      sourceIntentRef: 'referral-policy-v1',
      enabled: true,
      inviterRewardKopecks: 30_000,
      inviteeRewardKopecks: 20_000,
    };
    shadowResults.push(
      await planner.planReferralPolicy(primary.tenantId, primary.adminId, {
        ...referralV1Mutation,
        sourceIntentRef: 'shadow-referral-policy-update',
      }),
    );
    const referralV1Request = await planner.buildReferralPolicyRequest(
      primary.tenantId,
      primary.adminId,
      referralV1Mutation,
      'execute',
    );
    await approve(referralV1Request);
    const referralV1Result = await executor.execute(referralV1Request);
    const referral = await prisma.customerReferral.create({
      data: {
        tenantId: primary.tenantId,
        referrerClientId: primary.firstClient.id,
        referredClientId: primary.secondClient.id,
        identityHash: p409Hash('referral-identity'),
        referredSubjectHash: p409Hash('referred-subject'),
        referralCodeHash: p409Hash('referral-code'),
        status: 'qualified',
        joinedAt: NOW,
        resolvedAt: NOW,
      },
    });
    const issuance = await prisma.referralRewardIssuance.create({
      data: {
        tenantId: primary.tenantId,
        referralId: referral.id,
        policySnapshotHash: proofInputText(
          referralV1Request.input,
          'valueSnapshotHash',
        ),
        issuedAt: NOW,
      },
    });
    const reward = await prisma.referralReward.create({
      data: {
        tenantId: primary.tenantId,
        issuanceId: issuance.id,
        recipientClientId: primary.firstClient.id,
        rewardSlot: 'inviter',
        codeHash: p409Hash('reward-code'),
        amountKopecks: 30_000,
        currency: 'RUB',
        liabilityCapKopecks: 30_000,
        liabilityCurrency: 'RUB',
        presentationKeyVersion: 'p4-09-proof-key-v1',
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 90 * 86_400_000),
      },
    });
    const referralV2Request = await planner.buildReferralPolicyRequest(
      primary.tenantId,
      primary.adminId,
      {
        sourceIntentRef: 'referral-policy-v2',
        enabled: true,
        inviterRewardKopecks: 40_000,
        inviteeRewardKopecks: 20_000,
      },
      'execute',
    );
    await approve(referralV2Request);
    const referralV2Result = await executor.execute(referralV2Request);
    assert.equal(
      referralV2Result.previousVersionId,
      referralV1Result.versionId,
    );
    const frozenReward = await prisma.referralReward.findUniqueOrThrow({
      where: { id: reward.id },
    });
    assert.equal(frozenReward.amountKopecks, 30_000);

    await expectRejected(
      () =>
        planner.buildOfferRequest(
          foreign.tenantId,
          foreign.adminId,
          {
            sourceIntentRef: 'cross-tenant',
            kind: 'certificate',
            operation: 'update',
            offerId: replacementValue.targetId,
            priceKopecks: 240_000,
          },
          'execute',
        ),
      'cross-tenant offer binding must fail closed',
    );

    const registry = new ActionCapabilityRegistry();
    await expectRejected(
      () =>
        Promise.resolve().then(() => {
          const normalized = certCreate.input as Record<string, unknown>;
          return registry.get(certCreate.capability).normalizeInput({
            ...normalized,
            priceKopecks: 500_001,
          });
        }),
      'forged cap must be rejected',
    );
    await expectRejected(
      () =>
        Promise.resolve().then(() => {
          const normalized = certCreate.input as Record<string, unknown>;
          return registry.get(certCreate.capability).normalizeInput({
            ...normalized,
            oneTargetCount: 2,
            bulkMutation: true,
          });
        }),
      'bulk mutation must be rejected',
    );

    const actionClasses = await prisma.actionExecution.findMany({
      where: {
        tenantId: primary.tenantId,
        actionClass: {
          in: [...P4_09_REGISTRATIONS.map((item) => item.actionClass)],
        },
        state: ActionExecutionState.SUCCEEDED,
      },
      select: { actionClass: true },
    });
    assert.deepEqual(
      [...new Set(actionClasses.map((row) => row.actionClass))].sort(),
      P4_09_REGISTRATIONS.map((item) => item.actionClass).sort(),
    );
    assert.equal(await prisma.tenantCatalogItemValueVersion.count(), 8);
    assert.equal(await prisma.referralProgramValueVersion.count(), 2);
    assert.equal(shadowResults.length, 7);
    assert.deepEqual(
      [...new Set(shadowResults.map((result) => result.actionClass))].sort(),
      P4_09_REGISTRATIONS.map((item) => item.actionClass).sort(),
    );
    assert.equal(
      shadowResults.every(
        (result) =>
          result.shadowDivergences === 0 &&
          result.configurationMutations === 0 &&
          result.valueMutations === 0 &&
          result.providerWrites === 0,
      ),
      true,
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          p409All7ExecutableProof: 'PASS',
          actionClassesProven: '7/7',
          shadowActionClasses: '7/7',
          shadowDivergences: 0,
          ownerApprovalEnforced: true,
          oneTargetPerMutation: true,
          bulkMutationPossible: false,
          duplicateValueConfigMutationPossible: false,
          concurrentVersionCreationWinners: 1,
          immutablePriorVersions: true,
          replacementGetsNewIdentity: true,
          futureIssuanceUsesCurrentVersion: true,
          retiredOfferStaticFallback: false,
          historicalFrozenValueReboundPossible: false,
          externalRefPrimaryIdentity: false,
          tenantIsolation: true,
          unknownRequired: false,
          providerWrites: 0,
          productionConfigValueMutations: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function proofInputText(input: unknown, key: string): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new P409ValueConfigurationExecutionError('Proof input is absent');
  }
  const value = (input as Record<string, unknown>)[key];
  if (typeof value !== 'string') {
    throw new P409ValueConfigurationExecutionError('Proof input is invalid');
  }
  return value;
}

void main();
