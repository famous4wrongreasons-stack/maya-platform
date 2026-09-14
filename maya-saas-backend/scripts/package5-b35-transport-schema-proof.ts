/** Real PostgreSQL + existing kernels, synthetic transport; never calls a provider. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type ClientChannelLink,
  type MarketingCampaign,
  type MarketingCampaignRecipient,
} from '@prisma/client';
import { ActionEngineKernel } from '../src/action-engine/action-engine.kernel';
import { ActionCapabilityRegistry } from '../src/action-engine/action-engine.registry';
import { ACTION_EXECUTION_REQUEST_CONTRACT } from '../src/action-engine/action-engine.contract';
import { CommunicationDeliveryKernel } from '../src/communication-delivery/communication-delivery.kernel';
import { CommunicationCapabilityRegistry } from '../src/communication-delivery/communication-delivery.capabilities';
import type { CommunicationDeliveryClaimV1 } from '../src/communication-delivery/communication-delivery.contract';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55505');
assert(url.pathname.startsWith('/maya_b35_'));
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const h = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rootCap = 'communication.bulk-campaign.admit.v2';
const slotCap = 'communication.bulk-slot.admit.v2';
class FixtureRegistry extends ActionCapabilityRegistry {
  override get(key: string) {
    if (key !== rootCap && key !== slotCap) return super.get(key);
    return {
      ...super.get('kernel.test.approval'),
      capability: key,
      actionClass: 'deliver_bulk_campaign',
    };
  }
}
const opts = {
  identitySecret: 'b35-owned-schema-proof-identity-secret',
  payloadEncryptionSecret: 'b35-owned-schema-proof-payload-secret',
  controlledFixtureMode: true,
};
const engine = new ActionEngineKernel(db, opts, new FixtureRegistry());
const delivery = new CommunicationDeliveryKernel(db, {
  ...opts,
  executionLeaseMs: 10_000,
});
const capabilities = new CommunicationCapabilityRegistry();
const now = new Date();
const expiry = new Date(now.getTime() + 86_400_000);
const checks: string[] = [];
async function denied(name: string, fn: () => Promise<unknown>) {
  await assert.rejects(
    fn,
    /B35|IDEMPOTENCY_CONFLICT|constraint|RECIPIENT|claimed|Claim/,
  );
  checks.push(name);
}
async function admit(executionId: string, tenantId: string) {
  const claim = await engine.claimExecution({
    tenantId,
    executionId,
    workerId: 'b35.schema.admission',
  });
  await engine.finalizeSuccess({
    tenantId,
    executionId,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
    outcomeCode: 'envelope_admitted',
  });
}
function owned(
  claim: CommunicationDeliveryClaimV1,
  revision = claim.recipient.revision,
) {
  return {
    tenantId: claim.recipient.tenantId,
    campaignId: claim.campaign.id,
    recipientId: claim.recipient.id,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
    recipientRevision: revision,
  };
}
async function main() {
  if (process.argv[2] === '--after-restart') {
    const saved = JSON.parse(readFileSync(process.argv[3], 'utf8')) as {
      fixture: {
        tenantId: string;
        rootId: string;
        slotIds: string[];
        recipientIds: string[];
      };
    };
    const { tenantId, rootId, slotIds, recipientIds } = saved.fixture;
    const rows = await db.marketingCampaignRecipient.findMany({
      where: { id: { in: recipientIds } },
      orderBy: { id: 'asc' },
    });
    for (let i = 0; i < 3; i++)
      assert.equal(
        rows.find((r) => r.id === recipientIds[i])?.deliveryState,
        ['ACCEPTED', 'UNKNOWN', 'FAILED'][i],
      );
    const before = await db.marketingDeliveryAttempt.count({
      where: { tenantId },
    });
    for (let i = 0; i < 3; i++)
      assert.equal(
        await delivery.claimNext({
          tenantId,
          campaignId: slotIds[i],
          workerId: 'restart.skip',
        }),
        null,
      );
    assert.equal(
      await db.marketingDeliveryAttempt.count({ where: { tenantId } }),
      before,
    );
    const claim = (await delivery.claimNext({
      tenantId,
      campaignId: slotIds[3],
      workerId: 'restart.pending',
    }))!;
    assert(claim);
    const envelope = await db.marketingCampaign.findUniqueOrThrow({
      where: { id: slotIds[3] },
      include: { parentRecipient: true },
    });
    await db.marketingDeliveryAttempt.update({
      where: { id: claim.attempt.id },
      data: {
        dispatchEligibilityJson: {
          contract: 'maya.bulk-dispatch-eligibility/1',
          tenantId,
          clientId: envelope.parentRecipient!.clientId,
          decision: 'ALLOW',
          checkedAt: new Date().toISOString(),
        },
      },
    });
    const boundary = await delivery.markDispatchBoundary(owned(claim));
    await delivery.finalizeAccepted({
      ...owned(claim, boundary.recipient.revision),
      outcomeCode: 'SYNTHETIC_RESTART_ACCEPTED',
      providerReference: 'synthetic-restart-ref',
    });
    assert.equal(
      await delivery.claimNext({
        tenantId,
        campaignId: slotIds[3],
        workerId: 'restart.repeat',
      }),
      null,
    );
    assert.equal(
      await db.marketingCampaignRecipient.count({
        where: { tenantId, campaignId: rootId, lifecycleVersion: 2 },
      }),
      4,
    );
    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'PostgreSQL restart preserves accepted/UNKNOWN/failed outcomes',
            'no repeat attempt for accepted/UNKNOWN/failed',
            'original pending sibling continues after restart',
            'same root and four Client children; no duplicate outcome',
          ],
          productionMessages: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  const tenant = await db.tenant.create({
    data: { name: 'B35 synthetic delivery', slug: randomUUID() },
  });
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: 'synthetic',
      role: 'tenant_owner',
      tenantId: tenant.id,
    },
  });
  await db.membership.create({
    data: { tenantId: tenant.id, userId: user.id, role: 'tenant_owner' },
  });
  const clients = await Promise.all(
    [0, 1, 2, 3].map(() => db.client.create({ data: { tenantId: tenant.id } })),
  );
  const links: ClientChannelLink[] = [];
  for (const client of clients) {
    const identity = h([client.id, 'verification']);
    const subject = h([client.id, 'telegram']);
    const evidence = {
      contract: 'a18.client-channel-verification.v1',
      verifier: 'b35.schema.fixture',
      channelControlProofHash: h(['control', client.id]),
      clientAuthorityProofHash: h(['authority', client.id]),
      verificationIdentityHash: identity,
      tenantId: tenant.id,
      provider: 'telegram',
      providerSubjectHash: subject,
      clientId: client.id,
    };
    links.push(
      await db.clientChannelLink.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          provider: 'telegram',
          providerSubjectHash: subject,
          verificationMethod: 'explicit_verified_challenge',
          verificationIdentityHash: identity,
          verificationEvidenceJson: evidence,
          verificationEvidenceHash: h(evidence),
        },
      }),
    );
  }
  const audience = await db.$transaction(async (tx) => {
    const a = await tx.marketingAudience.create({
      data: {
        tenantId: tenant.id,
        createdByUserId: user.id,
        ruleJson: { source: 'synthetic' },
        recipientUserIdsJson: [],
        candidateCount: 4,
        eligibleCount: 4,
        expiresAt: expiry,
        status: 'ASSEMBLING',
        snapshotContract: 'maya.bulk-client-audience/1',
        snapshotHash: h(clients.map((c) => c.id).sort()),
      },
    });
    await tx.marketingAudienceRecipient.createMany({
      data: clients.map((c) => ({
        id: randomUUID(),
        tenantId: tenant.id,
        audienceId: a.id,
        clientId: c.id,
        externalClientId: h(c.id),
        eligibilityStatus: 'CANDIDATE',
      })),
    });
    return tx.marketingAudience.update({
      where: { id: a.id },
      data: { status: 'FROZEN' },
    });
  });
  const root = await db.marketingCampaign.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: user.id,
      audienceId: audience.id,
      channel: null,
      provider: null,
      message: 'Synthetic immutable content',
      recipientUserIdsJson: [],
      recipientCount: 4,
      idempotencyKey: randomUUID(),
      expiresAt: expiry,
      lifecycleVersion: 2,
      scope: 'BULK',
      aggregateState: 'DRAFT',
      bulkIntentContract: 'maya.marketing-bulk-intent/1',
      bulkIntentHash: h(audience.id),
      audienceSnapshotHash: audience.snapshotHash,
      messageSnapshotHash: h('content'),
    },
  });
  const children: MarketingCampaignRecipient[] = [];
  for (let i = 0; i < 4; i++) {
    const c = clients[i];
    const l = links[i];
    children.push(
      await db.marketingCampaignRecipient.create({
        data: {
          id: randomUUID(),
          tenantId: tenant.id,
          campaignId: root.id,
          clientId: c.id,
          externalClientId: h(c.id),
          idempotencyKey: randomUUID(),
          updatedAt: now,
          lifecycleVersion: 2,
          identityVersion: 1,
          recipientKind: 'canonical_client',
          recipientRefHash: h(c.id),
          contentIdentityHash: h('content'),
          contentEncrypted: 'synthetic-fixture',
          aggregateState: 'READY',
          routePlanJson: {
            contract: 'maya.bulk-client-route/1',
            primary: 'telegram',
            link: {
              id: l.id,
              provider: l.provider,
              subjectHash: l.providerSubjectHash,
              verificationEvidenceHash: l.verificationEvidenceHash,
            },
            userId: null,
            webPushEndpoints: [],
            apnsDevices: [],
            policyVersion: 1,
          },
        },
      }),
    );
  }
  const request = (capability: string, target: string, refs: string[]) => ({
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: tenant.id,
    capability,
    source: {
      type: 'synthetic_shadow' as const,
      occurrenceScope: target,
      sourceRef: target,
    },
    targetRef: target,
    input: { valueRef: target },
    evidenceRefs: refs,
    intentExpiresAt: expiry,
  });
  const action = await engine.createExecutionForControlledFixture(
    request(rootCap, root.id, [`b35:intent:${root.bulkIntentHash}`]),
  );
  await db.$transaction(async (tx) => {
    await tx.actionExecution.update({
      where: { id: action.id },
      data: {
        approvalDecision: 'APPROVED',
        approvalDecidedAt: now,
        approvalDecidedByUserId: user.id,
        state: 'READY',
        revision: { increment: 1 },
      },
    });
    await tx.marketingCampaign.update({
      where: { id: root.id },
      data: {
        confirmedAt: now,
        confirmedByUserId: user.id,
        confirmationHash: h('approval'),
        actionExecutionId: action.id,
        aggregateState: 'READY',
        revision: { increment: 1 },
      },
    });
  });
  await admit(action.id, tenant.id);
  const slots: MarketingCampaign[] = [];
  for (const child of children) {
    const execution = await engine.createExecutionForControlledFixture(
      request(slotCap, child.id, ['b35:slot:primary']),
    );
    const cap = capabilities.get(
      'communication.production.telegram.package2-single',
    );
    const slot = await db.$transaction(async (tx) => {
      const c = await tx.marketingCampaign.create({
        data: {
          tenantId: tenant.id,
          parentRecipientId: child.id,
          bulkSlotKey: 'primary',
          channel: 'telegram',
          provider: cap.key,
          scope: 'SINGLE',
          lifecycleVersion: 1,
          actionExecutionId: execution.id,
          aggregateState: 'READY',
          contentRef: child.id,
          message: '',
          messageSnapshotHash: h('content'),
          recipientUserIdsJson: [],
          recipientCount: 1,
          idempotencyKey: randomUUID(),
          expiresAt: expiry,
          deliveryCapabilityKey: cap.key,
          deliveryCapabilityVersion: 1,
          retryPolicyKey: cap.retry.key,
          retryPolicyVersion: 1,
          reconciliationPolicyKey: cap.reconciliation.key,
          reconciliationPolicyVersion: 1,
        },
      });
      await tx.marketingCampaignRecipient.create({
        data: {
          id: randomUUID(),
          tenantId: tenant.id,
          campaignId: c.id,
          externalClientId: h(child.id),
          idempotencyKey: randomUUID(),
          updatedAt: now,
          lifecycleVersion: 1,
          identityVersion: 1,
          recipientKind: 'telegram_chat',
          recipientRefHash: h(child.id),
          contentIdentityHash: h('content'),
          deliveryState: 'NOT_SENT',
          externalDispatchState: 'NOT_CROSSED',
          reconciliationState: 'NOT_REQUIRED',
          eligibilityBasis: 'current_client_consent',
          eligibilityDecision: 'ALLOW',
          eligibilityPolicyVersion: 1,
          eligibilityEvidenceRef:
            'b35:link:' +
            (child.routePlanJson as { link: { id: string } }).link.id,
          eligibilityEvidenceHash: h('consent'),
          eligibilityCheckedAt: now,
        },
      });
      await tx.actionExecution.update({
        where: { id: execution.id },
        data: {
          approvalDecision: 'APPROVED',
          approvalDecidedAt: now,
          approvalDecidedByUserId: user.id,
          state: 'READY',
          revision: { increment: 1 },
        },
      });
      return c;
    });
    assert.equal(
      await delivery
        .claimNext({
          tenantId: tenant.id,
          campaignId: slot.id,
          workerId: 'before.admission',
        })
        .catch(() => null),
      null,
    );
    await admit(execution.id, tenant.id);
    slots.push(slot);
  }
  checks.push(
    'User-free verified Telegram graph; slot admission precedes effects',
  );
  await denied('slot cannot append an unapproved transport leaf', () =>
    db.marketingCampaignRecipient.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        campaignId: slots[0].id,
        externalClientId: 'extra',
        idempotencyKey: randomUUID(),
        updatedAt: now,
        lifecycleVersion: 1,
        identityVersion: 1,
        recipientKind: 'telegram_chat',
        recipientRefHash: h('extra'),
        contentIdentityHash: h('content'),
        deliveryState: 'NOT_SENT',
        externalDispatchState: 'NOT_CROSSED',
        reconciliationState: 'NOT_REQUIRED',
        eligibilityBasis: 'current_client_consent',
        eligibilityDecision: 'ALLOW',
        eligibilityPolicyVersion: 1,
        eligibilityEvidenceRef: 'b35:link:' + links[0].id,
        eligibilityEvidenceHash: h('consent'),
        eligibilityCheckedAt: now,
      },
    }),
  );
  await denied(
    'root cannot complete while planned recipients are pending',
    () =>
      db.marketingCampaign.update({
        where: { id: root.id },
        data: { aggregateState: 'COMPLETED' },
      }),
  );
  const claimResults = await Promise.all(
    [1, 2].map((i) =>
      delivery.claimNext({
        tenantId: tenant.id,
        campaignId: slots[0].id,
        workerId: `race.${i}`,
      }),
    ),
  );
  const claim = claimResults.find(Boolean)!;
  assert.equal(claimResults.filter(Boolean).length, 1);
  checks.push('concurrent actual delivery kernel claim one winner');
  await denied('boundary without dispatch policy evidence denied', () =>
    delivery.markDispatchBoundary(owned(claim)),
  );
  const proof = (i: number) => ({
    contract: 'maya.bulk-dispatch-eligibility/1',
    tenantId: tenant.id,
    clientId: clients[i].id,
    decision: 'ALLOW',
    checkedAt: new Date().toISOString(),
  });
  await db.marketingDeliveryAttempt.update({
    where: { id: claim.attempt.id },
    data: { dispatchEligibilityJson: proof(0) },
  });
  const boundary = await delivery.markDispatchBoundary(owned(claim));
  await delivery.finalizeAccepted({
    ...owned(claim, boundary.recipient.revision),
    outcomeCode: 'SYNTHETIC_ACCEPTED',
    providerReference: 'synthetic-ref-1',
  });
  assert.equal(
    await delivery.claimNext({
      tenantId: tenant.id,
      campaignId: slots[0].id,
      workerId: 'retry',
    }),
    null,
  );
  checks.push('accepted outcome skipped on repeat');
  const lost = (await delivery.claimNext({
    tenantId: tenant.id,
    campaignId: slots[1].id,
    workerId: 'lost.response',
  }))!;
  await db.marketingDeliveryAttempt.update({
    where: { id: lost.attempt.id },
    data: { dispatchEligibilityJson: proof(1) },
  });
  await delivery.markDispatchBoundary(owned(lost));
  const recovered = await delivery.recoverExpiredClaim({
    tenantId: tenant.id,
    campaignId: slots[1].id,
    recipientId: lost.recipient.id,
    asOf: new Date(Date.now() + 20_000),
  });
  assert.equal(recovered.deliveryState, 'UNKNOWN');
  checks.push('lost response remains UNKNOWN with original attempt');
  await denied('finished UNKNOWN attempt proof cannot be overwritten', () =>
    db.marketingDeliveryAttempt.update({
      where: { id: lost.attempt.id },
      data: { dispatchEligibilityJson: proof(0) },
    }),
  );

  await denied('UNKNOWN cannot be changed into pending', () =>
    db.marketingCampaignRecipient.update({
      where: { id: recovered.id },
      data: {
        deliveryState: 'NOT_SENT',
        externalDispatchState: 'NOT_CROSSED',
        unknownAt: null,
        reconciliationState: 'NOT_REQUIRED',
        revision: { increment: 1 },
      },
    }),
  );
  assert.equal(
    await delivery.claimNext({
      tenantId: tenant.id,
      campaignId: slots[1].id,
      workerId: 'blind.retry',
    }),
    null,
  );
  const pending = (await delivery.claimNext({
    tenantId: tenant.id,
    campaignId: slots[2].id,
    workerId: 'independent.pending',
  }))!;
  assert(pending);
  checks.push('independent pending Client progresses beside UNKNOWN');
  await db.marketingDeliveryAttempt.update({
    where: { id: pending.attempt.id },
    data: { dispatchEligibilityJson: proof(2) },
  });
  const b = await delivery.markDispatchBoundary(owned(pending));
  await delivery.finalizeDeterministicReject({
    ...owned(pending, b.recipient.revision),
    outcomeCode: 'SYNTHETIC_REJECTED',
    errorCode: 'PROVIDER_REJECTED',
  });
  assert.equal(
    await delivery.claimNext({
      tenantId: tenant.id,
      campaignId: slots[2].id,
      workerId: 'failure.retry',
    }),
    null,
  );
  checks.push('deterministic failure terminal without fallback');
  await denied('UNKNOWN logical aggregate cannot claim completed', () =>
    db.marketingCampaignRecipient.update({
      where: { id: children[1].id },
      data: {
        aggregateState: 'COMPLETED',
        terminalAt: new Date(),
        revision: { increment: 1 },
      },
    }),
  );
  // Schema transition proof for prospective B35 pre-boundary recovery. The
  // runtime must implement this scoped recovery; generic v1 keeps its budget.
  const beforeBoundary = await delivery.claimNext({
    tenantId: tenant.id,
    campaignId: slots[3].id,
    workerId: 'schema.before-boundary',
  });
  assert(beforeBoundary);
  await db.$transaction(async (tx) => {
    await tx.marketingDeliveryAttempt.update({
      where: { id: beforeBoundary.attempt.id },
      data: {
        state: 'FAILED',
        status: 'FAILED',
        outcomeCode: 'WORKER_LOST_BEFORE_DISPATCH',
        retryDecisionCode: 'SAFE_UNSTARTED_RESUME',
        completedAt: new Date(),
      },
    });
    await tx.marketingCampaignRecipient.update({
      where: { id: beforeBoundary.recipient.id },
      data: {
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  });
  assert.equal(
    await db.marketingDeliveryAttempt.count({
      where: {
        recipientId: beforeBoundary.recipient.id,
        externalDispatchState: { in: ['MAY_HAVE_CROSSED', 'ACKNOWLEDGED'] },
      },
    }),
    0,
  );
  checks.push(
    'schema preserves same pending identity after proven pre-boundary crash; runtime extension still required',
  );
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        fixture: {
          tenantId: tenant.id,
          rootId: root.id,
          slotIds: slots.map((s) => s.id),
          recipientIds: [
            claim.recipient.id,
            lost.recipient.id,
            pending.recipient.id,
          ],
        },
        productionMessages: 0,
        syntheticAcceptedEffects: 1,
        syntheticLostResponseEffects: 1,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
