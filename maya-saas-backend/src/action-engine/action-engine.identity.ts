import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { ActionContractError } from './action-engine.errors';

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function normalizeJson(value: unknown): CanonicalJson {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ActionContractError(
        'Non-finite numbers are not canonical JSON',
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }
  if (typeof value === 'object') {
    const result: Record<string, CanonicalJson> = {};
    for (const [key, item] of Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (item === undefined) {
        continue;
      }
      result[key] = normalizeJson(item);
    }
    return result;
  }
  throw new ActionContractError(
    `Unsupported canonical JSON value: ${typeof value}`,
  );
}

export function stableActionJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function requireSecret(secret: string, label: string): Buffer {
  const normalized = secret.trim();
  if (normalized.length < 32) {
    throw new ActionContractError(
      `${label} must contain at least 32 characters`,
    );
  }
  return Buffer.from(normalized, 'utf8');
}

export class ActionIdentityService {
  private readonly identitySecret: Buffer;
  private readonly payloadKey: Buffer;

  constructor(identitySecret: string, payloadEncryptionSecret: string) {
    this.identitySecret = requireSecret(identitySecret, 'identity secret');
    const payloadSecret = requireSecret(
      payloadEncryptionSecret,
      'payload encryption secret',
    );
    this.payloadKey = createHmac('sha256', payloadSecret)
      .update('maya.action-payload-key/1')
      .digest();
  }

  hmac(namespace: string, value: unknown): string {
    return createHmac('sha256', this.identitySecret)
      .update(namespace)
      .update('\u0000')
      .update(stableActionJson(value))
      .digest('hex');
  }

  normalizedInputHash(contract: string, normalizedInput: unknown): string {
    return this.hmac('maya.normalized-action-input/1', {
      contract,
      normalizedInput,
    });
  }

  logicalIdentity(input: {
    tenantId: string;
    identityVersion: number;
    actionClass: string;
    capability: string;
    capabilityVersion: number;
    targetKind: string;
    targetRef: string;
    normalizedInputHash: string;
    occurrenceScope: string;
  }): string {
    // Caller idempotency keys are transport aliases. They must not split one
    // logical action when it reaches the kernel through HTTP, AI or a replay.
    return this.hmac('maya.logical-action/1', {
      tenantId: input.tenantId,
      identityVersion: input.identityVersion,
      actionClass: input.actionClass,
      capability: input.capability,
      capabilityVersion: input.capabilityVersion,
      targetKind: input.targetKind,
      targetRef: input.targetRef,
      normalizedInputHash: input.normalizedInputHash,
      occurrenceScope: input.occurrenceScope,
    });
  }

  callerIdempotencyHash(input: {
    tenantId: string;
    scope: string;
    key: string;
  }): string {
    return this.hmac('maya.caller-idempotency/1', input);
  }

  transportIdempotencyKey(input: {
    executionId: string;
    capability: string;
    transportIdentityVersion: number;
  }): string {
    return this.hmac('maya.transport-action/1', input);
  }

  leaseTokenHash(input: {
    tenantId: string;
    executionId: string;
    leaseToken: string;
  }): string {
    return this.hmac('maya.action-lease/1', input);
  }

  encryptNormalizedPayload(canonicalPayload: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.payloadKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(canonicalPayload, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decryptNormalizedPayload(value: string): string {
    const [version, ivValue, tagValue, encryptedValue] = value.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
      throw new ActionContractError('Encrypted action payload is malformed');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.payloadKey,
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
