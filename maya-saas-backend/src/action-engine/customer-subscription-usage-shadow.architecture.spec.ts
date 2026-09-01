import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-05 sync_customer_subscription_usage Shadow architecture', () => {
  it('stops at planShadow before usage, subscription, payment, provider, or message mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-usage-shadow.service.ts',
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
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'sync_customer_subscription_usage',[\s\S]{0,1400}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1400}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1400}executorKey: 'shadow\.none'/,
    );
  });

  it('derives exact visit, service, quantity, and remaining allowance server-side', () => {
    const dto = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'dto',
        'customer-subscription-usage-shadow.dto.ts',
      ),
    );
    const service = source(
      join(
        SRC_ROOT,
        'customer-subscriptions',
        'customer-subscription-usage-shadow.service.ts',
      ),
    );

    expect(dto).not.toContain('quantity');
    expect(dto).not.toContain('service_id');
    expect(dto).not.toContain('remaining');
    expect(dto).not.toContain('attendance');
    expect(dto).not.toContain('approved');
    expect(service).toContain('getAppointmentDetailForSystem');
    expect(service).toContain("visit.attendance !== 'arrived'");
    expect(service).toContain('remainingUnitsBefore < 1');
    expect(service).toContain('usage_already_claimed');
  });

  it('keeps the disposable bridge outside production legacy owners', () => {
    const legacySubscriptions = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'subscriptions.py'),
    );
    const legacyBot = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'bot.py'),
    );
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_subscription_usage_shadow_bridge.py',
      ),
    );

    expect(legacySubscriptions).not.toContain(
      'maya_subscription_usage_shadow_bridge',
    );
    expect(legacyBot).not.toContain('maya_subscription_usage_shadow_bridge');
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yclients\b/m);
    expect(bridge).not.toContain('update_subscription_usage');
  });
});
