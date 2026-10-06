import { C9OccupancySource } from './c9.occupancy-source';
import { C9Store } from './c9.store';
import { c9C5Fingerprint } from './c9.sources';
import { OpportunityLifecycleRepository } from '../opportunities/opportunity.lifecycle';
import { CrmService } from '../crm/crm.service';
import { AiToolPolicyService } from '../ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import {
  opportunityShadowAppointmentRef,
  opportunityShadowIntervalRef,
} from '../opportunities/opportunity.shadow';
import type { C9Principal } from './c9.contract';

function fixture() {
  const now = new Date('2035-05-10T08:30:00Z');
  const p: C9Principal = {
    kind: 'USER',
    tenantId: 'tenant-1',
    userId: 'owner',
    membershipId: 'member',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'f'.repeat(64),
  };
  const appointment = {
    id: 'appointment',
    tenantId: p.tenantId,
    branchId: 'branch',
    staffExternalId: 'staff',
    serviceIds: ['service'],
    blockedStartAt: new Date('2035-05-10T09:00:00Z'),
    blockedEndAt: new Date('2035-05-10T10:00:00Z'),
    status: 'canceled',
  };
  const task = {
    id: 'task',
    taskFingerprint: 'task_' + 'c'.repeat(64),
    tenantId: p.tenantId,
    opportunityId: 'op',
    status: 'current',
    expiresAt: appointment.blockedEndAt,
    agentDomain: 'occupancy',
    autonomyLevel: 'L2_5_SHADOW',
  };
  const op = {
    id: 'op',
    tenantId: p.tenantId,
    expiresAt: appointment.blockedEndAt,
    status: 'active',
    agentTasks: [task],
    policyKey: 'occupancy.released_capacity',
    policyVersion: 1,
    affectedEntityRef: opportunityShadowAppointmentRef(
      p.tenantId,
      appointment.id,
    ),
    evidenceRefsJson: {
      items: [
        {
          ref: opportunityShadowIntervalRef({
            tenantId: p.tenantId,
            appointmentId: appointment.id,
            blockedStartAt: appointment.blockedStartAt.toISOString(),
            blockedEndAt: appointment.blockedEndAt.toISOString(),
          }),
        },
      ],
    },
    lastValidatedAt: now,
    evidenceFingerprint: 'evidence_' + 'a'.repeat(64),
    identityFingerprint: 'identity_' + 'b'.repeat(64),
  };
  const tx = {
    membership: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ role: 'tenant_owner', branchId: null }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([{ id: appointment.id }]),
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...appointment })),
    },
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
    },
    opportunity: { findFirst: jest.fn().mockResolvedValue(op) },
    agentTask: { findFirst: jest.fn().mockResolvedValue(task) },
  };
  const store = {
    transaction: jest.fn(
      (_: unknown, fn: (tx: unknown, p: C9Principal, now: Date) => unknown) =>
        Promise.resolve(fn(tx, p, now)),
    ),
    lock: jest.fn().mockResolvedValue({}),
  };
  const lifecycle = {
    readCancellationCandidates: jest.fn().mockResolvedValue([op]),
  };
  const crm = {
    getStaffScheduleDay: jest.fn().mockResolvedValue({
      staff_id: 'staff',
      date: '2035-05-10',
      is_working: true,
      slots: [{ from: '12:00', to: '13:00' }],
      revision: 'schedule-1',
    }),
    getAvailableSlots: jest.fn().mockResolvedValue([
      {
        staff_id: 'staff',
        branch_id: 'branch',
        start: appointment.blockedStartAt.toISOString(),
        end: appointment.blockedEndAt.toISOString(),
      },
    ]),
  };
  const policy = { assertCanExecute: jest.fn().mockResolvedValue(undefined) };
  const source = new C9OccupancySource(
    store as unknown as C9Store,
    lifecycle as unknown as OpportunityLifecycleRepository,
    crm as unknown as CrmService,
    policy as unknown as AiToolPolicyService,
    new AiToolRegistryService(),
  );
  return {
    source,
    now,
    p,
    appointment,
    op,
    task,
    tx,
    store,
    lifecycle,
    crm,
    policy,
  };
}

describe('explicit Occupancy current-source projection (synthetic CRM, no model)', () => {
  it('uses the saved C5 opportunity and current schedule/slot readers without projecting customer data', async () => {
    const f = fixture();
    const result = await f.source.read('run');
    expect(result.outcome).toBe('AVAILABLE');
    expect(result.window).toMatchObject({
      start: '2035-05-10T09:00:00.000Z',
      timezone: 'Europe/Moscow',
    });
    expect(result.evidenceRefs[0]).toMatchObject({
      sourceType: 'Opportunity',
      tenantId: 'tenant-1',
      inputHash: c9C5Fingerprint(f.op.evidenceFingerprint),
    });
    expect(f.crm.getAvailableSlots).toHaveBeenCalledWith('tenant-1', {
      date: '2035-05-10',
      staffId: 'staff',
      serviceIds: ['service'],
      branchId: 'branch',
    });
    expect(f.crm.getStaffScheduleDay).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(
      /staffExternalId|serviceIds|customer|phone|email|MeasurementRevision|C8ResultRevision/,
    );
    expect(f.policy.assertCanExecute).toHaveBeenCalled();
  });
  it.each(['STAFF', 'CLIENT', 'ADMIN'])(
    'refuses unsupported role %s before source reads',
    async (role) => {
      const f = fixture();
      f.tx.membership.findFirst.mockResolvedValue({ role, branchId: null });
      await expect(f.source.read('run')).rejects.toThrow(
        'source_reader_authority',
      );
      expect(f.lifecycle.readCancellationCandidates).not.toHaveBeenCalled();
    },
  );
  it('refuses a branch-scoped owner without widening scope', async () => {
    const f = fixture();
    f.p.branchRefs = ['branch'];
    await expect(f.source.read('run')).rejects.toThrow(
      'source_reader_authority',
    );
    expect(f.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
  it('refuses revoked entitlement before source read', async () => {
    const f = fixture();
    f.policy.assertCanExecute.mockRejectedValue(new Error('feature_revoked'));
    await expect(f.source.read('run')).rejects.toThrow('feature_revoked');
    expect(f.lifecycle.readCancellationCandidates).not.toHaveBeenCalled();
  });
  it('rejects a foreign tenant opportunity', async () => {
    const f = fixture();
    f.op.tenantId = 'foreign';
    await expect(f.source.read('run')).rejects.toThrow('source_qualification');
    expect(f.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
  it.each([
    ['expired', 'EXPIRED'],
    ['closed', 'CLOSED'],
    ['task', 'INCOMPLETE'],
    ['policy', 'INCOMPLETE'],
    ['interval', 'STALE'],
    ['restored', 'CLOSED'],
    ['started', 'EXPIRED'],
  ])('reports %s without contacting CRM', async (condition, outcome) => {
    const f = fixture();
    if (condition === 'expired') f.op.expiresAt = f.now;
    if (condition === 'closed') f.op.status = 'resolved';
    if (condition === 'task') f.task.status = 'invalidated';
    if (condition === 'policy') f.op.policyVersion = 2;
    if (condition === 'interval') f.op.evidenceRefsJson.items = [];
    if (condition === 'restored') f.appointment.status = 'confirmed';
    if (condition === 'started') f.appointment.blockedStartAt = f.now;
    expect((await f.source.read('run')).outcome).toBe(outcome);
    expect(f.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
  it('labels empty stored opportunities without asserting no CRM cancellations', async () => {
    const f = fixture();
    f.lifecycle.readCancellationCandidates.mockResolvedValue([]);
    expect(await f.source.read('run')).toMatchObject({
      outcome: 'NONE',
      reason: 'no_saved_cancellation_opportunity',
    });
  });
  it('reports a bounded identity scan as incomplete instead of absence', async () => {
    const f = fixture();
    f.tx.appointment.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({ id: `x${i}` })),
    );
    expect(await f.source.read('run')).toMatchObject({
      outcome: 'INCOMPLETE',
      reason: 'appointment_identity_scan_bounded',
    });
    expect(f.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
  it('reports more candidates but performs just one current-capacity read', async () => {
    const f = fixture();
    f.lifecycle.readCancellationCandidates.mockResolvedValue([
      f.op,
      { ...f.op, id: 'op2' },
    ]);
    expect(await f.source.read('run')).toMatchObject({
      outcome: 'AVAILABLE',
      hasMore: true,
    });
    expect(f.crm.getAvailableSlots).toHaveBeenCalledTimes(1);
  });
  it('reports occupied without an executable recommendation', async () => {
    const f = fixture();
    f.crm.getAvailableSlots.mockResolvedValue([]);
    expect(await f.source.read('run')).toMatchObject({
      outcome: 'OCCUPIED',
      evidenceRefs: [],
    });
  });
  it('does not convert provider failure to no available windows or retry', async () => {
    const f = fixture();
    f.crm.getAvailableSlots.mockRejectedValue(new Error('synthetic outage'));
    expect(await f.source.read('run')).toMatchObject({
      outcome: 'UNAVAILABLE',
    });
    expect(f.crm.getAvailableSlots).toHaveBeenCalledTimes(1);
  });
  it('bounds a stalled provider without a retry or claim of no windows', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      expect(jest.getTimerCount()).toBe(0);
      f.crm.getAvailableSlots.mockImplementation(
        () => new Promise(() => undefined),
      );
      const read = f.source.read('run');
      await jest.advanceTimersByTimeAsync(6001);
      expect(await read).toMatchObject({ outcome: 'UNAVAILABLE' });
      expect(f.crm.getAvailableSlots).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  it('rejects a provider slot for another branch', async () => {
    const f = fixture();
    f.crm.getAvailableSlots.mockResolvedValue([
      {
        staff_id: 'staff',
        branch_id: 'foreign-branch',
        start: f.appointment.blockedStartAt.toISOString(),
        end: f.appointment.blockedEndAt.toISOString(),
      },
    ]);
    expect(await f.source.read('run')).toMatchObject({ outcome: 'OCCUPIED' });
  });
  it('reports schedule identity mismatch as incomplete', async () => {
    const f = fixture();
    f.crm.getStaffScheduleDay.mockResolvedValue({
      staff_id: 'other',
      date: '2035-05-10',
    });
    expect(await f.source.read('run')).toMatchObject({ outcome: 'INCOMPLETE' });
  });
  it('rejects authority revoked during source read', async () => {
    const f = fixture();
    f.crm.getAvailableSlots.mockImplementation(() => {
      f.tx.membership.findFirst.mockResolvedValue(null);
      return Promise.resolve([]);
    });
    await expect(f.source.read('run')).rejects.toThrow(
      'source_reader_authority',
    );
  });
  it('drops an available response if the appointment changes during the read', async () => {
    const f = fixture();
    f.crm.getAvailableSlots.mockImplementation(() => {
      f.appointment.status = 'confirmed';
      return Promise.resolve([]);
    });
    expect(await f.source.read('run')).toMatchObject({
      outcome: 'STALE',
      evidenceRefs: [],
      window: null,
    });
  });
  it('refuses a cancelled run before reading', async () => {
    const f = fixture();
    f.store.lock.mockRejectedValue(new Error('c9_run_expired_or_terminal'));
    await expect(f.source.read('run')).rejects.toThrow(
      'run_expired_or_terminal',
    );
    expect(f.crm.getAvailableSlots).not.toHaveBeenCalled();
  });
});
