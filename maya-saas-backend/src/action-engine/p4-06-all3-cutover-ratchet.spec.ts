import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { P4_06_EXECUTABLE_CAPABILITIES } from './p4-06-gift-certificate-executable.contract';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = true;
const LEGACY_BOT = 'ai администратор/bot.py';
const LEGACY_WEB = 'ai администратор/webhook_server.py';
const LEGACY_DB = 'ai администратор/database.py';
const LEGACY_BLUEPRINT = 'ai администратор/saas_blueprint/pg/db_pg_full.py';
const PRODUCTION_MODULE =
  'maya-saas-backend/src/gift-certificates/gift-certificates.module.ts';
const CANONICAL_OWNER =
  'maya-saas-backend/src/gift-certificates/p4-06-gift-certificate-executable.service.ts';
const PROVIDER_ADAPTER =
  'maya-saas-backend/src/gift-certificates/p4-06-yookassa-checkout-provider.ts';
const CLAIM_CONTRACT =
  'maya-saas-backend/src/gift-certificates/gift-certificate-claim.contract.ts';

type DirectMutationSubgroup =
  | 'checkout_and_provider_reference'
  | 'payment_success_activation'
  | 'full_redemption';

interface Guard {
  file: string;
  entrypoint: string;
  marker: string;
  mutation: string;
}

const SUBGROUP_GUARDS: Readonly<
  Record<DirectMutationSubgroup, readonly Guard[]>
> = {
  checkout_and_provider_reference: [
    {
      file: LEGACY_BOT,
      entrypoint: 'async def _send_cert_invoice',
      marker:
        'p4_06_legacy_mutation_disabled:initiate_gift_certificate_purchase',
      mutation: 'database.save_gift_certificate(',
    },
    {
      file: LEGACY_WEB,
      entrypoint: 'async def cert_create_handler',
      marker:
        'p4_06_legacy_mutation_disabled:initiate_gift_certificate_purchase',
      mutation: 'database.save_gift_certificate(',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def save_gift_certificate',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:initiate_gift_certificate_purchase")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def set_cert_payment_id',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:provider_payment_correlation")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_BLUEPRINT,
      entrypoint: 'def save_gift_certificate',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:initiate_gift_certificate_purchase")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_BLUEPRINT,
      entrypoint: 'def set_cert_payment_id',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:provider_payment_correlation")',
      mutation: 'conn.execute',
    },
  ],
  payment_success_activation: [
    {
      file: LEGACY_BOT,
      entrypoint: 'async def _poll_payment',
      marker: 'p4_06_legacy_mutation_disabled:activate_gift_certificate',
      mutation: 'database.mark_cert_paid(',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def mark_cert_paid',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:activate_gift_certificate")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def mark_cert_canceled',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:provider_payment_reconciliation")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_BLUEPRINT,
      entrypoint: 'def mark_cert_paid',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:activate_gift_certificate")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_BLUEPRINT,
      entrypoint: 'def mark_cert_canceled',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:provider_payment_reconciliation")',
      mutation: 'conn.execute',
    },
  ],
  full_redemption: [
    {
      file: LEGACY_BOT,
      entrypoint: 'async def handle_callback',
      marker: 'p4_06_legacy_mutation_disabled:redeem_gift_certificate',
      mutation: 'database.mark_cert_used(',
    },
    {
      file: LEGACY_WEB,
      entrypoint: 'async def panel_redeem_handler',
      marker: 'p4_06_legacy_mutation_disabled:redeem_gift_certificate',
      mutation: 'database.mark_cert_used(',
    },
    {
      file: LEGACY_DB,
      entrypoint: 'def mark_cert_used',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:redeem_gift_certificate")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_BLUEPRINT,
      entrypoint: 'def mark_cert_used',
      marker:
        'raise RuntimeError("p4_06_legacy_mutation_disabled:redeem_gift_certificate")',
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
  if (marker < 0) return false;
  if (mutation < 0) return true;
  if (marker >= mutation) return false;
  const barrier = body.slice(marker, mutation);
  return barrier.includes('raise RuntimeError(') || barrier.includes('return');
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

describe('P4-06 all-3 production cutover ratchet', () => {
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

  it('wires the canonical owner without exposing a raw execution endpoint', () => {
    const module = source(PRODUCTION_MODULE);
    expect(CUTOVER_ENABLED).toBe(true);
    expect(source(CANONICAL_OWNER)).toContain(
      'this.actionEngine.executeWithReceipt(',
    );
    expect(module).toContain('P406GiftCertificateExecutableService');
    expect(module).toContain('P406YooKassaCheckoutProvider');
    expect(module).toContain('P406GiftCertificateExecutableService,');
    expect(module).not.toContain('.execute.v1');
  });

  it('keeps UNKNOWN reconciliation on the exact original provider request', () => {
    const adapter = source(PROVIDER_ADAPTER);
    expect(adapter).toContain('input.idempotencyKey');
    expect(adapter).toContain('this.request(input)');
    expect(adapter).toContain("return { outcome: 'UNKNOWN' }");
    expect(adapter).not.toContain('randomUUID');
    expect(adapter).not.toContain('Math.random');
  });

  it('persists only claim lookup material and a non-secret key version', () => {
    const owner = source(CANONICAL_OWNER);
    const claim = source(CLAIM_CONTRACT);
    expect(owner).toContain('presentationKeyVersion');
    expect(owner).toContain('codeHash: material.codeHash');
    expect(owner).toContain('delete result.bearer');
    expect(claim).toContain('export function giftCertificateClaimLookup(');
    expect(claim).toContain('presentationReference');
    expect(claim).not.toContain('rawBearer');
  });

  it('reduces the legacy family bypass and all three mutation subgroups to zero', () => {
    expect(Object.keys(SUBGROUP_GUARDS)).toHaveLength(3);
    expect(currentLegacyBypasses()).toEqual([]);
  });

  it('still detects a genuine direct redemption owner if its guard is removed', () => {
    const unguarded = source(LEGACY_DB).replace(
      'raise RuntimeError("p4_06_legacy_mutation_disabled:redeem_gift_certificate")',
      'pass  # simulated direct owner regression',
    );
    expect(currentLegacyBypasses(new Map([[LEGACY_DB, unguarded]]))).toContain(
      'full_redemption',
    );
  });

  it('keeps all three completed Shadow paths non-executable', () => {
    for (const file of [
      'gift-certificate-purchase-shadow.service.ts',
      'gift-certificate-activation-shadow.service.ts',
      'gift-certificate-redemption-shadow.service.ts',
    ]) {
      const contents = source(
        `maya-saas-backend/src/gift-certificates/${file}`,
      );
      expect(contents).not.toContain('executeWithReceipt(');
      expect(contents).not.toContain('p4_06_legacy_mutation_disabled');
    }
  });
});
