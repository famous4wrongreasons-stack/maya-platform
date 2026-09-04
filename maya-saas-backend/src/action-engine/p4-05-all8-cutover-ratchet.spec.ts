import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_05_EXECUTABLE_CAPABILITIES,
  P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
} from './p4-05-customer-subscription-executable.contract';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = true;
const LEGACY_BOT = 'ai администратор/bot.py';
const LEGACY_WEB = 'ai администратор/webhook_server.py';
const LEGACY_JOB = 'ai администратор/subscriptions.py';
const LEGACY_DB = 'ai администратор/database.py';
const PRODUCTION_MODULE =
  'maya-saas-backend/src/customer-subscriptions/customer-subscriptions.module.ts';
const CANONICAL_OWNER =
  'maya-saas-backend/src/customer-subscriptions/p4-05-customer-subscription-executable.service.ts';
const PROVIDER_ADAPTER =
  'maya-saas-backend/src/customer-subscriptions/p4-05-yookassa-checkout-provider.ts';

type DirectMutationSubgroup =
  | 'checkout_and_provider_correlation'
  | 'payment_success_activation'
  | 'usage_consumption'
  | 'terminal_lifecycle';

interface Guard {
  file: string;
  entrypoint: string;
  marker: string;
  mutation: string;
  canonical?: readonly string[];
}

const SUBGROUP_GUARDS: Readonly<
  Record<DirectMutationSubgroup, readonly Guard[]>
> = {
  checkout_and_provider_correlation: [
    {
      file: LEGACY_BOT,
      entrypoint: 'async def _start_subscription_purchase',
      marker:
        'p4_05_legacy_mutation_disabled:initiate_customer_subscription_purchase',
      mutation: 'database.create_subscription(',
    },
    {
      file: LEGACY_WEB,
      entrypoint: 'async def sub_create_handler',
      marker: 'purchase_bridge.initiate_purchase',
      mutation: 'database.create_subscription(',
      canonical: [
        'client_commands.channel_proof',
        'purchase_bridge.initiate_purchase',
      ],
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def create_subscription',
      marker:
        'raise RuntimeError("p4_05_legacy_mutation_disabled:initiate_customer_subscription_purchase")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def set_subscription_payment_id',
      marker:
        'raise RuntimeError("p4_05_legacy_mutation_disabled:provider_payment_correlation")',
      mutation: 'conn.execute',
    },
  ],
  payment_success_activation: [
    {
      file: LEGACY_BOT,
      entrypoint: 'async def _poll_subscription_payment',
      marker: 'p4_05_legacy_mutation_disabled:activate_customer_subscription',
      mutation: 'database.update_subscription_status(',
    },
    {
      file: LEGACY_BOT,
      entrypoint: 'async def _activate_paid_subscription',
      marker: 'p4_05_legacy_mutation_disabled:activate_customer_subscription',
      mutation: 'database.activate_subscription(',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def activate_subscription',
      marker:
        'raise RuntimeError("p4_05_legacy_mutation_disabled:activate_customer_subscription")',
      mutation: 'conn.execute',
    },
  ],
  usage_consumption: [
    {
      file: LEGACY_JOB,
      entrypoint: 'async def sync_subscription_usage',
      marker: 'p4_05_legacy_mutation_disabled:sync_customer_subscription_usage',
      mutation: 'database.update_subscription_usage(',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def update_subscription_usage',
      marker:
        'raise RuntimeError("p4_05_legacy_mutation_disabled:sync_customer_subscription_usage")',
      mutation: 'conn.execute',
    },
  ],
  terminal_lifecycle: [
    {
      file: LEGACY_JOB,
      entrypoint: 'async def run_subscriptions_job',
      marker: 'p4_05_legacy_mutation_disabled:subscription_scheduler',
      mutation: 'database.update_subscription_status(',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def update_subscription_status',
      marker:
        'raise RuntimeError("p4_05_legacy_mutation_disabled:terminal_subscription_lifecycle")',
      mutation: 'conn.execute',
    },
  ],
};

type SourceOverrides = ReadonlyMap<string, string>;

function source(path: string, overrides?: SourceOverrides): string {
  return overrides?.get(path) ?? readFileSync(join(ROOT, path), 'utf8');
}

function functionBody(contents: string, entrypoint: string): string {
  const start = contents.indexOf(entrypoint);
  if (start < 0) return '';
  const rest = contents.slice(start + entrypoint.length);
  const nextFunction = rest.search(/\n(?:async )?def /u);
  return nextFunction < 0 ? rest : rest.slice(0, nextFunction);
}

function isFailClosed(guard: Guard, overrides?: SourceOverrides): boolean {
  const body = functionBody(source(guard.file, overrides), guard.entrypoint);
  const marker = body.indexOf(guard.marker);
  const mutation = body.indexOf(guard.mutation);
  if (guard.canonical) {
    return (
      mutation < 0 &&
      guard.canonical.every((required) => body.includes(required))
    );
  }
  return marker >= 0 && mutation >= 0 && marker < mutation;
}

function currentLegacyBypasses(
  overrides?: SourceOverrides,
): DirectMutationSubgroup[] {
  return (
    Object.entries(SUBGROUP_GUARDS) as Array<
      [DirectMutationSubgroup, readonly Guard[]]
    >
  )
    .filter(([, guards]) =>
      guards.some((guard) => !isFailClosed(guard, overrides)),
    )
    .map(([subgroup]) => subgroup);
}

describe('P4-05 all-8 production cutover ratchet', () => {
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

  it('wires the canonical executable owner without exposing a raw execution endpoint', () => {
    const module = source(PRODUCTION_MODULE);
    expect(CUTOVER_ENABLED).toBe(true);
    expect(source(CANONICAL_OWNER)).toContain(
      'this.actionEngine.executeWithReceipt(',
    );
    expect(module).toContain('P405CustomerSubscriptionExecutableService');
    expect(module).toContain(
      'exports: [P405CustomerSubscriptionExecutableService]',
    );
    expect(module).not.toContain('.execute.v1');
  });

  it('keeps provider ambiguity on same-key byte-equivalent reconciliation only', () => {
    const adapter = source(PROVIDER_ADAPTER);
    expect(adapter).toContain('input.idempotencyKey');
    expect(adapter).toContain('this.request(input)');
    expect(adapter).toContain("return { outcome: 'UNKNOWN' }");
    expect(adapter).not.toContain('randomUUID');
    expect(adapter).not.toContain('Math.random');
  });

  it('reduces the one legacy family bypass group and all four mutation subgroups to zero', () => {
    expect(Object.keys(SUBGROUP_GUARDS)).toHaveLength(4);
    expect(currentLegacyBypasses()).toEqual([]);
  });

  it('still detects a genuine direct mutation owner if a fail-closed guard is removed', () => {
    const unguarded = source(LEGACY_DB).replace(
      'raise RuntimeError("p4_05_legacy_mutation_disabled:sync_customer_subscription_usage")',
      'pass  # simulated direct owner regression',
    );
    expect(currentLegacyBypasses(new Map([[LEGACY_DB, unguarded]]))).toContain(
      'usage_consumption',
    );
  });

  it('still detects a direct checkout write added beside the verified P4-05 initiator', () => {
    const directWeb = source(LEGACY_WEB).replace(
      'purchase_bridge.initiate_purchase,',
      'purchase_bridge.initiate_purchase,\n            database.create_subscription(client_id=1),',
    );
    expect(currentLegacyBypasses(new Map([[LEGACY_WEB, directWeb]]))).toContain(
      'checkout_and_provider_correlation',
    );
  });

  it('keeps all eight completed Shadow paths non-executable', () => {
    for (const file of [
      'customer-subscription-purchase-shadow.service.ts',
      'customer-subscription-activation-shadow.service.ts',
      'customer-subscription-renewal-shadow.service.ts',
      'customer-subscription-renewal-activation-shadow.service.ts',
      'customer-subscription-usage-shadow.service.ts',
      'customer-subscription-expiry-shadow.service.ts',
      'customer-subscription-cancellation-shadow.service.ts',
      'customer-subscription-revocation-shadow.service.ts',
    ]) {
      const contents = source(
        `maya-saas-backend/src/customer-subscriptions/${file}`,
      );
      expect(contents).not.toContain('executeWithReceipt(');
      expect(contents).not.toContain('p4_05_legacy_mutation_disabled');
    }
  });
});
