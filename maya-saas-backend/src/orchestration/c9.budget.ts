import {
  C9Object,
  c9Deny,
  c9Enum,
  c9Evidence,
  c9HashValue,
  c9Id,
  c9Instant,
  c9Int,
  c9Money,
  c9Nullable,
  c9Shape,
  c9String,
} from './c9.contract';
import { C9_REGISTRY_HASH } from './c9.registry';
export const c9Budget = c9Shape({
  contract: c9Enum('maya.c9-budget/1'),
  registryHash: c9HashValue,
  limitVersion: c9Int(1, 1),
  domainsMax: c9Int(1, 2),
  toolCallsMax: c9Int(1, 12),
  toolCallsPerDomainMax: c9Int(1, 6),
  modelCallsMax: c9Int(1, 12),
  inputTokensMax: c9Int(1, 96000),
  outputTokensMax: c9Int(1, 48000),
  inputTokensPerCallMax: c9Int(1, 8000),
  outputTokensPerCallMax: c9Int(1, 4000),
  reasoningMsMax: c9Int(1, 120000),
  parallelDomainsMax: c9Int(1, 2),
  aiCost: c9Nullable(
    c9Shape({
      currency: c9String(3, 3, /^[A-Z]{3}$/),
      capMicros: c9Money,
      priceManifestHash: c9HashValue,
      validUntil: c9Instant,
    }),
  ),
  tenantConfigRef: c9Nullable(c9Evidence),
});
export const c9DefaultBudget = (): C9Object => ({
  contract: 'maya.c9-budget/1',
  registryHash: C9_REGISTRY_HASH,
  limitVersion: 1,
  domainsMax: 2,
  toolCallsMax: 12,
  toolCallsPerDomainMax: 6,
  modelCallsMax: 12,
  inputTokensMax: 96000,
  outputTokensMax: 48000,
  inputTokensPerCallMax: 8000,
  outputTokensPerCallMax: 4000,
  reasoningMsMax: 120000,
  parallelDomainsMax: 2,
  aiCost: null,
  tenantConfigRef: null,
});
export const c9EmptyBudget = (): C9Object => ({
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
const rate = c9Shape({
  numerator: c9Money,
  denominator: c9Money,
  tokenUnit: c9Int(1, 1000000),
});
export const c9Price = c9Shape({
  contract: c9Enum('maya.c9-price/1'),
  providerModelKey: c9Id,
  taskKey: c9Id,
  currency: c9String(3, 3, /^[A-Z]{3}$/),
  unitScale: c9Int(1000000, 1000000),
  priceVersion: c9Id,
  sourceEvidenceRef: c9Id,
  verifiedAt: c9Instant,
  validUntil: c9Instant,
  inputRate: rate,
  outputRate: rate,
  fixedFeeMicros: c9Money,
  maxAdditionalFeeMicros: c9Money,
  hash: c9HashValue,
});
export const c9Reservation = c9Shape({
  contract: c9Enum('maya.c9-reservation/1'),
  toolCalls: c9Int(0, 1),
  modelCalls: c9Int(0, 1),
  domain: c9Enum(
    'ORCHESTRATOR',
    'ADMIN',
    'CLIENT_LIFECYCLE',
    'OCCUPANCY',
    'BUSINESS_INTELLIGENCE',
  ),
  inputTokens: c9Int(0, 8000),
  outputTokens: c9Int(0, 4000),
  costMicros: c9Money,
  priceHash: c9Nullable(c9HashValue),
  zeroCostEvidenceRef: c9Nullable(c9String(256)),
  stepRef: c9Nullable(c9Id),
});
export const c9Usage = c9Shape({
  contract: c9Enum('maya.c9-usage/1'),
  usageReceiptRef: c9Id,
  verifiedAt: c9Instant,
  inputTokens: c9Int(0, Number.MAX_SAFE_INTEGER),
  outputTokens: c9Int(0, Number.MAX_SAFE_INTEGER),
  costMicros: c9Money,
  priceHash: c9Nullable(c9HashValue),
  completionKind: c9Enum('CONFIRMED', 'ABORTED_BEFORE_DISPATCH'),
});
function charge(bound: number, v: C9Object): bigint {
  const n = BigInt(v.numerator as string),
    d = BigInt(v.denominator as string) * BigInt(v.tokenUnit as number);
  if (d <= 0n) c9Deny('price_denominator');
  return (BigInt(bound) * n + d - 1n) / d;
}
/** Only a trusted billing/release adapter may supply this already-verified manifest. */
export function c9PriceUpperBound(
  value: unknown,
  inputTokens: number,
  outputTokens: number,
  now: Date,
): string {
  c9Int(0, 8000)(inputTokens);
  c9Int(0, 4000)(outputTokens);
  const p = c9Price(value) as C9Object;
  if (
    Date.parse(p.validUntil as string) <= now.getTime() ||
    Date.parse(p.verifiedAt as string) > now.getTime()
  )
    c9Deny('price_expired');
  const total =
    charge(inputTokens, p.inputRate as C9Object) +
    charge(outputTokens, p.outputRate as C9Object) +
    BigInt(p.fixedFeeMicros as string) +
    BigInt(p.maxAdditionalFeeMicros as string);
  if (total > 9223372036854775807n) c9Deny('money_overflow');
  return total.toString();
}
