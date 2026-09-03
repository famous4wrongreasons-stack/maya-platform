import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  PACKAGE5_WAVE1_POLICY_VERSION,
  PACKAGE5_WAVE1_REGISTRATIONS,
  normalizePackage5Wave1Input,
} from './package5-wave1-executable.contract';

const hash = 'a'.repeat(64);

function input(
  operation: (typeof PACKAGE5_WAVE1_REGISTRATIONS)[number]['operation'],
) {
  const registration = PACKAGE5_WAVE1_REGISTRATIONS.find(
    (candidate) => candidate.operation === operation,
  )!;
  const work = registration.targetKind === 'operational_work_item';
  return {
    operation,
    targetKind: registration.targetKind,
    targetRef: work ? 'work-item-1' : 'setting-1',
    mutationKey: `g0:${operation}`,
    targetGeneration: 0,
    beforeStateHash: work ? null : hash,
    afterStateHash: hash,
    noOp: false,
    actorMembershipId: 'membership-1',
    actorRole: 'tenant_owner',
    policyVersion: PACKAGE5_WAVE1_POLICY_VERSION,
    policySnapshotHash: hash,
    approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    intendedMutation: operation,
    mutationPerformed: false,
    configJson: work ? null : { schema_version: 1 },
    workItemId: work ? 'work-item-1' : null,
    workItemKind: work ? 'task' : null,
    assigneeUserId: work ? 'user-1' : null,
    createdByUserId: work ? 'user-1' : null,
    title: work ? 'Task' : null,
    bodyText: work ? 'Do the work' : null,
    dueAt: null,
    expectedStatus: null,
    deliveryProjectionRequired: work,
  };
}

describe('Package 5 Wave 1 canonical contracts', () => {
  it('registers six paired Shadow/executable capabilities', () => {
    const registry = new ActionCapabilityRegistry();
    expect(PACKAGE5_WAVE1_REGISTRATIONS).toHaveLength(6);
    for (const registration of PACKAGE5_WAVE1_REGISTRATIONS) {
      const shadow = registry.get(registration.shadowCapability);
      const executable = registry.get(registration.executableCapability);
      expect(shadow.policyDecision).toBe(ActionPolicyDecision.SHADOW_ONLY);
      expect(shadow.executorKey).toBe('shadow.none');
      expect(executable.policyDecision).toBe(ActionPolicyDecision.ALLOW);
      expect(executable.executorKey).toBe('package5.wave1.local-command');
      expect(executable.reconciliation.key).toContain('not-required');
    }
  });

  it.each(PACKAGE5_WAVE1_REGISTRATIONS)(
    'normalizes $actionClass with one-target local authority',
    ({ operation }) => {
      const normalized = normalizePackage5Wave1Input(
        operation,
        input(operation),
      );
      expect(normalized.operation).toBe(operation);
      expect(normalized.oneTargetCount).toBe(1);
      expect(normalized.bulkMutation).toBe(false);
      expect(normalized.mutationPerformed).toBe(false);
    },
  );

  it('rejects caller-supplied authority and bulk expansion', () => {
    expect(() =>
      normalizePackage5Wave1Input('assistant_preferences', {
        ...input('assistant_preferences'),
        actorRole: 'platform_owner',
      }),
    ).toThrow('actorRole');
    expect(() =>
      normalizePackage5Wave1Input('assistant_preferences', {
        ...input('assistant_preferences'),
        oneTargetCount: 2,
        bulkMutation: true,
      }),
    ).toThrow('authority');
    expect(() =>
      normalizePackage5Wave1Input('assistant_preferences', {
        ...input('assistant_preferences'),
        policyDecision: 'ALLOW',
      }),
    ).toThrow('Unexpected');
  });

  it('keeps work-item delivery a separate projection', () => {
    expect(() =>
      normalizePackage5Wave1Input('create_task', {
        ...input('create_task'),
        deliveryProjectionRequired: false,
      }),
    ).toThrow('projection boundary');
  });
});
