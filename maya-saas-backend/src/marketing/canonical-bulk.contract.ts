import { BadRequestException } from '@nestjs/common';
import { stableActionJson } from '../action-engine/action-engine.identity';

export const BULK_INTENT = 'maya.marketing-bulk-intent/1';
export const BULK_AUDIENCE = 'maya.bulk-client-audience/1';
export const BULK_ROOT_CAPABILITY = 'communication.bulk-campaign.admit.v2';
export const BULK_SLOT_CAPABILITY = 'communication.bulk-slot.admit.v2';
export const BULK_TERMINAL = new Set([
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'SKIPPED',
  'CANCELLED',
  'EXPIRED',
]);
export type BulkRoute = {
  contract: 'maya.bulk-client-route/1';
  primary: 'inbox' | 'telegram' | 'web_push' | 'none';
  link: null | {
    id: string;
    provider: string;
    subjectHash: string;
    verificationEvidenceHash: string;
  };
  userId: string | null;
  webPushEndpoints: {
    id: string;
    materialHash: string;
    clientChannelLinkId: string;
  }[];
  apnsDevices: { id: string; tokenHash: string }[];
  policyVersion: 1;
};
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
export function bulkContent(raw: unknown) {
  if (typeof raw !== 'string')
    throw new BadRequestException('B35_CONTENT_REQUIRED');
  const body = raw.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  if (
    !body ||
    body.length > 4000 ||
    [...body].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10;
    })
  )
    throw new BadRequestException('B35_INVALID_CONTENT');
  return {
    contract: 'maya.bulk-content/1',
    title: 'MAYA',
    body,
    deviceBody: body.slice(0, 180),
    format: 'plain',
    personalization: 'first_word_or_friend/1',
    category: 'marketing',
  };
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
export function bulkSlots(route: BulkRoute) {
  return [
    ...(route.primary === 'none'
      ? []
      : [{ key: 'primary', channel: route.primary }]),
    ...(['inbox', 'telegram'].includes(route.primary) &&
    route.webPushEndpoints.length
      ? [{ key: 'web_push', channel: 'web_push' }]
      : []),
    ...route.apnsDevices.map((d) => ({ key: `apns:${d.id}`, channel: 'apns' })),
  ];
}
export function bulkCanonical(value: unknown) {
  return stableActionJson(value);
}

/** PostgreSQL driver adapters wrap serialization errors differently for raw SQL. */
export function retryableBulkTransaction(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const e = error as Record<string, unknown>;
  return (
    ['P2034', 'P2002', '40001', '40P01'].includes(
      String(e.code ?? e.originalCode),
    ) ||
    e.kind === 'TransactionWriteConflict' ||
    [e.cause, e.meta, e.driverAdapterError].some((child) =>
      retryableBulkTransaction(child, depth + 1),
    )
  );
}
