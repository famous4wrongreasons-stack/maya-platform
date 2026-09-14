import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-05 initiate_customer_subscription_purchase Shadow architecture', () => {
  it('stops at planShadow before provider, payment, subscription, or message mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-purchase-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow(request)');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /customerSubscription\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('yukassa_api');
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'initiate_customer_subscription_purchase',[\s\S]{0,1100}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1100}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1100}executorKey: 'shadow\.none'/,
    );
  });

  it('keeps activation separate and makes PENDING known while Shadow has no UNKNOWN', () => {
    const contract = source(
      join(
        SRC_ROOT,
        'action-engine',
        'customer-subscription-purchase-shadow.contract.ts',
      ),
    );

    expect(contract).toContain("checkoutMode: 'initial_purchase'");
    expect(contract).toContain("expectedProviderState: 'PENDING'");
    expect(contract).toContain('unknownApplicable: false');
    expect(contract).toContain('activatesSubscription: false');
    expect(contract).not.toContain(
      "actionClass: 'activate_customer_subscription'",
    );
  });

  it('does not wire the disposable bridge fixture into the production legacy owner', () => {
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
        'maya_subscription_purchase_shadow_bridge.py',
      ),
    );
    const appModule = source(join(SRC_ROOT, 'app.module.ts'));

    expect(legacyBot).not.toContain('maya_subscription_purchase_shadow_bridge');
    expect(legacyPwa).not.toContain('maya_subscription_purchase_shadow_bridge');
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('create_subscription');
    expect(bridge).not.toContain('create_payment');
    expect(bridge).not.toContain('send_message');
    expect(appModule).toContain('CustomerSubscriptionsModule');
  });
});
