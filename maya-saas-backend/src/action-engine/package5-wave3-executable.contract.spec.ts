import {
  PACKAGE5_WAVE3_POLICY_VERSION,
  PACKAGE5_WAVE3_REGISTRATIONS,
  normalizePackage5Wave3Input,
} from './package5-wave3-executable.contract';

const hash = 'a'.repeat(64);

function input(
  operation: (typeof PACKAGE5_WAVE3_REGISTRATIONS)[number]['operation'],
) {
  const row = PACKAGE5_WAVE3_REGISTRATIONS.find(
    (item) => item.operation === operation,
  )!;
  const family17 = row.family === 'A17';
  const family18 = row.family === 'A18';
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
    actorRole: family18 ? 'client' : 'tenant_owner',
    actorIdentityHash: hash,
    policyVersion: PACKAGE5_WAVE3_POLICY_VERSION,
    policySnapshotHash: hash,
    approvalRequirement: family17
      ? 'SERVER_DERIVED_OWNER_AUTHORITY'
      : 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    changedFields: ['status'],
    intendedMutation: operation,
    mutationPerformed: false,
    providerOperation:
      row.authorityClass === 'AC2' ? 'replace_staff_day' : null,
    providerRequestIdentityHash: row.authorityClass === 'AC2' ? hash : null,
    expectedProviderRevision: row.authorityClass === 'AC2' ? hash : null,
    credentialFingerprint:
      operation === 'install_crm_credentials' ? hash : null,
    providerSnapshotHash: operation === 'confirm_crm_import' ? hash : null,
    clientId: family18 ? 'client:one' : null,
    consentKind: operation === 'record_client_consent' ? 'privacy' : null,
    consentDecision: operation === 'record_client_consent' ? 'grant' : null,
    sourceIdentityHash: operation === 'record_client_consent' ? hash : null,
  };
}

describe('Package 5 Wave 3 executable contract', () => {
  it('locks the exact A15/A17/A18 inventory and authority boundaries', () => {
    expect(PACKAGE5_WAVE3_REGISTRATIONS).toHaveLength(8);
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.filter((row) => row.family === 'A15'),
    ).toHaveLength(1);
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.filter((row) => row.family === 'A17'),
    ).toHaveLength(4);
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.filter((row) => row.family === 'A18'),
    ).toHaveLength(3);
    expect(
      PACKAGE5_WAVE3_REGISTRATIONS.filter(
        (row) => row.authorityClass === 'AC2',
      ).map((row) => row.operation),
    ).toEqual(['update_staff_schedule_day']);
  });

  it.each(PACKAGE5_WAVE3_REGISTRATIONS)(
    'normalizes $operation without raw material',
    ({ operation }) => {
      const normalized = normalizePackage5Wave3Input(
        operation,
        input(operation),
      );
      expect(normalized.operation).toBe(operation);
      expect(JSON.stringify(normalized)).not.toMatch(
        /apiToken|encryptedNotes|phone|email|slots/,
      );
    },
  );

  it('rejects forged bulk, authority and provider dispatch claims', () => {
    expect(() =>
      normalizePackage5Wave3Input('update_client_profile', {
        ...input('update_client_profile'),
        bulkMutation: true,
      }),
    ).toThrow();
    expect(() =>
      normalizePackage5Wave3Input('activate_crm_integration', {
        ...input('activate_crm_integration'),
        approvalRequirement: 'NONE',
      }),
    ).toThrow();
    expect(() =>
      normalizePackage5Wave3Input('update_client_notes', {
        ...input('update_client_notes'),
        providerOperation: 'write',
      }),
    ).toThrow();
  });
});
