/**
 * P02 permanent budget ratchet (mapping §9).
 * Paid work is fail-closed: no approved cap and no verified price manifest means no paid
 * call at all, never a free one. Ceilings are 2/6/12/120 and the counters are cumulative,
 * so a retry or an edit can never buy a second allowance. Concurrency, lease death and
 * settlement arithmetic are proved against PostgreSQL by
 * `scripts/chapter9-foundation-proof.ts`; this file ratchets the released contract.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  c9AiCostConfig,
  c9DefaultBudget,
  c9EmptyBudget,
  c9PriceAdmission,
  c9PriceHash,
  c9PriceUpperBound,
} from './c9.budget';
import { C9Allowance } from './c9.allowance';
import { C9ModelGateway } from './c9.model';
import { C9Object } from './c9.contract';
import { C9WorkService } from './c9.work';

const now = new Date('2026-09-14T10:00:00.000Z');
const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
  ),
  'utf8',
);
const work = readFileSync(join(__dirname, 'c9.work.ts'), 'utf8');

function price(overrides: C9Object = {}): C9Object {
  const basis: C9Object = {
    contract: 'maya.c9-price/1',
    providerModelKey: 'released-provider:model-a',
    taskKey: 'c9.bi',
    currency: 'RUB',
    unitScale: 1000000,
    priceVersion: 'v1',
    sourceEvidenceRef: 'release:billing-configuration',
    verifiedAt: '2026-09-14T09:00:00.000Z',
    validUntil: '2026-09-15T09:00:00.000Z',
    inputRate: { numerator: '3', denominator: '1', tokenUnit: 1000 },
    outputRate: { numerator: '9', denominator: '1', tokenUnit: 1000 },
    fixedFeeMicros: '0',
    maxAdditionalFeeMicros: '0',
    ...overrides,
  };
  return { ...basis, hash: c9PriceHash(basis) };
}
const allowanceFor = (basis: C9Object, capMicros: string) =>
  new C9Allowance({
    get: (key: string) =>
      key === 'C9_AI_PRICE_MANIFEST'
        ? JSON.stringify(basis)
        : key === 'C9_AI_COST_CAP_MICROS'
          ? capMicros
          : undefined,
  } as never);

describe('c9 budget', () => {
  test('released ceilings are exactly the approved 2/6/12/120 envelope', () => {
    expect(c9DefaultBudget()).toMatchObject({
      contract: 'maya.c9-budget/1',
      domainsMax: 2,
      toolCallsPerDomainMax: 6,
      toolCallsMax: 12,
      modelCallsMax: 12,
      inputTokensMax: 96000,
      outputTokensMax: 48000,
      inputTokensPerCallMax: 8000,
      outputTokensPerCallMax: 4000,
      reasoningMsMax: 120000,
      parallelDomainsMax: 2,
      aiCost: null,
    });
    // The database refuses a manifest outside the same bounds, whatever the caller sends.
    for (const bound of [
      "'domainsMax')::int NOT BETWEEN 1 AND 2",
      "'toolCallsPerDomainMax')::int NOT BETWEEN 1 AND 6",
      "'toolCallsMax')::int NOT BETWEEN 1 AND 12",
      "'modelCallsMax')::int NOT BETWEEN 1 AND 12",
      "'inputTokensMax')::int NOT BETWEEN 1 AND 96000",
      "'outputTokensMax')::int NOT BETWEEN 1 AND 48000",
      "'reasoningMsMax')::int NOT BETWEEN 1 AND 120000",
    ])
      expect(migration).toContain(bound);
  });

  test('an empty run starts with every counter at zero and no domain claimed', () => {
    expect(c9EmptyBudget()).toEqual({
      contract: 'maya.c9-budget-state/1',
      domains: [],
      tool: { reserved: 0, settled: 0, held: 0, byDomain: {} },
      model: { reserved: 0, settled: 0, held: 0 },
      tokens: {
        input: { reserved: 0, settled: 0, held: 0 },
        output: { reserved: 0, settled: 0, held: 0 },
      },
      aiCostMicros: { reserved: '0', settled: '0', held: '0' },
      dispatchExposureRefs: [],
    });
    expect(migration).toContain("'c9_initial_budget_state'");
  });

  test('no configured cap or price basis means no paid work, never free work', () => {
    expect(c9AiCostConfig(undefined, '1000000', now)).toBeNull();
    expect(c9AiCostConfig(JSON.stringify(price()), undefined, now)).toBeNull();
    // A zero or absent allowance closes paid reasoning; it is never read as unlimited.
    expect(c9AiCostConfig(JSON.stringify(price()), '0', now)).toBeNull();
    expect(() => c9PriceAdmission(c9DefaultBudget(), price(), now)).toThrow(
      'c9_paid_capability_not_activated',
    );
    expect(migration).toContain('c9_paid_cost_basis_required');
    // capMicros defaults to 0 inside the guard, so unconfigured cost cannot pass.
    expect(migration).toContain("coalesce((ai->>'capMicros')::numeric,0)");
  });

  test('an expired or unrecognised manifest cannot become an allowance', () => {
    const expired = price({ validUntil: '2026-09-14T09:30:00.000Z' });
    expect(
      c9AiCostConfig(
        JSON.stringify(expired),
        '1000000',
        new Date('2026-09-14T09:45:00.000Z'),
      ),
    ).toBeNull();
    const tampered = {
      ...price(),
      inputRate: { numerator: '1', denominator: '1', tokenUnit: 1000 },
    };
    expect(() =>
      c9AiCostConfig(JSON.stringify(tampered), '1000000', now),
    ).toThrow('c9_price_manifest_digest');
    const released = c9AiCostConfig(JSON.stringify(price()), '1000000', now)!;
    const manifest = { ...c9DefaultBudget(), aiCost: released.aiCost };
    expect(() =>
      c9PriceAdmission(manifest, price({ currency: 'EUR' }), now),
    ).toThrow('c9_price_manifest_unrecognized');
  });

  test('a reservation charges the full bound with every fee, rounded up', () => {
    const basis = price({ fixedFeeMicros: '25', maxAdditionalFeeMicros: '7' });
    // 8000 input at 3/1000 = 24; 4000 output at 9/1000 = 36; plus 25 + 7.
    expect(c9PriceUpperBound(basis, 8000, 4000, now)).toBe('92');
    // Rounding is always against the run, never in its favour.
    expect(c9PriceUpperBound(price(), 1, 0, now)).toBe('1');
    expect(c9PriceUpperBound(price(), 0, 0, now)).toBe('0');
    expect(() => c9PriceUpperBound(price(), 8001, 0, now)).toThrow(
      'c9_integer',
    );
    expect(() => c9PriceUpperBound(price(), 0, 4001, now)).toThrow(
      'c9_integer',
    );
  });

  test('the gateway refuses to reserve anything when no allowance is released', async () => {
    const reserve = jest.fn();
    const gateway = new C9ModelGateway(
      new C9Allowance({ get: () => undefined } as never),
      { reserve } as unknown as C9WorkService,
    );
    expect(gateway.available(now)).toBe(false);
    const invoke = jest.fn();
    await expect(
      gateway.reason(
        'run',
        {
          callKey: 'k',
          taskKey: 'c9.bi',
          domain: 'BUSINESS_INTELLIGENCE',
          skillHash: 'd'.repeat(64),
          providerModelKey: 'released-provider:model-a',
          inputTokens: 10,
          outputTokens: 10,
          inputHash: 'e'.repeat(64),
          evidenceRefs: [],
        },
        invoke,
        now,
      ),
    ).resolves.toEqual({
      status: 'UNAVAILABLE',
      reason: 'paid_capability_not_activated',
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  test('an allowance is only ever read from released configuration', () => {
    const basis = price();
    const allowance = allowanceFor(basis, '1000000');
    expect(allowance.released(now)).toMatchObject({
      aiCost: {
        currency: 'RUB',
        capMicros: '1000000',
        priceManifestHash: basis.hash,
      },
    });
    expect(allowance.manifest(now).aiCost).not.toBeNull();
    expect(
      new C9Allowance({ get: () => undefined } as never).manifest(now).aiCost,
    ).toBeNull();
  });

  test('an unproven dispatch is held at worst case and never resent', () => {
    // hold() keeps the same receipt; there is no automatic retry anywhere in the package.
    expect(work).toContain("data: { state: 'HELD_UNKNOWN' }");
    expect(work).not.toMatch(/retryDispatch|resend|redispatch/i);
    // A held receipt keeps its reservation, so its cost stays charged against the cap.
    expect(migration).toContain(
      "statekey:=CASE WHEN w->>'state'='HELD_UNKNOWN' THEN 'held'",
    );
    expect(migration).toContain('c9_token_cost_budget_exhausted');
  });

  test('retry and revision never reset consumed counters or exposure', () => {
    // Counters are recomputed from every receipt of the run, not from the current revision.
    expect(migration).toContain(
      'FROM "C9WorkReceipt" x WHERE x."tenantId"=tenant AND x."runId"=run_id',
    );
    // A duplicate call key returns the existing receipt instead of buying a second slot.
    expect(work).toContain("c9Deny('idempotency_conflict')");
    expect(work).toContain('if (existing)');
    // Reported usage above its own reservation stops the run rather than being clamped.
    expect(work).toContain('beyondReservation');
    expect(work).toContain("state: 'STOPPED'");
  });

  test('model work needs a registered task, a released version and an exact price', () => {
    expect(work).toContain("c9Deny('unregistered_model_task')");
    expect(work).toContain("c9Deny('model_release_version_required')");
    expect(work).toContain('c9PriceAdmission(manifest, input.priceBasis, now)');
    expect(work).toContain("c9Deny('unverified_cost_basis')");
    // Unpriced work may not smuggle a manifest in to look approved.
    expect(work).toContain("c9Deny('unpriced_work_basis')");
    // The database is the final authority on the per-call token ceilings.
    expect(migration).toContain(
      "(v->>'inputTokens')::bigint NOT BETWEEN 0 AND 8000",
    );
    expect(migration).toContain(
      "(v->>'outputTokens')::bigint NOT BETWEEN 0 AND 4000",
    );
  });

  test('exhausted call budgets block new work for the whole run', () => {
    expect(migration).toContain('c9_call_budget_exhausted');
    expect(migration).toContain(
      "cardinality(domains)>(lim->>'domainsMax')::int",
    );
    expect(migration).toContain("tool_total>(lim->>'toolCallsMax')::int");
    expect(migration).toContain("model_total>(lim->>'modelCallsMax')::int");
    expect(migration).toContain(
      "d.value::int>(lim->>'toolCallsPerDomainMax')::int",
    );
    // The coordinator is accounted for, but it is not one of the two delegated domains.
    expect(migration).toContain(
      "IF dom<>'ORCHESTRATOR' AND NOT dom=ANY(domains)",
    );
  });
});
