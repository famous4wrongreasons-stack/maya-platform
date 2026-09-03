import {
  PACKAGE5_WAVE5_POLICY_VERSION,
  PACKAGE5_WAVE5_REGISTRATIONS,
  normalizePackage5Wave5Input,
} from './package5-wave5-executable.contract';

const hash = 'a'.repeat(64);

function input() {
  return {
    operation: 'correct_recovery_attribution',
    targetKind: 'recovery_attribution',
    targetRef: 'conversion:one',
    mutationKey: 'g0:correct_recovery_attribution',
    targetGeneration: 0,
    beforeStateHash: hash,
    afterStateHash: hash,
    requestMaterialHash: hash,
    sourceEvidenceEventId: 'event:one',
    sourceEvidenceHash: hash,
    reasonCode: 'operator_evidence_correction',
    actorMembershipId: 'membership:one',
    actorRole: 'manager',
    actorIdentityHash: hash,
    policyVersion: PACKAGE5_WAVE5_POLICY_VERSION,
    policySnapshotHash: hash,
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    oneTargetCount: 1,
    bulkMutation: false,
    immutableSourceFacts: true,
    mutationPerformed: false,
  };
}

describe('Package 5 Wave 5 executable contract', () => {
  it('pins only the governed A29 correction command', () => {
    expect(PACKAGE5_WAVE5_REGISTRATIONS).toEqual([
      expect.objectContaining({
        family: 'A29',
        authorityClass: 'AC1',
        actionClass: 'correct_recovery_attribution',
      }),
    ]);
  });

  it('normalizes only safe evidence bindings and immutable-source policy', () => {
    expect(normalizePackage5Wave5Input(input())).toEqual(input());
    expect(JSON.stringify(normalizePackage5Wave5Input(input()))).not.toMatch(
      /phone|email|raw|providerPayload/,
    );
  });

  it.each([
    { bulkMutation: true },
    { immutableSourceFacts: false },
    { approvalRequirement: 'NONE' },
    { actorRole: 'client' },
    { sourceEvidenceHash: 'forged' },
    { reasonCode: 'free_form_reason' },
    { targetGeneration: -1 },
    { phone: '+79991234567' },
  ])('rejects forged authority or unsafe material %#', (patch) => {
    expect(() =>
      normalizePackage5Wave5Input({ ...input(), ...patch }),
    ).toThrow();
  });
});
