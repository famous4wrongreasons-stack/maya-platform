import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  Package5Wave4ExecutableService,
  Package5Wave4ReviewFactService,
  Package5Wave4ShadowService,
  type Package5Wave4Command,
  type Package5Wave4ObjectStore,
  type Package5Wave4StoredObject,
} from '../src/package5-wave4/package5-wave4.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';

const NOW = new Date('2026-09-03T23:00:00.000Z');
const IDENTITY_SECRET = 'package5-wave4-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'package5-wave4-proof-payload-secret-'.repeat(3);

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL required');
  const name = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!name.startsWith('maya_c06_p5_wave4_'))
    throw new Error('Wave 4 proof refuses a non-disposable database');
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

class ProofObjectStore implements Package5Wave4ObjectStore {
  puts = 0;
  ambiguousOnce = true;
  readonly objects = new Map<string, Package5Wave4StoredObject>();

  put(input: {
    requestIdentityHash: string;
    contentHash: string;
  }): Promise<Package5Wave4StoredObject> {
    this.puts += 1;
    const stored = {
      url: `/proof/provider-avatars/${input.requestIdentityHash}`,
      contentHash: input.contentHash,
    };
    this.objects.set(input.requestIdentityHash, stored);
    if (this.ambiguousOnce) {
      this.ambiguousOnce = false;
      return Promise.reject(
        new Error('synthetic connection loss after object commit'),
      );
    }
    return Promise.resolve(stored);
  }

  head(requestIdentityHash: string) {
    return Promise.resolve(this.objects.get(requestIdentityHash) ?? null);
  }
}

interface Scope {
  tenantId: string;
  branchId: string;
  ownerId: string;
  inventoryId: string;
  serviceId: string;
  providerId: string;
  timeOffId: string;
  appointmentId: string;
}

async function createScope(
  prisma: PrismaClient,
  label: string,
): Promise<Scope> {
  const suffix = randomUUID().replaceAll('-', '');
  const scope: Scope = {
    tenantId: `tenant_p5w4_${label}_${suffix}`,
    branchId: `branch_p5w4_${label}_${suffix}`,
    ownerId: `owner_p5w4_${label}_${suffix}`,
    inventoryId: `inventory_p5w4_${label}_${suffix}`,
    serviceId: `service_p5w4_${label}_${suffix}`,
    providerId: `provider_p5w4_${label}_${suffix}`,
    timeOffId: `timeoff_p5w4_${label}_${suffix}`,
    appointmentId: `appointment_p5w4_${label}_${suffix}`,
  };
  await prisma.tenant.create({
    data: {
      id: scope.tenantId,
      name: `Wave 4 ${label}`,
      slug: `p5w4-${label}-${suffix}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
      branches: { create: { id: scope.branchId, name: 'Main' } },
      users: {
        create: {
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
      },
    },
  });
  await prisma.tenantCatalogItem.create({
    data: {
      id: scope.inventoryId,
      tenantId: scope.tenantId,
      kind: 'inventory',
      name: 'Old pomade',
      priceKopecks: 1_500,
      currency: 'RUB',
      quantity: 5,
      lowStockThreshold: 1,
      source: 'manual',
    },
  });
  await prisma.internalService.create({
    data: {
      id: scope.serviceId,
      tenantId: scope.tenantId,
      name: 'Existing haircut',
      price: 2_500,
      currency: 'RUB',
      durationMinutes: 45,
    },
  });
  await prisma.internalProvider.create({
    data: {
      id: scope.providerId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      displayName: 'Existing provider',
      title: 'Barber',
    },
  });
  await prisma.internalProviderService.create({
    data: {
      tenantId: scope.tenantId,
      providerId: scope.providerId,
      serviceId: scope.serviceId,
    },
  });
  await prisma.internalAvailabilityRule.create({
    data: {
      tenantId: scope.tenantId,
      providerId: scope.providerId,
      weekday: 1,
      startMinute: 540,
      endMinute: 1080,
    },
  });
  await prisma.internalAvailabilityException.create({
    data: {
      id: scope.timeOffId,
      tenantId: scope.tenantId,
      providerId: scope.providerId,
      startAt: new Date('2026-09-10T09:00:00.000Z'),
      endAt: new Date('2026-09-10T10:00:00.000Z'),
      note: 'existing block',
    },
  });
  await prisma.appointment.create({
    data: {
      id: scope.appointmentId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      source: CalendarSource.internal,
      staffExternalId: scope.providerId,
      serviceIds: [scope.serviceId],
      startAt: new Date('2026-09-08T09:00:00.000Z'),
      endAt: new Date('2026-09-08T09:45:00.000Z'),
      blockedStartAt: new Date('2026-09-08T09:00:00.000Z'),
      blockedEndAt: new Date('2026-09-08T09:45:00.000Z'),
      totalPriceKopecks: 2_500,
      currency: 'RUB',
    },
  });
  return scope;
}

function commands(scope: Scope): Package5Wave4Command[] {
  return [
    {
      operation: 'create_inventory_item',
      sourceIntentRef: 'wave4-inventory-create',
      item: {
        name: 'New clay',
        priceKopecks: 2_000,
        currency: 'RUB',
        quantity: 10,
        lowStockThreshold: 2,
      },
    },
    {
      operation: 'update_inventory_item',
      sourceIntentRef: 'wave4-inventory-update',
      itemId: scope.inventoryId,
      patch: {
        name: 'Updated pomade',
        priceKopecks: 1_700,
        currency: 'RUB',
        quantity: 6,
        lowStockThreshold: 2,
      },
    },
    {
      operation: 'archive_inventory_item',
      sourceIntentRef: 'wave4-inventory-archive',
      itemId: scope.inventoryId,
    },
    {
      operation: 'create_internal_service',
      sourceIntentRef: 'wave4-service-create',
      service: { name: 'Beard trim', price: 1_800, durationMinutes: 30 },
    },
    {
      operation: 'update_internal_service',
      sourceIntentRef: 'wave4-service-update',
      serviceId: scope.serviceId,
      patch: { price: 2_700, durationMinutes: 50 },
    },
    {
      operation: 'archive_internal_service',
      sourceIntentRef: 'wave4-service-archive',
      serviceId: scope.serviceId,
    },
    {
      operation: 'create_internal_provider',
      sourceIntentRef: 'wave4-provider-create',
      provider: { displayName: 'Second provider', branchId: scope.branchId },
    },
    {
      operation: 'update_internal_provider',
      sourceIntentRef: 'wave4-provider-update',
      providerId: scope.providerId,
      patch: { title: 'Senior barber', slotIntervalMinutes: 20 },
    },
    {
      operation: 'replace_weekly_availability',
      sourceIntentRef: 'wave4-availability-replace',
      providerId: scope.providerId,
      rules: [
        { weekday: 2, startMinute: 600, endMinute: 900 },
        { weekday: 4, startMinute: 600, endMinute: 900 },
      ],
    },
    {
      operation: 'create_time_off',
      sourceIntentRef: 'wave4-timeoff-create',
      providerId: scope.providerId,
      startAt: new Date('2026-09-12T09:00:00.000Z'),
      endAt: new Date('2026-09-12T12:00:00.000Z'),
      note: 'planned absence',
    },
    {
      operation: 'delete_time_off',
      sourceIntentRef: 'wave4-timeoff-delete',
      providerId: scope.providerId,
      exceptionId: scope.timeOffId,
    },
    {
      operation: 'upload_provider_avatar',
      sourceIntentRef: 'wave4-avatar-upload',
      providerId: scope.providerId,
      mimeType: 'image/png',
      bytes: Buffer.from('synthetic-wave4-avatar'),
    },
  ];
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
  try {
    const primary = await createScope(prisma, 'primary');
    const foreign = await createScope(prisma, 'foreign');
    const objectStore = new ProofObjectStore();
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
    const tenantContext = {
      assertTenantId: (tenantId: string) => tenantId,
    } as TenantContextService;
    const planner = new Package5Wave4ShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
      engine.kernel,
    );
    const executor = new Package5Wave4ExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      engine.runtime,
      planner,
      objectStore,
      () => NOW,
    );

    const shadows = [];
    for (const command of commands(primary)) {
      shadows.push(
        await planner.plan(
          primary.tenantId,
          { userId: primary.ownerId },
          command,
        ),
      );
    }
    assert.equal(shadows.length, 12);
    assert.equal(new Set(shadows.map((row) => row.actionClass)).size, 12);
    assert.equal(
      shadows.every((row) => row.shadowDivergences === 0),
      true,
    );
    assert.equal(
      shadows.every(
        (row) => row.businessMutations === 0 && row.providerWrites === 0,
      ),
      true,
    );
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
    );
    assert.equal(objectStore.puts, 0);

    const frozenAppointmentBefore = await prisma.appointment.findUniqueOrThrow({
      where: { id: primary.appointmentId },
      select: {
        serviceIds: true,
        startAt: true,
        endAt: true,
        totalPriceKopecks: true,
        currency: true,
      },
    });
    const frozenOfferVersionsBefore =
      await prisma.tenantCatalogItemValueVersion.count();
    const results = [];
    for (const command of commands(primary)) {
      const prepared = await planner.build(
        primary.tenantId,
        { userId: primary.ownerId },
        command,
        'execute',
      );
      const first = await executor.execute(prepared);
      const retry = await executor.execute(prepared);
      const restartedPlanner = new Package5Wave4ShadowService(
        engine.runtime,
        prisma as unknown as PrismaService,
        tenantContext,
        engine.kernel,
      );
      const rebuilt = await restartedPlanner.build(
        primary.tenantId,
        { userId: primary.ownerId },
        command,
        'execute',
      );
      const restart = await executor.resume(rebuilt);
      assert.equal(first.actionExecutionId, retry.actionExecutionId);
      assert.equal(first.actionExecutionId, restart.actionExecutionId);
      results.push(first);
    }
    assert.equal(results.length, 12);
    assert.equal(new Set(results.map((row) => row.actionClass)).size, 12);
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId },
      }),
      12,
    );
    assert.equal(objectStore.puts, 1, 'ambiguous upload must not redispatch');
    const avatarExecution = await prisma.actionExecution.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        actionClass: 'upload_provider_avatar',
        dryRun: false,
      },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    assert.equal(avatarExecution.state, 'SUCCEEDED');
    assert.deepEqual(
      avatarExecution.attempts.map((attempt) => [attempt.kind, attempt.state]),
      [
        ['EXECUTION', 'UNKNOWN'],
        ['RECONCILIATION', 'SUCCEEDED'],
      ],
    );

    const frozenAppointmentAfter = await prisma.appointment.findUniqueOrThrow({
      where: { id: primary.appointmentId },
      select: {
        serviceIds: true,
        startAt: true,
        endAt: true,
        totalPriceKopecks: true,
        currency: true,
      },
    });
    assert.deepEqual(frozenAppointmentAfter, frozenAppointmentBefore);
    assert.equal(
      await prisma.tenantCatalogItemValueVersion.count(),
      frozenOfferVersionsBefore,
    );
    assert.equal(
      (
        await prisma.tenantCatalogItem.findUniqueOrThrow({
          where: {
            id_tenantId: {
              id: primary.inventoryId,
              tenantId: primary.tenantId,
            },
          },
        })
      ).active,
      false,
      'D4-A archives inventory instead of deleting it',
    );

    await rejects(
      () =>
        planner.build(
          primary.tenantId,
          { userId: foreign.ownerId },
          {
            operation: 'update_internal_service',
            sourceIntentRef: 'wave4-cross-tenant',
            serviceId: primary.serviceId,
            patch: { price: 9_999 },
          },
          'execute',
        ),
      'cross-tenant actor rejected',
    );
    const offerId = `offer_${randomUUID().replaceAll('-', '')}`;
    await prisma.tenantCatalogItem.create({
      data: {
        id: offerId,
        tenantId: foreign.tenantId,
        kind: 'certificate',
        name: 'Frozen offer',
        priceKopecks: 5_000,
      },
    });
    await rejects(
      () =>
        planner.build(
          foreign.tenantId,
          { userId: foreign.ownerId },
          {
            operation: 'update_inventory_item',
            sourceIntentRef: 'wave4-forged-value-kind',
            itemId: offerId,
            patch: { name: 'Forged inventory', priceKopecks: 1 },
          },
          'execute',
        ),
      'P4-09 value-bearing kind rejected',
    );

    const raceCommand: Package5Wave4Command = {
      operation: 'update_internal_provider',
      sourceIntentRef: 'wave4-provider-race',
      providerId: primary.providerId,
      patch: { specialization: 'Race-safe specialist' },
    };
    const racePrepared = await planner.build(
      primary.tenantId,
      { userId: primary.ownerId },
      raceCommand,
      'execute',
    );
    const race = await Promise.all([
      executor.execute(racePrepared),
      executor.execute(racePrepared),
    ]);
    assert.equal(race[0].actionExecutionId, race[1].actionExecutionId);
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: {
          tenantId: primary.tenantId,
          targetKind: 'internal_provider',
          targetRef: primary.providerId,
        },
      }),
      2,
    );

    const factService = new Package5Wave4ReviewFactService(prisma);
    const reviewInput = {
      tenantId: primary.tenantId,
      source: 'yclients',
      externalRef: 'review-exact-1',
      rating: 5,
      occurredAt: NOW,
      encryptedText: 'encrypted-review-proof',
      topicTags: ['service_quality'],
      branchId: primary.branchId,
    };
    const accepted = await Promise.all([
      factService.accept(reviewInput),
      factService.accept(reviewInput),
    ]);
    assert.equal(accepted[0].id, accepted[1].id);
    assert.equal(
      await prisma.businessReview.count({
        where: {
          tenantId: primary.tenantId,
          source: reviewInput.source,
          externalRef: reviewInput.externalRef,
        },
      }),
      1,
    );
    await rejects(
      () => factService.accept({ ...reviewInput, rating: 1 }),
      'immutable review source identity rejects changed evidence',
    );

    const actionEvidence = JSON.stringify(
      await prisma.actionExecution.findMany({
        where: { tenantId: primary.tenantId },
        select: {
          evidenceRefsJson: true,
          safeResultSummaryJson: true,
        },
      }),
    );
    assert.equal(actionEvidence.includes('synthetic-wave4-avatar'), false);
    assert.equal(actionEvidence.includes('planned absence'), false);

    process.stdout.write(
      JSON.stringify(
        {
          contract: 'package5.wave4.all12-executable-proof/1',
          families: ['A27', 'A28'],
          actionClasses: results.length,
          shadows: shadows.length,
          shadowDivergences: 0,
          mutationFacts: await prisma.actionTargetMutation.count({
            where: { tenantId: primary.tenantId },
          }),
          providerDispatches: objectStore.puts,
          providerReconciliation: true,
          pendingIsNotUnknown: true,
          duplicateBusinessMutationPossible: false,
          tenantAuthorityIsolation: true,
          frozenAppointmentsPreserved: true,
          p409OfferAuthorityPreserved: true,
          reviewFactReplaySafe: true,
          realProductionBusinessMutations: 0,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
