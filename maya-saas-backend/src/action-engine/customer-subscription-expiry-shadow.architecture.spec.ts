import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-05 expire_customer_subscription Shadow architecture', () => {
  it('stops at planShadow before terminal, term, renewal, payment, usage, or provider mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-expiry-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /customerSubscription(?:Usage)?\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'expire_customer_subscription',[\s\S]{0,1400}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1400}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1400}executorKey: 'shadow\.none'/,
    );
  });

  it('derives expiry from server time and immutable term rather than caller authority', () => {
    const dto = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'dto',
        'customer-subscription-expiry-shadow.dto.ts',
      ),
    );
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-expiry-shadow.service.ts',
      ),
    );

    expect(dto).not.toContain('current_time');
    expect(dto).not.toContain('term_end');
    expect(dto).not.toContain('status');
    expect(dto).not.toContain('approved');
    expect(service).toContain('const trustedNow = new Date()');
    expect(service).toContain("subscription.status !== 'active'");
    expect(service).toContain('pendingRenewalBlocksExpiry: false');
  });

  it('keeps the disposable bridge outside the production legacy expiry owner', () => {
    const legacySubscriptions = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'subscriptions.py'),
    );
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_subscription_expiry_shadow_bridge.py',
      ),
    );

    expect(legacySubscriptions).not.toContain(
      'maya_subscription_expiry_shadow_bridge',
    );
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('update_subscription_status');
    expect(bridge).not.toContain('create_subscription');
  });
});
