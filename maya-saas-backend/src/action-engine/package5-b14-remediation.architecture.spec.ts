import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const pwa = resolve(root, 'ai администратор');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function pythonFunction(source: string, name: string) {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!match) throw new Error(`Missing production function ${name}`);
  return match[0];
}

describe('Package 5 B14 GOD billing and overview remediation', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const app = read('сайт и приложение/app.html');
  const site = read('maya-os-site/index.html');
  const proxy = read('сайт и приложение/pwa-assets/tg-auth/api-proxy.php');

  it('keeps the active PWA under the B13/B14 deployment guard', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = execFileSync('python3', [guard, '--root', pwa, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b13LegacyControlPlaneOwners: 0,
      b14LegacyGodOwners: 0,
    });
  });

  it('retires caller-supplied renewal and AI budget mutations', () => {
    const billing = pythonFunction(webhook, 'god_billing_handler');
    expect(billing).toContain('p5_b14_legacy_god_billing_mutations_retired');
    expect(billing).toContain('action != "view"');
    expect(billing).toContain('god_billing_controls_retired');
    expect(billing).toContain('"read_only": True');
    expect(billing).toContain('"business_mutations": 0');
    expect(billing).not.toMatch(
      /database\.(?:set_setting|get_setting)|_god_(?:set|get)_renewals|_god_ai_budget_usd|body\.get\("(?:usd|due_date|amount)"\)/,
    );
    const renewals = pythonFunction(webhook, '_god_renewals_view');
    expect(renewals).toContain('p5_b14_legacy_renewal_tracker_retired');
    expect(renewals).toContain('return []');
    expect(renewals).not.toMatch(/database\.|GOD_DEFAULT_RENEWALS/);
  });

  it('keeps GOD overview and health diagnostic paths read-only', () => {
    const overview = pythonFunction(webhook, 'god_overview_handler');
    expect(overview).toContain('p5_b14_god_overview_canonical_projection_only');
    expect(overview).toContain('canonical_admin_tenants');
    expect(overview).toContain('"status": "unavailable"');
    expect(overview).not.toMatch(
      /list_maya_tenants|_god_renewals_view|database\.set_setting/,
    );

    const health = pythonFunction(webhook, '_god_health_checks');
    expect(health).toContain('p5_b14_god_health_read_only');
    expect(health).toContain('repair=False');
    expect(health).not.toMatch(
      /database\.set_setting|god_probe_ts|_god_ai_budget_usd|_god_renewals_view|repair=True/,
    );
  });

  it('removes retired mutation controls from both published PWA sources', () => {
    for (const source of [app, site]) {
      expect(source).not.toMatch(/function editRenewal|function editBudget/);
      expect(source).not.toMatch(/action:\s*'(?:set_renewal|set_budget)'/);
      expect(source).not.toContain('Оплаты к продлению');
      expect(source).not.toContain('Бюджет ИИ (месяц)');
      expect(source).toContain('Фактический расход ИИ');
      expect(source).toContain('Canonical данные временно недоступны');
    }
  });

  it('rejects retired controls at the published proxy boundary', () => {
    expect(proxy).toContain("$action === 'god_billing'");
    expect(proxy).toContain("($input['action'] ?? 'view') !== 'view'");
    expect(proxy).toContain("'error' => 'god_billing_controls_retired'");
    expect(proxy).toContain("'business_mutations' => 0");
  });

  it('preserves Package 4 subscription and payment ownership', () => {
    const subscriptions = read(
      'maya-saas-backend/src/action-engine/p4-05-customer-subscription-executable.contract.ts',
    );
    expect(subscriptions).toContain('initiate_customer_subscription_purchase');
    expect(subscriptions).toContain('initiate_customer_subscription_renewal');
    expect(subscriptions).toContain('activate_customer_subscription_renewal');
  });
});
