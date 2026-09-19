/** Pure B35 admission descriptor. No marketing service, delivery or provider dependency. */
import { BadRequestException } from '@nestjs/common';

export const BULK_ROOT_CAPABILITY = 'communication.bulk-campaign.admit.v2';
export const BULK_SLOT_CAPABILITY = 'communication.bulk-slot.admit.v2';

export function bulkObject(
  raw: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('B35_INVALID_REQUEST');
  return raw as Record<string, unknown>;
}
export function bulkCode(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(raw)
  )
    throw new BadRequestException('B35_INVALID_IDENTITY');
  return raw;
}
export function bulkHash(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw))
    throw new BadRequestException('B35_INVALID_HASH');
  return raw;
}
export function normalizeBulkAdmission(raw: unknown) {
  const v = bulkObject(raw, ['campaignId', 'intentHash']);
  return {
    campaignId: bulkCode(v.campaignId),
    intentHash: bulkHash(v.intentHash),
  };
}
export function normalizeBulkSlotAdmission(raw: unknown) {
  const v = bulkObject(raw, [
    'campaignId',
    'recipientId',
    'slotKey',
    'intentHash',
    'contentHash',
  ]);
  return {
    campaignId: bulkCode(v.campaignId),
    recipientId: bulkCode(v.recipientId),
    slotKey: bulkCode(v.slotKey),
    intentHash: bulkHash(v.intentHash),
    contentHash: bulkHash(v.contentHash),
  };
}
