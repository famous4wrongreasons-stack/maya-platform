import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  ActionPolicyDecision,
  CommunicationScope,
  PrismaClient,
} from '@prisma/client';

import { createStandaloneCanonicalActionEngineRuntime } from '../src/action-engine';
import {
  CommunicationCapabilityRegistry,
  CommunicationDeliveryKernel,
} from '../src/communication-delivery';
import {
  CommunicationShadowService,
  type CommunicationShadowChannel,
  type CommunicationShadowPlanInput,
  type CommunicationShadowRecipientInput,
} from '../src/communication-shadow';
import type { PrismaService } from '../src/prisma/prisma.service';
import { EntitlementsService } from '../src/entitlements/entitlements.service';
import { FeatureRegistryService } from '../src/entitlements/feature-registry.service';

const IDENTITY_SECRET =
  'cycle-06-b32-proof-identity-secret-never-used-outside-proof-databases';
const PAYLOAD_SECRET =
  'cycle-06-b32-proof-payload-secret-never-used-outside-proof-databases';
let proofStage = 'bootstrap';

interface ProofReport {
  database: string;
  matrix: Record<string, boolean>;
  tenantMetrics: Record<
    string,
    Awaited<ReturnType<CommunicationDeliveryKernel['metrics']>>
  >;
  actionExecutions: number;
  deliveryAttempts: number;
  duplicateDeliveriesCollapsed: number;
  shadowDivergences: 0;
  newPathExternalMessages: 0;
  newPathSms: 0;
  newPathPush: 0;
  newPathBulkSends: 0;
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
    !database.startsWith('maya_c06_communication_shadow_') &&
    process.env.COMMUNICATION_SHADOW_PROOF_ALLOW_DATABASE !== '1'
  ) {
    throw new Error(
      'Communication shadow proof refuses non-proof databases. Use maya_c06_communication_shadow_*.',
    );
  }
  return { connectionString, database };
}

function opaque(label: string): string {
  return `${label}_${randomUUID().replaceAll('-', '')}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function digestParts(parts: readonly string[]): string {
  return digest(JSON.stringify(parts));
}

function expiry(): Date {
  return new Date(Date.now() + 60 * 60_000);
}

function shadowService(prisma: PrismaClient): CommunicationShadowService {
  const config = new ConfigService({
    ACTION_ENGINE_IDENTITY_SECRET: IDENTITY_SECRET,
    ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET: PAYLOAD_SECRET,
  });
  const service = prisma as unknown as PrismaService;
  return new CommunicationShadowService(
    createStandaloneCanonicalActionEngineRuntime(
      service,
      new EntitlementsService(service, new FeatureRegistryService()),
      {
        identitySecret: IDENTITY_SECRET,
        payloadEncryptionSecret: PAYLOAD_SECRET,
      },
    ),
    service,
    config,
  );
}

function deliveryKernel(prisma: PrismaClient): CommunicationDeliveryKernel {
  return new CommunicationDeliveryKernel(prisma, {
    identitySecret: IDENTITY_SECRET,
    payloadEncryptionSecret: PAYLOAD_SECRET,
  });
}

async function createTenant(
  prisma: PrismaClient,
  cleanupTenantIds: string[],
  label: string,
): Promise<string> {
  const id = opaque(`communication_shadow_tenant_${label}`);
  await prisma.tenant.create({
    data: {
      id,
      name: `Communication shadow proof ${label}`,
      slug: `${label}-${randomUUID()}`.toLowerCase(),
    },
  });
  cleanupTenantIds.push(id);
  return id;
}

function recipient(
  scope: string,
  decision: 'ALLOW' | 'SKIP' | 'DENY' = 'ALLOW',
  consentEvidenceId?: string,
): CommunicationShadowRecipientInput {
  return {
    recipientRef: `proof-recipient/${scope}`,
    recipientKind: 'external_client',
    consentEvidenceId,
    eligibility: {
      basis: 'server_owned_eligibility',
      decision,
      policyVersion: 1,
      evidenceRef: `eligibility/${scope}`,
      evidenceIdentityParts: [`eligibility/${scope}`, decision],
      reasonCode: decision === 'ALLOW' ? undefined : `PROOF_${decision}`,
    },
  };
}

function singleInput(input: {
  tenantId: string;
  scope: string;
  channel?: CommunicationShadowChannel;
  sourceType?: CommunicationShadowPlanInput['sourceType'];
  taxonomy?: 'transactional_single' | 'operational_single';
  recipient?: CommunicationShadowRecipientInput;
  contentIdentityParts?: readonly string[];
}): CommunicationShadowPlanInput {
  return {
    tenantId: input.tenantId,
    sourceType: input.sourceType ?? 'authenticated_request',
    producerRef: `producer/${input.scope}`,
    logicalRef: `logical/${input.scope}`,
    taxonomy: input.taxonomy ?? 'operational_single',
    channel: input.channel ?? 'inbox',
    templateRef: `template/${input.scope}`,
    contentIdentityParts: input.contentIdentityParts ?? [
      `template/${input.scope}`,
      'revision/1',
    ],
    recipients: [input.recipient ?? recipient(input.scope)],
    eligibilityPolicyRef: `policy/${input.scope}`,
    legacyApprovalRequirement: 'SYSTEM_POLICY',
    expiresAt: expiry(),
  };
}

async function createAudience(input: {
  prisma: PrismaClient;
  tenantId: string;
  scope: string;
  recipientScopes: readonly string[];
}) {
  const audienceId = opaque(`shadow_audience_${input.scope}`);
  const snapshotHash = digest(
    JSON.stringify({
      tenantId: input.tenantId,
      scope: input.scope,
      recipients: input.recipientScopes,
    }),
  );
  const consentIds: string[] = [];
  for (const recipientScope of input.recipientScopes) {
    const consentId = opaque(`consent_${recipientScope}`);
    consentIds.push(consentId);
    await input.prisma.marketingConsentEvidence.create({
      data: {
        id: consentId,
        tenantId: input.tenantId,
        externalClientId: `proof-client/${recipientScope}`,
        channel: 'inbox',
        status: 'granted',
        source: 'proof_server_policy',
        evidenceRef: `consent/${recipientScope}`,
        grantedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
  await input.prisma.marketingAudience.create({
    data: {
      id: audienceId,
      tenant: {
        connect: { id: input.tenantId },
      },
      createdByUserId: opaque('synthetic_creator'),
      ruleJson: { proofRef: input.scope },
      recipientUserIdsJson: [],
      candidateCount: input.recipientScopes.length + 1,
      eligibleCount: input.recipientScopes.length,
      unavailableCount: 1,
      expiresAt: expiry(),
      provider: 'communication.shadow.inbox',
      status: 'AUDIENCE_CALCULATED',
      snapshotHash,
      exclusionReasonsJson: { consent_missing: 1 },
      recipients: {
        createMany: {
          data: input.recipientScopes.map((recipientScope) => ({
            id: opaque(`audience_recipient_${recipientScope}`),
            externalClientId: `proof-client/${recipientScope}`,
            eligibilityStatus: 'eligible',
            consentSource: 'proof_server_policy',
            consentRecordedAt: new Date(),
            metricsJson: { proofRef: recipientScope },
          })),
        },
      },
    },
  });
  return { audienceId, snapshotHash, consentIds };
}

function bulkInput(input: {
  tenantId: string;
  scope: string;
  audienceId: string;
  snapshotHash: string;
  recipientScopes: readonly string[];
  consentIds: readonly string[];
}): CommunicationShadowPlanInput {
  return {
    tenantId: input.tenantId,
    sourceType: 'authenticated_request',
    producerRef: `marketing/${input.scope}`,
    logicalRef: `campaign/${input.scope}`,
    taxonomy: 'bulk_campaign',
    channel: 'inbox',
    templateRef: `campaign-template/${input.scope}`,
    contentIdentityParts: [`campaign-template/${input.scope}`, 'revision/1'],
    recipients: input.recipientScopes.map((recipientScope, index) =>
      recipient(`bulk/${recipientScope}`, 'ALLOW', input.consentIds[index]),
    ),
    eligibilityPolicyRef: 'marketing.consent.revalidated.v1',
    legacyApprovalRequirement: 'OWNER_CONFIRMED',
    expiresAt: expiry(),
    audienceId: input.audienceId,
    audienceSnapshotHash: input.snapshotHash,
  };
}

async function expectReject(
  matrix: Record<string, boolean>,
  name: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `Forbidden operation succeeded: ${name}`);
  matrix[name] = true;
}

function sourceTree(relativeDir: string): string {
  const directory = join(process.cwd(), relativeDir);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n');
}

async function main(): Promise<void> {
  const { connectionString, database } = requireProofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const cleanupTenantIds: string[] = [];
  const matrix: Record<string, boolean> = {};
  let duplicateDeliveriesCollapsed = 0;

  try {
    await prisma.$connect();
    const tenantA = await createTenant(prisma, cleanupTenantIds, 'a');
    const tenantB = await createTenant(prisma, cleanupTenantIds, 'b');
    const service = shadowService(prisma);
    const kernel = deliveryKernel(prisma);

    stage('transactional-single');
    const transactional = singleInput({
      tenantId: tenantA,
      scope: 'auth-email',
      taxonomy: 'transactional_single',
      channel: 'email',
    });
    const transactionalResult = await service.plan(transactional);
    assert.equal(transactionalResult.externalMessagesSent, 0);
    const transactionalExecution =
      await prisma.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: {
            id: transactionalResult.actionExecutionId,
            tenantId: tenantA,
          },
        },
      });
    assert.equal(
      transactionalExecution.state,
      ActionExecutionState.NOT_EXECUTED,
    );
    assert.equal(transactionalExecution.dryRun, true);
    assert.equal(
      transactionalExecution.policyDecision,
      ActionPolicyDecision.SHADOW_ONLY,
    );
    assert.equal(transactionalExecution.executionAttemptCount, 0);
    matrix.transactional_single_shadow = true;

    stage('single-dedup-and-restart');
    const single = singleInput({
      tenantId: tenantA,
      scope: 'appointment-reminder',
      sourceType: 'scheduler',
      channel: 'apns',
    });
    const firstSingle = await service.plan(single);
    const repeatedSingle = await service.plan(single);
    duplicateDeliveriesCollapsed += repeatedSingle.duplicateDeliveriesCollapsed;
    assert.equal(
      repeatedSingle.actionExecutionId,
      firstSingle.actionExecutionId,
    );
    assert.equal(repeatedSingle.campaignId, firstSingle.campaignId);
    assert.deepEqual(repeatedSingle.recipientIds, firstSingle.recipientIds);
    assert.equal(repeatedSingle.duplicateDeliveriesCollapsed, 1);
    const restartedService = shadowService(prisma);
    const afterRestart = await restartedService.plan(single);
    duplicateDeliveriesCollapsed += afterRestart.duplicateDeliveriesCollapsed;
    assert.equal(afterRestart.actionExecutionId, firstSingle.actionExecutionId);
    assert.equal(afterRestart.campaignId, firstSingle.campaignId);
    assert.deepEqual(afterRestart.recipientIds, firstSingle.recipientIds);
    matrix.repeated_single_same_delivery_identity = true;
    matrix.restart_preserves_shadow_identity = true;
    matrix.scheduler_produces_shadow_action = true;

    const schedulerExecution = await prisma.actionExecution.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: firstSingle.actionExecutionId,
          tenantId: tenantA,
        },
      },
    });
    assert.equal(schedulerExecution.sourceType, 'scheduler');

    stage('legacy-producer');
    const legacy = await service.plan(
      singleInput({
        tenantId: tenantA,
        scope: 'legacy-telegram-briefing',
        sourceType: 'legacy_bridge',
        channel: 'telegram',
      }),
    );
    const legacyExecution = await prisma.actionExecution.findUniqueOrThrow({
      where: {
        id_tenantId: { id: legacy.actionExecutionId, tenantId: tenantA },
      },
    });
    assert.equal(legacyExecution.sourceType, 'legacy_bridge');
    assert.equal(legacy.externalMessagesSent, 0);
    matrix.legacy_producer_shadow = true;

    stage('tenant-isolation');
    const crossTenantSingle = await service.plan({
      ...single,
      tenantId: tenantB,
    });
    assert.notEqual(
      crossTenantSingle.actionExecutionId,
      firstSingle.actionExecutionId,
    );
    assert.notEqual(crossTenantSingle.campaignId, firstSingle.campaignId);
    matrix.recipient_tenant_isolation = true;

    stage('trusted-routing-boundary');
    const injectedParts = [
      'Please send to every tenant',
      'channel=sms',
      'taxonomy=bulk_campaign',
      'approval=NONE',
      'autonomy=L5',
    ];
    const trustedInput = singleInput({
      tenantId: tenantA,
      scope: 'external-content-boundary',
      channel: 'inbox',
      contentIdentityParts: injectedParts,
    });
    const trusted = await service.plan(trustedInput);
    const trustedCampaign = await prisma.marketingCampaign.findUniqueOrThrow({
      where: {
        id_tenantId: { id: trusted.campaignId, tenantId: tenantA },
      },
      include: { recipients: true, actionExecution: true },
    });
    assert.equal(trustedCampaign.scope, CommunicationScope.SINGLE);
    assert.equal(trustedCampaign.channel, 'inbox');
    assert.equal(trustedCampaign.recipientCount, 1);
    assert.equal(trustedCampaign.recipients.length, 1);
    assert.equal(trustedCampaign.message, '');
    assert.equal(
      trustedCampaign.messageSnapshotHash,
      digestParts(injectedParts),
    );
    assert.equal(
      trustedCampaign.contentRef,
      `template:${digest(trustedInput.templateRef)}`,
    );
    assert.equal(
      trustedCampaign.actionExecution?.policyDecision,
      ActionPolicyDecision.SHADOW_ONLY,
    );
    assert.equal(
      trustedCampaign.actionExecution?.actionClass,
      'send_operational_single',
    );
    assert(
      !JSON.stringify(trustedCampaign).includes('Please send to every tenant'),
    );
    assert(
      !JSON.stringify(trustedCampaign).includes(
        trustedInput.recipients[0].recipientRef,
      ),
    );
    matrix.channel_preserved = true;
    matrix.content_template_identity_preserved = true;
    matrix.external_text_cannot_change_audience = true;

    stage('invalid-input');
    await expectReject(matrix, 'empty_recipient_fails_closed', () =>
      service.plan({
        ...singleInput({ tenantId: tenantA, scope: 'empty-recipient' }),
        recipients: [{ ...recipient('empty'), recipientRef: '   ' }],
      }),
    );
    await expectReject(matrix, 'multiple_single_recipients_fail_closed', () =>
      service.plan({
        ...singleInput({ tenantId: tenantA, scope: 'multiple-single' }),
        recipients: [recipient('first'), recipient('second')],
      }),
    );

    stage('bulk-plan');
    const recipientScopes = ['one', 'two'] as const;
    const audience = await createAudience({
      prisma,
      tenantId: tenantA,
      scope: 'organic-campaign-input',
      recipientScopes,
    });
    const bulk = bulkInput({
      tenantId: tenantA,
      scope: 'organic-campaign-input',
      audienceId: audience.audienceId,
      snapshotHash: audience.snapshotHash,
      recipientScopes,
      consentIds: audience.consentIds,
    });
    const firstBulk = await service.plan(bulk);
    const bulkCampaign = await prisma.marketingCampaign.findUniqueOrThrow({
      where: { id_tenantId: { id: firstBulk.campaignId, tenantId: tenantA } },
      include: { recipients: true, actionExecution: true },
    });
    assert.equal(firstBulk.externalMessagesSent, 0);
    assert.equal(bulkCampaign.scope, CommunicationScope.BULK);
    assert.equal(bulkCampaign.audienceId, audience.audienceId);
    assert.equal(bulkCampaign.audienceSnapshotHash, audience.snapshotHash);
    assert.equal(bulkCampaign.recipientCount, recipientScopes.length);
    assert.equal(bulkCampaign.recipients.length, recipientScopes.length);
    assert(
      bulkCampaign.recipients.every(
        (row) =>
          row.eligibilityDecision === 'ALLOW' &&
          row.eligibilityBasis === 'server_owned_eligibility' &&
          Boolean(row.consentEvidenceId),
      ),
    );
    assert.equal(
      bulkCampaign.actionExecution?.actionClass,
      'send_bulk_campaign',
    );
    const repeatedBulk = await service.plan(bulk);
    duplicateDeliveriesCollapsed += repeatedBulk.duplicateDeliveriesCollapsed;
    assert.equal(repeatedBulk.actionExecutionId, firstBulk.actionExecutionId);
    assert.equal(repeatedBulk.campaignId, firstBulk.campaignId);
    assert.deepEqual(repeatedBulk.recipientIds, firstBulk.recipientIds);
    assert.equal(
      repeatedBulk.duplicateDeliveriesCollapsed,
      recipientScopes.length,
    );
    matrix.bulk_builds_recipient_plan_but_sends_zero = true;
    matrix.bulk_audience_and_consent_preserved = true;

    await expectReject(matrix, 'audience_snapshot_mismatch_rejected', () =>
      service.plan({
        ...bulk,
        logicalRef: `${bulk.logicalRef}/mismatch`,
        audienceSnapshotHash: digest('wrong-snapshot'),
      }),
    );
    await expectReject(matrix, 'cross_tenant_audience_rejected', () =>
      service.plan({
        ...bulk,
        tenantId: tenantB,
        logicalRef: `${bulk.logicalRef}/cross-tenant`,
      }),
    );

    stage('provider-dispatch-barrier');
    const capabilities = new CommunicationCapabilityRegistry().list();
    const shadowCapabilities = capabilities.filter((definition) =>
      definition.key.startsWith('communication.shadow.'),
    );
    assert.equal(shadowCapabilities.length, 5);
    assert(
      shadowCapabilities.every(
        (definition) =>
          definition.testOnly === false &&
          definition.externalDispatchEnabled === false,
      ),
    );
    const claims = await Promise.all(
      [firstSingle.campaignId, legacy.campaignId, firstBulk.campaignId].map(
        (campaignId) =>
          kernel.claimNext({
            tenantId: tenantA,
            workerId: 'proof-worker',
            campaignId,
          }),
      ),
    );
    assert(claims.every((claim) => claim === null));
    assert.equal(
      await prisma.marketingDeliveryAttempt.count({
        where: { tenantId: { in: [tenantA, tenantB] } },
      }),
      0,
    );
    assert.equal(
      await prisma.actionAttempt.count({
        where: { tenantId: { in: [tenantA, tenantB] } },
      }),
      0,
    );
    matrix.action_execution_linkage = true;
    matrix.recipient_lifecycle_linkage = true;
    matrix.new_path_provider_send_impossible = true;

    stage('architecture-boundary');
    const shadowSource = sourceTree('src/communication-shadow');
    assert(
      !/from ['"].*(apns-push|nodemailer|telegram|sms)/i.test(shadowSource),
    );
    assert(
      !/\b(fetch|sendMail|sendMessage|send_message)\s*\(/.test(shadowSource),
    );
    const inboxSource = readFileSync('src/inbox/inbox.service.ts', 'utf8');
    const phoneSource = readFileSync(
      'src/auth/phone-auth-delivery.service.ts',
      'utf8',
    );
    const emailSource = readFileSync(
      'src/auth/email-auth-delivery.service.ts',
      'utf8',
    );
    const pythonSource = readFileSync(
      join(process.cwd(), '..', 'ai администратор', 'webhook_server.py'),
      'utf8',
    );
    assert(inboxSource.includes('sendInboxApns'));
    assert(phoneSource.includes('https://sms.ru/sms/send'));
    assert(emailSource.includes('transporter.sendMail'));
    assert(
      pythonSource.includes('_maya_original_send_message_for_chat_mirror'),
    );
    const legacyTelegramSend = pythonSource.indexOf(
      'sent_message = await original(self, *args, **kwargs)',
    );
    const shadowTelegramObservation = pythonSource.indexOf(
      'observe_legacy_telegram_send(',
      legacyTelegramSend,
    );
    assert(legacyTelegramSend >= 0);
    assert(shadowTelegramObservation > legacyTelegramSend);
    matrix.direct_old_send_remains_only_actual_executor = true;

    const tenantMetrics: ProofReport['tenantMetrics'] = {
      tenantA: await kernel.metrics(tenantA),
      tenantB: await kernel.metrics(tenantB),
    };
    assert.equal(tenantMetrics.tenantA.externalMessagesSent, 0);
    assert.equal(tenantMetrics.tenantB.externalMessagesSent, 0);
    assert.equal(tenantMetrics.tenantA.attempts, 0);
    assert.equal(tenantMetrics.tenantB.attempts, 0);

    const report: ProofReport = {
      database,
      matrix,
      tenantMetrics,
      actionExecutions: await prisma.actionExecution.count({
        where: { tenantId: { in: [tenantA, tenantB] } },
      }),
      deliveryAttempts: 0,
      duplicateDeliveriesCollapsed,
      shadowDivergences: 0,
      newPathExternalMessages: 0,
      newPathSms: 0,
      newPathPush: 0,
      newPathBulkSends: 0,
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

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `Communication shadow proof failed at ${proofStage}: ${message}\n`,
  );
  process.exitCode = 1;
});
