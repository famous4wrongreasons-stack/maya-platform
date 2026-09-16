// §1.7 K1 — `v`, the live verification level, derived server-side on every request.
//
// Gate 5 compares a floor against a level. Until now there was no level: `GateContext` carried a
// token hash, a tenant, a principal hash and a clock, and nothing that said how well the person
// presenting the token had been verified. A floor with nothing to compare against is a number in a
// column, which is exactly what it had become.
//
// The rungs are not invented here. §1.7 K1's table names, for each rung, the mechanism that
// establishes it, and this module reads those mechanisms' ANSWERS — it never re-implements one and
// it never accepts one from a client. FR-3's `assertNoCallerAuthority` forbids caller-supplied
// authority outright, so every input below is server-derived or absent.

import type { VerificationLevel } from '../../widget-contract/envelope';
import type { ChannelId } from '../../widget-contract/lifecycle';
import { VERIFICATION_RANK } from './ladder';

/**
 * What the server has established about the caller, by the time a submission reaches the gateway.
 *
 * Every field is an ANSWER from a mechanism that already exists, not a claim:
 *   `membershipResolved`  C9Authority.current resolved exactly one active Membership
 *   `channelLinkActive`   ClientChannelRuntimeService.resolve returned a link with revokedAt null
 *   `channelSubject`      a channel identity is known (a Telegram chat id, a push endpoint)
 */
export interface ResolvedAuthority {
  readonly membershipResolved: boolean;
  readonly channelLinkActive: boolean;
  readonly channelSubject: boolean;
  /** The roles the server resolved. Presentation reads none of them; Gate 6 reads all of them. */
  readonly roles: readonly string[];
}

/**
 * The ladder, bottom up. `STEP_UP_VERIFIED` is deliberately unreachable and stays that way — it is
 * a FROZEN KNOWN LIMITATION, and a resolver that could return it would quietly close a gap the
 * programme has recorded as open.
 */
export const resolveVerificationLevel = (
  a: ResolvedAuthority,
): VerificationLevel => {
  if (a.membershipResolved) return 'SESSION_VERIFIED';
  if (a.channelLinkActive) return 'BOUND_CLIENT';
  if (a.channelSubject) return 'CHANNEL_IDENTITY';
  return 'ANONYMOUS';
};

/**
 * R3.4.6 — the channel ceiling.
 *
 * Whatever a session claims, a carrier caps it: a first-party session replayed over SMS is still
 * arriving over SMS. The ceiling is a property of the carrier and is not negotiable by the caller.
 *
 * Keyed by `ChannelId`, the contract's one channel vocabulary (the same one the answering channel
 * of a receipt is checked against), so a key that is not a channel does not compile. The native
 * shell's key is `native-shell`; a bare `native` is not a `ChannelId`.
 *
 * Seven rows with a fail-closed default: a channel with no row caps at ANONYMOUS, which refuses
 * everything above the bottom rung rather than admitting it.
 */
export const CHANNEL_MAX_LEVEL: Readonly<
  Partial<Record<ChannelId, VerificationLevel>>
> = Object.freeze({
  pwa: 'SESSION_VERIFIED',
  'native-shell': 'SESSION_VERIFIED',
  // A Telegram chat id identifies a channel, not a person with business authority — the
  // fundamental rule this programme exists to enforce.
  'telegram-bot': 'BOUND_CLIENT',
  'web-push': 'CHANNEL_IDENTITY',
  sms: 'CHANNEL_IDENTITY',
  email: 'CHANNEL_IDENTITY',
  'realtime-voice': 'BOUND_CLIENT',
} satisfies Partial<Record<ChannelId, VerificationLevel>>);

export const channelMaxLevel = (carrier: ChannelId): VerificationLevel =>
  CHANNEL_MAX_LEVEL[carrier] ?? 'ANONYMOUS';

/** The effective level: the session's rung, capped by what the carrier can establish. */
export const effectiveLevel = (
  sessionLevel: VerificationLevel,
  carrier: ChannelId,
): VerificationLevel => {
  const ceiling = channelMaxLevel(carrier);
  return VERIFICATION_RANK[sessionLevel] <= VERIFICATION_RANK[ceiling]
    ? sessionLevel
    : ceiling;
};
