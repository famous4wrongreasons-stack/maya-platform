import { BadRequestException } from '@nestjs/common';
import { ECDH } from 'node:crypto';

/** Owner-approved B24 V1. Changes require a new explicit policy version. */
export const CLIENT_WEB_PUSH_POLICY = Object.freeze({
  version: 1,
  maxActive: 5,
  maxFanOut: 5,
  maxEndpointBytes: 4096,
  maxPlaintextBytes: 8192,
  maxCiphertextBytes: 10963,
});

export interface ClientWebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export function webPushObject(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new BadRequestException('INVALID_WEB_PUSH_REQUEST');
  return value as Record<string, unknown>;
}

function decodeKey(value: unknown, size: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new BadRequestException('INVALID_WEB_PUSH_KEY');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== size || bytes.toString('base64url') !== value)
    throw new BadRequestException('INVALID_WEB_PUSH_KEY');
  return bytes;
}

/** No URL normalization: an endpoint is an exact capability, never an identity.
 * Destination routing restrictions are additionally enforced by the sender. */
export function normalizeWebPushSubscription(
  value: unknown,
): ClientWebPushSubscription {
  const input = webPushObject(value, ['endpoint', 'expirationTime', 'keys']);
  if (
    typeof input.endpoint !== 'string' ||
    Buffer.byteLength(input.endpoint, 'utf8') >
      CLIENT_WEB_PUSH_POLICY.maxEndpointBytes ||
    [...input.endpoint].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException('INVALID_WEB_PUSH_ENDPOINT');
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    throw new BadRequestException('INVALID_WEB_PUSH_ENDPOINT');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    (endpoint.port && endpoint.port !== '443')
  )
    throw new BadRequestException('INVALID_WEB_PUSH_ENDPOINT');
  const keys = webPushObject(input.keys, ['p256dh', 'auth']);
  const publicKey = decodeKey(keys.p256dh, 65);
  decodeKey(keys.auth, 16);
  try {
    ECDH.convertKey(publicKey, 'prime256v1');
  } catch {
    throw new BadRequestException('INVALID_WEB_PUSH_KEY');
  }
  const expirationTime = input.expirationTime ?? null;
  if (
    expirationTime !== null &&
    (typeof expirationTime !== 'number' ||
      !Number.isSafeInteger(expirationTime) ||
      expirationTime <= 0)
  )
    throw new BadRequestException('INVALID_WEB_PUSH_EXPIRATION');
  const result = {
    endpoint: input.endpoint,
    expirationTime,
    keys: { p256dh: keys.p256dh as string, auth: keys.auth as string },
  };
  if (
    Buffer.byteLength(JSON.stringify(result), 'utf8') >
    CLIENT_WEB_PUSH_POLICY.maxPlaintextBytes
  )
    throw new BadRequestException('WEB_PUSH_MATERIAL_LIMIT_EXCEEDED');
  return result;
}
