import { createHash } from 'node:crypto';

export type BulkConsentState =
  'GRANTED' | 'REVOKED' | 'EXPIRED' | 'NOT_GRANTED' | 'UNKNOWN';

export type BulkOptOutState = 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN';

export interface BulkAudiencePlanRow {
  tenantId: string;
  externalClientId: string;
  eligibilityStatus: 'ALLOW' | 'SKIP';
  exclusionReason?: string | null;
  consentState: BulkConsentState;
  optOutState: BulkOptOutState;
  channel: 'inbox' | null;
  deliveryIdentity: string | null;
  approvalRequirement: 'OWNER_CONFIRMED';
  riskClass: 'bulk';
}

export interface BulkAudienceEquivalenceProof {
  equivalent: boolean;
  requestedCount: number;
  includedCount: number;
  excludedCount: number;
  duplicateCount: number;
  wrongTenantCount: number;
  missingCount: number;
  unexpectedCount: number;
  semanticMismatchCount: number;
  legacyPlanHash: string;
  shadowPlanHash: string;
}

type CanonicalRow = Omit<BulkAudiencePlanRow, 'exclusionReason'> & {
  exclusionReason: string | null;
};

function canonicalRow(row: BulkAudiencePlanRow): CanonicalRow {
  return {
    tenantId: row.tenantId,
    externalClientId: row.externalClientId,
    eligibilityStatus: row.eligibilityStatus,
    exclusionReason: row.exclusionReason ?? null,
    consentState: row.consentState,
    optOutState: row.optOutState,
    channel: row.channel,
    deliveryIdentity: row.deliveryIdentity,
    approvalRequirement: row.approvalRequirement,
    riskClass: row.riskClass,
  };
}

function planHash(rows: readonly BulkAudiencePlanRow[]): string {
  const canonical = rows
    .map(canonicalRow)
    .sort((left, right) =>
      left.externalClientId.localeCompare(right.externalClientId),
    );
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function rowsByIdentity(rows: readonly BulkAudiencePlanRow[]) {
  const result = new Map<string, CanonicalRow>();
  let duplicateCount = 0;
  for (const row of rows) {
    if (result.has(row.externalClientId)) duplicateCount += 1;
    result.set(row.externalClientId, canonicalRow(row));
  }
  return { result, duplicateCount };
}

/**
 * Count equality is deliberately insufficient: consent, opt-out, channel,
 * approval, risk and logical delivery identity must describe the same action.
 */
export function compareBulkAudienceDeliveryPlans(input: {
  tenantId: string;
  requestedIds: readonly string[];
  legacyRows: readonly BulkAudiencePlanRow[];
  shadowRows: readonly BulkAudiencePlanRow[];
}): BulkAudienceEquivalenceProof {
  const requested = new Set(input.requestedIds);
  const legacy = rowsByIdentity(input.legacyRows);
  const shadow = rowsByIdentity(input.shadowRows);
  const allRows = [...input.legacyRows, ...input.shadowRows];
  const wrongTenantCount = allRows.filter(
    (row) => row.tenantId !== input.tenantId,
  ).length;
  const seen = new Set([...legacy.result.keys(), ...shadow.result.keys()]);
  const missingCount = [...requested].filter(
    (identity) => !legacy.result.has(identity) || !shadow.result.has(identity),
  ).length;
  const unexpectedCount = [...seen].filter(
    (identity) => !requested.has(identity),
  ).length;
  let semanticMismatchCount = 0;

  for (const identity of requested) {
    const legacyRow = legacy.result.get(identity);
    const shadowRow = shadow.result.get(identity);
    if (!legacyRow || !shadowRow) continue;
    if (JSON.stringify(legacyRow) !== JSON.stringify(shadowRow)) {
      semanticMismatchCount += 1;
    }
  }

  const duplicateCount = legacy.duplicateCount + shadow.duplicateCount;
  const includedCount = input.legacyRows.filter(
    (row) => row.eligibilityStatus === 'ALLOW',
  ).length;
  const excludedCount = input.legacyRows.filter(
    (row) => row.eligibilityStatus === 'SKIP',
  ).length;
  const legacyPlanHash = planHash(input.legacyRows);
  const shadowPlanHash = planHash(input.shadowRows);

  return {
    equivalent:
      duplicateCount === 0 &&
      wrongTenantCount === 0 &&
      missingCount === 0 &&
      unexpectedCount === 0 &&
      semanticMismatchCount === 0 &&
      legacyPlanHash === shadowPlanHash,
    requestedCount: requested.size,
    includedCount,
    excludedCount,
    duplicateCount,
    wrongTenantCount,
    missingCount,
    unexpectedCount,
    semanticMismatchCount,
    legacyPlanHash,
    shadowPlanHash,
  };
}
