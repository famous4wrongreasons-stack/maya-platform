import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-05 revoke_customer_subscription Shadow architecture', () => {
  it('stops at planShadow before terminal, term, payment, usage, or provider mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-revocation-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow(request)');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /customerSubscription(?:Usage)?\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'revoke_customer_subscription',[\s\S]{0,1800}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1800}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1800}approvalRequirement: 'REQUIRED',[\s\S]{0,1800}executorKey: 'shadow\.none'/,
    );
  });

  it('derives actor, reason, effective semantics, and approval scope server-side', () => {
    const dto = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'dto',
        'customer-subscription-revocation-shadow.dto.ts',
      ),
    );
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-revocation-shadow.service.ts',
      ),
    );

    expect(dto).not.toContain('requester_role');
    expect(dto).not.toContain('requester_authority');
    expect(dto).not.toContain('revocation_reason');
    expect(dto).not.toContain('effective_date');
    expect(dto).not.toContain('approved');
    expect(service).toContain('this.prisma.authIdentity.findUnique({');
    expect(service).toContain("'approved_policy_revocation'");
    expect(service).toContain("'OWNER_APPROVAL_REQUIRED'");
    expect(service).toContain("'CANONICAL_EXECUTION_OWNER_APPROVAL'");
    expect(service).toContain("'LOCAL_ONLY'");
  });

  it('keeps the disposable bridge outside every legacy subscription owner', () => {
    const bridgeName = 'maya_subscription_revocation_shadow_bridge';
    for (const path of [
      'subscriptions.py',
      'database.py',
      'bot.py',
      'webhook_server.py',
    ]) {
      expect(
        source(join(REPOSITORY_ROOT, 'ai администратор', path)),
      ).not.toContain(bridgeName);
    }
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_subscription_revocation_shadow_bridge.py',
      ),
    );
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('update_subscription_status');
    expect(bridge).not.toContain('create_payment');
  });
});
