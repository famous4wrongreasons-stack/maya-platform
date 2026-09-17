// What `POST /api/widgets/intent` hands the gateway, derived in one place.
//
// Extracted unchanged from `WidgetsController.intent` (U0 item 8) so the live-path harness derives
// submit arguments the way production does, instead of hand-supplying a verification level or a
// carrier (G9 §4.2, plan §4.2). The controller calls this and nothing else; so does every harness.

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { resolveVerificationLevel } from './authority/authority-resolver';
import type { SubmitIntentDto } from './dto/submit-intent.dto';
import type { IntentGatewayService } from './intent-gateway.service';
import { principalProofHash } from './principal.util';

export type IntentSubmitArgs = Parameters<IntentGatewayService['submit']>[0];

export const intentSubmitArgs = (
  dto: SubmitIntentDto,
  actor: AuthenticatedUser,
): IntentSubmitArgs => {
  // `v` is derived HERE, from what the server established about this caller — never sent, never
  // read back from the record. FR-3 forbids caller-supplied authority outright, so every input
  // to the resolver is an answer from a mechanism that already ran.
  const verificationLevel = resolveVerificationLevel({
    membershipResolved: Boolean(actor.tenantId) && Boolean(actor.userId),
    channelLinkActive: false,
    channelSubject: Boolean(actor.userId),
    roles: [],
  });

  return {
    intentToken: dto.intent_token,
    // The tenant comes from the authenticated principal, never from the body. A body-supplied
    // tenant is the shape of every tenant-confusion bug, and the DTO has no field for one.
    tenantId: actor.tenantId ?? '',
    // The JWT-validated user, as `@CurrentUser()` delivers it (D-9). Nothing here reads its role or
    // builds a principal from it (K5): which read supplies the live principal's role is AMB-03's.
    actor,
    principalProofHash: principalProofHash(actor),
    submission: dto,
    verificationLevel,
    // The carrier of an HTTP submission. A carrier is a ceiling, not a claim: `channelMaxLevel`
    // caps whatever the session says.
    carrier: 'pwa',
  };
};
