import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  ActionExecutionState,
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionContractError,
  P4_04_EXECUTABLE_CAPABILITIES,
  P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
  REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
  REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
  REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
  REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_POLICY_LIMITS,
  REFERRAL_REWARD_PRESENTATION_CONTRACT,
  REFERRAL_REWARD_VALUE_CONTRACT,
  buildReferralRewardSchedulerEnvelope,
  createStandaloneCanonicalActionEngine,
  remainingReferralRewardSchedulerChildren,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import { P404ReferralRewardExecutableService } from '../src/referrals/p4-04-referral-reward-executable.service';
import {
  referralRewardPresentation,
  referralRewardClaimLookup,
} from '../src/referrals/referral-reward-claim.contract';
import { ReferralRewardPresentationService } from '../src/referrals/referral-reward-presentation.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const IDENTITY_SECRET =
  'cycle-06-p4-04-all4-proof-identity-secret-disposable-database-only';
const PAYLOAD_SECRET =
  'cycle-06-p4-04-all4-proof-payload-secret-disposable-database-only';
const PRESENTATION_KEY =
  'cycle-06-p4-04-presentation-key-disposable-database-only';
const PRESENTATION_VERSION = 'proof-v1';
const CLAIM_LOOKUP_KEY =
  'cycle-06-p4-04-claim-lookup-key-disposable-database-only';

type Engine = ReturnType<typeof createStandaloneCanonicalActionEngine>;

function proofDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p404_all4_')) {
    throw new Error(
      'P4-04 proof refuses non-disposable databases; expected maya_c06_p404_all4_*',
    );
  }
  return value;
}

function opaque(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

function hexHash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function proofEntitlements(): Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> {
  return {
    resolveFeatureRequirements: (
      tenantId,
      requiredFeatures,
      evaluatedAt = new Date(),
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

function actionRequest(input: {
  tenantId: string;
  capability: string;
  targetRef: string;
  normalizedInput: unknown;
  logicalKey: string;
  actorUserId?: string;
  sourceType?: 'authenticated_request' | 'scheduler' | 'legacy_bridge';
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: input.sourceType ?? 'legacy_bridge',
      occurrenceScope: `p4-04:${input.logicalKey}`,
      sourceRef: `p4-04-proof:${input.capability}`,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    },
    targetRef: input.targetRef,
    input: input.normalizedInput,
    evidenceRefs: [`proof:${input.logicalKey}`],
    callerIdempotency: {
      scope: `p4-04.${input.capability}`,
      key: input.logicalKey,
    },
  };
}

async function createTenant(prisma: PrismaClient, label: string) {
  const tenantId = opaque(`tenant_${label}`);
  const ownerId = opaque(`owner_${label}`);
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-04 disposable proof ${label}`,
      slug: `p4-04-proof-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      users: {
        create: {
          id: ownerId,
          email: `${ownerId}@proof.invalid`,
          passwordHash: 'not-a-real-password-hash',
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
  return { tenantId, ownerId };
}

async function createClient(
  prisma: PrismaClient,
  tenantId: string,
  label: string,
  userId?: string,
) {
  const id = opaque(`client_${label}`);
  const externalId = opaque(`yclients_${label}`);
  await prisma.client.create({
    data: { id, tenantId, userId: userId ?? null },
  });
  await prisma.crmClientLink.create({
    data: { tenantId, clientId: id, provider: 'yclients', externalId },
  });
  return { id, externalId };
}

async function approve(
  engine: Engine,
  request: TrustedActionExecutionRequestV1,
  approverUserId: string,
) {
  const pending = await engine.ingress.createExecution(request);
  assert.equal(pending.state, ActionExecutionState.PENDING_APPROVAL);
  await engine.kernel.decideApproval({
    tenantId: request.tenantId,
    executionId: pending.id,
    approverUserId,
    decision: ActionApprovalDecision.APPROVED,
  });
  return pending.id;
}

function postCommitCrashPrisma(prisma: PrismaClient): {
  prisma: PrismaClient;
  crashes(): number;
} {
  type TransactionRunner = (
    callback: (
      tx: import('@prisma/client').Prisma.TransactionClient,
    ) => Promise<unknown>,
    options?: {
      isolationLevel?: import('@prisma/client').Prisma.TransactionIsolationLevel;
    },
  ) => Promise<unknown>;
  const run = prisma.$transaction.bind(prisma) as unknown as TransactionRunner;
  let crashes = 0;
  const proxy = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== '$transaction') {
        const passthrough: unknown = Reflect.get(target, property, receiver);
        return passthrough;
      }
      return async (
        callback: (
          tx: import('@prisma/client').Prisma.TransactionClient,
        ) => Promise<unknown>,
        options?: {
          isolationLevel?: import('@prisma/client').Prisma.TransactionIsolationLevel;
        },
      ) => {
        const result = await run(callback, options);
        if (crashes === 0) {
          crashes += 1;
          throw new Error('synthetic crash after PostgreSQL commit');
        }
        return result;
      };
    },
  });
  return { prisma: proxy, crashes: () => crashes };
}

async function rejects(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    const caught: unknown = error;
    return caught;
  }
  throw new Error('Expected operation to reject');
}

async function createAppointment(input: {
  prisma: PrismaClient;
  tenantId: string;
  clientId: string;
  externalId: string;
  suffix: string;
  totalPriceKopecks: number;
}) {
  const startAt = new Date('2026-09-01T10:00:00.000Z');
  return input.prisma.appointment.create({
    data: {
      tenantId: input.tenantId,
      mayaClientId: input.clientId,
      crmProvider: 'yclients',
      crmExternalId: input.externalId,
      source: 'external',
      staffExternalId: `staff-${input.suffix}`,
      serviceIds: [`service-${input.suffix}`],
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60 * 1_000),
      blockedStartAt: startAt,
      blockedEndAt: new Date(startAt.getTime() + 60 * 60 * 1_000),
      totalPriceKopecks: input.totalPriceKopecks,
      currency: 'RUB',
      providerPayload: { visit_id: `visit-${input.suffix}` },
    },
  });
}

function rewardHash(input: {
  tenantId: string;
  reward: {
    id: string;
    issuanceId: string;
    recipientClientId: string;
    rewardSlot: string;
    amountKopecks: number | null;
    percentBasisPoints: number | null;
    liabilityCapKopecks: number | null;
    liabilityCurrency: string | null;
    presentationKeyVersion: string | null;
    issuedAt: Date;
    expiresAt: Date;
    codeHash: string;
  };
}) {
  const reward = input.reward;
  return hash([
    'p4-04.referral-reward.v1',
    input.tenantId,
    reward.id,
    reward.issuanceId,
    reward.recipientClientId,
    reward.rewardSlot,
    reward.amountKopecks === null ? 'PERCENT_DISCOUNT' : 'FIXED_MONEY_DISCOUNT',
    String(reward.amountKopecks ?? ''),
    String(reward.percentBasisPoints ?? ''),
    String(reward.liabilityCapKopecks),
    reward.liabilityCurrency ?? '',
    reward.presentationKeyVersion ?? '',
    reward.issuedAt.toISOString(),
    reward.expiresAt.toISOString(),
    reward.codeHash,
  ]);
}

async function fulfillmentInput(input: {
  prisma: PrismaClient;
  tenantId: string;
  ownerId: string;
  rewardId: string;
  appointmentId: string;
}) {
  const reward = await input.prisma.referralReward.findUniqueOrThrow({
    where: { id_tenantId: { id: input.rewardId, tenantId: input.tenantId } },
    include: {
      issuance: true,
      recipient: { include: { crmLinks: true } },
    },
  });
  const appointment = await input.prisma.appointment.findUniqueOrThrow({
    where: {
      id_tenantId: { id: input.appointmentId, tenantId: input.tenantId },
    },
  });
  const membership = await input.prisma.membership.findUniqueOrThrow({
    where: {
      userId_tenantId: { userId: input.ownerId, tenantId: input.tenantId },
    },
  });
  const serviceIds = (appointment.serviceIds as string[]).slice().sort();
  const providerVisitIdentity = String(
    (appointment.providerPayload as { visit_id: string }).visit_id,
  );
  const targetIdentityHash = hash([
    REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
    input.tenantId,
    reward.recipientClientId,
    appointment.id,
    appointment.crmProvider ?? '',
    appointment.crmExternalId ?? '',
    providerVisitIdentity,
    ...serviceIds,
    String(appointment.totalPriceKopecks),
    appointment.currency,
  ]);
  const denomination =
    reward.amountKopecks === null
      ? ('PERCENT_DISCOUNT' as const)
      : ('FIXED_MONEY_DISCOUNT' as const);
  const appliedAmountKopecks =
    denomination === 'FIXED_MONEY_DISCOUNT'
      ? Math.min(appointment.totalPriceKopecks ?? 0, reward.amountKopecks ?? 0)
      : Math.min(
          reward.liabilityCapKopecks ?? 0,
          Math.floor(
            ((appointment.totalPriceKopecks ?? 0) *
              (reward.percentBasisPoints ?? 0)) /
              10_000,
          ),
        );
  const recipientLink = reward.recipient.crmLinks.find(
    (link) => link.provider === 'yclients' && link.unlinkedAt === null,
  );
  const issuanceIdentityHash = hash([
    'p4-04.referral-reward-issuance.v1',
    input.tenantId,
    reward.issuance.id,
    reward.issuance.referralId,
    reward.issuance.actionExecutionId ?? '',
    reward.issuance.policySnapshotHash,
  ]);
  const claimBindingHash = hash([
    'p4-04.referral-reward-claim-binding.v1',
    input.tenantId,
    reward.id,
    reward.codeHash,
    REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  ]);
  const fulfillmentIdentityHash = hash([
    'p4-04.fulfill-referral-reward.v1',
    input.tenantId,
    reward.id,
    rewardHash({ tenantId: input.tenantId, reward }),
    claimBindingHash,
    targetIdentityHash,
    REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
  ]);
  return {
    provider: 'yclients',
    canonicalRewardId: reward.id,
    rewardIdentityHash: rewardHash({ tenantId: input.tenantId, reward }),
    issuanceIdentityHash,
    originatingReferralId: reward.issuance.referralId,
    recipientClientId: reward.recipientClientId,
    recipientIdentityHash: hash([
      input.tenantId,
      reward.recipientClientId,
      'yclients',
      recipientLink?.externalId ?? '',
    ]),
    requesterIdentityHash: hash([
      input.tenantId,
      input.ownerId,
      membership.id,
      String(membership.role),
      'administrative_role',
    ]),
    requesterRole: String(membership.role),
    requesterAuthority: 'administrative_role',
    fulfillmentIdentityHash,
    claimBindingHash,
    claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
    rewardSlot: reward.rewardSlot,
    valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
    denomination,
    amountKopecks: reward.amountKopecks,
    percentBasisPoints: reward.percentBasisPoints,
    liabilityCapKopecks: reward.liabilityCapKopecks,
    currency: reward.liabilityCurrency,
    issuedAt: reward.issuedAt.toISOString(),
    expiresAt: reward.expiresAt.toISOString(),
    targetContract: REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
    targetAppointmentId: appointment.id,
    targetIdentityHash,
    providerRecordIdentity: appointment.crmExternalId,
    providerVisitIdentity,
    serviceIds,
    eligibleAmountKopecks: appointment.totalPriceKopecks,
    appliedAmountKopecks,
    fulfillmentDecision: 'fulfill',
    fulfillmentPolicy: REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    providerBoundary: 'LOCAL_ONLY',
    reconciliationContract: REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
    existingFulfillmentDecision: 'none',
    legacyClaimedValueKopecks: appliedAmountKopecks,
    legacyClaimedFulfilledDecision: 'none',
    divergenceCodes: [],
  };
}

async function main() {
  const connectionString = proofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const engine = createStandaloneCanonicalActionEngine(
    prisma as unknown as PrismaService,
    proofEntitlements(),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    },
  );
  const options = {
    presentationKey: PRESENTATION_KEY,
    presentationKeyVersion: PRESENTATION_VERSION,
    claimLookupKey: CLAIM_LOOKUP_KEY,
  };
  const executor = new P404ReferralRewardExecutableService(
    prisma,
    engine.runtime,
    options,
  );
  const matrix: Record<string, boolean> = {};
  const previousEnvironment = {
    presentationKey: process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY,
    presentationVersion:
      process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION,
    claimSecret: process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET,
  };
  process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY = PRESENTATION_KEY;
  process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION =
    PRESENTATION_VERSION;
  process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET = CLAIM_LOOKUP_KEY;

  try {
    const tenant = await createTenant(prisma, 'primary');
    const otherTenant = await createTenant(prisma, 'other');
    const referrer = await createClient(prisma, tenant.tenantId, 'referrer');
    const referred = await createClient(prisma, tenant.tenantId, 'referred');
    await prisma.referralProgram.create({
      data: {
        tenantId: tenant.tenantId,
        enabled: true,
        inviterRewardKopecks: 1_000,
        inviteeRewardPercentBasisPoints: 1_000,
        inviteeRewardLiabilityCapKopecks: 5_000,
        currency: 'RUB',
      },
    });

    const relationshipIdentityHash = hash([
      'p4-04.create-customer-referral.v1',
      tenant.tenantId,
      referrer.id,
      referred.id,
    ]);
    const createInput = {
      provider: 'yclients',
      canonicalReferrerClientId: referrer.id,
      canonicalReferredClientId: referred.id,
      referrerProviderIdentityHash: hash([referrer.externalId]),
      referredProviderIdentityHash: hash([referred.externalId]),
      relationshipIdentityHash,
      referredSubjectHash: hash(['subject', referred.id]),
      referralCodeBindingHash: hash(['code', referrer.id]),
      policyProfile: REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
      policySnapshotHash: hash(['create-policy-v1']),
      eligibilityDecision: 'eligible',
      intendedStatus: 'pending',
    };
    const createRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_04_EXECUTABLE_CAPABILITIES.createReferral,
      targetRef: `referral:${relationshipIdentityHash}`,
      normalizedInput: createInput,
      logicalKey: `create:${relationshipIdentityHash}`,
    });
    const created = await executor.execute(createRequest);
    const createReplay = await executor.execute(createRequest);
    assert.equal(created.value.referralId, createReplay.value.referralId);
    assert.equal(
      await prisma.customerReferral.count({
        where: {
          tenantId: tenant.tenantId,
          identityHash: relationshipIdentityHash,
        },
      }),
      1,
    );
    matrix.referralRelationshipDeterministic = true;

    const referral = await prisma.customerReferral.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: created.value.referralId!,
          tenantId: tenant.tenantId,
        },
      },
    });
    const resolveInput = {
      provider: 'yclients',
      customerReferralId: referral.id,
      canonicalReferrerClientId: referrer.id,
      canonicalReferredClientId: referred.id,
      referrerProviderIdentityHash: createInput.referrerProviderIdentityHash,
      referredProviderIdentityHash: createInput.referredProviderIdentityHash,
      relationshipIdentityHash,
      resolutionIdentityHash: hash(['resolution', referral.id, 'qualified']),
      terminalOutcome: 'qualified',
      joinedAt: referral.joinedAt.toISOString(),
      evaluationWindow: '2026-09-01',
      providerVisitIdentityHash: hash(['visit', referred.id]),
      evidenceDecision: 'exact_attended_visit',
      policyProfile: REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
      policySnapshotHash: hash(['resolve-policy-v1']),
      eligibilityDecision: 'eligible_for_resolution',
      legacyClaimedOutcome: 'qualified',
      shadowDivergence: false,
    };
    const resolveRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_04_EXECUTABLE_CAPABILITIES.resolveReferral,
      targetRef: `referral:${referral.id}`,
      normalizedInput: resolveInput,
      logicalKey: `resolve:${resolveInput.resolutionIdentityHash}`,
      sourceType: 'scheduler',
    });
    const resolved = await executor.execute(resolveRequest);
    assert.equal(
      (await executor.execute(resolveRequest)).value.referralId,
      resolved.value.referralId,
    );
    const qualified = await prisma.customerReferral.findUniqueOrThrow({
      where: { id_tenantId: { id: referral.id, tenantId: tenant.tenantId } },
      include: { resolutionExecution: true },
    });
    assert.equal(qualified.status, 'qualified');
    matrix.qualificationBoundToExactReferral = true;

    const resolution = qualified.resolutionExecution!;
    const resolutionEvidenceHash = hash([
      'p4-04.qualified-resolution-evidence.v1',
      tenant.tenantId,
      referral.id,
      resolution.id,
      resolution.normalizedInputHash,
      resolution.policyContextHash ?? '',
      resolution.finalizedAt!.toISOString(),
      qualified.resolvedAt!.toISOString(),
    ]);
    const issuedAt = qualified.resolvedAt!.toISOString();
    const expiresAtDate = new Date(issuedAt);
    expiresAtDate.setUTCDate(
      expiresAtDate.getUTCDate() + REFERRAL_REWARD_POLICY_LIMITS.ttlDays,
    );
    const expiresAt = expiresAtDate.toISOString();
    const policySnapshotHash = hash(['reward-policy-v1', tenant.tenantId]);
    const issuanceIdentityHash = hash([
      'p4-04.issue-referral-rewards.v1',
      tenant.tenantId,
      referral.id,
      policySnapshotHash,
    ]);
    const rewardPlan = (
      slot: 'inviter' | 'invitee',
      recipientClientId: string,
      denomination: 'FIXED_MONEY_DISCOUNT' | 'PERCENT_DISCOUNT',
    ) => {
      const rewardId = hash([
        'p4-04.referral-reward-id.v1',
        tenant.tenantId,
        issuanceIdentityHash,
        slot,
      ]);
      const presentation = referralRewardPresentation(
        {
          tenantId: tenant.tenantId,
          issuanceId: issuanceIdentityHash,
          rewardId,
          recipientClientId,
          rewardSlot: slot,
          expiresAt,
        },
        {
          presentationKey: PRESENTATION_KEY,
          presentationKeyVersion: PRESENTATION_VERSION,
          lookupKey: CLAIM_LOOKUP_KEY,
        },
      );
      const amountKopecks =
        denomination === 'FIXED_MONEY_DISCOUNT' ? 1_000 : null;
      const percentBasisPoints =
        denomination === 'PERCENT_DISCOUNT' ? 1_000 : null;
      const liabilityCapKopecks =
        denomination === 'FIXED_MONEY_DISCOUNT' ? 1_000 : 5_000;
      return {
        slot,
        recipientClientId,
        rewardId,
        rewardIdentityHash: hash([
          'p4-04.referral-reward-slot.v1',
          tenant.tenantId,
          issuanceIdentityHash,
          slot,
          recipientClientId,
          denomination,
          String(amountKopecks ?? ''),
          String(percentBasisPoints ?? ''),
          String(liabilityCapKopecks),
          'RUB',
          expiresAt,
          REFERRAL_REWARD_VALUE_CONTRACT,
          presentation.presentationKeyVersion,
          presentation.codeHash,
        ]),
        denomination,
        amountKopecks,
        percentBasisPoints,
        liabilityCapKopecks,
        liabilityCurrency: 'RUB',
        presentationKeyVersion: PRESENTATION_VERSION,
        presentationReference: presentation.presentationReference,
        codeHash: presentation.codeHash,
      };
    };
    const rewardPlans = [
      rewardPlan('inviter', referrer.id, 'FIXED_MONEY_DISCOUNT'),
      rewardPlan('invitee', referred.id, 'PERCENT_DISCOUNT'),
    ];
    const issueInput = {
      provider: 'yclients',
      customerReferralId: referral.id,
      resolutionExecutionId: resolution.id,
      resolutionEvidenceHash,
      canonicalReferrerClientId: referrer.id,
      canonicalReferredClientId: referred.id,
      issuanceIdentityHash,
      issuanceId: issuanceIdentityHash,
      rewardPolicyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
      currency: 'RUB',
      issuedAt,
      expiresAt,
      maxRecipients: REFERRAL_REWARD_POLICY_LIMITS.maxRecipients,
      perRewardLiabilityCapKopecks:
        REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks,
      perIssuanceLiabilityCapKopecks:
        REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks,
      approvalThresholdKopecks:
        REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks,
      executableApprovalRequirement: 'REQUIRED',
      presentationContract: REFERRAL_REWARD_PRESENTATION_CONTRACT,
      claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
      rewards: rewardPlans,
      aggregateLiabilityKopecks: 6_000,
      capDecision: 'within_cap',
      legacyClaimedInviterRewardKopecks: 1_000,
      legacyClaimedInviteeRewardKopecks: 5_000,
      shadowDivergence: false,
    };
    const issueRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_04_EXECUTABLE_CAPABILITIES.issueRewards,
      targetRef: `referral:${referral.id}`,
      normalizedInput: issueInput,
      logicalKey: `issue:${issuanceIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
    });
    await approve(engine, issueRequest, tenant.ownerId);
    const crashingIssuePrisma = postCommitCrashPrisma(prisma);
    const crashingIssueExecutor = new P404ReferralRewardExecutableService(
      crashingIssuePrisma.prisma,
      engine.runtime,
      options,
    );
    const issued = await crashingIssueExecutor.execute(issueRequest);
    assert.equal(crashingIssuePrisma.crashes(), 1);
    assert.equal(issued.value.rewardIds?.length, 2);
    assert.equal(
      (await executor.execute(issueRequest)).value.issuanceId,
      issued.value.issuanceId,
    );
    assert.equal(
      await prisma.referralRewardIssuance.count({
        where: { tenantId: tenant.tenantId, referralId: referral.id },
      }),
      1,
    );
    matrix.issueCrashReconcilesWithoutDuplicate = true;

    const presentationService = new ReferralRewardPresentationService(
      prisma as unknown as PrismaService,
    );
    for (const plan of rewardPlans) {
      const presented = await presentationService.present({
        tenantId: tenant.tenantId,
        rewardId: plan.rewardId,
        recipientClientId: plan.recipientClientId,
      });
      assert.equal(presented.outcome, 'presented');
      assert.equal(
        referralRewardClaimLookup(CLAIM_LOOKUP_KEY, presented.bearer),
        plan.codeHash,
      );
      assert(
        !JSON.stringify(
          await prisma.referralReward.findUniqueOrThrow({
            where: {
              id_tenantId: { id: plan.rewardId, tenantId: tenant.tenantId },
            },
          }),
        ).includes(presented.bearer),
      );
    }
    matrix.crashSafeBearerRepresentation = true;
    matrix.rawBearerNotPersisted = true;

    const frozenBefore = await prisma.referralReward.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: rewardPlans[0].rewardId,
          tenantId: tenant.tenantId,
        },
      },
    });
    await prisma.referralProgram.update({
      where: { tenantId: tenant.tenantId },
      data: { inviterRewardKopecks: 2_000 },
    });
    const frozenAfter = await prisma.referralReward.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: rewardPlans[0].rewardId,
          tenantId: tenant.tenantId,
        },
      },
    });
    assert.equal(frozenAfter.amountKopecks, frozenBefore.amountKopecks);
    assert.equal(
      frozenAfter.presentationKeyVersion,
      frozenBefore.presentationKeyVersion,
    );
    await rejects(() =>
      prisma.referralReward.update({
        where: {
          id_tenantId: { id: frozenAfter.id, tenantId: tenant.tenantId },
        },
        data: { amountKopecks: 2_000 },
      }),
    );
    matrix.frozenRewardValueImmutable = true;

    const referrerAppointment = await createAppointment({
      prisma,
      tenantId: tenant.tenantId,
      clientId: referrer.id,
      externalId: opaque('appointment_referrer'),
      suffix: 'referrer',
      totalPriceKopecks: 4_000,
    });
    const wrongAppointment = await createAppointment({
      prisma,
      tenantId: tenant.tenantId,
      clientId: referred.id,
      externalId: opaque('appointment_wrong'),
      suffix: 'wrong',
      totalPriceKopecks: 4_000,
    });
    const inviterFulfillment = await fulfillmentInput({
      prisma,
      tenantId: tenant.tenantId,
      ownerId: tenant.ownerId,
      rewardId: rewardPlans[0].rewardId,
      appointmentId: referrerAppointment.id,
    });
    const changedTarget = {
      ...inviterFulfillment,
      targetAppointmentId: wrongAppointment.id,
    };
    const wrongTargetError = await rejects(() =>
      executor.execute(
        actionRequest({
          tenantId: tenant.tenantId,
          capability: P4_04_EXECUTABLE_CAPABILITIES.fulfillReward,
          targetRef: `appointment:${wrongAppointment.id}`,
          normalizedInput: changedTarget,
          logicalKey: 'fulfill:wrong-target',
          actorUserId: tenant.ownerId,
          sourceType: 'authenticated_request',
        }),
      ),
    );
    assert(wrongTargetError instanceof Error);
    assert.equal(await prisma.referralRewardFulfillment.count(), 0);
    matrix.changedTargetRejected = true;

    const inviterRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_04_EXECUTABLE_CAPABILITIES.fulfillReward,
      targetRef: `appointment:${referrerAppointment.id}`,
      normalizedInput: inviterFulfillment,
      logicalKey: `fulfill:${inviterFulfillment.fulfillmentIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
    });
    const crashingFulfillPrisma = postCommitCrashPrisma(prisma);
    const crashingFulfillExecutor = new P404ReferralRewardExecutableService(
      crashingFulfillPrisma.prisma,
      engine.runtime,
      options,
    );
    const fulfilled = await crashingFulfillExecutor.execute(inviterRequest);
    assert.equal(crashingFulfillPrisma.crashes(), 1);
    assert.equal(fulfilled.value.appliedAmountKopecks, 1_000);
    assert.equal(
      (await executor.execute(inviterRequest)).value.fulfillmentId,
      fulfilled.value.fulfillmentId,
    );
    matrix.fulfillmentCommitReconcilesAtomically = true;

    const referredAppointment = await createAppointment({
      prisma,
      tenantId: tenant.tenantId,
      clientId: referred.id,
      externalId: opaque('appointment_referred'),
      suffix: 'referred',
      totalPriceKopecks: 20_000,
    });
    const inviteeFulfillment = await fulfillmentInput({
      prisma,
      tenantId: tenant.tenantId,
      ownerId: tenant.ownerId,
      rewardId: rewardPlans[1].rewardId,
      appointmentId: referredAppointment.id,
    });
    const racingRequests = ['a', 'b'].map((suffix) =>
      actionRequest({
        tenantId: tenant.tenantId,
        capability: P4_04_EXECUTABLE_CAPABILITIES.fulfillReward,
        targetRef: `appointment:${referredAppointment.id}`,
        normalizedInput: inviteeFulfillment,
        logicalKey: `fulfill:${inviteeFulfillment.fulfillmentIdentityHash}:${suffix}`,
        actorUserId: tenant.ownerId,
        sourceType: 'authenticated_request',
      }),
    );
    const racing = await Promise.allSettled(
      racingRequests.map((request) => executor.execute(request)),
    );
    assert.equal(
      racing.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await prisma.referralRewardFulfillment.count({
        where: {
          tenantId: tenant.tenantId,
          rewardId: rewardPlans[1].rewardId,
        },
      }),
      1,
    );
    matrix.concurrentFulfillmentCreatesOneClaim = true;
    matrix.duplicateRewardValueImpossible = true;

    const restartedExecutor = new P404ReferralRewardExecutableService(
      prisma,
      engine.runtime,
      options,
    );
    assert.equal(
      (await restartedExecutor.execute(createRequest)).value.referralId,
      created.value.referralId,
    );
    assert.equal(
      (await restartedExecutor.execute(issueRequest)).value.issuanceId,
      issued.value.issuanceId,
    );
    matrix.restartPreservesLogicalIdentity = true;

    const heldA = await createClient(prisma, tenant.tenantId, 'held_a');
    const heldB = await createClient(prisma, tenant.tenantId, 'held_b');
    await prisma.unresolvedClientIdentityHold.create({
      data: {
        tenantId: tenant.tenantId,
        provider: 'yclients',
        externalId: heldB.externalId,
        reasonCode: 'loyalty_identity_unresolved',
        sourceNamespace: 'p4-04-proof',
        sourceEvidenceHash: hexHash(['held', heldB.externalId]),
        unresolvedPrincipalCount: 2,
      },
    });
    const heldIdentity = hash(['held-referral', heldA.id, heldB.id]);
    await rejects(() =>
      executor.execute(
        actionRequest({
          tenantId: tenant.tenantId,
          capability: P4_04_EXECUTABLE_CAPABILITIES.createReferral,
          targetRef: `referral:${heldIdentity}`,
          logicalKey: `create:${heldIdentity}`,
          normalizedInput: {
            ...createInput,
            canonicalReferrerClientId: heldA.id,
            canonicalReferredClientId: heldB.id,
            relationshipIdentityHash: heldIdentity,
          },
        }),
      ),
    );
    matrix.unresolvedIdentityHoldFailsClosed = true;

    await rejects(() =>
      executor.execute(
        actionRequest({
          tenantId: otherTenant.tenantId,
          capability: P4_04_EXECUTABLE_CAPABILITIES.createReferral,
          targetRef: `referral:${relationshipIdentityHash}`,
          logicalKey: 'cross-tenant',
          normalizedInput: createInput,
        }),
      ),
    );
    matrix.tenantIsolation = true;

    const forgedIssue = structuredClone(issueRequest);
    forgedIssue.input = {
      ...(forgedIssue.input as Record<string, unknown>),
      rewardPolicyProfile: 'initiator-selected-policy',
    };
    const forgedIssueError = await rejects(() => executor.execute(forgedIssue));
    assert(forgedIssueError instanceof ActionContractError);
    const forgedFulfill = structuredClone(inviterRequest);
    forgedFulfill.input = {
      ...(forgedFulfill.input as Record<string, unknown>),
      requesterAuthority: 'server_cashier_allowlist',
    };
    await rejects(() => executor.execute(forgedFulfill));
    matrix.forgedPolicyValueAuthorityRejected = true;

    const envelope = buildReferralRewardSchedulerEnvelope({
      tenantId: tenant.tenantId,
      now: new Date('2026-09-01T12:02:00.000Z'),
      candidates: [
        {
          referralId: referral.id,
          recipientClientIds: [referrer.id, referred.id],
          maximumLiabilityKopecks: 6_000,
          currency: 'RUB',
        },
        {
          referralId: 'proof-referral-second',
          recipientClientIds: ['proof-client-a', 'proof-client-b'],
          maximumLiabilityKopecks: 4_000,
          currency: 'RUB',
        },
      ],
    });
    const envelopeReplay = buildReferralRewardSchedulerEnvelope({
      tenantId: tenant.tenantId,
      now: new Date('2026-09-01T12:10:00.000Z'),
      candidates: [
        {
          referralId: 'proof-referral-second',
          recipientClientIds: ['proof-client-b', 'proof-client-a'],
          maximumLiabilityKopecks: 4_000,
          currency: 'RUB',
        },
        {
          referralId: referral.id,
          recipientClientIds: [referred.id, referrer.id],
          maximumLiabilityKopecks: 6_000,
          currency: 'RUB',
        },
      ],
    });
    assert.equal(envelope.batchIdentityHash, envelopeReplay.batchIdentityHash);
    const envelopeRequest = actionRequest({
      tenantId: tenant.tenantId,
      capability: P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
      targetRef: `referral-reward-batch:${envelope.audienceHash}`,
      logicalKey: `envelope:${envelope.batchIdentityHash}`,
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
      normalizedInput: envelope,
    });
    await approve(engine, envelopeRequest, tenant.ownerId);
    const envelopeReceipt = await executor.execute(envelopeRequest);
    assert.equal(envelopeReceipt.value.rewardValueFacts, 0);
    assert.deepEqual(
      remainingReferralRewardSchedulerChildren({
        envelope,
        completedChildExecutionIdentities: new Set([
          envelope.childExecutionIdentities[0],
        ]),
      }),
      [envelope.childExecutionIdentities[1]],
    );
    assert.throws(() =>
      buildReferralRewardSchedulerEnvelope({
        tenantId: tenant.tenantId,
        now: new Date('2026-09-01T12:02:00.000Z'),
        candidates: [
          {
            referralId: 'over-cap',
            recipientClientIds: ['one'],
            maximumLiabilityKopecks:
              REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks + 1,
            currency: 'RUB',
          },
        ],
      }),
    );
    matrix.schedulerEnvelopeDeterministic = true;
    matrix.schedulerCapsBoundedFanoutAndResume = true;

    assert.equal(await prisma.loyaltyTransaction.count(), 0);
    assert.equal(
      await prisma.referralRewardFulfillment.count({
        where: { tenantId: tenant.tenantId },
      }),
      2,
    );
    assert.equal(
      (
        await prisma.referralRewardFulfillment.aggregate({
          where: { tenantId: tenant.tenantId },
          _sum: { appliedAmountKopecks: true },
        })
      )._sum.appliedAmountKopecks,
      3_000,
    );
    matrix.noImplicitRewardToPointsConversion = true;
    matrix.providerWritesZero = true;
    matrix.blindRetryAfterUnknownImpossible = true;

    process.stdout.write(
      `${JSON.stringify(
        {
          contract: 'maya.p4-04-all4-executable-proof/1',
          actionClassesProven: 4,
          matrix,
          counts: {
            referrals: await prisma.customerReferral.count({
              where: { tenantId: tenant.tenantId },
            }),
            issuances: await prisma.referralRewardIssuance.count({
              where: { tenantId: tenant.tenantId },
            }),
            rewards: await prisma.referralReward.count({
              where: { tenantId: tenant.tenantId },
            }),
            fulfillments: await prisma.referralRewardFulfillment.count({
              where: { tenantId: tenant.tenantId },
            }),
            loyaltyTransactions: await prisma.loyaltyTransaction.count(),
          },
          productionMutations: 0,
          providerWrites: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (previousEnvironment.presentationKey === undefined) {
      delete process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY;
    } else {
      process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY =
        previousEnvironment.presentationKey;
    }
    if (previousEnvironment.presentationVersion === undefined) {
      delete process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION;
    } else {
      process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION =
        previousEnvironment.presentationVersion;
    }
    if (previousEnvironment.claimSecret === undefined) {
      delete process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET;
    } else {
      process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET =
        previousEnvironment.claimSecret;
    }
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
