import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LEGACY_LOYALTY_REDEEM_LEDGER_KIND,
  LEGACY_LOYALTY_REFUND_LEDGER_KIND,
  legacyLoyaltyProviderRecordIdentityHash,
  legacyLoyaltyRefundCorrelationHash,
} from '../action-engine/legacy-loyalty-refund-shadow.contract';
import {
  LOYALTY_REDEMPTION_CLAIM_OUTPUT_CONTRACT,
  issueLoyaltyRedemptionClaim,
  loyaltyRedemptionClaimLookup,
} from './loyalty-redemption-claim.contract';

const ROOT = join(__dirname, '..', '..');
const executableSource = readFileSync(
  join(ROOT, 'src', 'loyalty', 'p4-03-legacy-loyalty-executable.service.ts'),
  'utf8',
);
const consumeSource = readFileSync(
  join(
    ROOT,
    'src',
    'loyalty',
    'legacy-loyalty-grant-consume-shadow.service.ts',
  ),
  'utf8',
);

describe('P4-03 contract-to-runtime closure', () => {
  const secret = 'contract-closure-test-secret-'.padEnd(64, 'x');

  it('aligns issue output, stored lookup, and consume input without persisting the bearer', () => {
    const claim = issueLoyaltyRedemptionClaim();
    const storedLookup = loyaltyRedemptionClaimLookup(secret, claim.bearer);
    const consumeLookupAfterRestart = loyaltyRedemptionClaimLookup(
      Buffer.from(secret, 'utf8'),
      `  ${claim.bearer.toLowerCase()}  `,
    );

    expect(claim.contract).toBe(LOYALTY_REDEMPTION_CLAIM_OUTPUT_CONTRACT);
    expect(claim.bearer).toMatch(/^MAYA-LR-[A-F0-9]{48}$/);
    expect(storedLookup).toMatch(/^[a-f0-9]{64}$/);
    expect(consumeLookupAfterRestart).toBe(storedLookup);
    expect(loyaltyRedemptionClaimLookup(secret, 'MAYA-LR-WRONG')).not.toBe(
      storedLookup,
    );

    expect(executableSource).toContain(
      'codeHash: loyaltyRedemptionClaimLookup(',
    );
    expect(executableSource).toContain(
      'return this.grantValue(executionId, grant.id, claimArtifact)',
    );
    expect(consumeSource).toContain(
      'const codeHash = loyaltyRedemptionClaimLookup(codePepper, normalizedCode)',
    );
    const safeResultBody = executableSource.slice(
      executableSource.indexOf('private safe('),
      executableSource.indexOf('private restore('),
    );
    expect(safeResultBody).not.toContain('claimArtifact');
    expect(safeResultBody).not.toContain('bearer');
  });

  it('uses one canonical provider record and refund correlation vocabulary', () => {
    const providerRecordIdentityHash = legacyLoyaltyProviderRecordIdentityHash({
      tenantId: 'tenant-a',
      provider: 'yclients',
      providerRecordId: 'visit-7',
    });
    const anotherVisit = legacyLoyaltyProviderRecordIdentityHash({
      tenantId: 'tenant-a',
      provider: 'yclients',
      providerRecordId: 'visit-8',
    });
    const anotherTenant = legacyLoyaltyProviderRecordIdentityHash({
      tenantId: 'tenant-b',
      provider: 'yclients',
      providerRecordId: 'visit-7',
    });
    const refundReference = legacyLoyaltyRefundCorrelationHash({
      tenantId: 'tenant-a',
      originalRedemptionActionExecutionId: 'execution-redeem-7',
      cancellationFactHash: 'c'.repeat(64),
    });
    const refundReferenceAfterRestart = legacyLoyaltyRefundCorrelationHash({
      tenantId: 'tenant-a',
      originalRedemptionActionExecutionId: 'execution-redeem-7',
      cancellationFactHash: 'c'.repeat(64),
    });

    expect(LEGACY_LOYALTY_REDEEM_LEDGER_KIND).toBe('redeem');
    expect(LEGACY_LOYALTY_REFUND_LEDGER_KIND).toBe('refund');
    expect(providerRecordIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(anotherVisit).not.toBe(providerRecordIdentityHash);
    expect(anotherTenant).not.toBe(providerRecordIdentityHash);
    expect(refundReferenceAfterRestart).toBe(refundReference);
    expect(executableSource).toContain('? LEGACY_LOYALTY_REDEEM_LEDGER_KIND');
    expect(executableSource).toContain(
      'rows.some((row) => row.externalRef !== providerRecordIdentityHash)',
    );
  });

  it('keeps the closure local-only with no provider dispatch', () => {
    expect(executableSource).toContain('providerWrites: 0');
    expect(consumeSource).toContain('newPathProviderWrites: 0');
    expect(executableSource).not.toContain('yclientsClient');
    expect(executableSource).not.toContain('provider.dispatch');
  });
});
