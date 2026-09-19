// H4 at `EP-INGRESS` — the verifier the gateway reaches through `SEAL_VERIFIER`, and never past it.
//
// What makes a seal worth computing is that something re-derives it from what was STORED. So every
// term here is read back from an AUDIT_RETAINED column and none is taken from the submission:
//   `WidgetEmission.bodyHash`, `.widgetId`, `.tenantId`, `.issuedAt`, `.expiresAt`, `.envelopeSeal`,
//   `.deliveryChannel` (which selects the receipt), `WidgetIntentRecord.principalProofHash`, and
//   `WidgetRenderReceipt.profileId` for that channel.
// A direct write to any one of them therefore stops at Gate 1 — which is also why §0.5 forbids
// E-TAMPER on these columns for every clause except G1-a, the seal clause itself.
//
// Three refusals that are not a mismatch are kept apart from one, because "the seal did not verify"
// and "there was nothing to verify" are different facts and only the first is evidence about an
// attacker: `record_absent`, `emission_absent`, `term_absent`. None of them is a refusal CODE — the
// gate maps this verdict (AREA-C: a seal that does not verify refuses `EXPIRED` with the code alone,
// because a predecessor whose seal fails is not a readable stored predecessor, R3.9.4 C11:4921).
//
// Custody (B-22): the key lives in `SealService`, which the emission module provides beside this
// class. The gateway imports neither at run time; it holds the `SEAL_VERIFIER` token and this file's
// `SealVerifier` INTERFACE, which is erased at compile time and carries nothing (`SEAL-5`).
//
// Key version: no column stores it yet, so `scope.sealKeyVersion` is how a later additive column will
// reach this branch without changing it. Absent, it means the current version; anything else is
// refused rather than tried, so a rotation cannot silently verify under the wrong key.

import { Injectable } from '@nestjs/common';

import type { RequestTx } from '../authority/principal-view';
import { scoped } from '../stores/tenant-scope';
import { digestEquals } from '../token.util';
import { CURRENT_SEAL_KEY_VERSION, SealService } from './seal.service';

export type SealVerificationReason =
  | 'verified'
  | 'record_absent'
  | 'emission_absent'
  | 'term_absent'
  | 'unknown_key_version'
  | 'seal_mismatch';

export interface SealVerification {
  readonly ok: boolean;
  readonly reason: SealVerificationReason;
}

/** What a caller may narrow the read by. `tenantId` is the live principal's, never the submission's. */
export interface SealScope {
  readonly tenantId?: string;
  /** The version the stored seal claims. Interim: nothing supplies it, so it is the current one. */
  readonly sealKeyVersion?: string | null;
}

/**
 * The port bound to `SEAL_VERIFIER` (di-tokens.ts). A gate names this interface, never the class:
 * the interface is a type, so importing it moves no key into the gateway's run-time graph.
 */
export interface SealVerifier {
  verify(
    recordHash: string,
    scope: SealScope | undefined,
    tx: RequestTx,
  ): Promise<SealVerification>;
}

/** The transaction-bound view Gate 1 receives. It carries no store client into the gate file. */
export interface SealCheck {
  verify(recordHash: string, scope?: SealScope): Promise<SealVerification>;
}

const REFUSED = (reason: SealVerificationReason): SealVerification =>
  Object.freeze({ ok: false, reason });

const VERIFIED: SealVerification = Object.freeze({
  ok: true,
  reason: 'verified',
});

/** A term is present when it is a non-empty string, or a real date. `profileId` may legitimately be null. */
const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value !== '';

const realDate = (value: Date | null | undefined): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

@Injectable()
export class SealVerifierService implements SealVerifier {
  constructor(private readonly seal: SealService) {}

  /** The versions this build verifies under. One, until a rotation adds the column and a second key. */
  get acceptedKeyVersions(): readonly string[] {
    return [CURRENT_SEAL_KEY_VERSION];
  }

  async verify(
    recordHash: string,
    scope?: SealScope,
    tx?: RequestTx,
  ): Promise<SealVerification> {
    const version = scope?.sealKeyVersion ?? CURRENT_SEAL_KEY_VERSION;
    if (version !== CURRENT_SEAL_KEY_VERSION) {
      return REFUSED('unknown_key_version');
    }
    if (!present(recordHash)) return REFUSED('record_absent');

    const askedTenantId = scope?.tenantId;
    if (tx === undefined)
      throw new Error('seal verification requires the request transaction');

    const record = await tx.widgetIntentRecord.findFirst({
      where: present(askedTenantId)
        ? scoped(askedTenantId, { intentTokenHash: recordHash })
        : { intentTokenHash: recordHash },
      select: { tenantId: true, widgetId: true, principalProofHash: true },
    });
    if (!record) return REFUSED('record_absent');

    const emission = await tx.widgetEmission.findFirst({
      where: scoped(record.tenantId, { widgetId: record.widgetId }),
      select: {
        tenantId: true,
        widgetId: true,
        bodyHash: true,
        issuedAt: true,
        expiresAt: true,
        deliveryChannel: true,
        envelopeSeal: true,
      },
    });
    if (!emission) return REFUSED('emission_absent');

    if (
      !present(emission.envelopeSeal) ||
      !present(emission.bodyHash) ||
      !present(emission.widgetId) ||
      !present(emission.tenantId) ||
      !present(record.principalProofHash) ||
      !present(emission.deliveryChannel) ||
      !realDate(emission.issuedAt) ||
      !realDate(emission.expiresAt)
    ) {
      return REFUSED('term_absent');
    }

    // The channel selects the receipt: an envelope degraded for one channel must not verify as the
    // richer one it was composed from. No receipt means the term is null, which the seal covers too.
    const receipt = await tx.widgetRenderReceipt.findFirst({
      where: scoped(record.tenantId, {
        widgetId: record.widgetId,
        deliveryChannel: emission.deliveryChannel,
      }),
      select: { profileId: true },
    });

    const profileId = receipt?.profileId;
    const expected = this.seal.seal({
      bodyHash: emission.bodyHash,
      widgetId: emission.widgetId,
      tenantId: emission.tenantId,
      principalProofHash: record.principalProofHash,
      issuedAt: emission.issuedAt,
      expiresAt: emission.expiresAt,
      profileId: present(profileId) ? profileId : null,
      sealKeyVersion: version,
    });

    // Constant time, always: §3 requires a mutated, expired, replayed and foreign-principal token to
    // be refused at indistinguishable latency, and `===` on a digest is measurable.
    return digestEquals(emission.envelopeSeal, expected)
      ? VERIFIED
      : REFUSED('seal_mismatch');
  }
}
