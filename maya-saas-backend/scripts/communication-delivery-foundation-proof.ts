import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  ActionReconciliationState,
  CommunicationCampaignState,
  CommunicationDeliveryState,
  ExternalDispatchState,
  PrismaClient,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  COMMUNICATION_ENVELOPE_CONTRACT,
  CommunicationCapabilityRegistry,
  CommunicationDeliveryError,
  CommunicationDeliveryKernel,
  ScriptedCommunicationTestAdapter,
  type CommunicationDeliveryClaimV1,
  type CreateCommunicationEnvelopeV1,
  type OwnedCommunicationAttemptV1,
  type ScriptedDispatchOutcome,
  type ScriptedReconciliationResult,
} from '../src/communication-delivery';

const IDENTITY_SECRET =
  'cycle-06-b31-proof-identity-secret-never-used-outside-proof-databases';
const PAYLOAD_SECRET =
  'cycle-06-b31-proof-payload-secret-never-used-outside-proof-databases';
const LEASE_MS = 1_000;
let proofStage = 'bootstrap';

interface ProofReport {
  database: string;
  matrix: Record<string, boolean>;
  metrics: Awaited<ReturnType<CommunicationDeliveryKernel['metrics']>>;
  campaignStates: Record<string, number>;
  externalMessagesSent: 0;
  productionProvidersImported: false;
}

function stage(name: string): void {
  proofStage = name;
}

function requireProofDatabaseUrl(): {
  connectionString: string;
  database: string;
} {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !database.startsWith('maya_c06_delivery_') &&
    process.env.COMMUNICATION_DELIVERY_PROOF_ALLOW_DATABASE !== '1'
  ) {
    throw new Error(
      'Communication proof refuses non-proof databases. Use maya_c06_delivery_*.',
    );
  }
  return { connectionString, database };
}

function opaque(label: string): string {
  return `${label}_${randomUUID().replaceAll('-', '')}`;
}

function digest(label: string): string {
  return createHash('sha256').update(label).digest('base64url');
}

function first<T>(values: readonly T[], label: string): T {
  const value = values[0];
  assert(value !== undefined, `Expected ${label}`);
  return value;
}

function actionRequest(
  tenantId: string,
  scope: string,
): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId,
    capability: 'kernel.test.safe-retry',
    source: {
      type: 'synthetic_shadow',
      occurrenceScope: `communication/${scope}`,
      sourceRef: `communication-source/${scope}`,
    },
    targetRef: `communication-target/${scope}`,
    input: { valueRef: `communication-value/${scope}` },
    evidenceRefs: [`communication-evidence/${scope}`],
  };
}

function recipient(
  scope: string,
  decision: 'ALLOW' | 'SKIP' | 'DENY' = 'ALLOW',
) {
  return {
    recipientRef: `raw-proof-recipient/${scope}`,
    recipientKind: 'external_client',
    eligibility: {
      basis: 'existing_consent_policy',
      decision,
      policyVersion: 1,
      evidenceRef: `consent/${scope}`,
      evidenceHash: digest(`consent/${scope}`),
      checkedAt: new Date(),
      reasonCode: decision === 'ALLOW' ? undefined : `PROOF_${decision}`,
    },
  };
}

function owned(
  claim: CommunicationDeliveryClaimV1,
  recipientRevision = claim.recipient.revision,
): OwnedCommunicationAttemptV1 {
  return {
    tenantId: claim.recipient.tenantId,
    campaignId: claim.recipient.campaignId,
    recipientId: claim.recipient.id,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
    recipientRevision,
  };
}

async function expectReject(
  matrix: Record<string, boolean>,
  name: string,
  operation: () => Promise<unknown>,
  expectedCode?: string,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = true;
    if (expectedCode) {
      assert(error instanceof CommunicationDeliveryError, name);
      assert.equal(error.code, expectedCode, name);
    }
  }
  assert.equal(rejected, true, `Forbidden operation succeeded: ${name}`);
  matrix[name] = true;
}

async function createTenant(
  prisma: PrismaClient,
  cleanupTenantIds: string[],
  label: string,
): Promise<string> {
  const id = opaque(`delivery_tenant_${label}`);
  await prisma.tenant.create({
    data: {
      id,
      name: `Communication proof ${label}`,
      slug: `${label}-${randomUUID()}`.toLowerCase(),
    },
  });
  cleanupTenantIds.push(id);
  return id;
}

async function createAction(
  actionKernel: ActionEngineKernel,
  tenantId: string,
  scope: string,
) {
  const execution = await actionKernel.createExecution(
    actionRequest(tenantId, scope),
  );
  assert.equal(execution.state, ActionExecutionState.READY);
  assert.equal(execution.dryRun, false);
  return execution;
}

async function createAudience(input: {
  prisma: PrismaClient;
  tenantId: string;
  scope: string;
  recipientCount: number;
  expiresAt: Date;
}) {
  return input.prisma.marketingAudience.create({
    data: {
      id: opaque(`audience_${input.scope}`),
      tenantId: input.tenantId,
      createdByUserId: opaque('synthetic_creator'),
      ruleJson: { proofRef: input.scope },
      recipientUserIdsJson: [],
      candidateCount: input.recipientCount,
      eligibleCount: input.recipientCount,
      expiresAt: input.expiresAt,
      provider: 'communication.test.reconcilable',
      status: 'AUDIENCE_CALCULATED',
      snapshotHash: digest(`audience/${input.scope}`),
      exclusionReasonsJson: {},
    },
  });
}

async function envelopeInput(input: {
  prisma: PrismaClient;
  actionKernel: ActionEngineKernel;
  tenantId: string;
  scope: string;
  now: Date;
  capabilityKey?: string;
  recipients?: ReturnType<typeof recipient>[];
  kind?: 'SINGLE' | 'BULK';
  expiryMs?: number;
}): Promise<CreateCommunicationEnvelopeV1> {
  const recipients = input.recipients ?? [recipient(input.scope)];
  const kind = input.kind ?? 'SINGLE';
  const expiresAt = new Date(input.now.getTime() + (input.expiryMs ?? 60_000));
  const execution = await createAction(
    input.actionKernel,
    input.tenantId,
    input.scope,
  );
  let audienceId: string | undefined;
  let audienceSnapshotHash: string | undefined;
  if (kind === 'BULK') {
    const audience = await createAudience({
      prisma: input.prisma,
      tenantId: input.tenantId,
      scope: input.scope,
      recipientCount: recipients.length,
      expiresAt,
    });
    audienceId = audience.id;
    audienceSnapshotHash = audience.snapshotHash;
  }
  return {
    contract: COMMUNICATION_ENVELOPE_CONTRACT,
    tenantId: input.tenantId,
    actionExecutionId: execution.id,
    scope: kind,
    channel: 'test',
    capabilityKey: input.capabilityKey ?? 'communication.test.reconcilable',
    campaignIdempotencyKey: `campaign/${input.scope}`,
    contentRef: `content/${input.scope}`,
    contentIdentityHash: digest(`content/${input.scope}`),
    expiresAt,
    recipients,
    audienceId,
    audienceSnapshotHash,
  };
}

async function createEnvelope(input: {
  prisma: PrismaClient;
  actionKernel: ActionEngineKernel;
  deliveryKernel: CommunicationDeliveryKernel;
  tenantId: string;
  scope: string;
  now: Date;
  capabilityKey?: string;
  recipients?: ReturnType<typeof recipient>[];
  kind?: 'SINGLE' | 'BULK';
  expiryMs?: number;
}) {
  const request = await envelopeInput(input);
  return input.deliveryKernel.createEnvelope(request);
}

async function claimRequired(
  kernel: CommunicationDeliveryKernel,
  tenantId: string,
  campaignId: string,
  workerId: string,
) {
  const claim = await kernel.claimNext({ tenantId, campaignId, workerId });
  assert(claim, `Expected delivery claim for ${campaignId}`);
  return claim;
}

async function applyDispatchOutcome(input: {
  kernel: CommunicationDeliveryKernel;
  claim: CommunicationDeliveryClaimV1;
  outcome: ScriptedDispatchOutcome;
}) {
  if (input.outcome.kind === 'PRE_DISPATCH_FAILURE') {
    return input.kernel.finalizePreDispatchFailure({
      ...owned(input.claim),
      outcomeCode: input.outcome.outcomeCode,
      errorCode: input.outcome.errorCode,
    });
  }
  const boundary = await input.kernel.markDispatchBoundary(owned(input.claim));
  const boundaryOwnership = owned(input.claim, boundary.recipient.revision);
  if (input.outcome.kind === 'ACCEPTED') {
    return input.kernel.finalizeAccepted({
      ...boundaryOwnership,
      outcomeCode: input.outcome.outcomeCode,
      providerReference: input.outcome.providerReference,
    });
  }
  if (input.outcome.kind === 'DELIVERED') {
    return input.kernel.finalizeDelivered({
      ...boundaryOwnership,
      outcomeCode: input.outcome.outcomeCode,
      providerReference: input.outcome.providerReference,
    });
  }
  if (input.outcome.kind === 'REJECTED') {
    return input.kernel.finalizeDeterministicReject({
      ...boundaryOwnership,
      outcomeCode: input.outcome.outcomeCode,
      errorCode: input.outcome.errorCode,
    });
  }
  if (input.outcome.kind === 'UNKNOWN') {
    return input.kernel.finalizeUnknown({
      ...boundaryOwnership,
      outcomeCode: input.outcome.outcomeCode,
      errorCode: input.outcome.errorCode,
    });
  }
  throw new Error('Unsupported scripted dispatch outcome');
}

async function applyReconciliation(input: {
  kernel: CommunicationDeliveryKernel;
  tenantId: string;
  campaignId: string;
  recipientId: string;
  workerId: string;
  result: ScriptedReconciliationResult;
}) {
  const claim = await input.kernel.claimReconciliation({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    recipientId: input.recipientId,
    workerId: input.workerId,
  });
  return input.kernel.finalizeReconciliation({
    ...owned(claim),
    ...input.result,
  });
}

async function makeUnknown(input: {
  prisma: PrismaClient;
  actionKernel: ActionEngineKernel;
  deliveryKernel: CommunicationDeliveryKernel;
  tenantId: string;
  scope: string;
  now: Date;
}) {
  const campaign = await createEnvelope(input);
  const claim = await claimRequired(
    input.deliveryKernel,
    input.tenantId,
    campaign.id,
    `worker.${input.scope}`,
  );
  const unknownAdapter = new ScriptedCommunicationTestAdapter(
    'communication.test.reconcilable',
    [
      {
        kind: 'UNKNOWN',
        outcomeCode: 'synthetic_transport_timeout',
        errorCode: 'synthetic_timeout_after_dispatch',
      },
    ],
  );
  const row = await applyDispatchOutcome({
    kernel: input.deliveryKernel,
    claim,
    outcome: unknownAdapter.nextDispatch(),
  });
  assert.equal(row.deliveryState, CommunicationDeliveryState.UNKNOWN);
  return { campaign, recipient: row, adapter: unknownAdapter };
}

async function main(): Promise<void> {
  const { connectionString, database } = requireProofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const cleanupTenantIds: string[] = [];
  const matrix: Record<string, boolean> = {};
  let now = new Date();
  const actionKernel = new ActionEngineKernel(prisma, {
    identitySecret: IDENTITY_SECRET,
    payloadEncryptionSecret: PAYLOAD_SECRET,
    now: () => new Date(now),
    executionLeaseMs: LEASE_MS,
    reconciliationLeaseMs: LEASE_MS,
  });
  const deliveryKernel = new CommunicationDeliveryKernel(prisma, {
    identitySecret: IDENTITY_SECRET,
    payloadEncryptionSecret: PAYLOAD_SECRET,
    now: () => new Date(now),
    executionLeaseMs: LEASE_MS,
    reconciliationLeaseMs: LEASE_MS,
  });

  try {
    stage('tenant_setup');
    const tenantA = await createTenant(prisma, cleanupTenantIds, 'a');
    const tenantB = await createTenant(prisma, cleanupTenantIds, 'b');

    stage('provider_capability_declarations');
    const definitions = new CommunicationCapabilityRegistry().list();
    assert(definitions.length >= 3);
    for (const definition of definitions) {
      assert.equal(definition.testOnly, true);
      assert.equal(definition.externalDispatchEnabled, false);
      assert.equal(typeof definition.providerIdempotencySupported, 'boolean');
      assert.equal(typeof definition.providerReferenceReturned, 'boolean');
      assert.equal(typeof definition.reconciliationSupported, 'boolean');
      assert.equal(typeof definition.proofOfNonDeliverySupported, 'boolean');
      assert.equal(typeof definition.acceptedIsTerminal, 'boolean');
    }
    matrix.provider_capabilities_explicit_and_test_only = true;

    stage('logical_delivery_dedup');
    const dedupInput = await envelopeInput({
      prisma,
      actionKernel,
      tenantId: tenantA,
      scope: opaque('dedup'),
      now,
    });
    const dedupRows = await Promise.all(
      Array.from({ length: 4 }, () =>
        new CommunicationDeliveryKernel(prisma, {
          identitySecret: IDENTITY_SECRET,
          payloadEncryptionSecret: PAYLOAD_SECRET,
          now: () => new Date(now),
        }).createEnvelope(dedupInput),
      ),
    );
    assert.equal(new Set(dedupRows.map((row) => row.id)).size, 1);
    const deduplicatedCampaign = first(dedupRows, 'deduplicated campaign');
    assert.equal(
      await prisma.marketingCampaignRecipient.count({
        where: { tenantId: tenantA, campaignId: deduplicatedCampaign.id },
      }),
      1,
    );
    const restartKernel = new CommunicationDeliveryKernel(prisma, {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    });
    const restartRow = await restartKernel.createEnvelope(dedupInput);
    assert.equal(restartRow.id, deduplicatedCampaign.id);
    matrix.same_logical_delivery_deduplicated = true;
    matrix.restart_identity_stable = true;

    stage('same_recipient_different_communication');
    const sharedRecipientRef = opaque('shared_recipient');
    const firstCommunication = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('communication_one'),
      now,
      recipients: [recipient(sharedRecipientRef)],
    });
    const secondCommunication = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('communication_two'),
      now,
      recipients: [recipient(sharedRecipientRef)],
    });
    const firstCommunicationRecipient = first(
      firstCommunication.recipients,
      'first communication recipient',
    );
    const secondCommunicationRecipient = first(
      secondCommunication.recipients,
      'second communication recipient',
    );
    assert.notEqual(
      firstCommunicationRecipient.idempotencyKey,
      secondCommunicationRecipient.idempotencyKey,
    );
    matrix.same_recipient_different_communication_allowed = true;

    stage('same_identity_another_tenant');
    const crossTenantScope = opaque('cross_tenant_identity');
    const tenantAEnvelope = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: crossTenantScope,
      now,
      recipients: [recipient('same_external_subject')],
    });
    const tenantBEnvelope = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantB,
      scope: crossTenantScope,
      now,
      recipients: [recipient('same_external_subject')],
    });
    const tenantARecipient = first(
      tenantAEnvelope.recipients,
      'tenant A recipient',
    );
    const tenantBRecipient = first(
      tenantBEnvelope.recipients,
      'tenant B recipient',
    );
    assert.notEqual(
      tenantARecipient.idempotencyKey,
      tenantBRecipient.idempotencyKey,
    );
    matrix.same_identity_another_tenant_allowed = true;

    stage('tenant_reference_invariants');
    await expectReject(matrix, 'action_execution_cross_tenant_rejected', () =>
      deliveryKernel.createEnvelope({
        ...dedupInput,
        tenantId: tenantB,
      }),
    );
    await expectReject(matrix, 'recipient_campaign_cross_tenant_rejected', () =>
      prisma.marketingCampaignRecipient.create({
        data: {
          id: opaque('cross_recipient'),
          tenantId: tenantB,
          campaignId: tenantAEnvelope.id,
          externalClientId: digest('cross-recipient'),
          idempotencyKey: digest('cross-recipient-identity'),
          status: 'NOT_SENT',
          updatedAt: now,
        },
      }),
    );
    await expectReject(matrix, 'attempt_recipient_cross_tenant_rejected', () =>
      prisma.marketingDeliveryAttempt.create({
        data: {
          id: opaque('cross_attempt'),
          tenantId: tenantB,
          campaignId: tenantAEnvelope.id,
          recipientId: tenantARecipient.id,
          batchKey: digest('cross-attempt-batch'),
          attemptNumber: 1,
          status: 'STARTED',
        },
      }),
    );

    stage('two_workers_one_recipient');
    const raceCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('worker_race'),
      now,
    });
    const workerA = new CommunicationDeliveryKernel(prisma, {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
      now: () => new Date(now),
      executionLeaseMs: LEASE_MS,
    });
    const workerB = new CommunicationDeliveryKernel(prisma, {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
      now: () => new Date(now),
      executionLeaseMs: LEASE_MS,
    });
    const race = await Promise.all([
      workerA.claimNext({
        tenantId: tenantA,
        campaignId: raceCampaign.id,
        workerId: 'worker.race.a',
      }),
      workerB.claimNext({
        tenantId: tenantA,
        campaignId: raceCampaign.id,
        workerId: 'worker.race.b',
      }),
    ]);
    const claims = race.filter(
      (claim): claim is CommunicationDeliveryClaimV1 => claim !== null,
    );
    assert.equal(claims.length, 1);
    const raceClaim = first(claims, 'race claim');
    const raceRecipient = first(raceCampaign.recipients, 'race recipient');
    assert.equal(
      await prisma.marketingDeliveryAttempt.count({
        where: {
          tenantId: tenantA,
          campaignId: raceCampaign.id,
          recipientId: raceRecipient.id,
        },
      }),
      1,
    );
    const raceBoundary = await deliveryKernel.markDispatchBoundary(
      owned(raceClaim),
    );
    await expectReject(
      matrix,
      'stale_worker_revision_rejected',
      () =>
        deliveryKernel.finalizeDelivered({
          ...owned(raceClaim),
          outcomeCode: 'stale_worker_should_fail',
        }),
      'STALE_RECIPIENT_REVISION',
    );
    await deliveryKernel.finalizeDelivered({
      ...owned(raceClaim, raceBoundary.recipient.revision),
      outcomeCode: 'proof_delivered',
      providerReference: opaque('provider_reference'),
    });
    matrix.two_workers_one_recipient = true;

    stage('deterministic_reject');
    const rejectCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('deterministic_reject'),
      now,
    });
    const rejectClaim = await claimRequired(
      deliveryKernel,
      tenantA,
      rejectCampaign.id,
      'worker.reject',
    );
    const rejectAdapter = new ScriptedCommunicationTestAdapter(
      'communication.test.reconcilable',
      [
        {
          kind: 'REJECTED',
          outcomeCode: 'provider_rejected',
          errorCode: 'synthetic_invalid_destination',
        },
      ],
    );
    const rejected = await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: rejectClaim,
      outcome: rejectAdapter.nextDispatch(),
    });
    assert.equal(rejected.deliveryState, CommunicationDeliveryState.FAILED);
    assert(rejected.terminalAt);
    assert.equal(
      (
        await deliveryKernel.audit({
          tenantId: tenantA,
          campaignId: rejectCampaign.id,
        })
      ).aggregateState,
      CommunicationCampaignState.FAILED,
    );
    matrix.deterministic_reject_terminal = true;

    stage('retryable_pre_dispatch_failure');
    const retryCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('safe_retry'),
      now,
    });
    const retryAdapter = new ScriptedCommunicationTestAdapter(
      'communication.test.reconcilable',
      [
        {
          kind: 'PRE_DISPATCH_FAILURE',
          outcomeCode: 'transport_not_started',
          errorCode: 'synthetic_pre_dispatch',
        },
        {
          kind: 'DELIVERED',
          outcomeCode: 'provider_delivered_after_retry',
          providerReference: opaque('provider_reference_retry'),
        },
      ],
    );
    const retryClaimOne = await claimRequired(
      deliveryKernel,
      tenantA,
      retryCampaign.id,
      'worker.retry.one',
    );
    const retryReady = await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: retryClaimOne,
      outcome: retryAdapter.nextDispatch(),
    });
    assert.equal(retryReady.deliveryState, CommunicationDeliveryState.NOT_SENT);
    const retryClaimTwo = await claimRequired(
      deliveryKernel,
      tenantA,
      retryCampaign.id,
      'worker.retry.two',
    );
    assert.equal(retryClaimTwo.attempt.attemptNumber, 2);
    await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: retryClaimTwo,
      outcome: retryAdapter.nextDispatch(),
    });
    matrix.retryable_pre_dispatch_failure_is_deterministic = true;

    stage('crash_before_dispatch');
    const crashBeforeCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('crash_before'),
      now,
    });
    await claimRequired(
      deliveryKernel,
      tenantA,
      crashBeforeCampaign.id,
      'worker.crash.before',
    );
    now = new Date(now.getTime() + LEASE_MS + 1);
    const crashBeforeRecipient = first(
      crashBeforeCampaign.recipients,
      'crash-before recipient',
    );
    const recoveredBefore = await deliveryKernel.recoverExpiredClaim({
      tenantId: tenantA,
      campaignId: crashBeforeCampaign.id,
      recipientId: crashBeforeRecipient.id,
      asOf: now,
    });
    assert.equal(
      recoveredBefore.deliveryState,
      CommunicationDeliveryState.NOT_SENT,
    );
    assert.equal(
      recoveredBefore.externalDispatchState,
      ExternalDispatchState.NOT_CROSSED,
    );
    matrix.expired_lease_before_dispatch_safe_to_reclaim = true;
    matrix.crash_before_dispatch_recoverable = true;

    stage('crash_after_dispatch');
    const crashAfterCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('crash_after'),
      now,
    });
    const crashAfterClaim = await claimRequired(
      deliveryKernel,
      tenantA,
      crashAfterCampaign.id,
      'worker.crash.after',
    );
    await deliveryKernel.markDispatchBoundary(owned(crashAfterClaim));
    now = new Date(now.getTime() + LEASE_MS + 1);
    const crashAfterRecipient = first(
      crashAfterCampaign.recipients,
      'crash-after recipient',
    );
    const recoveredAfter = await deliveryKernel.recoverExpiredClaim({
      tenantId: tenantA,
      campaignId: crashAfterCampaign.id,
      recipientId: crashAfterRecipient.id,
      asOf: now,
    });
    assert.equal(
      recoveredAfter.deliveryState,
      CommunicationDeliveryState.UNKNOWN,
    );
    assert.equal(
      recoveredAfter.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    assert.equal(
      await deliveryKernel.claimNext({
        tenantId: tenantA,
        campaignId: crashAfterCampaign.id,
        workerId: 'worker.blind.retry',
      }),
      null,
    );
    matrix.crash_after_dispatch_becomes_unknown = true;
    matrix.unknown_cannot_blind_retry = true;

    stage('reconciliation_delivered');
    const reconciledDelivered = await applyReconciliation({
      kernel: deliveryKernel,
      tenantId: tenantA,
      campaignId: crashAfterCampaign.id,
      recipientId: recoveredAfter.id,
      workerId: 'reconciler.delivered',
      result: {
        outcome: 'PROVEN_DELIVERED',
        outcomeCode: 'provider_confirmed_delivery',
        providerReference: opaque('reconciled_provider_reference'),
      },
    });
    assert.equal(
      reconciledDelivered.deliveryState,
      CommunicationDeliveryState.DELIVERED,
    );
    matrix.reconciliation_proves_delivered = true;

    stage('reconciliation_not_sent');
    const notSentUnknown = await makeUnknown({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('proven_not_sent'),
      now,
    });
    const provenNotSent = await applyReconciliation({
      kernel: deliveryKernel,
      tenantId: tenantA,
      campaignId: notSentUnknown.campaign.id,
      recipientId: notSentUnknown.recipient.id,
      workerId: 'reconciler.not-sent',
      result: {
        outcome: 'PROVEN_NOT_SENT',
        outcomeCode: 'provider_proved_not_sent',
      },
    });
    assert.equal(
      provenNotSent.deliveryState,
      CommunicationDeliveryState.NOT_SENT,
    );
    assert.equal(
      provenNotSent.externalDispatchState,
      ExternalDispatchState.NOT_CROSSED,
    );
    matrix.reconciliation_proves_not_sent_before_retry = true;

    stage('reconciliation_failed');
    const failedUnknown = await makeUnknown({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('proven_failed'),
      now,
    });
    const provenFailed = await applyReconciliation({
      kernel: deliveryKernel,
      tenantId: tenantA,
      campaignId: failedUnknown.campaign.id,
      recipientId: failedUnknown.recipient.id,
      workerId: 'reconciler.failed',
      result: {
        outcome: 'PROVEN_FAILED',
        outcomeCode: 'provider_confirmed_failure',
      },
    });
    assert.equal(provenFailed.deliveryState, CommunicationDeliveryState.FAILED);
    assert(provenFailed.terminalAt);
    matrix.reconciliation_proves_failed = true;

    stage('reconciliation_accepted');
    const acceptedUnknown = await makeUnknown({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('proven_accepted'),
      now,
    });
    const provenAccepted = await applyReconciliation({
      kernel: deliveryKernel,
      tenantId: tenantA,
      campaignId: acceptedUnknown.campaign.id,
      recipientId: acceptedUnknown.recipient.id,
      workerId: 'reconciler.accepted',
      result: {
        outcome: 'PROVEN_ACCEPTED',
        outcomeCode: 'provider_confirmed_accepted',
        providerReference: opaque('provider_reference_accepted'),
      },
    });
    assert.equal(
      provenAccepted.deliveryState,
      CommunicationDeliveryState.ACCEPTED,
    );
    assert.equal(provenAccepted.terminalAt, null);
    assert.equal(
      provenAccepted.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    matrix.reconciliation_proves_accepted_without_false_terminal = true;

    stage('reconciliation_still_unknown');
    const stillUnknownCampaign = await makeUnknown({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('still_unknown'),
      now,
    });
    const stillUnknownAdapter = new ScriptedCommunicationTestAdapter(
      'communication.test.reconcilable',
      [],
      [
        { outcome: 'STILL_UNKNOWN', outcomeCode: 'provider_inconclusive_one' },
        { outcome: 'STILL_UNKNOWN', outcomeCode: 'provider_inconclusive_two' },
      ],
    );
    const firstInconclusive = await applyReconciliation({
      kernel: deliveryKernel,
      tenantId: tenantA,
      campaignId: stillUnknownCampaign.campaign.id,
      recipientId: stillUnknownCampaign.recipient.id,
      workerId: 'reconciler.inconclusive.one',
      result: stillUnknownAdapter.nextReconciliation(),
    });
    assert.equal(
      firstInconclusive.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    const secondInconclusive = await applyReconciliation({
      kernel: deliveryKernel,
      tenantId: tenantA,
      campaignId: stillUnknownCampaign.campaign.id,
      recipientId: stillUnknownCampaign.recipient.id,
      workerId: 'reconciler.inconclusive.two',
      result: stillUnknownAdapter.nextReconciliation(),
    });
    assert.equal(
      secondInconclusive.reconciliationState,
      ActionReconciliationState.MANUAL_REQUIRED,
    );
    assert.equal(
      secondInconclusive.deliveryState,
      CommunicationDeliveryState.UNKNOWN,
    );
    matrix.still_unknown_remains_unresolved = true;

    stage('stuck_reconciliation_recovery');
    const stuckCampaign = await makeUnknown({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('stuck_reconciliation'),
      now,
    });
    await deliveryKernel.claimReconciliation({
      tenantId: tenantA,
      campaignId: stuckCampaign.campaign.id,
      recipientId: stuckCampaign.recipient.id,
      workerId: 'reconciler.crashed',
    });
    now = new Date(now.getTime() + LEASE_MS + 1);
    const recoveredReconciliation = await deliveryKernel.recoverExpiredClaim({
      tenantId: tenantA,
      campaignId: stuckCampaign.campaign.id,
      recipientId: stuckCampaign.recipient.id,
      asOf: now,
    });
    assert.equal(
      recoveredReconciliation.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    assert.equal(recoveredReconciliation.leaseOwner, null);
    matrix.stuck_sending_and_reconciliation_recoverable = true;

    stage('unresolved_blocks_false_completion');
    const unresolvedAudit = await deliveryKernel.audit({
      tenantId: tenantA,
      campaignId: stillUnknownCampaign.campaign.id,
    });
    assert.equal(
      unresolvedAudit.aggregateState,
      CommunicationCampaignState.UNRESOLVED,
    );
    assert.equal(unresolvedAudit.completedAt, null);
    matrix.unresolved_blocks_false_completion = true;

    stage('partial_campaign');
    const bulkScope = opaque('partial_bulk');
    const partialCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: bulkScope,
      now,
      kind: 'BULK',
      recipients: [
        recipient(`${bulkScope}_one`),
        recipient(`${bulkScope}_two`),
      ],
    });
    const bulkDeliveredClaim = await claimRequired(
      deliveryKernel,
      tenantA,
      partialCampaign.id,
      'worker.bulk.delivered',
    );
    await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: bulkDeliveredClaim,
      outcome: {
        kind: 'DELIVERED',
        outcomeCode: 'bulk_delivered',
        providerReference: opaque('bulk_provider_reference'),
      },
    });
    const bulkFailedClaim = await claimRequired(
      deliveryKernel,
      tenantA,
      partialCampaign.id,
      'worker.bulk.failed',
    );
    await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: bulkFailedClaim,
      outcome: {
        kind: 'REJECTED',
        outcomeCode: 'bulk_rejected',
        errorCode: 'synthetic_bulk_reject',
      },
    });
    const partialAudit = await deliveryKernel.audit({
      tenantId: tenantA,
      campaignId: partialCampaign.id,
    });
    assert.equal(
      partialAudit.aggregateState,
      CommunicationCampaignState.PARTIAL,
    );
    assert(partialAudit.completedAt);
    matrix.partial_campaign_aggregate_is_deterministic = true;

    stage('accepted_terminal_capability');
    const acceptedTerminalCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('accepted_terminal'),
      now,
      capabilityKey: 'communication.test.accepted-terminal',
    });
    const acceptedTerminalClaim = await claimRequired(
      deliveryKernel,
      tenantA,
      acceptedTerminalCampaign.id,
      'worker.accepted-terminal',
    );
    const acceptedTerminal = await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: acceptedTerminalClaim,
      outcome: {
        kind: 'ACCEPTED',
        outcomeCode: 'accepted_is_terminal',
        providerReference: opaque('accepted_terminal_reference'),
      },
    });
    assert(acceptedTerminal.terminalAt);
    assert.equal(
      (
        await deliveryKernel.audit({
          tenantId: tenantA,
          campaignId: acceptedTerminalCampaign.id,
        })
      ).aggregateState,
      CommunicationCampaignState.COMPLETED,
    );
    matrix.terminal_recipients_close_campaign = true;

    stage('expiry');
    const expiringCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('expiry'),
      now,
      expiryMs: 100,
    });
    now = new Date(now.getTime() + 101);
    const expired = await deliveryKernel.expireCampaign({
      tenantId: tenantA,
      campaignId: expiringCampaign.id,
      asOf: now,
    });
    assert.equal(expired.aggregateState, CommunicationCampaignState.EXPIRED);
    assert.equal(
      await deliveryKernel.claimNext({
        tenantId: tenantA,
        campaignId: expiringCampaign.id,
        workerId: 'worker.expired',
      }),
      null,
    );
    matrix.expired_campaign_cannot_dispatch = true;

    stage('action_execution_linkage');
    const linkageCampaign = await createEnvelope({
      prisma,
      actionKernel,
      deliveryKernel,
      tenantId: tenantA,
      scope: opaque('action_linkage'),
      now,
    });
    const linkageActionExecutionId = linkageCampaign.actionExecutionId;
    assert(linkageActionExecutionId);
    const linkageActionClaim = await actionKernel.claimExecution({
      tenantId: tenantA,
      executionId: linkageActionExecutionId,
      workerId: 'worker.action-linkage.execution',
    });
    await actionKernel.finalizeSuccess({
      tenantId: tenantA,
      executionId: linkageActionClaim.execution.id,
      attemptId: linkageActionClaim.attempt.id,
      leaseToken: linkageActionClaim.leaseToken,
      outcomeCode: 'communication_execution_succeeded',
    });
    const linkageClaim = await claimRequired(
      deliveryKernel,
      tenantA,
      linkageCampaign.id,
      'worker.action-linkage',
    );
    await applyDispatchOutcome({
      kernel: deliveryKernel,
      claim: linkageClaim,
      outcome: {
        kind: 'UNKNOWN',
        outcomeCode: 'action_succeeded_delivery_unknown',
        errorCode: 'synthetic_timeout_after_dispatch',
      },
    });
    const linkageAudit = await deliveryKernel.audit({
      tenantId: tenantA,
      campaignId: linkageCampaign.id,
    });
    assert.equal(
      linkageAudit.actionExecution?.state,
      ActionExecutionState.SUCCEEDED,
    );
    assert.equal(
      linkageAudit.aggregateState,
      CommunicationCampaignState.UNRESOLVED,
    );
    matrix.action_execution_success_does_not_imply_delivery = true;

    stage('single_bulk_shared_primitive');
    const singleAttempt =
      await prisma.marketingDeliveryAttempt.findFirstOrThrow({
        where: { tenantId: tenantA, campaignId: raceCampaign.id },
      });
    const bulkRecipient = first(partialAudit.recipients, 'bulk recipient');
    const bulkAttempt = first(
      bulkRecipient.deliveryAttempts,
      'bulk delivery attempt',
    );
    assert.equal(singleAttempt.lifecycleVersion, bulkAttempt.lifecycleVersion);
    assert.equal(singleAttempt.kind, bulkAttempt.kind);
    assert.equal(
      typeof singleAttempt.providerRequestIdentityHash,
      typeof bulkAttempt.providerRequestIdentityHash,
    );
    matrix.single_and_bulk_share_recipient_delivery_primitive = true;

    stage('privacy');
    const privacyRawRecipient = 'raw-proof-recipient';
    const privacyProviderReference = 'provider_reference';
    const serializedAudit = JSON.stringify(
      await deliveryKernel.audit({
        tenantId: tenantA,
        campaignId: raceCampaign.id,
      }),
    );
    assert.equal(serializedAudit.includes(privacyRawRecipient), false);
    assert.equal(serializedAudit.includes(privacyProviderReference), false);
    assert.equal(raceCampaign.message, '');
    matrix.raw_recipient_and_provider_payload_not_persisted = true;

    stage('legacy_rows_excluded');
    const legacyCampaign = await prisma.marketingCampaign.create({
      data: {
        tenantId: tenantA,
        channel: 'legacy-proof',
        status: 'unknown_legacy_status',
        message: 'legacy row remains uninterpreted',
        recipientUserIdsJson: [],
        recipientCount: 0,
        expiresAt: new Date(now.getTime() + 60_000),
        lifecycleVersion: 0,
      },
    });
    assert.equal(
      await deliveryKernel.claimNext({
        tenantId: tenantA,
        campaignId: legacyCampaign.id,
        workerId: 'worker.legacy',
      }),
      null,
    );
    const legacyRow = await prisma.marketingCampaign.findUniqueOrThrow({
      where: { id: legacyCampaign.id },
    });
    assert.equal(legacyRow.aggregateState, null);
    matrix.legacy_truth_not_reinterpreted = true;

    stage('architecture_barrier');
    const sourceDirectory = 'src/communication-delivery';
    const source = readdirSync(sourceDirectory)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(join(sourceDirectory, file), 'utf8'))
      .join('\n');
    const forbidden = [
      'fetch(',
      'axios',
      'node:http',
      'node:https',
      'yclients',
      'telegram',
      'twilio',
      'sendgrid',
      '/billing/',
      '/crm/',
      'CampaignExecutor',
      'MessageExecutor',
    ];
    for (const token of forbidden) {
      assert.equal(
        source.toLowerCase().includes(token.toLowerCase()),
        false,
        token,
      );
    }
    assert.equal(
      existsSync(
        'src/communication-delivery/communication-delivery.test-adapter.ts',
      ),
      true,
    );
    matrix.no_side_effect_owner_or_production_provider_imported = true;

    stage('metrics');
    const metrics = await deliveryKernel.metrics(tenantA);
    assert.equal(metrics.externalMessagesSent, 0);
    assert.equal(rejectAdapter.externalMessagesSent, 0);
    assert.equal(retryAdapter.externalMessagesSent, 0);
    assert.equal(stillUnknownAdapter.externalMessagesSent, 0);
    const groupedCampaigns = await prisma.marketingCampaign.groupBy({
      by: ['aggregateState'],
      where: { tenantId: tenantA, lifecycleVersion: 1 },
      _count: true,
    });
    const report: ProofReport = {
      database,
      matrix: Object.fromEntries(
        Object.entries(matrix).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      metrics,
      campaignStates: Object.fromEntries(
        groupedCampaigns.map((row) => [
          row.aggregateState ?? 'NULL',
          row._count,
        ]),
      ),
      externalMessagesSent: 0,
      productionProvidersImported: false,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (cleanupTenantIds.length > 0) {
      await prisma.tenant.deleteMany({
        where: { id: { in: cleanupTenantIds } },
      });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `Communication delivery proof failed at ${proofStage}: ${message}\n`,
  );
  process.exitCode = 1;
});
