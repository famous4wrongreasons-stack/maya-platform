// H4 — the widget envelope's keyed seal, and the only place the widget layer holds its key.
//
// ```
// envelope_seal = HMAC-SHA256_k( "maya.widget.envelope/1" ‖ \0 ‖ stableActionJson([
//   body_hash, widget_id, tenant_id, principal_proof_hash,
//   issued_at, expires_at, render.profile_id, seal_key_version ]) )
// ```
// (C11:2615-2623.) Three properties of that formula are load-bearing and are built here rather than
// described:
//   - It is KEYED. An unkeyed digest over the same terms is not a weaker seal, it is not a seal at
//     all: anyone who can read the terms can recompute it, so a forged envelope would verify. The key
//     comes from the platform's one keyed-HMAC discipline, `ActionIdentityService.hmac` — H6 (C11:2627)
//     forbids the widget layer a second keyed scheme, and `seal-h6.architecture.spec.ts` holds that.
//   - It covers the envelope's IDENTITY as well as its body, so a body cannot be moved from one
//     envelope to another and `render.profile_id` means an envelope degraded for one channel cannot be
//     replayed as a richer one.
//   - Its terms are POSITIONAL: a JSON array, not an object. A renamed member therefore cannot quietly
//     reorder the pre-image, which an object's key sort would have hidden.
//
// Custody (B-22, C11:7217): there is no fourth holder of the seal key. This service and its verifier
// are minter-held, provided by the emission module; the gateway reaches verification only through the
// `SEAL_VERIFIER` token and never imports this file at run time (`SEAL-5`).
//
// The key version is a SEALED TERM, so a key rotation changes every seal it covers. No column stores
// it yet (a `sealKeyVersion` column is an optional later additive column), so the interim mints and
// verifies under exactly one version and refuses any other — fail-closed in both directions.

import { Injectable } from '@nestjs/common';

import { ActionIdentityService } from '../../action-engine/action-engine.identity';

/** H4's key namespace. Its own namespace, so no other hmac of the platform can collide with a seal. */
export const SEAL_NAMESPACE = 'maya.widget.envelope/1';

/** The one version this interim mints and verifies under. */
export const CURRENT_SEAL_KEY_VERSION = 'widget-seal-1';

/** Every version the widget layer knows. Rotation adds one here and re-seals; it never widens silently. */
export const SEAL_KEY_VERSIONS: readonly string[] = Object.freeze([
  CURRENT_SEAL_KEY_VERSION,
]);

/**
 * The environment names the seal key is read from, in order. They are the Action Engine's own identity
 * secrets: one keyed discipline means one key source (H6). `CRM_ENCRYPTION_KEY` is the platform-wide
 * fallback every other `ActionIdentityService` holder already uses.
 */
export const SEAL_KEY_ENV = Object.freeze({
  identity: ['ACTION_ENGINE_IDENTITY_SECRET', 'CRM_ENCRYPTION_KEY'] as const,
  payload: [
    'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
    'CRM_ENCRYPTION_KEY',
  ] as const,
});

/** H4's terms, as the seal covers them. `profileId` is null when the emission has no render receipt. */
export interface SealTerms {
  readonly bodyHash: string;
  readonly widgetId: string;
  readonly tenantId: string;
  readonly principalProofHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly profileId: string | null;
  /** Defaults to `CURRENT_SEAL_KEY_VERSION`; any other version is refused. */
  readonly sealKeyVersion?: string;
}

/** A version neither minted nor verified under. Never a refusal code: no conformant caller asks for one. */
export class SealKeyVersionError extends Error {
  constructor(version: string) {
    super(`widget seal: unknown key version ${JSON.stringify(version)}`);
    this.name = 'SealKeyVersionError';
  }
}

/** The key is absent or too short. A configuration defect, so it throws rather than refusing quietly. */
export class SealKeyUnavailableError extends Error {
  constructor(message: string) {
    super(`widget seal: ${message}`);
    this.name = 'SealKeyUnavailableError';
  }
}

/**
 * H4's pre-image, in the contract's order. Exported so the verifier and the minter cannot each spell
 * the order their own way, and so a test can read the order back instead of trusting a comment.
 */
export const sealTermTuple = (terms: SealTerms): readonly (string | null)[] => [
  terms.bodyHash,
  terms.widgetId,
  terms.tenantId,
  terms.principalProofHash,
  terms.issuedAt.toISOString(),
  terms.expiresAt.toISOString(),
  terms.profileId,
  terms.sealKeyVersion ?? CURRENT_SEAL_KEY_VERSION,
];

@Injectable()
export class SealService {
  /** Constructed on first use, not at boot: a widget-dark deployment must not fail to start on it. */
  private identity: ActionIdentityService | null = null;

  /** The version every new seal is minted under. */
  get keyVersion(): string {
    return CURRENT_SEAL_KEY_VERSION;
  }

  /**
   * The seal of one envelope. Throws on an unknown key version and on a missing key; it never returns
   * a value that a verifier would then have to decide whether to trust.
   */
  seal(terms: SealTerms): string {
    const version = terms.sealKeyVersion ?? CURRENT_SEAL_KEY_VERSION;
    if (!SEAL_KEY_VERSIONS.includes(version)) {
      throw new SealKeyVersionError(version);
    }
    return this.key().hmac(
      SEAL_NAMESPACE,
      sealTermTuple({ ...terms, sealKeyVersion: version }),
    );
  }

  private key(): ActionIdentityService {
    if (this.identity) return this.identity;
    const pick = (names: readonly string[]): string => {
      for (const name of names) {
        const value = process.env[name];
        if (typeof value === 'string' && value.trim() !== '') return value;
      }
      throw new SealKeyUnavailableError(
        `no key: set one of ${names.join(', ')}`,
      );
    };
    try {
      this.identity = new ActionIdentityService(
        pick(SEAL_KEY_ENV.identity),
        pick(SEAL_KEY_ENV.payload),
      );
    } catch (error) {
      if (error instanceof SealKeyUnavailableError) throw error;
      throw new SealKeyUnavailableError(
        error instanceof Error ? error.message : 'the key was refused',
      );
    }
    return this.identity;
  }
}
