// The principal proof hash — what Gate 3 compares.
//
// §3.9 Gate 3: "a token minted for A and replayed by B fails; a forwarded Telegram message or a
// shared push is inert; an unlink/relink invalidates every outstanding envelope retroactively".
// The last clause is why the hash covers the MEMBERSHIP as well as the user: relinking mints a new
// membership, so every envelope bound to the old one stops matching without anything having to be
// revoked, hunted down or expired.
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { sha256Hex } from './token.util';

/** A separator that cannot occur inside any of the parts, so two different principals cannot hash alike. */
const SEP = String.fromCharCode(0);

export const principalProofHash = (actor: AuthenticatedUser): string =>
  sha256Hex(
    [
      actor.userId,
      actor.tenantId ?? '',
      actor.membershipId ?? '',
      actor.sessionId,
    ].join(SEP),
  );
