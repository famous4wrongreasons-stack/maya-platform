// What `POST /api/widgets/intent` hands the gateway, derived in one place.
//
// Extracted unchanged from `WidgetsController.intent` (U0 item 8) so the live-path harness derives
// submit arguments the way production does, instead of hand-supplying a verification level or a
// carrier (G9 §4.2, plan §4.2). The controller calls this and nothing else; so does every harness.

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { SubmitIntentDto } from './dto/submit-intent.dto';
import type { IntentGatewayService } from './intent-gateway.service';

export type IntentSubmitArgs = Parameters<IntentGatewayService['submit']>[0];

export const intentSubmitArgs = (
  dto: SubmitIntentDto,
  actor: AuthenticatedUser,
): IntentSubmitArgs => {
  // P-PRINCIPAL (D-1, D-2) moved `v` and the proof hash OUT of this derivation, and that is the point
  // of the unit rather than a tidy-up. Both are properties of the LIVE principal, which exists only
  // inside the request transaction `T`; both were derived here from the JWT's four fields — a level
  // the server had not re-established on this request, and a hash that was not K3's `c9PrincipalHash`
  // (C11:2544-2546), so K4's "recomputes `c9PrincipalHash` for the live principal" was not satisfied.
  // The gateway resolves the principal in `T` and sets both from it: one producer for "how verified is
  // this caller", one for "which hash does Gate 3 compare".
  return {
    intentToken: dto.intent_token,
    // The tenant comes from the authenticated principal, never from the body. A body-supplied
    // tenant is the shape of every tenant-confusion bug, and the DTO has no field for one.
    tenantId: actor.tenantId ?? '',
    // The JWT-validated user, as `@CurrentUser()` delivers it (D-9). Nothing here reads its role or
    // builds a principal from it (K5): the live principal's role is the tenancy owner's read (B-02).
    actor,
    submission: dto,
    // The carrier of an HTTP submission. A carrier is a ceiling, not a claim: `channelMaxLevel`
    // caps whatever the session says.
    carrier: 'pwa',
  };
};
