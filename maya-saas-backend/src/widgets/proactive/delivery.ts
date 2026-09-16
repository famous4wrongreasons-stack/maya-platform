// K13 — delivery: once, on one channel, and only if permission still holds.
//
// Two rules do most of the work here, and both are about WHEN a thing is checked rather than what
// is checked:
//
//   PR3c — the delivery permission and the quiet-hours window are re-read AT DELIVERY, not at mint.
//          A mint-time value is neither sufficient nor used. Someone who revokes consent between
//          composition and send must not receive the message that was already in flight.
//
//   dedupe — one `dedupe_key` per moment per `once_per` window, resolved ACROSS channels. Push,
//          chat and the Telegram staff mirror are three paths to one person, and a person who
//          holds all three is the normal case on an installed shell.
//
// `control.delivery.resolve` is the third key in the contract's closed control registry, and this
// is what it resolves: which single channel a `dedupe_key` is delivered on.

import { dedupeKey } from '../consent/erasure';
import {
  MOMENT_REGISTRY,
  NOTIFICATION_CONSENT_REGISTRY,
  RegistryLoadFailure,
} from './moments';

export class DeliveryRefusal extends Error {}

/** The three paths to one person. Naming them is what makes "across channels" checkable. */
export const DELIVERY_CHANNELS = ['push', 'chat', 'telegram_mirror'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface DeliveryAttempt {
  readonly momentKey: string;
  readonly subjectPrincipalProofHash: string;
  readonly windowStart: string;
  readonly channel: DeliveryChannel;
  readonly at: Date;
}

/**
 * The permission as it is RIGHT NOW, supplied by the caller who just re-read it.
 *
 * It is a parameter rather than something this module fetches, and that is deliberate: a function
 * that could read a cached value would eventually read one. The caller re-reads; this decides.
 */
export interface LivePermission {
  readonly notifyPrefKey: string;
  readonly granted: boolean;
  /** `Europe/Moscow 22:00-09:00`. Re-read from the consent row, never frozen at mint. */
  readonly quietHoursWindow: string;
  /** The subject's local hour at the moment of delivery. */
  readonly localHour: number;
}

const parseWindow = (window: string): { from: number; to: number } => {
  const m = /(\d{2}):\d{2}-(\d{2}):\d{2}/.exec(window);
  if (!m)
    throw new RegistryLoadFailure(
      `quiet-hours window '${window}' is not readable; refusing to treat it as "no quiet hours"`,
    );
  return { from: Number(m[1]), to: Number(m[2]) };
};

/** Windows wrap midnight, which is the whole point of a quiet-hours window. */
export const inQuietHours = (localHour: number, window: string): boolean => {
  const { from, to } = parseWindow(window);
  return from <= to
    ? localHour >= from && localHour < to
    : localHour >= from || localHour < to;
};

export const resolveDedupeKey = (attempt: DeliveryAttempt): string => {
  if (!MOMENT_REGISTRY[attempt.momentKey])
    throw new DeliveryRefusal(
      `'${attempt.momentKey}' is not in MOMENT_REGISTRY and cannot be delivered`,
    );
  return dedupeKey({
    momentKey: attempt.momentKey,
    subjectPrincipalProofHash: attempt.subjectPrincipalProofHash,
    windowStart: attempt.windowStart,
  });
};

export type DeliveryVerdict =
  | {
      readonly deliver: true;
      readonly dedupe_key: string;
      readonly channel: DeliveryChannel;
    }
  | {
      readonly deliver: false;
      readonly dedupe_key: string;
      readonly because: string;
    };

/**
 * `control.delivery.resolve` — the cross-channel decision, made once per key.
 *
 * The ledger is passed in and mutated by the caller on a `deliver: true`, so that "has this key
 * already gone out?" has exactly one answer shared by all three channels. A per-channel ledger
 * would let the same moment through three times and each channel would be individually correct.
 */
export const resolveDelivery = (
  attempt: DeliveryAttempt,
  permission: LivePermission,
  alreadyDelivered: ReadonlySet<string>,
): DeliveryVerdict => {
  const row = MOMENT_REGISTRY[attempt.momentKey];
  if (!row)
    throw new DeliveryRefusal(
      `'${attempt.momentKey}' is not in MOMENT_REGISTRY and cannot be delivered`,
    );

  const pref = NOTIFICATION_CONSENT_REGISTRY[row.notify_pref_key];
  if (!pref)
    throw new DeliveryRefusal(
      `${row.moment_key}: notify_pref_key does not resolve at delivery`,
    );
  if (permission.notifyPrefKey !== row.notify_pref_key)
    throw new DeliveryRefusal(
      `the permission re-read is for '${permission.notifyPrefKey}', this moment needs '${row.notify_pref_key}'`,
    );

  const key = resolveDedupeKey(attempt);

  // A revocation between compose and send stops the send. That is the entire reason PR3c puts this
  // check here rather than at mint.
  if (!permission.granted)
    return { deliver: false, dedupe_key: key, because: 'consent_revoked' };

  if (inQuietHours(permission.localHour, permission.quietHoursWindow))
    return { deliver: false, dedupe_key: key, because: 'quiet_hours' };

  if (alreadyDelivered.has(key))
    return { deliver: false, dedupe_key: key, because: 'already_delivered' };

  return { deliver: true, dedupe_key: key, channel: attempt.channel };
};

/**
 * Run a window of attempts and count what actually went out.
 *
 * This is the shape the 14-day exit is measured in. It is a simulation over a supplied schedule,
 * not a production observation — and the distinction is stated here rather than blurred, because
 * the contract asks for both and only one of them is a thing code can do.
 */
export interface WindowOutcome {
  readonly delivered: readonly DeliveryVerdict[];
  readonly suppressed: readonly DeliveryVerdict[];
  readonly duplicates: number;
}

export const runDeliveryWindow = (
  attempts: readonly DeliveryAttempt[],
  permissionFor: (a: DeliveryAttempt) => LivePermission,
): WindowOutcome => {
  const seen = new Set<string>();
  const delivered: DeliveryVerdict[] = [];
  const suppressed: DeliveryVerdict[] = [];
  let duplicates = 0;

  for (const a of attempts) {
    const v = resolveDelivery(a, permissionFor(a), seen);
    if (v.deliver) {
      if (seen.has(v.dedupe_key)) duplicates += 1;
      seen.add(v.dedupe_key);
      delivered.push(v);
    } else {
      suppressed.push(v);
    }
  }

  return Object.freeze({ delivered, suppressed, duplicates });
};
