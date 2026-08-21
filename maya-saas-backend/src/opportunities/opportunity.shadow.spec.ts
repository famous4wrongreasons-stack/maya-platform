import { OPPORTUNITY_TYPE } from './opportunity.contract';
import { bindProjectionToTrustedTenant } from './opportunity.lifecycle';
import {
  opportunityShadowTenantRef,
  projectAppointmentRemovalShadow,
  type OpportunityShadowEventRowV1,
} from './opportunity.shadow';

const CUTOVER = '2026-08-20T00:00:00.000Z';
const AS_OF = '2026-08-21T08:00:00.000Z';

function row(
  overrides: Partial<OpportunityShadowEventRowV1> = {},
): OpportunityShadowEventRowV1 {
  return {
    tenantId: 'tenant-production-id',
    eventId: 'event-production-id',
    entityType: 'appointment',
    entityId: 'appointment-production-id',
    eventType: 'appointment.removed',
    occurredAt: '2026-08-21T07:30:00.000Z',
    receivedAt: '2026-08-21T07:31:00.000Z',
    ingestionMethod: 'webhook',
    observationOrigin: 'after_watch_started',
    watchStartedAt: '2026-08-20T06:00:00.000Z',
    appointment: {
      id: 'appointment-production-id',
      tenantId: 'tenant-production-id',
      status: 'canceled',
      blockedStartAt: '2026-08-21T09:00:00.000Z',
      blockedEndAt: '2026-08-21T10:00:00.000Z',
    },
    ...overrides,
  };
}

describe('opportunity shadow projection', () => {
  it('projects only proven, still-active released capacity', () => {
    const result = projectAppointmentRemovalShadow({
      rows: [row()],
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });

    expect(result.source.accepted).toBe(1);
    expect(result.source.rejected).toBe(0);
    expect(result.projection.opportunities).toHaveLength(1);
    expect(result.projection.opportunities[0]?.type).toBe(
      OPPORTUNITY_TYPE.appointmentCancellationRecovery,
    );
    expect(result.projection.agentTasks[0]?.agentDomain).toBe('occupancy');
    expect(result.projection.actionIntents[0]).toMatchObject({
      actionClass: 'prepare_recovery_options',
      dryRun: true,
      state: 'proposed',
    });
    expect(result.projection.metrics.executed).toBe(0);
    expect(result.safety).toEqual({
      readOnly: true,
      sideEffects: false,
      executed: 0,
      identifiers: 'opaque_sha256_refs',
    });
  });

  it('is deterministic, deduplicates duplicate input and emits no raw ids', () => {
    const duplicate = row();
    const first = projectAppointmentRemovalShadow({
      rows: [duplicate, duplicate],
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });
    const reordered = projectAppointmentRemovalShadow({
      rows: [duplicate, duplicate].reverse(),
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });

    expect(reordered).toEqual(first);
    expect(first.source.accepted).toBe(2);
    expect(first.projection.metrics.deduplicated).toBe(1);
    expect(first.projection.opportunities).toHaveLength(1);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('tenant-production-id');
    expect(serialized).not.toContain('event-production-id');
    expect(serialized).not.toContain('appointment-production-id');
  });

  it.each([
    ['unsupported_event_type', { eventType: 'appointment.created' }],
    ['unsupported_entity_type', { entityType: 'client' }],
    ['bootstrap', { ingestionMethod: 'bootstrap' }],
    ['unsupported_ingestion_method', { ingestionMethod: 'unknown' }],
    ['wrong_observation_origin', { observationOrigin: 'observed_existing' }],
    ['watch_not_started', { watchStartedAt: null }],
    ['invalid_timestamp', { occurredAt: 'not-a-date' }],
    ['before_cutover', { occurredAt: '2026-08-20T05:59:59.999Z' }],
    ['event_after_projection', { occurredAt: '2026-08-21T08:00:01.000Z' }],
    ['appointment_missing', { appointment: null }],
    [
      'appointment_tenant_mismatch',
      {
        appointment: {
          id: 'appointment-production-id',
          tenantId: 'other-tenant',
          status: 'canceled',
          blockedStartAt: '2026-08-21T09:00:00.000Z',
          blockedEndAt: '2026-08-21T10:00:00.000Z',
        },
      },
    ],
    [
      'appointment_not_removed',
      {
        appointment: {
          id: 'appointment-production-id',
          tenantId: 'tenant-production-id',
          status: 'confirmed',
          blockedStartAt: '2026-08-21T09:00:00.000Z',
          blockedEndAt: '2026-08-21T10:00:00.000Z',
        },
      },
    ],
    [
      'capacity_unavailable',
      {
        appointment: {
          id: 'appointment-production-id',
          tenantId: 'tenant-production-id',
          status: 'canceled',
          blockedStartAt: null,
          blockedEndAt: null,
        },
      },
    ],
    [
      'invalid_interval',
      {
        appointment: {
          id: 'appointment-production-id',
          tenantId: 'tenant-production-id',
          status: 'canceled',
          blockedStartAt: '2026-08-21T10:00:00.000Z',
          blockedEndAt: '2026-08-21T09:00:00.000Z',
        },
      },
    ],
    [
      'expired_capacity',
      {
        appointment: {
          id: 'appointment-production-id',
          tenantId: 'tenant-production-id',
          status: 'canceled',
          blockedStartAt: '2026-08-21T06:00:00.000Z',
          blockedEndAt: '2026-08-21T07:00:00.000Z',
        },
      },
    ],
  ])('rejects %s without creating work', (reason, overrides) => {
    const result = projectAppointmentRemovalShadow({
      rows: [row(overrides)],
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });

    expect(result.source.accepted).toBe(0);
    expect(result.source.rejected).toBe(1);
    expect(
      result.source.rejectedByReason[
        reason as keyof typeof result.source.rejectedByReason
      ],
    ).toBe(1);
    expect(result.projection.opportunities).toEqual([]);
    expect(result.projection.agentTasks).toEqual([]);
    expect(result.projection.actionIntents).toEqual([]);
    expect(result.projection.metrics.executed).toBe(0);
  });

  it('uses the later tenant WATCH start as the effective cutover', () => {
    const result = projectAppointmentRemovalShadow({
      rows: [
        row({
          occurredAt: '2026-08-20T03:00:00.000Z',
          watchStartedAt: '2026-08-20T06:00:00.000Z',
        }),
      ],
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });

    expect(result.source.rejectedByReason.before_cutover).toBe(1);
    expect(result.projection.metrics.executed).toBe(0);
  });

  it('binds an opaque shadow projection only to its trusted tenant', () => {
    const shadow = projectAppointmentRemovalShadow({
      rows: [row()],
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });
    const identity = shadow.projection.opportunities[0]?.identityFingerprint;
    const projection = bindProjectionToTrustedTenant({
      projection: shadow.projection,
      sourceTenantRef: opportunityShadowTenantRef('tenant-production-id'),
      trustedTenantId: 'trusted-internal-tenant-id',
    });

    expect(projection.opportunities[0]?.tenantId).toBe(
      'trusted-internal-tenant-id',
    );
    expect(projection.agentTasks[0]?.tenantId).toBe(
      'trusted-internal-tenant-id',
    );
    expect(projection.actionIntents[0]?.tenantId).toBe(
      'trusted-internal-tenant-id',
    );
    expect(projection.opportunities[0]?.proposedActionIntent?.tenantId).toBe(
      'trusted-internal-tenant-id',
    );
    expect(projection.opportunities[0]?.identityFingerprint).toBe(identity);
  });

  it('rejects cross-tenant rebinding before lifecycle persistence', () => {
    const shadow = projectAppointmentRemovalShadow({
      rows: [row()],
      cutoverAt: CUTOVER,
      asOf: AS_OF,
    });

    expect(() =>
      bindProjectionToTrustedTenant({
        projection: shadow.projection,
        sourceTenantRef: opportunityShadowTenantRef('other-tenant-id'),
        trustedTenantId: 'trusted-internal-tenant-id',
      }),
    ).toThrow('does not belong to the trusted tenant');
  });
});
