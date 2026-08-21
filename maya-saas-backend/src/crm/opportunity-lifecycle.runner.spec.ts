import type { ConfigService } from '@nestjs/config';

import { DOMAIN_EVENT_TYPE } from '../domain';
import { OPPORTUNITY_TYPE } from '../opportunities/opportunity.contract';
import type {
  OpportunityCurrentStateReconcileResult,
  OpportunityLifecycleRepository,
  OpportunityLifecycleSnapshot,
} from '../opportunities/opportunity.lifecycle';
import { opportunityShadowAppointmentRef } from '../opportunities/opportunity.shadow';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CrmService } from './crm.service';
import { OpportunityLifecycleRunner } from './opportunity-lifecycle.runner';

const TENANT_ID = 'tenant-1';
const AS_OF = new Date('2035-05-10T08:30:00.000Z');
const WATCH_STARTED_AT = new Date('2035-05-10T07:00:00.000Z');
const BLOCKED_START = new Date('2035-05-10T09:00:00.000Z');
const BLOCKED_END = new Date('2035-05-10T10:00:00.000Z');

type Mocked<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

const EMPTY_SNAPSHOT: OpportunityLifecycleSnapshot = {
  opportunities: {
    total: 0,
    active: 0,
    resolved: 0,
    expired: 0,
    superseded: 0,
  },
  agentTasks: { total: 0, current: 0, invalidated: 0 },
};

const EMPTY_RECONCILE: OpportunityCurrentStateReconcileResult = {
  persistence: [],
  resolved: 0,
  expired: 0,
  staleTasksInvalidated: 0,
  duplicateAttemptsCollapsed: 0,
};

function event() {
  return {
    id: 'event-1',
    tenantId: TENANT_ID,
    entityType: 'appointment',
    entityId: 'appointment-1',
    type: DOMAIN_EVENT_TYPE.appointmentRemoved,
    occurredAt: new Date('2035-05-10T08:00:00.000Z'),
    receivedAt: new Date('2035-05-10T08:01:00.000Z'),
    ingestionMethod: 'reconciliation',
    observation: 'after_watch_started',
  };
}

function appointment(status = 'canceled') {
  return {
    id: 'appointment-1',
    tenantId: TENANT_ID,
    branchId: 'branch-1',
    staffExternalId: 'staff-1',
    serviceIds: ['service-1'],
    blockedStartAt: BLOCKED_START,
    blockedEndAt: BLOCKED_END,
    status,
  };
}

function build(
  overrides: {
    enabled?: boolean;
    events?: ReturnType<typeof event>[];
    appointments?: ReturnType<typeof appointment>[];
    activeOpportunities?: Array<{
      semanticKey: string;
      affectedEntityRef: string | null;
    }>;
    schedule?: {
      staff_id: string;
      date: string;
      is_working: boolean;
      slots: Array<{ from: string; to: string }>;
      revision: string;
    };
    availableSlots?: Array<{
      start: string;
      end: string;
      staff_id: string;
      branch_id?: string | null;
    }>;
    scheduleError?: Error;
    before?: OpportunityLifecycleSnapshot;
    after?: OpportunityLifecycleSnapshot;
    staleBefore?: number;
    staleAfter?: number;
    reconcile?: OpportunityCurrentStateReconcileResult;
  } = {},
) {
  const events = overrides.events ?? [event()];
  const appointments = overrides.appointments ?? [appointment()];
  const activeOpportunities = overrides.activeOpportunities ?? [];
  const domainEventFindMany = jest.fn().mockResolvedValue(events);
  const appointmentFindMany = jest.fn().mockResolvedValue(appointments);
  const opportunityFindMany = jest.fn().mockResolvedValue(activeOpportunities);
  const prisma = {
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
    },
    crmIntegration: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ watchStartedAt: WATCH_STARTED_AT }),
    },
    domainEvent: { findMany: domainEventFindMany },
    appointment: { findMany: appointmentFindMany },
    opportunity: { findMany: opportunityFindMany },
  } as unknown as PrismaService;

  const getStaffScheduleDay = overrides.scheduleError
    ? jest.fn().mockRejectedValue(overrides.scheduleError)
    : jest.fn().mockResolvedValue(
        overrides.schedule ?? {
          staff_id: 'staff-1',
          date: '2035-05-10',
          is_working: true,
          slots: [{ from: '12:00', to: '13:00' }],
          revision: 'schedule-revision-1',
        },
      );
  const getAvailableSlots = jest.fn().mockResolvedValue(
    overrides.availableSlots ?? [
      {
        start: BLOCKED_START.toISOString(),
        end: BLOCKED_END.toISOString(),
        staff_id: 'staff-1',
        branch_id: 'branch-1',
      },
    ],
  );
  const crm = {
    getStaffScheduleDay,
    getAvailableSlots,
  } as unknown as CrmService;

  const snapshots = [
    overrides.before ?? EMPTY_SNAPSHOT,
    overrides.after ?? EMPTY_SNAPSHOT,
  ];
  const snapshot = jest.fn() as Mocked<
    OpportunityLifecycleRepository['snapshot']
  >;
  snapshot.mockImplementation(() =>
    Promise.resolve(snapshots.shift() ?? EMPTY_SNAPSHOT),
  );
  const reconcileCurrentProjection = jest.fn() as Mocked<
    OpportunityLifecycleRepository['reconcileCurrentProjection']
  >;
  reconcileCurrentProjection.mockResolvedValue(
    overrides.reconcile ?? EMPTY_RECONCILE,
  );
  const staleCounts = [overrides.staleBefore ?? 0, overrides.staleAfter ?? 0];
  const countStaleCurrentTasks = jest.fn() as Mocked<
    OpportunityLifecycleRepository['countStaleCurrentTasks']
  >;
  countStaleCurrentTasks.mockImplementation(() =>
    Promise.resolve(staleCounts.shift() ?? 0),
  );
  const lifecycle = {
    snapshot,
    countStaleCurrentTasks,
    reconcileCurrentProjection,
  } as unknown as OpportunityLifecycleRepository;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'OPPORTUNITY_LIFECYCLE_ENABLED') {
        return overrides.enabled === false ? 'false' : 'true';
      }
      if (key === 'OPPORTUNITY_LIFECYCLE_CUTOVER_AT') {
        return '2035-05-10T06:00:00.000Z';
      }
      return undefined;
    }),
  } as unknown as ConfigService;
  const tenantContext = new TenantContextService();
  const runner = new OpportunityLifecycleRunner(
    prisma,
    tenantContext,
    crm,
    config,
    lifecycle,
  );
  const run = (sourceCompleteness: 'complete' | 'partial' = 'complete') =>
    tenantContext.runAsSystemTenant(TENANT_ID, () =>
      runner.run({ tenantId: TENANT_ID, asOf: AS_OF, sourceCompleteness }),
    );

  return {
    run,
    snapshot,
    countStaleCurrentTasks,
    reconcileCurrentProjection,
    domainEventFindMany,
    appointmentFindMany,
    opportunityFindMany,
    getStaffScheduleDay: getStaffScheduleDay as Mocked<
      CrmService['getStaffScheduleDay']
    >,
    getAvailableSlots: getAvailableSlots as Mocked<
      CrmService['getAvailableSlots']
    >,
  };
}

describe('OpportunityLifecycleRunner', () => {
  it('is an explicit rollout switch and performs no source reads when disabled', async () => {
    const built = build({ enabled: false });

    await expect(built.run()).resolves.toMatchObject({
      status: 'disabled',
      actionIntentsExecuted: 0,
      externalSideEffects: 0,
    });

    expect(built.domainEventFindMany).not.toHaveBeenCalled();
    expect(built.reconcileCurrentProjection).not.toHaveBeenCalled();
  });

  it('detects Occupancy only from complete current schedule and provider availability', async () => {
    const built = build({
      after: {
        opportunities: {
          total: 1,
          active: 1,
          resolved: 0,
          expired: 0,
          superseded: 0,
        },
        agentTasks: { total: 1, current: 1, invalidated: 0 },
      },
    });

    const result = await built.run();

    expect(result).toMatchObject({
      status: 'ran',
      completeness: 'complete',
      detectedNow: 1,
      durableActiveAfter: 1,
      currentTasks: 1,
      actionIntentsExecuted: 0,
      externalSideEffects: 0,
    });
    expect(built.reconcileCurrentProjection).toHaveBeenCalledTimes(1);
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.projection.opportunities).toHaveLength(1);
    expect(input.projection.opportunities[0]?.type).toBe(
      OPPORTUNITY_TYPE.appointmentCancellationRecovery,
    );
    expect(input.projection.agentTasks).toHaveLength(1);
    expect(input.projection.metrics.executed).toBe(0);
    expect(input.currentState).toMatchObject({
      completeness: 'complete',
      opportunityTypes: [OPPORTUNITY_TYPE.appointmentCancellationRecovery],
      resolutions: [],
    });
  });

  it('does not invent capacity when the provider has no matching available slot', async () => {
    const built = build({ availableSlots: [] });

    const result = await built.run();

    expect(result.detectedNow).toBe(0);
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.projection.opportunities).toHaveLength(0);
    expect(input.projection.agentTasks).toHaveLength(0);
    expect(input.projection.actionIntents).toHaveLength(0);
  });

  it('partial source may detect present evidence but cannot resolve an absent durable condition', async () => {
    const activeRef = opportunityShadowAppointmentRef(
      TENANT_ID,
      'appointment-1',
    );
    const built = build({
      appointments: [appointment('confirmed')],
      activeOpportunities: [
        { semanticKey: 'a'.repeat(64), affectedEntityRef: activeRef },
      ],
    });

    const result = await built.run('partial');

    expect(result.completeness).toBe('partial');
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.currentState.resolutions).toEqual([]);
  });

  it('provider failure is explicit and cannot resolve an existing Opportunity', async () => {
    const activeRef = opportunityShadowAppointmentRef(
      TENANT_ID,
      'appointment-1',
    );
    const built = build({
      scheduleError: new Error('provider unavailable'),
      activeOpportunities: [
        { semanticKey: 'b'.repeat(64), affectedEntityRef: activeRef },
      ],
    });

    const result = await built.run();

    expect(result).toMatchObject({
      completeness: 'provider_failure',
      detectedNow: 0,
      actionIntentsExecuted: 0,
      externalSideEffects: 0,
    });
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.currentState.resolutions).toEqual([]);
  });

  it('complete canonical evidence derives resolution proof when a condition disappears', async () => {
    const activeRef = opportunityShadowAppointmentRef(
      TENANT_ID,
      'appointment-1',
    );
    const built = build({
      appointments: [appointment('confirmed')],
      activeOpportunities: [
        { semanticKey: 'c'.repeat(64), affectedEntityRef: activeRef },
      ],
      before: {
        opportunities: {
          total: 1,
          active: 1,
          resolved: 0,
          expired: 0,
          superseded: 0,
        },
        agentTasks: { total: 1, current: 1, invalidated: 0 },
      },
      after: {
        opportunities: {
          total: 1,
          active: 0,
          resolved: 1,
          expired: 0,
          superseded: 0,
        },
        agentTasks: { total: 1, current: 0, invalidated: 1 },
      },
      reconcile: { ...EMPTY_RECONCILE, resolved: 1 },
    });

    const result = await built.run();

    expect(result.resolved).toBe(1);
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.currentState.resolutions).toHaveLength(1);
    expect(input.currentState.resolutions[0]).toMatchObject({
      semanticKey: 'c'.repeat(64),
      proof: {
        reasonCode: 'canonical_appointment_no_longer_removed',
      },
    });
    expect(input.currentState.resolutions[0]?.proof.evidence[0]).toMatchObject({
      completeness: 'complete',
      capability: 'occupancy.capacity.read',
    });
  });

  it('reconciles an existing durable condition without replaying a pre-cutover event', async () => {
    const activeRef = opportunityShadowAppointmentRef(
      TENANT_ID,
      'appointment-1',
    );
    const built = build({
      events: [],
      appointments: [appointment('confirmed')],
      activeOpportunities: [
        { semanticKey: 'd'.repeat(64), affectedEntityRef: activeRef },
      ],
    });

    const result = await built.run();

    expect(result).toMatchObject({
      completeness: 'complete',
      detectedNow: 0,
      actionIntentsExecuted: 0,
      externalSideEffects: 0,
    });
    expect(built.appointmentFindMany).toHaveBeenCalledTimes(2);
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.projection.opportunities).toEqual([]);
    expect(input.currentState.resolutions).toHaveLength(1);
    expect(input.currentState.resolutions[0]).toMatchObject({
      semanticKey: 'd'.repeat(64),
      proof: {
        reasonCode: 'canonical_appointment_no_longer_removed',
      },
    });
  });

  it('preserves an existing durable condition when current capacity remains present without a post-cutover event', async () => {
    const activeRef = opportunityShadowAppointmentRef(
      TENANT_ID,
      'appointment-1',
    );
    const built = build({
      events: [],
      activeOpportunities: [
        { semanticKey: 'e'.repeat(64), affectedEntityRef: activeRef },
      ],
    });

    const result = await built.run();

    expect(result).toMatchObject({ completeness: 'complete', detectedNow: 0 });
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.projection.opportunities).toEqual([]);
    expect(input.currentState.resolutions).toEqual([]);
    expect(built.getStaffScheduleDay).toHaveBeenCalledTimes(1);
    expect(built.getAvailableSlots).toHaveBeenCalledTimes(1);
  });

  it('does not resolve an existing pre-cutover condition when its provider read fails', async () => {
    const activeRef = opportunityShadowAppointmentRef(
      TENANT_ID,
      'appointment-1',
    );
    const built = build({
      events: [],
      scheduleError: new Error('provider unavailable'),
      activeOpportunities: [
        { semanticKey: 'f'.repeat(64), affectedEntityRef: activeRef },
      ],
    });

    const result = await built.run();

    expect(result).toMatchObject({
      completeness: 'provider_failure',
      detectedNow: 0,
    });
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.currentState.resolutions).toEqual([]);
  });

  it('never scans current appointments to create an Opportunity without a post-cutover event or an active durable condition', async () => {
    const built = build({ events: [] });

    const result = await built.run();

    expect(result.detectedNow).toBe(0);
    expect(built.appointmentFindMany).not.toHaveBeenCalled();
    const input = built.reconcileCurrentProjection.mock.calls[0][0];
    expect(input.projection.opportunities).toEqual([]);
    expect(input.currentState.resolutions).toEqual([]);
  });

  it('reports lifecycle transitions as run deltas and stale tasks as current invariant failures', async () => {
    const built = build({
      before: {
        opportunities: {
          total: 12,
          active: 3,
          resolved: 4,
          expired: 3,
          superseded: 2,
        },
        agentTasks: { total: 12, current: 3, invalidated: 9 },
      },
      after: {
        opportunities: {
          total: 13,
          active: 2,
          resolved: 5,
          expired: 3,
          superseded: 3,
        },
        agentTasks: { total: 13, current: 2, invalidated: 11 },
      },
      staleBefore: 1,
      staleAfter: 0,
      reconcile: {
        ...EMPTY_RECONCILE,
        resolved: 1,
        staleTasksInvalidated: 1,
      },
    });

    await expect(built.run()).resolves.toMatchObject({
      resolved: 1,
      expired: 0,
      superseded: 1,
      staleTasks: 0,
    });
    expect(built.countStaleCurrentTasks).toHaveBeenCalledTimes(2);
  });
});
