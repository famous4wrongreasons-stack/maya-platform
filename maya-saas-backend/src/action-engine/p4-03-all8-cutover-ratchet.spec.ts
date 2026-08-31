import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = true;

const LEGACY_BYPASS_GROUPS = [
  {
    actionClass: 'earn_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['async def run_earning_job', 'add_loyalty_transaction'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'async def run_earning_job',
        marker:
          'return _legacy_loyalty_mutation_disabled("earn_legacy_loyalty")',
        before: 'database.add_loyalty_transaction',
      },
    ],
  },
  {
    actionClass: 'expire_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['async def run_expiry_job', 'add_loyalty_transaction'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'async def run_expiry_job',
        marker:
          'return _legacy_loyalty_mutation_disabled("expire_legacy_loyalty")',
        before: 'database.add_loyalty_transaction',
      },
    ],
  },
  {
    actionClass: 'redeem_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['def apply_redemption_for_booking', 'redeem_loyalty_points'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'def apply_redemption_for_booking',
        marker:
          'return _legacy_loyalty_mutation_disabled("redeem_legacy_loyalty")',
        before: 'database.redeem_loyalty_points',
      },
      {
        file: 'ai администратор/webhook_server.py',
        entrypoint: 'async def client_book_with_loyalty_handler',
        marker: '"error": "p4_03_legacy_mutation_disabled"',
        before: 'database.reserve_loyalty_points',
      },
    ],
  },
  {
    actionClass: 'refund_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['def refund_for_cancelled_record', 'add_loyalty_transaction'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'def refund_for_cancelled_record',
        marker:
          'return _legacy_loyalty_mutation_disabled("refund_legacy_loyalty")',
        before: 'database.add_loyalty_transaction',
      },
    ],
  },
  {
    actionClass: 'import_legacy_loyalty_balance',
    file: 'ai администратор/loyalty.py',
    tokens: ['def import_yclients_loyalty_balance', 'add_loyalty_transaction'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'def import_yclients_loyalty_balance',
        marker:
          'return _legacy_loyalty_mutation_disabled("import_legacy_loyalty_balance")',
        before: 'database.add_loyalty_transaction',
      },
    ],
  },
  {
    actionClass: 'backfill_legacy_loyalty',
    file: 'ai администратор/loyalty.py',
    tokens: ['def lazy_backfill_for_client', 'add_loyalty_transaction'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'def lazy_backfill_for_client',
        marker:
          'return _legacy_loyalty_mutation_disabled("backfill_legacy_loyalty")',
        before: 'database.add_loyalty_transaction',
      },
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'async def run_backfill_job',
        marker:
          'return _legacy_loyalty_mutation_disabled("backfill_legacy_loyalty")',
        before: 'database.add_loyalty_transaction',
      },
    ],
  },
  {
    actionClass: 'issue_loyalty_redemption_grant',
    file: 'ai администратор/loyalty.py',
    tokens: ['def generate_redeem_code', 'create_loyalty_code'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'def generate_redeem_code',
        marker: '"issue_loyalty_redemption_grant"',
        before: 'database.create_loyalty_code',
      },
    ],
  },
  {
    actionClass: 'consume_loyalty_redemption_grant',
    file: 'ai администратор/loyalty.py',
    tokens: ['def consume_redeem_code', 'claim_loyalty_code'],
    guards: [
      {
        file: 'ai администратор/loyalty.py',
        entrypoint: 'def consume_redeem_code',
        marker: '"consume_loyalty_redemption_grant"',
        before: 'database.claim_loyalty_code',
      },
    ],
  },
] as const;

type SourceOverrides = ReadonlyMap<string, string>;

function source(file: string, overrides?: SourceOverrides): string {
  return overrides?.get(file) ?? readFileSync(join(ROOT, file), 'utf8');
}

function hasImmediateFailClosedGuard(
  guardSource: string,
  guard: {
    entrypoint: string;
    marker: string;
    before: string;
  },
): boolean {
  const start = guardSource.indexOf(guard.entrypoint);
  if (start < 0) return false;
  const rest = guardSource.slice(start + guard.entrypoint.length);
  const nextFunction = rest.search(/\n(?:async )?def /);
  const body = nextFunction < 0 ? rest : rest.slice(0, nextFunction);
  const marker = body.indexOf(guard.marker);
  const mutation = body.indexOf(guard.before);
  return marker >= 0 && mutation >= 0 && marker < mutation;
}

function currentLegacyBypasses(overrides?: SourceOverrides): string[] {
  return LEGACY_BYPASS_GROUPS.filter((group) => {
    const ownerSource = source(group.file, overrides);
    const directOwnerPresent = group.tokens.every((token) =>
      ownerSource.includes(token),
    );
    const failClosed = group.guards.every((guard) => {
      const guardSource = source(guard.file, overrides);
      return hasImmediateFailClosedGuard(guardSource, guard);
    });
    return directOwnerPresent && !failClosed;
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

  it('registers the canonical executor without exposing a caller-authoritative raw endpoint', () => {
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

    expect(CUTOVER_ENABLED).toBe(true);
    expect(moduleSource).toContain('P403LegacyLoyaltyExecutableService');
    expect(moduleSource).toContain(
      'exports: [LoyaltyService, P403LegacyLoyaltyExecutableService]',
    );
    for (const source of controllerSources) {
      expect(source).not.toContain('.execute.v1');
      expect(source).not.toContain('P403LegacyLoyaltyExecutableService');
    }
  });

  it('still detects a real direct owner when an accepted fail-closed guard is removed', () => {
    const file = 'ai администратор/loyalty.py';
    const unguarded = source(file).replace(
      'return _legacy_loyalty_mutation_disabled("earn_legacy_loyalty")',
      'pass  # simulated direct owner regression',
    );

    expect(currentLegacyBypasses(new Map([[file, unguarded]]))).toContain(
      'earn_legacy_loyalty',
    );
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
