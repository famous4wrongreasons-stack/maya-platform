import {
  PACKAGE5_WAVE2_POLICY_VERSION,
  PACKAGE5_WAVE2_REGISTRATIONS,
  normalizePackage5Wave2Input,
} from './package5-wave2-executable.contract';

const digest = 'a'.repeat(64);

function input(
  operation: (typeof PACKAGE5_WAVE2_REGISTRATIONS)[number]['operation'],
) {
  const registration = PACKAGE5_WAVE2_REGISTRATIONS.find(
    (candidate) => candidate.operation === operation,
  )!;
  const external = registration.authorityClass === 'AC2';
  return {
    operation,
    targetKind: registration.targetKind,
    targetRef: 'target-1',
    mutationKey: `g0:${operation}`,
    targetGeneration: 0,
    beforeStateHash: null,
    afterStateHash: digest,
    desiredStateHash: digest,
    requestMaterialHash: digest,
    actorMembershipId: 'membership-1',
    actorRole: 'tenant_owner',
    actorIdentityHash: digest,
    policyVersion: PACKAGE5_WAVE2_POLICY_VERSION,
    policySnapshotHash: digest,
    approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    changedFields: ['status'],
    intendedMutation: operation,
    mutationPerformed: false,
    providerOperation: external ? 'object_store_put' : null,
    providerRequestIdentityHash: external ? digest : null,
    providerObjectContentHash: external ? digest : null,
  };
}

describe('Package 5 Wave 2 action contract', () => {
  it('registers the exact 13 A16/A25/A26 governed actions', () => {
    expect(PACKAGE5_WAVE2_REGISTRATIONS).toHaveLength(13);
    expect(
      Object.fromEntries(
        ['A16', 'A25', 'A26'].map((family) => [
          family,
          PACKAGE5_WAVE2_REGISTRATIONS.filter(
            (registration) => registration.family === family,
          ).length,
        ]),
      ),
    ).toEqual({ A16: 2, A25: 3, A26: 8 });
    expect(
      new Set(
        PACKAGE5_WAVE2_REGISTRATIONS.flatMap((registration) => [
          registration.shadowCapability,
          registration.executableCapability,
        ]),
      ).size,
    ).toBe(26);
  });

  it.each(PACKAGE5_WAVE2_REGISTRATIONS)(
    'normalizes $operation without caller authority or raw material',
    (registration) => {
      expect(
        normalizePackage5Wave2Input(
          registration.operation,
          input(registration.operation),
        ),
      ).toMatchObject({
        operation: registration.operation,
        targetKind: registration.targetKind,
        oneTargetCount: 1,
        bulkMutation: false,
        mutationPerformed: false,
      });
    },
  );

  it('rejects raw credentials, contacts, tokens and file bytes', () => {
    for (const forbidden of [
      'email',
      'phone',
      'password',
      'passwordHash',
      'oauthCode',
      'providerUserId',
      'bytes',
    ]) {
      expect(() =>
        normalizePackage5Wave2Input('create_tenant_user', {
          ...input('create_tenant_user'),
          [forbidden]: 'secret',
        }),
      ).toThrow(/Unexpected Package 5 Wave 2 input/);
    }
  });

  it('requires the AC2 request and content identities only for logo upload', () => {
    expect(() =>
      normalizePackage5Wave2Input('upload_tenant_logo', {
        ...input('upload_tenant_logo'),
        providerRequestIdentityHash: null,
      }),
    ).toThrow(/providerRequestIdentityHash/);
    expect(() =>
      normalizePackage5Wave2Input('update_tenant_branding', {
        ...input('update_tenant_branding'),
        providerOperation: 'object_store_put',
        providerRequestIdentityHash: digest,
        providerObjectContentHash: digest,
      }),
    ).toThrow(/cannot dispatch/);
  });

  it('rejects forged bulk and policy facts', () => {
    expect(() =>
      normalizePackage5Wave2Input('suspend_tenant', {
        ...input('suspend_tenant'),
        bulkMutation: true,
      }),
    ).toThrow(/authority contract/);
    expect(() =>
      normalizePackage5Wave2Input('suspend_tenant', {
        ...input('suspend_tenant'),
        policyVersion: 'caller-policy',
      }),
    ).toThrow(/authority contract/);
  });
});
