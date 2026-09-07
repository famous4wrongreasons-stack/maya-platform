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

describe('Package 5 B13 control-plane remediation', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const database = read('ai администратор/database.py');
  const growth = read('ai администратор/growth_planner.py');
  const app = read('сайт и приложение/app.html');
  const site = read('maya-os-site/index.html');
  const proxy = read('сайт и приложение/pwa-assets/tg-auth/api-proxy.php');

  it('keeps the active PWA under the B13 deployment guard', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = execFileSync('python3', [guard, '--root', pwa, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b13LegacyControlPlaneOwners: 0,
    });
    execFileSync(
      'python3',
      [
        '-m',
        'unittest',
        resolve(pwa, 'test_package5_control_plane_runtime_guard.py'),
      ],
      { cwd: root, stdio: 'pipe' },
    );
  });

  it('removes raw Telegram staff, manager, bind-code and cashier authority', () => {
    const resolver = pythonFunction(webhook, '_panel_resolve_role');
    expect(resolver).toContain('canonical_staff_access.panel_role');
    expect(resolver).not.toMatch(
      /panel_manager_ids|get_master_by_chat_id|can_redeem|is_master=True|is_cashier=True/,
    );
    for (const name of ['panel_team_handler', 'panel_managers_handler']) {
      const handler = pythonFunction(webhook, name);
      expect(handler).toContain('CrmStaffAccess');
      expect(handler).toContain('configure_crm_staff_access');
      expect(handler).toContain('business_mutations');
      expect(handler).not.toMatch(
        /create_master_with_bind_code|reset_master_bind_code|set_cashier_role|_panel_set_manager_ids/,
      );
    }
    for (const name of [
      'set_cashier_role',
      'create_master_with_bind_code',
      'reset_master_bind_code',
      'bind_master',
      'unbind_master',
    ]) {
      const fn = pythonFunction(database, name);
      expect(fn).toMatch(
        /canonical_(?:crm_staff_access|package4_value_authority)_required/,
      );
      expect(fn).not.toMatch(/with _db\(\)|\.execute\(/);
    }
    expect(pythonFunction(database, 'can_redeem_codes')).toContain(
      'return False',
    );
    const bindCli = read('ai администратор/generate_bind_codes.py');
    expect(bindCli).toContain('configure_crm_staff_access');
    expect(bindCli).not.toMatch(
      /create_master_with_bind_code|reset_master_bind_code|DELETE FROM masters_telegram/,
    );
    const briefRecipients = pythonFunction(webhook, '_growth_role_recipients');
    expect(briefRecipients).toContain(
      'p5_b13_raw_telegram_manager_brief_authority_disabled',
    );
    expect(briefRecipients).not.toMatch(
      /panel_manager_ids|database\.list_admins/,
    );
  });

  it('retires daily, dated-growth and workstation mutations while retaining A22 monthly target', () => {
    const route = pythonFunction(webhook, 'panel_plan_target_handler');
    const legacy = pythonFunction(growth, 'set_growth_goal');
    for (const source of [route, legacy]) {
      expect(source).toContain('legacy_business_goal_mutation_retired');
      expect(source).toContain('update_finance_dashboard_preferences');
      expect(source).toContain('business_mutations');
      expect(source).not.toMatch(
        /database\.set_setting|_save_json_setting|calculate_growth_plan/,
      );
    }
    const a22 = read(
      'maya-saas-backend/src/action-engine/package5-wave1-executable.contract.ts',
    );
    const dashboard = read(
      'maya-saas-backend/src/dashboard-preferences/dashboard-preferences.service.ts',
    );
    expect(a22).toContain('update_finance_dashboard_preferences');
    expect(dashboard).toContain('updateFinance');
    expect(app).toContain("meWidgetAf('/me/dashboard/finance'");
  });

  it('makes GOD subscribers a canonical read-only projection', () => {
    const handler = pythonFunction(webhook, 'god_subscribers_handler');
    expect(handler).toContain(
      'p5_b13_god_subscribers_read_only_canonical_projection',
    );
    expect(handler).toContain('/api/admin/tenants');
    expect(handler).toContain('action != "list"');
    expect(handler).not.toMatch(
      /database\.(?:add_maya_tenant|set_maya_tenant_status|list_maya_tenants)/,
    );
    for (const name of ['add_maya_tenant', 'set_maya_tenant_status']) {
      const fn = pythonFunction(database, name);
      expect(fn).toMatch(
        /canonical_(?:trial_activation|a26_tenant_lifecycle)_required/,
      );
      expect(fn).not.toMatch(/with _db\(\)|\.execute\(/);
    }
    expect(proxy).toContain("if ($action === 'god_subscribers')");
    expect(proxy).toContain("str_starts_with($incoming_auth, 'Bearer ')");
    expect(app).toContain("meWidgetAf('/admin/tenants')");
    expect(site).toContain("meWidgetAf('/admin/tenants')");
  });

  it('removes B13 mutation calls from both PWA bundles', () => {
    for (const source of [app, site]) {
      expect(source).not.toMatch(/gfetch\('panel_plan_target'/);
      expect(source).not.toMatch(
        /pfetch\('panel_team',[\s\S]{0,160}mode:\s*'(?:bind_code|cashier)'/,
      );
      expect(source).not.toMatch(
        /gfetch\('god_subscribers',[\s\S]{0,180}action:\s*'(?:add|set_status)'/,
      );
      expect(source).toContain('Дневной план выведен из эксплуатации');
      expect(source).toContain('Telegram bind-коды выведены из эксплуатации');
      expect(source).toContain('canonical_admin_tenants');
    }
  });

  it('preserves canonical A16, TrialActivation, A26 and Package 4 owners', () => {
    const a16 = read(
      'maya-saas-backend/src/action-engine/package5-wave2-executable.contract.ts',
    );
    const admin = read('maya-saas-backend/src/admin/admin.service.ts');
    const trial = read(
      'maya-saas-backend/src/onboarding/canonical-trial-onboarding.service.ts',
    );
    expect(a16).toContain('configure_crm_staff_access');
    expect(admin).toContain('this.canonicalTrial.activate');
    expect(admin).toContain("operation: 'update_tenant_configuration'");
    expect(admin).toContain("'suspend_tenant'");
    expect(admin).toContain("'reactivate_tenant'");
    expect(trial).toContain('this.bootstrapper.activate');
  });
});
