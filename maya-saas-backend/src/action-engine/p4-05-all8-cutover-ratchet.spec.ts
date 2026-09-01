import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_05_EXECUTABLE_CAPABILITIES,
  P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
} from './p4-05-customer-subscription-executable.contract';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = false;
const LEGACY_BOT = 'ai администратор/bot.py';
const LEGACY_WEB = 'ai администратор/webhook_server.py';
const LEGACY_JOB = 'ai администратор/subscriptions.py';
const LEGACY_DB = 'ai администратор/database.py';
const PRODUCTION_MODULE =
  'maya-saas-backend/src/customer-subscriptions/customer-subscriptions.module.ts';
const CANONICAL_OWNER =
  'maya-saas-backend/src/customer-subscriptions/p4-05-customer-subscription-executable.service.ts';

type DirectMutationSubgroup =
  | 'checkout_and_provider_correlation'
  | 'payment_success_activation'
  | 'usage_consumption'
  | 'terminal_lifecycle';

type SourceOverrides = ReadonlyMap<string, string>;

function source(path: string, overrides?: SourceOverrides): string {
  return overrides?.get(path) ?? readFileSync(join(ROOT, path), 'utf8');
}

function directMutationSubgroups(
  overrides?: SourceOverrides,
): DirectMutationSubgroup[] {
  const bot = source(LEGACY_BOT, overrides);
  const web = source(LEGACY_WEB, overrides);
  const job = source(LEGACY_JOB, overrides);
  const db = source(LEGACY_DB, overrides);
  const result: DirectMutationSubgroup[] = [];
  if (
    bot.includes('database.create_subscription(') ||
    web.includes('database.create_subscription(') ||
    db.includes('INSERT INTO subscriptions')
  ) {
    result.push('checkout_and_provider_correlation');
  }
  if (
    bot.includes('database.activate_subscription(sub_id)') ||
    db.includes("UPDATE subscriptions SET status = 'active'")
  ) {
    result.push('payment_success_activation');
  }
  if (
    job.includes('database.update_subscription_usage(') ||
    db.includes('UPDATE subscriptions SET visits_used = ?')
  ) {
    result.push('usage_consumption');
  }
  if (
    job.includes('database.update_subscription_status(sub["id"], "expired")') ||
    db.includes('UPDATE subscriptions SET status = ? WHERE id = ?')
  ) {
    result.push('terminal_lifecycle');
  }
  return result;
}

describe('P4-05 all-8 production cutover ratchet readiness', () => {
  it('registers all eight canonical Action Engine owners and bounded scheduler envelope', () => {
    const registry = new ActionCapabilityRegistry();
    expect(
      Object.values(P4_05_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).executorKey,
      ),
    ).toEqual([
      'customer-subscriptions.checkout',
      'customer-subscriptions.term',
      'customer-subscriptions.checkout',
      'customer-subscriptions.term',
      'customer-subscriptions.usage',
      'customer-subscriptions.terminal',
      'customer-subscriptions.terminal',
      'customer-subscriptions.terminal',
    ]);
    expect(registry.get(P4_05_SCHEDULER_ENVELOPE_CAPABILITY).executorKey).toBe(
      'customer-subscriptions.scheduler-envelope',
    );
  });

  it('keeps executable proof owner isolated from production wiring before cutover', () => {
    expect(CUTOVER_ENABLED).toBe(false);
    expect(source(CANONICAL_OWNER)).toContain(
      'this.actionEngine.executeWithReceipt(',
    );
    expect(source(PRODUCTION_MODULE)).not.toContain(
      'P405CustomerSubscriptionExecutableService',
    );
  });

  it('locks the one current family bypass group and four concrete mutation subgroups', () => {
    expect(directMutationSubgroups()).toEqual([
      'checkout_and_provider_correlation',
      'payment_success_activation',
      'usage_consumption',
      'terminal_lifecycle',
    ]);
  });

  it('will reach zero only when every real legacy owner is fail closed', () => {
    const disabled = new Map<string, string>([
      [
        LEGACY_BOT,
        source(LEGACY_BOT)
          .replaceAll('database.create_subscription(', 'legacy_disabled(')
          .replaceAll(
            'database.activate_subscription(sub_id)',
            'legacy_activation_disabled(sub_id)',
          ),
      ],
      [
        LEGACY_WEB,
        source(LEGACY_WEB).replaceAll(
          'database.create_subscription(',
          'legacy_disabled(',
        ),
      ],
      [
        LEGACY_JOB,
        source(LEGACY_JOB)
          .replaceAll(
            'database.update_subscription_usage(',
            'legacy_usage_disabled(',
          )
          .replaceAll(
            'database.update_subscription_status(sub["id"], "expired")',
            'legacy_terminal_disabled(sub["id"], "expired")',
          ),
      ],
      [
        LEGACY_DB,
        source(LEGACY_DB)
          .replaceAll('INSERT INTO subscriptions', 'LEGACY INSERT DISABLED')
          .replaceAll(
            "UPDATE subscriptions SET status = 'active'",
            'LEGACY ACTIVATE DISABLED',
          )
          .replaceAll(
            'UPDATE subscriptions SET visits_used = ?',
            'LEGACY USAGE DISABLED',
          )
          .replaceAll(
            'UPDATE subscriptions SET status = ? WHERE id = ?',
            'LEGACY TERMINAL DISABLED',
          ),
      ],
    ]);
    expect(directMutationSubgroups(disabled)).toEqual([]);
  });

  it('still detects one genuine direct owner regression after the prepared zero-bypass state', () => {
    const synthetic = new Map<string, string>([
      [LEGACY_BOT, 'database.create_subscription(client_id=1)'],
      [LEGACY_WEB, ''],
      [LEGACY_JOB, ''],
      [LEGACY_DB, ''],
    ]);
    expect(directMutationSubgroups(synthetic)).toEqual([
      'checkout_and_provider_correlation',
    ]);
  });

  it('does not expose a caller-authoritative raw executable controller', () => {
    const module = source(PRODUCTION_MODULE);
    expect(module).not.toContain('.execute.v1');
    expect(module).not.toContain('P405CustomerSubscriptionExecutableService');
  });
});
