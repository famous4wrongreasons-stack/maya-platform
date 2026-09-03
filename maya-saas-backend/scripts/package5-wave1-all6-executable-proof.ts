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
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from '../src/package5-wave1/package5-wave1.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';

const NOW = new Date('2026-09-03T21:00:00.000Z');
const IDENTITY_SECRET = 'package5-wave1-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'package5-wave1-proof-payload-secret-'.repeat(3);

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p5_wave1_')) {
    throw new Error('Wave 1 proof refuses a non-disposable database');
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

async function createScope(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p5w1_${label}_${suffix}`;
  const ownerId = `owner_p5w1_${label}_${suffix}`;
  const assigneeId = `assignee_p5w1_${label}_${suffix}`;
  const clientId = `client_p5w1_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `Package 5 Wave 1 ${label}`,
      slug: `p5-wave1-${label}-${randomUUID()}`,
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
            id: assigneeId,
            email: `${assigneeId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.staff,
            memberships: {
              create: {
                tenantId,
                role: UserRole.staff,
                status: MembershipStatus.active,
              },
            },
          },
          {
            id: clientId,
            email: `${clientId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.client,
            memberships: {
              create: {
                tenantId,
                role: UserRole.client,
                status: MembershipStatus.active,
              },
            },
          },
        ],
      },
    },
  });
  return { tenantId, ownerId, assigneeId, clientId };
}

async function rejects(run: () => Promise<unknown>, reason: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, reason);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const primary = await createScope(prisma, 'primary');
    const foreign = await createScope(prisma, 'foreign');
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
    const planner = new Package5Wave1ShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
    );
    const executor = new Package5Wave1ExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      () => NOW,
    );

    const beforeShadow = {
      settings: await prisma.dashboardPreference.count(),
      notifications: await prisma.appointmentNotificationSetting.count(),
      workItems: await prisma.operationalWorkItem.count(),
      inbox: await prisma.inboxItem.count(),
      mutations: await prisma.actionTargetMutation.count(),
    };
    const shadow = [
      await planner.planAssistant(primary.tenantId, primary.ownerId, {
        sourceIntentRef: 'shadow-assistant',
        enabledCapabilities: ['daily_brief', 'finance_analytics'],
      }),
      await planner.planFinance(primary.tenantId, primary.ownerId, {
        sourceIntentRef: 'shadow-finance',
        enabledWidgets: ['summary', 'daily'],
        monthlyTargetRub: 250000,
        staffTargetsRub: { 'staff-external-1': 100000 },
      }),
      await planner.planAppointmentNotifications(
        primary.tenantId,
        primary.ownerId,
        {
          sourceIntentRef: 'shadow-notifications',
          enabled: true,
          leadTimesMinutes: [1440, 120],
        },
      ),
      await planner.planTaskCreate(primary.tenantId, primary.ownerId, {
        sourceIntentRef: 'shadow-task',
        assigneeUserId: primary.assigneeId,
        title: 'Shadow task',
        bodyText: 'No business row may be created.',
      }),
      await planner.planAdministratorContact(
        primary.tenantId,
        primary.clientId,
        {
          sourceIntentRef: 'shadow-support',
          reason: 'Please call me.',
        },
      ),
    ];
    assert.equal(
      shadow.every((row) => row.shadowDivergences === 0),
      true,
    );
    assert.deepEqual(
      {
        settings: await prisma.dashboardPreference.count(),
        notifications: await prisma.appointmentNotificationSetting.count(),
        workItems: await prisma.operationalWorkItem.count(),
        inbox: await prisma.inboxItem.count(),
        mutations: await prisma.actionTargetMutation.count(),
      },
      beforeShadow,
      'the first five Shadow paths must not mutate business state',
    );

    const assistantRequest = await planner.buildAssistant(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-assistant',
        enabledCapabilities: ['daily_brief', 'finance_analytics'],
      },
      'execute',
    );
    const assistantFirst = await executor.execute(assistantRequest);
    const assistantRetry = await executor.execute(assistantRequest);
    assert.equal(
      assistantFirst.actionExecutionId,
      assistantRetry.actionExecutionId,
    );
    assert.equal(await prisma.dashboardPreference.count(), 1);

    const noOpRequest = await planner.buildAssistant(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-assistant-noop',
        enabledCapabilities: ['daily_brief', 'finance_analytics'],
      },
      'execute',
    );
    const noOp = await executor.execute(noOpRequest);
    assert.equal(noOp.noOp, true);
    assert.equal(noOp.settingMutations, 0);

    const financeRequest = await planner.buildFinance(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-finance',
        enabledWidgets: ['summary', 'plans'],
        monthlyTargetRub: 300000,
        staffTargetsRub: {},
      },
      'execute',
    );
    await executor.execute(financeRequest);
    const appointmentRequest = await planner.buildAppointmentNotifications(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-notifications',
        enabled: false,
        leadTimesMinutes: [1440, 120],
      },
      'execute',
    );
    await executor.execute(appointmentRequest);

    const taskRequest = await planner.buildTaskCreate(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-task',
        assigneeUserId: primary.assigneeId,
        title: 'Prepare exact report',
        bodyText: 'Use canonical facts only.',
        dueAt: new Date('2026-09-05T12:00:00.000Z'),
      },
      'execute',
    );
    const taskFirst = await executor.execute(taskRequest);
    const taskRetryRequest = await planner.buildTaskCreate(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-task',
        assigneeUserId: primary.assigneeId,
        title: 'Prepare exact report',
        bodyText: 'Use canonical facts only.',
        dueAt: new Date('2026-09-05T12:00:00.000Z'),
      },
      'execute',
    );
    const taskRetry = await executor.execute(taskRetryRequest);
    assert.equal(taskFirst.actionExecutionId, taskRetry.actionExecutionId);

    const completeShadowBefore = await prisma.operationalWorkItem.count();
    const completeShadow = await planner.planTaskComplete(
      primary.tenantId,
      primary.assigneeId,
      { sourceIntentRef: 'shadow-complete', workItemId: taskFirst.targetRef },
    );
    assert.equal(completeShadow.shadowDivergences, 0);
    assert.equal(
      await prisma.operationalWorkItem.count(),
      completeShadowBefore,
    );
    shadow.push(completeShadow);
    assert.equal(new Set(shadow.map((row) => row.actionClass)).size, 6);

    const completeRequest = await planner.buildTaskComplete(
      primary.tenantId,
      primary.assigneeId,
      { sourceIntentRef: 'execute-complete', workItemId: taskFirst.targetRef },
      'execute',
    );
    const completeFirst = await executor.execute(completeRequest);
    const completeRetryRequest = await planner.buildTaskComplete(
      primary.tenantId,
      primary.assigneeId,
      { sourceIntentRef: 'execute-complete', workItemId: taskFirst.targetRef },
      'execute',
    );
    const completeRetry = await executor.execute(completeRetryRequest);
    assert.equal(
      completeFirst.actionExecutionId,
      completeRetry.actionExecutionId,
    );

    const supportRequest = await planner.buildAdministratorContact(
      primary.tenantId,
      primary.clientId,
      {
        sourceIntentRef: 'execute-support',
        reason: 'Need a call from the team.',
      },
      'execute',
    );
    const support = await executor.execute(supportRequest);
    const supportRow = await prisma.operationalWorkItem.findUniqueOrThrow({
      where: {
        id_tenantId: { id: support.targetRef, tenantId: primary.tenantId },
      },
    });
    assert.equal(supportRow.assigneeUserId, primary.ownerId);
    assert.equal(supportRow.kind, 'support_request');

    const concurrentRequest = await planner.buildTaskCreate(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-task-concurrent',
        assigneeUserId: primary.assigneeId,
        title: 'Concurrent task',
        bodyText: 'One logical work item.',
      },
      'execute',
    );
    const concurrent = await Promise.all([
      executor.execute(concurrentRequest),
      executor.execute(concurrentRequest),
    ]);
    assert.equal(
      concurrent[0].actionExecutionId,
      concurrent[1].actionExecutionId,
    );
    assert.equal(
      await prisma.operationalWorkItem.count({
        where: { tenantId: primary.tenantId, title: 'Concurrent task' },
      }),
      1,
    );

    await rejects(
      () =>
        planner.planTaskComplete(foreign.tenantId, foreign.assigneeId, {
          sourceIntentRef: 'cross-tenant-complete',
          workItemId: taskFirst.targetRef,
        }),
      'cross-tenant work-item completion must fail closed',
    );
    await rejects(
      () =>
        planner.planAppointmentNotifications(
          primary.tenantId,
          primary.clientId,
          {
            sourceIntentRef: 'forged-settings-authority',
            enabled: false,
            leadTimesMinutes: [120],
          },
        ),
      'client role must not mutate tenant-wide notification policy',
    );
    const forged = structuredClone(financeRequest);
    (forged.input as Record<string, unknown>).actorRole = 'tenant_admin';
    await rejects(
      () => executor.execute(forged),
      'forged actor authority must be rejected by canonical normalization',
    );

    const counts = {
      actionClasses: new Set(
        (
          await prisma.actionExecution.findMany({
            where: {
              tenantId: primary.tenantId,
              actionClass: {
                in: [
                  'update_assistant_preferences',
                  'update_finance_dashboard_preferences',
                  'update_appointment_notification_settings',
                  'create_operational_task',
                  'complete_operational_task',
                  'request_administrator_contact',
                ],
              },
            },
            select: { actionClass: true },
          })
        ).map((row) => row.actionClass),
      ).size,
      targetMutations: await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId },
      }),
      workItems: await prisma.operationalWorkItem.count({
        where: { tenantId: primary.tenantId },
      }),
      inboxItems: await prisma.inboxItem.count({
        where: { tenantId: primary.tenantId },
      }),
      unknownExecutions: await prisma.actionExecution.count({
        where: { tenantId: primary.tenantId, state: 'UNKNOWN' },
      }),
    };
    assert.equal(counts.actionClasses, 6);
    assert.equal(counts.targetMutations, 7);
    assert.equal(counts.workItems, 3);
    assert.equal(
      counts.inboxItems,
      0,
      'Package 2 projection must remain separate',
    );
    assert.equal(counts.unknownExecutions, 0);

    console.log(
      JSON.stringify(
        {
          package5Wave1ShadowActionClasses: '6/6',
          shadowDivergences: 0,
          executableActionClasses: '6/6',
          settingMutationOneTime: true,
          taskCreateCompleteOneTime: true,
          concurrentDuplicateWorkItemPossible: false,
          tenantIsolation: true,
          serverDerivedAuthority: true,
          package2ProjectionPreserved: true,
          unknownRequired: false,
          providerWrites: 0,
          productionMutations: 0,
          counts,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
