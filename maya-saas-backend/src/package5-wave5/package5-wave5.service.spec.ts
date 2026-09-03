import { ActionExecutionState, type ActionExecution } from '@prisma/client';

import type { TrustedActionExecutionRequestV1 } from '../action-engine';
import { DOMAIN_EVENT_TYPE } from '../domain';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  Package5Wave5ShadowService,
  package5Wave5Hash,
} from './package5-wave5.service';

describe('Package5Wave5ShadowService', () => {
  const tenantId = 'tenant-wave5';
  const actorUserId = 'manager-wave5';
  const conversion = {
    id: 'conversion-wave5',
    tenantId,
    touchpointId: 'touchpoint-current',
    subjectRef: 'a'.repeat(64),
    bookedAt: new Date('2026-09-03T10:00:00.000Z'),
  };
  const touchpoint = {
    id: 'touchpoint-target',
    tenantId,
    subjectRef: conversion.subjectRef,
    status: 'delivered',
    occurredAt: new Date('2026-09-02T10:00:00.000Z'),
    attributionWindowDays: 7,
  };
  const event = {
    id: 'event-touchpoint-target',
    tenantId,
    type: DOMAIN_EVENT_TYPE.recoveryTouchpointObserved,
    version: 1,
    entityType: 'recovery_touchpoint',
    entityId: touchpoint.id,
    occurredAt: touchpoint.occurredAt,
    source: 'legacy_bridge',
    sourceRef: 'b'.repeat(64),
    dedupFingerprint: 'c'.repeat(64),
    payload: { status: 'delivered' },
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const planShadow: jest.MockedFunction<
      (request: TrustedActionExecutionRequestV1) => Promise<ActionExecution>
    > = jest.fn().mockResolvedValue({
      id: 'action-shadow-wave5',
      dryRun: true,
      state: ActionExecutionState.NOT_EXECUTED,
      notExecutedReasonCode: 'shadow_only',
    });
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-wave5',
          role: 'manager',
          status: 'active',
          user: { status: 'active' },
        }),
      },
      actionExecution: { findMany: jest.fn().mockResolvedValue([]) },
      recoveryConversion: {
        findFirst: jest.fn().mockResolvedValue(conversion),
      },
      recoveryTouchpoint: {
        findFirst: jest.fn().mockResolvedValue(touchpoint),
      },
      domainEvent: { findFirst: jest.fn().mockResolvedValue(event) },
      actionTargetMutation: { findFirst: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
    const tenantContext = new TenantContextService();
    const service = new Package5Wave5ShadowService(
      { planShadow } as never,
      prisma as never,
      tenantContext,
      {} as never,
    );
    return { service, planShadow, tenantContext, prisma };
  }

  const command = {
    sourceIntentRef: 'approved-correction-0001',
    conversionId: conversion.id,
    touchpointId: touchpoint.id,
    sourceEvidenceEventId: event.id,
    reasonCode: 'operator_evidence_correction' as const,
  };

  it('plans one evidence-bound owner-approved correction without mutation', async () => {
    const fixture = setup();
    const result = await fixture.tenantContext.runAsSystemTenant(tenantId, () =>
      fixture.service.plan(tenantId, actorUserId, command),
    );

    expect(result).toEqual({
      actionClass: 'correct_recovery_attribution',
      actionExecutionId: 'action-shadow-wave5',
      outcome: 'planned',
      shadowDivergences: 0,
      businessMutations: 0,
      providerWrites: 0,
    });
    const request = fixture.planShadow.mock.calls[0][0];
    expect(request.input).toMatchObject({
      targetRef: conversion.id,
      sourceEvidenceEventId: event.id,
      reasonCode: command.reasonCode,
      approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
      immutableSourceFacts: true,
      mutationPerformed: false,
    });
    expect(JSON.stringify(request)).not.toContain('+7');
  });

  it('fails closed for a cross-subject target or unapproved reason', async () => {
    const fixture = setup({
      recoveryTouchpoint: {
        findFirst: jest.fn().mockResolvedValue({
          ...touchpoint,
          subjectRef: 'd'.repeat(64),
        }),
      },
    });
    await expect(
      fixture.tenantContext.runAsSystemTenant(tenantId, () =>
        fixture.service.plan(tenantId, actorUserId, command),
      ),
    ).rejects.toThrow('outside frozen evidence boundary');
    expect(fixture.planShadow).not.toHaveBeenCalled();

    const valid = setup();
    await expect(
      valid.tenantContext.runAsSystemTenant(tenantId, () =>
        valid.service.plan(tenantId, actorUserId, {
          ...command,
          reasonCode: 'forged' as never,
        }),
      ),
    ).rejects.toThrow('not allowlisted');
  });

  it('uses stable canonical hashes independent of object key order', () => {
    expect(package5Wave5Hash({ b: 2, a: 1 })).toBe(
      package5Wave5Hash({ a: 1, b: 2 }),
    );
  });
});
