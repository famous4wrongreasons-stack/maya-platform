import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-05 activate_customer_subscription_renewal Shadow architecture', () => {
  it('stops at planShadow before payment, successor, predecessor, or message mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-renewal-activation-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /customerSubscription\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'activate_customer_subscription_renewal',[\s\S]{0,1300}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1300}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1300}executorKey: 'shadow\.none'/,
    );
  });

  it('requires paid evidence while PENDING and UNKNOWN cannot activate', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-renewal-activation-shadow.service.ts',
      ),
    );
    const contract = source(
      join(
        SRC_ROOT,
        'action-engine',
        'customer-subscription-renewal-activation-shadow.contract.ts',
      ),
    );

    expect(service).toContain("return this.noPlan('payment_pending', 0)");
    expect(service).toContain("return this.noPlan('payment_unknown', 0)");
    expect(service).toContain("providerPayment.status !== 'succeeded'");
    expect(contract).toContain('mutatesPredecessor: false');
    expect(contract).toContain(
      'Math.max(\n      new Date(predecessorTermEndsAt).getTime()',
    );
  });

  it('keeps the disposable bridge outside production legacy owners', () => {
    const legacyBot = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'bot.py'),
    );
    const legacyPwa = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'webhook_server.py'),
    );
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_subscription_renewal_activation_shadow_bridge.py',
      ),
    );

    expect(legacyBot).not.toContain(
      'maya_subscription_renewal_activation_shadow_bridge',
    );
    expect(legacyPwa).not.toContain(
      'maya_subscription_renewal_activation_shadow_bridge',
    );
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('create_subscription');
    expect(bridge).not.toContain('create_payment');
    expect(bridge).not.toContain('send_message');
  });
});
