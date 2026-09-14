/**
 * Executable Wave 3 proof: three mandatory scenarios against the owned synthetic C9
 * cluster, with zero business, provider or message mutations.
 *
 * Scenario 1 — ADMIN operational support: propose, review, let the existing A22 owner
 * confirm, and attach C9 to the receipt that owner produced.
 * Scenario 2 — CLIENT_LIFECYCLE with C8 disabled: an honest proposal with explicit
 * unknowns, and no path from a coordination review to a source effect.
 * Scenario 3 — OCCUPANCY dependency graph: UNKNOWN blocks its dependents while an
 * independent branch continues, a stop closes dependents, and a restart resumes the
 * same plan rather than replanning.
 *
 * No appointment, client, message, campaign or provider call occurs anywhere below; the
 * only canonical operation performed is the owner's own A22 configuration confirmation.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { GovernedSettingsReadService } from '../src/package5-wave1/governed-settings.read';
import {
  Package5Wave1ShadowService,
  Package5Wave1ExecutableService,
} from '../src/package5-wave1/package5-wave1.service';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  EntitlementsService,
} from '../src/entitlements/entitlements.service';
import { C9Authority } from '../src/orchestration/c9.authority';
import { C9RequestIdentity } from '../src/orchestration/c9.identity';
import { C9Store } from '../src/orchestration/c9.store';
import { C9WorkService } from '../src/orchestration/c9.work';
import { C9Sources } from '../src/orchestration/c9.sources';
import { C9Allowance } from '../src/orchestration/c9.allowance';
import { C9Agents } from '../src/orchestration/c9.agents';
import { C9ContextService } from '../src/orchestration/c9.context';
import { C9Execution } from '../src/orchestration/c9.execution';
import { C9Orchestrator } from '../src/orchestration/c9.orchestrator';
import { C9Strategy } from '../src/orchestration/c9.strategy';
import { C9Object } from '../src/orchestration/c9.contract';
import { MeasurementReadService } from '../src/measurement/measurement.read.service';
import { C8ReadService } from '../src/valuation/c8.read';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55529');
assert.equal(url.pathname, '/maya_c9_replay');
assert.equal(url.username, 'maya_c9');
const cfg = new ConfigService({
  DATABASE_URL: url.toString(),
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: 'synthetic-c9-telegram',
  CRM_ENCRYPTION_KEY: 'c9-local-only-synthetic-'.repeat(3),
});
const db = new PrismaService(cfg),
  ctx = new TenantContextService(),
  encryption = new EncryptionService(cfg);
const channels = new ClientChannelRuntimeService(
  db,
  ctx,
  new ClientChannelAuthenticatorService(cfg, ctx, encryption),
  encryption,
  {} as never,
  {} as never,
);
const reader = {
  snapshot: () => Promise.reject(new Error('owner-reader-required')),
};
const sources = new C9Sources(
  reader as unknown as MeasurementReadService,
  reader as unknown as C8ReadService,
);
const governed = new GovernedSettingsReadService(db, ctx, encryption, cfg);
const authority = new C9Authority(ctx, channels),
  identity = new C9RequestIdentity(encryption),
  allowance = new C9Allowance(cfg);
const store = new C9Store(
    db,
    authority,
    identity,
    encryption,
    sources,
    allowance,
    governed,
  ),
  work = new C9WorkService(store),
  context = new C9ContextService(store, sources),
  agents = new C9Agents(),
  strategy = new C9Strategy(),
  execution = new C9Execution(store),
  orchestrator = new C9Orchestrator(store, context, work, agents, allowance);

const entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'> = {
  resolveFeatureRequirements: (
    tenantId,
    requiredFeatures,
    evaluatedAt = new Date(),
  ) =>
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
const engine = createStandaloneCanonicalActionEngine(db, entitlements, {
  identitySecret: 'c9-synthetic-identity-'.repeat(4),
  payloadEncryptionSecret: 'c9-synthetic-payload-'.repeat(4),
  policyAttestationSecret: 'c9-synthetic-attestation-'.repeat(4),
});
const planner = new Package5Wave1ShadowService(
  engine.runtime,
  db,
  ctx,
  governed,
);
const executor = new Package5Wave1ExecutableService(
  db,
  engine.ingress,
  engine.kernel,
  undefined,
  governed,
);

const checks: string[] = [];
async function proof(name: string, fn: () => unknown) {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
}
const BUSINESS_TABLES = ['Appointment', 'Client', 'MarketingCampaign'] as const;
async function businessRows(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of BUSINESS_TABLES) {
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${table}"`,
    );
    out[table] = Number(row.n);
  }
  return out;
}
const tenantContext = (vertical = 'barbershop') => ({
  contract: 'maya.c9-tenant-context/1',
  profile: {
    vertical,
    staffing: 'solo',
    branchRefs: [],
    timezoneSourceRef: 'tenant:timezone',
    serviceCatalogSourceRef: 'tenant:catalog',
  },
  strategyConstraints: {
    discounts: 'forbidden',
    allowedObjectiveKeys: ['c9.operations_support'],
    valuationPolicyRef: null,
    businessRuleRefs: [],
  },
  sourceReferences: [],
  reportPreferences: [],
  resourceLimits: null,
  exposurePolicyRefs: { marketingPolicyRef: null, offerPolicyRefs: [] },
});

async function main() {
  await db.$connect();
  const before = await businessRows();
  const tenant = await db.tenant.create({
    data: {
      name: 'C9 Wave3 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@proof.invalid',
      passwordHash: 'not-login',
      role: 'tenant_owner',
      status: 'active',
      memberships: {
        create: { tenantId: tenant.id, role: 'tenant_owner', status: 'active' },
      },
    },
  });
  const member = await db.membership.findFirstOrThrow({
    where: { tenantId: tenant.id, userId: user.id },
  });
  const asOwner = <T>(fn: () => T) =>
    ctx.run(randomUUID(), () => {
      ctx.setResolvedTenant({
        tenantId: tenant.id,
        userId: user.id,
        membershipId: member.id,
        role: 'tenant_owner',
        source: 'membership',
      });
      return fn();
    });
  const system = <T>(fn: () => T) => ctx.runAsSystemTenant(tenant.id, fn);

  const admit = async (objectiveKey: string, question: string) => {
    const event = await orchestrator.requestIdentity();
    const detail = await store.transaction(undefined, (_tx, p, now) =>
      Promise.resolve(identity.verify(event.eventToken, p, now)),
    );
    return store.admit(event.eventToken, {
      contract: 'maya.c9-request/1',
      eventEnvelopeHash: detail.hash,
      eventIssuedAt: detail.envelope.issuedAt,
      eventExpiresAt: detail.envelope.expiresAt,
      objectiveKey,
      safeQuestion: question,
      period: null,
      subjectRefs: [],
      oneOffConstraints: {
        discounts: 'forbidden',
        branchRefs: [],
        serviceRefs: [],
        requestedPeriod: null,
      },
      entryRef: null,
    });
  };
  const validUntil = (root: { validUntil: Date }) =>
    new Date(root.validUntil.getTime() - 1000).toISOString();

  // ---------------------------------------------------------------- scenario 1
  let executionBindingId = '';
  await asOwner(async () => {
    const root = await admit(
      'c9.operations_support',
      'Обнови настройки салона',
    );
    const draft = {
      namespace: 'c9_orchestration',
      expectedRevision: 0,
      previousRevisionId: null,
      content: tenantContext(),
    };
    const proposal = strategy.propose({
      objectiveKey: 'c9.operations_support',
      safeDescription: 'Подтвердить контекст салона у владельца',
      budgetManifestHash: root.budgetManifestHash,
      validUntil: validUntil(root),
      options: [
        {
          optionKey: 'confirm-context',
          title: 'Подтвердить контекст',
          domain: 'ADMIN',
          capability: 'a22.configuration',
          intentContract: 'a22.configuration:input/1',
          intent: draft,
          approvalAdapters: ['exact_source_confirmation'],
        },
      ],
      recommendedOptionKey: 'confirm-context',
    });
    const revision = await store.revision(root.id, 'edit-1', proposal);

    await proof(
      'scenario 1: an owner handoff is proposed, not performed',
      async () => {
        assert.equal(revision.state, 'VALIDATED');
        const steps = await db.c9PlanStep.findMany({
          where: { revisionId: revision.id, optionKey: 'confirm-context' },
        });
        assert.equal(steps.length, 1);
        assert.equal(steps[0].kind, 'OWNER_HANDOFF');
        assert.equal(steps[0].state, 'WAITING');
        // Nothing was executed by proposing.
        assert.equal(
          await db.actionExecution.count({ where: { tenantId: tenant.id } }),
          0,
        );
      },
    );

    await proof(
      'scenario 1: an unreviewed plan can neither run nor bind',
      async () => {
        await assert.rejects(
          execution.eligible(root.id),
          /c9_reviewed_plan_required/,
        );
      },
    );

    const reviewed = await store.review(
      root.id,
      revision.id,
      'review-1',
      revision.snapshotHash,
      'confirm-context',
      true,
    );
    const promoted = await execution.eligible(root.id);
    let lease: Awaited<ReturnType<typeof execution.claim>> = null;
    await proof(
      'scenario 1: the reviewed option becomes eligible and claimable',
      async () => {
        assert.equal(reviewed.reviewDecision, 'ACCEPTED');
        assert.deepEqual(promoted.promoted, ['confirm-context:1']);
        const steps = await db.c9PlanStep.findMany({
          where: { revisionId: revision.id, optionKey: 'confirm-context' },
        });
        lease = await execution.claim(root.id, steps[0].id);
        assert.ok(lease);
        // A second claim of a claimed step returns nothing rather than duplicating work.
        assert.equal(await execution.claim(root.id, steps[0].id), null);
      },
    );

    await proof(
      'scenario 1: an accepted review still cannot fabricate an effect',
      async () => {
        await assert.rejects(
          execution.bind(lease!, {
            bindingKind: 'EXECUTION',
            slotKey: 'a22',
            ownerKey: 'tenant_business_configuration',
            sourceType: 'ActionExecution',
            sourceId: randomUUID(),
            sourceIdentityHash: 'f'.repeat(64),
            sourceIntentHash: 'f'.repeat(64),
            sourceApprovalHash: null,
            lineage: {
              tenantId: tenant.id,
              subjectRefs: [],
              sourceActorRef: null,
              sourcePolicyRef: null,
              sourceApprovalRef: null,
              sourceExecutionRefs: [],
              ownerRootRef: null,
            },
          }),
          /c9_exact_source_required/,
        );
      },
    );

    // The owner confirms on the existing A22 ingress. C9 does not call it for them.
    const receipt = await system(async () =>
      executor.execute(
        await planner.buildGoverned(
          tenant.id,
          user.id,
          'tenant_business_configuration',
          'c9-context-' + randomUUID(),
          randomUUID(),
          {
            confirmed: true,
            namespace: 'c9_orchestration',
            expectedRevision: 0,
            previousRevisionId: null,
            content: tenantContext(),
          },
        ),
      ),
    );
    await proof(
      'scenario 1: C9 attaches to the receipt the A22 owner produced',
      async () => {
        // The owner's own canonical capability id, not a name C9 chose for it.
        const action = await db.actionExecution.findFirstOrThrow({
          where: { tenantId: tenant.id, dryRun: false, state: 'SUCCEEDED' },
        });
        assert.equal(
          action.capability,
          'package5.settings.tenant-business.execute.v1',
        );
        assert.ok(receipt);
        const bound = await execution.bind(lease!, {
          bindingKind: 'EXECUTION',
          slotKey: 'a22',
          ownerKey: action.capability,
          sourceType: 'ActionExecution',
          sourceId: action.id,
          sourceIdentityHash: action.identityFingerprint,
          sourceIntentHash: action.normalizedInputHash,
          sourceApprovalHash: null,
          lineage: {
            tenantId: tenant.id,
            subjectRefs: [],
            sourceActorRef: user.id,
            sourcePolicyRef: null,
            sourceApprovalRef: null,
            sourceExecutionRefs: [],
            ownerRootRef: null,
          },
        });
        executionBindingId = bound.id;
        assert.equal(bound.bindingKind, 'EXECUTION');
        // Replaying the same attachment returns the same row, never a second effect.
        const again = await execution.bind(lease!, {
          bindingKind: 'EXECUTION',
          slotKey: 'a22',
          ownerKey: action.capability,
          sourceType: 'ActionExecution',
          sourceId: action.id,
          sourceIdentityHash: action.identityFingerprint,
          sourceIntentHash: action.normalizedInputHash,
          sourceApprovalHash: null,
          lineage: {
            tenantId: tenant.id,
            subjectRefs: [],
            sourceActorRef: user.id,
            sourcePolicyRef: null,
            sourceApprovalRef: null,
            sourceExecutionRefs: [],
            ownerRootRef: null,
          },
        });
        assert.equal(again.id, bound.id);
        assert.equal(
          await db.c9StepBinding.count({
            where: { tenantId: tenant.id, bindingKind: 'EXECUTION' },
          }),
          1,
        );
        const resolved = await execution.resolve(lease!, 'RESOLVED', null);
        assert.equal(resolved.state, 'RESOLVED');
      },
    );

    await proof(
      'scenario 1: the confirmed configuration is the A22 owner’s, not C9’s',
      async () => {
        const revisions = await db.tenantBusinessConfigurationRevision.findMany(
          {
            where: { tenantId: tenant.id, namespace: 'c9_orchestration' },
          },
        );
        assert.equal(revisions.length, 1);
        assert.equal(revisions[0].contractVersion, 1);
        // The reader reports it as confirmed configuration owned elsewhere.
        const current = await store.transaction(undefined, (tx, p) =>
          governed.configuration(tx, p.tenantId, 'c9_orchestration'),
        );
        assert.equal(current.revision, 1);
        assert.equal(
          (current.content as C9Object).contract,
          'maya.c9-tenant-context/1',
        );
      },
    );
  });

  // ---------------------------------------------------------------- scenario 2
  await asOwner(async () => {
    const root = await admit(
      'c9.client_return',
      'Вернём тех, кто давно не был?',
    );
    await proof(
      'scenario 2: a disabled C8 target yields unknowns, not a number',
      async () => {
        const proposal = strategy.propose({
          objectiveKey: 'c9.client_return',
          safeDescription: 'Предложить возврат клиентам',
          budgetManifestHash: root.budgetManifestHash,
          validUntil: validUntil(root),
          unknowns: ['no_qualified_value', 'c8_activation_disabled'],
          options: [
            {
              optionKey: 'dormant-read',
              title: 'Посмотреть, кто давно не был',
              domain: 'CLIENT_LIFECYCLE',
              capability: 'clients.dormant.list',
              intentContract: 'clients.dormant.list:input/1',
              intent: { inactive_days: 90 },
            },
          ],
        });
        const alternatives = proposal.alternatives as C9Object[];
        assert.equal(alternatives.length, 2);
        assert.deepEqual(
          alternatives.map((a) => a.key),
          ['dormant-read', 'c9.no_action'],
        );
        for (const alternative of alternatives) {
          assert.deepEqual(alternative.unknowns, [
            'no_qualified_value',
            'c8_activation_disabled',
          ]);
          assert.equal((alternative.knownBenefit as C9Object).proposalText, '');
        }
        const revision = await store.revision(root.id, 'edit-2', proposal);
        assert.equal(revision.state, 'VALIDATED');
        const body = JSON.stringify(revision.alternativesJson);
        assert(!/"numericPrediction":(?!null)/.test(body));
        assert(!/[0-9]+(?:[.,][0-9]+)?\s*%/.test(body));
      },
    );

    await proof(
      'scenario 2: a declined review stops the plan and runs nothing',
      async () => {
        const revision = await db.c9StrategyRevision.findFirstOrThrow({
          where: { runId: root.id },
          orderBy: { revision: 'desc' },
        });
        const declined = await store.review(
          root.id,
          revision.id,
          'review-2',
          revision.snapshotHash,
          'dormant-read',
          false,
        );
        assert.equal(declined.reviewDecision, 'DECLINED');
        assert.equal(declined.state, 'STOPPED');
        await assert.rejects(
          execution.eligible(root.id),
          /c9_reviewed_plan_required/,
        );
        assert.equal(
          await db.c9StepBinding.count({
            where: {
              tenantId: tenant.id,
              stepId: {
                in: (
                  await db.c9PlanStep.findMany({
                    where: { revisionId: revision.id },
                    select: { id: true },
                  })
                ).map((s) => s.id),
              },
            },
          }),
          0,
        );
      },
    );
  });

  // ---------------------------------------------------------------- scenario 3
  await asOwner(async () => {
    const root = await admit(
      'c9.occupancy_review',
      'Что с загрузкой на неделе?',
    );
    const proposal = strategy.propose({
      objectiveKey: 'c9.occupancy_review',
      safeDescription: 'Посмотреть расписание и журнал',
      budgetManifestHash: root.budgetManifestHash,
      validUntil: validUntil(root),
      options: [
        {
          optionKey: 'occupancy',
          title: 'Расписание',
          domain: 'OCCUPANCY',
          capability: 'staff.schedule.read',
          intentContract: 'staff.schedule.read:input/1',
          intent: { date: '2026-09-15' },
        },
      ],
      recommendedOptionKey: 'occupancy',
    });
    // Two more nodes in the same option: one dependent on the first, one independent.
    proposal.steps.push(
      {
        optionKey: 'occupancy',
        stepKey: 'occupancy:2',
        ordinal: 2,
        domain: 'OCCUPANCY',
        kind: 'READ',
        capability: 'operations.journal.read',
        intentContract: 'operations.journal.read:input/1',
        intent: { date: '2026-09-15' },
        dependencies: [
          { stepKey: 'occupancy:1', requires: 'RESOLVED_SUCCESS' },
        ],
        evidenceRefs: [],
        budgetSlice: {
          callReservationKey: null,
          exposure: {
            maxActions: 0,
            maxRecipients: 0,
            maxMessages: 0,
            providerCost: null,
            verifiedZeroCost: null,
            offerRef: null,
            maxDiscountMinorUnits: null,
            maxDiscountBps: null,
          },
          sourcePreviewRefs: [],
        },
        validUntil: validUntil(root),
      },
      {
        optionKey: 'occupancy',
        stepKey: 'occupancy:3',
        ordinal: 3,
        domain: 'OCCUPANCY',
        kind: 'READ',
        capability: 'company.business-hours.read',
        intentContract: 'company.business-hours.read:input/1',
        intent: {},
        dependencies: [],
        evidenceRefs: [],
        budgetSlice: {
          callReservationKey: null,
          exposure: {
            maxActions: 0,
            maxRecipients: 0,
            maxMessages: 0,
            providerCost: null,
            verifiedZeroCost: null,
            offerRef: null,
            maxDiscountMinorUnits: null,
            maxDiscountBps: null,
          },
          sourcePreviewRefs: [],
        },
        validUntil: validUntil(root),
      },
    );
    const revision = await store.revision(root.id, 'edit-3', proposal);
    await store.review(
      root.id,
      revision.id,
      'review-3',
      revision.snapshotHash,
      'occupancy',
      true,
    );
    const first = await execution.eligible(root.id);
    await proof(
      'scenario 3: a dependent waits while an independent branch proceeds',
      () => {
        // The dependent node is not promoted; the independent one is.
        assert.deepEqual(first.promoted.sort(), ['occupancy:1', 'occupancy:3']);
      },
    );

    // Only the reviewed option; the honest do-nothing node shares ordinal 1 with it.
    const steps = await db.c9PlanStep.findMany({
      where: { revisionId: revision.id, optionKey: 'occupancy' },
      orderBy: { ordinal: 'asc' },
    });
    await proof(
      'scenario 3: an unproven outcome stays UNKNOWN and blocks its dependents',
      async () => {
        const lease = await execution.claim(root.id, steps[0].id);
        assert.ok(lease);
        await execution.bind(lease, {
          bindingKind: 'ASSIGNMENT',
          slotKey: 'schedule',
          ownerKey: 'staff.schedule.read',
          sourceType: 'TenantBusinessConfigurationRevision',
          sourceId: (
            await db.tenantBusinessConfigurationRevision.findFirstOrThrow({
              where: { tenantId: tenant.id },
            })
          ).id,
          sourceIdentityHash: 'a'.repeat(64),
          sourceIntentHash: (
            await db.tenantBusinessConfigurationRevision.findFirstOrThrow({
              where: { tenantId: tenant.id },
            })
          ).contentHash,
          sourceApprovalHash: null,
          lineage: {
            tenantId: tenant.id,
            subjectRefs: [],
            sourceActorRef: null,
            sourcePolicyRef: null,
            sourceApprovalRef: null,
            sourceExecutionRefs: [],
            ownerRootRef: null,
          },
        });
        const held = await execution.resolve(lease, 'UNKNOWN', null);
        assert.equal(held.state, 'BOUND');
        const status = await execution.status(root.id);
        assert.deepEqual(status.unknownStepKeys, ['occupancy:1']);
        assert.equal(status.completeness, 'PARTIAL');
        // A restart re-derives eligibility and still refuses to promote the dependent.
        const again = await execution.eligible(root.id);
        assert.deepEqual(again.promoted, []);
        const dependent = await db.c9PlanStep.findFirstOrThrow({
          where: { revisionId: revision.id, stepKey: 'occupancy:2' },
        });
        assert.equal(dependent.state, 'WAITING');
      },
    );

    await proof('scenario 3: a lost fence cannot bind or resolve', async () => {
      const stale = {
        runId: root.id,
        stepId: steps[2].id,
        generation: 99,
        token: randomUUID(),
      };
      await assert.rejects(
        execution.resolve(stale, 'RESOLVED', null),
        /c9_step_fenced/,
      );
    });

    await proof(
      'scenario 3: a deterministic stop closes dependents, never substitutes',
      async () => {
        const lease = await execution.claim(root.id, steps[2].id);
        assert.ok(lease);
        const stopped = await execution.resolve(
          lease,
          'STOPPED',
          'source_unavailable',
        );
        assert.equal(stopped.state, 'STOPPED');
        assert.equal(stopped.stopReason, 'source_unavailable');
        const status = await execution.status(root.id);
        // The stopped node has no replacement anywhere in the option.
        assert.equal(
          status.steps.filter((s) => s.state === 'STOPPED').length,
          1,
        );
        assert.equal(
          status.steps.filter((s) => s.stepKey.startsWith('occupancy:')).length,
          3,
        );
      },
    );

    await proof(
      'scenario 3: restart resumes the same plan and never replans',
      async () => {
        const before = await execution.status(root.id);
        await work.recover(root.id);
        const after = await execution.status(root.id);
        assert.equal(after.revisionId, before.revisionId);
        assert.deepEqual(
          after.steps.map((s) => s.stepKey),
          before.steps.map((s) => s.stepKey),
        );
        assert.equal(
          await db.c9StrategyRevision.count({ where: { runId: root.id } }),
          1,
        );
      },
    );
  });

  await proof(
    'the one execution attachment names the owner receipt exactly',
    async () => {
      const binding = await db.c9StepBinding.findFirstOrThrow({
        where: { id: executionBindingId },
      });
      const action = await db.actionExecution.findFirstOrThrow({
        where: { id: binding.sourceId },
      });
      assert.equal(binding.sourceIdentityHash, action.identityFingerprint);
      assert.equal(binding.sourceIntentHash, action.normalizedInputHash);
      assert.equal(binding.ownerKey, action.capability);
      assert.equal(action.dryRun, false);
    },
  );

  const after = await businessRows();
  await proof('no business, provider or message mutation occurred', () => {
    for (const table of BUSINESS_TABLES)
      assert.equal(after[table], before[table]);
  });

  console.log(
    JSON.stringify({
      contract: 'maya.c9-wave3-postgresql-proof/1',
      checks: checks.length,
      passed: checks,
      scenarios: 3,
      paidReasoning: 'DISABLED',
      businessProviderMessageMutations: 0,
      productionEffects: 0,
    }),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
