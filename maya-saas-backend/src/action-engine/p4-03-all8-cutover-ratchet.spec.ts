import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = false;

const LEGACY_BYPASS_GROUPS = [
  {
    actionClass: 'earn_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['async def run_earning_job', 'add_loyalty_transaction'],
  },
  {
    actionClass: 'expire_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['async def run_expiry_job', 'add_loyalty_transaction'],
  },
  {
    actionClass: 'redeem_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['def apply_redemption_for_booking', 'redeem_loyalty_points'],
  },
  {
    actionClass: 'refund_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['def refund_for_cancelled_record', 'add_loyalty_transaction'],
  },
  {
    actionClass: 'import_legacy_loyalty_balance',
    file: 'ai администратор/loyalty.py',
    tokens: ['def import_yclients_loyalty_balance', 'add_loyalty_transaction'],
  },
  {
    actionClass: 'backfill_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['def lazy_backfill_for_client', 'add_loyalty_transaction'],
  },
  {
    actionClass: 'issue_loyalty_redemption_grant',
    file: 'ai администратор/loyalty.py',
    tokens: ['def generate_redeem_code', 'create_loyalty_code'],
  },
  {
    actionClass: 'consume_loyalty_redemption_grant',
    file: 'ai администратор/loyalty.py',
    tokens: ['def consume_redeem_code', 'claim_loyalty_code'],
  },
] as const;

function currentLegacyBypasses(): string[] {
  return LEGACY_BYPASS_GROUPS.filter((group) => {
    const source = readFileSync(join(ROOT, group.file), 'utf8');
    return group.tokens.every((token) => source.includes(token));
  }).map((group) => group.actionClass);
}

describe('P4-03 all-8 production cutover ratchet', () => {
  it('tracks the exact eight accepted legacy direct-mutation subgroups', () => {
    expect(LEGACY_BYPASS_GROUPS.map((group) => group.actionClass)).toEqual([
      'earn_legacy_loyalty',
      'expire_legacy_loyalty',
      'redeem_legacy_loyalty',
      'refund_legacy_loyalty',
      'import_legacy_loyalty_balance',
      'backfill_legacy_loyalty',
      'issue_loyalty_redemption_grant',
      'consume_loyalty_redemption_grant',
    ]);
    const bypasses = currentLegacyBypasses();
    if (CUTOVER_ENABLED) {
      expect(bypasses).toEqual([]);
    } else {
      expect(bypasses).toHaveLength(8);
    }
  });

  it('keeps the executable proof service production-unreachable before cutover', () => {
    const moduleSource = readFileSync(
      join(ROOT, 'maya-saas-backend', 'src', 'loyalty', 'loyalty.module.ts'),
      'utf8',
    );
    const controllerSources = [
      'loyalty.controller.ts',
      'legacy-loyalty-shadow.controller.ts',
      'legacy-loyalty-expiry-shadow.controller.ts',
      'legacy-loyalty-redemption-shadow.controller.ts',
      'legacy-loyalty-refund-shadow.controller.ts',
      'legacy-loyalty-import-shadow.controller.ts',
      'legacy-loyalty-backfill-shadow.controller.ts',
      'legacy-loyalty-grant-issue-shadow.controller.ts',
      'legacy-loyalty-grant-consume-shadow.controller.ts',
    ].map((file) =>
      readFileSync(
        join(ROOT, 'maya-saas-backend', 'src', 'loyalty', file),
        'utf8',
      ),
    );

    expect(CUTOVER_ENABLED).toBe(false);
    expect(moduleSource).not.toContain('P403LegacyLoyaltyExecutableService');
    for (const source of controllerSources) {
      expect(source).not.toContain('.execute.v1');
      expect(source).not.toContain('P403LegacyLoyaltyExecutableService');
    }
  });

  it('keeps the deferred redemption provider projection physically non-writing', () => {
    const providerSource = readFileSync(
      join(ROOT, 'ai администратор', 'yclients.py'),
      'utf8',
    );
    const providerMethod = providerSource.slice(
      providerSource.indexOf('    def mark_record_loyalty_redemption('),
      providerSource.indexOf('    def append_record_comment('),
    );
    const executableService = readFileSync(
      join(
        ROOT,
        'maya-saas-backend',
        'src',
        'loyalty',
        'p4-03-legacy-loyalty-executable.service.ts',
      ),
      'utf8',
    );

    expect(providerMethod).toContain(
      'loyalty_record_adjustment_requires_action_contract',
    );
    expect(providerMethod).toContain('"retry_allowed": False');
    expect(providerMethod).not.toContain('self._put');
    expect(providerMethod).not.toContain('self._post');
    expect(providerMethod).not.toContain('dispatch_appointment_action');
    expect(executableService).not.toContain('mark_record_loyalty_redemption');
    expect(executableService).toContain('providerWrites: 0');
  });
});
