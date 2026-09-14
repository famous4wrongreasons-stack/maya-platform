/* eslint-disable @typescript-eslint/unbound-method -- Jest assertions inspect mock calls, never invoke detached Prisma methods. */
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  normalizeMeasurement,
  validateMeasurementResult,
  currentMeasurementOutcomes,
  measurementHash,
} from './measurement.contract';
import { MeasurementOutcomesReader } from './measurement.outcomes';
import { readOutcomeFunnel } from './measurement.outcomes.funnel';
import {
  exactOutcomeAttribution,
  exactCapacityOutcome,
  outcomeBound,
  outcomeBaseMetrics,
  OutcomeAppointment,
  OutcomeExecution,
  OutcomeAttempt,
  OutcomeBinding,
  OutcomeSourceBoundError,
} from './measurement.outcomes.facts';
import {
  opportunityShadowAppointmentRef,
  opportunityShadowIntervalRef,
} from '../opportunities/opportunity.shadow';

const now = new Date('2026-09-08T12:00:00Z');
const before = new Date('2026-09-01T12:00:00Z');
const appointment = (): OutcomeAppointment => ({
  id: 'appointment-action:e',
  tenantId: 't',
  mayaClientId: 'c',
  source: 'internal',
  crmProvider: null,
  crmExternalId: null,
  status: 'confirmed',
  attendance: null,
  branchId: 'branch',
  staffId: 'staff',
  staffExternalId: 's',
  startAt: before,
  endAt: new Date('2026-09-01T13:00:00Z'),
  blockedStartAt: before,
  blockedEndAt: new Date('2026-09-01T13:00:00Z'),
  totalPriceKopecks: 0,
  currency: 'RUB',
  createdAt: before,
  updatedAt: before,
});
const execution = (): OutcomeExecution => ({
  id: 'e',
  tenantId: 't',
  capability: 'crm.appointment.create.v1',
  sourceType: 'authenticated_request',
  agentTaskId: null,
  dryRun: false,
  policyDecision: 'ALLOW',
  approvalDecision: 'NOT_REQUIRED',
  state: 'SUCCEEDED',
  bookingIntentContract: 'maya.client-appointment-create-intent/1',
  bookingIntentHash: 'a'.repeat(64),
  normalizedInputContract: 'normalized/1',
  normalizedInputHash: 'b'.repeat(64),
  hasInput: true,
  createdAt: before,
  finalizedAt: before,
  updatedAt: before,
});
const attempt = (): OutcomeAttempt => ({
  id: 'a',
  tenantId: 't',
  actionExecutionId: 'e',
  kind: 'EXECUTION',
  state: 'SUCCEEDED',
  externalDispatchState: 'ACKNOWLEDGED',
  startedAt: before,
  finishedAt: before,
  safeResultJson: {
    externalId: 'appointment-action:e',
    status: 'confirmed',
    totalPrice: 100.25,
  },
});
const binding = (): OutcomeBinding => ({
  tenantId: 't',
  clientId: 'c',
  actionExecutionId: 'e',
  idempotencyScope: 'appointments.client.create.v1',
  requestIdempotencyKeyHash: 'd'.repeat(64),
  createdAt: before,
});
const trusted = () =>
  new Map([
    [
      'e',
      {
        clientId: 'c',
        creationMode: 'client',
        allowBusy: false,
        notifyBySmsHours: 0,
      },
    ],
  ]);
const attributionInput = () => ({
  appointment: appointment(),
  executions: [execution()],
  attempts: [attempt()],
  bindings: [binding()],
  trustedInputs: trusted(),
  asOf: now,
});
const intent = (
  kind: 'appointment_outcome' | 'execution_funnel' = 'appointment_outcome',
) =>
  normalizeMeasurement({
    kind,
    ...(kind === 'appointment_outcome'
      ? { clientId: 'c', appointmentId: 'appointment-action:e' }
      : {}),
    periodFrom: new Date('2026-09-01'),
    periodTo: new Date('2026-10-01'),
    asOf: now,
    timezone: 'UTC',
    scope: {
      version: 1,
      capabilityKey: 'measurement.read',
      dimensions: {},
      sourceQuery: {},
      branchIds: [],
    },
  });
function database(data: Record<string, unknown[]> = {}) {
  const db = Object.fromEntries(
    [
      'opportunity',
      'agentTask',
      'actionExecution',
      'actionAttempt',
      'actionTargetMutation',
      'marketingCampaign',
      'marketingCampaignRecipient',
      'marketingDeliveryAttempt',
      'recoveryConversion',
      'recoveryTouchpoint',
      'domainEvent',
      'actionExecutionIdempotencyBinding',
    ].map((name) => [
      name,
      {
        findMany: jest.fn().mockResolvedValue(data[name] ?? []),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    ]),
  );
  return {
    ...db,
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: 'active', defaultTimezone: 'UTC' }),
    },
    appointment: {
      findFirst: jest.fn().mockResolvedValue(appointment()),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe('P03 exact outcome attribution', () => {
  it('credits direct successful B31 receipt once, independent of User or contact fields', () => {
    expect(exactOutcomeAttribution(attributionInput())).toEqual({
      attributionStatus: 'ATTRIBUTED',
      creditedExecutionId: 'e',
      creditedAttemptId: 'a',
    });
  });
  it.each(['UNKNOWN', 'FAILED', 'PENDING_APPROVAL', 'NOT_EXECUTED'])(
    'does not credit execution %s',
    (state) => {
      const x = attributionInput();
      x.executions[0].state = state;
      expect(exactOutcomeAttribution(x).attributionStatus).toBe('UNATTRIBUTED');
    },
  );
  it.each(['DENY', 'SHADOW_ONLY'])('does not credit policy %s', (state) => {
    const x = attributionInput();
    x.executions[0].policyDecision = state;
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
  });
  it('never credits dry-run or nonapproved execution', () => {
    const x = attributionInput();
    x.executions[0].dryRun = true;
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('UNATTRIBUTED');
    x.executions[0].dryRun = false;
    x.executions[0].approvalDecision = 'REJECTED';
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('UNATTRIBUTED');
  });
  it('reconciliation success is not a direct effect receipt', () => {
    const x = attributionInput();
    x.attempts[0].kind = 'RECONCILIATION';
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('UNATTRIBUTED');
  });
  it('requires finished acknowledged receipt before business cutoff', () => {
    const x = attributionInput();
    x.attempts[0].externalDispatchState = 'MAY_HAVE_CROSSED';
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('UNATTRIBUTED');
    x.attempts[0].externalDispatchState = 'ACKNOWLEDGED';
    x.attempts[0].finishedAt = new Date('2027-01-01');
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('UNATTRIBUTED');
  });
  it('a second competing successful attempt is ambiguous, not last-touch', () => {
    const x = attributionInput();
    x.attempts.push({ ...attempt(), id: 'a2' });
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('AMBIGUOUS');
  });
  it('repeated references to one exact receipt do not duplicate credit', () => {
    const x = attributionInput();
    x.attempts.push(attempt());
    x.bindings.push(binding());
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('ATTRIBUTED');
  });
  it('denies cross-tenant attempt, wrong Client and mismatched immutable binding', () => {
    const x = attributionInput();
    x.attempts[0].tenantId = 'other';
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
    x.attempts[0].tenantId = 't';
    x.bindings[0].clientId = 'other';
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
    x.bindings[0].clientId = 'c';
    x.appointment.mayaClientId = 'other';
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
  });
  it('external-ID equality and legacy bridge source are uncredited', () => {
    const x = attributionInput();
    x.appointment.source = 'external';
    x.appointment.crmExternalId = x.appointment.id;
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
    x.appointment.source = 'internal';
    x.executions[0].sourceType = 'legacy_bridge';
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
  });
  it('missing retained input or booking snapshot cannot masquerade as an exact binding', () => {
    const x = attributionInput();
    x.trustedInputs.clear();
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
    x.trustedInputs = trusted();
    x.executions[0].bookingIntentHash = null;
    expect(exactOutcomeAttribution(x).creditedExecutionId).toBeNull();
  });
  it('late cancellation changes current value while preserving historical source lineage', () => {
    const x = attributionInput();
    x.appointment.status = 'canceled';
    expect(exactOutcomeAttribution(x).attributionStatus).toBe('ATTRIBUTED');
    const snapshots = [
      { tenantId: 't', identityHash: 'i', revision: 1, value: true },
      { tenantId: 't', identityHash: 'i', revision: 2, value: false },
    ];
    expect(currentMeasurementOutcomes(snapshots)).toEqual([snapshots[1]]);
    expect(snapshots[0].value).toBe(true);
  });
  it('preserves P01 missing-vs-zero and money bases', () => {
    const a = appointment();
    const metrics = outcomeBaseMetrics(a);
    expect(metrics.find((m) => m.key === 'booked_value')?.value).toBe('0');
    expect(metrics.find((m) => m.key === 'attendance')?.state).toBe(
      'NOT_MEASURED',
    );
    expect(metrics.find((m) => m.key === 'confirmed_refunds')?.basis).toBe(
      'confirmed_refund',
    );
    a.totalPriceKopecks = null;
    expect(
      outcomeBaseMetrics(a).find((m) => m.key === 'booked_value')?.value,
    ).toBeNull();
  });
});

describe('P03 exact capacity', () => {
  function capacity() {
    const a = { ...appointment(), id: 'original' };
    const outcome = appointment();
    const opportunity = {
      id: 'o',
      tenantId: 't',
      type: 'appointment_cancellation_recovery',
      affectedEntityKind: 'appointment',
      affectedEntityRef: opportunityShadowAppointmentRef('t', a.id),
      evidenceObservedAt: before,
      evidenceRefsJson: {
        contract: 'maya.opportunity-evidence-refs/1',
        items: [
          {
            owner: 'occupancy_capacity',
            capability: 'occupancy.capacity.read',
            completeness: 'complete',
            ref: opportunityShadowIntervalRef({
              tenantId: 't',
              appointmentId: a.id,
              blockedStartAt: a.blockedStartAt!.toISOString(),
              blockedEndAt: a.blockedEndAt!.toISOString(),
            }),
          },
          {
            owner: 'occupancy_capacity',
            capability: 'occupancy.schedule.read',
            completeness: 'complete',
            ref: 'schedule_frozen',
          },
          {
            owner: 'watch_domain_event',
            capability: 'watch.domain-event.read',
            completeness: 'complete',
            ref: 'event_frozen',
          },
        ],
      },
    };
    return { outcome, opportunity, originals: [a] };
  }
  it('proves exact frozen interval and distinct attendance', () => {
    expect(exactCapacityOutcome(capacity())).toMatchObject({
      filled: true,
      attended: null,
      originalId: 'original',
    });
  });
  it('does not infer original capacity from a flag or overlap', () => {
    const x = capacity();
    x.opportunity.evidenceRefsJson.items.pop();
    expect(exactCapacityOutcome(x).filled).toBeNull();
  });
  it('original interval correction invalidates the historical ref', () => {
    const x = capacity();
    x.originals[0].blockedEndAt = now;
    expect(exactCapacityOutcome(x).filled).toBeNull();
  });
  it('partial occupation is not a fully filled original capacity', () => {
    const x = capacity();
    x.outcome.blockedEndAt = new Date('2026-09-01T12:30:00Z');
    expect(exactCapacityOutcome(x).filled).toBe(false);
  });
  it('late cancellation removes current filled capacity', () => {
    const x = capacity();
    x.outcome.status = 'canceled';
    expect(exactCapacityOutcome(x).filled).toBe(false);
  });
  it('wrong staff or branch cannot broaden original capacity scope', () => {
    const x = capacity();
    x.outcome.staffId = 'other';
    expect(exactCapacityOutcome(x).filled).toBeNull();
    x.outcome.staffId = 'staff';
    x.outcome.branchId = 'other';
    expect(exactCapacityOutcome(x).filled).toBeNull();
  });
});

describe('P03 source reader and funnel', () => {
  it('exact reader normalizes decimal owner receipt without storing payload or contacts', async () => {
    const db = database({
      actionExecution: [
        { ...execution(), normalizedInputEncrypted: 'owner-only' },
      ],
      actionAttempt: [attempt()],
      actionExecutionIdempotencyBinding: [binding()],
    });
    const ctx = new TenantContextService();
    const decode = jest.fn().mockResolvedValue(trusted().get('e'));
    const result = await ctx.runAsSystemTenant('t', () =>
      new MeasurementOutcomesReader(db, ctx, {
        readTrustedNormalizedInput: decode,
      }).read('t', intent(), db),
    );
    expect(result.attributionStatus).toBe('ATTRIBUTED');
    validateMeasurementResult(result, 't');
    expect(JSON.stringify(result)).not.toMatch(
      /owner-only|totalPrice|safeResultJson|client-authority/,
    );
    expect(decode).toHaveBeenCalledWith('t', 'e', db);
  });
  it('known input corruption is safely uncredited; infrastructure failure is not hidden', async () => {
    const db = database({
      actionExecution: [
        { ...execution(), normalizedInputEncrypted: 'owner-only' },
      ],
      actionAttempt: [attempt()],
      actionExecutionIdempotencyBinding: [binding()],
    });
    const ctx = new TenantContextService();
    const decode = jest
      .fn()
      .mockRejectedValue({ code: 'ACTION_CONTRACT_INVALID' });
    const reader = new MeasurementOutcomesReader(db, ctx, {
      readTrustedNormalizedInput: decode,
    });
    const result = await ctx.runAsSystemTenant('t', () =>
      reader.read('t', intent(), db),
    );
    expect(result.attributionStatus).toBe('UNATTRIBUTED');
    expect(result.reasons).toContain('action_input_integrity_unavailable');
    decode.mockRejectedValue(Error('database unavailable'));
    await expect(
      ctx.runAsSystemTenant('t', () => reader.read('t', intent(), db)),
    ).rejects.toThrow('database unavailable');
  });
  it('exceeding a source cap returns empty UNAVAILABLE instead of truncated facts or PENDING loop', async () => {
    const db = database({ opportunity: Array(1001).fill({}) });
    const ctx = new TenantContextService();
    const reader = new MeasurementOutcomesReader(db, ctx, {
      readTrustedNormalizedInput: jest.fn(),
    });
    const result = await ctx.runAsSystemTenant('t', () =>
      reader.read('t', intent('execution_funnel'), db),
    );
    expect(result).toMatchObject({
      metrics: [],
      sources: [],
      completeness: 'UNAVAILABLE',
      attributionStatus: 'NOT_APPLICABLE',
    });
    expect(() => outcomeBound(Array<number>(1001).fill(0))).toThrow(
      OutcomeSourceBoundError,
    );
  });
  it('requires system tenant and rejects unsupported restricted funnel scope', async () => {
    const db = database();
    const ctx = new TenantContextService();
    const reader = new MeasurementOutcomesReader(db, ctx, {
      readTrustedNormalizedInput: jest.fn(),
    });
    await expect(reader.authorize('t', intent())).rejects.toThrow();
    await expect(
      ctx.runAsSystemTenant('other', () => reader.authorize('t', intent())),
    ).rejects.toThrow();
    await expect(
      ctx.runAsSystemTenant('t', () =>
        reader.authorize('t', { ...intent('execution_funnel'), staffId: 's' }),
      ),
    ).rejects.toThrow('scope_not_supported');
  });
  it('historical receipt authority excludes mutable Appointment Client association', async () => {
    const db = database();
    const ctx = new TenantContextService();
    const reader = new MeasurementOutcomesReader(db, ctx, {
      readTrustedNormalizedInput: jest.fn(),
    });
    await ctx.runAsSystemTenant('t', () => reader.authorize('t', intent(), db));
    expect(db.appointment.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't', id: 'appointment-action:e' },
      select: { id: true },
    });
  });
  it('empty verified cohorts report zero counts and unknown ratios/read receipts', async () => {
    const db = database();
    const result = await readOutcomeFunnel(
      db,
      't',
      intent('execution_funnel'),
      now,
    );
    validateMeasurementResult(result, 't');
    expect(
      result.metrics.find((m) => m.key === 'action_admitted_count')?.value,
    ).toBe('0');
    expect(
      result.metrics.find((m) => m.key === 'recipient_delivery_rate')?.state,
    ).toBe('NOT_MEASURED');
    expect(
      result.metrics.find((m) => m.key === 'recipient_read_count')?.value,
    ).toBeNull();
  });
  it('tenant cohort query is half-open and child attempts stay under exact admitted executions', async () => {
    const db = database({ actionExecution: [execution()] });
    await readOutcomeFunnel(db, 't', intent('execution_funnel'), now);
    expect(db.actionExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 't',
          createdAt: { gte: new Date('2026-09-01'), lt: now },
        },
      }),
    );
    expect(db.actionAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't', actionExecutionId: { in: ['e'] } },
        take: 1001,
      }),
    );
  });
  it('B35 multiple transport slots count once per logical Client and acceptance never implies delivery', async () => {
    const db = database();
    (db.marketingCampaign.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'bulk',
          lifecycleVersion: 2,
          actionExecutionId: 'e',
          updatedAt: before,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'slot1', parentRecipientId: 'logical', updatedAt: before },
        { id: 'slot2', parentRecipientId: 'logical', updatedAt: before },
      ]);
    (db.marketingCampaignRecipient.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'logical',
          campaignId: 'bulk',
          lifecycleVersion: 2,
          clientId: 'c',
          deliveryState: null,
          updatedAt: before,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'transport1',
          campaignId: 'slot1',
          lifecycleVersion: 1,
          deliveryState: 'ACCEPTED',
          updatedAt: before,
        },
        {
          id: 'transport2',
          campaignId: 'slot2',
          lifecycleVersion: 1,
          deliveryState: 'ACCEPTED',
          updatedAt: before,
        },
      ]);
    const result = await readOutcomeFunnel(
      db,
      't',
      intent('execution_funnel'),
      now,
    );
    validateMeasurementResult(result, 't');
    const v = (key: string) => result.metrics.find((m) => m.key === key)?.value;
    expect(v('root_recipient_count')).toBe('1');
    expect(v('transport_recipient_count')).toBe('2');
    expect(v('root_recipient_accepted_or_delivered_count')).toBe('1');
    expect(v('root_recipient_delivered_count')).toBe('0');
    expect(v('recipient_acceptance_rate_denominator')).toBe('1');
  });
  it('UNKNOWN remains one logical action with separate execution and reconciliation attempts', async () => {
    const attemptFields = { ...attempt(), safeResultJson: null };
    const db = database({
      actionExecution: [{ ...execution(), state: 'UNKNOWN' }],
      actionAttempt: [
        attemptFields,
        { ...attemptFields, id: 'r', kind: 'RECONCILIATION', state: 'UNKNOWN' },
      ],
    });
    const result = await readOutcomeFunnel(
      db,
      't',
      intent('execution_funnel'),
      now,
    );
    const v = (key: string) => result.metrics.find((m) => m.key === key)?.value;
    expect(v('action_admitted_count')).toBe('1');
    expect(v('action_unknown_count')).toBe('1');
    expect(v('execution_attempt_count')).toBe('1');
    expect(v('reconciliation_attempt_count')).toBe('1');
    expect(v('action_real_success_count')).toBe('0');
    expect(v('proposal_count')).toBeNull();
  });
  it('source state receipt changes after owner correction; no source copies are retained', async () => {
    const db = database({
      recoveryConversion: [
        {
          id: 'r',
          tenantId: 't',
          touchpointId: 'tp',
          bookedAt: before,
          status: 'booked',
          filledWindow: true,
          updatedAt: before,
        },
      ],
      recoveryTouchpoint: [
        {
          id: 'tp',
          tenantId: 't',
          occurredAt: before,
          attributionWindowDays: 30,
          kind: 'recovery',
          channel: 'sms',
          status: 'sent',
        },
      ],
    });
    const first = await readOutcomeFunnel(
      db,
      't',
      intent('execution_funnel'),
      now,
    );
    (db.recoveryConversion.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r',
        tenantId: 't',
        touchpointId: 'tp',
        bookedAt: before,
        status: 'canceled',
        filledWindow: true,
        updatedAt: now,
      },
    ]);
    const second = await readOutcomeFunnel(
      db,
      't',
      intent('execution_funnel'),
      now,
    );
    expect(measurementHash(first)).not.toBe(measurementHash(second));
    expect(
      second.metrics.find((m) => m.key === 'a29_current_canceled_count')?.value,
    ).toBe('1');
    expect(JSON.stringify(second)).not.toContain('touchpointId');
    expect(
      second.metrics.find((m) => m.key === 'a29_frozen_window_assignment_count')
        ?.dimensions,
    ).toEqual({ source: 'window_days_30' });
  });
});
