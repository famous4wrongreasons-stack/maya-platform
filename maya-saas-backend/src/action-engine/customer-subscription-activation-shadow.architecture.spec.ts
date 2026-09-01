import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-05 activate_customer_subscription Shadow architecture', () => {
  it('allows only provider read plus planShadow and no subscription/payment mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-activation-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.yooKassa.getPayment(providerPaymentId)');
    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toContain('createPayment');
    expect(service).not.toMatch(
      /customerSubscription\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toMatch(
      /customerSubscriptionUsage\.(?:create|update|upsert)/,
    );
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'activate_customer_subscription',[\s\S]{0,1100}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1100}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1100}executorKey: 'shadow\.none'/,
    );
  });

  it('requires succeeded executable checkout and exact paid provider evidence', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-activation-shadow.service.ts',
      ),
    );

    expect(service).toContain(
      'checkout.state === ActionExecutionState.UNKNOWN',
    );
    expect(service).toContain(
      'checkout.state !== ActionExecutionState.SUCCEEDED',
    );
    expect(service).toContain('checkout.dryRun');
    expect(service).toMatch(
      /providerPayment\.status !== 'succeeded'\s*\|\|\s*providerPayment\.paid !== true/,
    );
    expect(service).toContain("providerPayment.status === 'pending'");
    expect(service).toContain("providerPayment.status === 'unknown'");
  });

  it('keeps the disposable bridge out of legacy subscription owners', () => {
    const bot = source(join(REPOSITORY_ROOT, 'ai администратор', 'bot.py'));
    const pwa = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'webhook_server.py'),
    );
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_subscription_activation_shadow_bridge.py',
      ),
    );

    expect(bot).not.toContain('maya_subscription_activation_shadow_bridge');
    expect(pwa).not.toContain('maya_subscription_activation_shadow_bridge');
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('create_subscription');
    expect(bridge).not.toContain('create_payment');
    expect(bridge).not.toContain('update_subscription');
  });
});
