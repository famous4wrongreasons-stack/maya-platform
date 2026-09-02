import { createHmac } from 'node:crypto';

import { GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION } from '../action-engine/gift-certificate-purchase-shadow.contract';

const KEY_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export interface GiftCertificatePresentationConfig {
  presentationKey: string;
  presentationKeyVersion: string;
  presentationKeys: ReadonlyMap<string, string>;
  lookupKey: string;
}

/**
 * Convert a transient bearer into the only durable lookup representation.
 * The raw bearer must never leave the request-local call chain.
 */
export function giftCertificateClaimLookup(
  secret: string | Buffer,
  bearer: string,
): string {
  const normalizedBearer = bearer.trim().toUpperCase();
  return createHmac('sha256', secret)
    .update(
      `${GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION}\u001f${normalizedBearer}`,
      'utf8',
    )
    .digest('hex');
}

/**
 * The current presentation key and retained key ring are process-only secret
 * material. GiftCertificate stores only the selected non-secret key version.
 */
export function giftCertificatePresentationConfig(
  environment = process.env,
): GiftCertificatePresentationConfig | null {
  const presentationKey = String(
    environment.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY || '',
  ).trim();
  const presentationKeyVersion = String(
    environment.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION || '',
  ).trim();
  const lookupKey = String(
    environment.MAYA_GIFT_CERTIFICATE_CLAIM_SECRET || '',
  ).trim();
  const serializedKeys = String(
    environment.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEYS || '',
  ).trim();

  let retainedKeys: Record<string, unknown> = {};
  if (serializedKeys) {
    try {
      const parsed = JSON.parse(serializedKeys) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      retainedKeys = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const presentationKeys = new Map<string, string>();
  for (const [version, value] of Object.entries(retainedKeys)) {
    if (
      !KEY_VERSION_PATTERN.test(version) ||
      typeof value !== 'string' ||
      value.length < 32 ||
      value.length > 256
    ) {
      return null;
    }
    presentationKeys.set(version, value);
  }
  if (
    presentationKey.length < 32 ||
    presentationKey.length > 256 ||
    lookupKey.length < 32 ||
    lookupKey.length > 256 ||
    !KEY_VERSION_PATTERN.test(presentationKeyVersion)
  ) {
    return null;
  }
  presentationKeys.set(presentationKeyVersion, presentationKey);
  return {
    presentationKey,
    presentationKeyVersion,
    presentationKeys,
    lookupKey,
  };
}
