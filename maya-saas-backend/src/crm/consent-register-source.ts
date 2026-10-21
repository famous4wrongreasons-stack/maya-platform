import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ConsentRegisterRange {
  from: string;
  to: string;
}
export function parseConsentRegisterRange(
  value: unknown,
): ConsentRegisterRange {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'from,to'
  )
    throw new BadRequestException('Exact consent register date range required');
  const { from, to } = value as ConsentRegisterRange;
  const instant = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v;
  if (!instant(from) || !instant(to) || from >= to)
    throw new BadRequestException('Increasing canonical UTC range required');
  return { from, to };
}

/** Source-only preparation, not an export capability or an authority resolver.
 * Future export owner must verify a registered possession-based step-up and bind
 * its exact own-subject/range/snapshot to replay protection BEFORE calling this.
 * No transport currently calls it. Timeline erasure is never a source filter.
 */
export async function readConsentRegisterSource(
  tx: Prisma.TransactionClient,
  scope: { tenantId: string; clientId: string },
  input: ConsentRegisterRange,
) {
  const range = parseConsentRegisterRange(input);
  if (!scope.tenantId || !scope.clientId)
    throw new Error('Exact consent source scope required');
  const records = await tx.clientConsentFact.findMany({
    where: {
      ...scope,
      occurredAt: { gte: new Date(range.from), lt: new Date(range.to) },
    },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { invalidation: true },
  });
  const seen = new Set<string>();
  for (const row of records) {
    if (
      row.tenantId !== scope.tenantId ||
      row.clientId !== scope.clientId ||
      seen.has(row.id) ||
      row.occurredAt < new Date(range.from) ||
      row.occurredAt >= new Date(range.to)
    )
      throw new Error('Consent register source mismatch');
    seen.add(row.id);
  }
  // Complete append-only source rows, including actor/execution/source identities
  // and invalidations. Never truncate, redact, or call this a delivered export.
  return {
    contract: 'maya.consent-register-source/1' as const,
    range,
    dateField: 'occurredAt' as const,
    records,
  };
}
