import {
  type BulkAudiencePlanRow,
  compareBulkAudienceDeliveryPlans,
} from './bulk-audience-equivalence';

describe('compareBulkAudienceDeliveryPlans', () => {
  const row = (
    externalClientId: string,
    overrides: Partial<BulkAudiencePlanRow> = {},
  ): BulkAudiencePlanRow => ({
    tenantId: 'tenant-1',
    externalClientId,
    eligibilityStatus: 'ALLOW',
    consentState: 'GRANTED',
    optOutState: 'OPTED_IN',
    channel: 'inbox',
    deliveryIdentity: `delivery:${externalClientId}`,
    approvalRequirement: 'OWNER_CONFIRMED',
    riskClass: 'bulk',
    ...overrides,
  });

  it('proves the complete included and excluded delivery plan', () => {
    const legacyRows = [
      row('user-1'),
      row('user-2', {
        eligibilityStatus: 'SKIP',
        exclusionReason: 'CONSENT_OR_ACCOUNT_INELIGIBLE',
        consentState: 'NOT_GRANTED',
        optOutState: 'UNKNOWN',
        channel: null,
        deliveryIdentity: null,
      }),
    ];
    const proof = compareBulkAudienceDeliveryPlans({
      tenantId: 'tenant-1',
      requestedIds: ['user-1', 'user-2'],
      legacyRows,
      shadowRows: [...legacyRows].reverse(),
    });

    expect(proof).toMatchObject({
      equivalent: true,
      requestedCount: 2,
      includedCount: 1,
      excludedCount: 1,
      duplicateCount: 0,
      wrongTenantCount: 0,
      missingCount: 0,
      unexpectedCount: 0,
      semanticMismatchCount: 0,
    });
    expect(proof.legacyPlanHash).toBe(proof.shadowPlanHash);
  });

  it.each([
    ['consent', { consentState: 'REVOKED' }],
    ['opt-out', { optOutState: 'OPTED_OUT' }],
    ['channel', { channel: null }],
    ['delivery identity', { deliveryIdentity: 'different' }],
    ['approval', { approvalRequirement: undefined }],
  ])('rejects %s semantic drift', (_label, drift) => {
    const legacy = row('user-1');
    const shadow = { ...legacy, ...drift } as BulkAudiencePlanRow;
    const proof = compareBulkAudienceDeliveryPlans({
      tenantId: 'tenant-1',
      requestedIds: ['user-1'],
      legacyRows: [legacy],
      shadowRows: [shadow],
    });

    expect(proof.equivalent).toBe(false);
    expect(proof.semanticMismatchCount).toBe(1);
    expect(proof.legacyPlanHash).not.toBe(proof.shadowPlanHash);
  });

  it('rejects tenant leaks, duplicates, omissions and unexpected identities', () => {
    const proof = compareBulkAudienceDeliveryPlans({
      tenantId: 'tenant-1',
      requestedIds: ['user-1', 'user-2'],
      legacyRows: [row('user-1'), row('user-2')],
      shadowRows: [
        row('user-1', { tenantId: 'tenant-2' }),
        row('user-1'),
        row('unexpected-user'),
      ],
    });

    expect(proof.equivalent).toBe(false);
    expect(proof.duplicateCount).toBe(1);
    expect(proof.wrongTenantCount).toBe(1);
    expect(proof.missingCount).toBe(1);
    expect(proof.unexpectedCount).toBe(1);
  });
});
