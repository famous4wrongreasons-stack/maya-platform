import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

describe('Cycle 06 P4-03 client-owned LoyaltyAccount runtime alignment', () => {
  const systemOwnerPaths = [
    'loyalty/legacy-loyalty-shadow.service.ts',
    'loyalty/legacy-loyalty-expiry-shadow.service.ts',
    'loyalty/legacy-loyalty-backfill-shadow.service.ts',
    'loyalty/legacy-loyalty-import-shadow.service.ts',
    'loyalty/legacy-loyalty-redemption-shadow.service.ts',
    'loyalty/legacy-loyalty-refund-shadow.service.ts',
    'loyalty/legacy-loyalty-grant-issue-shadow.service.ts',
  ];

  it('does not require a User or Membership from a guest value owner', () => {
    for (const path of systemOwnerPaths) {
      const source = read(path);
      expect(source).not.toContain('client.userId');
      expect(source).not.toContain('userId_tenantId');
      expect(source).not.toContain('account.membership');
    }
  });

  it('keeps privileged consume requester authority separate from the guest owner', () => {
    const consume = read(
      'loyalty/legacy-loyalty-grant-consume-shadow.service.ts',
    );
    expect(consume).toContain('requester.membership.status');
    expect(consume).toContain('requesterAuthority');
    expect(consume).toContain('actorUserId: requester.user.id');
    expect(consume).not.toContain('grant.client.userId');
    expect(consume).not.toContain('account.membership');
    expect(consume).toContain('tenantId_clientId');
  });

  it('requires an already-established Client account for every executable mutation', () => {
    const executable = read(
      'loyalty/p4-03-legacy-loyalty-executable.service.ts',
    );
    expect(executable).toContain('tenantId_clientId');
    expect(executable).toContain('Client-owned loyalty account is missing');
    expect(executable).not.toContain('tx.loyaltyAccount.upsert');
    expect(executable).not.toContain('grant.client.userId');
  });

  it('uses exact provider identity for guest import/backfill evidence', () => {
    expect(read('loyalty/legacy-loyalty-backfill-shadow.service.ts')).toContain(
      'getClientRegistry',
    );
    expect(read('loyalty/legacy-loyalty-import-shadow.service.ts')).toContain(
      'getClientLoyaltyEvidenceByExternalIdReadOnly',
    );
    const crm = read('crm/crm.service.ts');
    expect(crm).toContain('loyalty.external_client_id === exactExternalId');
    expect(crm).not.toContain(
      'getClientLoyaltyEvidenceByExternalIdReadOnly(tenantId: string, phone',
    );
  });

  it('exposes read-only balance/history by Client without creating identity state', () => {
    const loyalty = read('loyalty/loyalty.service.ts');
    expect(loyalty).toContain('async getStateForClient(');
    expect(loyalty).toContain('async listTransactionsForClient(');
    expect(loyalty).toContain('this.requireClientReader().forClient(');
    expect(read('crm/client-loyalty-read.service.ts')).toContain(
      'tenantId_clientId',
    );
    expect(loyalty).toContain('userId: string | null');
  });

  it('preserves the unresolved identity fail-closed guard', () => {
    const guard = read('crm/client-identity.service.ts');
    expect(guard).toContain('CLIENT_IDENTITY_UNRESOLVED');
    expect(guard).toContain('await this.hasActiveHold');
    expect(guard).toContain('ClientIdentityRegistrationGuardError');
  });
});
