import {
  PACKAGE5_WAVE4_POLICY_VERSION,
  PACKAGE5_WAVE4_REGISTRATIONS,
  normalizePackage5Wave4Input,
} from './package5-wave4-executable.contract';

const hash = 'a'.repeat(64);

function input(
  operation: (typeof PACKAGE5_WAVE4_REGISTRATIONS)[number]['operation'],
) {
  const row = PACKAGE5_WAVE4_REGISTRATIONS.find(
    (candidate) => candidate.operation === operation,
  )!;
  const external = row.authorityClass === 'AC2';
  return {
    operation,
    targetKind: row.targetKind,
    targetRef: 'target:one',
    mutationKey: `g0:${operation}`,
    targetGeneration: 0,
    beforeStateHash: null,
    afterStateHash: hash,
    desiredStateHash: hash,
    requestMaterialHash: hash,
    actorMembershipId: 'membership:one',
    actorRole: 'tenant_owner',
    actorIdentityHash: hash,
    policyVersion: PACKAGE5_WAVE4_POLICY_VERSION,
    policySnapshotHash: hash,
    approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    changedFields: ['active'],
    intendedMutation: operation,
    mutationPerformed: false,
    providerOperation: external ? 'put_content_bound_provider_avatar' : null,
    providerRequestIdentityHash: external ? hash : null,
    providerObjectContentHash: external ? hash : null,
  };
}

describe('Package 5 Wave 4 executable contract', () => {
  it('pins the exact reduced A27/A28 action inventory', () => {
    expect(PACKAGE5_WAVE4_REGISTRATIONS).toHaveLength(12);
    expect(
      PACKAGE5_WAVE4_REGISTRATIONS.filter((row) => row.family === 'A27'),
    ).toHaveLength(3);
    expect(
      PACKAGE5_WAVE4_REGISTRATIONS.filter((row) => row.family === 'A28'),
    ).toHaveLength(9);
    expect(
      PACKAGE5_WAVE4_REGISTRATIONS.filter(
        (row) => row.authorityClass === 'AC2',
      ).map((row) => row.operation),
    ).toEqual(['upload_provider_avatar']);
  });

  it.each(PACKAGE5_WAVE4_REGISTRATIONS)(
    'normalizes $operation without business payload or object bytes',
    ({ operation }) => {
      const normalized = normalizePackage5Wave4Input(
        operation,
        input(operation),
      );
      expect(normalized.operation).toBe(operation);
      expect(JSON.stringify(normalized)).not.toMatch(
        /displayName|description|note|bytes|avatarUrl|priceKopecks/,
      );
    },
  );

  it('rejects forged bulk, authority and provider claims', () => {
    expect(() =>
      normalizePackage5Wave4Input('create_inventory_item', {
        ...input('create_inventory_item'),
        bulkMutation: true,
      }),
    ).toThrow();
    expect(() =>
      normalizePackage5Wave4Input('update_internal_service', {
        ...input('update_internal_service'),
        approvalRequirement: 'NONE',
      }),
    ).toThrow();
    expect(() =>
      normalizePackage5Wave4Input('update_internal_provider', {
        ...input('update_internal_provider'),
        providerOperation: 'write',
      }),
    ).toThrow();
    expect(() =>
      normalizePackage5Wave4Input('upload_provider_avatar', {
        ...input('upload_provider_avatar'),
        providerRequestIdentityHash: null,
      }),
    ).toThrow();
  });
});
