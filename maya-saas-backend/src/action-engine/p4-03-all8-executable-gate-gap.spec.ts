import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { legacyLoyaltyGrantConsumeShadowNormalizer } from './legacy-loyalty-grant-consume-shadow.contract';

const ROOT = join(__dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const grantMigration = readFileSync(
  join(
    ROOT,
    'prisma',
    'migrations',
    '20260829233000_loyalty_redemption_grant',
    'migration.sql',
  ),
  'utf8',
);

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  const remainder = schema.slice(start);
  const end = remainder.indexOf('\n}');
  if (start < 0 || end < 0) throw new Error(`Missing Prisma model: ${name}`);
  return remainder.slice(0, end + 2);
}

function validConsumeShadowInput(): Record<string, unknown> {
  return {
    provider: 'yclients',
    canonicalGrantId: 'grant-8',
    grantIdentityHash: 'a'.repeat(64),
    issueExecutionIdentityHash: 'b'.repeat(64),
    canonicalClientId: 'client-8',
    requesterIdentityHash: 'c'.repeat(64),
    requesterRole: 'business_owner',
    requesterAuthority: 'administrative_role',
    loyaltyAccountIdentityHash: 'd'.repeat(64),
    serviceRef: 'yclients:service-spa',
    serviceIdentityHash: 'e'.repeat(64),
    grantPoints: 1200,
    availableBalancePoints: 1500,
    consumeDecision: 'consume',
    consumePolicy: 'legacy-one-time-grant-consume.v1',
    codeHashContract: 'hmac-sha256-normalized-bearer.v1',
    perRedemptionCapPoints: 2000,
    expiryDecision: 'unexpired',
    balanceDecision: 'sufficient',
    capDecision: 'within_cap',
    existingRedemptionDecision: 'none',
    providerProjectionDecision: 'not_evaluated_in_shadow',
    authorizationEvidence: 'server_resolved_cashier_or_admin',
    legacyClaimedPoints: 1200,
    legacyClaimedBalancePoints: 1500,
    legacyClaimedUsedDecision: 'none',
    legacyClaimedExpiredDecision: 'unexpired',
    divergenceCodes: [],
  };
}

describe('P4-03 all-8 executable proof precondition gap', () => {
  it('has no durable grant revocation fact while immutable expiry cannot be repurposed', () => {
    const grant = modelBlock('LoyaltyRedemptionGrant');
    expect(grant).not.toMatch(/revokedAt|revocationExecutionId|status/);
    expect(grantMigration).toContain(
      'NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"',
    );
    expect(grantMigration).toContain(
      'LoyaltyRedemptionGrant identity, value, and established issue binding are immutable',
    );
  });

  it('cannot bind or reconcile the optional consume provider marker to an exact record', () => {
    expect(() =>
      legacyLoyaltyGrantConsumeShadowNormalizer({
        ...validConsumeShadowInput(),
        providerRecordIdentityHash: 'f'.repeat(64),
      }),
    ).toThrow('Unexpected action input');
    expect(
      legacyLoyaltyGrantConsumeShadowNormalizer(validConsumeShadowInput()),
    ).toMatchObject({
      providerProjectionDecision: 'not_evaluated_in_shadow',
    });
  });

  it('keeps all eight accepted capabilities physically non-executable', () => {
    const registry = new ActionCapabilityRegistry();
    const capabilities = [
      'loyalty.legacy-earn.shadow.v1',
      'loyalty.legacy-expire.shadow.v1',
      'loyalty.legacy-redeem.shadow.v1',
      'loyalty.legacy-refund.shadow.v1',
      'loyalty.legacy-import.shadow.v1',
      'loyalty.legacy-backfill.shadow.v1',
      'loyalty.redemption-grant.issue.shadow.v1',
      'loyalty.redemption-grant.consume.shadow.v1',
    ];
    expect(capabilities).toHaveLength(8);
    for (const capabilityKey of capabilities) {
      expect(registry.get(capabilityKey)).toMatchObject({
        policyDecision: ActionPolicyDecision.SHADOW_ONLY,
        autonomyLevel: 'L2_5_SHADOW',
        approvalRequirement: 'NONE',
        executorKey: 'shadow.none',
      });
    }
  });
});
