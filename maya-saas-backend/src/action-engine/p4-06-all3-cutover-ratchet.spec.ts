import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { P4_06_EXECUTABLE_CAPABILITIES } from './p4-06-gift-certificate-executable.contract';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = false;
const LEGACY_BOT = 'ai администратор/bot.py';
const LEGACY_WEB = 'ai администратор/webhook_server.py';
const LEGACY_DB = 'ai администратор/database.py';
const LEGACY_BLUEPRINT = 'ai администратор/saas_blueprint/pg/db_pg_full.py';
const PRODUCTION_MODULE =
  'maya-saas-backend/src/gift-certificates/gift-certificates.module.ts';
const CANONICAL_OWNER =
  'maya-saas-backend/src/gift-certificates/p4-06-gift-certificate-executable.service.ts';

type DirectMutationSubgroup =
  | 'checkout_and_provider_reference'
  | 'payment_success_activation'
  | 'full_redemption';

type SourceOverrides = ReadonlyMap<string, string>;

function source(path: string, overrides?: SourceOverrides): string {
  return overrides?.get(path) ?? readFileSync(join(ROOT, path), 'utf8');
}

function directMutationSubgroups(
  overrides?: SourceOverrides,
): DirectMutationSubgroup[] {
  const bot = source(LEGACY_BOT, overrides);
  const web = source(LEGACY_WEB, overrides);
  const database = source(LEGACY_DB, overrides);
  const blueprint = source(LEGACY_BLUEPRINT, overrides);
  const result: DirectMutationSubgroup[] = [];
  if (
    bot.includes('database.save_gift_certificate(') ||
    web.includes('database.save_gift_certificate(') ||
    database.includes('INSERT INTO gift_certificates') ||
    blueprint.includes('INSERT INTO gift_certificates')
  ) {
    result.push('checkout_and_provider_reference');
  }
  if (
    bot.includes('database.mark_cert_paid(') ||
    database.includes("payment_status = 'paid'") ||
    blueprint.includes("payment_status = 'paid'")
  ) {
    result.push('payment_success_activation');
  }
  if (
    bot.includes('database.mark_cert_used(') ||
    web.includes('database.mark_cert_used(') ||
    database.includes('SET used_at = ?, used_by_admin_id = ?') ||
    blueprint.includes(
      'UPDATE gift_certificates SET used_at = ?, used_by_admin_id = ?',
    )
  ) {
    result.push('full_redemption');
  }
  return result;
}

describe('P4-06 all-3 production cutover ratchet readiness', () => {
  it('registers all three canonical Action Engine owners', () => {
    const registry = new ActionCapabilityRegistry();
    expect(
      Object.values(P4_06_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).executorKey,
      ),
    ).toEqual([
      'gift-certificates.checkout',
      'gift-certificates.activation',
      'gift-certificates.redemption',
    ]);
  });

  it('keeps the executable proof owner isolated from production wiring', () => {
    expect(CUTOVER_ENABLED).toBe(false);
    expect(source(CANONICAL_OWNER)).toContain(
      'this.actionEngine.executeWithReceipt(',
    );
    expect(source(PRODUCTION_MODULE)).not.toContain(
      'P406GiftCertificateExecutableService',
    );
  });

  it('locks one pre-cutover family group and exactly three direct mutation subgroups', () => {
    expect(directMutationSubgroups()).toEqual([
      'checkout_and_provider_reference',
      'payment_success_activation',
      'full_redemption',
    ]);
  });

  it('has a prepared zero-bypass state only after every real owner is disabled', () => {
    const disabled = new Map<string, string>([
      [LEGACY_BOT, ''],
      [LEGACY_WEB, ''],
      [LEGACY_DB, ''],
      [LEGACY_BLUEPRINT, ''],
    ]);
    expect(directMutationSubgroups(disabled)).toEqual([]);
  });

  it('still detects a genuine direct writer in the prepared zero-bypass state', () => {
    const synthetic = new Map<string, string>([
      [LEGACY_BOT, 'database.mark_cert_used(code, actor)'],
      [LEGACY_WEB, ''],
      [LEGACY_DB, ''],
      [LEGACY_BLUEPRINT, ''],
    ]);
    expect(directMutationSubgroups(synthetic)).toEqual(['full_redemption']);
  });

  it('preserves all three Shadow paths as non-executable planners', () => {
    for (const file of [
      'gift-certificate-purchase-shadow.service.ts',
      'gift-certificate-activation-shadow.service.ts',
      'gift-certificate-redemption-shadow.service.ts',
    ]) {
      const contents = source(
        `maya-saas-backend/src/gift-certificates/${file}`,
      );
      expect(contents).toContain('planShadow(');
      expect(contents).not.toContain('executeWithReceipt(');
    }
  });
});
