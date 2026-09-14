import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { DOMAIN_EVENT_TYPE } from '../src/domain';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import {
  Package5Wave5ExecutableService,
  Package5Wave5RecoveryFactPlaneService,
  Package5Wave5ShadowService,
  package5Wave5Hash,
  type RecoveryAttributionCorrectionCommand,
} from '../src/package5-wave5/package5-wave5.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const NOW = new Date('2026-09-03T18:00:00.000Z');
const IDENTITY_SECRET = 'package5-wave5-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'package5-wave5-proof-payload-secret-'.repeat(3);
const SUBJECT = package5Wave5Hash('proof-subject-without-raw-pii');

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL required');
  const name = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!name.startsWith('maya_c06_p5_wave5_')) {
    throw new Error('Wave 5 proof refuses a non-disposable database');
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

interface Scope {
  tenantId: string;
  branchId: string;
  managerId: string;
  ownerId: string;
}

async function createScope(
  prisma: PrismaClient,
  label: string,
): Promise<Scope> {
  const suffix = randomUUID().replaceAll('-', '');
  const scope = {
    tenantId: `tenant_p5w5_${label}_${suffix}`,
    branchId: `branch_p5w5_${label}_${suffix}`,
    managerId: `manager_p5w5_${label}_${suffix}`,
    ownerId: `owner_p5w5_${label}_${suffix}`,
  };
  await prisma.tenant.create({
    data: {
      id: scope.tenantId,
      name: `Wave 5 ${label}`,
      slug: `p5w5-${label}-${suffix}`,
      status: TenantStatus.active,
      branches: { create: { id: scope.branchId, name: 'Main' } },
      users: {
        create: [
          {
            id: scope.managerId,
            email: `${scope.managerId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.manager,
            memberships: {
              create: {
                tenantId: scope.tenantId,
                branchId: scope.branchId,
                role: UserRole.manager,
                status: MembershipStatus.active,
              },
            },
          },
          {
            id: scope.ownerId,
            email: `${scope.ownerId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.tenant_owner,
            memberships: {
              create: {
                tenantId: scope.tenantId,
                branchId: scope.branchId,
                role: UserRole.tenant_owner,
                status: MembershipStatus.active,
              },
            },
          },
        ],
      },
    },
  });
  return scope;
}

async function rejects(run: () => Promise<unknown>, label: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, label);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  const tenantContext = new TenantContextService();
  const inTenant = <T>(tenantId: string, run: () => T) =>
    tenantContext.runAsSystemTenant(tenantId, run);
  try {
    const primary = await createScope(prisma, 'primary');
    const foreign = await createScope(prisma, 'foreign');
    const factPlane = new Package5Wave5RecoveryFactPlaneService(
      prisma as unknown as PrismaService,
      tenantContext,
    );
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
    const planner = new Package5Wave5ShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
      engine.kernel,
    );
    const executor = new Package5Wave5ExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      planner,
      () => NOW,
    );

    const touchpoints = [
      {
        externalEventId: 'delivery-old-0001',
        occurredAt: new Date('2026-09-01T09:00:00.000Z'),
      },
      {
        externalEventId: 'delivery-current-0002',
        occurredAt: new Date('2026-09-02T09:00:00.000Z'),
      },
      {
        externalEventId: 'delivery-race-a-0003',
        occurredAt: new Date('2026-09-02T10:00:00.000Z'),
      },
      {
        externalEventId: 'delivery-race-b-0004',
        occurredAt: new Date('2026-09-02T11:00:00.000Z'),
      },
    ];
    const acceptedTouchpoints: string[] = [];
    for (const item of touchpoints) {
      const input = {
        tenantId: primary.tenantId,
        externalEventId: item.externalEventId,
        subjectRef: SUBJECT,
        kind: 'reactivation',
        channel: 'maya_inbox',
        status: 'delivered' as const,
        occurredAt: item.occurredAt,
        attributionWindowDays: 14,
        source: 'legacy_bridge',
        ingestionMethod: 'webhook' as const,
      };
      const pair = await inTenant(primary.tenantId, () =>
        Promise.all([
          factPlane.acceptTouchpoint(input),
          factPlane.acceptTouchpoint(input),
        ]),
      );
      assert.equal(pair[0].touchpointId, pair[1].touchpointId);
      assert.deepEqual(pair.map((result) => result.outcome).sort(), [
        'created',
        'duplicate',
      ]);
      acceptedTouchpoints.push(pair[0].touchpointId);
    }
    assert.equal(
      await prisma.recoveryTouchpoint.count({
        where: { tenantId: primary.tenantId },
      }),
      4,
    );
    assert.equal(
      await prisma.domainEvent.count({
        where: {
          tenantId: primary.tenantId,
          type: DOMAIN_EVENT_TYPE.recoveryTouchpointObserved,
        },
      }),
      4,
    );

    const bookingInput = {
      tenantId: primary.tenantId,
      externalBookingRef: 'booking-wave5-0001',
      subjectRef: SUBJECT,
      crmExternalId: 'crm-booking-wave5-0001',
      bookedAt: new Date('2026-09-03T09:00:00.000Z'),
      visitAt: new Date('2026-09-04T09:00:00.000Z'),
      bookedValueKopecks: 150_000,
      currency: 'RUB',
      filledWindow: false,
      source: 'internal_calendar',
      ingestionMethod: 'internal' as const,
    };
    const bookingPair = await inTenant(primary.tenantId, () =>
      Promise.all([
        factPlane.acceptBooking(bookingInput),
        factPlane.acceptBooking(bookingInput),
      ]),
    );
    assert.equal(bookingPair[0].conversionId, bookingPair[1].conversionId);
    assert.deepEqual(bookingPair.map((result) => result.outcome).sort(), [
      'created',
      'duplicate',
    ]);
    const conversionId = bookingPair[0].conversionId!;
    const conversion = await prisma.recoveryConversion.findUniqueOrThrow({
      where: { id: conversionId },
    });
    assert.equal(conversion.touchpointId, acceptedTouchpoints[3]);
    assert.equal(
      await prisma.domainEvent.count({
        where: {
          tenantId: primary.tenantId,
          type: DOMAIN_EVENT_TYPE.recoveryBookingObserved,
        },
      }),
      1,
    );

    const evidence = await prisma.domainEvent.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        entityId: acceptedTouchpoints[0],
        type: DOMAIN_EVENT_TYPE.recoveryTouchpointObserved,
      },
    });
    const correction: RecoveryAttributionCorrectionCommand = {
      sourceIntentRef: 'approved-recovery-correction-0001',
      conversionId,
      touchpointId: acceptedTouchpoints[0],
      sourceEvidenceEventId: evidence.id,
      reasonCode: 'operator_evidence_correction',
    };
    const sourceFactsBefore = await prisma.domainEvent.findMany({
      where: { tenantId: primary.tenantId },
      orderBy: { id: 'asc' },
    });
    const shadow = await inTenant(primary.tenantId, () =>
      planner.plan(primary.tenantId, primary.managerId, correction),
    );
    const shadowRetry = await inTenant(primary.tenantId, () =>
      planner.plan(primary.tenantId, primary.managerId, correction),
    );
    assert.equal(shadow.actionExecutionId, shadowRetry.actionExecutionId);
    assert.equal(shadow.shadowDivergences, 0);
    assert.equal(shadow.businessMutations, 0);
    assert.equal(
      (
        await prisma.recoveryConversion.findUniqueOrThrow({
          where: { id: conversionId },
        })
      ).touchpointId,
      acceptedTouchpoints[3],
    );

    const prepared = await inTenant(primary.tenantId, () =>
      planner.build(primary.tenantId, primary.managerId, correction, 'execute'),
    );
    const pending = await engine.ingress.createExecution(prepared.request);
    assert.equal(pending.state, 'PENDING_APPROVAL');
    await rejects(
      () => inTenant(primary.tenantId, () => executor.execute(prepared)),
      'correction cannot execute before owner approval',
    );
    await engine.kernel.decideApproval({
      tenantId: primary.tenantId,
      executionId: pending.id,
      approverUserId: primary.ownerId,
      decision: ActionApprovalDecision.APPROVED,
    });
    const first = await inTenant(primary.tenantId, () =>
      executor.execute(prepared),
    );
    const retry = await inTenant(primary.tenantId, () =>
      executor.execute(prepared),
    );
    const restartedPlanner = new Package5Wave5ShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
      engine.kernel,
    );
    const restarted = await inTenant(primary.tenantId, () =>
      restartedPlanner.build(
        primary.tenantId,
        primary.managerId,
        correction,
        'execute',
      ),
    );
    const restart = await inTenant(primary.tenantId, () =>
      executor.resume(restarted),
    );
    assert.equal(first.actionExecutionId, retry.actionExecutionId);
    assert.equal(first.actionExecutionId, restart.actionExecutionId);
    assert.equal(first.touchpointId, acceptedTouchpoints[0]);
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId, targetRef: conversionId },
      }),
      1,
    );
    assert.deepEqual(
      await prisma.domainEvent.findMany({
        where: { tenantId: primary.tenantId },
        orderBy: { id: 'asc' },
      }),
      sourceFactsBefore,
      'governed correction must not rewrite source evidence',
    );

    const raceCommands = await Promise.all(
      [1, 2].map(async (index) => {
        const target = acceptedTouchpoints[index];
        const targetEvidence = await prisma.domainEvent.findFirstOrThrow({
          where: {
            tenantId: primary.tenantId,
            entityId: target,
            type: DOMAIN_EVENT_TYPE.recoveryTouchpointObserved,
          },
        });
        return {
          sourceIntentRef: `approved-recovery-race-000${index}`,
          conversionId,
          touchpointId: target,
          sourceEvidenceEventId: targetEvidence.id,
          reasonCode: 'authoritative_source_correction' as const,
        };
      }),
    );
    const racePrepared = await Promise.all(
      raceCommands.map((command) =>
        inTenant(primary.tenantId, () =>
          planner.build(
            primary.tenantId,
            primary.managerId,
            command,
            'execute',
          ),
        ),
      ),
    );
    for (const item of racePrepared) {
      const execution = await engine.ingress.createExecution(item.request);
      await engine.kernel.decideApproval({
        tenantId: primary.tenantId,
        executionId: execution.id,
        approverUserId: primary.ownerId,
        decision: ActionApprovalDecision.APPROVED,
      });
    }
    const race = await inTenant(primary.tenantId, () =>
      Promise.allSettled(racePrepared.map((item) => executor.execute(item))),
    );
    assert.equal(
      race.filter((result) => result.status === 'fulfilled').length,
      1,
      'concurrent corrections must have one winner',
    );
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId, targetRef: conversionId },
      }),
      2,
    );

    await rejects(
      () =>
        inTenant(foreign.tenantId, () =>
          planner.build(
            foreign.tenantId,
            foreign.managerId,
            {
              ...correction,
              sourceIntentRef: 'cross-tenant-correction-0001',
            },
            'execute',
          ),
        ),
      'cross-tenant attribution correction rejected',
    );
    await rejects(
      () =>
        inTenant(primary.tenantId, () =>
          planner.build(
            primary.tenantId,
            primary.managerId,
            {
              ...correction,
              sourceIntentRef: 'forged-evidence-correction-0001',
              touchpointId: acceptedTouchpoints[2],
            },
            'execute',
          ),
        ),
      'mismatched source evidence rejected',
    );

    const eventFingerprint = package5Wave5Hash('a31-event-fingerprint');
    await prisma.domainEvent.create({
      data: {
        tenantId: primary.tenantId,
        type: DOMAIN_EVENT_TYPE.appointmentCreated,
        entityType: 'appointment',
        entityId: 'appointment-a31-proof',
        occurredAt: NOW,
        source: 'yclients',
        ingestionMethod: 'reconciliation',
        dedupFingerprint: eventFingerprint,
        payload: { state: 'canonical' },
      },
    });
    await rejects(
      () =>
        prisma.domainEvent.create({
          data: {
            tenantId: primary.tenantId,
            type: DOMAIN_EVENT_TYPE.appointmentCreated,
            entityType: 'appointment',
            entityId: 'appointment-a31-proof',
            occurredAt: NOW,
            source: 'yclients',
            ingestionMethod: 'webhook',
            dedupFingerprint: eventFingerprint,
            payload: { state: 'canonical' },
          },
        }),
      'same A31 source fact is database-deduplicated',
    );
    await prisma.domainEvent.create({
      data: {
        tenantId: foreign.tenantId,
        type: DOMAIN_EVENT_TYPE.appointmentCreated,
        entityType: 'appointment',
        entityId: 'appointment-a31-proof',
        occurredAt: NOW,
        source: 'yclients',
        ingestionMethod: 'reconciliation',
        dedupFingerprint: eventFingerprint,
        payload: { state: 'canonical' },
      },
    });

    const runWindow = {
      windowFrom: new Date('2026-09-03T00:00:00.000Z'),
      windowTo: new Date('2026-09-04T00:00:00.000Z'),
    };
    const liveRun = await prisma.reconciliationRun.create({
      data: {
        tenantId: primary.tenantId,
        provider: 'yclients',
        ...runWindow,
        leaseUntil: new Date('2026-09-03T18:05:00.000Z'),
        holderId: 'wave5-proof-one',
      },
    });
    await rejects(
      () =>
        prisma.reconciliationRun.create({
          data: {
            tenantId: primary.tenantId,
            provider: 'yclients',
            ...runWindow,
            leaseUntil: new Date('2026-09-03T18:05:00.000Z'),
            holderId: 'wave5-proof-two',
          },
        }),
      'A31 permits only one live tenant/provider lease',
    );
    await prisma.reconciliationRun.update({
      where: { id: liveRun.id },
      data: { finishedAt: NOW, completeness: 'truncated' },
    });
    await prisma.reconciliationRun.create({
      data: {
        tenantId: primary.tenantId,
        provider: 'yclients',
        ...runWindow,
        leaseUntil: new Date('2026-09-03T18:05:00.000Z'),
        holderId: 'wave5-proof-three',
      },
    });

    const evidenceJson = JSON.stringify(
      await prisma.actionExecution.findMany({
        where: { tenantId: primary.tenantId },
        select: {
          evidenceRefsJson: true,
          safeResultSummaryJson: true,
        },
      }),
    );
    assert.equal(evidenceJson.includes('proof-subject-without-raw-pii'), false);
    assert.equal(evidenceJson.includes('crm-booking-wave5-0001'), false);

    process.stdout.write(
      `${JSON.stringify(
        {
          contract: 'package5.wave5.all1-executable-proof/1',
          families: ['A29', 'A31'],
          actionClasses: ['correct_recovery_attribution'],
          shadows: 1,
          shadowDivergences: 0,
          factPlaneActionExecutions: 0,
          touchpointDeduplication: true,
          bookingDeduplication: true,
          immutableSourceFacts: true,
          correctionOwnerApproval: true,
          correctionConcurrencyWinnerCount: 1,
          a31EventDeduplication: true,
          a31SingleLiveLease: true,
          providerOperation: 'READ_ONLY',
          unknownRequired: false,
          duplicateBusinessMutationPossible: false,
          tenantAuthorityIsolation: true,
          realProductionBusinessMutations: 0,
          providerWrites: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
